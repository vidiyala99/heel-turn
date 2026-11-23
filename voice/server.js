// Voice proxy. npm start (loads ../.env when present; PORT, default 8787)
//   GET  /voice/*            static files from voice/ (demo.html and the browser modules)
//   GET  /voice/api/health   { tts: 'runware'|'openai'|null, runware, openai, llm, warm }
//   POST /voice/api/tts      { speaker, text, kind? } -> audio/mpeg, cached on disk by sha256(provider|voice|style|text)
//   POST /voice/api/line     { event, speaker, example, story? } -> { text } from OpenAI, 503 without a key
// TTS provider order: Runware (sponsor) when RUNWARE_API_KEY is set, else OpenAI gpt-4o-mini-tts, else the browser
// falls back to speechSynthesis. At start the server pre-renders every template line (warm cache) so the hot path
// is a disk read. Keys come only from env and are never printed. RUNWARE_URL/OPENAI_URL/OPENAI_TTS_URL override endpoints (tests).
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICES } from './voices.js';
import { warmLines } from './lines.js';
import { announcerLines } from './announcer.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const CACHE = process.env.VOICE_CACHE_DIR || join(ROOT, '.cache');
const RUNWARE_URL = process.env.RUNWARE_URL || 'https://api.runware.ai/v1';
const RUNWARE_MODEL = process.env.RUNWARE_TTS_MODEL || 'fishaudio:s2.1@pro'; // owner pick 15:28 (Fish over Inworld/HeyGen)
const OPENAI_URL = process.env.OPENAI_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_TTS_URL = process.env.OPENAI_TTS_URL || 'https://api.openai.com/v1/audio/speech';
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.json': 'application/json' };
// big moments get a louder read from Rex; the kind changes the style, so it is part of the cache key
const HYPE = new Set(['finisher', 'elimination', 'betrayal', 'kickout', 'near_fall']);

export const provider = () => process.env.RUNWARE_API_KEY ? 'runware' : process.env.OPENAI_API_KEY ? 'openai' : null;

const PERSONA = {
  dot: 'You are Dot Calloway, the smug, wisecracking color commentator of a pro-wrestling TV show. You cheer the heels, defend every cheater, mock the crowd favorite, and delight in bribes and betrayals.',
  rex: 'You are Rex Ramsey, the earnest, hyped play-by-play man of a pro-wrestling TV show. You call the action, root for the good guys, and are scandalized by cheating.',
};

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
async function body(req) { let s = ''; for await (const c of req) { s += c; if (s.length > 1e5) throw new Error('too big'); } return JSON.parse(s || '{}'); }

const inflight = new Map(); // one provider call per cache key even under concurrent requests
const warm = { total: 0, done: 0, failed: 0, ms: 0 };

const style = (speaker, kind) => VOICES[speaker].openai.style + (speaker === 'rex' && HYPE.has(kind) ? ' This is a huge moment: peak energy, scream it.' : '');

