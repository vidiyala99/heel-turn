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

const a = run('approve'), b = run('block');
console.log(JSON.stringify(a, null, 1)); console.log(JSON.stringify(b, null, 1));
const checks = [
  ['5 wrestlers entered (approve run)', a.entered === 5],
  ['alliance on the human', !!a.alliance && a.alliance.endsWith('kane')],
  ['approve: betrayal toss eliminates the partner', !!a.betrayal && a.elims.some((x) => x.startsWith('vex by silas'))],
  ['approve: Lou takes the envelope', a.bribe === 'accept'],
  ['block: no betrayal', !b.betrayal],
  ['block: Lou refuses', b.bribe === 'decline'],
  ['both runs end with a winner', !!a.winner && !!b.winner],
];
let bad = 0;
for (const [name, ok] of checks) { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) bad++; }
process.exit(bad ? 1 : 0);
