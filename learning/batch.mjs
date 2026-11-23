// Learning proof: headless matches of game/shared/sim.js against bot "humans", memory ON vs OFF.
//
//   node learning/batch.mjs [--reps 40] [--series 20] [--out learning/results.csv]
//
// Metric (docs/PLAN.md, declared before this run): counter rate = share of the human's moves that the AI met with
// the move that beats it (block beats strike, strike beats grapple, grapple beats block), per match.
// "Met with" = the AI's move start nearest in time to the human's move start, within [-0.3 s, +0.5 s]. A human move
// with no AI move in that window counts as not countered (denominator = every move the human started).
//
// Memory ON: the sim's habit counts (m.habits) carry from match to match within a series, as the Bruin habits mart
// would. Memory OFF: habits start empty every match (the AI still counts in-match). Same seeds in both conditions.
import { createMatch, step, newControl, situationOf } from '../game/shared/sim.js';
import { mulberry32 } from '../game/shared/ai.js';
import { writeFileSync } from 'node:fs';

export const BEATS = { strike: 'block', grapple: 'strike', block: 'grapple' }; // human move -> the AI move that beats it
const MOVES3 = ['strike', 'grapple', 'block'];
const BUSY = ['wind', 'active', 'rec', 'stun', 'down', 'thrown', 'taunt', 'pinning', 'pinned', 'out', 'intro'];
const DT = 1 / 30, MAX_SECS = 90, WIN_BEFORE = 0.3, WIN_AFTER = 0.5;

// Persona = probability of [strike, grapple, block] per context. Contexts are the sim's situations plus 'hit' (the
// bot was struck or thrown in the last 1.5 s), which the AI does not model: a realistic habit it cannot see directly.
const STRIKER = { opening: [0.7, 0.15, 0.15], after_block: [0.5, 0.3, 0.2], cornered: [0.6, 0.2, 0.2], low_stamina: [0.3, 0.1, 0.6] };
const GRAPPLER = { opening: [0.2, 0.65, 0.15], after_block: [0.2, 0.6, 0.2], cornered: [0.15, 0.75, 0.1], low_stamina: [0.3, 0.3, 0.4] };
const TURTLE = { opening: [0.25, 0.2, 0.55], after_block: [0.3, 0.4, 0.3], cornered: [0.2, 0.2, 0.6], low_stamina: [0.15, 0.05, 0.8], hit: [0.1, 0.1, 0.8] };
export const PERSONAS = {
  striker: () => STRIKER,
  turtle: () => TURTLE,
  grappler: () => GRAPPLER,
  switcher: (k, K) => (k < K / 2 ? STRIKER : GRAPPLER), // striker for the first half of the series, then grappler
};
const NOISE = 0.1; // share of picks that are uniform random (a human's sloppiness)

function pick(table, ctx, r) {
  if (r() < NOISE) return MOVES3[Math.floor(r() * 3)];
  const p = table[ctx] || table.opening, x = r();
  return x < p[0] ? 'strike' : x < p[0] + p[1] ? 'grapple' : 'block';
}

// One bot "human" in slot 0: walk in, then press a move about 1.8 times a second when free; hold blocks 0.3-0.8 s;
// pin a downed AI; mash to kick out of pins.
function botStep(m, ctl, table, b) {
  const me = m.w[0], ai = m.w[1], r = b.r;
  if (['stun', 'thrown'].includes(me.state)) b.hitAt = m.clock;
  ctl.mx = 0; ctl.mz = 0;
  if (m.pin?.victim === 0) { if (r() < DT * 7) ctl.queue.push('grapple'); return; }
  if (me.state === 'block') { b.hold -= DT; if (b.hold <= 0) ctl.queue.push('blockUp'); return; }
  if (BUSY.includes(me.state)) return;
  const d = Math.hypot(me.x - ai.x, me.z - ai.z);
  if (ai.state === 'down') {
    if (d < 1.4) { if (r() < DT * 3) ctl.queue.push('grapple'); } else { ctl.mx = ai.x - me.x; ctl.mz = ai.z - me.z; }
    return;
  }
  if (d > 1.25) { ctl.mx = ai.x - me.x + (r() - 0.5); ctl.mz = ai.z - me.z + (r() - 0.5); return; }
  if (r() > DT * 1.8) return;
  const ctx = m.clock - (b.hitAt ?? -99) < 1.5 && table.hit ? 'hit' : situationOf(m);
  const mv = pick(table, ctx, r);
  if (mv === 'block') b.hold = 0.3 + r() * 0.5;
  ctl.queue.push(mv);
}

// Move starts this step: entering 'wind' (strike/grapple/finisher) or 'block'.
function starts(prev, m) {
  const out = [];
  m.w.forEach((w, i) => {
    if (w.state === 'wind' && prev[i] !== 'wind') out.push({ i, t: m.clock, move: w.move === 'finisher' ? 'grapple' : w.move });
    if (w.state === 'block' && prev[i] !== 'block') out.push({ i, t: m.clock, move: 'block' });
  });
  return out;
}

