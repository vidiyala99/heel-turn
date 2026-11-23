// Menu music: a synthesized arena hard-rock loop (no samples, no licensed themes) for title, menu, select, versus
// and results; a short entrance sting per wrestler on the versus screen. During a match it fades out so the booth
// and the crowd own the audio. mountMusic() listens to the UI's `heel:screen` and `heel:settings` events and starts
// on the first key or pointer press (autoplay policy). Silent under automation or ?mute=1 (see tts.js MUTED).
import { MUTED } from './tts.js';

const BPM = 138, BEAT = 60 / BPM, BAR = 4 * BEAT;
// E minor riff, one note per eighth: semitones above E1 (null = rest). Two bars, then a turnaround.
const RIFF = [0, 0, 12, 0, 10, 0, 7, 5, 0, 0, 12, 0, 15, 14, 12, 10];
const E1 = 41.2;
// per-wrestler sting: root offset and a three-note motif
const STINGS = { vex: [7, [0, 4, 7]], kane: [-5, [0, 1, 0]], brutus: [-5, [0, 1, 0]], silas: [3, [0, 3, 6]], mae: [5, [0, 7, 12]] };
const MENU_SCREENS = new Set(['title', 'menu', 'howto', 'settings', 'online', 'select', 'vs', 'results']);

export function createMusic({ volume = () => window.HEEL_SETTINGS?.volume ?? 0.7 } = {}) {
  let ac = null, out = null, noise = null, timer = null, nextBar = 0, bar = 0, playing = false;

  function init() {
    if (ac || MUTED) return !!ac;
    ac = new AudioContext();
    out = ac.createGain(); out.gain.value = 0;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
    out.connect(comp).connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  const level = () => 0.32 * volume();

  // distorted power chord (root + fifth + octave) through a waveshaper and a cabinet-ish lowpass
  const curve = (() => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 6); } return c; })();
  function chord(t, freq, dur, gain = 0.18) {
    const shaper = ac.createWaveShaper(); shaper.curve = curve;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    for (const m of [1, 1.4983, 2]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq * m; o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(shaper); o.start(t); o.stop(t + dur + 0.05);
    }
    shaper.connect(lp).connect(g).connect(out);
  }
  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.32);
  }
  function hiss(t, { freq, dur, gain, type = 'highpass' }) {
    const s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5, dur + 0.05);
  }
  const snare = (t) => { hiss(t, { freq: 1800, dur: 0.18, gain: 0.55, type: 'bandpass' }); hiss(t, { freq: 5000, dur: 0.1, gain: 0.25 }); };
  const hat = (t, open = false) => hiss(t, { freq: 8000, dur: open ? 0.22 : 0.04, gain: 0.16 });

  function scheduleBar(t, n) {
    const half = (n % 2) * 8, turn = n % 4 === 3;
    for (let i = 0; i < 8; i++) {
      const at = t + i * BEAT / 2, note = RIFF[half + i];
      if (note != null) chord(at, E1 * 2 ** (((turn && i >= 4 ? note + 2 : note)) / 12), BEAT / 2 * 0.95);
      hat(at, i === 7);
      if (i % 4 === 0 || (i === 3 && n % 2)) kick(at);
      if (i % 4 === 2) snare(at);
    }
    if (n % 8 === 0) hiss(t, { freq: 3000, dur: 1.4, gain: 0.3 }); // crash every 8 bars
  }

  function loop() {
    while (nextBar < ac.currentTime + 0.25) { scheduleBar(nextBar, bar++); nextBar += BAR; }
  }

  function play() {
    if (!init() || playing) return;
    ac.resume(); playing = true;
    nextBar = ac.currentTime + 0.08; bar = 0;
    timer = setInterval(loop, 50); loop();
    out.gain.cancelScheduledValues(ac.currentTime);
    out.gain.setTargetAtTime(level(), ac.currentTime, 0.3);
  }
  function stop(fade = 0.6) {
    if (!ac || !playing) return;
    playing = false;
    out.gain.cancelScheduledValues(ac.currentTime);
    out.gain.setTargetAtTime(0, ac.currentTime, fade / 4);
    const t = timer; setTimeout(() => clearInterval(t), fade * 1000 + 300);
  }
  // duck under a sting or a transition, then come back
  function duck(seconds = 1.2) {
    if (!ac || !playing) return;
    const t = ac.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(level() * 0.25, t, 0.05);
    out.gain.setTargetAtTime(level(), t + seconds, 0.4);
  }
  function sting(wrestler) {
    if (!init()) return;
    ac.resume(); duck(2);
    const [root, motif] = STINGS[wrestler] ?? [0, [0, 7, 12]];
    const t = ac.currentTime + 0.05, base = E1 * 2 * 2 ** (root / 12);
    kick(t); hiss(t, { freq: 3000, dur: 1.6, gain: 0.45 });
    motif.forEach((n, i) => chord(t + i * BEAT / 2, base * 2 ** (n / 12), i === motif.length - 1 ? 1.4 : BEAT / 2, 0.3));
    snare(t + 1.5 * BEAT); kick(t + 1.5 * BEAT);
  }
  function setVolume() { if (ac && playing) out.gain.setTargetAtTime(level(), ac.currentTime, 0.1); }

  return { play, stop, duck, sting, setVolume, get playing() { return playing; }, get context() { return ac; } };
}

// screen: title | menu | howto | settings | online | select | vs | match | pause | results
export function mountMusic(music = createMusic(), { onScreen = () => {} } = {}) {
  let screen = 'title', gestured = false;
  const apply = (detail = {}) => {
    if (!gestured) return;
    if (MENU_SCREENS.has(screen)) music.play(); else music.stop();
    if (screen === 'vs') [detail.p1, detail.p2].filter(Boolean).forEach((w, i) => setTimeout(() => music.sting(w), i * 1400));
  };
  addEventListener('heel:screen', (e) => { const prev = screen; screen = e.detail?.screen ?? screen; if (prev !== screen) { music.duck(0.5); apply(e.detail); } onScreen(screen, prev); });
  addEventListener('heel:settings', () => music.setVolume());
  const first = () => { gestured = true; apply(); removeEventListener('keydown', first); removeEventListener('pointerdown', first); };
  addEventListener('keydown', first); addEventListener('pointerdown', first);
  return music;
}
