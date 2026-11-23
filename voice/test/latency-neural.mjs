// First-audio latency of the neural TTS path through voice/server.js, cached vs uncached, plus the six sample clips.
// node voice/test/latency-neural.mjs [base=http://localhost:8787]   (server must be running with a TTS key)
import { writeFile, mkdir } from 'node:fs/promises';
import { warmLines } from '../lines.js';

const base = process.argv[2] || 'http://localhost:8787';
const post = (b) => fetch(`${base}/voice/api/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

// time to first audio byte (what the player waits for) and to the whole clip
async function time(b) {
  const t0 = performance.now();
  const r = await post(b);
  const reader = r.body.getReader();
  const first = await reader.read(); const ttfb = performance.now() - t0;
  let n = first.value?.length ?? 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; }
  return { status: r.status, cache: r.headers.get('x-cache'), ttfb: +ttfb.toFixed(1), total: +(performance.now() - t0).toFixed(1), bytes: n };
}
const stats = (xs) => { const s = [...xs].sort((a, b) => a - b); return { n: s.length, min: s[0], p50: s[Math.floor(s.length / 2)], max: s.at(-1) }; };

const health = await (await fetch(`${base}/voice/api/health`)).json();
const cachedSet = warmLines().filter((_, i) => i % 37 === 0).slice(0, 12);
const cached = [];
for (const l of cachedSet) { await post(l).then(r => r.arrayBuffer()); cached.push(await time(l)); } // ensure warm, then measure
const stamp = Date.now();
const uncached = [];
for (let i = 0; i < 12; i++) uncached.push(await time({ speaker: i % 2 ? 'dot' : 'rex', kind: 'finisher', text: `Crane cashes in the grudge from match ${stamp % 1000 + i}, and Kane never saw it coming!` }));

const SEQ = [
  { file: 'sample-1-bell.mp3', speaker: 'rex', kind: 'bell', text: 'There\'s the bell! Here we GO!' },
  { file: 'sample-2-strike.mp3', speaker: 'rex', kind: 'strike', text: 'Brutus Kane lights up Vex!' },
  { file: 'sample-3-slam.mp3', speaker: 'rex', kind: 'slam', text: 'Brutus Kane picks up Vex, BODY SLAM!' },
  { file: 'sample-4-near-fall.mp3', speaker: 'rex', kind: 'near_fall', text: 'Cover! One! Two! NO!' },
  { file: 'sample-5-kickout.mp3', speaker: 'dot', kind: 'kickout', text: 'Oh, stay DOWN. Nobody paid to watch you hope.' },
  { file: 'sample-6-finisher.mp3', speaker: 'rex', kind: 'finisher', text: 'HERE IT COMES! Silas Crane hits the finisher!' },
];
const dir = new URL('../../docs/audio/', import.meta.url);
await mkdir(dir, { recursive: true });
for (const s of SEQ) { const r = await post(s); await writeFile(new URL(s.file, dir), Buffer.from(await r.arrayBuffer())); }

console.log(JSON.stringify({
  provider: health.tts, warm: health.warm,
  cached_ttfb_ms: stats(cached.map(x => x.ttfb)), cached_hits: cached.filter(x => x.cache === 'hit').length,
  uncached_ttfb_ms: stats(uncached.map(x => x.ttfb)), uncached_total_ms: stats(uncached.map(x => x.total)), uncached_misses: uncached.filter(x => x.cache === 'miss').length,
  samples: SEQ.map(s => `${s.file} [${s.speaker}] ${s.text}`),
}, null, 1));
