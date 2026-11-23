// Ladder lane check.
//   1. Pure model: drives state.js through set -> climb -> hold -> betray -> grab and asserts the
//      state machine and the PLAN event schema (no browser needed).
//   2. Browser: loads ladder.html?scene=climb|betray|grab in headless Chromium, asserts the
//      in-page state/events, and writes docs/shots/ladder-<scene>.png. Then runs the live page
//      for a few seconds to check the scripted AI goes for the ladder.
// Usage (from game/): npx vite --port 5199 &  node ladder/verify.mjs [baseUrl] [shotDir]
//        node ladder/verify.mjs --model-only
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatch, act, aiDecide, move, withLadder, withWrestler, LADDER, SITUATIONS, KINDS } from './state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failures++; };
const schemaOk = (e) => typeof e.match === 'string' && Number.isFinite(e.t_ms) && typeof e.actor === 'string'
  && KINDS.includes(e.kind) && SITUATIONS.includes(e.situation)
  && Object.keys(e).every((k) => ['match', 't_ms', 'actor', 'kind', 'target', 'situation', 'success', 'text'].includes(k));

// ---------- 1. pure model ----------
{
  const players = [{ id: 'p1', name: 'You', human: true, x: -1.8, z: 0.6 }, { id: 'ai', name: 'Silas', x: 1.8, z: -0.9 }];
  let m = createMatch({ players, ladder: { x: 0, z: 2.2, yaw: Math.PI / 2 } });
  const events = [];
  let t = 0;
  // Each step advances 1 s: longer than any busy window (setup is 900 ms).
  const run = (id, a) => { t += 1000; const r = act(m, id, a, t); events.push(...r.events); const changed = r.state !== m; m = r.state; return changed; };
  check(m.ladder.state === 'on_mat', 'starts on_mat');
  check(!run('p1', 'pickup'), 'pickup out of reach is a no-op');
  m = withWrestler(m, 'p1', { x: 0, z: 1.6, yaw: Math.PI });
  const frozen = JSON.stringify(m);
  check(act(m, 'p1', 'pickup', t + 1).state.ladder.state === 'carried' && JSON.stringify(m) === frozen, 'act() returns a new state and does not mutate its input');
  check(run('p1', 'pickup') && m.ladder.state === 'carried' && m.ladder.by === 'p1', 'pickup -> carried(by p1)');
  for (let i = 0; i < 40; i++) m = move(m, 'p1', 0, -1, 1 / 60, (t += 17));
  check(m.ladder.x === m.wrestlers.p1.x && m.ladder.z === m.wrestlers.p1.z, 'carried ladder follows the carrier');
  check(run('p1', 'setup') && m.ladder.state === 'standing', 'setup -> standing');
  check(m.ladder.x === 0 && m.ladder.z === 0, 'setup near the case snaps under the case');
  check(events.at(-1)?.kind === 'ladder_set' && events.at(-1).success === true, 'ladder_set event, success');
  check(run('p1', 'climb') && m.ladder.state === 'climbed' && m.ladder.by === 'p1' && m.ladder.rung === 1, 'climb -> climbed(p1, 1)');
  m = withWrestler(m, 'ai', { x: 0.2, z: -1.0 });
  check(run('ai', 'hold') && m.ladder.holder === 'ai', 'ai holds the ladder');
  check(events.at(-1)?.kind === 'ladder_hold' && events.at(-1).target === 'p1', 'ladder_hold targets the climber');
  check(aiDecide(m, 'ai', t + 700, { ally: 'p1', betrayAtRung: 4 }) === null, 'AI ally keeps holding below the betray rung');
  for (let r = 2; r <= 4; r++) run('p1', 'climb');
  check(m.ladder.rung === 4, 'climbed to rung 4');
  check(aiDecide(m, 'ai', t + 700, { ally: 'p1', betrayAtRung: 4 })?.action === 'betray_shove', 'AI ally decides betray_shove at rung 4');
  const pre = m;
  check(run('ai', 'betray_shove') && m.ladder.state === 'tipped', 'betray_shove -> tipped');
  const bet = events.at(-1);
  check(bet?.kind === 'ladder_betray' && bet.target === 'p1' && bet.success === true, 'ladder_betray event targets the climber');
  check(m.wrestlers.p1.fall?.rung === 4 && m.wrestlers.p1.downUntil > t, 'climber falls from rung 4 and is down');
  // A held ladder blocks an opponent shove (after_block situation follows).
  m = withLadder(pre, { holder: 'ai' });
  m = withWrestler(m, 'p1', { x: 0.9, z: 0.6 });
  m = withLadder(m, { state: 'standing', by: null, rung: 0 });
  const r = act(m, 'p1', 'shove', (t += 700));
  check(r.events[0]?.kind === 'ladder_tip' && r.events[0].success === false && r.state.ladder.state === 'standing', 'shove on a held ladder is blocked');
  check(act(r.state, 'p1', 'hold', t + 800).events.length === 0, 'cannot hold a ladder someone else holds');
  check(act(withLadder(r.state, { holder: null }), 'p1', 'climb', (t += 800)).events[0]?.situation === 'after_block', 'situation after a blocked shove is after_block');
  // Grab from the top.
  m = withLadder(createMatch({ players }), { state: 'standing', x: 0, z: 0, yaw: 0 });
  m = withWrestler(m, 'p1', { x: 0, z: 1.2 });
  for (let i = 0; i < LADDER.TOP; i++) run('p1', 'climb');
  check(m.ladder.rung === LADDER.TOP, `climbed to the top rung (${LADDER.TOP})`);
  check(run('p1', 'grab') && m.winner === 'p1' && events.at(-1)?.kind === 'ladder_grab' && events.at(-1).success, 'grab at the top wins');
  check(!run('ai', 'climb'), 'no actions after a winner');
  check(events.every(schemaOk), `all ${events.length} model events match the PLAN schema`);
  console.log('model kinds:', [...new Set(events.map((e) => e.kind))].join(', '));
}

