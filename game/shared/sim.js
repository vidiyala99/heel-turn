// HEEL TURN combat simulation. Pure data, no three.js: the browser runs it for exhibition
// (offline) matches and the Colyseus server runs it at 30 Hz for online matches.
//
// Match shape:
//   { w: [Wrestler, Wrestler], over, winner, how, pin, introT, events: [Event], habits, ... }
// Wrestler: position x/y/z, velocity vx/vz, facing, rotX (fall tilt), hp, st (stamina), mo (meter),
//   state, t (state timer), move, anim/animSpeed/animSeq (renderer hint), stats.
// Events (drained by the caller each step): banner, call, log, shake, finisher, wobble, bell, end.
// Control per slot: { human, mx, mz, run, queue: ['strike'|'grapple'|'block'|'blockUp'|'taunt'|'whip'] }.
// Feel (hitstop, run, whip, heat, fired up, near-falls) lives in shared/drama.js; its numbers in shared/tuning.js.

import { T } from './tuning.js';
import { preStep, moveSpeed, onHit, impact, whip, pinStep } from './drama.js';

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
const BUSY = ['wind', 'active', 'rec', 'stun', 'down', 'thrown', 'taunt', 'pinning', 'pinned', 'out', 'intro', 'whipped', 'rebound'];

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

export function createMatch(p1 = 'vex', p2 = 'kane', habits = null) {
  const m = {
    w: [makeWrestler(p1, -1.6), makeWrestler(p2, 1.6)],
    over: false, winner: -1, how: null, pin: null, introT: INTRO_SECS, events: [],
    habits: habits || { opening: { strike: 1, grapple: 1, block: 1 }, after_hit: { strike: 1, grapple: 1, block: 1 } },
    lastSituation: 'opening', aiPlanT: 0, aiIntent: 'pressure', aiPlansLog: [],
  };
  emit(m, { k: 'call', text: `${m.w[0].name} and ${m.w[1].name} make their way to the ring.` });
  return m;
}

