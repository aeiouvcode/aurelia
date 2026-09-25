'use strict';
(() => {
const $ = id => document.getElementById(id);
const LIB = [
  {id:'lacrimosa', file:'scores/lacrimosa.musicxml', title:'Lacrimosa', by:'Mozart · Süssmayr', note:'Choir and orchestra · 30 bars · written for Aurelia'},
  {id:'swan-lake', file:'scores/swan-lake.musicxml', title:'Swan Lake', by:'Tchaikovsky', note:'Act II Scene · orchestra reduction · theme section draft'},
  {id:'ode', file:'scores/ode-to-joy.musicxml', title:'Ode to Joy', by:'Beethoven', note:'Theme from the Ninth, arranged for winds and strings'},
  {id:'prelude', file:'scores/prelude-c.musicxml', title:'Prelude in C', by:'J. S. Bach', note:'BWV 846 · piano'}
];
let tk = null, source = null, sourceKind = 'musicxml', partsXml = [], view = 'vocal';
let events = [], parts = [], endSec = 0, dmap = [], dptr = 0, lit = new Set(), raf = 0, lastMeasure = null, seeking = false, loadGen = 0;
const status = (t, err) => { const s = $('status'); s.textContent = t || ''; s.classList.toggle('err', !!err); };
const fmt = x => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
const isPhone = () => window.innerWidth < 720;

// ---------- boot ----------
function bootVerovio() {
  return new Promise((res, rej) => {
    if (!window.verovio) return rej(new Error('engraver missing'));
    // The wasm runtime may already be up (cached) before we get here, and this build exposes no ready flag,
    // so try the toolkit directly, then fall back to the init hook plus a short poll.
    let done = false;
    const attempt = () => { if (done) return true; try { tk = new verovio.toolkit(); done = true; res(); return true; } catch (e) { return false; } };
    if (attempt()) return;
    const prev = verovio.module.onRuntimeInitialized;
    verovio.module.onRuntimeInitialized = () => { prev && prev(); attempt(); };
    let tries = 0; const iv = setInterval(() => { if (attempt() || ++tries > 300) { clearInterval(iv); if (!done) rej(new Error('engraver timeout')); } }, 100);
  });
}

// ---------- score parsing ----------
function levelOf(txt) {
  const t = (txt || '').trim().toLowerCase();
  return ({ppp:.22,pp:.3,p:.42,mp:.54,mf:.66,f:.82,ff:.94,fff:1})[t];
}
function extract() {
  const mei = new DOMParser().parseFromString(tk.getMEI(), 'application/xml');
  const xid = el => el.getAttribute('xml:id');
  // staves and their instruments
  const staffInfo = {};
  mei.querySelectorAll('staffDef').forEach(sd => {
    const n = sd.getAttribute('n');
    let label = sd.getAttribute('label') || (sd.querySelector('label') || {}).textContent || '';
    if (!label) { const g = sd.parentElement; label = g && (g.getAttribute('label') || ((g.querySelector(':scope > label') || {}).textContent)) || ''; }
    if (!staffInfo[n]) staffInfo[n] = {n, label: label.trim() || `Staff ${n}`};
  });
  const staffN = Object.keys(staffInfo);
  const choirOrder = {S:-.24, A:-.08, T:.08, B:.24};
  let vi = 0;
  parts = staffN.map(n => {
    const s = staffInfo[n], inst = Engine.instrumentFor(s.label);
    let pan = 0;
    if (inst.choir) pan = choirOrder[inst.choir];
    else if (inst.sets[0] === 'violins') pan = vi++ ? -.18 : -.42;
    else pan = ({violas:.18, cellos:.32, basses:.42, clarinet:-.1, flute:-.05, oboe:.05, bassoon:.12, horn:-.25, trumpet:.22, trombone:.3, timpani:.35, organ:0, piano:0})[inst.sets[0]] || 0;
    return {n, label: s.label, ...inst, pan, level: 1};
  });
  const partOf = {}; parts.forEach(p => partOf[p.n] = p);
  // notes -> staff, syllable, tie flags
  const noteInfo = {};
  mei.querySelectorAll('note').forEach(nt => {
    const st = nt.closest('staff'); const syl = nt.querySelector('syl');
    noteInfo[xid(nt)] = {staff: st && st.getAttribute('n'), syl: syl ? syl.textContent : null, tie: nt.getAttribute('tie')};
  });
  const tieNext = {}, tiedEnd = new Set();
  mei.querySelectorAll('tie').forEach(t => { const a = (t.getAttribute('startid') || '').slice(1), b = (t.getAttribute('endid') || '').slice(1); if (a && b) { tieNext[a] = b; tiedEnd.add(b); } });
  // meter
  const sd = mei.querySelector('scoreDef'); const ms = mei.querySelector('meterSig');
  const mCount = +(sd && sd.getAttribute('meter.count') || ms && ms.getAttribute('count') || 4);
  // timemap
  const tm = tk.renderToTimemap({includeMeasures: true});
  const mStart = {}, mOrder = [];
  tm.forEach(e => { if (e.measureOn) { mStart[e.measureOn] = e.tstamp; mOrder.push(e.measureOn); } });
  const lastT = tm.length ? tm[tm.length - 1].tstamp : 0;
  const mDur = {}; mOrder.forEach((m, i) => mDur[m] = (i + 1 < mOrder.length ? mStart[mOrder[i + 1]] : lastT) - mStart[m]);
  // dynamics curves per staff
  const curves = {}; const add = (staffs, pt) => (staffs || '').split(/\s+/).filter(Boolean).forEach(s => (curves[s] = curves[s] || []).push(pt));
  const when = el => { const m = el.closest('measure'); const id = m && xid(m); if (!id || !(id in mStart)) return null; const ts = +(el.getAttribute('tstamp') || 1); return (mStart[id] + (ts - 1) / mCount * mDur[id]) / 1000; };
  mei.querySelectorAll('dynam').forEach(d => { const v = levelOf(d.textContent) ?? (d.getAttribute('val') ? +d.getAttribute('val') / 127 : null); const t = when(d); if (v != null && t != null) add(d.getAttribute('staff'), {t, v}); });
  mei.querySelectorAll('dir, hairpin').forEach(d => {
    const txt = (d.textContent || '').toLowerCase(), form = d.getAttribute('form');
    const dir = form === 'cres' || /cresc/.test(txt) ? 1 : form === 'dim' || /dim|decresc/.test(txt) ? -1 : 0;
    const t = when(d); if (dir && t != null) add(d.getAttribute('staff'), {t, ramp: dir});
  });
  Object.values(curves).forEach(c => c.sort((a, b) => a.t - b.t));
  const levelAt = (staff, t) => {
    const c = curves[staff]; if (!c) return .62;
    let v = .62, ramp = 0, rt = 0;
    for (let i = 0; i < c.length && c[i].t <= t + 1e-4; i++) { if (c[i].ramp) { ramp = c[i].ramp; rt = c[i].t; } else { v = c[i].v; ramp = 0; } }
    if (ramp) { const nx = c.find(p => p.t > t && p.v != null); const target = nx ? nx.v : Math.min(1, Math.max(.2, v + ramp * .25)); const span = nx ? nx.t - rt : 6; v = v + (target - v) * Math.min(1, (t - rt) / span); }
    return v;
  };
  // events
  events = [];
  tm.forEach(e => (e.on || []).forEach(id => {
    const info = noteInfo[id]; if (!info || tiedEnd.has(id) || info.tie === 'm' || info.tie === 't') return;
    const mv = tk.getMIDIValuesForElement(id); if (!mv || mv.pitch == null) return;
    let dur = mv.duration, cur = id, guard = 0;
    while (tieNext[cur] && guard++ < 16) { cur = tieNext[cur]; const m2 = tk.getMIDIValuesForElement(cur); if (m2) dur = m2.time + m2.duration - mv.time; }
    const p = partOf[info.staff]; if (!p) return;
    const t = mv.time / 1000;
    const h = [...id].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7), u = (h >>> 0) / 4294967296; // per-note hash: the same score parses to the same take
    events.push({t, dur: Math.max(.05, dur / 1000), pitch: mv.pitch, staff: info.staff, part: p, syl: info.syl, choir: p.choir, vel: Math.min(1, levelAt(info.staff, t) * (.95 + u * .08))});
  }));
  events.sort((a, b) => a.t - b.t);
  // choir vowels + legato
  const prevV = {}, last = {};
  for (const e of events) if (e.choir) {
    e.prevVowel = prevV[e.staff] || null;
    e.vowel = Engine.vowelOf(e.syl, e.prevVowel); prevV[e.staff] = e.vowel;
    const l = last[e.staff]; if (l && Math.abs(l.t + l.dur - e.t) < .03) { l.legato = true; e.fromVowel = l.vowel; } last[e.staff] = e;
  }
  endSec = events.reduce((m, e) => Math.max(m, e.t + e.dur), lastT / 1000);
}

// ---------- display ----------
function listPartsXml(xml) {
  const d = new DOMParser().parseFromString(xml, 'application/xml');
  return [...d.querySelectorAll('part-list > score-part')].map(sp => ({id: sp.getAttribute('id'), name: (sp.querySelector('part-name') || {}).textContent || sp.getAttribute('id')}));
}
function viewXml() {
  if (sourceKind !== 'musicxml' || view === 'full') return source;
  const keep = new Set();
  const voc = partsXml.filter(p => Engine.instrumentFor(p.name).choir);
  if (voc.length) {
    voc.forEach(p => keep.add(p.id));
    const v1 = partsXml.find(p => /violin|violino/i.test(p.name)); if (v1) keep.add(v1.id);
    const bass = [...partsXml].reverse().find(p => /cello|contrab|basso(?!\w)|continuo|bass(?!oon)/i.test(p.name) && !Engine.instrumentFor(p.name).choir); if (bass) keep.add(bass.id);
  } else return source;
  const d = new DOMParser().parseFromString(source, 'application/xml');
  // tempo marks often live only in the top part: carry them into the first part we keep
  const allParts = [...d.querySelectorAll('score-partwise > part')];
  const firstKept = allParts.find(p => keep.has(p.getAttribute('id')));
  if (firstKept) {
    const kept = {}; firstKept.querySelectorAll(':scope > measure').forEach(m => kept[m.getAttribute('number')] = m);
    allParts.filter(p => !keep.has(p.getAttribute('id'))).forEach(p => p.querySelectorAll(':scope > measure').forEach(m => {
      m.querySelectorAll('sound[tempo]').forEach(s => { const km = kept[m.getAttribute('number')]; if (km && !km.querySelector('sound[tempo]')) { const ns = d.createElement('sound'); ns.setAttribute('tempo', s.getAttribute('tempo')); const at = km.querySelector('note'); km.insertBefore(ns, at); } });
    }));
  }
  d.querySelectorAll('part-list > score-part, score-partwise > part').forEach(el => { if (!keep.has(el.getAttribute('id'))) el.remove(); });
  if (isPhone()) d.querySelectorAll('part-list > score-part').forEach(sp => { const ab = sp.querySelector('part-abbreviation'), nm = sp.querySelector('part-name'); if (ab && nm && ab.textContent.trim()) nm.textContent = ab.textContent; });
  d.querySelectorAll('part-list > part-group').forEach(el => el.remove());
  return new XMLSerializer().serializeToString(d);
}
function renderScore() {
  const box = $('score'), w = Math.max(300, box.clientWidth - 2);
  const scale = isPhone() ? (view === 'full' ? 20 : 29) : (view === 'full' ? 26 : 36);
  tk.setOptions({pageWidth: Math.round(w * 100 / scale), pageHeight: 60000, adjustPageHeight: true, scale, breaks: 'auto', header: 'none', footer: 'none',
    pageMarginLeft: 30, pageMarginRight: 30, pageMarginTop: 40, pageMarginBottom: 30, spacingSystem: isPhone() ? 10 : 14, lyricSize: 4.2, justifyVertically: false});
  const data = viewXml();
  const ok = data instanceof ArrayBuffer ? tk.loadZipDataBuffer(data) : tk.loadData(data);
  if (!ok) throw new Error('unreadable');
  let html = '';
  for (let i = 1; i <= tk.getPageCount(); i++) html += `<div class="page">${tk.renderToSVG(i)}</div>`;
  box.innerHTML = html;
  dmap = tk.renderToTimemap({includeMeasures: true});
  clearLit(); dptr = 0; lastMeasure = null;
  syncHighlight(Engine.now() * 1000, true);
}
function clearLit() { lit.forEach(el => el.classList.remove('hl')); lit.clear(); }
let active = new Set();
function syncHighlight(ms, jump) {
  if (jump) { clearLit(); dptr = 0; active = new Set(); }
  let measure = null, changed = jump;
  while (dptr < dmap.length && dmap[dptr].tstamp <= ms + 20) {
    const e = dmap[dptr++]; changed = true;
    (e.off || []).forEach(id => active.delete(id));
    (e.on || []).forEach(id => active.add(id));
    if (e.measureOn) measure = e.measureOn;
  }
  if (changed) {
    lit.forEach(el => { if (!active.has(el.id)) { el.classList.remove('hl'); lit.delete(el); } });
    active.forEach(id => { const el = document.getElementById(id); if (el && !lit.has(el)) { el.classList.add('hl'); lit.add(el); } });
  }
  if (measure && measure !== lastMeasure) { lastMeasure = measure; follow(measure); }
}
function follow(mid) {
  if (!$('follow').checked) return;
  const el = document.getElementById(mid); if (!el) return;
  const sys = el.closest('.system') || el, box = $('score');
  const r = sys.getBoundingClientRect(), br = box.getBoundingClientRect();
  if (r.top < br.top + 4 || r.bottom > br.bottom - 8) box.scrollTo({top: box.scrollTop + (r.top - br.top) - 10, behavior: 'smooth'});
}

// ---------- transport ----------
function tick() {
  const t = Engine.now();
  if (!seeking) $('seek').value = endSec ? Math.round(t / endSec * 1000) : 0;
  $('time').textContent = `${fmt(Math.min(t, endSec))} / ${fmt(endSec)}`;
  syncHighlight(t * 1000, false);
  if (Engine.isPlaying()) raf = requestAnimationFrame(tick);
}
async function ensureSamples(gen) {
  const need = [...new Set(parts.flatMap(p => p.sets || []))];
  let done = 0;
  for (const s of need) {
    if (gen != null && gen !== loadGen) return; // a newer score load owns the status line now
    status(`Tuning the ${s}… ${done}/${need.length}`); await Engine.loadSet(s); done++;
  }
  if (gen != null && gen !== loadGen) return;
  status('');
}
async function playFrom(t) {
  await ensureSamples(null);
  await Engine.play(events, parts, t, endSec);
  setPlayIcon(true); cancelAnimationFrame(raf); syncHighlight(t * 1000, true); tick();
}
function setPlayIcon(p) { $('play').classList.toggle('on', p); $('play').setAttribute('aria-label', p ? 'Pause' : 'Play'); }
Engine.onEnd = () => { setPlayIcon(false); cancelAnimationFrame(raf); clearLit(); $('seek').value = 0; };
let resumeAt = 0;
async function toggle() {
  try {
    if (Engine.isPlaying()) { resumeAt = Engine.now(); Engine.stop(); setPlayIcon(false); return; }
    await playFrom(resumeAt >= endSec - .2 ? 0 : resumeAt);
  } catch (e) { console.error(e); status('Audio could not start on this device. Tap play again.', true); setPlayIcon(false); }
}
function seekTo(frac) {
  const t = frac * endSec; resumeAt = t;
  if (Engine.isPlaying()) { Engine.stop(); playFrom(t); } else { $('time').textContent = `${fmt(t)} / ${fmt(endSec)}`; syncHighlight(t * 1000, true); }
}

// ---------- loading ----------
async function loadSource(data, kind, meta) {
  Engine.stop(); setPlayIcon(false); cancelAnimationFrame(raf); resumeAt = 0; const gen = ++loadGen;
  source = data; sourceKind = kind;
  partsXml = kind === 'musicxml' ? listPartsXml(data) : [];
  const ok = data instanceof ArrayBuffer ? tk.loadZipDataBuffer(data) : tk.loadData(data);
  if (!ok) throw new Error('unreadable');
  tk.setOptions({scale: 40, breaks: 'none'});
  extract();
  if (!events.length) { status('That score has no notes Aurelia can play.', true); source = null; return; }
  $('title').textContent = meta.title || 'Untitled score';
  $('by').textContent = meta.by || '';
  $('note').textContent = meta.note || `${parts.length} staves · ${events.length} notes`;
  const hasChoir = partsXml.some(p => Engine.instrumentFor(p.name).choir);
  $('viewSeg').hidden = !(hasChoir && kind === 'musicxml');
  view = hasChoir ? 'vocal' : 'full'; markView();
  renderScore(); buildMixer();
  $('time').textContent = `0:00 / ${fmt(endSec)}`; $('seek').value = 0;
  ensureSamples(gen).catch(() => { if (gen === loadGen) status('Some instruments could not load.', true); });
}
async function loadLib(id) {
  const item = LIB.find(x => x.id === id) || LIB[0];
  status('Opening the score…');
  const r = await fetch(item.file); if (!r.ok) throw new Error('missing');
  await loadSource(await r.text(), 'musicxml', item);
}
function kindOf(text) { if (/<score-partwise|<score-timewise/.test(text)) return 'musicxml'; if (/<mei[\s>]/.test(text)) return 'mei'; if (/^\s*X:/m.test(text)) return 'abc'; return 'other'; }
async function openFile(f) {
  try {
    status(`Reading ${f.name}…`);
    if (/\.mxl$/i.test(f.name)) return await loadSource(await f.arrayBuffer(), 'mxl', {title: f.name.replace(/\.\w+$/, '')});
    const txt = await f.text(), k = kindOf(txt);
    if (k === 'other') return status('That file is not MusicXML, MEI or ABC.', true);
    const t = (txt.match(/<work-title>([^<]+)/) || txt.match(/^T:(.+)$/m) || [])[1];
    await loadSource(txt, k, {title: (t || f.name.replace(/\.\w+$/, '')).trim(), note: 'Your score'});
    $('pick').value = '';
  } catch (e) { console.error(e); status('Aurelia could not read that score.', true); }
}
async function openAbc() {
  const txt = $('abc').value.trim();
  if (!/^\s*X:/m.test(txt)) return status('ABC needs a header, starting with X:1', true);
  try { const t = (txt.match(/^T:(.+)$/m) || [])[1]; await loadSource(txt, 'abc', {title: (t || 'Your tune').trim(), note: 'Written in ABC'}); $('pick').value = ''; $('abcBox').open = false; }
  catch (e) { console.error(e); status('That ABC did not parse. Check the header and bar lines.', true); }
}

// ---------- mixer ----------
function buildMixer() {
  const m = $('mixer'); m.innerHTML = '';
  parts.forEach(p => {
    const row = document.createElement('label'); row.className = 'mix';
    row.innerHTML = `<span>${p.label}</span><input type="range" min="0" max="150" value="${Math.round(p.level * 100)}">`;
    row.querySelector('input').oninput = ev => { p.level = ev.target.value / 100; Engine.setLevel(p.n, p.level); };
    m.appendChild(row);
  });
}
function markView() { document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === view)); }

