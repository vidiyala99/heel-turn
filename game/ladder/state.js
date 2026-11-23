// Ladder match model: pure data + pure functions, no three.js, no DOM.
//
// Ladder state (the `state` field):
//   on_mat              folded, lying on the mat at (x, z, yaw)
//   carried(by)         folded, in a wrestler's hands
//   standing            A-frame open at (x, z, yaw); may have a holder
//   climbed(by, rung)   a climber on one face (side +1 / -1); may have a holder
//   tipped(tip)         knocked over; lies on its side; can be picked up like on_mat
//
// act(match, id, action, t_ms) -> { state, events }   never mutates its input
// move(match, id, mx, mz, dt, t_ms) -> match          ground movement
// aiDecide(match, id, t_ms, policy) -> { action } | { toward: {x,z} } | null
//
// Events use the PLAN schema {match, t_ms, actor, kind, target?, situation, success?, text?}.
// Kinds: ladder_set, ladder_climb, ladder_hold, ladder_betray, ladder_grab, plus ladder_tip for a
// shove by someone who was NOT holding (an opponent tipping the ladder or knocking it out of hands), and
// ladder_strike: a punch on the mat (drops a carried ladder, breaks a hold) or a climber kicking someone off the base.

export const LADDER = {
  RUNG: 0.3,            // rung spacing (m)
  TOP: 8,               // highest rung you stand on to grab the case
  HEIGHT: 3.0,          // apex height (m)
  TILT: (14 * Math.PI) / 180, // each face leans this far from vertical
  FOOT: 0.24,           // climber's feet sit this far outside the face
  REACH: 1.3,           // how close you must be to climb / hold / shove a standing ladder
  PICK_REACH: 1.5,      // how close to the centre of a lying ladder to pick it up
  UNDER_CASE: 0.7,      // ladder centre must be this close to the case to win from the top
  SNAP: 1.0,            // setting up within this of the case snaps it under the case
  FALL_BACK: 1.1,       // a knocked-off climber lands this far behind the face
  HOLD_GAP: 0.4,        // holder stands this far outside the opposite face
  KIP_FWD: 0.45,        // the kip-up ends this far forward of where the body lay
};
export const TIMING = { STRIKE_MS: 650, STUN_MS: 1100, KICK_STUN_MS: 2200, STRIKE_CD_MS: 1400, RECOVER_MS: 500, KNOCKDOWN_MS: 2800, COMBO_HITS: 3, STEP_MS: 600, SET_MS: 900, PICK_MS: 350, SHOVE_MS: 700, SHOVE_LAG_MS: 300, FALL_MS: 3100, GRAB_MS: 2600 };
export const SITUATIONS = ['opening', 'after_block', 'low_stamina', 'cornered'];
export const KINDS = ['ladder_set', 'ladder_climb', 'ladder_hold', 'ladder_betray', 'ladder_grab', 'ladder_tip', 'ladder_strike'];
export const ACTIONS = ['pickup', 'drop', 'setup', 'climb', 'descend', 'hold', 'release', 'shove', 'betray_shove', 'grab', 'strike'];

const tanT = Math.tan(LADDER.TILT);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fwdOf = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
const yawTo = (dx, dz) => Math.atan2(dx, dz);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Distance from the ladder's centre line to the face at height h.
export const faceOffset = (h) => (LADDER.HEIGHT - h) * tanT;

// Where a climber's feet are on `rung` of `side`, plus the yaw that faces the ladder.
export function climbSpot(ladder, rung, side = ladder.side || 1) {
  const f = fwdOf(ladder.yaw);
  const out = faceOffset(rung * LADDER.RUNG) + LADDER.FOOT;
  return { x: ladder.x + f.x * side * out, z: ladder.z + f.z * side * out, y: rung * LADDER.RUNG, yaw: yawTo(-f.x * side, -f.z * side) };
}
// Where a knocked-off climber ends up lying (feet end of the body) and the yaw they had on the ladder.
export function landingSpot(ladder, rung, side) {
  const s = climbSpot(ladder, rung, side);
  const f = fwdOf(ladder.yaw);
  return { x: s.x + f.x * side * LADDER.FALL_BACK, z: s.z + f.z * side * LADDER.FALL_BACK, yaw: s.yaw };
}
export function holdSpot(ladder, side) {
  const f = fwdOf(ladder.yaw);
  const out = faceOffset(0) + LADDER.HOLD_GAP;
  return { x: ladder.x + f.x * side * out, z: ladder.z + f.z * side * out, yaw: yawTo(-f.x * side, -f.z * side) };
}
export const underCase = (m) => dist(m.ladder, m.case) <= LADDER.UNDER_CASE;

