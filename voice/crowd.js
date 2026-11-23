// Procedural crowd: filtered noise murmur + swells + clap/chant bursts. All synthesized, no samples.
// const crowd = createCrowd(); crowd.start() after a user gesture; crowd.onEvent(ev); crowd.duck(true|false).
import { MUTED } from './tts.js';

const SWELL = { bell: 0.6, strike: 0.15, grapple: 0.3, knockdown: 0.35, pin: 0.5, kickout: 0.8, finisher: 0.9, elimination: 1, betray: 1, entry: 0.7, taunt: 0.25 };

export function createCrowd({ ctx = null, volume = 0.5, muted = MUTED } = {}) {
  let ac = ctx, master, bed, bedFilter, lfoGain, noise, live = true, lastBell = -9;

  function noiseBuffer(seconds = 3) {
    const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; // cheap pink noise: crowds are pink, not white
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
      d[i] = (b0 + b1 + b2 + w * 0.02) * 2.2;
    }
    return buf;
  }

  function start() {
    if (muted) return Promise.resolve();
    if (master) return ac.resume();
    ac ??= new AudioContext();
    noise = noiseBuffer();
    master = ac.createGain(); master.gain.value = volume; master.connect(ac.destination);
    // murmur bed: bandpassed pink noise whose level breathes on a slow LFO
    const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
    bedFilter = ac.createBiquadFilter(); bedFilter.type = 'bandpass'; bedFilter.frequency.value = 700; bedFilter.Q.value = 0.7;
    bed = ac.createGain(); bed.gain.value = 0.25;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.17;
    lfoGain = ac.createGain(); lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(bed.gain);
    src.connect(bedFilter).connect(bed).connect(master);
    src.start(); lfo.start();
    return ac.resume();
  }

  // a roar: louder, brighter bed for `seconds`, then settle back
  function swell(amount = 0.5, seconds = 2.5) {
    if (!master) return;
    const t = ac.currentTime, a = Math.min(1, Math.max(0, amount));
    bed.gain.cancelScheduledValues(t); bedFilter.frequency.cancelScheduledValues(t);
    bed.gain.setTargetAtTime(0.25 + a * 0.9, t, 0.08);
    bed.gain.setTargetAtTime(0.25, t + seconds * a + 0.3, 0.6);
    bedFilter.frequency.setTargetAtTime(700 + a * 900, t, 0.1);
    bedFilter.frequency.setTargetAtTime(700, t + seconds * a + 0.3, 0.8);
  }

  // one burst of many hands or voices: short noise grain through a filter
  function burst(at, { freq = 2500, q = 1, dur = 0.06, gain = 0.5, type = 'bandpass' } = {}) {
    const s = ac.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.008); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    s.connect(f).connect(g).connect(master); s.start(at, Math.random() * 2, dur + 0.05);
  }

  // patterns: 'clap' = clap clap clap-clap-clap; 'hey' = shouted vowel bursts on the beat
  function chant(pattern = 'clap', bars = 2, bpm = 132) {
    if (!master) return;
    const beat = 60 / bpm, t0 = ac.currentTime + 0.05;
    const claps = [0, 1, 2, 2.5, 3];
    for (let bar = 0; bar < bars; bar++) {
      const tb = t0 + bar * 4 * beat;
      if (pattern === 'clap') claps.forEach(b => burst(tb + b * beat, { freq: 2200, q: 0.8, dur: 0.07, gain: 0.7 }));
      else [0, 2].forEach(b => { // two formants make a rough "HEY"
        burst(tb + b * beat, { freq: 650, q: 4, dur: 0.28, gain: 0.9 });
        burst(tb + b * beat, { freq: 1700, q: 5, dur: 0.24, gain: 0.5 });
      });
    }
  }

  function duck(on) {
    if (!master || !live) return;
    master.gain.setTargetAtTime(on ? volume * 0.35 : volume, ac.currentTime, on ? 0.05 : 0.4);
  }

  // the arena only exists during a match: fade the whole crowd in at the bell, out at the results
  function setLive(on) {
    live = on;
    if (master) master.gain.setTargetAtTime(on ? volume : 0, ac.currentTime, on ? 0.3 : 0.25);
  }

  // ring bell: inharmonic partials of a struck plate, rung `times` in quick succession
  function bell(times = 1) {
    if (!master) return;
    const t0 = ac.currentTime + 0.02;
    for (let k = 0; k < times; k++) {
      const t = t0 + k * 0.32;
      [[1, 0.5], [2.76, 0.28], [5.4, 0.16], [8.93, 0.08]].forEach(([m, g0]) => {
        const o = ac.createOscillator(); o.frequency.value = 820 * m;
        const g = ac.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(g0, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.6 / Math.sqrt(m));
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 1.7);
      });
    }
  }

  function onEvent(ev) {
    const a = SWELL[ev.kind]; if (a == null || ev.success === false && ev.kind !== 'betray') return;
    swell(a);
    const now = ac?.currentTime ?? 0;
    if ((ev.kind === 'entry' || ev.kind === 'bell') && now - lastBell > 3) { lastBell = now; bell(1); }
    if (ev.kind === 'elimination') bell(3);
    if (ev.kind === 'kickout' || ev.kind === 'entry') chant('clap', 2);
    if (ev.kind === 'taunt') chant('hey', 1);
  }

  return { start, swell, chant, duck, bell, setLive, onEvent, get context() { return ac; } };
}
