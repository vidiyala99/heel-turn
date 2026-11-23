// Headless Chromium drives demo.html in browser-voice mode and measures event -> audio-start latency.
// Needs playwright: npm i --no-save --prefix voice/.tools playwright && node voice/.tools/node_modules/playwright/cli.js install chromium-headless-shell
import { createRequire } from 'node:module';
import { createServer } from '../server.js';

const require = createRequire(new URL('../.tools/node_modules/', import.meta.url));
const { chromium } = require('playwright');

const srv = createServer();
await new Promise(r => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${base}/voice/demo.html?tts=browser`);
await page.click('#start');
const voices = await page.evaluate(() => speechSynthesis.getVoices().length);
const crowd = await page.evaluate(() => new Promise(r => setTimeout(() => r(window.booth ? 'ok' : 'missing'), 300)));

const events = ['Entry', 'Strike', 'Slam', 'Near-fall', 'Kickout', 'Alliance', 'Betrayal', 'Finisher', 'Elimination', 'Taunt: Kane'];
for (const label of events) {
  await page.click(`button:text-is("${label}")`);
  await page.waitForFunction(() => !window.booth.busy, null, { timeout: 30000 });
}
const out = await page.evaluate(() => ({ latency: window.voiceLatency, captions: window.voiceCaptions.map(c => `${c.speaker}[${c.source}]: ${c.text}`), caption: document.getElementById('caption').textContent }));
await browser.close(); srv.close();

const ms = out.latency.map(l => l.ms).sort((a, b) => a - b);
const pct = p => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))]?.toFixed(1);
console.log(out.captions.join('\n'));
console.log(JSON.stringify({ systemVoices: voices, engines: [...new Set(out.latency.map(l => l.engine))], lines: ms.length, p50_ms: pct(0.5), max_ms: ms.at(-1)?.toFixed(1), firstLineOfEachEvent_ms: out.latency.filter((l, i, a) => i === 0 || l.ms < a[i - 1].ms || l.speaker === 'rex').map(l => +l.ms.toFixed(1)), crowd, pageErrors: errors }, null, 1));
if (errors.length || ms.length < events.length) process.exit(1);
