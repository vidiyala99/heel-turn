// Sync probe: plays a real 60 s exhibition (scripted human vs the AI) and records, every rendered frame, the
// distance between each wrestler's drawn hips and its sim position (window.HEEL_SYNC in main.js), the paired-move
// hand-contact errors, and per-frame position pops of the drawn bodies. Takes docs/shots/sync-*.png.
// Bars: hips-vs-sim < 5 cm while no move drives the body (standing, settled); live full-weight contacts < 4 cm
// during paired moves; drawn-body pops > 30 cm/frame = 0; >= 4 lock-ups and >= 3 paired moves.
// usage: node tools/sync-probe.mjs [baseUrl]   (vite running in game/, e.g. npx vite --port 5183)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://localhost:5183';
const OUT = fileURLToPath(new URL('../../docs/shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--mute-audio'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto(`${base}/?mute=1`);
await pg.waitForFunction(() => window.HEEL_UI && window.HEEL_UI.state === 'title', null, { timeout: 30000 });
const st = () => pg.evaluate(() => window.HEEL_UI.state);
async function until(state, k = 'Enter') { for (let i = 0; i < 20; i++) { if (await st() === state) return; await pg.keyboard.press(k); await pg.waitForTimeout(500); } throw new Error('stuck at ' + await st()); }
if (await st() !== 'match') { await until('menu'); await until('select'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300); }
await pg.waitForFunction(() => window.HEEL_UI.state === 'match', null, { timeout: 8000 });
await pg.waitForFunction(() => (window.HEEL_ENTRANCE_LOG || []).some((e) => e.ev === 'bell'), null, { timeout: 60000 });
await pg.waitForTimeout(800);

// In-page: a rAF recorder plus a scripted human (walk in, grapple to lock up, pick a move in the lock-up).
await pg.evaluate(() => {
  const rec = window.__sync = { frames: [], lockups: 0, moves: 0, seqs: new Set(), shots: [] };
  const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const tap = (code) => { key(code, 'keydown'); setTimeout(() => key(code, 'keyup'), 40); };
  let held = null, n = 0, picks = ['KeyK', 'KeyJ', 'KeyK', 'KeyL'], pi = 0, lastPairSeq = -1;
  const loop = () => {
    const s = window.HEEL_SYNC && window.HEEL_SYNC();
    if (s && s.w.length === 2) {
      rec.frames.push({ t: performance.now(), pair: s.pair, contacts: s.contacts, w: s.w });
      if (s.pair && !rec.seqs.has(s.pair.seq)) { rec.seqs.add(s.pair.seq); if (s.pair.phase === 'lockup') rec.lockups++; else rec.moves++; }
      const G = window.G, me = G.P1, ai = G.P2;
      n++;
      if (me && ai && G.state && !G.state.over) {
        const want = s.pair ? null : me.state === 'idle' ? (Math.hypot(ai.x - me.x, ai.z - me.z) > 1.15 ? (ai.x > me.x ? 'KeyD' : 'KeyA') : null) : null;
        if (want !== held) { if (held) key(held, 'keyup'); if (want) key(want, 'keydown'); held = want; }
        if (s.pair && s.pair.phase === 'lockup' && s.pair.seq !== lastPairSeq && s.pair.t > 0.2) { lastPairSeq = s.pair.seq; tap(picks[pi++ % picks.length]); }
        else if (!s.pair && !want && me.state === 'idle' && n % 30 === 0) tap(n % 150 === 0 ? 'KeyJ' : 'KeyK');
        if (ai.state === 'down' && me.state === 'idle' && n % 40 === 0) tap('KeyK');
      }
    }
    if (!rec.stop) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

const shots = { lockup: false, mid: false, impact: false, getup: false };
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const s = await pg.evaluate(() => { const x = window.HEEL_SYNC(); return { x, over: !!window.G.state?.over }; });
  const p = s.x?.pair;
  if (!shots.lockup && p?.phase === 'lockup' && p.t > 0.5) { await pg.screenshot({ path: OUT + 'sync-lockup.png' }); shots.lockup = true; }
  if (!shots.mid && p?.phase === 'move' && p.move !== 'lockknee' && p.t > 0.9 && p.t < 1.4) { await pg.screenshot({ path: OUT + 'sync-mid-move.png' }); shots.mid = p.move; }
  if (!shots.impact && p?.phase === 'move' && p.move !== 'lockknee') {
    const imp = { bodyslam: 1.42, suplex: 1.82, ddt: 1.0 }[p.move];
    if (p.t >= imp && p.t < imp + 0.25) { await pg.screenshot({ path: OUT + 'sync-impact.png' }); shots.impact = p.move; }
  }
  if (!shots.getup && s.x?.w.some((w) => w.move && w.move.startsWith('kipup'))) { await pg.screenshot({ path: OUT + 'sync-getup.png' }); shots.getup = true; }
  if (s.over) { await pg.evaluate(() => window.HEEL.rematch()); await pg.waitForTimeout(500); }
  await pg.waitForTimeout(40);
}
const rec = await pg.evaluate(() => { const r = window.__sync; r.stop = true; return { frames: r.frames, lockups: r.lockups, moves: r.moves }; });
await b.close();

// ----- analysis -----
let maxYaw = 0, yawOver10 = 0, maxRoot = 0, rootOver5 = 0, maxSettled = 0, settledN = 0, over5 = 0, maxContact = 0, contactN = 0, pops = 0, maxPop = 0;
const SETTLE_MS = 400; // after a move lets go, the follow eases the body home; the bar applies once settled
const lastBusy = [0, 0];
for (let f = 0; f < rec.frames.length; f++) {
  const fr = rec.frames[f], prev = rec.frames[f - 1];
  fr.w.forEach((w, i) => {
    if (w.state === 'intro' || (prev && prev.w[i].state === 'intro')) { lastBusy[i] = fr.t; return; } // rematch walk-ins teleport
    const busy = w.move || w.state === 'getup' || fr.pair || w.state === 'paired' || w.lying || ['down', 'pinned', 'pinning', 'thrown', 'out', 'whipped', 'rebound'].includes(w.state);
    if (busy) lastBusy[i] = fr.t;
    else if (fr.t - lastBusy[i] > SETTLE_MS) {
      const d = Math.hypot(w.hx - w.sx, w.hz - w.sz), dr = Math.hypot(w.rx - w.sx, w.rz - w.sz); settledN++;
      const dy = Math.abs(Math.atan2(Math.sin(w.ry - w.fy), Math.cos(w.ry - w.fy))) * 180 / Math.PI;
      maxYaw = Math.max(maxYaw, dy); if (dy >= 10) yawOver10++;
      maxRoot = Math.max(maxRoot, dr); if (dr >= 0.05) { rootOver5++; if (process.env.DUMP && rootOver5 % 60 === 1) console.log('root', i, JSON.stringify(w)); }
      maxSettled = Math.max(maxSettled, d); if (d >= 0.05) { over5++; if (process.env.DUMP && over5 % 150 === 1) console.log('off', i, JSON.stringify(w)); }
    }
    if (prev) {
      // per 60 Hz frame: a slow headless frame covers several, so scale the jump by 1/60 over the real frame time
      const pw = prev.w[i], jump = Math.hypot(w.hx - pw.hx, w.hz - pw.hz) * Math.min(1, (1000 / 60) / Math.max(1, fr.t - prev.t));
      maxPop = Math.max(maxPop, jump); if (jump > 0.3) { pops++; if (process.env.DUMP) console.log('pop', i, (jump*100).toFixed(0), JSON.stringify(pw), JSON.stringify(w), JSON.stringify(fr.pair)); }
    }
  });
  if (fr.pair) for (const c of fr.contacts) if (c.w > 0.99) { contactN++; maxContact = Math.max(maxContact, c.err); if (process.env.DUMP && c.err > 0.04) console.log('contact', fr.pair.move, fr.pair.t.toFixed(2), c.by, c.hand, c.on, (c.err * 100).toFixed(1)); }
}
const res = {
  frames: rec.frames.length, lockups: rec.lockups, pairedMoves: rec.moves,
  yawVsSim: { maxDeg: +maxYaw.toFixed(1), framesOver10deg: yawOver10 },
  rootVsSim: { settledFrames: settledN, maxCm: +(maxRoot * 100).toFixed(1), framesOver5cm: rootOver5 },
  hipsVsSim: { settledFrames: settledN, maxCm: +(maxSettled * 100).toFixed(1), framesOver5cm: over5 },
  contacts: { fullWeightSamples: contactN, maxCm: +(maxContact * 100).toFixed(1) },
  pops: { over30cm: pops, maxCmPerFrame: +(maxPop * 100).toFixed(1) }, shots, errors: errs,
};
console.log(JSON.stringify(res, null, 1));
const ok = rec.lockups >= 4 && rec.moves >= 3 && rootOver5 === 0 && yawOver10 === 0 && maxContact < 0.04 && pops === 0 && !errs.length;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
