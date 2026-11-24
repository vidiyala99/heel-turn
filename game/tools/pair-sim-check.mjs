// Headless check of the committed paired-move path (shared/pair.js): a 60 s AI vs scripted-human exhibition sim.
// Asserts: lock-ups and paired moves happen, both wrestlers stay frozen (state 'paired', fixed x/z) for every
// move, damage lands only on a move's impact frame, and no sim position jumps > 0.3 m in one step outside a
// move's end write. Usage: node tools/pair-sim-check.mjs   (exit 1 on failure)
import { createMatch, step, newControl } from '../shared/sim.js';
import { MOVES } from '../moves/moves.js';

const DT = 1 / 60;
let m = createMatch('vex', 'kane', null, { committed: true });
let total = 0;
const ctl = [newControl(true), newControl(false)];
let lockups = 0, moves = 0, frozenBreaks = 0, offFrameDmg = 0, pops = 0, pick = 0;
const seen = new Set();
let pinned = null, prevHp = [100, 100], prev = m.w.map((w) => [w.x, w.z]), endFrame = false;
const moveLog = [];
for (let f = 0; total + m.clock < 60; f++) {
  if (m.over) { total += m.clock; m = createMatch('vex', 'kane', m.habits, { committed: true }); pinned = null; prev = m.w.map((w) => [w.x, w.z]); prevHp = [100, 100]; continue; }
  const H = m.w[0], A = m.w[1], p = m.pair;
  ctl[0].mx = 0; ctl[0].mz = 0;
  if (p && p.phase === 'lockup' && f % 7 === 0) ctl[0].queue.push(['grapple', 'strike', 'grapple', 'block'][pick++ % 4]);
  else if (!p && H.state === 'idle') {
    const dx = A.x - H.x, dz = A.z - H.z, d = Math.hypot(dx, dz);
    if (d > 1.2) { ctl[0].mx = dx / d; ctl[0].mz = dz / d; } else if (f % 20 === 0) ctl[0].queue.push(f % 60 === 0 ? 'strike' : 'grapple');
  }
  step(m, DT, ctl);
  for (const e of m.events) {
    if (e.k === 'pair') { if (e.phase === 'lockup') lockups++; else { moves++; moveLog.push(e.move); } }
    if (e.k === 'pairEnd') endFrame = true;
  }
  for (const w of m.w) if (w.prevState === 'getup' && w.state !== 'getup') endFrame = true; // the sim steps to where the kip-up ended
  m.w.forEach((w) => { w.prevState = w.state; });
  {
  }
  m.events = [];
  // frozen: while a pair runs, positions do not change
  if (m.pair) {
    if (!pinned || pinned.seq !== m.pair.seq) pinned = { seq: m.pair.seq, pos: m.w.map((w) => [w.x, w.z]) };
    else if (m.w.some((w, i) => Math.hypot(w.x - pinned.pos[i][0], w.z - pinned.pos[i][1]) > 1e-6)) frozenBreaks++;
    if (m.w.some((w) => w.state !== 'paired')) frozenBreaks++;
    // damage only at an impact event time
    const P = m.pair, hit = (MOVES[P.move].events || []).some((ev) => ev.type === 'impact' && Math.abs(ev.t - P.t) <= DT * 1.5);
    m.w.forEach((w, i) => { if (w.hp < prevHp[i] && !hit && P.phase === 'move') offFrameDmg++; });
  }
  m.w.forEach((w, i) => { if (!endFrame && Math.hypot(w.x - prev[i][0], w.z - prev[i][1]) > 0.3) pops++; });
  endFrame = false;
  prev = m.w.map((w) => [w.x, w.z]); prevHp = m.w.map((w) => w.hp);
  seen.add(m.w[0].state);
}
const out = { secs: +(total + m.clock).toFixed(1), lockups, pairedMoves: moves, moves: moveLog, frozenBreaks, offFrameDmg, pops, hp: m.w.map((w) => w.hp), over: m.over, how: m.how };
console.log(JSON.stringify(out));
const ok = lockups >= 4 && moves >= 3 && !frozenBreaks && !offFrameDmg && !pops;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