// Score one match from its move-start log. Also the shuffle baseline: the counter rate the AI would get if its
// engaged answers were dealt at random from its own move mix (chance given marginals; 1/3 for a uniform AI).
export function score(log) {
  const hum = log.filter((s) => s.i === 0), ai = log.filter((s) => s.i === 1);
  let countered = 0, engaged = 0;
  const hMix = { strike: 0, grapple: 0, block: 0 }, aMix = { strike: 0, grapple: 0, block: 0 };
  for (const h of hum) {
    let best = null;
    for (const a of ai) {
      const dt = a.t - h.t;
      if (dt < -WIN_BEFORE || dt > WIN_AFTER) continue;
      if (!best || Math.abs(dt) < Math.abs(best.t - h.t)) best = a;
    }
    if (!best) continue;
    engaged++; hMix[h.move]++; aMix[best.move]++;
    if (best.move === BEATS[h.move]) countered++;
  }
  const chance = engaged ? MOVES3.reduce((s, mv) => s + (hMix[mv] / engaged) * (aMix[BEATS[mv]] / engaged), 0) : 0;
  return { human_moves: hum.length, ai_moves: ai.length, engaged, countered, chance_engaged: chance };
}

// extPlanner(m) -> optional async hook called every 4 s of match time (LLM spot check); returns {intent, expect}.
export async function runMatch({ seed, habits, table, extPlanner = null }) {
  const m = createMatch('vex', 'mae', habits);
  m.seed = seed;
  const realRandom = Math.random;
  Math.random = mulberry32(seed ^ 0x9e3779b9); // the sim's pin kickout roll; restored below
  const ctl = [newControl(true), newControl(false)];
  const b = { r: mulberry32(seed ^ 0x51ed27), hold: 0, hitAt: null };
  const log = [], lat = [];
  let pending = null, nextPlan = 0;
  try {
    while (!m.over && m.clock < MAX_SECS) {
      const prev = m.w.map((w) => w.state);
      if (m.introT <= 0) botStep(m, ctl[0], table, b);
      if (extPlanner && m.introT <= 0 && m.clock >= nextPlan) {
        nextPlan = m.clock + 4;
        const t0 = performance.now(), plan = await extPlanner(m);
        const ms = performance.now() - t0;
        lat.push(ms);
        // The live game keeps running while the request is in flight: apply the plan that much later in match time.
        if (plan) pending = { ...plan, applyAt: m.clock + ms / 1000 };
      }
      if (pending && m.clock >= pending.applyAt) { m.extPlan = { intent: pending.intent, expect: pending.expect, at: m.clock }; pending = null; }
      step(m, DT, ctl);
      m.events.length = 0;
      log.push(...starts(prev, m));
    }
  } finally { Math.random = realRandom; }
  return { m, ...score(log), winner: m.over ? (m.winner === 1 ? 'ai' : 'human') : 'timeout', secs: +m.clock.toFixed(1), lat };
}

const seedOf = (persona, rep, k) => {
  let h = 2166136261;
  for (const c of `${persona}|${rep}|${k}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) || 1;
};

export async function runSeries(persona, condition, rep, K) {
  const rows = [];
  let habits = null;
  for (let k = 0; k < K; k++) {
    const seed = seedOf(persona, rep, k);
    const r = await runMatch({ seed, habits: condition === 'on' ? habits : null, table: PERSONAS[persona](k, K) });
    habits = r.m.habits; // normHabits copies it into the next match, so the carry is by value
    rows.push({ persona, condition, rep, match: k + 1, seed, human_moves: r.human_moves, ai_moves: r.ai_moves, engaged: r.engaged,
      countered: r.countered, counter_rate: r.human_moves ? r.countered / r.human_moves : 0,
      counter_rate_engaged: r.engaged ? r.countered / r.engaged : 0, chance_engaged: r.chance_engaged, winner: r.winner, secs: r.secs });
  }
  return rows;
}

const COLS = ['persona', 'condition', 'rep', 'match', 'seed', 'human_moves', 'ai_moves', 'engaged', 'countered', 'counter_rate',
  'counter_rate_engaged', 'chance_engaged', 'winner', 'secs'];
export const toCsv = (rows) => [COLS.join(','), ...rows.map((r) => COLS.map((c) => (typeof r[c] === 'number' && !Number.isInteger(r[c]) ? r[c].toFixed(4) : r[c])).join(','))].join('\n') + '\n';

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const R = +arg('reps', 40), K = +arg('series', 20), out = arg('out', 'learning/results.csv');
  const t0 = Date.now(), rows = [];
  for (const persona of Object.keys(PERSONAS)) {
    for (const condition of ['off', 'on']) for (let rep = 0; rep < R; rep++) rows.push(...await runSeries(persona, condition, rep, K));
    console.error(`${persona} done, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  writeFileSync(out, toCsv(rows));
  console.error(`${rows.length} matches (${R} series x ${K} matches x ${Object.keys(PERSONAS).length} personas x 2 conditions) -> ${out} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
