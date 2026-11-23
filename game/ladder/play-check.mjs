// Browser check of a full ladder match through the real keyboard path (muted): the intro holds everyone still,
// the AI waits after the bell, the chosen roster bodies load, the AI contests, a human can win, Esc pause works.
//   node ladder/play-check.mjs [base=http://localhost:5173/] [p1=vex] [p2=mae]
// The "human" is a key-pressing bot: every 120 ms it reads window.ladder.state, picks a goal with the same
// rules the AI uses (aiDecide, contest on, no wind-up) and presses WASD / E / Space / J / G like a player would,
// with seeded variety: reaction pauses, sidesteps, sometimes going straight for the ladder instead of trading hits.
// Runs headless (new headless + GPU flags, real time; the old headless shell renders ~2 fps).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createMatch, act, TIMING } from './state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch {
  pw = require(path.join(execSync('npm root -g').toString().trim(), '@playwright/mcp/node_modules/playwright'));
}
const base = (process.argv[2] || 'http://localhost:5173/').replace(/\/?$/, '/');
const [p1, p2] = [process.argv[3] || 'vex', process.argv[4] || 'mae'];
const shots = path.resolve(here, '..', '..', 'docs', 'shots');
let failures = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `  (${detail})` : ''}`); if (!ok) failures++; };

// 0. pure model: hammer strike every 50 ms for 12 s; nobody takes more than COMBO_HITS hits in a row without a knockdown
{
  let m = createMatch({ players: [{ id: 'p1', human: true, x: 0, z: 0 }, { id: 'ai', x: 0.6, z: 0 }] });
  let streak = 0, worst = 0, downs = 0;
  for (let t = 0; t < 12000; t += 50) {
    const r = act(m, 'p1', 'strike', t);
    for (const e of r.events) {
      const kd = r.state.wrestlers.ai.downUntil - t >= TIMING.KNOCKDOWN_MS;
      streak = kd ? 0 : streak + 1; if (kd) downs++; worst = Math.max(worst, kd ? 3 : streak);
    }
    m = r.state;
  }
  check(worst <= TIMING.COMBO_HITS && downs > 0, 'no stunlock: at most 3 hits in a row, the 3rd knocks down', `worst run ${worst}, knockdowns ${downs}`);
}

const browser = await pw.chromium.launch({ channel: 'chromium', args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/voice/api/')) errors.push(`${r.status()} ${r.url()}`); });
await page.goto(`${base}ladder.html?p1=${p1}&p2=${p2}&mute=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.ladderScene?.ready, null, { timeout: 120000 });
const pos = () => page.evaluate(() => { const w = window.ladder.state.wrestlers; return { p1: [w.p1.x, w.p1.z], ai: [w.ai.x, w.ai.z], ladder: window.ladder.state.ladder.state, phase: window.ladderPhase() }; });

// 1. before the bell
await page.waitForTimeout(1200);
const a = await pos();
await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
const b = await pos();
await page.screenshot({ path: path.join(shots, 'ladder-intro.png') });
check(a.phase === 'intro', 'intro is running 1.2 s in', a.phase);
check(JSON.stringify(a) === JSON.stringify(b) && b.ladder === 'on_mat', 'before the bell nobody moves, even with D held', JSON.stringify(b));
const plates = await page.evaluate(() => [...document.querySelectorAll('.plate .n')].map((n) => n.textContent));
const cast = await page.evaluate(() => window.ladderCast);
check(cast.p1 === p1 && cast.p2 === p2, 'cast comes from the URL', JSON.stringify(cast) + ' plates ' + plates.join(' | '));