export function createMatch({ matchId = 'ladder-1', ring = 3.2, players, ladder = { x: 0, z: 2.2, yaw: Math.PI / 2 } } = {}) {
  const wrestlers = {};
  for (const p of players) {
    wrestlers[p.id] = {
      id: p.id, name: p.name || p.id, human: !!p.human,
      x: p.x ?? 0, z: p.z ?? 0, yaw: p.yaw ?? 0,
      stamina: 100, busyUntil: 0, downUntil: 0, lastBlockedAt: -1e9, lastStrikeAt: -1e9, hitSafeUntil: 0, lastHitAt: -1e9, hitStreak: 0, fall: null,
    };
  }
  return {
    match: matchId, t_ms: 0, ring, winner: null,
    case: { x: 0, z: 0, heldBy: null },
    order: players.map((p) => p.id),
    wrestlers,
    ladder: { state: 'on_mat', x: ladder.x, z: ladder.z, yaw: ladder.yaw, by: null, rung: 0, side: 1, holder: null, holdSide: -1, tip: null, prev: null },
  };
}

export function situationFor(m, id, t) {
  const w = m.wrestlers[id];
  if (t - w.lastBlockedAt < 2500) return 'after_block';
  if (w.stamina < 30) return 'low_stamina';
  if (Math.max(Math.abs(w.x), Math.abs(w.z)) > m.ring - 0.7) return 'cornered';
  return 'opening';
}

const clone = (m) => (typeof structuredClone === 'function' ? structuredClone(m) : JSON.parse(JSON.stringify(m)));
const canAct = (w, t) => t >= w.downUntil && t >= w.busyUntil;
const climberOf = (L) => (L.state === 'climbed' ? L.by : null);

// Knock the ladder over, away from `actorId`. Any climber falls.
function tip(m, actorId, t) {
  const L = m.ladder, a = m.wrestlers[actorId];
  let dx = L.x - a.x, dz = L.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) { const f = fwdOf(L.yaw); dx = f.x; dz = f.z; } else { dx /= len; dz /= len; }
  const climber = climberOf(L);
  if (climber) {
    const c = m.wrestlers[climber];
    const land = landingSpot(L, L.rung, L.side);
    c.fall = { at: t, rung: L.rung, side: L.side, ladder: { x: L.x, z: L.z, yaw: L.yaw } };
    // The kip-up (game/moves 'kipup') rises 0.45 m toward the feet end, i.e. back toward the ladder.
    const f = fwdOf(L.yaw);
    c.x = land.x - f.x * L.side * LADDER.KIP_FWD; c.z = land.z - f.z * L.side * LADDER.KIP_FWD; c.yaw = land.yaw;
    c.downUntil = t + TIMING.FALL_MS;
    c.stamina = Math.max(0, c.stamina - 20);
  }
  L.prev = { x: L.x, z: L.z, yaw: L.yaw };
  L.tip = { at: t, by: actorId, dir: { x: dx, z: dz } };
  L.x += (dx * LADDER.HEIGHT) / 2; L.z += (dz * LADDER.HEIGHT) / 2;
  Object.assign(L, { state: 'tipped', by: null, rung: 0, holder: null });
  a.busyUntil = t + TIMING.SHOVE_MS;
  return climber;
}

