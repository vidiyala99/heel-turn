// End-to-end render of the promo overlay: spawns `python3 -m agents.promo` (real OpenAI key if set), serves
// game/ui/promo.{js,css} + game/public/art on a static port, drives a pre-match promo in headless Chromium,
// presses Enter to skip, and screenshots. Run from repo root:
//   node agents/promo/render.mjs [outdir] [path to playwright]     e.g. docs/lanes /tmp/pw/node_modules/playwright
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[3] || 'playwright');
const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] || 'docs/lanes');
const PROMO_PORT = 8789;

const page_html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/ui/promo.css">
<style>html,body{margin:0;height:100%;background:#05060a url(/art/titantron.jpg) center/cover;font-family:Inter,sans-serif}</style>
</head><body><script type="module">
import { createPromo } from '/ui/promo.js';
window.lines = [];
const promo = createPromo({ base: 'http://127.0.0.1:${PROMO_PORT}', art: '/art',
  speak: l => { window.lines.push(l); return new Promise(r => setTimeout(r, 1200)); } });
window.promo = promo;
window.ready = true;
</script></body></html>`;

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const web = createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const file = p.startsWith('/ui/') ? join(ROOT, 'game', p) : p.startsWith('/art/') ? join(ROOT, 'game/public', p) : null;
  if (!file) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page_html); }
  try { res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => web.listen(0, '127.0.0.1', r));

const py = spawn('python3', ['-m', 'agents.promo'], { cwd: ROOT, env: { ...process.env, HEEL_PROMO_PORT: String(PROMO_PORT) } });
await new Promise((r, j) => { py.stdout.on('data', d => { process.stdout.write(`[server] ${d}`); r(); }); py.on('exit', j); });

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${web.address().port}/`);
  await page.waitForFunction(() => window.ready);

  const t0 = Date.now();
  const done = page.evaluate(() => window.promo.play({ moment: 'pre', speaker: 'mae', opponent: 'silas', match_state: { match: 'm13' } }));
  await page.waitForSelector('.promo.on', { timeout: 8000 });
  console.log(`fetch -> overlay visible: ${Date.now() - t0} ms`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'promo-typing.png') });
  await page.keyboard.press('Enter');   // finish typing
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, 'promo-line1.png') });
  const shown = [];
  for (let i = 0; i < 12; i++) {           // Enter through the rest, recording each line as rendered
    const s = await page.evaluate(() => document.querySelector('.promo.on')
      ? { side: document.querySelector('.promo').dataset.side, name: document.querySelector('.promo-name').textContent,
          text: document.querySelector('.promo-text').textContent,
          memory: [...document.querySelectorAll('.promo-memory span')].map(x => x.textContent) } : null);
    if (!s) break;
    if (s.side === 'right' && !shown.some(x => x.side === 'right')) await page.screenshot({ path: join(OUT, 'promo-right.png') });
    shown.push(s);
    await page.keyboard.press('Enter'); await page.waitForTimeout(80);
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  }
  const out = await done;
  console.log(`meta: ${JSON.stringify(out?.meta)}`);
  for (const s of shown) console.log(`[${s.side}] ${s.name}: ${s.text}${s.memory.length ? `  | memory: ${s.memory.join(' ; ')}` : ''}`);
  console.log(`speak() hook called ${await page.evaluate(() => window.lines.length)} times; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  console.log(`overlay hidden after play(): ${await page.evaluate(() => !document.querySelector('.promo.on'))}`);
} finally {
  await browser?.close(); py.kill(); web.close();
}
