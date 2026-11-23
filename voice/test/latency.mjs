// Measures the fallback path in Node: event -> commentary -> tts.js -> speechSynthesis.speak(), with a stub engine
// that reports onstart on the next macrotask (what a real engine does at best). Then, if OPENAI_API_KEY is set,
// times live /voice/api/line calls through server.js.
import { createCommentary } from '../commentary.js';
import { createTTS } from '../tts.js';
import { createServer } from '../server.js';

const speakCalls = [];
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.speechSynthesis = {
  getVoices: () => [{ name: 'Stub Male', lang: 'en-US' }, { name: 'Stub Female', lang: 'en-GB' }],
  speak(u) { speakCalls.push({ at: performance.now(), u }); setTimeout(() => u.onstart?.(), 0); setTimeout(() => u.onend?.(), 40); },
};

const starts = [];
const tts = createTTS({ mode: 'browser', onStart: (line) => starts.push({ ms: performance.now() - line.eventAt, speaker: line.speaker }) });
const booth = createCommentary({ say: tts.speak, rng: () => 0.99 });
const kinds = ['entry', 'strike', 'grapple', 'pin', 'kickout', 'alliance_reply', 'finisher', 'elimination', 'taunt', 'betray'];
const firstLine = []; // first line of each event = the reaction a player hears
for (const kind of kinds) {
  const before = starts.length;
  booth.onEvent({ kind, actor: 'silas', target: 'kane', success: true });
  while (booth.busy || starts.length === before) await new Promise(r => setTimeout(r, 5));
  firstLine.push(+starts[before].ms.toFixed(2));
}
const pitches = new Set(speakCalls.map(c => `${c.u.pitch}/${c.u.rate}`));
console.log(JSON.stringify({ engine: 'stub speechSynthesis', events: kinds.length, linesSpoken: starts.length, firstLine_ms: firstLine, speakers: [...new Set(starts.map(s => s.speaker))], distinctPitchRate: pitches.size }));

if (process.env.OPENAI_API_KEY) {
  const srv = createServer();
  await new Promise(r => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}/voice/api/line`;
  const times = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: { kind: 'betray', actor: 'Silas Crane', target: 'Brutus Kane' }, speaker: 'dot', example: 'Business is business.' }) });
    const j = await r.json();
    times.push(+(performance.now() - t).toFixed(0));
    console.log(r.status, JSON.stringify(j));
  }
  console.log(JSON.stringify({ llm_ms: times, sorted: [...times].sort((a, b) => a - b) }));
  srv.close();
}
