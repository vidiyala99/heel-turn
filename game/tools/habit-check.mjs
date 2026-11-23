// Scripted match: the player walks in and spams strike. Prints the AI's plan log lines and whiff log count.
// Exit 1 unless a plan reading "expect your strike ... answer with block" appears within ~10 recorded strikes.
import { createMatch, step, newControl } from '../shared/sim.js';
const m = createMatch('vex', 'kane');
const ctl = [newControl(true), newControl(false)];
let t = 0, strikes = 0, hit = null, whiffs = 0; const plans = [];
for (let f = 0; f < 30 * 40 && !m.over; f++) {
  const dt = 1 / 30; t += dt;
  const [a, b] = m.w; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
  ctl[0].mx = d > 1.1 ? dx / d : 0; ctl[0].mz = d > 1.1 ? dz / d : 0;
  if (f % 5 === 0) ctl[0].queue.push('strike');
  step(m, dt, ctl);
  for (const e of m.events) {
    if (e.k === 'log' && /plan:/.test(e.html)) { const s = e.html.replace(/<[^>]+>/g, ''); plans.push(`${t.toFixed(1)}s ${s}`); if (!hit && /expect your strike.*answer with block/.test(s)) hit = { t, seen: m.w[0].stats.strikes }; }
    if (e.k === 'log' && /whiffs/.test(e.html)) whiffs++;
  }
  m.events = [];
}
console.log(plans.join('\n'));
console.log('player strikes thrown:', m.w[0].stats.strikes, 'habits:', JSON.stringify(m.habits), 'whiff log lines:', whiffs);
console.log(hit ? `PASS counter plan at ${hit.t.toFixed(1)}s after ${hit.seen} strikes` : 'FAIL no counter plan');
process.exit(hit && hit.seen <= 10 ? 0 : 1);
