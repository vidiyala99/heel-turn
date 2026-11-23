// Rope-break check: node game/tools/rope_check.mjs
// A 1v1 pin with the victim under the ropes is broken (count stops, attacker lets go, rope_break fact); the same pin
// mid-ring keeps counting; with a bribed Lou (m.refBribed) the rope break is missed and the count goes on.
import { createMatch, step, newControl, RING } from '../shared/sim.js';

function pinAt(x, bribed) {
  const m = createMatch('vex', 'kane');
  m.introT = 0; m.clock = 10; m.refBribed = bribed; // past the pin grace period
  const [A, B] = m.w;
  for (const w of m.w) { w.state = 'idle'; }
  B.x = x; B.z = 0; A.x = x - 0.6; A.z = 0; B.state = 'down'; B.t = 5; B.hp = 5;
  const ctl = [newControl(true), newControl(false)];
  ctl[0].queue.push('grapple'); // cover
  const seen = [];
  for (let n = 0; n < 30 * 2; n++) {
    step(m, 1 / 30, ctl);
    for (const e of m.events) if (e.k === 'rope_break' || (e.k === 'fact' && e.kind === 'rope_break') || e.k === 'pincount') seen.push(e.k === 'fact' ? 'fact:rope_break' : e.k === 'pincount' ? `count${e.n}` : `rope_break${e.missed ? ':missed' : ''}`);
    m.events = [];
  }
  return { pinned: !!m.pin, seen };
}
const ropes = pinAt(RING - 0.36, false), mid = pinAt(0.5, false), bribed = pinAt(RING - 0.36, true);
console.log({ ropes, mid, bribed });
const checks = [
  ['under the ropes: count stopped, rope_break fact', !ropes.pinned && ropes.seen.includes('fact:rope_break')],
  ['mid-ring: still counting, no rope break', mid.pinned || mid.seen.some((s) => s.startsWith('count')) && !mid.seen.some((s) => s.startsWith('rope'))],
  ['bribed Lou misses it and keeps counting', bribed.seen.includes('rope_break:missed') && !bribed.seen.includes('fact:rope_break') && (bribed.pinned || bribed.seen.includes('count1'))],
];
let bad = 0;
for (const [n, ok] of checks) { console.log(ok ? 'PASS' : 'FAIL', n); if (!ok) bad++; }
process.exit(bad ? 1 : 0);