export function act(prev, id, action, t) {
  const noop = { state: prev, events: [] };
  const pw = prev.wrestlers[id];
  if (!pw || prev.winner || !canAct(pw, t)) return noop;
  const m = clone(prev);
  m.t_ms = t;
  const w = m.wrestlers[id], L = m.ladder, events = [];
  const situation = situationFor(prev, id, t);
  const emit = (kind, extra = {}) => {
    const e = { match: m.match, t_ms: t, actor: id, kind, situation, ...extra };
    if (e.target == null) delete e.target;
    events.push(e);
  };
  const name = (wid) => m.wrestlers[wid]?.name || wid;
  const climber = climberOf(L);
  const upright = L.state === 'standing' || L.state === 'climbed';
  const near = dist(w, L) <= LADDER.REACH;
  const ok = () => ({ state: m, events });

  switch (action) {
    case 'pickup': {
      if (climber === id || climber) return noop;
      const lying = L.state === 'on_mat' || L.state === 'tipped';
      if (!(lying && dist(w, L) <= LADDER.PICK_REACH) && !(L.state === 'standing' && near && !L.holder)) return noop;
      Object.assign(L, { state: 'carried', by: id, holder: null, tip: null, prev: null, rung: 0, x: w.x, z: w.z, yaw: w.yaw });
      w.busyUntil = t + TIMING.PICK_MS;
      return ok();
    }
    case 'drop': {
      if (!(L.state === 'carried' && L.by === id)) return noop;
      const f = fwdOf(w.yaw);
      Object.assign(L, { state: 'on_mat', by: null, x: w.x + f.x * 0.6, z: w.z + f.z * 0.6, yaw: w.yaw + Math.PI / 2 });
      return ok();
    }
    case 'setup': {
      if (!(L.state === 'carried' && L.by === id)) return noop;
      const f = fwdOf(w.yaw), lim = m.ring - 1.2;
      let x = clamp(w.x + f.x * 0.7, -lim, lim), z = clamp(w.z + f.z * 0.7, -lim, lim);
      if (Math.hypot(x - m.case.x, z - m.case.z) <= LADDER.SNAP) { x = m.case.x; z = m.case.z; }
      Object.assign(L, { state: 'standing', by: null, rung: 0, x, z, yaw: w.yaw, holder: null });
      w.busyUntil = t + TIMING.SET_MS;
      const under = underCase(m);
      emit('ladder_set', { success: under, text: under ? 'sets the ladder under the briefcase' : 'sets the ladder up, but not under the briefcase' });
      return ok();
    }
    case 'climb': {
      if (climber === id) {
        if (L.rung >= LADDER.TOP) return noop;
        L.rung += 1;
      } else if (L.state === 'standing' && near && L.holder !== id) {
        const f = fwdOf(L.yaw);
        const side = L.holder ? -L.holdSide : (Math.sign((w.x - L.x) * f.x + (w.z - L.z) * f.z) || 1);
        Object.assign(L, { state: 'climbed', by: id, rung: 1, side });
      } else return noop;
      const s = climbSpot(L, L.rung);
      w.x = s.x; w.z = s.z; w.yaw = s.yaw;
      w.stamina = Math.max(0, w.stamina - 5);
      w.busyUntil = t + TIMING.STEP_MS;
      emit('ladder_climb', { target: L.holder || undefined, success: true, text: `rung ${L.rung} of ${LADDER.TOP}${L.holder ? `, ${name(L.holder)} holding` : ''}` });
      return ok();
    }
    case 'descend': {
      if (climber !== id) return noop;
      const s = climbSpot(L, 0);
      Object.assign(L, { state: 'standing', by: null, rung: 0 });
      w.x = s.x; w.z = s.z; w.yaw = s.yaw + Math.PI;
      w.busyUntil = t + TIMING.PICK_MS;
      return ok();
    }
    case 'hold': {
      if (!upright || !near || climber === id || L.holder) return noop;
      const f = fwdOf(L.yaw);
      const side = climber ? -L.side : (Math.sign((w.x - L.x) * f.x + (w.z - L.z) * f.z) || -1);
      const s = holdSpot(L, side);
      Object.assign(L, { holder: id, holdSide: side });
      w.x = s.x; w.z = s.z; w.yaw = s.yaw;
      emit('ladder_hold', { target: climber || undefined, success: true, text: climber ? `steadies the ladder for ${name(climber)}` : 'steadies the ladder' });
      return ok();
    }
    case 'release': {
      if (L.holder !== id) return noop;
      L.holder = null;
      return ok();
    }
    case 'shove': {
      if (L.state === 'carried' && L.by !== id) {
        const c = m.wrestlers[L.by];
        if (dist(w, c) > 1.2) return noop;
        const f = fwdOf(c.yaw);
        Object.assign(L, { state: 'on_mat', by: null, x: c.x + f.x * 0.6, z: c.z + f.z * 0.6, yaw: c.yaw + Math.PI / 2 });
        c.busyUntil = t + 600;
        w.busyUntil = t + TIMING.SHOVE_MS;
        emit('ladder_tip', { target: c.id, success: true, text: `knocks the ladder out of ${name(c.id)}'s hands` });
        return ok();
      }
      if (!upright || !near || climber === id) return noop;
      if (L.holder === id) return act(prev, id, 'betray_shove', t);
      if (L.holder) {
        w.lastBlockedAt = t;
        w.busyUntil = t + TIMING.SHOVE_MS;
        emit('ladder_tip', { target: L.holder, success: false, text: `shove blocked, ${name(L.holder)} is holding the ladder` });
        return ok();
      }
      const fell = tip(m, id, t);
      emit('ladder_tip', { target: fell || undefined, success: true, text: fell ? `tips the ladder over, ${name(fell)} falls from rung ${prev.ladder.rung}` : 'tips the ladder over' });
      return ok();
    }
    case 'betray_shove': {
      if (!upright || L.holder !== id) return noop;
      const fell = tip(m, id, t);
      emit('ladder_betray', { target: fell || undefined, success: true, text: fell ? `was holding the ladder for ${name(fell)}, shoves it over from rung ${prev.ladder.rung}` : 'shoves away the ladder he was holding' });
      return ok();
    }
    case 'grab': {
      if (climber !== id || L.rung < LADDER.TOP) return noop;
      if (!underCase(m)) {
        w.busyUntil = t + TIMING.PICK_MS;
        emit('ladder_grab', { success: false, text: 'reaches, but the ladder is not under the briefcase' });
        return ok();
      }
      m.winner = id; m.case.heldBy = id;
      w.busyUntil = t + TIMING.GRAB_MS;
      emit('ladder_grab', { success: true, text: 'pulls down the briefcase and wins' });
      return ok();
    }
    case 'strike': {
      // On the mat: punch the nearest opponent in reach. From the ladder (rung 2+): kick someone at its base.
      if (t - w.lastStrikeAt < TIMING.STRIKE_CD_MS) return noop;
      const onLadder = climber === id;
      if (onLadder && L.rung < 2) return noop;
      // A hit victim gets RECOVER_MS of safety after the stun, so the same hit cannot chain into a stunlock.
      const foe = Object.values(m.wrestlers).find((o) => o.id !== id && t >= o.downUntil && t >= o.hitSafeUntil && climberOf(L) !== o.id
        && (onLadder ? dist(o, L) <= LADDER.REACH + 0.2 : dist(o, w) <= 1.2));
      if (!foe) return noop;
      w.lastStrikeAt = t;
      w.busyUntil = t + TIMING.STRIKE_MS;
      if (!onLadder) w.yaw = yawTo(foe.x - w.x, foe.z - w.z);
      // Hits in a row (the victim has not hit back since): the third is a knockdown, never another stun.
      foe.hitStreak += 1;
      w.hitStreak = 0;
      foe.lastHitAt = t;
      const knockdown = foe.hitStreak >= TIMING.COMBO_HITS;
      if (knockdown) foe.hitStreak = 0;
      foe.downUntil = t + (knockdown ? TIMING.KNOCKDOWN_MS : onLadder ? TIMING.KICK_STUN_MS : TIMING.STUN_MS);
      foe.hitSafeUntil = foe.downUntil + TIMING.RECOVER_MS;
      foe.stamina = Math.max(0, foe.stamina - (knockdown ? 18 : 10));
      let extra = knockdown ? ' and knocks them down' : '';
      if (L.state === 'carried' && L.by === foe.id) {
        const f = fwdOf(foe.yaw);
        Object.assign(L, { state: 'on_mat', by: null, x: foe.x + f.x * 0.6, z: foe.z + f.z * 0.6, yaw: foe.yaw + Math.PI / 2 });
        extra += ', the ladder hits the mat';
      }
      if (L.holder === foe.id) { L.holder = null; extra += ', the hold breaks'; }
      emit('ladder_strike', { target: foe.id, success: true, text: onLadder ? `kicks ${name(foe.id)} off the base of the ladder${knockdown ? ' and down' : ''}` : `hits ${name(foe.id)}${extra}` });
      return ok();
    }
    default:
      return noop;
  }
}

