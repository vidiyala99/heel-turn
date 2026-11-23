// speak(line) -> Promise resolved when audio ends. Runware mp3 via voice/server.js when the proxy reports
// a key; browser speechSynthesis otherwise (or when a fetch fails). onDuck(true|false) brackets every line.
import { VOICES } from './voices.js';

export function createTTS({ base = '/voice/api', onDuck = () => {}, onStart = () => {}, mode = 'auto' } = {}) {
  let runware = mode === 'runware' ? Promise.resolve(true)
    : mode === 'browser' ? Promise.resolve(false)
    : fetch(`${base}/health`).then(r => r.json()).then(h => !!h.runware).catch(() => false);

  function playMp3(url, line) {
    return new Promise((resolve, reject) => {
      const a = new Audio(url);
      a.onplaying = () => onStart(line, 'runware');
      a.onended = resolve; a.onerror = reject;
      a.play().catch(reject);
    });
  }

  function pickVoice(v) {
    const all = speechSynthesis.getVoices().filter(x => x.lang?.startsWith('en'));
    return all.find(x => v.prefer.test(x.name) && x.lang === v.lang) || all.find(x => v.prefer.test(x.name)) || all[0] || null;
  }

  function speakBrowser(line) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in globalThis)) { onStart(line, 'none'); return resolve(); }
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

  async function speak(line) {
    onDuck(true);
    try {
      if (await runware) {
        try {
          const r = await fetch(`${base}/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speaker: line.speaker, text: line.text }) });
          if (!r.ok) throw new Error(`tts ${r.status}`);
          const url = URL.createObjectURL(await r.blob());
          try { return await playMp3(url, line); } finally { URL.revokeObjectURL(url); }
        } catch (e) { console.warn('[voice] runware failed, using browser voice', e); }
      }
      return await speakBrowser(line);
    } finally { onDuck(false); }
  }

  return { speak, voices: VOICES };
}
