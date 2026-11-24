// The mix: one master bus per AudioContext, scaled live by Settings > Volume (window.HEEL_SETTINGS.volume, 0..1,
// 'heel:settings' event). Every source (voice bus, crowd, bell, music, sfx, menu blips) connects to masterFor(ac),
// never to ac.destination. Bus levels are dB relative to speech on the voice bus (game/ui/mix_check.py measures them).
export const LEVEL = {
  crowd: -12,        // crowd bed alone
  crowdUnder: -18,   // crowd under any voice
  music: -14,        // menu music
  musicUnder: -26,   // menu music under a voice (results promo, winner call)
};
export const dB = (x) => 10 ** (x / 20);
export const settingsVolume = () => {
  const v = globalThis.HEEL_SETTINGS?.volume;
  return v == null ? 0.7 : Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
};

const masters = new WeakMap();
export function masterFor(ac) {
  let m = masters.get(ac);
  if (m) return m;
  m = ac.createGain(); m.gain.value = settingsVolume(); m.connect(ac.destination);
  masters.set(ac, m);
  globalThis.addEventListener?.('heel:settings', () => m.gain.setTargetAtTime(settingsVolume(), ac.currentTime, 0.05));
  return m;
}

// voice activity from agent-layer.js ('heel:voice' start/end), for buses that are not on the booth's duck path
export function onVoice(fn) {
  const live = new Set();
  globalThis.addEventListener?.('heel:voice', (e) => {
    const { phase, speaker } = e.detail || {};
    const was = live.size > 0;
    if (phase === 'start') live.add(speaker); else live.delete(speaker);
    if (was !== live.size > 0) fn(live.size > 0);
  });
}
