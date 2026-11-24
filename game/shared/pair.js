// Committed paired moves (exhibition): the animation owns the timing, the sim waits for it.
// A grapple near the rival starts a lock-up; a choice in the lock-up (strike, grapple, block) resolves into ONE
// paired move that plays to completion. Both wrestlers are frozen in state 'paired' for the move's duration and
// the damage lands on the move's own impact frame (moves/moves.js events), so the bodies never chase the sim.
// Online matches never set m.committed, so the arena server keeps the old sim path untouched.
//
// m.pair = { seq, phase: 'lockup'|'move', move, att, def, t, dur, hits: [{ t, dmg }], next,
//            root: { x, z, yaw }, pick: [kind|null, kind|null], fin }
// The client plays MOVES[move] on root with its clock bound to m.pair.t (moves/index.js opts.clock).
import { MOVES } from '../moves/moves.js';
import { impact } from './drama.js';

const RING = 3.2, MAT_Y = 1.1;
const LOCK_RANGE = 1.6;
const COUNTER = { strike: 'block', grapple: 'strike', block: 'grapple' }; // COUNTER[x] beats x
const GRAPPLES = ['bodyslam', 'suplex', 'ddt'];
const RECOVER = 0.35; // attacker's settle after a move, before it can act again
const emit = (m, e) => m.events.push(e);
const short = (w) => w.name.split(' ').slice(-1)[0].replace(/"/g, '');
const fact = (m, kind, actor, target, extra = {}) =>
  m.events.push({ k: 'fact', t_ms: Math.round(m.clock * 1000), kind, actor, target, situation: 'opening', ...extra });
function anim(w, name, speed = 1) {
  if (w.anim === name) { w.animSpeed = speed; return; }
  w.anim = name; w.animSpeed = speed; w.animSeq++;
}

// Floor point of a track key on the move root (Xbot scale; the client writes the drawn body back at the end).
function keyPoint(root, key) {
  const [px, , pz] = key.p || [0, 0, 0];
  const c = Math.cos(root.yaw), s = Math.sin(root.yaw);
  return { x: root.x + px * c + pz * s, z: root.z - px * s + pz * c };
}
const lastP = (track) => { let p = [0, 0, 0]; for (const k of track) if (k.p) p = k.p; return { p }; };
const inside = (pt) => Math.max(Math.abs(pt.x), Math.abs(pt.z)) < RING - 0.4;
const hitsOf = (move) => (move.events || []).filter((e) => e.type === 'impact' && e.damage > 0).map((e) => ({ t: e.t, dmg: e.damage }));

function freeze(w) { w.state = 'paired'; w.vx = 0; w.vz = 0; w.t = 0; anim(w, 'Paired'); }

function begin(m, phase, move, att, def, root, extra = {}) {
  const mv = MOVES[move];
  m.pairSeq = (m.pairSeq || 0) + 1;
  m.pair = { seq: m.pairSeq, phase, move, att, def, t: 0, dur: mv.duration, hits: hitsOf(mv), next: 0, root, pick: [null, null], ...extra };
  freeze(m.w[att]); freeze(m.w[def]);
  m.w[att].facing = root.yaw; m.w[def].facing = root.yaw + Math.PI;
  emit(m, { k: 'pair', seq: m.pairSeq, move, att, def, root: { ...root }, phase });
}

// Grapple input near a free rival: start the lock-up. Returns true when it started.
export function tryLockup(m, i) {
  if (!m.committed || m.pair || m.over) return false;
  const a = m.w[i], d = m.w[1 - i];
  if (a.state !== 'idle' && a.state !== 'block') return false;
  if (['down', 'thrown', 'pinned', 'pinning', 'out', 'paired', 'whipped', 'rebound', 'intro', 'getup'].includes(d.state) || d.out) return false;
  const dx = d.x - a.x, dz = d.z - a.z, gap = Math.hypot(dx, dz);
  if (gap > LOCK_RANGE) return false;
  const yaw = Math.atan2(dx, dz), half = 0.65; // the lock-up track starts the bodies 1.3 m apart: meet in the middle
  const mx = (a.x + d.x) / 2, mz = (a.z + d.z) / 2;
  a.st -= MOVES.lockup.meta.stamina;
  begin(m, 'lockup', 'lockup', i, 1 - i, { x: mx - Math.sin(yaw) * half, z: mz - Math.cos(yaw) * half, yaw });
  emit(m, { k: 'call', text: `${short(a)} and ${short(d)} lock up in the middle of the ring!` });
  fact(m, 'lockup', i, 1 - i);
  return true;
}

// A strike/grapple/block pressed by either wrestler while locked up. Returns true when it was consumed.
export function pairInput(m, i, kind) {
  const p = m.pair;
  if (!p || (i !== p.att && i !== p.def)) return false;
  if (p.phase === 'lockup' && COUNTER[kind] && !p.pick[i]) p.pick[i] = kind;
  return true; // inputs during a committed move are swallowed, never buffered into a pop
}

// The AI's lock-up decision (same system as the human): read its plan intent, answer it.
export function aiPair(m, i) {
  const p = m.pair;
  if (!p || p.phase !== 'lockup' || p.pick[i]) return;
  const r = Math.random(), intent = m.aiIntent || 'pressure';
  if (i === p.att) {
    if (p.t < 0.5 + (p.seq % 3) * 0.12) return;
    p.pick[i] = intent === 'counter_strike' ? 'grapple' : r < 0.65 ? 'grapple' : 'strike';
  } else if (p.t > 0.3 && p.t < 0.34) {
    const guess = intent.startsWith('counter_') ? intent.slice(8) : null;
    if (guess && COUNTER[guess] && r < 0.6) p.pick[i] = COUNTER[guess];
    else if (r < 0.3) p.pick[i] = ['strike', 'grapple', 'block'][Math.floor(Math.random() * 3)];
  }
}

function resolveLockup(m) {
  const p = m.pair, a = p.pick[p.att], d = p.pick[p.def];
  let who = -1, what = null, reversal = false;
  if (a && d && COUNTER[a] === d) { who = p.def; what = d; reversal = true; }
  else if (a) { who = p.att; what = a; }
  else if (d) { who = p.def; what = d; }
  const W = m.w[who] || null, L = who >= 0 ? m.w[1 - who] : null;
  // the attacker of the follow-up stands where the lock-up track left him (z 0.3 on the lock-up root)
  const base = p.root, fwd = (who === p.att || who < 0) ? 1 : -1;
  const yaw = fwd > 0 ? base.yaw : base.yaw + Math.PI;
  const at = keyPoint(base, { p: [0, 0, who === p.def ? 0.96 : 0.3] });
  const root = { x: at.x, z: at.z, yaw };
  if (reversal && W) { W.stats.reversals++; fact(m, 'reversal', who, 1 - who); emit(m, { k: 'banner', text: 'REVERSAL!', secs: 0.9 }); }
  if (!W || what === 'block') return breakApart(m, who);
  if (what === 'strike') {
    W.stats.strikes++; fact(m, 'strike', who, 1 - who, { success: true });
    emit(m, { k: 'call', text: `${short(W)} drives a knee into ${short(L)} out of the tie-up!` });
    return begin(m, 'move', 'lockknee', who, 1 - who, root);
  }
  // grapple: the finisher at full meter, else a slam that fits inside the ropes from this root
  W.stats.grapples++;
  const fin = W.mo >= 100;
  // demo matches (m.demo, game/demo.js) keep to the body slam, whose contact holds for the whole move
  const allowed = m.demo ? ['bodyslam'] : GRAPPLES;
  const fits = allowed.filter((id) => inside(keyPoint(root, lastP(MOVES[id].victim))));
  if (m.demo && !fits.length) return begin(m, 'move', 'lockknee', who, 1 - who, root);
  const pool = m.demo ? fits : fin ? ['suplex'] : (fits.length ? fits : ['ddt']);
  const id = pool[Math.floor(Math.random() * pool.length)];
  W.mo = fin ? 0 : Math.min(100, W.mo + 18);
  fact(m, 'grapple', who, 1 - who, { success: true, ...(fin ? { finisher: true } : {}) });
  if (fin) { emit(m, { k: 'banner', text: 'FINISHER!', secs: 1.4 }); emit(m, { k: 'finisher' }); emit(m, { k: 'call', text: `${short(W)} hits the HEEL TURN DRIVER! The building shakes!` }); }
  else emit(m, { k: 'call', text: `${short(W)} with a ${MOVES[id].label.toLowerCase()}!` });
  begin(m, 'move', id, who, 1 - who, root, { fin });
}

// Nobody committed (or a block won): shove apart, both back to neutral.
function breakApart(m, who) {
  const p = m.pair, A = m.w[p.att], D = m.w[p.def];
  const c = Math.cos(p.root.yaw), s = Math.sin(p.root.yaw);
  const ap = keyPoint(p.root, { p: [0, 0, 0.3] }), dp = keyPoint(p.root, { p: [0, 0, 0.96] });
  A.x = ap.x; A.z = ap.z; D.x = dp.x; D.z = dp.z;
  A.vx = -s * 2.4; A.vz = -c * 2.4; D.vx = s * 2.4; D.vz = c * 2.4;
  for (const w of [A, D]) { w.state = 'rec'; w.t = RECOVER; anim(w, 'Idle'); }
  if (who >= 0) { const L = m.w[1 - who]; L.state = 'stun'; L.t = 0.5; m.blockT = 1.5; emit(m, { k: 'call', text: `${short(m.w[who])} blocks it and shoves ${short(L)} away!` }); }
  else emit(m, { k: 'call', text: 'They break the tie-up.' });
  emit(m, { k: 'pairEnd', seq: p.seq, move: p.move });
  m.pair = null;
}

function landHit(m, h) {
  const p = m.pair, att = m.w[p.att], def = m.w[p.def];
  const dmg = p.fin ? 28 : h.dmg;
  def.hp = Math.max(0, def.hp - dmg);
  att.mo = Math.min(100, att.mo + (p.move === 'lockknee' ? 12 : 0));
  def.mo = Math.min(100, def.mo + 4);
  impact(m, def, att, p.move === 'lockknee' ? 'strike' : p.fin ? 'finisher' : 'slam', dmg);
  emit(m, { k: 'shake', v: p.move === 'lockknee' ? 0.15 : 0.4 });
}

function finish(m) {
  const p = m.pair, att = m.w[p.att], def = m.w[p.def], mv = MOVES[p.move];
  const ap = keyPoint(p.root, lastP(mv.attacker)), dp = keyPoint(p.root, lastP(mv.victim));
  att.x = ap.x; att.z = ap.z; def.x = dp.x; def.z = dp.z; att.y = def.y = MAT_Y;
  att.state = 'rec'; att.t = RECOVER; anim(att, 'Idle');
  if (p.move === 'lockknee') { def.state = 'stun'; def.t = 0.45; anim(def, 'Idle'); }
  else {
    // get-up timing scales with the damage taken, like the reference (a big slam keeps you down longer)
    def.state = 'down'; def.t = 1.8 + (100 - def.hp) / 45; anim(def, 'Down');
    fact(m, 'knockdown', p.att, p.def);
  }
  emit(m, { k: 'pairEnd', seq: p.seq, move: p.move });
  m.pair = null;
}

// Advance the committed move clock. Called from step() only while m.pair is set (and the sim is not in hitstop).
export function pairStep(m, dt) {
  const p = m.pair;
  p.t += dt;
  if (p.phase === 'lockup') {
    const a = p.pick[p.att], d = p.pick[p.def];
    if ((a && p.t >= 0.6) || (d && !a && p.t >= 1.1)) return resolveLockup(m);
    if (p.t >= p.dur) return resolveLockup(m);
    return;
  }
  while (p.next < p.hits.length && p.hits[p.next].t <= p.t) landHit(m, p.hits[p.next++]);
  if (m.pair === p && p.t >= p.dur) finish(m);
}
