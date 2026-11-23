// Pin guard: 200 seeded matches, the human (slot 0) does nothing for the first 10 s after the bell.
// Asserts no pin starts before the first knockdown and none in the first 8 s (sim.PIN_GRACE).
// Half the matches carry an LLM plan with intent "pin" from the bell, which must still wait for a knockdown.
// Run: node game/tools/pin-guard-check.mjs
import { createMatch, step, newControl, INTRO_SECS } from '../shared/sim.js';

const N = 200, DT = 1 / 30, WATCH = 10;
let early = 0, beforeKd = 0, pins = 0, kds = 0;
for (let s = 0; s < N; s++) {
  const m = createMatch('vex', ['kane', 'silas', 'mae'][s % 3]);
  m.seed = s + 1;
  const ctl = [newControl(true), newControl(false)];
  let kdAt = null;
  for (let t = 0; t < INTRO_SECS + WATCH && !m.over; t += DT) {
    if (s % 2 && m.introT <= 0) m.extPlan = { intent: 'pin', target: 'vex', at: m.clock };
    step(m, DT, ctl);
    for (const e of m.events) {
      if (e.k !== 'fact') continue;
      if (e.kind === 'knockdown' && kdAt === null) { kdAt = e.t_ms; kds++; }
      if (e.kind === 'pin') {
        pins++;
        if (e.t_ms < 8000) { early++; console.log(`seed ${s + 1}: pin at ${e.t_ms} ms`); }
        if (kdAt === null) { beforeKd++; console.log(`seed ${s + 1}: pin before any knockdown at ${e.t_ms} ms`); }
      }
    }
    m.events = [];
  }
}
console.log(`${N} matches, human idle ${WATCH} s: ${kds} with a knockdown, ${pins} pins, ${early} pins before 8 s, ${beforeKd} pins before a knockdown`);
if (early || beforeKd) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
