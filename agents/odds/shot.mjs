// Live screenshot of game/ui/odds.js against the real service. Run from repo root AFTER python3 -m agents.odds.demo
// (it reuses agents/odds/.run, whose marts the demo just built):   node agents/odds/shot.mjs
// Starts python3 -m agents.odds as a child, serves a page that mounts the panel, bets + votes on m6 over HTTP,
// shoots docs/shots/odds-live.png, feeds the bribe, shoots docs/shots/odds-settled.png, kills the child.
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch {
  pw = require(path.join(execSync('npm root -g').toString().trim(), '@playwright/mcp/node_modules/playwright'));
}
const svc = spawn('python3', ['-m', 'agents.odds'], { cwd: root, env: { ...process.env, HEEL_ODDS_DIR: path.join(root, 'agents/odds/.run') }, stdio: 'inherit' });
const API = 'http://127.0.0.1:8790';
const post = (p, b) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const page = `<!doctype html><html><head><link rel="stylesheet" href="/game/ui/odds.css">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;700&display=swap" rel="stylesheet">
<style>body{margin:0;height:100vh;background:radial-gradient(circle at 35% 60%,#3a2a1a,#07080c 70%)}</style></head>
<body><script type="module">import { mountOdds } from '/game/ui/odds.js';
localStorage.setItem('heel.fan','fan_ana'); window.odds = mountOdds(document.body, { match: 'm6', api: '${API}' });</script></body></html>`;
const web = createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(page); }
  try {
    const body = readFileSync(path.join(root, path.normalize(req.url).replace(/^(\.\.[/\\])+/, '')));
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(body);
  } catch { res.statusCode = 404; res.end(); }
}).listen(5288);

try {
  for (let i = 0; i < 50; i++) { try { await fetch(API + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  await post('/event', ['silas', 'brutus', 'vex', 'mae'].map((w, i) => ({ match: 'm6', t_ms: i, actor: w, kind: 'entry' })));
  console.log(await post('/bet', { fan: 'fan_ana', pick: 'silas', stake: 100, match: 'm6' }));
  for (const [c, n] of [['yes', 7], ['no', 3]]) for (let i = 0; i < n; i++) await post('/vote', { poll: 'envelope', choice: c, match: 'm6' });
  for (const [c, n] of [['yes', 4], ['no', 5]]) for (let i = 0; i < n; i++) await post('/vote', { poll: 'turn_silas', choice: c, match: 'm6' });
  for (const [c, n] of [['kipup', 6], ['stay_down', 2]]) for (let i = 0; i < n; i++) await post('/vote', { poll: 'kipup', choice: c, match: 'm6' });
  const browser = await pw.chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.goto('http://127.0.0.1:5288/');
  await tab.waitForSelector('.op-row');
  await tab.click('.op-chip:nth-child(2)');
  await tab.click('.op-poll:first-child .op-back');           // 1-tap prop bet from the panel itself
  await tab.waitForTimeout(1800);
  await tab.screenshot({ path: path.join(root, 'docs/shots/odds-live.png') });
  console.log(await post('/event', { match: 'm6', t_ms: 9000, actor: 'lou', kind: 'bribe_accept', target: 'silas' }));
  await tab.waitForTimeout(2000);
  await tab.screenshot({ path: path.join(root, 'docs/shots/odds-settled.png') });
  console.log('panel balance text:', await tab.textContent('.op-bal-n'), '| toast:', await tab.textContent('.op-toast'));
  await browser.close();
} finally {
  svc.kill();
  web.close();
}