// Ground movement. mx/mz is the input direction (any length, normalized here); speed in m/s.
export function move(prev, id, mx, mz, dt, t) {
  const pw = prev.wrestlers[id];
  const len = Math.hypot(mx, mz);
  if (!pw || len < 1e-3 || prev.winner || !canAct(pw, t) || climberOf(prev.ladder) === id) return prev;
  const m = clone(prev);
  const w = m.wrestlers[id], L = m.ladder;
  const carrying = L.state === 'carried' && L.by === id;
  const speed = (w.human ? 2.6 : 2.1) * (carrying ? 0.75 : 1);
  const lim = m.ring - 0.35;
  w.x = clamp(w.x + (mx / len) * speed * dt, -lim, lim);
  w.z = clamp(w.z + (mz / len) * speed * dt, -lim, lim);
  w.yaw = yawTo(mx, mz);
  if (L.holder === id) L.holder = null; // walking away lets go
  if (L.state === 'standing' || L.state === 'climbed') {
    const d = dist(w, L);
    if (d < 0.55 && d > 1e-4) { w.x = L.x + ((w.x - L.x) / d) * 0.55; w.z = L.z + ((w.z - L.z) / d) * 0.55; }
  }
  if (carrying) { L.x = w.x; L.z = w.z; L.yaw = w.yaw; }
  return m;
}

