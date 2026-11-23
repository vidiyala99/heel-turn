// Runs voice/server.js against local stand-ins for Runware and OpenAI to check request shape, caching and fallbacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listen = (srv) => new Promise(r => srv.listen(0, () => r(`http://127.0.0.1:${srv.address().port}`)));
const read = async (req) => { let s = ''; for await (const c of req) s += c; return JSON.parse(s); };

const runwareCalls = [];
const fakeRunware = http.createServer(async (req, res) => {
  runwareCalls.push({ auth: req.headers.authorization, body: await read(req) });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ data: [{ taskType: 'audioInference', audioBase64Data: Buffer.from('ID3fake-mp3').toString('base64') }] }));
});
const fakeOpenAI = http.createServer(async (req, res) => {
  await read(req);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: '"Business is booming."' } }] }));
});

test('tts proxies Runware once per text, then serves the disk cache', async (t) => {
  process.env.RUNWARE_URL = await listen(fakeRunware);
  process.env.OPENAI_URL = await listen(fakeOpenAI);
  process.env.RUNWARE_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.VOICE_CACHE_DIR = await mkdtemp(join(tmpdir(), 'voice-cache-'));
  const { createServer } = await import('../server.js');
  const srv = createServer();
  const base = await listen(srv);
  t.after(() => { srv.close(); fakeRunware.close(); fakeOpenAI.close(); });

  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const a = await post('/voice/api/tts', { speaker: 'kane', text: 'KANE SMASH.' });
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('x-cache'), 'miss');
  assert.equal(Buffer.from(await a.arrayBuffer()).toString(), 'ID3fake-mp3');
  const b = await post('/voice/api/tts', { speaker: 'kane', text: 'KANE SMASH.' });
  assert.equal(b.headers.get('x-cache'), 'hit');
  assert.equal(runwareCalls.length, 1);
  assert.equal(runwareCalls[0].auth, 'Bearer test-key');
  const task = runwareCalls[0].body[0];
  assert.equal(task.taskType, 'audioInference');
  assert.deepEqual(task.speech, { text: 'KANE SMASH.', voice: 'Hades', speed: 0.85 });
  assert.equal((await readdir(process.env.VOICE_CACHE_DIR)).length, 1);

  // six speakers map to six distinct Runware voices
  for (const s of ['rex', 'dot', 'vex', 'silas', 'mae']) await post('/voice/api/tts', { speaker: s, text: 'Testing one two.' });
  assert.equal(new Set(runwareCalls.map(c => c.body[0].speech.voice)).size, 6);

  assert.equal((await post('/voice/api/tts', { speaker: 'nobody', text: 'hi there' })).status, 400);
  assert.deepEqual(await (await post('/voice/api/line', { event: { kind: 'betray' }, speaker: 'dot' })).json(), { text: 'Business is booming.' });

  delete process.env.RUNWARE_API_KEY;
  assert.equal((await post('/voice/api/tts', { speaker: 'kane', text: 'KANE SMASH.' })).status, 503);
  assert.deepEqual(await (await fetch(base + '/voice/api/health')).json(), { runware: false, llm: true });
  assert.equal((await fetch(base + '/voice/../server.js')).status, 404);
});
