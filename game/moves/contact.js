// Contact solving for paired moves: hands land on the body they hold, whatever the bodies' proportions.
//
// A move lists contacts (moves.js):
//   { by: 'attacker'|'victim', hand: 'l'|'r', on: '<canonical bone of the other actor>',
//     at: [x, y, z],   offset from that bone in the other actor's character space (meters at REF_HIP)
//     t: [t0, t1] }    window in move seconds (eased in/out over FADE at each end)
// and optional grips that carry the victim with the attacker's hands:
//   { t: [t0, t1], axes: 'xyz'|'xz' }
// Each frame, after the keyed poses are applied:
//   1. grip: translate the victim so its attacker-held contact points sit, on average, where the
//      attacker's keyed hands are (the victim cannot drift off the hold);
//   2. two-bone IK puts every contact hand exactly on its point (shoulder-elbow-wrist, bend plane kept).
import * as THREE from 'three';

export const REF_HIP = 1.04;
const FADE = 0.12;
const smooth = (u) => u * u * (3 - 2 * u);

// 0..1 weight of a window at time t, eased over FADE at both ends.
export function windowWeight([t0, t1], t) {
  if (t <= t0 || t >= t1) return 0;
  const f = Math.min(FADE, (t1 - t0) / 2);
  return smooth(Math.min(1, (t - t0) / f, (t1 - t) / f));
}

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
const _v = new THREE.Vector3();

// World point of a contact: bone position + offset in that body's current character frame.
// The frame is bone world rotation * (rest world rotation)^-1, so authored offsets are rig-agnostic.
export function contactPoint(rig, bone, at, out = new THREE.Vector3()) {
  const node = rig.bones[bone];
  node.getWorldPosition(out);
  if (!at) return out;
  node.getWorldQuaternion(_wq);
  rig.root.getWorldQuaternion(_pq);
  // rest.rw is relative to the root; bring it to world with the root's rotation.
  _q.copy(_pq).multiply(rig.rest[bone].rw).invert();
  const frame = _wq.multiply(_q);
  const s = rig.hipHeight / REF_HIP;
  _v.set(at[0] * s, at[1] * s, at[2] * s).applyQuaternion(frame);
  return out.add(_v);
}

// Rotate a bone (in world space) by the rotation taking direction `from` onto `to`.
function aim(bone, from, to) {
  _q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  bone.parent.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_wq);
  bone.quaternion.copy(_pq.invert().multiply(_q).multiply(_wq));
  bone.updateMatrixWorld(true);
}

const S = new THREE.Vector3(), E = new THREE.Vector3(), W = new THREE.Vector3(), T = new THREE.Vector3();
// Analytic two-bone IK: move the wrist of (upper, fore, hand) to `target`, keeping the elbow's bend side.
export function solveArm(upper, fore, hand, target, weight = 1) {
  upper.getWorldPosition(S); fore.getWorldPosition(E); hand.getWorldPosition(W);
  T.copy(W).lerp(target, weight);
  const a = S.distanceTo(E), b = E.distanceTo(W);
  const st = T.clone().sub(S);
  const d = THREE.MathUtils.clamp(st.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const u = st.normalize();
  // Bend direction: where the elbow is now, off the shoulder->target line; fall back to down.
  const se = E.clone().sub(S);
  let v = se.clone().addScaledVector(u, -se.dot(u));
  if (v.lengthSq() < 1e-8) v.set(0, -1, 0).addScaledVector(u, u.y);
  v.normalize();
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const elbow = S.clone().addScaledVector(u, x).addScaledVector(v, h);
  aim(upper, se, elbow.clone().sub(S));
  fore.getWorldPosition(E); hand.getWorldPosition(W);
  const wrist = S.clone().addScaledVector(u, d);
  aim(fore, W.clone().sub(E), wrist.sub(E));
}

const ARM = { l: ['lArm', 'lForearm', 'lHand'], r: ['rArm', 'rForearm', 'rHand'] };

// Last solved errors, for verification (lab.contacts()).
export const lastReport = [];

// Apply a play's contacts at move time t. actors: { attacker: actor, victim: actor } (actor has obj, rig).
export function solveContacts(move, roles, t) {
  lastReport.length = 0;
  if (!move.contacts?.length) return;
  const other = { attacker: roles.victim, victim: roles.attacker };
  const live = move.contacts.map((c) => ({ c, w: windowWeight(c.t, t) })).filter((x) => x.w > 0);
  if (!live.length) return;
  const A = roles.attacker.obj, V = roles.victim.obj;
  A.updateMatrixWorld(true); V.updateMatrixWorld(true);

  const grip = (move.grips || []).map((g) => ({ g, w: windowWeight(g.t, t) })).find((x) => x.w > 0);
  // Victim translation that brings its held points onto the hands (and its own hands onto the
  // attacker), averaged over every live contact.
  const gripDelta = () => {
    const delta = new THREE.Vector3();
    for (const { c } of live) {
      const me = roles[c.by], them = other[c.by];
      const hand = me.rig.bones[ARM[c.hand][2]].getWorldPosition(new THREE.Vector3());
      const d = hand.sub(contactPoint(them.rig, c.on, c.at));
      delta.add(c.by === 'attacker' ? d : d.negate());
    }
    delta.multiplyScalar(grip.w / live.length);
    if (grip.g.axes === 'xz') delta.y = 0;
    return delta;
  };
  const moveVictim = (delta) => {
    const local = V.parent ? V.parent.worldToLocal(V.getWorldPosition(new THREE.Vector3()).add(delta)) : V.position.clone().add(delta);
    V.position.copy(local);
    V.updateMatrixWorld(true);
  };
  const ik = () => {
    // Attacker first: the victim's targets sit on the attacker's neck/torso, which arm IK leaves alone.
    for (const role of ['attacker', 'victim']) {
      for (const { c, w } of live) {
        if (c.by !== role) continue;
        const me = roles[role], them = other[role];
        const [u, f, h] = ARM[c.hand].map((k) => me.rig.bones[k]);
        if (!u || !f || !h || !them.rig.bones[c.on]) continue;
        solveArm(u, f, h, contactPoint(them.rig, c.on, c.at), w);
      }
    }
  };

  // 1. Grip: carry the victim with the keyed hands; 2. IK; then settle any out-of-reach residue by
  // moving the victim on the residual and solving again (a few passes converge for reachable holds).
  if (grip) moveVictim(gripDelta());
  ik();
  for (let pass = 0; grip && pass < 4; pass++) { moveVictim(gripDelta()); ik(); }

  for (const { c, w } of live) {
    const me = roles[c.by], them = other[c.by];
    const h = me.rig.bones[ARM[c.hand][2]];
    if (!h || !them.rig.bones[c.on]) continue;
    lastReport.push({ by: c.by, hand: c.hand, on: c.on, w, err: h.getWorldPosition(new THREE.Vector3()).distanceTo(contactPoint(them.rig, c.on, c.at)) });
  }
}
