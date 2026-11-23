// Render sample ring-announcer lines through the server's own tts() (same cache, same voice row) into
// docs/audio/announcer-*.mp3. Needs OPENAI_API_KEY (or RUNWARE_API_KEY) in env; never writes the key.
// Run: node --env-file-if-exists=../.env voice/render-announcer.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tts, provider } from './server.js';
import { introLines, winnerLine, entrantLine } from './announcer.js';

const out = fileURLToPath(new URL('../docs/audio/', import.meta.url));
if (!provider()) { console.log('no TTS key in env'); process.exit(1); }
await mkdir(out, { recursive: true });
const [open, i1, i2] = introLines('vex', 'kane');
const shots = { open, 'intro-vex': i1, 'intro-kane': i2, 'winner-mae': winnerLine('mae'), 'entrant-silas': entrantLine('silas') };
for (const [name, l] of Object.entries(shots)) {
  const t0 = Date.now(), { buf, cached } = await tts(l.speaker, l.text, l.kind);
  await writeFile(out + `announcer-${name}.mp3`, buf);
  console.log(`announcer-${name}.mp3 ${buf.length} bytes ${cached ? 'cache' : 'rendered'} ${Date.now() - t0} ms | ${l.text}`);
}
