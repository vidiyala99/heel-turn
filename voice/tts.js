// speak(line) -> Promise resolved when audio ends. Neural mp3 via voice/server.js (Runware, else OpenAI) when the
// proxy reports a provider; browser speechSynthesis otherwise (or when a fetch fails). onDuck(true|false) brackets
// every line. Audio plays through a broadcast voice bus (high-pass, presence lift, compressor) on the shared
// AudioContext when one exists. prefetch(line) warms the clip so a queued line plays the moment its turn comes.
import { VOICES } from './voices.js';

// Automated browsers (Playwright sets navigator.webdriver) and ?mute=1 never make sound: speechSynthesis speaks
// through the OS voice even under --mute-audio, so the test runs were audible on the owner's machine.
export const MUTED = typeof navigator !== 'undefined' && navigator.webdriver === true
  || typeof location !== 'undefined' && new URLSearchParams(location.search).get('mute') === '1';

const START_BUDGET_MS = 2000; // a clip not ready this long after its cue is skipped (or swapped for its cached fallback)

export function createTTS({ base = '/voice/api', onDuck = () => {}, onStart = () => {}, mode = 'auto', ctx = () => null, now = () => performance.now(), muted = MUTED } = {}) {
  let neural = mode === 'neural' || mode === 'runware' ? Promise.resolve(true)
    : mode === 'browser' ? Promise.resolve(false)
    : fetch(`${base}/health`).then(r => r.json()).then(h => !!(h.tts ?? h.runware)).catch(() => false);

  const clips = new Map(); // `${speaker}|${kind}|${text}` -> Promise<ArrayBuffer>
  const keyOf = (l) => `${l.speaker}|${l.kind ?? ''}|${l.text}`;
  function clip(l) {
    const k = keyOf(l);
    if (!clips.has(k)) {
      const p = fetch(`${base}/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speaker: l.speaker, text: l.text, kind: l.kind }) })
        .then(r => { if (!r.ok) throw new Error(`tts ${r.status}`); return r.arrayBuffer(); });
      p.catch(() => clips.delete(k));
      clips.set(k, p);
      if (clips.size > 200) clips.delete(clips.keys().next().value);
    }
    return clips.get(k);
  }
  async function prefetch(l) { if (!muted && l?.text && await neural) clip(l).catch(() => {}); }

  // broadcast voice bus, built once per AudioContext
  let bus = null;
  function voiceBus(ac) {
    if (bus?.ac === ac) return bus.input;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    const mud = ac.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 300; mud.gain.value = -3; mud.Q.value = 1;
    const presence = ac.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.gain.value = 4; presence.Q.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -22; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18; comp.knee.value = 6;
    const out = ac.createGain(); out.gain.value = 1.25;
    hp.connect(mud).connect(presence).connect(comp).connect(out).connect(ac.destination);
    bus = { ac, input: hp };
    return hp;
  }

  async function play(bytes, line) {
    const ac = ctx();
    if (ac && ac.state === 'running') {
      const buf = await ac.decodeAudioData(bytes.slice(0));
      return new Promise(resolve => {
        const src = ac.createBufferSource(); src.buffer = buf;
        src.connect(voiceBus(ac)); src.onended = resolve;
        src.start(); onStart(line, 'neural');
      });
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    try {
      await new Promise((resolve, reject) => {
        const a = new Audio(url);
        a.onplaying = () => onStart(line, 'neural');
        a.onended = resolve; a.onerror = reject;
        a.play().catch(reject);
      });
    } finally { URL.revokeObjectURL(url); }
  }

  function pickVoice(v) {
    const all = speechSynthesis.getVoices().filter(x => x.lang?.startsWith('en'));
    return all.find(x => v.prefer.test(x.name) && x.lang === v.lang) || all.find(x => v.prefer.test(x.name)) || all[0] || null;
  }

  function speakBrowser(line) {
    return new Promise(resolve => {
      // never under automation, even when a test unmutes the neural path: the OS voice ignores --mute-audio
      if (!('speechSynthesis' in globalThis) || globalThis.navigator?.webdriver) { onStart(line, 'none'); return resolve(); }
      const v = VOICES[line.speaker] ?? VOICES.rex;
      const u = new SpeechSynthesisUtterance(line.text);
      const voice = pickVoice(v); if (voice) u.voice = voice;
      u.lang = v.lang; u.pitch = v.pitch; u.rate = v.rate;
      const done = () => { clearTimeout(guard); resolve(); };
      // engines without voices never fire end; cap by a reading-speed estimate so the booth keeps moving
      const guard = setTimeout(done, 600 + line.text.length * 70 / v.rate);
      u.onstart = () => onStart(line, 'speechSynthesis');
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('stale')), Math.max(0, ms)));

  async function speak(line) {
    if (muted) { onStart(line, 'muted'); return; }
    onDuck(true);
    try {
      if (await neural) {
        const cue = line.eventAt ?? now();
        try {
          const bytes = await Promise.race([clip(line), timeout(cue + START_BUDGET_MS - now())]);
          return await play(bytes, line);
        } catch (e) {
          // an LLM line that is not rendered in time gives way to its pre-rendered template line
          if (e.message === 'stale' && line.fallbackText && line.fallbackText !== line.text) {
            try { return await play(await Promise.race([clip({ ...line, text: line.fallbackText }), timeout(400)]), { ...line, text: line.fallbackText }); } catch { /* drop */ }
          }
          if (e.message === 'stale') return; // late audio is dropped, never talked over the action
          console.warn('[voice] neural tts failed, using browser voice', e);
        }
      }
      return await speakBrowser(line);
    } finally { onDuck(false); }
  }

  return { speak, prefetch, voices: VOICES };
}
