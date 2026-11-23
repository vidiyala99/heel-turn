// Live Runware TTS latency through voice/server.js, in process, on a fresh cache dir (no warm-up run).
// node voice/test/latency-runware.mjs   (needs RUNWARE_API_KEY). n=12 uncached across all 7 speakers, then the same 12 cached.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.VOICE_CACHE_DIR = await mkdtemp(join(tmpdir(), 'rw-lat-'));
delete process.env.OPENAI_API_KEY;
const { createServer } = await import('../server.js');
const srv = createServer().listen(0);
const base = `http://localhost:${srv.address().port}`;

async function time(b) {
  const t0 = performance.now();
  const r = await fetch(`${base}/voice/api/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const bytes = (await r.arrayBuffer()).byteLength;
  return { status: r.status, cache: r.headers.get('x-cache'), ms: +(performance.now() - t0).toFixed(1), bytes, speaker: b.speaker };
}
const stats = (xs) => { const s = [...xs].sort((a, b) => a - b); return { n: s.length, min: s[0], p50: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)], max: s.at(-1) }; };
const speakers = ['rex', 'dot', 'ring', 'vex', 'kane', 'silas', 'mae'];
const stamp = Date.now() % 100000;
const lines = Array.from({ length: 12 }, (_, i) => ({ speaker: speakers[i % 7], text: `Match ${stamp + i}: Crane cashes in the grudge, and Kane never saw it coming!` }));
const uncached = []; for (const l of lines) uncached.push(await time(l));
const cached = []; for (const l of lines) cached.push(await time(l));
const byModel = {};
const { VOICES } = await import('../voices.js');
for (const u of uncached) (byModel[VOICES[u.speaker].runware.model] ??= []).push(u.ms);
console.log(JSON.stringify({
  uncached_ms: stats(uncached.map(x => x.ms)), misses: uncached.filter(x => x.cache === 'miss').length,
  uncached_by_model: Object.fromEntries(Object.entries(byModel).map(([m, xs]) => [m, stats(xs)])),
  cached_ms: stats(cached.map(x => x.ms)), hits: cached.filter(x => x.cache === 'hit').length,
  failures: uncached.filter(x => x.status !== 200).map(x => `${x.speaker} ${x.status}`),
}, null, 1));
srv.close();
