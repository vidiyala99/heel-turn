// Liveness: 60 s matches per plan attitude with an idle human. Reports the AI's longest stretch standing still
// (no displacement and no action) and actions per minute. Target: max stillness < 1 s.
import { createMatch, step, newControl } from '../shared/sim.js';
let worstStill = 0; const rows = [];
for (const plan of ['counter:strike', 'counter:block', 'target', 'taunt', 'ally', null]) {
  const m = createMatch('vex', 'kane'); m.seed = 42; const ctl = [newControl(true), newControl(false)];
  let still = 0, maxStill = 0, actions = 0, landed = 0, downs = 0, secs = 0;
  let px = null, pz = null;
  for (let f = 0; f < 30 * 63 && !m.over; f++) {
    const dt = 1 / 30;
    if (plan) { const [intent, expect] = plan.split(':'); m.extPlan = { intent, expect, at: m.clock }; }
    if (m.pin && m.pin.victim === 0) ctl[0].queue.push('grapple'); // the human only mashes out of pins
    m.w[0].hp = Math.max(m.w[0].hp, 45); // keep the human in the match for the full minute
    step(m, dt, ctl);
    const ai = m.w[1];
    for (const e of m.events) {
      if (e.k === 'fact' && e.actor === 1 && ['strike', 'grapple', 'block', 'taunt'].includes(e.kind)) { actions++; if (e.success) landed++; }
      if (e.k === 'fact' && e.kind === 'knockdown' && e.target === 0) downs++;
    }
    m.events = [];
    if (m.introT > 0) continue;
    secs += dt;
    const moved = px === null ? 1 : Math.hypot(ai.x - px, ai.z - pz);
    px = ai.x; pz = ai.z;
    if (moved < 0.002 && ai.state === 'idle') { still += dt; maxStill = Math.max(maxStill, still); } else still = 0;
  }
  const apm = Math.round(actions / (secs / 60));
  rows.push(`${(plan || 'scripted').padEnd(15)} ran ${secs.toFixed(0)}s  max still ${maxStill.toFixed(2)}s  actions/min ${apm}  landed ${landed}  human downs ${downs}  ${m.over ? 'ended ' + m.how : ''}`);
  worstStill = Math.max(worstStill, maxStill);
}
console.log(rows.join('\n'));
console.log(worstStill < 1 ? `PASS max stillness ${worstStill.toFixed(2)}s` : `FAIL max stillness ${worstStill.toFixed(2)}s`);
process.exit(worstStill < 1 ? 0 : 1);
