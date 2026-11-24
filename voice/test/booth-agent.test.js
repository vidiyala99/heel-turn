import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoothAgents, parseReply } from '../booth-agent.js';
import { HITS } from '../lines.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('reply tags parse into ref + text, [pass] means silence', () => {
  assert.deepEqual(parseReply('[plan:silas] Crane keeps looking at Lou.'), { ref: 'plan:silas', text: 'Crane keeps looking at Lou.' });
  assert.deepEqual(parseReply('Untagged line.'), { ref: 'free', text: 'Untagged line.' });
  assert.equal(parseReply('[pass]'), null);
  assert.equal(parseReply('  '), null);
});

test('the agents alternate and answer each other, seeing plans, memory and the transcript', async () => {
  const briefs = [], spoken = [];
  const booth = createBoothAgents({
    cadenceMs: 40,
    generate: async ({ speaker, brief }) => { briefs.push({ speaker, brief }); return speaker === 'rex' ? '[plan:silas] Crane is eyeing Lou!' : '[rex] Relax, Rex.'; },
    say: async (l) => { spoken.push(l); await sleep(5); },
  });
  booth.setMemory({ grudge: { who: 'silas', about: 'kane', grudge: 3 } });
  booth.onPlan({ wrestler: 'silas', intent: 'bribe_ref', target: 'lou', reason: 'Lou owes me' });
  booth.start(); await sleep(1000); booth.stop();
  assert.ok(spoken.length >= 3);
  assert.deepEqual(spoken.slice(0, 3).map(l => l.speaker), ['rex', 'dot', 'rex']);
  assert.ok(spoken.every(l => l.source === 'llm' && l.ref));
  const dotBrief = briefs.find(b => b.speaker === 'dot').brief;
  assert.equal(dotBrief.wrestler_plans[0].reason, 'Lou owes me');
  assert.equal(dotBrief.bruin_memory.grudge.about, 'kane');
  assert.match(dotBrief.booth_so_far.join('\n'), /Rex Ramsey: Crane is eyeing Lou!/);
});

test('only instant hit reactions come from the bank', async () => {
  const spoken = [];
  const booth = createBoothAgents({ generate: async () => '[pass]', say: async (l) => { spoken.push(l); }, rng: () => 0 });
  booth.onEvent({ kind: 'grapple', actor: 'kane', target: 'vex' });
  await sleep(20);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].source, 'bank');
  assert.ok(HITS.grapple.includes(spoken[0].text));
  assert.ok(spoken[0].text.split(/\s+/).length <= 2);
});

test('a scheme line written before a betrayal is dropped as stale; the betrayal call is generated', async () => {
  const spoken = [], dropped = [];
  let release;
  const gate = new Promise(r => { release = r; });
  const booth = createBoothAgents({
    rng: () => 0.99,
    generate: async ({ brief }) => {
      if (!brief.just_happened.length) { await gate; return '[plan:silas] Crane is up to something.'; }
      return '[event:betray] Crane turns on Kane!';
    },
    say: async (l) => { spoken.push(l); await sleep(5); },
    onDrop: (l, why) => dropped.push([l.text, why]),
  });
  booth.start(); booth.stop();         // one thought in flight, written before the betrayal
  booth.onEvent({ kind: 'betray', actor: 'silas', target: 'kane' });
  release();
  await sleep(600);
  assert.ok(dropped.some(([t, why]) => /up to something/.test(t) && /stale|outranked/.test(why)));
  assert.ok(spoken.some(l => l.source === 'llm' && l.ref === 'event:betray'));
  assert.ok(!spoken.some(l => /up to something/.test(l.text)));
});