export const short = (w) => w.name.split(' ').slice(-1)[0].replace(/"/g, '');
const emit = (m, e) => m.events.push(e);
const busy = (w) => BUSY.includes(w.state);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const nearRopes = (w) => Math.max(Math.abs(w.x), Math.abs(w.z)) > RING - 0.9;
function anim(w, name, speed = 1) {
  if (w.anim === name) { w.animSpeed = speed; return; }
  w.anim = name; w.animSpeed = speed; w.animSeq++;
}

function recordHabit(m, i, move) {
  if (i !== 0 || !COUNTER[move]) return;
  m.habits[m.lastSituation][move] += 1;
}

function act(m, i, kind) {
  const w = m.w[i], opp = m.w[1 - i];
  if (busy(w)) return;
  recordHabit(m, i, kind);
  if (kind === 'block') { w.state = 'block'; w.stats.blocks++; anim(w, 'No', 1.6); return; }
  if (kind === 'taunt') { w.state = 'taunt'; w.t = 1.2; anim(w, i === 0 ? 'Dance' : 'ThumbsUp', 1.4); emit(m, { k: 'call', text: `${short(w)} plays to the crowd!` }); return; }
  if (kind === 'grapple' && w.mo >= 100 && dist(w, opp) < 1.6) kind = 'finisher';
  const mv = MOVES[kind === 'finisher' ? 'grapple' : kind];
  if (w.st < mv.stam * 0.5) { emit(m, { k: 'call', text: `${short(w)} is gassed!` }); return; }
  if (kind === 'strike') w.stats.strikes++; else w.stats.grapples++;
  w.st -= mv.stam; w.state = 'wind'; w.move = kind; w.t = mv.wind;
  anim(w, kind === 'strike' ? 'Punch' : 'Jump', kind === 'strike' ? 2.4 : 1.8);
}

function resolve(m, att, def) {
  const kind = att.move;
  if (dist(att, def) > (kind === 'strike' ? 1.45 : 1.35) || def.out) { emit(m, { k: 'log', html: `<em>${short(att)}</em> whiffs the ${kind}.` }); return; }
  if (def.state === 'down' || def.state === 'thrown' || def.state === 'pinned') return;
  if (kind === 'strike') {
    if (def.state === 'block') {
      def.st -= 6; def.stats.reversals++; att.state = 'stun'; att.t = 0.45; anim(att, 'No');
      emit(m, { k: 'call', text: `${short(def)} blocks and shoves ${short(att)} back.` }); m.lastSituation = 'after_hit'; return;
    }
    const cutoff = def.state === 'wind' && def.move !== 'strike';
    hit(m, def, 8, att);
    if (cutoff) { att.stats.reversals++; emit(m, { k: 'call', text: `${short(att)} cuts off the grapple attempt!` }); }
    att.mo = Math.min(100, att.mo + 12); m.lastSituation = 'after_hit';
    return;
  }
  const fin = kind === 'finisher';
  const toss = nearRopes(def) && def.hp < 40;
  att.mo = fin ? 0 : Math.min(100, att.mo + 18);
  throwW(m, def, att, fin ? 28 : 15, toss);
  if (fin) { emit(m, { k: 'banner', text: 'FINISHER!', secs: 1.4 }); emit(m, { k: 'finisher' }); emit(m, { k: 'call', text: `${short(att)} hits the HEEL TURN DRIVER! The building shakes!` }); }
  else emit(m, { k: 'call', text: toss ? `${short(att)} launches ${short(def)} OVER THE TOP ROPE!` : `${short(att)} with a thunderous slam!` });
  m.lastSituation = 'after_hit';
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

function tryPin(m, i) {
  const att = m.w[i], def = m.w[1 - i];
  if (busy(att) || def.state !== 'down' || dist(att, def) > 1.6) return false;
  att.state = 'pinning'; def.state = 'pinned';
  m.pin = { att: i, victim: 1 - i, t: 0, count: 0, mash: 0 };
  anim(att, 'Sitting'); emit(m, { k: 'call', text: `${short(att)} goes for the cover!` });
  return true;
}

function aiThink(m, i, dt) {
  const me = m.w[i], you = m.w[1 - i];
  if (me.out || busy(me)) return;
  m.aiPlanT -= dt;
  if (m.aiPlanT <= 0) {
    m.aiPlanT = 3.5;
    const h = m.habits[m.lastSituation];
    const fav = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
    const total = h.strike + h.grapple + h.block;
    m.aiIntent = fav[1] / total > 0.45 ? `counter_${fav[0]}` : 'pressure';
    const html = m.aiIntent.startsWith('counter')
      ? `<em>${short(me)}</em> plan: expect your <em>${fav[0]}</em> (${Math.round(fav[1] / total * 100)}% ${m.lastSituation.replace('_', ' ')}), answer with <em>${COUNTER[fav[0]]}</em>.`
      : `<em>${short(me)}</em> plan: no clear habit yet (${total - 3} moves seen), apply pressure.`;
    m.aiPlansLog.push(html.replace(/<[^>]+>/g, ''));
    emit(m, { k: 'log', html });
  }
  if (you.state === 'down' && tryPin(m, i)) return;
  if (dist(me, you) > 1.3) { moveToward(me, you.x, you.z, dt, 2.4); return; }
  if (Math.random() > dt * 1.25) return; // reaction rate (~1.25 actions/s)
  if (me.mo >= 100) return act(m, i, 'grapple');
  if (you.state === 'wind' && you.move === 'grapple') return act(m, i, 'strike');
  if (you.state === 'wind' && you.move === 'strike') return act(m, i, Math.random() < 0.6 ? 'block' : 'strike');
  if (m.aiIntent.startsWith('counter_')) return act(m, i, COUNTER[m.aiIntent.slice(8)]);
  const pick = ['strike', 'strike', 'grapple', 'block'][Math.floor(Math.random() * 4)];
  if (pick === 'block') { me.state = 'block'; me.stats.blocks++; anim(me, 'No', 1.6); me.t = 0.6; me.autoBlock = true; return; }
  act(m, i, pick);
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
      emit(m, { k: 'bell' }); emit(m, { k: 'banner', text: 'FIGHT!', secs: 1.2 });
      emit(m, { k: 'call', text: `The bell rings. ${short(m.w[0])} and ${short(m.w[1])} circle each other.` });
    }
    return;
  }
  const [A, B] = m.w;
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
        if (a.toss) { w.state = 'out'; w.out = true; win(m, 1 - i, 'OVER THE TOP'); }
        else { w.state = 'down'; w.t = 2.2 + (100 - w.hp) / 40; }
      }
    } else if (w.state === 'down') {
      w.t -= dt; if (w.t <= 0) { w.state = 'idle'; w.rotX = 0; anim(w, 'Standing', 1.5); emit(m, { k: 'call', text: `${short(w)} is back on his feet!` }); }
    }
    if (['idle', 'wind', 'block', 'active'].includes(w.state)) w.facing = Math.atan2(opp.x - w.x, opp.z - w.z);
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
  if (!A.out && !B.out && sl < 0.85 && A.state !== 'thrown' && B.state !== 'thrown') {
    const gap = 0.85 - sl; if (sl < 1e-2) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
    const push = gap * 0.5 + 0.01;
    A.x += sx * push; A.z += sz * push; B.x -= sx * push; B.z -= sz * push;
  }
  pinStep(m, ctl, dt, kickout, win);
}

function kickout(m) {
  const p = m.pin, att = m.w[p.att], victim = m.w[p.victim];
  emit(m, { k: 'call', text: `KICK OUT! ${short(victim)} kicks out at ${p.count}!` }); emit(m, { k: 'banner', text: 'KICK OUT!', secs: 0.8 });
  victim.stats.reversals++;
  att.state = 'idle'; anim(att, 'Idle'); victim.state = 'down'; victim.t = 0.6; m.pin = null;
}

function win(m, i, how) {
  const w = m.w[i];
  m.over = true; m.winner = i; m.how = how; m.pin = null;
  emit(m, { k: 'banner', text: `${short(w).toUpperCase()} WINS`, secs: 999 });
  emit(m, { k: 'call', text: `${how}! ${w.name} wins!` });
  emit(m, { k: 'log', html: `<em>Result</em>: ${short(w)} by ${how.toLowerCase()}. Habits saved for the rematch.` });
  w.state = 'taunt'; w.t = 999; anim(w, 'Dance');
  emit(m, { k: 'end', winner: i, how, stats: m.w.map((x) => ({ ...x.stats })), aiPlansLog: [...m.aiPlansLog] });
}

export const newControl = (human) => ({ human, mx: 0, mz: 0, queue: [] });

// What the server sends each tick (and what the client renders from).
export function snapshot(m) {
  return {
    w: m.w.map(({ arc, ...w }) => w), over: m.over, winner: m.winner, how: m.how,
    introT: m.introT, freeze: m.freeze || 0, pin: m.pin && { victim: m.pin.victim, count: m.pin.count, t: m.pin.t },
  };
}
