// Aurelia audio engine: sampled orchestra (CC0 VSCO-2 / VCSL) + ensemble formant choir + hall.
// Plays note events extracted from a written score. No MIDI files, no recordings of the piece.
'use strict';
const Engine = (() => {
  const SAMPLE_SETS = ['violins','violas','cellos','basses','flute','oboe','clarinet','bassoon','horn','trumpet','trombone','timpani','organ','piano'];
  const MIX = {violins:1.0,violas:.9,cellos:.95,basses:.8,flute:.55,oboe:.5,clarinet:.42,bassoon:.5,horn:.55,trumpet:.45,trombone:.38,timpani:.8,organ:.35,piano:.9,choir:1.0};
  const REL = {violins:.32,violas:.32,cellos:.35,basses:.35,flute:.2,oboe:.2,clarinet:.22,bassoon:.22,horn:.3,trumpet:.22,trombone:.28,timpani:1.8,organ:.25,piano:.6};
  const ATT = {violins:.035,violas:.035,cellos:.04,basses:.05,flute:.02,oboe:.015,clarinet:.02,bassoon:.02,horn:.03,trumpet:.012,trombone:.02,timpani:.002,organ:.02,piano:.002};
  const cache = {};           // name -> {buffer, shift, zones}
  let decodeCtx = null;

  // ---------- sample loading ----------
  async function loadSet(name, onProgress) {
    if (cache[name]) return cache[name];
    if (!decodeCtx) decodeCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 32000);
    const [meta, bin] = await Promise.all([
      fetch(`samples/${name}.json`).then(r => { if (!r.ok) throw new Error('missing ' + name); return r.json(); }),
      fetch(`samples/${name}.mp3`).then(r => { if (!r.ok) throw new Error('missing ' + name); return r.arrayBuffer(); })
    ]);
    const buffer = await new Promise((res, rej) => decodeCtx.decodeAudioData(bin, res, rej));
    // locate the alignment click (written at meta.marker seconds) to cancel MP3 encoder delay
    const d = buffer.getChannelData(0), sr = buffer.sampleRate, lim = Math.min(d.length, sr * 0.3);
    let at = -1; for (let i = 0; i < lim; i++) if (Math.abs(d[i]) > 0.25) { at = i; break; }
    const shift = at >= 0 ? at / sr - meta.marker : 0;
    const zones = meta.zones.map(z => ({...z, start: z.start + shift}));
    cache[name] = {buffer, zones};
    onProgress && onProgress(name);
    return cache[name];
  }

  // ---------- instrument mapping from written part names ----------
  function instrumentFor(label) {
    const s = (label || '').toLowerCase();
    const has = (...k) => k.some(x => s.includes(x));
    if (has('corni di bassetto','basset','clarinet','klarinette','clarinetto')) return {sets:['clarinet']};
    if (has('violoncello e contrab','cello e basso','basso continuo','vc. cb','violoncelli e bassi')) return {sets:['cellos','basses'], oct:[0,-12]};
    if (has('contrab','double bass','kontrabass')) return {sets:['basses']};
    if (has('violoncell','cello')) return {sets:['cellos']};
    if (has('viola','bratsche')) return {sets:['violas']};
    if (has('violin','violino','geige')) return {sets:['violins']};
    if (has('piccolo','flute','flauto','flöte')) return {sets:['flute']};
    if (has('oboe')) return {sets:['oboe']};
    if (has('bassoon','fagott')) return {sets:['bassoon']};
    if (has('trombone','tromboni','posaune','tuba')) return {sets:['trombone']};
    if (has('trumpet','tromba','trombe','trompete')) return {sets:['trumpet']};
    if (has('horn','corno','corni')) return {sets:['horn']};
    if (has('timpan','pauke','kettle')) return {sets:['timpani']};
    if (has('organ','organo','orgel')) return {sets:['organ']};
    if (has('soprano','sopran','treble voice')) return {choir:'S'};
    if (has('alto','contralto','mezzo')) return {choir:'A'};
    if (has('tenor')) return {choir:'T'};
    if (has('baritone','bass voice','basso','bass')) return {choir:'B'};
    if (has('choir','chorus','voice','vocal','coro')) return {choir:'A'};
    if (has('string','strings','streicher')) return {sets:['violins']};
    return {sets:['piano']};
  }

  // ---------- choir: ensemble formant voices ----------
  const F = { // Csound-style formant table: freqs, dB, bandwidths
    S:{a:[[800,1150,2900,3900,4950],[0,-6,-32,-20,-50],[80,90,120,130,140]],e:[[350,2000,2800,3600,4950],[0,-20,-15,-40,-56],[60,100,120,150,200]],i:[[270,2140,2950,3900,4950],[0,-12,-26,-26,-44],[60,90,100,120,120]],o:[[450,800,2830,3800,4950],[0,-11,-22,-22,-50],[70,80,100,130,135]],u:[[325,700,2700,3800,4950],[0,-16,-35,-40,-60],[50,60,170,180,200]]},
    A:{a:[[800,1150,2800,3500,4950],[0,-4,-20,-36,-60],[80,90,120,130,140]],e:[[400,1600,2700,3300,4950],[0,-24,-30,-35,-60],[60,80,120,150,200]],i:[[350,1700,2700,3700,4950],[0,-20,-30,-36,-60],[50,100,120,150,200]],o:[[450,800,2830,3500,4950],[0,-9,-16,-28,-55],[70,80,100,130,135]],u:[[325,700,2530,3500,4950],[0,-12,-30,-40,-64],[50,60,170,180,200]]},
    T:{a:[[650,1080,2650,2900,3250],[0,-6,-7,-8,-22],[80,90,120,130,140]],e:[[400,1700,2600,3200,3580],[0,-14,-12,-14,-20],[70,80,100,120,120]],i:[[290,1870,2800,3250,3540],[0,-15,-18,-20,-30],[40,90,100,120,120]],o:[[400,800,2600,2800,3000],[0,-10,-12,-12,-26],[40,80,100,120,120]],u:[[350,600,2700,2900,3300],[0,-20,-17,-14,-26],[40,60,100,120,120]]},
    B:{a:[[600,1040,2250,2450,2750],[0,-7,-9,-9,-20],[60,70,110,120,130]],e:[[400,1620,2400,2800,3100],[0,-12,-9,-12,-18],[40,80,100,120,120]],i:[[250,1750,2600,3050,3340],[0,-30,-16,-22,-28],[60,90,100,120,120]],o:[[400,750,2400,2600,2900],[0,-11,-21,-20,-40],[40,80,100,120,120]],u:[[350,600,2400,2675,2950],[0,-20,-32,-28,-36],[40,80,100,120,120]]}
  };
  function vowelOf(syl, prev) {
    if (!syl) return prev || 'a';
    let s = syl.toLowerCase().replace(/[^a-zäöüéèàíóú]/g, '').replace(/^qu/, 'q').replace(/ae/g, 'e');
    const m = s.match(/[aeiouyäöüéèàíóú]/);
    if (!m) return prev || 'a';
    return ({y:'i',ä:'e',ö:'e',ü:'u',é:'e',è:'e',à:'a',í:'i',ó:'o',ú:'u'})[m[0]] || m[0];
  }
  function onsetOf(syl) {
    if (!syl) return null;
    const c = syl.toLowerCase().replace(/[^a-z]/g, '')[0];
    if (!c || 'aeiou'.includes(c)) return null;
    if ('sczfx'.includes(c)) return {f:6500, q:1.2, d:.07, g:.5};
    if ('tkqp'.includes(c)) return {f:3200, q:1.5, d:.018, g:.8};
    if ('dgb'.includes(c)) return {f:1800, q:1, d:.014, g:.45};
    if ('hj'.includes(c)) return {f:1500, q:.7, d:.06, g:.25};
    return null; // l, m, n, r, v, w: voiced onsets, handled by softer attack
  }
  // Three glottal-source variants (different spectral tilts) so the section does not share one buzz.
  const glottalWaves = new Map();
  function glottal(ctx, v = 0) {
    const key = ctx.sampleRate + ':' + v;
    if (glottalWaves.has(key) && glottalWaves.get(key).ctx === ctx) return glottalWaves.get(key).w;
    const tilt = [1.16, 1.26, 1.38][v] || 1.26;
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) { im[k] = 1 / Math.pow(k, tilt) * (k % 2 ? 1 : .85); }
    const w = ctx.createPeriodicWave(re, im); glottalWaves.set(key, {ctx, w}); return w;
  }
  function noise(ctx) {
    if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (noiseBuf = b);
  }
  let noiseBuf = null;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // Vocal-tract sizes across a real section differ; three "tract groups" shift the whole
  // formant pattern slightly, which is what makes many voices blur into a choir.
  const TRACT = [{s:.94, d:-6}, {s:1, d:0}, {s:1.065, d:6}];
  function choirNote(ctx, out, n, t, dur, amp, singers) {
    const part = n.choir, vw = n.vowel || 'a', [ff0, db, bw] = F[part][vw];
    const ff = ff0.slice();
    const f0 = 440 * Math.pow(2, (n.pitch - 69) / 12);
    // sopranos/altos tune the first formant up toward a high fundamental
    if ((part === 'S' || part === 'A') && f0 > ff[0] * .92) ff[0] = Math.min(f0 * 1.03, ff[0] + (f0 - ff[0]) * .82);
    const body = ctx.createGain(); body.gain.value = 0;
    body.connect(out);
    const banks = [];
    for (let g = 0; g < 3; g++) {
      const bankIn = ctx.createGain(); bankIn.gain.value = 1;
      const gOut = ctx.createGain(); gOut.gain.value = 1 / Math.sqrt(3);
      for (let k = 0; k < 5; k++) {
        const fk = ff[k] * TRACT[g].s;
        if (fk > ctx.sampleRate / 2 - 500) continue;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fk; bp.Q.value = fk / (bw[k] * 1.6);
        const gn = ctx.createGain(); gn.gain.value = Math.pow(10, (db[k] + rnd(-1.2, 1.2)) / 20) * (k === 0 ? 1.4 : 2.2);
        bankIn.connect(bp); bp.connect(gn); gn.connect(gOut);
      }
      // a little direct low-passed source keeps the chest warmth under the formants
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(1400, f0 * 4); const lg = ctx.createGain(); lg.gain.value = .22;
      bankIn.connect(lp); lp.connect(lg); lg.connect(gOut);
      // aspiration: air through the same formants, per tract
      const nz = ctx.createBufferSource(); nz.buffer = noise(ctx); nz.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      const ng = ctx.createGain(); ng.gain.value = .016;
      nz.connect(hp); hp.connect(ng); ng.connect(bankIn);
      nz.start(t, rnd(0, 1.5)); nz.stop(t + dur + .4);
      gOut.connect(body);
      banks.push(bankIn);
    }
    const legato = n.legato ? .1 : .05;
    const a = n.syl ? (onsetOf(n.syl) ? .055 : .1) : .07;
    const end = t + dur + legato;
    const peak = amp * (part === 'S' ? .9 : part === 'B' ? 1.15 : 1);
    body.gain.setValueAtTime(0, t);
    body.gain.linearRampToValueAtTime(peak, t + a);
    body.gain.setTargetAtTime(peak * .88, t + a, .5);
    body.gain.setValueAtTime(peak * (dur > .8 ? .8 : .9), Math.max(t + a + .01, end - .12));
    body.gain.linearRampToValueAtTime(0, end + .08);
    const stopAt = end + .2;
    for (let s = 0; s < singers; s++) {
      const g = s % 3;
      const o = ctx.createOscillator(); o.setPeriodicWave(glottal(ctx, g));
      o.frequency.value = f0;
      // scoop up into the note, then hold with a small per-singer offset
      const settle = TRACT[g].d + rnd(-9, 9);
      o.detune.setValueAtTime(settle - rnd(14, 32), t);
      o.detune.linearRampToValueAtTime(settle, t + Math.min(.2, .35 * dur));
      // vibrato: own rate, own late onset, own depth
      const vib = ctx.createOscillator(); vib.frequency.value = rnd(4.3, 6.1);
      const vd = ctx.createGain();
      const von = Math.min(t + dur - .05, t + rnd(.15, .7));
      vd.gain.setValueAtTime(0, t); vd.gain.setValueAtTime(0, von);
      vd.gain.linearRampToValueAtTime(rnd(15, 32), Math.min(t + dur + .1, von + .3));
      vib.connect(vd); vd.connect(o.detune);
      // slow random-walk drift
      const dr = ctx.createOscillator(); dr.frequency.value = rnd(.15, .45); const dg = ctx.createGain(); dg.gain.value = rnd(3, 8); dr.connect(dg); dg.connect(o.detune);
      const sg = ctx.createGain(); const base = 1 / Math.sqrt(singers) * .55 * rnd(.78, 1.12);
      sg.gain.value = base;
      // slow loudness wobble, like breathing
      const al = ctx.createOscillator(); al.frequency.value = rnd(.12, .38);
      const alg = ctx.createGain(); alg.gain.value = base * .16; al.connect(alg); alg.connect(sg.gain);
      o.connect(sg); sg.connect(banks[g]);
      const st = t + rnd(0, Math.min(.09, dur * .3));
      o.start(st); vib.start(st); dr.start(st); al.start(st);
      const sp = stopAt + rnd(0, .06);
      o.stop(sp); vib.stop(sp); dr.stop(sp); al.stop(sp);
    }
    const on = onsetOf(n.syl);
    if (on) {
      const cz = ctx.createBufferSource(); cz.buffer = noise(ctx);
      const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = on.f; cf.Q.value = on.q;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0, t - on.d * .6); cg.gain.linearRampToValueAtTime(on.g * amp * .5, t - on.d * .3); cg.gain.linearRampToValueAtTime(0, t + on.d * .4);
      cz.connect(cf); cf.connect(cg); cg.connect(out);
      cz.start(Math.max(0, t - on.d), rnd(0, 1)); cz.stop(t + on.d + .05);
    }
  }

  // ---------- sampler voice ----------
  function pickZone(set, pitch, vel) {
    let best = null, bd = 1e9;
    for (const z of set.zones) {
      const d = Math.abs(z.pitch - pitch) + (vel > .62 ? (z.vel <= 1 ? .6 : 0) : (z.vel > 1 ? .6 : 0));
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }
  function sampleNote(ctx, out, setName, pitch, t, dur, amp) {
    const set = cache[setName]; if (!set) return;
    const z = pickZone(set, pitch, amp); if (!z) return;
    const norm = .16 / Math.max(.02, z.rms / z.gain * .95);
    const lvl = Math.min(2.5, norm) * amp * MIX[setName];
    const rel = REL[setName], att = ATT[setName];
    // a section, not a soloist: strings and winds get a couple of slightly detuned,
    // slightly late desk-mates; timpani/piano/organ stay single.
    const SECTION = {violins:3, violas:3, cellos:3, basses:2, flute:2, oboe:2, clarinet:2, bassoon:2, horn:2, trumpet:2, trombone:2};
    const voices = SECTION[setName] || 1;
    for (let v = 0; v < voices; v++) {
      const rate = Math.pow(2, (pitch - z.pitch) / 12) * (v ? Math.pow(2, rnd(-6, 6) / 1200) : 1);
      const vt = t + (v ? rnd(0, .022) : rnd(0, .008));
      const vlvl = lvl * (v ? .55 : 1) / Math.sqrt(1 + (voices - 1) * .55 * .55); // power-matched: a section is as loud as the soloist, just wider
      const src = ctx.createBufferSource(); src.buffer = set.buffer; src.playbackRate.value = rate;
      const g = ctx.createGain();
      let stopAt;
      if (setName === 'timpani' || setName === 'piano') {
        g.gain.setValueAtTime(vlvl, vt);
        const ring = setName === 'piano' ? Math.max(dur, .85) : Math.min(z.len / rate, 2.6);
        if (setName === 'piano') { g.gain.setValueAtTime(vlvl, vt + ring); g.gain.setTargetAtTime(0, vt + ring, rel / 4); }
        stopAt = Math.min(vt + z.len / rate, vt + ring + rel * 1.5 + .05);
        src.start(vt, z.start); src.stop(stopAt);
      } else {
        g.gain.setValueAtTime(0, vt); g.gain.linearRampToValueAtTime(vlvl, vt + att);
        const hold = vt + Math.max(dur, att + .03);
        g.gain.setValueAtTime(vlvl, hold); g.gain.setTargetAtTime(0, hold, rel / 3.5);
        stopAt = hold + rel * 1.6;
        if (z.loop && dur + rel > z.loop[0] / rate * .95) {
          src.loop = true; src.loopStart = z.start + z.loop[0]; src.loopEnd = z.start + z.loop[1];
          src.start(vt, z.start); src.stop(stopAt);
        } else { src.start(vt, z.start); src.stop(Math.min(stopAt, vt + z.len / rate)); }
      }
      // darker when soft
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200 + 9000 * Math.min(1, amp); lp.Q.value = .3;
      src.connect(lp); lp.connect(g); g.connect(out);
    }
  }

  // ---------- room ----------
  function hallIR(ctx, secs = 3.6) {
    const sr = ctx.sampleRate, n = Math.floor(sr * secs), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const tt = i / sr, env = Math.exp(-tt * 1.9), k = .12 + .8 * Math.exp(-tt * 1.6);
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * env * (tt < .012 ? tt / .012 : 1);
      }
      for (let r = 0; r < 14; r++) { const i = Math.floor(sr * (.008 + Math.random() * .07)); d[i] += (Math.random() < .5 ? -1 : 1) * rnd(.2, .6) * (1 - i / (sr * .09)); }
    }
    return b;
  }
  function buildGraph(ctx, parts) {
    const master = ctx.createGain(); master.gain.value = .7;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 2.5; comp.attack.value = .02; comp.release.value = .3;
    const tone = ctx.createBiquadFilter(); tone.type = 'highshelf'; tone.frequency.value = 3200; tone.gain.value = -4;
    master.connect(tone); tone.connect(comp); comp.connect(ctx.destination);
    const rev = ctx.createConvolver(); rev.buffer = hallIR(ctx);
    const wet = ctx.createGain(); wet.gain.value = .55; rev.connect(wet); wet.connect(master);
    const buses = {};
    for (const p of parts) {
      const g = ctx.createGain(); g.gain.value = p.mute ? 0 : (p.level ?? 1);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      let head = g;
      if (p.choir) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4300; lp.Q.value = .5; g.connect(lp); head = lp; }
      if (pan) { pan.pan.value = p.pan || 0; head.connect(pan); pan.connect(master); } else head.connect(master);
      const send = ctx.createGain(); send.gain.value = p.choir ? .5 : .27; g.connect(send); send.connect(rev);
      buses[p.n] = g;
    }
    return {master, buses};
  }
  function playEvent(ctx, graph, ev, t, singers) {
    const out = graph.buses[ev.staff]; if (!out) return;
    const p = ev.part;
    if (p.choir) return choirNote(ctx, out, ev, t, ev.dur, ev.vel * .63, singers);
    p.sets.forEach((s, i) => sampleNote(ctx, out, s, ev.pitch + ((p.oct && p.oct[i]) || 0), t, ev.dur, ev.vel * (i ? .8 : 1)));
  }

  // ---------- realtime transport ----------
  let ctx = null, graph = null, timer = null, events = [], parts = [], idx = 0, t0 = 0, playing = false, offset = 0, endT = 0, onEnd = null;
  function play(evts, prts, from, end) {
    stop(); events = evts; parts = prts; endT = end;
    ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint: 'playback'});
    graph = buildGraph(ctx, parts);
    offset = from; t0 = ctx.currentTime + .15 - from;
    idx = events.findIndex(e => e.t >= from - .01); if (idx < 0) idx = events.length;
    playing = true; pump(); timer = setInterval(pump, 90);
    return ctx.resume();
  }
  function pump() {
    if (!playing) return;
    const horizon = ctx.currentTime + .7;
    while (idx < events.length && t0 + events[idx].t < horizon) {
      const e = events[idx++]; const at = t0 + e.t;
      if (at >= ctx.currentTime - .02) playEvent(ctx, graph, e, Math.max(at, ctx.currentTime), 6);
    }
    if (now() > endT + 3.5) { const cb = onEnd; stop(); cb && cb(); }
  }
  function now() { return playing && ctx ? Math.max(0, ctx.currentTime - t0) : offset; }
  function stop() {
    if (timer) clearInterval(timer); timer = null;
    if (ctx) { offset = Math.max(0, ctx.currentTime - t0); try { ctx.close(); } catch (e) {} }
    ctx = null; playing = false;
  }
  function setLevel(staff, v) { if (graph && graph.buses[staff]) graph.buses[staff].gain.setTargetAtTime(v, ctx.currentTime, .05); }

  // ---------- offline render ----------
  async function render(evts, prts, end, sr, onProgress) {
    const len = Math.ceil((end + 4) * sr);
    const off = new OfflineAudioContext(2, len, sr);
    const g = buildGraph(off, prts);
    // schedule in chunks with suspend() to keep memory/node count bounded
    const step = 8; let i = 0;
    const scheduleUntil = (T) => { while (i < evts.length && evts[i].t < T) { const e = evts[i++]; playEvent(off, g, e, e.t + .1, 12); } };
    scheduleUntil(step + 2);
    if (off.suspend) {
      for (let T = step; T < end + 2; T += step) {
        const TT = T;
        off.suspend(TT).then(() => { scheduleUntil(TT + step + 2); onProgress && onProgress(TT / (end + 4)); off.resume(); });
      }
    } else scheduleUntil(1e9);
    const buf = await off.startRendering();
    return buf;
  }
  function wav(b) {
    const n = b.length, ch = b.numberOfChannels, sr = b.sampleRate, ab = new ArrayBuffer(44 + n * ch * 2), v = new DataView(ab);
    let p = 0; const s = x => { for (const c of x) v.setUint8(p++, c.charCodeAt(0)); }, u32 = x => { v.setUint32(p, x, true); p += 4; }, u16 = x => { v.setUint16(p, x, true); p += 2; };
    let peak = 1e-9; for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
    const k = peak > .98 ? .98 / peak : 1;
    s('RIFF'); u32(36 + n * ch * 2); s('WAVE'); s('fmt '); u32(16); u16(1); u16(ch); u32(sr); u32(sr * ch * 2); u16(ch * 2); u16(16); s('data'); u32(n * ch * 2);
    const chans = [...Array(ch)].map((_, c) => b.getChannelData(c));
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const z = Math.max(-1, Math.min(1, chans[c][i] * k)); v.setInt16(p, z < 0 ? z * 32768 : z * 32767, true); p += 2; }
    return new Blob([ab], {type: 'audio/wav'});
  }
  return {loadSet, instrumentFor, vowelOf, play, stop, now, isPlaying: () => playing, setLevel, render, wav, set onEnd(f) { onEnd = f; }, SAMPLE_SETS};
})();
