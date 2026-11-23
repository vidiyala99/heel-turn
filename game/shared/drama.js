// HEEL TURN match drama: hitstop, run speed, Irish whip + rope rebound, crowd heat, fired-up comebacks
// and near-fall pins. Pure data like sim.js (no three.js), so the arena server runs the same rules.
// sim.js calls in at five hooks: preStep (top of step), moveSpeed, onHit (top of hit), whip, pinStep.
//
// Adds to the match:    m.freeze (seconds of hitstop left; the whole sim pauses, queued inputs wait)
// Adds to a wrestler:   heat (crowd heat 0-100), fired (seconds left), noSell (strikes it can no-sell),
//                       whipDir [dx, dz] while state is 'whipped' (to the ropes) or 'rebound' (coming back)
// Events for the client: impact {kind, slot, dmg, hitstop, x, y, z}, whip {slot}, rebound {slot},
//   fired {slot}, nosell {slot}, pincount {n}, nearfall {slot, at}.
import { T } from './tuning.js';

const S = T.sim;
const RING = 3.2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const emit = (m, e) => m.events.push(e);
const short = (w) => w.name.split(' ').slice(-1)[0].replace(/"/g, '');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const free = (w) => w.state === 'idle' || (w.state === 'block' && !w.autoBlock);
const addHeat = (w, v) => { w.heat = clamp((w.heat || 0) + v, 0, 100); };
function anim(w, name, speed = 1) {
  if (w.anim === name) { w.animSpeed = speed; return; }
  w.anim = name; w.animSpeed = speed; w.animSeq++;
}

// Freeze the sim on contact and tell the client what landed (FX, camera, sound key off this).
export function impact(m, def, att, kind, dmg) {
  const hs = S.hitstop[kind] ?? S.hitstop.strike;
  m.freeze = Math.max(m.freeze || 0, hs);
  if (att) addHeat(att, kind === 'strike' ? S.heat.strike : kind === 'finisher' ? S.heat.finisher : S.heat.slam);
  emit(m, { k: 'impact', kind, slot: m.w.indexOf(def), by: att ? m.w.indexOf(att) : -1, dmg, hitstop: hs, x: def.x, y: def.y, z: def.z });
}

// Top of step(). Returns true while the sim is frozen in hitstop.
export function preStep(m, dt) {
  if (m.freeze > 0) { m.freeze = Math.max(0, m.freeze - dt); return true; }
  if (m.introT > 0 || m.over) return false;
  m.prevState ||= m.w.map((w) => w.state);
  m.w.forEach((w, i) => {
    const opp = m.w[1 - i];
    w.heat ??= 0; w.fired ??= 0; w.noSell ??= 0;
    // landing: a thrown wrestler hit the mat last step
    if (m.prevState[i] === 'thrown' && w.state !== 'thrown' && w.arc) {
      impact(m, w, opp, w.arc.dmg >= 28 ? 'finisher' : w.arc.clothes ? 'clothesline' : 'slam', w.arc.dmg || 0);
    }
    if (w.state === 'taunt') addHeat(w, S.heat.taunt * dt);
    else addHeat(w, -S.heat.decay * dt);
    if (w.fired > 0) { w.fired = Math.max(0, w.fired - dt); if (!w.fired) w.noSell = 0; }
    else if (w.hp < S.fired.hp && w.heat >= S.fired.heat && !w.out && (w.state === 'idle' || w.state === 'stun')) {
      w.fired = S.fired.secs; w.noSell = 1; addHeat(w, -S.fired.heatCost);
      emit(m, { k: 'fired', slot: i }); emit(m, { k: 'banner', text: 'FIRED UP!', secs: 1.1 });
      emit(m, { k: 'call', text: `${short(w)} is FIRED UP! The crowd will not let him stay down!` });
    }
    whipMotion(m, w, opp, dt, i);
  });
  m.prevState = m.w.map((w) => w.state);
  return false;
}

export function moveSpeed(w, c) {
  return (c.run ? S.run : S.walk) * (w.fired > 0 ? S.fired.speed : 1);
}

// Top of hit(). Returns true when it handled the hit: a fired-up no-sell, or a clothesline on a rebound.
export function onHit(m, def, dmg, att) {
  if (def.fired > 0 && def.noSell > 0) {
    def.noSell--; att.state = 'stun'; att.t = 0.45; anim(att, 'No', 2);
    m.freeze = Math.max(m.freeze || 0, S.hitstop.block);
    emit(m, { k: 'nosell', slot: m.w.indexOf(def) }); emit(m, { k: 'banner', text: 'NO-SELL!', secs: 0.8 });
    emit(m, { k: 'call', text: `${short(def)} takes it and just stares at ${short(att)}!` });
    return true;
  }
  if (def.state === 'rebound') {
    const [dx, dz] = def.whipDir, dmg2 = S.whip.clothesDmg;
    def.hp = Math.max(0, def.hp - dmg2); def.state = 'thrown'; def.t = 0;
    const tx = clamp(def.x - dx * 0.5, -RING + 0.4, RING - 0.4), tz = clamp(def.z - dz * 0.5, -RING + 0.4, RING - 0.4);
    def.arc = { fx: def.x, fy: def.y, fz: def.z, tx, tz, dur: 0.45, toss: false, dmg: dmg2, clothes: true };
    anim(def, 'Bump', 1); att.mo = Math.min(100, att.mo + 20);
    emit(m, { k: 'banner', text: 'CLOTHESLINE!', secs: 0.9 });
    emit(m, { k: 'call', text: `${short(att)} meets ${short(def)} off the ropes with a CLOTHESLINE!` });
    return true;
  }
  return false;
}

// Irish whip: grab a nearby, free rival and send them running into the ropes.
export function whip(m, i) {
  const w = m.w[i], v = m.w[1 - i], W = S.whip;
  if (m.over || m.introT > 0 || m.freeze > 0 || !free(w) || !free(v) || dist(w, v) > W.range) return;
  if (w.st < W.stam) { emit(m, { k: 'call', text: `${short(w)} is gassed!` }); return; }
  let dx = v.x - w.x, dz = v.z - w.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
  w.st -= W.stam; w.state = 'rec'; w.t = W.rec; w.move = 'whip'; anim(w, 'Punch', 2.4);
  v.state = 'whipped'; v.whipDir = [dx, dz]; v.t = 0; anim(v, 'Running', 1.5);
  addHeat(w, S.heat.whip);
  emit(m, { k: 'whip', slot: 1 - i });
  emit(m, { k: 'call', text: `${short(w)} whips ${short(v)} into the ropes!` });
}

function whipMotion(m, w, opp, dt, i) {
  if (w.state !== 'whipped' && w.state !== 'rebound') return;
  const W = S.whip, lim = RING - 0.45;
  let [dx, dz] = w.whipDir;
  w.x += dx * W.speed * dt; w.z += dz * W.speed * dt; w.facing = Math.atan2(dx, dz);
  if (w.state === 'whipped') {
    const ax = Math.abs(w.x) >= lim ? 'x' : Math.abs(w.z) >= lim ? 'z' : null;
    if (ax) {
      const sign = Math.sign(w[ax]); w[ax] = sign * lim;
      dx = opp.x - w.x; dz = opp.z - w.z; const len = Math.hypot(dx, dz) || 1; // come right back at them
      w.whipDir = [dx / len, dz / len]; w.state = 'rebound'; w.t = W.reboundT;
      emit(m, { k: 'wobble', ax, sign }); emit(m, { k: 'rebound', slot: i });
    } else if ((w.t += dt) > 1.5) { w.state = 'idle'; anim(w, 'Idle'); }
  } else if ((w.t -= dt) <= 0 || dist(w, opp) < 0.55) { w.state = 'idle'; anim(w, 'Idle'); }
}

// Replaces the pin block at the end of step(). kickout and win are sim.js's own.
export function pinStep(m, ctl, dt, kickout, win) {
  const p = m.pin; if (!p) return;
  const P = S.pin, victim = m.w[p.victim], human = ctl[p.victim].human;
  p.t += dt;
  if (ropeBreak(m, p, victim)) return;
  if (p.kickAt === undefined) p.kickAt = human ? Infinity : aiKickAt(victim);
  if (human ? p.mash >= 6 + p.count * 3 : p.t >= p.kickAt * P.count) {
    const at = p.t / P.count, att = m.w[p.att];
    kickout(m);
    if (at >= 2) {
      addHeat(victim, S.heat.nearFall); addHeat(att, S.heat.nearFall / 2);
      emit(m, { k: 'nearfall', slot: p.victim, at: +at.toFixed(2) });
    } else addHeat(victim, S.heat.kickout);
    return;
  }
  if (p.t > (p.count + 1) * P.count) {
    p.count++; emit(m, { k: 'banner', text: String(p.count), secs: 0.6 }); emit(m, { k: 'pincount', n: p.count });
    if (p.count === 3) win(m, p.att, 'PINFALL');
  }
}

// Rope break: the pinned wrestler is under the ropes (sim position within ROPE_REACH m of the mat edge) while Lou
// counts -> he stops the count and the attacker lets go. A bribed Lou (m.refBribed, set from an approved bribe)
// "misses" it once per pin. Events: banner, call, rope_break {slot, missed}, fact rope_break (actor = victim).
const ROPE_REACH = 0.45;
export const underRopes = (w) => RING - Math.max(Math.abs(w.x), Math.abs(w.z)) < ROPE_REACH;
function ropeBreak(m, p, victim) {
  if (p.ropeSeen || !underRopes(victim)) return false;
  p.ropeSeen = true;
  const att = m.w[p.att], fact = { k: 'fact', t_ms: Math.round((m.clock || 0) * 1000), kind: 'rope_break', actor: p.victim, target: p.att, situation: 'cornered' };
  if (m.refBribed) {
    emit(m, { k: 'rope_break', slot: p.victim, missed: true });
    emit(m, { k: 'call', text: `${short(victim)}'s foot is on the rope... and Lou doesn't see it! He keeps counting!` });
    return false;
  }
  m.events.push(fact);
  emit(m, { k: 'rope_break', slot: p.victim, missed: false });
  emit(m, { k: 'banner', text: 'ROPE BREAK!', secs: 1.1 });
  emit(m, { k: 'call', text: `Rope break! Lou waves it off: ${short(victim)} is under the ropes. ${short(att)} has to let go.` });
  att.state = 'idle'; anim(att, 'Idle');
  victim.state = 'down'; victim.t = 0.6;
  m.pin = null;
  return true;
}

// When an AI victim kicks out, in counts. Healthy: early. Hurt: at 2.9 (a near-fall) or not at all.
function aiKickAt(v) {
  const P = S.pin;
  if (v.hp > P.earlyKickHp) return 1.1 + Math.random() * 0.8;
  const chance = clamp((v.hp - P.keepFightingHp) / 40 + (v.heat || 0) / 200, 0, 0.95);
  return Math.random() < chance ? P.nearFallAt + (Math.random() - 0.5) * 0.08 : Infinity;
}
