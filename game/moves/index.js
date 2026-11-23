// Paired-move director. Call updateMoves(dt) every frame AFTER mixer.update(dt):
// the mixer keeps driving idle/walk, and an active move blends over it.
//
//   playPaired(moveId, attackerObj, victimObj, { onImpact, onCamera, onEvent, onEnd })
//   playSolo(moveId, obj, { onImpact, onCamera, onEvent, onEnd, root })
//   updateMoves(dt)  isBusy(obj)  stopMoves(obj)  MOVES  POSES
//
// obj is a character root whose origin is at the feet (e.g. a gltf.scene).
import * as THREE from 'three';
import { Rig, BONES, offsetQuat } from './rig.js';
import { POSES, mirror } from './poses.js';
import { MOVES } from './moves.js';

export { MOVES, POSES, mirror, Rig };

// Root offsets are authored for Xbot (pelvis ~1.0 m); other rigs scale by hip height.
const REF_HIP = 1.04;
const BLEND_IN = 0.14;
const BLEND_OUT = 0.22;
const D2R = Math.PI / 180;
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export const EASE = {
  linear: (u) => u,
  inQuad: (u) => u * u,
  outQuad: (u) => 1 - (1 - u) * (1 - u),
  inCubic: (u) => u * u * u,
  outCubic: (u) => 1 - Math.pow(1 - u, 3),
  inOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
  inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  outBack: (u) => { const c = 1.6; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
};
const smooth = (u) => u * u * (3 - 2 * u);

function rootQuat(steps = []) {
  const q = new THREE.Quaternion();
  const r = new THREE.Quaternion();
  for (const [ax, deg] of steps) q.premultiply(r.setFromAxisAngle(AXES[ax], deg * D2R));
  return q;
}

// Compile keys once per track: pose names -> character-space offset quaternions.
const compiled = new WeakMap();
function compile(keys) {
  if (compiled.has(keys)) return compiled.get(keys);
  let p = [0, 0, 0], r = [];
  const out = keys.map((key) => {
    if (key.p) p = key.p;
    if (key.r) r = key.r;
    const pose = typeof key.pose === 'string' ? POSES[key.pose] : key.pose;
    if (!pose) throw new Error(`moves: unknown pose ${key.pose}`);
    const off = {};
    for (const [bone, deg] of Object.entries(pose)) off[bone] = offsetQuat(deg);
    return { t: key.t, ease: EASE[key.ease] || EASE.inOutSine, off, p: new THREE.Vector3(...p), q: rootQuat(r) };
  });
  compiled.set(keys, out);
  return out;
}

const _off = new THREE.Quaternion();
const _loc = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

function segment(keys, t) {
  const last = keys.length - 1;
  if (t >= keys[last].t) return [keys[last], keys[last], 1];
  let i = 0;
  while (i < last && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  return [a, b, b.ease((t - a.t) / (b.t - a.t))];
}

function keyMatrix(rig, p, q, out) {
  const s = rig.hipHeight / REF_HIP;
  const pivot = new THREE.Vector3(0, rig.hipHeight, 0);
  const m = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  const rot = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const tr = new THREE.Matrix4().makeTranslation(p.x * s, p.y * s + pivot.y, p.z * s);
  return out.copy(tr).multiply(rot).multiply(m);
}

// Move root = floor position + yaw only, chosen so the track's first key lines up
// with where the body is now.
function alignRoot(obj, rig, firstKey) {
  obj.updateMatrixWorld(true);
  const k0 = keyMatrix(rig, firstKey.p, firstKey.q, new THREE.Matrix4());
  const m = obj.matrixWorld.clone().multiply(k0.invert());
  const pos = new THREE.Vector3().setFromMatrixPosition(m);
  const fwd = new THREE.Vector3(0, 0, 1).transformDirection(m);
  const yaw = Math.atan2(fwd.x, fwd.z);
  return new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(AXES.y, yaw), new THREE.Vector3(1, 1, 1));
}

function rootFrom(root) {
  if (!root) return null;
  if (root.isMatrix4) return root;
  const pos = root.position ? new THREE.Vector3().copy(root.position) : new THREE.Vector3();
  return new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(AXES.y, root.yaw || 0), new THREE.Vector3(1, 1, 1));
}

export function getRig(obj) {
  if (!obj.userData.__rig) obj.userData.__rig = new Rig(obj);
  return obj.userData.__rig;
}

const plays = new Set();

function detach(obj) {
  for (const play of plays) {
    play.actors = play.actors.filter((a) => a.obj !== obj);
    if (!play.actors.length) plays.delete(play);
  }
}

function makeActor(obj, keys, hold, moveRoot) {
  const rig = getRig(obj);
  const ck = compile(keys);
  obj.updateMatrixWorld(true);
  return {
    obj, rig, keys: ck, hold,
    moveRoot: moveRoot || alignRoot(obj, rig, ck[0]),
    snap: rig.snapshot(),
    startPos: obj.position.clone(),
    startQuat: obj.quaternion.clone(),
  };
}

