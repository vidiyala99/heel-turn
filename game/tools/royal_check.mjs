// Headless OVER THE TOP check: node game/tools/royal_check.mjs
// Runs the same seeded battle royal twice: the commissioner approves every proposal, then blocks every one.
// Exits 1 unless: 5 wrestlers enter, an alliance forms on a human, approve -> the betrayer tosses his partner (an
// AI-caused elimination) and Lou looks away; block -> no betrayal elimination and Lou refuses; both end with a winner.
import { createRoyal, stepRoyal, verdict } from '../shared/royal.js';
import { newControl } from '../shared/sim.js';

const TRACE = process.argv.includes('--trace');
function run(decision, seed = 4242) {
  const m = createRoyal({ humans: ['kane'], seed });
  // the human slot plays itself (scripted), so the run is headless and repeatable
  const ctl = m.w.map(() => newControl(false));
  const out = { decision, entered: 0, alliance: null, betrayal: null, bribe: null, verdicts: [], elims: [], winner: null, secs: 0 };
  for (let n = 0; n < 30 * 240 && !m.over; n++) {
    stepRoyal(m, 1 / 30, ctl);
    if (TRACE && n % 150 === 0) console.log(m.clock.toFixed(1), m.w.map((w) => `${w.id}:${w.hp | 0}:${w.state}:${w.foe}`).join(' '));
    for (const e of m.events) {
      if (TRACE && ['alliance', 'proposal', 'betrayal', 'eliminated', 'agent', 'verdict'].includes(e.k)) console.log(m.clock.toFixed(1), e.k, JSON.stringify(e.row || e).slice(0, 170));
      if (e.k === 'fact' && e.kind === 'entry') out.entered++;
      if (e.k === 'alliance') out.alliance = `${m.w[e.a].id}+${m.w[e.b].id} -> ${m.w[e.target].id}`;
      if (e.k === 'proposal') { const p = m.proposals.find((x) => x.id === e.id); out.verdicts.push(`${e.id}: ${p.reason}`); verdict(m, e.id, decision); }
      if (e.k === 'betrayal') out.betrayal = `${m.w[e.by].id} tossed ${m.w[e.on].id} at ${m.clock.toFixed(1)}s`;
      if (e.k === 'bribe') out.bribe = e.decision;
      if (e.k === 'eliminated') out.elims.push(`${m.w[e.slot].id} by ${m.w[e.by]?.id}`);
      if (e.k === 'end') out.winner = m.w[e.winner].id;
    }
    m.events = [];
  }
  out.secs = +m.clock.toFixed(1);
  return out;
}

// Several seeds: the fights differ run to run; the agent beats must hold in every one (the betrayal toss in most).
const SEEDS = [4242, 7, 99, 1234, 31337];
const A = SEEDS.map((s) => run('approve', s)), B = SEEDS.map((s) => run('block', s));
for (const [x, y] of A.map((a, k) => [a, B[k]])) console.log(JSON.stringify({ seed: SEEDS[A.indexOf(x)], approve: { betrayal: x.betrayal, bribe: x.bribe, elims: x.elims, winner: x.winner, secs: x.secs }, block: { betrayal: y.betrayal, bribe: y.bribe, elims: y.elims, winner: y.winner, secs: y.secs } }));
const tossed = A.filter((a) => a.betrayal && a.elims.some((x) => x.startsWith('vex by silas'))).length;
const checks = [
  ['5 wrestlers entered in every run', [...A, ...B].every((r) => r.entered === 5)],
  ['alliance on the human in every run', [...A, ...B].every((r) => r.alliance && r.alliance.endsWith('kane'))],
  [`approve: the betrayer tosses his partner (an AI-caused elimination) in ${tossed}/${A.length} runs, >= 3`, tossed >= 3],
  ['approve: Lou takes the envelope', A.every((a) => a.bribe === 'accept')],
  ['block: never a betrayal', B.every((b) => !b.betrayal)],
  ['block: Lou refuses', B.every((b) => b.bribe === 'decline')],
  ['every run ends with a winner', [...A, ...B].every((r) => !!r.winner)],
  ['approve and block change the outcome (order or winner) in most seeds', A.filter((a, k) => a.elims.join() !== B[k].elims.join()).length >= 3],
];
let bad = 0;
for (const [name, ok] of checks) { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) bad++; }
process.exit(bad ? 1 : 0);
