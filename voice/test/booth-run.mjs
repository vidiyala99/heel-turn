// 60 s scripted match feed through booth-agent.js with the real LLM, via the real voice server endpoint.
//   node --env-file-if-exists=.env voice/test/booth-run.mjs [seconds=60] > docs/lanes/booth-agents-run.txt
// Speech takes a reading-speed estimate (no audio). Prints the transcript, drops, and the numbers.
import { createServer } from '../server.js';
import { createBoothAgents, viaLineEndpoint } from '../booth-agent.js';

if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1); }
const SECS = Number(process.argv[2] || 60);
const server = createServer().listen(0);
await new Promise(r => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/voice/api/line`;

// t (s), then an event { kind, actor, target } or a plan { wrestler, intent, target, reason }
const FEED = [
  [0, { kind: 'bell' }],
  [1, { plan: { wrestler: 'silas', intent: 'ally', target: 'kane', reason: 'Kane is the biggest body here; I use him until Mae is gone' } }],
  [2, { kind: 'strike', actor: 'mae', target: 'vex' }],
  [3, { kind: 'strike', actor: 'vex', target: 'mae' }],
  [5, { kind: 'alliance', actor: 'silas', target: 'kane' }],
  [6, { plan: { wrestler: 'kane', intent: 'attack', target: 'mae', reason: 'Crane says Mae first. Fine. Mae first.' } }],
  [8, { kind: 'grapple', actor: 'kane', target: 'mae' }],
  [10, { kind: 'strike', actor: 'mae', target: 'kane' }],
  [12, { plan: { wrestler: 'silas', intent: 'bribe_ref', target: 'lou', reason: 'Lou\'s ledger says he took my envelope twice; a fast count wins this' } }],
  [13, { kind: 'strike', actor: 'silas', target: 'vex' }],
  [16, { plan: { wrestler: 'vex', intent: 'showboat', target: null, reason: 'the cameras are on me; taunt, then hit Crane while he schemes' } }],
  [17, { kind: 'taunt', actor: 'vex' }],
  [19, { kind: 'reversal', actor: 'mae', target: 'kane' }],
  [21, { kind: 'bribe', actor: 'silas', target: 'lou' }],
  [21.5, { plan: { wrestler: 'lou', intent: 'count_fast', target: 'silas', reason: 'commissioner approved Crane\'s envelope' } }],
  [24, { kind: 'grapple', actor: 'mae', target: 'vex' }],
  [26, { kind: 'pin', actor: 'mae', target: 'vex' }],
  [27, { kind: 'kickout', actor: 'vex', target: 'mae' }],
  [29, { plan: { wrestler: 'silas', intent: 'betray', target: 'kane', reason: 'Kane is tired at 30% stamina; he is worth more to me eliminated' } }],
  [31, { kind: 'strike', actor: 'kane', target: 'vex' }],
  [33, { kind: 'grapple', actor: 'kane', target: 'vex' }],
  [35, { kind: 'betray', actor: 'silas', target: 'kane' }],
  [36, { kind: 'elimination', actor: 'silas', target: 'kane' }],
  [39, { plan: { wrestler: 'mae', intent: 'attack', target: 'silas', reason: 'grudge 4 with Crane from last week; he is next' } }],
  [40, { kind: 'strike', actor: 'mae', target: 'silas' }],
  [42, { kind: 'strike', actor: 'silas', target: 'mae' }],
  [44, { plan: { wrestler: 'vex', intent: 'ally', target: 'mae', reason: 'Crane is the threat now; side with the old lady for a minute' } }],
  [46, { kind: 'alliance', actor: 'vex', target: 'mae' }],
  [48, { kind: 'grapple', actor: 'mae', target: 'silas' }],
  [50, { kind: 'finisher', actor: 'mae', target: 'silas' }],
  [51, { kind: 'pin', actor: 'mae', target: 'silas' }],
  [52, { plan: { wrestler: 'lou', intent: 'count_slow', target: 'mae', reason: 'Crane paid; slow count for Mae' } }],
  [54, { kind: 'kickout', actor: 'silas', target: 'mae' }],
  [56, { kind: 'strike', actor: 'vex', target: 'silas' }],
  [58, { kind: 'elimination', actor: 'mae', target: 'silas' }],
];

const t0 = performance.now(), T = () => ((performance.now() - t0) / 1000).toFixed(1).padStart(5);
const out = [];
const booth = createBoothAgents({
  generate: viaLineEndpoint(url),
  say: (l) => new Promise(r => setTimeout(r, 600 + l.text.split(/\s+/).length * 330)),
  onLine: (l) => out.push(`${T()}s  ${l.speaker.toUpperCase().padEnd(3)} ${l.source === 'llm' ? `(LLM ${l.ms} ms, re ${l.ref})` : '(bank)'}  ${l.text}`),
  onDrop: (l, why) => out.push(`${T()}s  -- dropped ${l.speaker} (${why}): ${l.text}`),
});
booth.setMemory({ grudge: { who: 'mae', about: 'silas', trust: -2, grudge: 4, last_betrayal: 'match 41' }, habits: 'the challenger grapples 62% of the time when cornered' });
booth.start();
for (const [t, x] of FEED) {
  await new Promise(r => setTimeout(r, Math.max(0, t * 1000 - (performance.now() - t0))));
  if (x.plan) { booth.onPlan(x.plan); out.push(`${T()}s  >> plan ${x.plan.wrestler}: ${x.plan.intent} ${x.plan.target ?? ''} "${x.plan.reason}"`); }
  else { booth.onEvent(x); out.push(`${T()}s  >> ${x.kind} ${x.actor ?? ''} ${x.target ?? ''}`); }
}
await new Promise(r => setTimeout(r, Math.max(0, SECS * 1000 - (performance.now() - t0))));
booth.stop();
await new Promise(r => setTimeout(r, 4000));
server.close();

const s = booth.stats, total = s.spoken.llm + s.spoken.bank, ms = [...s.ms].sort((a, b) => a - b);
console.log(out.join('\n'));
console.log(`\nspoken ${total}: generated ${s.spoken.llm} (${Math.round(100 * s.spoken.llm / total)}%), bank ${s.spoken.bank} (${Math.round(100 * s.spoken.bank / total)}%)`);
console.log(`generations ${ms.length}: lines ${s.generated}, passed ${s.passed}, failed ${s.failed}, dropped ${s.dropped}`);
console.log(`latency ms: p50 ${ms[Math.floor(ms.length / 2)]}, min ${ms[0]}, max ${ms.at(-1)}`);