// Scripted AI. policy: { ally?: id it will hold the ladder for, betrayAtRung?: rung at which it shoves its ally off }.
// LLM agents replace this by calling act(..., 'hold' | 'betray_shove' | ...) themselves.
export function aiDecide(m, id, t, policy = {}) {
  const w = m.wrestlers[id], L = m.ladder;
  if (!w || m.winner || !canAct(w, t)) return null;
  const climber = climberOf(L);
  // policy.contest: fight for it. Kick a foe off the base, punch a foe who has the ladder or is in the way.
  const foe = policy.contest ? Object.values(m.wrestlers).find((o) => o.id !== id && o.id !== policy.ally) : null;
  const foeUp = foe && t >= foe.downUntil && climber !== foe.id;
  const ready = t - w.lastStrikeAt >= TIMING.STRIKE_CD_MS;
  if (climber === id) {
    if (foeUp && ready && L.rung >= 2 && L.rung < LADDER.TOP && dist(foe, L) <= LADDER.REACH + 0.2) return { action: 'strike' };
    return { action: L.rung < LADDER.TOP ? 'climb' : underCase(m) ? 'grab' : 'descend' };
  }
  const justHit = t - w.lastHitAt < 2500 && w.hitStreak > 0; // hit and not yet answered: answer once, then back to the ladder
  if (foeUp && justHit && !climber && dist(w, foe) <= 1.1) {
    if (ready && t >= foe.hitSafeUntil) return { action: 'strike' }; // counter
    const dx = w.x - foe.x, dz = w.z - foe.z, d = Math.hypot(dx, dz) || 1; // back off out of reach
    return { toward: { x: w.x + (dx / d) * 1.2, z: w.z + (dz / d) * 1.2 } };
  }
  if (foeUp && ready && !climber && t >= foe.hitSafeUntil) {
    const hasIt = L.holder === foe.id;
    if (hasIt && dist(w, foe) > 1.1) return { toward: { x: foe.x, z: foe.z } };
    if (hasIt && dist(w, foe) <= 1.1) return { action: 'strike' };
  }
  if (climber) {
    if (L.holder === id) {
      if (policy.betrayAtRung != null && L.rung >= policy.betrayAtRung) return { action: 'betray_shove' };
      return null;
    }
    if (dist(w, L) > LADDER.REACH - 0.15) return { toward: { x: L.x, z: L.z } };
    return { action: policy.ally === climber ? 'hold' : 'shove' };
  }
  if (L.state === 'standing') {
    if (L.holder === id) return { action: 'release' };
    if (dist(w, L) > LADDER.REACH - 0.15) return { toward: { x: L.x, z: L.z } };
    return { action: underCase(m) ? 'climb' : 'pickup' };
  }
  if (L.state === 'carried') {
    if (L.by === id) {
      const dx = w.x - m.case.x, dz = w.z - m.case.z, d = Math.hypot(dx, dz) || 1;
      const spot = { x: m.case.x + (dx / d) * 0.6, z: m.case.z + (dz / d) * 0.6 };
      if (dist(w, spot) > 0.2) return { toward: spot };
      return { action: 'setup' };
    }
    const c = m.wrestlers[L.by];
    if (policy.contest) { // let them carry it; wait by the briefcase to fight the climb
      const dx = w.x - m.case.x, dz = w.z - m.case.z, d = Math.hypot(dx, dz) || 1;
      const spot = { x: m.case.x + (dx / d) * 1.6, z: m.case.z + (dz / d) * 1.6 };
      return dist(w, spot) > 0.3 ? { toward: spot } : null;
    }
    if (dist(w, c) > 1.05) return { toward: { x: c.x, z: c.z } };
    return { action: 'shove' };
  }
  if (dist(w, L) > LADDER.PICK_REACH - 0.2) return { toward: { x: L.x, z: L.z } };
  return { action: 'pickup' };
}

// Scenario helpers (pure) for deterministic setups.
export function withLadder(prev, patch) { const m = clone(prev); Object.assign(m.ladder, patch); return m; }
export function withWrestler(prev, id, patch) { const m = clone(prev); Object.assign(m.wrestlers[id], patch); return m; }
