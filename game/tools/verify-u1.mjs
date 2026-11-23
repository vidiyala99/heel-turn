// U1 check: two browser contexts join one ring room by invite link, both keyboards drive their own
// wrestler, and both clients must report the same hp/positions from the server.
// Usage: node tools/verify-u1.mjs [baseUrl] [shotDir]   (needs `npm run dev` running)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch {
  pw = require(path.join(execSync('npm root -g').toString().trim(), '@playwright/mcp/node_modules/playwright'));
}
const base = process.argv[2] || 'http://localhost:5173/';
const shots = process.argv[3] || path.resolve('..', 'docs', 'shots');

const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const open = async (url) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('[nav]', f.url()); });
  page.on('console', (m) => { if (/vite|heel/i.test(m.text())) console.log('[console]', m.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.HEEL, null, { timeout: 150000 });
  await page.evaluate(() => { for (const fn of ['startMatch', 'toMenu']) { const o = window.HEEL[fn]; window.HEEL[fn] = (...a) => { console.log('heel call', fn, JSON.stringify(a), window.HEEL_UI?.state, String(new Error().stack).slice(0, 300)); return o(...a); }; } });
  return page;
};
const read = (page) => page.evaluate(() => {
  const s = window.G.state; if (!s) return null;
  return { session: window.HEEL.session, w: s.w.map((w) => ({ id: w.id, hp: w.hp, x: +w.x.toFixed(3), z: +w.z.toFixed(3), state: w.state })) };
});
const hold = async (page, key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

const a = await open(base);
// Same calls the shell (game/ui/menu.js) makes: HEEL.startMatch(cfg), then its own 'match' screen.
const code = 'U1' + Math.random().toString(36).slice(2, 6).toUpperCase();
const start = (page, cfg) => page.evaluate((c) => { window.HEEL_UI?.go('match'); return window.HEEL.startMatch(c); }, cfg);
const hostInfo = await start(a, { mode: 'online', room: code, host: true, p1: 'vex', p2: 'kane' });
console.log('host', hostInfo);
if (hostInfo.mode !== 'online') throw new Error('host fell back to local: is the server running?');
const b = await open(hostInfo.invite);
const joinInfo = await start(b, { mode: 'online', room: code, host: false, p1: 'silas' });
console.log('join', joinInfo);
await a.waitForTimeout(3500); // intro

// close the distance: host walks right, guest walks left
await Promise.all([hold(a, 'KeyD', 700), hold(b, 'KeyA', 700)]);
let ra, rb;
for (let i = 0; i < 6; i++) {
  await a.keyboard.press('KeyJ'); await a.waitForTimeout(450);
  await b.keyboard.press('KeyJ'); await b.waitForTimeout(450);
  await Promise.all([hold(a, 'KeyD', 150), hold(b, 'KeyA', 150)]);
  await a.waitForTimeout(700); // both idle, settled on the same snapshot
  [ra, rb] = await Promise.all([read(a), read(b)]);
  console.log(`round ${i + 1} A`, JSON.stringify(ra?.w), 'ui', await a.evaluate(() => window.HEEL_UI?.state));
  console.log(`round ${i + 1} B`, JSON.stringify(rb?.w), 'ui', await b.evaluate(() => window.HEEL_UI?.state));
  if (!ra || !rb || ra.w.some((w) => w.hp < 100)) break;
}
console.log('client A', JSON.stringify(ra));
console.log('client B', JSON.stringify(rb));
const same = JSON.stringify(ra.w) === JSON.stringify(rb.w);
const hit = ra.w.some((w) => w.hp < 100);
console.log(`slots A=${ra.session.slot} B=${rb.session.slot} same=${same} damageDealt=${hit}`);
await a.screenshot({ timeout: 90000, path: path.join(shots, 'u1-a.png') });
await b.screenshot({ timeout: 90000, path: path.join(shots, 'u1-b.png') });
// Server down: an online start must fall back to a local exhibition match.
const c = await open(base + '?server=ws://127.0.0.1:9');
const off = await start(c, { mode: 'online', host: true, p1: 'mae' });
console.log('server-down fallback', off.mode);
await browser.close();
process.exit(same && hit && ra.session.slot === 0 && rb.session.slot === 1 && off.mode === 'exhibition' ? 0 : 1);
