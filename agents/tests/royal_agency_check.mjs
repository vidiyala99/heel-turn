// node agents/tests/royal_agency_check.mjs
// The battle royal never schemes on its own: with no agents server, a full match has no proposal, betrayal or bribe.
// When the server's LLM plans a betrayal and Lou's LLM takes an envelope (pending desk proposals), adoptBand opens
// them, the commissioner's approve runs them, and every row carries the LLM's reason. Exits 1 on any failure.
import { createRoyal, stepRoyal, verdict, adoptBand } from '../../game/shared/royal.js';
import { newControl } from '../../game/shared/sim.js';

function run(seed, pendingAt) {
  const m = createRoyal({ humans: ['kane'], seed });
  const ctl = m.w.map(() => newControl(false));
  const seen = { proposals: [], betrayal: null, bribe: null, rows: [] };
  for (let n = 0; n < 30 * 240 && !m.over; n++) {
    stepRoyal(m, 1 / 30, ctl);
    if (pendingAt && Math.abs(m.clock - pendingAt.at) < 1 / 60) adoptBand(m, pendingAt.pending);
    for (const e of m.events) {
      if (e.k === 'proposal') { seen.proposals.push(e.id); verdict(m, e.id, 'approve'); }
      if (e.k === 'betrayal') seen.betrayal = `${m.w[e.by].id}>${m.w[e.on].id}`;
      if (e.k === 'bribe') seen.bribe = e.decision;
      if (e.k === 'agent' && ['betray', 'bribe_accept'].includes(e.row.intent)) seen.rows.push(e.row);
    }
    m.events = [];
  }
  return seen;
}

const LLM = {
  at: 6,
  pending: [
    { id: 'betray-1', kind: 'betray', proposer: 'silas', plan: { wrestler: 'silas', intent: 'betray', target: 'vex', reason: '[LLM] trust 0.3, he stole my pin', cites: [] } },
    { id: 'bribe-2', kind: 'bribe', proposer: 'silas', plan: { wrestler: 'lou', intent: 'bribe_accept', target: 'silas', reason: '[LLM] rent is due, nobody caught me twice', cites: [] } },
  ],
};
const seeds = [4242, 7, 99];
const quiet = seeds.map((s) => run(s, null));
const llm = seeds.map((s) => run(s, LLM));
const checks = [
  ['no server: no proposal in any match', quiet.every((q) => q.proposals.length === 0)],
  ['no server: no betrayal, no bribe', quiet.every((q) => !q.betrayal && !q.bribe)],
  ['LLM plans: both proposals opened under BAND ids', llm.every((q) => q.proposals.join() === 'betray-1,bribe-2')],
  ['LLM plans: Lou looks away after approve', llm.every((q) => q.bribe === 'accept')],
  ['LLM plans: every scheme row carries the LLM reason', llm.every((q) => q.rows.length && q.rows.some((r) => r.reason.includes('[LLM]')))],
  [`LLM plans: approved turn lands (${llm.filter((q) => q.betrayal === 'silas>vex').length}/${seeds.length})`, llm.some((q) => q.betrayal === 'silas>vex')],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