function start(move, moveId, actors, opts) {
  const play = { id: moveId, move, t: 0, hitstop: 0, fired: 0, ended: false, actors, opts };
  play.events = [...(move.events || [])].sort((a, b) => a.t - b.t);
  plays.add(play);
  return { stop: () => plays.delete(play), get time() { return play.t; } };
}

export function playPaired(moveId, attacker, victim, opts = {}) {
  const move = MOVES[moveId];
  if (!move || move.kind !== 'paired') throw new Error(`moves: no paired move ${moveId}`);
  detach(attacker); detach(victim);
  // anchor 'victim': ground moves (pin) build the move root from where the downed
  // victim lies, so the attacker comes to them instead of the victim sliding.
  let root = rootFrom(opts.root);
  if (!root && move.anchor === 'victim') root = alignRoot(victim, getRig(victim), compile(move.victim)[0]);
  const a = makeActor(attacker, move.attacker, move.hold?.attacker, root);
  a.role = 'attacker';
  const v = makeActor(victim, move.victim, move.hold?.victim, a.moveRoot);
  v.role = 'victim';
  return start(move, moveId, [a, v], { ...opts, attacker, victim });
}

export function playSolo(moveId, obj, opts = {}) {
  const move = MOVES[moveId];
  if (!move || move.kind !== 'solo') throw new Error(`moves: no solo move ${moveId}`);
  detach(obj);
  const a = makeActor(obj, move.track, move.hold, rootFrom(opts.root));
  a.role = 'self';
  return start(move, moveId, [a], { ...opts, attacker: obj });
}

export const isBusy = (obj) => [...plays].some((p) => !p.ended && p.actors.some((a) => a.obj === obj));
export const stopMoves = (obj) => detach(obj);

const _world = new THREE.Matrix4();
const _km = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _rq = new THREE.Quaternion();
const _sc = new THREE.Vector3();

function fire(play, ev) {
  const o = play.opts;
  const info = { move: play.id, event: ev, attacker: o.attacker, victim: o.victim };
  if (ev.type === 'impact') {
    play.hitstop = ev.hitstop ?? 0.075;
    o.onImpact?.({ ...info, damage: ev.damage || 0 });
  }
  if (ev.cue) o.onCamera?.(ev.cue, info);
  o.onEvent?.(ev, info);
}

function applyActor(actor, play, t) {
  const { obj, rig, keys } = actor;
  const dur = play.move.duration;
  const [a, b, e] = segment(keys, Math.min(t, dur));
  let wIn = smooth(Math.min(1, t / BLEND_IN));
  let wOut = 1;
  if (t > dur && !actor.hold) wOut = 1 - smooth(Math.min(1, (t - dur) / BLEND_OUT));

  for (const bone of BONES) {
    const node = rig.bones[bone];
    const qa = a.off[bone], qb = b.off[bone];
    if (!node || !qa || !qb) continue;
    _off.slerpQuaternions(qa, qb, e);
    rig.localFor(bone, _off, _loc);
    if (wIn < 1) node.quaternion.slerpQuaternions(actor.snap[bone], _loc, wIn);
    else node.quaternion.slerp(_loc, wOut);
  }

  _p.lerpVectors(a.p, b.p, e);
  _q.slerpQuaternions(a.q, b.q, e);
  keyMatrix(rig, _p, _q, _km);
  _world.multiplyMatrices(actor.moveRoot, _km);
  if (obj.parent) _world.premultiply(obj.parent.matrixWorld.clone().invert());
  _world.decompose(_pos, _rq, _sc);
  if (wIn < 1) {
    obj.position.lerpVectors(actor.startPos, _pos, wIn);
    obj.quaternion.slerpQuaternions(actor.startQuat, _rq, wIn);
  } else {
    obj.position.copy(_pos);
    obj.quaternion.copy(_rq);
  }
  return t > dur + BLEND_OUT && !actor.hold;
}

export function updateMoves(dt) {
  for (const play of [...plays]) {
    if (play.hitstop > 0) play.hitstop = Math.max(0, play.hitstop - dt);
    else {
      play.t += dt;
      while (play.fired < play.events.length && play.events[play.fired].t <= play.t) fire(play, play.events[play.fired++]);
      if (!play.ended && play.t >= play.move.duration) {
        play.ended = true;
        play.opts.onEnd?.({ move: play.id, attacker: play.opts.attacker, victim: play.opts.victim });
      }
    }
    play.actors = play.actors.filter((actor) => !applyActor(actor, play, play.t));
    if (!play.actors.length) plays.delete(play);
  }
}

// True while any play is frozen in hitstop (lets a game freeze mixers/particles too).
export const inHitstop = () => [...plays].some((p) => p.hitstop > 0);