// 2. the bell, then the AI waits
await page.waitForFunction(() => window.ladderPhase() === 'live', null, { timeout: 15000 });
const atBell = await pos();
await page.waitForTimeout(1500);
const after15 = await pos();
check(JSON.stringify(atBell.ai) === JSON.stringify(after15.ai), 'AI still waits 1.5 s after the bell', JSON.stringify(after15.ai));
await page.waitForTimeout(1500);
const after3 = await pos();
check(JSON.stringify(atBell.ai) !== JSON.stringify(after3.ai), 'AI is moving 3 s after the bell', JSON.stringify(after3.ai));

// 3. the human bot plays to a win
await page.evaluate(async () => {
  const { aiDecide } = await import('/ladder/state.js');
  const held = new Set();
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const hold = (codes) => { for (const c of [...held]) if (!codes.includes(c)) { key('keyup', c); held.delete(c); } for (const c of codes) if (!held.has(c)) { key('keydown', c); held.add(c); } };
  const tap = (code) => { key('keydown', code); key('keyup', code); };
  const KEY = { pickup: 'KeyE', setup: 'KeyE', climb: 'Space', grab: 'KeyG', strike: 'KeyJ', shove: 'KeyF', descend: 'KeyQ', release: 'KeyH', drop: 'KeyQ' };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let pauseUntil = 0, sidestep = null;
  window.bot = setInterval(() => {
    const m = window.ladder.state, now = performance.now();
    if (m.winner) { hold([]); clearInterval(window.bot); return; }
    if (now < pauseUntil) { hold(sidestep || []); return; }
    const r = rnd();
    if (r < 0.08) { pauseUntil = now + 150 + rnd() * 350; sidestep = null; hold([]); return; } // hesitate
    if (r < 0.13) { pauseUntil = now + 250; sidestep = [['KeyW', 'KeyS', 'KeyA', 'KeyD'][Math.floor(rnd() * 4)]]; return; } // sidestep
    sidestep = null;
    const d = aiDecide(m, 'p1', Math.round(window.ladder.time * 1000), { contest: rnd() < 0.6 }); // sometimes ignore the fight
    if (d?.toward) {
      const w = m.wrestlers.p1, dx = d.toward.x - w.x, dz = d.toward.z - w.z, c = [];
      if (Math.abs(dx) > 0.08) c.push(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dz) > 0.08) c.push(dz > 0 ? 'KeyS' : 'KeyW');
      hold(c);
    } else hold([]);
    if (d?.action) tap(KEY[d.action]);
  }, 120);
});
let midShot = false;
const ground = { samples: 0, bad: [], states: {} }; // ladder lowest point vs the mat, every sample, every state
const sampleGround = async () => {
  const g = await page.evaluate(() => window.ladder.ladderGround());
  ground.samples++;
  const st = ground.states[g.state] ||= { min: 9, max: -9 };
  st.min = Math.min(st.min, g.low); st.max = Math.max(st.max, g.low);
  if (g.low < g.matY - 0.02) ground.bad.push(`${g.state} low ${g.low.toFixed(3)}`);
  ground.matY = g.matY;
};
const t0 = Date.now();
let s;
while (Date.now() - t0 < 90000) {
  s = await page.evaluate(() => ({ L: window.ladder.state.ladder, winner: window.ladder.state.winner }));
  if (!midShot && s.L.state === 'climbed' && s.L.rung >= 3) { midShot = true; await page.screenshot({ path: path.join(shots, 'ladder-midclimb.png') }); console.log('mid-climb shot:', s.L.by, 'rung', s.L.rung); }
  await sampleGround();
  if (s.winner) break;
  await page.waitForTimeout(150);
}
const ev = await page.evaluate(() => window.ladderEvents.map((e) => `${e.actor}:${e.kind}${e.success === false ? '(x)' : ''}`));
const strikes = await page.evaluate(() => window.ladderEvents.filter((e) => e.kind === 'ladder_strike').map((e) => `${e.actor}>${e.target}${/down/.test(e.text) ? ' DOWN' : ''}`));
let run = 0, worstRun = 0, lastT = null;
for (const x of strikes) { const [actor, rest] = x.split('>'), tgt = rest.split(' ')[0]; if (actor === lastT) lastT = null; run = tgt === lastT ? run + 1 : 1; lastT = tgt; worstRun = Math.max(worstRun, run); if (x.endsWith('DOWN')) run = 0, lastT = null; }
check(worstRun <= 3, 'live match: nobody hit more than 3 times in a row without a knockdown', `worst ${worstRun}; ${strikes.join(', ')}`);
const feedRows = await page.evaluate(() => [...document.querySelectorAll('#feedList p')].map((p) => p.textContent));
const dupes = feedRows.filter((t, i) => i && t === feedRows[i - 1]);
check(dupes.length === 0, 'ladder log has no identical consecutive rows', feedRows.slice(0, 4).join(' / '));
check(midShot, 'a mid-climb moment was captured');
check(ev.some((e) => e.startsWith('ai:ladder_strike') || e.startsWith('ai:ladder_tip')), 'the AI contested (hit or tipped the human)', ev.filter((e) => e.startsWith('ai:')).join(','));
check(s.winner === 'p1', 'the human won', `winner ${s.winner} after ${((Date.now() - t0) / 1000).toFixed(1)} s; ${ev.length} events`);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(shots, 'ladder-human-win.png') });

