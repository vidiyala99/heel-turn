// HEEL TURN combat simulation. Pure data, no three.js: the browser runs it for exhibition
// (offline) matches and the Colyseus server runs it at 30 Hz for online matches.
//
// Match shape:
//   { w: [Wrestler, Wrestler], over, winner, how, pin, introT, events: [Event], habits, ... }
// Wrestler: position x/y/z, velocity vx/vz, facing, rotX (fall tilt), hp, st (stamina), mo (meter),
//   state, t (state timer), move, anim/animSpeed/animSeq (renderer hint), stats.
// Events (drained by the caller each step): banner, call, log, shake, finisher, wobble, bell, end, and
// fact: { k: 'fact', t_ms, kind, actor: slot, target: slot|null, situation, success? } in the docs/PLAN.md
// event vocabulary (the caller maps slots to roster ids and sends facts to Bruin, the booth and the agents).
// Situations (Bruin stg_events): opening | after_block | low_stamina | cornered, read off the human in slot 0.
// Control per slot: { human, mx, mz, run, queue: ['strike'|'grapple'|'block'|'blockUp'|'taunt'|'whip'] }.
// Feel (hitstop, run, whip, heat, fired up, near-falls) lives in shared/drama.js; its numbers in shared/tuning.js.

import { T } from './tuning.js';
import { preStep, moveSpeed, onHit, impact, whip, pinStep } from './drama.js';

import { think } from './ai.js';
import { tryLockup, pairInput, aiPair, pairStep } from './pair.js';

export const RING = 3.2;
export const MAT_Y = 1.1;
export const INTRO_SECS = 3;
export const ROSTER = {
  vex: { name: 'Vex "The Voltage"', tint: 0x2b8cff },
  kane: { name: 'Brutus Kane', tint: 0xe8333b },
  silas: { name: 'Silas Crane', tint: 0x8b5cf6 },
  mae: { name: 'Old Iron Mae', tint: 0xc0c6cf },
};
export const INPUTS = ['strike', 'grapple', 'block', 'blockUp', 'taunt', 'whip'];
const MOVES = T.sim.moves;
const COUNTER = { strike: 'block', grapple: 'strike', block: 'grapple' };
export const SITUATIONS = ['opening', 'after_block', 'low_stamina', 'cornered'];
const BUSY = ['wind', 'active', 'rec', 'stun', 'down', 'thrown', 'taunt', 'pinning', 'pinned', 'out', 'intro', 'whipped', 'rebound', 'paired', 'getup'];

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function makeWrestler(id, x) {
  const r = ROSTER[id] || ROSTER.vex;
  return {
    id: ROSTER[id] ? id : 'vex', name: r.name, tint: r.tint,
    x, y: MAT_Y, z: 0, vx: 0, vz: 0, facing: x < 0 ? Math.PI / 2 : -Math.PI / 2, rotX: 0,
    hp: 100, st: 100, mo: 0, state: 'intro', t: 0, move: null, out: false, autoBlock: false, arc: null,
    anim: 'Idle', animSpeed: 1, animSeq: 0,
    stats: { strikes: 0, grapples: 0, blocks: 0, reversals: 0 },
  };
}

// opts.committed (exhibition): grapples go through the lock-up and committed paired moves in shared/pair.js.
export function createMatch(p1 = 'vex', p2 = 'kane', habits = null, opts = {}) {
  const m = {
    w: [makeWrestler(p1, -1.6), makeWrestler(p2, 1.6)],
    over: false, winner: -1, how: null, pin: null, introT: INTRO_SECS, events: [],
    habits: normHabits(habits), clock: 0, blockT: 0, seed: (Date.now() % 100000) + 1,
    aiPlanT: 3, aiIntent: 'pressure', aiPlansLog: [], committed: !!opts.committed, pair: null,
  };
  emit(m, { k: 'call', text: `${m.w[0].name} and ${m.w[1].name} make their way to the ring.` });
  return m;
}

