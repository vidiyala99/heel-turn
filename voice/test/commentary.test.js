import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommentary, createBag } from '../commentary.js';
import { CALLS } from '../lines.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('bag never repeats back to back, across reshuffles', () => {
  const draw = createBag();
  const items = ['a', 'b', 'c', 'd'];
  let prev = null;
  for (let i = 0; i < 400; i++) { const x = draw('k', items); assert.notEqual(x, prev); prev = x; }
});

test('every bank line is used before any repeats', () => {
  const draw = createBag();
  const bank = CALLS.strike.rex;
  const seen = new Set(Array.from({ length: bank.length }, () => draw('s', bank)));
  assert.equal(seen.size, bank.length);
});

test('one voice at a time, bursts are dropped not queued', async () => {
  let talking = 0, maxTalking = 0;
  const spoken = [];
  const booth = createCommentary({
    say: async (l) => { talking++; maxTalking = Math.max(maxTalking, talking); spoken.push(l); await sleep(30); talking--; },
    rng: () => 0.99, // no optional Dot follow-ups
  });
  for (let i = 0; i < 10; i++) booth.onEvent({ kind: 'strike', actor: 'kane', target: 'vex' });
  await sleep(800);
  assert.equal(maxTalking, 1);
  assert.equal(spoken.length, 2, `spoke ${spoken.length} of 10 burst strikes`);
  assert.equal(booth.stats.dropped, 8);
});

test('a betrayal outranks queued strikes and brings Dot plus the betrayer', async () => {
  const spoken = [];
  const booth = createCommentary({ say: async (l) => { spoken.push(l); await sleep(20); }, rng: () => 0.99 });
  booth.onEvent({ kind: 'strike', actor: 'kane', target: 'vex' });
  booth.onEvent({ kind: 'strike', actor: 'kane', target: 'vex' });
  booth.onEvent({ kind: 'strike', actor: 'kane', target: 'vex' });
  booth.onEvent({ kind: 'betray', actor: 'silas', target: 'kane' });
  await sleep(3000);
  const speakers = spoken.map(l => l.speaker);
  assert.equal(speakers[0], 'rex');                 // first strike was already playing
  assert.deepEqual(speakers.slice(1, 3), ['rex', 'dot']); // then the betrayal call and Dot jump the strikes
  assert.match(spoken[1].text, /Silas Crane|alliance|partner|could you/i);
  assert.equal(speakers[3], 'silas');
  assert.ok(!speakers.slice(1, 4).includes('kane'));
});

test('big moments use the LLM line when it answers in time, template otherwise', async () => {
  const spoken = [];
  const fast = createCommentary({ say: async (l) => { spoken.push(l); }, llm: '/x',
    fetchImpl: async () => ({ ok: true, json: async () => ({ text: 'Crane just cashed a very old check.' }) }) });
  fast.onEvent({ kind: 'elimination', actor: 'silas', target: 'kane' });
  await sleep(1300);
  assert.deepEqual(spoken.find(l => l.speaker === 'dot'), { ...spoken.find(l => l.speaker === 'dot'), source: 'llm', text: 'Crane just cashed a very old check.' });

  const spoken2 = [];
  const down = createCommentary({ say: async (l) => { spoken2.push(l); }, llm: '/x', fetchImpl: async () => { throw new Error('offline'); } });
  down.onEvent({ kind: 'elimination', actor: 'silas', target: 'kane' });
  await sleep(1300);
  assert.equal(spoken2.find(l => l.speaker === 'dot').source, 'template');
});

test('taunts speak in the wrestler voice; failed moves stay silent', async () => {
  const spoken = [];
  const booth = createCommentary({ say: async (l) => { spoken.push(l); } });
  booth.onEvent({ kind: 'taunt', actor: 'mae' });
  booth.onEvent({ kind: 'strike', actor: 'kane', target: 'vex', success: false });
  await sleep(300);
  assert.deepEqual(spoken.map(l => l.speaker), ['mae']);
});

test('named moves are called by name; Dot answers 0.4 to 1 s after Rex ends', async () => {
  const spoken = [];
  const t0 = performance.now();
  const booth = createCommentary({ say: async (l) => { spoken.push({ ...l, t: performance.now() - t0 }); await sleep(100); }, rng: () => 0.5 });
  booth.onEvent({ kind: 'grapple', move: 'suplex', actor: 'kane', target: 'vex', finisher: false });
  booth.onEvent({ kind: 'finisher', actor: 'silas', target: 'mae' });
  await sleep(2500);
  const rex = spoken.filter(l => l.speaker === 'rex'), dot = spoken.find(l => l.speaker === 'dot');
  assert.ok(rex.some(l => /suplex/i.test(l.text)), rex.map(l => l.text).join(' | '));
  const prev = spoken[spoken.indexOf(dot) - 1];
  const gap = dot.t - (prev.t + 100);
  assert.ok(gap >= 380 && gap <= 1100, `Dot reacted after ${gap.toFixed(0)} ms`);
});

test('lines that cannot start within 2 s of their cue are dropped, not spoken late', async () => {
  const spoken = [];
  const booth = createCommentary({ say: async (l) => { spoken.push(l); await sleep(2300); }, rng: () => 0.99 });
  booth.onEvent({ kind: 'pin', actor: 'kane', target: 'vex' });   // speaks for 2.3 s
  booth.onEvent({ kind: 'kickout', actor: 'vex', target: 'kane' }); // queued, but 2.3 s old by then
  await sleep(2700);
  assert.equal(spoken.length, 1);
  assert.equal(booth.stats.dropped, 1);
});
