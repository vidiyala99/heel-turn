// Synthesized arena sound (WebAudio only, no samples): body thuds, strike slaps, the crowd bed that
// follows heat, gasps on near-falls, pops on big moments, and the bell. Starts on the first key press.
let ctx = null, master = null, bed = null, bedGain = null, noiseBuf = null;

const vol = () => { const v = window.HEEL_SETTINGS?.volume; return v == null ? 0.8 : v > 1 ? v / 100 : v; };

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = vol(); master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // crowd bed: looped noise through a voice-band filter; gain follows heat
  bed = ctx.createBufferSource(); bed.buffer = noiseBuf; bed.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
  bedGain = ctx.createGain(); bedGain.gain.value = 0.02;
  bed.connect(bp).connect(bedGain).connect(master); bed.start();
}

function noise(t0, dur, { type = 'lowpass', f = 800, q = 0.7, gain = 0.5, attack = 0.004, f2 = null } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(flt).connect(g).connect(master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}
function tone(t0, dur, f0, f1, gain, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}

// size 0..1: a jab is ~0.3, a slam ~0.7, a finisher 1.
export function thud(size = 0.6) {
  if (!ctx) return; const t = ctx.currentTime;
  tone(t, 0.18 + size * 0.25, 95 + size * 30, 38, 0.6 + size * 0.5);          // chest of the mat
  noise(t, 0.07 + size * 0.12, { f: 500 + size * 300, gain: 0.35 + size * 0.4 }); // canvas slap
  if (size > 0.6) noise(t + 0.02, 0.5, { f: 180, gain: 0.25, attack: 0.01 });     // ring boom
}
export function slap(size = 0.3) {
  if (!ctx) return; const t = ctx.currentTime;
  noise(t, 0.06, { type: 'bandpass', f: 1900, q: 1.1, gain: 0.45 + size * 0.3 });
  tone(t, 0.09, 140, 70, 0.35 + size * 0.3);
}
export function ropes() { if (ctx) { const t = ctx.currentTime; tone(t, 0.35, 70, 52, 0.35, 'triangle'); noise(t, 0.12, { f: 300, gain: 0.2 }); } }
export function gasp() { if (ctx) noise(ctx.currentTime, 0.9, { type: 'bandpass', f: 500, f2: 1400, q: 0.9, gain: 0.5, attack: 0.12 }); }
export function pop(size = 1) {
  if (!ctx) return; const t = ctx.currentTime;
  noise(t, 1.2 + size, { type: 'bandpass', f: 800, f2: 600, q: 0.5, gain: 0.35 + size * 0.35, attack: 0.05 });
  noise(t, 0.9 + size, { type: 'highpass', f: 2500, gain: 0.08 + size * 0.1, attack: 0.08 }); // whistles and claps
}
export function bell() {
  if (!ctx) return; const t = ctx.currentTime;
  for (const [f, g] of [[880, 0.3], [2340, 0.12], [1320, 0.08]]) tone(t, 1.4, f, f * 0.995, g);
}
// heat 0..100 -> crowd bed level; called every frame
export function crowd(heat) {
  if (!ctx) return;
  master.gain.setTargetAtTime(vol(), ctx.currentTime, 0.1);
  bedGain.gain.setTargetAtTime(0.015 + (heat / 100) * 0.11, ctx.currentTime, 0.4);
}