if (process.argv.includes('--model-only')) process.exit(failures ? 1 : 0);

// ---------- 2. browser ----------
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch {
  pw = require(path.join(execSync('npm root -g').toString().trim(), '@playwright/mcp/node_modules/playwright'));
}
const base = (process.argv[2] || 'http://localhost:5199/').replace(/\/?$/, '/');
const shots = process.argv[3] || path.resolve(here, '..', '..', 'docs', 'shots');
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failures++; });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console.error]', msg.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.ladderScene?.ready, null, { timeout: 150000 });
  return page;
}
const summary = (page) => page.evaluate(() => {
  const m = window.ladder.state;
  return { ladder: { state: m.ladder.state, by: m.ladder.by, rung: m.ladder.rung, holder: m.ladder.holder }, winner: m.winner,
    kinds: window.ladderEvents.map((e) => e.kind), events: window.ladderEvents };
});

const expect = {
  climb: (s) => s.ladder.state === 'climbed' && s.ladder.by === 'p1' && s.ladder.rung === 5 && s.kinds.filter((k) => k === 'ladder_climb').length === 5,
  betray: (s) => s.ladder.state === 'tipped' && s.kinds.includes('ladder_hold') && s.kinds.includes('ladder_betray')
    && s.events.find((e) => e.kind === 'ladder_betray')?.target === 'p1',
  grab: (s) => s.winner === 'p1' && s.kinds.at(-1) === 'ladder_grab',
};
for (const name of ['climb', 'betray', 'grab']) {
  const page = await open(`${base}ladder.html?scene=${name}`);
  await page.waitForTimeout(1500);
  const s = await summary(page);
  console.log(`scene ${name}:`, JSON.stringify(s.ladder), 'winner', s.winner, 'kinds', s.kinds.join(','));
  check(expect[name](s), `scene ${name} state + events`);
  check(s.events.every(schemaOk), `scene ${name}: ${s.events.length} events match the PLAN schema`);
  const file = path.join(shots, `ladder-${name}.png`);
  await page.screenshot({ path: file, timeout: 90000 });
  console.log('wrote', file);
  await page.context().close();
}

// Live page: the scripted AI should walk to the ladder and pick it up within a few seconds.
{
  const page = await open(`${base}ladder.html`);
  await page.waitForTimeout(6000);
  const s = await summary(page);
  console.log('live after 6s:', JSON.stringify(s.ladder), 'kinds', s.kinds.join(','));
  check(s.ladder.state !== 'on_mat', 'live: the AI has moved the ladder off the mat');
  await page.context().close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