async function callRunware(v, text) {
  const r = await fetch(RUNWARE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RUNWARE_API_KEY}` },
    body: JSON.stringify([{ taskType: 'audioInference', taskUUID: crypto.randomUUID(), model: RUNWARE_MODEL,
      speech: { text, ...(v.runware ? { voice: v.runware } : {}), speed: v.speedRunware ?? v.speed }, outputFormat: 'MP3', outputType: 'base64Data' }]),
    signal: AbortSignal.timeout(15000),
  });
  const out = await r.json().catch(() => ({}));
  const b64 = out?.data?.[0]?.audioBase64Data;
  if (!r.ok || !b64) throw Object.assign(new Error(`runware ${r.status}: ${JSON.stringify(out?.errors ?? out).slice(0, 300)}`), { code: 502 });
  return Buffer.from(b64, 'base64');
}

async function callOpenAI(v, text, instructions) {
  const r = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice: v.openai.voice, input: text, instructions, response_format: 'mp3' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Object.assign(new Error(`openai tts ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`), { code: 502 });
  return Buffer.from(await r.arrayBuffer());
}

export async function tts(speaker, text, kind) {
  const v = VOICES[speaker], p = provider();
  if (!v || typeof text !== 'string' || text.length < 2 || text.length > 500) throw Object.assign(new Error('bad request'), { code: 400 });
  if (!p) throw Object.assign(new Error('no TTS key set'), { code: 503 });
  const instructions = style(speaker, kind);
  const id = p === 'runware' ? `${RUNWARE_MODEL}|${v.runware}|${v.speedRunware ?? v.speed}` : `${OPENAI_TTS_MODEL}|${v.openai.voice}|${instructions}`;
  const key = createHash('sha256').update(`${id}|${text}`).digest('hex').slice(0, 32);
  const file = join(CACHE, `${key}.mp3`);
  try { return { buf: await readFile(file), cached: true }; } catch { /* miss */ }
  if (!inflight.has(key)) inflight.set(key, (async () => {
    const buf = p === 'runware' ? await callRunware(v, text) : await callOpenAI(v, text, instructions);
    await mkdir(CACHE, { recursive: true });
    await writeFile(file, buf);
    return { buf, cached: false };
  })().finally(() => inflight.delete(key)));
  return inflight.get(key);
}

// Pre-render every template line with every roster name, a few workers at a time so live requests still get through.
export async function warmCache(lines = [...announcerLines(), ...warmLines()], workers = 6) {
  if (!provider()) return warm;
  const t0 = Date.now(); let i = 0;
  warm.total = lines.length;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (i < lines.length) {
      const l = lines[i++];
      try { await tts(l.speaker, l.text, l.kind); warm.done++; } catch { warm.failed++; }
    }
  }));
  warm.ms = Date.now() - t0;
  return warm;
}

async function line({ event, speaker = 'dot', example, story }) {
  const r = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: OPENAI_MODEL, max_tokens: 40, temperature: 1,
      messages: [
        { role: 'system', content: `${PERSONA[speaker] ?? PERSONA.dot} Reply with ONE spoken line, under 16 words, no quotes, no stage directions. Original characters only: never quote or imitate a real commentator's catchphrases.` },
        { role: 'user', content: `Event: ${JSON.stringify(event)}.${story ? ` Storyline so far (call back to it when it fits: grudges, bribes, betrayals): ${JSON.stringify(story).slice(0, 800)}.` : ''} Example of the tone: ${example ?? ''}` },
      ] }),
    signal: AbortSignal.timeout(4000),
  });
  const out = await r.json();
  if (!r.ok) throw Object.assign(new Error(`openai ${r.status}`), { code: 502 });
  return out.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, '').replace(/\s*[—–]\s*/g, ', ') ?? '';
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/voice/api/health') return json(res, 200, { tts: provider(), runware: !!process.env.RUNWARE_API_KEY, openai: !!process.env.OPENAI_API_KEY, llm: !!process.env.OPENAI_API_KEY, warm });
      if (url.pathname === '/voice/api/tts' && req.method === 'POST') {
        if (!provider()) return json(res, 503, { error: 'no TTS key set (RUNWARE_API_KEY or OPENAI_API_KEY)' });
        const { speaker, text, kind } = await body(req);
        const { buf, cached } = await tts(speaker, text, kind);
        res.writeHead(200, { 'content-type': 'audio/mpeg', 'x-cache': cached ? 'hit' : 'miss' });
        return res.end(buf);
      }
      if (url.pathname === '/voice/api/line' && req.method === 'POST') {
        if (!process.env.OPENAI_API_KEY) return json(res, 503, { error: 'OPENAI_API_KEY not set' });
        return json(res, 200, { text: await line(await body(req)) });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/voice/')) {
        const rel = normalize(url.pathname.slice('/voice/'.length) || 'demo.html');
        if (rel.startsWith('..') || rel.startsWith('.')) return json(res, 404, {});
        const file = join(ROOT, rel);
        if (!(await stat(file).catch(() => null))?.isFile()) return json(res, 404, {});
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        return res.end(await readFile(file));
      }
      if (url.pathname === '/') { res.writeHead(302, { location: '/voice/demo.html' }); return res.end(); }
      json(res, 404, {});
    } catch (e) { json(res, e.code ?? 500, { error: String(e.message) }); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  createServer().listen(port, () => {
    console.log(`voice server http://localhost:${port}/voice/demo.html tts=${provider() ?? 'browser'} llm=${!!process.env.OPENAI_API_KEY}`);
    warmCache().then(w => console.log(`warm cache: ${w.done}/${w.total} lines ready, ${w.failed} failed, ${w.ms} ms`));
  });
}