// habits[situation][move] = times the human in slot 0 started that move there (a Laplace 1 per cell).
export function normHabits(h) {
  const out = {};
  for (const s of SITUATIONS) out[s] = { strike: 1, grapple: 1, block: 1, ...(h && h[s]) };
  return out;
}
export function situationOf(m) {
  const w = m.w[0];
  if (w.st < 30) return 'low_stamina';
  if (nearRopes(w)) return 'cornered';
  if (m.blockT > 0) return 'after_block';
  return 'opening';
}
const fact = (m, kind, actor, target, extra = {}) =>
  m.events.push({ k: 'fact', t_ms: Math.round(m.clock * 1000), kind, actor, target, situation: situationOf(m), ...extra });

export const short = (w) => w.name.split(' ').slice(-1)[0].replace(/"/g, '');
const emit = (m, e) => m.events.push(e);
const busy = (w) => BUSY.includes(w.state);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const nearRopes = (w) => Math.max(Math.abs(w.x), Math.abs(w.z)) > RING - 0.9;
function anim(w, name, speed = 1) {
  if (w.anim === name) { w.animSpeed = speed; return; }
  w.anim = name; w.animSpeed = speed; w.animSeq++;
}

// Count a move the human actually started (not a key mashed while busy or gassed).
function recordHabit(m, i, move) {
  if (i !== 0 || !COUNTER[move]) return;
  m.habits[situationOf(m)][move] += 1;
}

function act(m, i, kind) {
  const w = m.w[i], opp = m.w[1 - i];
  if (busy(w)) return;
  if (kind === 'block') { recordHabit(m, i, kind); fact(m, 'block', i, 1 - i); w.state = 'block'; w.stats.blocks++; anim(w, 'No', 1.6); return; }
  if (kind === 'taunt') { fact(m, 'taunt', i, null); w.state = 'taunt'; w.t = 1.2; anim(w, i === 0 ? 'Dance' : 'ThumbsUp', 1.4); emit(m, { k: 'call', text: `${short(w)} plays to the crowd!` }); return; }
  if (kind === 'grapple' && tryLockup(m, i)) return;
  if (kind === 'grapple' && w.mo >= 100 && dist(w, opp) < 1.6) kind = 'finisher';
  const mv = MOVES[kind === 'finisher' ? 'grapple' : kind];
  if (w.st < mv.stam * 0.5) { emit(m, { k: 'call', text: `${short(w)} is gassed!` }); return; }
  recordHabit(m, i, kind === 'finisher' ? 'grapple' : kind);
  if (kind === 'strike') w.stats.strikes++; else w.stats.grapples++;
  w.st -= mv.stam; w.state = 'wind'; w.move = kind; w.t = mv.wind;
  anim(w, kind === 'strike' ? 'Punch' : 'Jump', kind === 'strike' ? 2.4 : 1.8);
}

function resolve(m, att, def) {
  const kind = att.move;
  const ai = m.w.indexOf(att), di = 1 - ai, base = kind === 'finisher' ? 'grapple' : kind;
  if (dist(att, def) > (kind === 'strike' ? 1.45 : 1.35) || def.out) {
    // a whiff is not a decision: it goes to Bruin as a failed move, not to the decision log
    fact(m, base, ai, di, { success: false });
    return;
  }
  if (def.state === 'down' || def.state === 'thrown' || def.state === 'pinned' || def.state === 'paired') return;
  if (kind === 'strike') {
    if (def.state === 'block') {
      def.st -= 6; def.stats.reversals++; att.state = 'stun'; att.t = 0.45; anim(att, 'No');
      emit(m, { k: 'call', text: `${short(def)} blocks and shoves ${short(att)} back.` });
      fact(m, 'strike', ai, di, { success: false }); fact(m, 'reversal', di, ai); m.blockT = 1.5; return;
    }
    const cutoff = def.state === 'wind' && def.move !== 'strike';
    fact(m, 'strike', ai, di, { success: true });
    hit(m, def, 8, att);
    if (cutoff) { att.stats.reversals++; fact(m, 'reversal', ai, di); emit(m, { k: 'call', text: `${short(att)} cuts off the grapple attempt!` }); }
    att.mo = Math.min(100, att.mo + 12);
    return;
  }
  // committed (exhibition): a grapple only lands through the lock-up (shared/pair.js); out of range it whiffs
  if (m.committed) { fact(m, base, ai, di, { success: false }); return; }
  const fin = kind === 'finisher';
  const toss = nearRopes(def) && def.hp < 40;
  att.mo = fin ? 0 : Math.min(100, att.mo + 18);
  fact(m, 'grapple', ai, di, { success: true, ...(fin ? { finisher: true } : {}) });
  throwW(m, def, att, fin ? 28 : 15, toss);
  if (fin) { emit(m, { k: 'banner', text: 'FINISHER!', secs: 1.4 }); emit(m, { k: 'finisher' }); emit(m, { k: 'call', text: `${short(att)} hits the HEEL TURN DRIVER! The building shakes!` }); }
  else emit(m, { k: 'call', text: toss ? `${short(att)} launches ${short(def)} OVER THE TOP ROPE!` : `${short(att)} with a thunderous slam!` });
}

function hit(m, def, dmg, att) {
  if (onHit(m, def, dmg, att)) return;
  def.hp = Math.max(0, def.hp - dmg); def.state = 'stun'; def.t = 0.26; anim(def, 'No', 2);
  let ax = def.x - att.x, az = def.z - att.z; const len = Math.hypot(ax, az) || 1;
  def.vx += (ax / len) * 3.2; def.vz += (az / len) * 3.2;
  emit(m, { k: 'shake', v: 0.12 });
  def.mo = Math.min(100, def.mo + 4);
  impact(m, def, att, 'strike', dmg);
}

function throwW(m, def, att, dmg, toss) {
  def.hp = Math.max(0, def.hp - dmg); def.state = 'thrown'; def.t = 0;
  let dx = def.x - att.x, dz = def.z - att.z;
  if (dx * dx + dz * dz < 0.01) { dx = 1; dz = 0; }
  const len = Math.hypot(dx, dz); dx /= len; dz /= len;
  const reach = toss ? 3.2 : 1.1;
  let tx = def.x + dx * reach, tz = def.z + dz * reach;
  if (!toss) { tx = clamp(tx, -RING + 0.4, RING - 0.4); tz = clamp(tz, -RING + 0.4, RING - 0.4); }
  def.arc = { fx: def.x, fy: def.y, fz: def.z, tx, tz, dur: toss ? 1.0 : 0.6, toss, dmg };
  anim(def, 'Death', 1.6); emit(m, { k: 'shake', v: 0.35 });
}

// No cover in the first PIN_GRACE seconds after the bell, and only on a wrestler a knockdown put on the mat.
export const PIN_GRACE = 8;
function tryPin(m, i) {
  const att = m.w[i], def = m.w[1 - i];
  if (m.clock < PIN_GRACE || busy(att) || def.state !== 'down' || dist(att, def) > 1.6) return false;
  att.state = 'pinning'; def.state = 'pinned';
  m.pin = { att: i, victim: 1 - i, t: 0, count: 0, mash: 0 };
  anim(att, 'Sitting'); emit(m, { k: 'call', text: `${short(att)} goes for the cover!` }); fact(m, 'pin', i, 1 - i);
  return true;
}

function aiThink(m, i, dt) {
  const me = m.w[i], you = m.w[1 - i];
  if (me.out) return;
  // The LLM plan (agents server, set by the client as m.extPlan) is the decider; this frame loop only executes it.
  // The scripted planner below runs only while no fresh LLM plan exists, and says so in the log.
  const ext = m.extPlan && m.clock - m.extPlan.at < 12 ? m.extPlan : null;
  if (ext) {
    m.aiIntent = ext.intent === 'counter' && COUNTER[ext.expect] ? `counter_${ext.expect}` : ext.intent === 'taunt' ? 'taunt' : 'pressure';
    m.aiPlanT = 3.5;
  }
  // Planning is thinking, not acting: the clock runs while the AI is stunned or down, so a player who
  // keeps landing hits still gets read (an early return here froze the plan at "0 moves seen").
  if (!ext) m.aiPlanT -= dt;
  if (!ext && m.aiPlanT <= 0) {
    m.aiPlanT = 3.5;
    const sit = situationOf(m), seen = (h) => h.strike + h.grapple + h.block - 3;
    let h = m.habits[sit], where = sit.replace('_', ' ');
    if (seen(h) < 3) { // too few moves in this situation yet: read all of them
      h = { strike: 1, grapple: 1, block: 1 };
      for (const s of SITUATIONS) for (const k in h) h[k] += m.habits[s][k] - 1;
      where = 'overall';
    }
    const total = h.strike + h.grapple + h.block, fav = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
    const prevIntent = m.aiIntent;
    m.aiIntent = fav[1] / total > 0.45 ? `counter_${fav[0]}` : 'pressure';
    const html = m.aiIntent.startsWith('counter')
      ? `<em>${short(me)}</em> (fallback, scripted) plan: expect your <em>${fav[0]}</em> (${Math.round(fav[1] / total * 100)}% ${where}, ${seen(h)} moves seen), answer with <em>${COUNTER[fav[0]]}</em>.`
      : `<em>${short(me)}</em> (fallback, scripted) plan: no clear habit yet (${seen(h)} moves seen), apply pressure.`;
    // Same intent as last time: the log updates that line (key) instead of adding a copy.
    if (m.aiIntent !== prevIntent || !m.aiPlansLog.length) m.aiPlansLog.push(html.replace(/<[^>]+>/g, ''));
    else m.aiPlansLog[m.aiPlansLog.length - 1] = html.replace(/<[^>]+>/g, '');
    emit(m, { k: 'log', html, key: `plan-${i}-${m.aiIntent}`, same: m.aiIntent === prevIntent && m.aiPlanN > 0 });
    m.aiPlanN = (m.aiPlanN || 0) + 1;
  }
  if (m.pair) aiPair(m, i);
  if (busy(me)) return;
  // Execute: the behavior state machine in shared/ai.js turns the plan into continuous movement and attacks.
  think(m, i, dt, {
    act: (k) => act(m, i, k), block: (secs) => aiBlock(m, i, secs), tryPin: () => tryPin(m, i),
    step: (x, z, speed) => moveToward(me, x, z, dt, speed), dist, busy,
    say: (text) => emit(m, { k: 'call', text: `${short(me)}: "${text}"`, speaker: me.id, trash: true }),
  });
}

// A timed block (released after secs). The AI never holds block as a standing state.
function aiBlock(m, i, secs) {
  const me = m.w[i];
  if (busy(me)) return;
  fact(m, 'block', i, 1 - i);
  me.state = 'block'; me.stats.blocks++; anim(me, 'No', 1.6); me.t = secs; me.autoBlock = true;
}

function moveToward(w, x, z, dt, speed) {
  const dx = x - w.x, dz = z - w.z, len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  speed *= T.sim.aiSpeedScale;
  w.x += (dx / len) * speed * dt; w.z += (dz / len) * speed * dt;
  w.facing = Math.atan2(dx, dz); anim(w, 'Walking', 1.3);
}

function handleInput(m, i, kind) {
  const w = m.w[i];
  if (m.over || m.introT > 0) return;
  if (m.pair && pairInput(m, i, kind)) return;
  if (kind === 'blockUp') { if (w.state === 'block' && !w.autoBlock) w.state = 'idle'; return; }
  if (m.pin && m.pin.victim === i && kind === 'grapple') m.pin.mash += 1;
  if (kind === 'whip') return whip(m, i);
  if (kind === 'grapple') { if (!tryPin(m, i)) act(m, i, 'grapple'); return; }
  act(m, i, kind);
}

// Advance the match by dt seconds. ctl[i].queue is consumed.
export function step(m, dt, ctl) {
  if (preStep(m, dt)) return;
  for (let i = 0; i < 2; i++) { for (const k of ctl[i].queue) handleInput(m, i, k); ctl[i].queue.length = 0; }
  if (m.introT > 0) {
    m.introT -= dt;
    if (m.introT <= 0) {
      for (const w of m.w) { w.state = 'idle'; anim(w, 'Idle'); }
      fact(m, 'entry', 0, null); fact(m, 'entry', 1, null);
      emit(m, { k: 'bell' }); emit(m, { k: 'banner', text: 'FIGHT!', secs: 1.2 });
      emit(m, { k: 'call', text: `The bell rings. ${short(m.w[0])} and ${short(m.w[1])} circle each other.` });
    }
    return;
  }
  m.clock += dt; m.blockT = Math.max(0, m.blockT - dt);
  if (m.pair) pairStep(m, dt);
  const [A, B] = m.w;
  const before = m.w.map((w) => [w.x, w.z]);
  for (let i = 0; i < 2; i++) {
    const w = m.w[i], c = ctl[i];
    if (m.over) continue;
    if (c.human) {
      if (!busy(w) && w.state !== 'block') {
        const len = Math.hypot(c.mx, c.mz);
        if (len > 0) { const v = moveSpeed(w, c); w.x += (c.mx / len) * v * dt; w.z += (c.mz / len) * v * dt; w.facing = Math.atan2(c.mx, c.mz); anim(w, 'Running', v / 3.8); }
        else anim(w, 'Idle');
      }
    } else aiThink(m, i, dt);
  }
  for (let i = 0; i < 2; i++) {
    const w = m.w[i], opp = m.w[1 - i];
    w.st = Math.min(100, w.st + dt * (w.state === 'idle' ? 10 : 4));
    w.x += w.vx * dt; w.z += w.vz * dt;
    const damp = Math.pow(0.02, dt); w.vx *= damp; w.vz *= damp;
    if (w.state === 'wind') { w.t -= dt; if (w.t <= 0) { w.state = 'active'; w.t = MOVES.strike.active; resolve(m, w, opp); } }
    else if (w.state === 'active') { w.t -= dt; if (w.t <= 0) { w.state = 'rec'; w.t = MOVES[w.move === 'finisher' ? 'grapple' : w.move].rec; } }
    else if (w.state === 'rec' || w.state === 'stun' || w.state === 'taunt') {
      w.t -= dt;
      if (w.state === 'taunt') w.mo = Math.min(100, w.mo + dt * 30);
      if (w.t <= 0) { w.state = 'idle'; anim(w, 'Idle'); }
    } else if (w.state === 'block' && w.autoBlock) { w.t -= dt; if (w.t <= 0) { w.state = 'idle'; w.autoBlock = false; anim(w, 'Idle'); } }
    else if (w.state === 'thrown') {
      w.t += dt; const a = w.arc, k = Math.min(1, w.t / a.dur);
      w.x = lerp(a.fx, a.tx, k); w.z = lerp(a.fz, a.tz, k);
      w.y = lerp(a.fy, a.toss ? 0 : MAT_Y, k) + Math.sin(k * Math.PI) * (a.toss ? 1.6 : 0.9);
      w.rotX = -k * Math.PI * 0.5;
      if (k >= 1) {
        emit(m, { k: 'shake', v: 0.4 });
        if (a.toss) { w.state = 'out'; w.out = true; fact(m, 'elimination', 1 - i, i); win(m, 1 - i, 'OVER THE TOP'); }
        else { w.state = 'down'; w.t = 2.2 + (100 - w.hp) / 40; fact(m, 'knockdown', 1 - i, i); }
      }
    } else if (w.state === 'down') {
      w.t -= dt; if (w.t <= 0) {
        // committed: the get-up is part of the down time; the sim waits for the kip-up (1.5 s) before he can act
        w.state = m.committed ? 'getup' : 'idle'; w.t = 1.5; w.rotX = 0; anim(w, 'Standing', 1.5);
        emit(m, { k: 'call', text: `${short(w)} is back on his feet!` });
      }
    } else if (w.state === 'getup') {
      // the kip-up track ends standing 0.45 m ahead of where the hips lay
      w.t -= dt; if (w.t <= 0) { w.state = 'idle'; w.x += Math.sin(w.facing) * 0.45; w.z += Math.cos(w.facing) * 0.45; anim(w, 'Idle'); }
    }
    // rec and stun face the rival too, so a wrestler never stands turned away after a move or a hit
    if (['idle', 'wind', 'block', 'active', 'rec', 'stun'].includes(w.state)) w.facing = Math.atan2(opp.x - w.x, opp.z - w.z);
    if (!w.out && w.state !== 'thrown') {
      const lim = RING - 0.35;
      for (const ax of ['x', 'z']) {
        if (Math.abs(w[ax]) > lim) {
          const sign = Math.sign(w[ax]); w[ax] = sign * lim; w['v' + ax] *= -0.6;
          emit(m, { k: 'wobble', ax, sign });
        }
      }
      w.y = MAT_Y;
    }
  }
  // separation
  let sx = A.x - B.x, sz = A.z - B.z; const sl = Math.hypot(sx, sz);
  if (!m.pair && !A.out && !B.out && sl < 0.85 && A.state !== 'thrown' && B.state !== 'thrown') {
    const gap = 0.85 - sl; if (sl < 1e-2) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
    const push = gap * 0.5 + 0.01;
    A.x += sx * push; A.z += sz * push; B.x -= sx * push; B.z -= sz * push;
  }
  // A walk/run clip only plays while the wrestler really moves; standing still (in range, blocked by the
  // ropes or the separation push) goes back to idle, so nobody walks in place.
  m.w.forEach((w, i) => {
    if ((w.anim === 'Walking' || w.anim === 'Running') && Math.hypot(w.x - before[i][0], w.z - before[i][1]) < 0.4 * dt) anim(w, 'Idle');
  });
  pinStep(m, ctl, dt, kickout, win);
}

function kickout(m) {
  const p = m.pin, att = m.w[p.att], victim = m.w[p.victim];
  fact(m, 'kickout', p.victim, p.att);
  emit(m, { k: 'call', text: `KICK OUT! ${short(victim)} kicks out at ${p.count}!` }); emit(m, { k: 'banner', text: 'KICK OUT!', secs: 0.8 });
  victim.stats.reversals++;
  att.state = 'idle'; anim(att, 'Idle'); victim.state = 'down'; victim.t = 0.6; m.pin = null;
}

function win(m, i, how) {
  const w = m.w[i];
  if (how === 'PINFALL') fact(m, 'elimination', i, 1 - i); // Bruin's leaderboard: a win = entered, not eliminated
  m.over = true; m.winner = i; m.how = how; m.pin = null;
  emit(m, { k: 'banner', text: `${short(w).toUpperCase()} WINS`, secs: 999 });
  emit(m, { k: 'call', text: `${how}! ${w.name} wins!` });
  emit(m, { k: 'log', html: `<em>Result</em>: ${short(w)} by ${how.toLowerCase()}. Habits saved for the rematch.` });
  w.state = 'taunt'; w.t = 999; anim(w, 'Dance');
  emit(m, { k: 'end', winner: i, how, stats: m.w.map((x) => ({ ...x.stats })), aiPlansLog: learned(m) });
}

// The results screen's "What the AI learned": the latest LLM plans (newest first) and what it has seen you do.
// Scripted fallback plans show only when no LLM plan arrived, and then only the latest (the early ones say
// "0 moves seen" and are stale by the bell).
function learned(m) {
  const llm = m.aiPlansLog.filter((s) => s.includes('(LLM)'));
  const plans = llm.length ? llm.slice(-3).reverse() : m.aiPlansLog.slice(-1);
  const tot = { strike: 0, grapple: 0, block: 0 };
  for (const s of SITUATIONS) for (const k in tot) tot[k] += m.habits[s][k] - 1;
  const n = tot.strike + tot.grapple + tot.block;
  if (!n) return plans;
  const fav = Object.entries(tot).sort((a, b) => b[1] - a[1])[0];
  return [...plans, `Your habits so far: ${tot.strike} strikes, ${tot.grapple} grapples, ${tot.block} blocks over ${n} moves; you lean on the ${fav[0]} (${Math.round(fav[1] / n * 100)}%).`];
}

export const newControl = (human) => ({ human, mx: 0, mz: 0, queue: [] });

// What the server sends each tick (and what the client renders from).
export function snapshot(m) {
  return {
    w: m.w.map(({ arc, ...w }) => w), pair: m.pair, over: m.over, winner: m.winner, how: m.how,
    introT: m.introT, freeze: m.freeze || 0, pin: m.pin && { victim: m.pin.victim, count: m.pin.count, t: m.pin.t },
  };
}
