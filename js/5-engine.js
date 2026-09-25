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
  function vowelSeqOf(syl, prev) {
    if (!syl) return [prev || 'a'];
    let t = syl.toLowerCase().replace(/[^a-zäöüéèàíóú]/g, '').replace(/^qu/, 'q').replace(/ae/g, 'e');
    const map = {y:'i',ä:'e',ö:'e',ü:'u',é:'e',è:'e',à:'a',í:'i',ó:'o',ú:'u'};
    const seq = [...t].filter(c => /[aeiouyäöüéèàíóú]/.test(c)).map(c => map[c] || c);
    return seq.length ? seq.slice(0, 2) : [prev || 'a'];
  }
  function onsetOf(syl) {
    if (!syl) return null;
    const c = syl.toLowerCase().replace(/[^a-z]/g, '')[0];
    if (!c || 'aeiou'.includes(c)) return null;
    if ('sczfx'.includes(c)) return {f:6500, q:.7, d:.07, g:.5};
    if ('tkqp'.includes(c)) return {f:3200, q:.8, d:.02, g:.9};
    if ('dgb'.includes(c)) return {f:1800, q:.7, d:.016, g:.45};
    if ('hj'.includes(c)) return {f:1500, q:.55, d:.06, g:.25};
    return null; // l, m, n, r, v, w: voiced onsets, handled by softer attack
  }
  // Three glottal-source variants (different spectral tilts) so the section does not share one buzz.
  const glottalWaves = new Map(); // ctx -> [wave per source-tilt variant]
  function glottal(ctx, v = 0) {
    let per = glottalWaves.get(ctx);
    if (!per) { per = []; glottalWaves.set(ctx, per); }
    if (per[v]) return per[v];
    const tilt = [1.8, 2.0, 2.2][v] || 2.0;
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) { im[k] = 1 / Math.pow(k, tilt) * (k % 2 ? 1 : .85); }
    const w = ctx.createPeriodicWave(re, im); per[v] = w; return w;
  }
  function noise(ctx) {
    if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    const R2 = mulberry32(0x9e3779b9); // fixed seed: the same score renders the same take in every session
    for (let i = 0; i < d.length; i++) d[i] = R2() * 2 - 1;
    return (noiseBuf = b);
  }
  let noiseBuf = null;
  // Deterministic humanization: the randoms used to build one event's nodes come
  // from a generator seeded by that event, so every render of a score is the same
  // take and parallel render slices build identical nodes for shared events.
  function mulberry32(a) { return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  let R = Math.random;
  const rnd = (a, b) => a + R() * (b - a);
  // Vocal-tract sizes across a real section differ; three "tract groups" shift the whole
  // formant pattern slightly, which is what makes many voices blur into a choir.
  const TRACT = [{s:.94, d:-6}, {s:1, d:0}, {s:1.065, d:6}];
  function choirNote(ctx, out, n, t, dur, amp, singers) {
    const part = n.choir;
    const f0 = 440 * Math.pow(2, (n.pitch - 69) / 12);
    // formant path: optional glide from the previous syllable's vowel, then any diphthong drift
    const seq = vowelSeqOf(n.syl, n.vowel || 'a');
    const path = [];
    if (n.fromVowel && n.fromVowel !== seq[0]) path.push({v: n.fromVowel, at: 0});
    path.push({v: seq[0], at: path.length ? Math.min(.14, dur * .35) : 0});
    if (seq.length > 1 && seq[1] !== seq[0] && dur > .45) path.push({v: seq[1], at: dur * .5});
    const tuned = v => {
      const ff = F[part][v][0].slice();
      if ((part === 'S' || part === 'A') && f0 > ff[0] * .92) ff[0] = Math.min(f0 * 1.03, ff[0] + (f0 - ff[0]) * .82);
      return ff;
    };
    const [, db, bw] = F[part][seq[0]];
    const body = ctx.createGain(); body.gain.value = 0;
    body.connect(out);
    const banks = [], bps = [];
    for (let g = 0; g < 3; g++) {
      const bankIn = ctx.createGain(); bankIn.gain.value = 1;
      const gOut = ctx.createGain(); gOut.gain.value = 1 / Math.sqrt(3);
      // Klatt-style cascade: source flows through the resonators in series, so the
      // vowel's relative formant levels emerge naturally instead of being glued on.
      const row = [];
      let head = bankIn;
      const ff = tuned(path[0].v);
      for (let k = 0; k < 5; k++) {
        const fk = ff[k] * TRACT[g].s;
        if (fk > ctx.sampleRate / 2 - 500) { row.push(null); continue; }
        const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = fk; bp.Q.value = fk / (bw[k] * 2.2);
        head.connect(bp); head = bp;
        row.push(bp);
      }
      // lip radiation: about +6 dB/oct above ~1 kHz
      const rad = ctx.createBiquadFilter(); rad.type = 'highshelf'; rad.frequency.value = 1100; rad.gain.value = 11;
      head.connect(rad); rad.connect(gOut);
      bps.push(row);
      // a little direct low-passed source keeps the chest warmth under the formants
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(520, f0 * 2); const lg = ctx.createGain(); lg.gain.value = .12;
      bankIn.connect(lp); lp.connect(lg); lg.connect(gOut);
      // aspiration: air through the same formants, per tract
      const nz = ctx.createBufferSource(); nz.buffer = noise(ctx); nz.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      const ng = ctx.createGain(); ng.gain.value = .016;
      nz.connect(hp); hp.connect(ng); ng.connect(bankIn);
      const air = ctx.createBiquadFilter(); air.type = 'bandpass'; air.frequency.value = 3200; air.Q.value = .45;
      const ag = ctx.createGain(); ag.gain.value = .008 + .032 * amp;
      nz.connect(air); air.connect(ag); ag.connect(gOut);
      nz.start(t, ((n.t + rnd(0, 1.5)) % 2 + 2) % 2); nz.stop(t + dur + .4); // phase locked to piece time: identical across render slices
      gOut.connect(body);
      banks.push(bankIn);
    }
    // walk the formant path (vowel glide in, diphthong drift)
    if (path.length > 1) {
      for (let i = 1; i < path.length; i++) {
        const ffT = tuned(path[i].v), t0 = t + path[i].at, dt = .12;
        for (let g = 0; g < 3; g++) for (let k = 0; k < 5; k++) {
          const bp = bps[g][k]; if (!bp) continue;
          const fk = ffT[k] * TRACT[g].s; if (fk > ctx.sampleRate / 2 - 500) continue;
          bp.frequency.setValueAtTime(bp.frequency.value, t0);
          bp.frequency.linearRampToValueAtTime(fk, t0 + dt);
          bp.Q.setValueAtTime(bp.Q.value, t0);
          bp.Q.linearRampToValueAtTime(fk / (bw[k] * 2.2), t0 + dt);
        }
      }
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
      // voices brighten as they sing louder (open quotient drops): pick the source tilt by level
      const gv = amp > .55 ? 0 : amp < .3 ? 2 : 1;
      const o = ctx.createOscillator(); o.setPeriodicWave(glottal(ctx, gv));
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
      const sg = ctx.createGain(); const base = 1 / Math.sqrt(singers) * .32 * rnd(.78, 1.12);
      sg.gain.value = base;
      // slow loudness wobble, like breathing
      const al = ctx.createOscillator(); al.frequency.value = rnd(.12, .38);
      const alg = ctx.createGain(); alg.gain.value = base * .16; al.connect(alg); alg.connect(sg.gain);
      o.connect(sg); sg.connect(banks[g]);
      const st = t + rnd(0, Math.min(.024, dur * .12)); // sections attack near-unison; width comes from detune/vibrato, not late entries
      o.start(st); vib.start(st); dr.start(st); al.start(st);
      const sp = stopAt + rnd(0, .06);
      o.stop(sp); vib.stop(sp); dr.stop(sp); al.stop(sp);
    }
    const syl0 = (n.syl || '').toLowerCase().replace(/[^a-z]/g, '')[0];
    if (syl0 && 'lmnrvw'.includes(syl0)) {
      // a voiced onset spoken by a section: two slightly detuned murmurs, not one solo hum
      for (let k = 0; k < 2; k++) {
        const mo = ctx.createOscillator(); mo.type = 'sine'; mo.frequency.value = f0;
        mo.detune.value = k ? rnd(6, 14) : rnd(-4, 4);
        const mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 700;
        const mg = ctx.createGain(); const mpeak = amp * .3 * (k ? .55 : 1) / 1.15;
        mg.gain.setValueAtTime(0, Math.max(0, t - .07));
        mg.gain.linearRampToValueAtTime(mpeak, t - .015);
        mg.gain.linearRampToValueAtTime(0, t + .04);
        mo.connect(mf); mf.connect(mg); mg.connect(out);
        mo.start(Math.max(0, t - .07)); mo.stop(t + .06);
      }
    }
    const on = onsetOf(n.syl);
    if (on) {
      // the section speaks the consonant together: one dominant burst plus two
      // micro-staggered quieter ones (power ~ +0.8 dB over the old single burst)
      for (let k = 0; k < 3; k++) {
        const off = k ? (k === 1 ? -1 : 1) * rnd(.004, .009) : 0, kg = k ? .35 : 1, t0 = t + off;
        const cz = ctx.createBufferSource(); cz.buffer = noise(ctx);
        const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = on.f * (k ? (k === 1 ? .92 : 1.09) : 1); cf.Q.value = on.q;
        // fast rise into a natural exponential decay: a hard gain corner at the peak
        // reads as a metallic strike, and stopping the source mid-tail clicks
        const tA = Math.max(0, t0 - on.d * .5);
        const cg = ctx.createGain(); cg.gain.setValueAtTime(0, Math.max(0, tA - on.d * .4));
        cg.gain.linearRampToValueAtTime(on.g * amp * .5 * kg, tA);
        cg.gain.setTargetAtTime(0, tA, on.d * .55);
        cz.connect(cf); cf.connect(cg); cg.connect(out);
        cz.start(Math.max(0, t0 - on.d), ((n.t + off - on.d + rnd(0, 1)) % 2 + 2) % 2); cz.stop(t0 + on.d * 6 + .05); // piece-time phase lock
      }
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
  const hallCache = {};
  function hallIR(ctx, secs = 5.5) {
    const key = ctx.sampleRate + ':' + secs;
    if (hallCache[key]) return hallCache[key];
    const sr = ctx.sampleRate, n = Math.floor(sr * secs), b = ctx.createBuffer(2, n, sr);
    const R2 = mulberry32(0x51ed270b); // fixed seed: the same score renders the same take in every session
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const tt = i / sr, env = Math.exp(-tt * 1.3), k = .12 + .8 * Math.exp(-tt * 1.6);
        lp += k * ((R2() * 2 - 1) - lp);
        d[i] = lp * env * (tt < .012 ? tt / .012 : 1);
      }
      for (let r = 0; r < 14; r++) { const i = Math.floor(sr * (.008 + R2() * .07)); d[i] += (R2() < .5 ? -1 : 1) * (.2 + R2() * .4) * (1 - i / (sr * .09)); }
    }
    hallCache[key] = b; return b;
  }
  function buildGraph(ctx, parts) {
    const master = ctx.createGain(); master.gain.value = 1.05;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 3.5; comp.attack.value = .02; comp.release.value = .3;
    const tone = ctx.createBiquadFilter(); tone.type = 'highshelf'; tone.frequency.value = 3200; tone.gain.value = -4;
    master.connect(tone); tone.connect(comp); comp.connect(ctx.destination);
    const rev = ctx.createConvolver(); rev.buffer = hallIR(ctx); if (window.AURELIA_DRY) rev.buffer = ctx.createBuffer(2, 1, ctx.sampleRate); // test hook: dry voice
    const wet = ctx.createGain(); wet.gain.value = .62; rev.connect(wet); wet.connect(master);
    const buses = {};
    for (const p of parts) {
      const g = ctx.createGain(); g.gain.value = p.mute ? 0 : (p.level ?? 1);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      let head = g;
      if (p.choir) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4300; lp.Q.value = .5; g.connect(lp); head = lp; }
      if (pan) { pan.pan.value = p.pan || 0; head.connect(pan); pan.connect(master); } else head.connect(master);
      // stage depth: front desks drier, back of the hall wetter
      const SEND = {violins:.22,violas:.24,cellos:.25,basses:.24,flute:.28,oboe:.28,clarinet:.28,bassoon:.3,horn:.34,trumpet:.3,trombone:.32,timpani:.42,organ:.5,piano:.18,choir:.42};
      const send = ctx.createGain(); send.gain.value = p.choir ? SEND.choir : Math.max(...(p.sets || ['piano']).map(s => SEND[s] ?? .27));
      g.connect(send); send.connect(rev);
      buses[p.n] = g;
    }
    return {master, buses};
  }
  function playEvent(ctx, graph, ev, t, singers) {
    const out = graph.buses[ev.staff]; if (!out) return;
    const p = ev.part;
    const save = R; if (ev._rid != null) R = mulberry32((ev._rid + 1) * 2654435761 | 0);
    try {
      if (p.choir) return choirNote(ctx, out, ev, t, ev.dur, ev.vel * .63, singers);
      p.sets.forEach((s, i) => sampleNote(ctx, out, s, ev.pitch + ((p.oct && p.oct[i]) || 0), t, ev.dur, ev.vel * (i ? .8 : 1)));
    } finally { R = save; }
  }

  // ---------- realtime transport ----------
  let ctx = null, graph = null, timer = null, events = [], parts = [], idx = 0, t0 = 0, playing = false, offset = 0, endT = 0, onEnd = null;
  function play(evts, prts, from, end) {
    stop(); evts.forEach((e, i) => { if (e._rid == null) e._rid = i; }); events = evts; parts = prts; endT = end;
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
  // Parallel slice rendering: each slice renders its span plus a warm-up pre-roll
  // on its own OfflineAudioContext (Chrome renders each offline context on its own
  // thread), then the trimmed spans are concatenated. The pre-roll rebuilds the
  // events that are still sounding at the slice start - identical nodes thanks to
  // the seeded randoms - so convolver tails, compressor state and long notes all
  // match a single-pass render.
  const QUANT = 128, HEAD_S = 35 * QUANT;  // head room for consonant onsets, in samples (~0.1s)
  const TAIL = 6;   // hall ring after the last event
  function renderSlice(evts, prts, o0, o1, pre, sr, singers, onProgress) {
    const span = o1 - o0, len = Math.ceil((pre + span) * sr);
    const off = new OfflineAudioContext(2, len, sr);
    const g = buildGraph(off, prts);
    const lo = o0 - pre + 1e-6; // events before lo end long before the boundary; excluding them keeps render times non-negative
    // sample-exact event placement: the piece-time start sample depends only on the
    // event, so every slice builds bit-identical automation timelines
    const q0s = Math.round(o0 * sr), preSs = Math.round(pre * sr);
    const at = e => (Math.round(e.t * sr) - q0s + preSs) / sr;
    let i = evts.findIndex(e => e.t >= lo); if (i < 0) i = evts.length;
    const step = 8;
    const until = T => { while (i < evts.length && at(evts[i]) < T) { const e = evts[i++]; playEvent(off, g, e, at(e), singers); } };
    until(step + 2);
    if (off.suspend && !window.AURELIA_NOSUSP) {
      for (let T = step; T < pre + span; T += step) {
        const TT = T;
        off.suspend(TT).then(() => { until(TT + step + 2); onProgress && onProgress(Math.min(1, TT / (pre + span))); off.resume(); });
      }
    } else until(1e9);
    return off.startRendering().then(buf => ({buf, trim: Math.round(pre * sr), keep: Math.round(span * sr)}));
  }
  async function render(evts, prts, end, sr, onProgress) {
    evts.forEach((e, i) => { if (e._rid == null) e._rid = i; });
    const singers = window.AURELIA_SINGERS || 12;
    const totalSamples = Math.ceil((end + TAIL) * sr / QUANT) * QUANT, total = totalSamples / sr;
    // warm-up must cover the longest note body+release plus the hall decay
    let maxDur = 0; for (const e of evts) if (e.dur > maxDur) maxDur = e.dur;
    const preS = Math.min(Math.ceil(30 * sr), Math.ceil((maxDur + 3 + 6) * sr / QUANT) * QUANT), pre = preS / sr;
    const cores = Math.max(1, Math.min(8, navigator.hardwareConcurrency || 2));
    let n = window.AURELIA_SLICES || Math.min(cores, Math.floor(total / Math.max(2 * pre, 25)));
    if (!(n > 1)) n = 1;
    const jobs = [];
    for (let k = 0; k < n; k++) {
      const q0 = Math.round(k * totalSamples / n / QUANT) * QUANT, q1 = k + 1 === n ? totalSamples : Math.round((k + 1) * totalSamples / n / QUANT) * QUANT;
      jobs.push(renderSlice(evts, prts, q0 / sr, q1 / sr, (k ? preS : HEAD_S) / sr, sr, singers, f => onProgress && onProgress((k + f) / n)));
    }
    const segs = await Promise.all(jobs);
    const out = window.AudioBuffer ? new AudioBuffer({numberOfChannels: 2, length: totalSamples, sampleRate: sr})
                                   : new OfflineAudioContext(2, 1, sr).createBuffer(2, totalSamples, sr);
    let pos = 0;
    for (const s of segs) {
      for (let c = 0; c < 2; c++) out.getChannelData(c).set(s.buf.getChannelData(c).subarray(s.trim, s.trim + s.keep), pos);
      pos += s.keep;
    }
    return out;
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