const rest = Object.entries(ground.states).filter(([k]) => k !== 'carried' && k !== 'tipped').map(([k, v]) => `${k} ${v.min.toFixed(3)}..${v.max.toFixed(3)}`);
check(ground.bad.length === 0 && ground.samples > 50, `ladder never sinks below the mat (y ${ground.matY})`, `${ground.samples} samples; ${JSON.stringify(Object.fromEntries(Object.entries(ground.states).map(([k, v]) => [k, `${v.min.toFixed(3)}..${v.max.toFixed(3)}`])))} ${ground.bad.slice(0, 3).join(', ')}`);
check(Object.entries(ground.states).filter(([k]) => k === 'on_mat' || k === 'standing' || k === 'climbed').every(([, v]) => Math.abs(v.min - ground.matY) <= 0.05),
  'a lying or standing ladder rests on the mat surface (low within 0.05 m of matY)', rest.join('; '));

// 4. Esc pause
await page.keyboard.press('Escape');
const paused = await page.evaluate(() => document.getElementById('lp').classList.contains('on') && [...document.querySelectorAll('#lp button')].map((b) => b.textContent).join(','));
check(!!paused && paused.includes('Restart') && paused.includes('Main menu'), 'Esc opens pause with restart and main menu', paused);
await page.screenshot({ path: path.join(shots, 'ladder-pause.png') });

// 5. launched from the main menu: title -> Ladder Match -> first wrestler -> /ladder.html, default camera
await page.goto(`${base}?mute=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.HEEL_UI?.state === 'title', null, { timeout: 60000 });
const ui = () => page.evaluate(() => window.HEEL_UI.state);
await page.keyboard.press('Enter'); await page.waitForFunction(() => window.HEEL_UI.state === 'menu', null, { timeout: 10000 }); await page.waitForTimeout(500);
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForFunction(() => window.HEEL_UI.state === 'select', null, { timeout: 10000 }).catch(async () => console.log('menu state', await ui())); await page.waitForTimeout(700);
await page.keyboard.press('Enter');
await page.waitForURL(/ladder\.html\?p1=/, { timeout: 15000 });
await page.waitForFunction(() => window.ladderScene?.ready, null, { timeout: 120000 });
await page.waitForTimeout(800);
const g0 = await page.evaluate(() => ({ url: location.pathname + location.search, ...window.ladder.ladderGround() }));
await page.screenshot({ path: path.join(shots, 'ladder-from-menu.png') });
check(Math.abs(g0.low - g0.matY) <= 0.05, 'from the main menu the ladder lies on the mat', `${g0.url} ${g0.state} low ${g0.low.toFixed(3)} matY ${g0.matY}`);

check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
