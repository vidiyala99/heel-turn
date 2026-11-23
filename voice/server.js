// Voice proxy. node voice/server.js  (PORT, default 8787)
//   GET  /voice/*            static files from voice/ (demo.html and the browser modules)
//   GET  /voice/api/health   { runware, llm }
//   POST /voice/api/tts      { speaker, text } -> audio/mpeg, cached on disk by sha256(voice|text)
//   POST /voice/api/line     { event, speaker, example } -> { text } from OpenAI, 503 without a key
// Keys come only from env: RUNWARE_API_KEY, OPENAI_API_KEY. RUNWARE_URL/OPENAI_URL override endpoints (tests).
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICES } from './voices.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const CACHE = process.env.VOICE_CACHE_DIR || join(ROOT, '.cache');
const RUNWARE_URL = process.env.RUNWARE_URL || 'https://api.runware.ai/v1';
const RUNWARE_MODEL = process.env.RUNWARE_TTS_MODEL || 'inworld:tts@1.5-mini';
const OPENAI_URL = process.env.OPENAI_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.json': 'application/json' };

const PERSONA = {
  dot: 'You are Dot Calloway, the dry, deadpan color commentator of a pro-wrestling show. You quietly admire the heels and cheaters.',
  rex: 'You are Rex Ramsey, an excitable play-by-play wrestling commentator who shouts and loves the drama.',
};

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
async function body(req) { let s = ''; for await (const c of req) { s += c; if (s.length > 1e5) throw new Error('too big'); } return JSON.parse(s || '{}'); }

const inflight = new Map(); // one Runware call per cache key even under concurrent requests
async function tts(speaker, text) {
  const v = VOICES[speaker];
  if (!v || typeof text !== 'string' || text.length < 2 || text.length > 500) throw Object.assign(new Error('bad request'), { code: 400 });
  const key = createHash('sha256').update(`${RUNWARE_MODEL}|${v.runware}|${v.speed}|${text}`).digest('hex').slice(0, 32);
  const file = join(CACHE, `${key}.mp3`);
  try { return { buf: await readFile(file), cached: true }; } catch { /* miss */ }
  if (!inflight.has(key)) inflight.set(key, (async () => {
    const r = await fetch(RUNWARE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RUNWARE_API_KEY}` },
      body: JSON.stringify([{ taskType: 'audioInference', taskUUID: crypto.randomUUID(), model: RUNWARE_MODEL,
        speech: { text, voice: v.runware, speed: v.speed }, outputFormat: 'MP3', outputType: 'base64Data' }]),
      signal: AbortSignal.timeout(15000),
    });
    const out = await r.json().catch(() => ({}));
    const b64 = out?.data?.[0]?.audioBase64Data;
    if (!r.ok || !b64) throw Object.assign(new Error(`runware ${r.status}: ${JSON.stringify(out?.errors ?? out).slice(0, 300)}`), { code: 502 });
    const buf = Buffer.from(b64, 'base64');
    await mkdir(CACHE, { recursive: true });
    await writeFile(file, buf);
    return { buf, cached: false };
  })().finally(() => inflight.delete(key)));
  return inflight.get(key);
}

async function line({ event, speaker = 'dot', example }) {
  const r = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: OPENAI_MODEL, max_tokens: 40, temperature: 1,
      messages: [
        { role: 'system', content: `${PERSONA[speaker] ?? PERSONA.dot} Reply with ONE spoken line, under 16 words, no quotes, no stage directions. Original characters only.` },
        { role: 'user', content: `Event: ${JSON.stringify(event)}. Example of the tone: ${example ?? ''}` },
      ] }),
    signal: AbortSignal.timeout(4000),
  });
  const out = await r.json();
  if (!r.ok) throw Object.assign(new Error(`openai ${r.status}`), { code: 502 });
  return out.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, '') ?? '';
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/voice/api/health') return json(res, 200, { runware: !!process.env.RUNWARE_API_KEY, llm: !!process.env.OPENAI_API_KEY });
      if (url.pathname === '/voice/api/tts' && req.method === 'POST') {
        if (!process.env.RUNWARE_API_KEY) return json(res, 503, { error: 'RUNWARE_API_KEY not set' });
        const { speaker, text } = await body(req);
        const { buf, cached } = await tts(speaker, text);
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
  createServer().listen(port, () => console.log(`voice server http://localhost:${port}/voice/demo.html runware=${!!process.env.RUNWARE_API_KEY} llm=${!!process.env.OPENAI_API_KEY}`));
}