// ---------- WAV ----------
async function download() {
  const btn = $('wav'); if (btn.disabled) return;
  btn.disabled = true;
  try {
    const wasPlaying = Engine.isPlaying(); if (wasPlaying) { resumeAt = Engine.now(); Engine.stop(); setPlayIcon(false); }
    await ensureSamples(null);
    const sr = isPhone() ? 32000 : 44100;
    status('Rendering the performance… 0%');
    const buf = await Engine.render(events, parts, endSec, sr, f => status(`Rendering the performance… ${Math.min(99, Math.round(f * 100))}%`));
    const blob = Engine.wav(buf), url = URL.createObjectURL(blob);
    const name = `${$('title').textContent} - Aurelia.wav`.replace(/[^\w .-]+/g, '').replace(/\s+/g, '-');
    const a = $('saved'); a.href = url; a.download = name; a.textContent = `Save ${name} · ${(blob.size / 1048576).toFixed(1)} MB`; a.hidden = false;
    a.click();
    status(`Rendered ${fmt(buf.duration)} of audio.`);
  } catch (e) { console.error(e); status('Rendering needs more memory than this device allowed.', true); }
  btn.disabled = false;
}

// ---------- wire up ----------
window.addEventListener('DOMContentLoaded', async () => {
  const sel = $('pick'); LIB.forEach(x => sel.insertAdjacentHTML('beforeend', `<option value="${x.id}">${x.title} · ${x.by}</option>`));
  sel.insertAdjacentHTML('beforeend', '<option value="" disabled>Your score…</option>');
  sel.onchange = () => sel.value && loadLib(sel.value).catch(() => status('That score is missing.', true));
  $('play').onclick = toggle;
  $('seek').addEventListener('input', () => { seeking = true; $('time').textContent = `${fmt($('seek').value / 1000 * endSec)} / ${fmt(endSec)}`; });
  $('seek').addEventListener('change', () => { seeking = false; seekTo($('seek').value / 1000); });
  $('wav').onclick = download;
  $('file').onchange = e => e.target.files[0] && openFile(e.target.files[0]);
  $('abcGo').onclick = openAbc;
  document.querySelectorAll('#viewSeg button').forEach(b => b.onclick = () => { view = b.dataset.v; markView(); renderScore(); });
  $('score').addEventListener('click', ev => {
    const n = ev.target.closest('.note'); if (!n) return;
    const t = tk.getTimesForElement ? tk.getTimesForElement(n.id) : null;
    const ms = t && (t.realTimeOnsetMilliseconds || [])[0]; if (ms == null) return;
    seekTo(ms / 1000 / endSec);
  });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => tk && source && renderScore(), 250); });
  try {
    status('Loading the engraver…');
    await bootVerovio();
    const want = new URLSearchParams(location.search).get('score');
    sel.value = LIB.some(x => x.id === want) ? want : 'lacrimosa';
    await loadLib(sel.value);
  } catch (e) { console.error(e); status('Aurelia could not start in this browser.', true); }
});
window.Aurelia = {get events() { return events; }, get parts() { return parts; }, get endSec() { return endSec; }, seekTo, toggle, download};
})();
