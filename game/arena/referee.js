// Referee Lou Varga's body: roams the ring upright on the shared idle/walk anims (shared/anims.js, the same map
// the wrestlers use, so a clip rename in clips.glb never leaves him in the bind pose), staying side-on to the two
// wrestlers so both stay in his view, drops to the mat to count a pin (refcount) and gets back up (refrise).
// update() must run BEFORE updateMoves(): the mixer writes the clip, then a move blends over it.
//
// phase: 'roam' | 'count' | 'rise'
import * as THREE from 'three';
import { playSolo, isBusy, stopMoves } from '../moves/index.js';
import { createAnimator } from '../shared/anims.js';

const SPEED = 1.5;   // m/s walking pace
const VIEW = 2.1;    // how far off the wrestlers' line he stands

export function createReferee({ body, matY, ring, alive }) {
  const { obj, animations } = body;
  obj.traverse((o) => { if (o.isMesh && o.name.includes('Joints')) o.material.color.set(0x111111); });
  obj.scale.multiplyScalar(0.94);
  obj.position.set(0, matY, -ring + 0.55);
  const anim8 = createAnimator(obj, animations);
  let phase = 'roam';
  const want = new THREE.Vector3();
  anim8.play('idle');
  if (anim8.miss) console.warn('[referee] no clip for', anim8.miss);
  alive?.(obj, { role: 'ref' });

  // Stand on the perpendicular to the A-B line through their midpoint, on whichever side he is already on.
  function spot(A, B) {
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    let px = -(B.z - A.z), pz = B.x - A.x; const len = Math.hypot(px, pz);
    if (len < 0.2) { px = 0; pz = -1; } else { px /= len; pz /= len; }
    if ((obj.position.x - mx) * px + (obj.position.z - mz) * pz < 0) { px = -px; pz = -pz; }
    const lim = ring - 0.5;
    return want.set(THREE.MathUtils.clamp(mx + px * VIEW, -lim, lim), matY, THREE.MathUtils.clamp(mz + pz * VIEW, -lim, lim));
  }

  function update(st, dt) {
    const [A, B] = st.w;
    if (st.pin && phase !== 'count') {
      phase = 'count';
      const vic = st.w[st.pin.victim], side = Math.sign(vic.z || 1);
      const at = new THREE.Vector3(vic.x + 0.35, matY, vic.z - side * 0.75);
      stopMoves(obj); playSolo('refcount', obj, { root: { position: at, yaw: side > 0 ? 0 : Math.PI } });
    } else if (!st.pin && phase === 'count') {
      phase = 'rise';
      stopMoves(obj); // refcount holds the mat pose until released
      playSolo('refrise', obj, { root: { position: obj.position.clone().setY(matY), yaw: obj.rotation.y } });
    }
    if (phase === 'rise' && !isBusy(obj)) phase = 'roam';
    if (phase === 'roam' && !isBusy(obj)) {
      const to = spot(A, B), d = obj.position.distanceTo(to), stepLen = Math.min(d, SPEED * dt);
      if (d > 1e-3) obj.position.addScaledVector(to.sub(obj.position).normalize(), stepLen);
      obj.position.y = matY;
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
      obj.rotation.set(0, Math.atan2(mx - obj.position.x, mz - obj.position.z), 0);
      anim8.play(d > 0.12 ? 'walk' : 'idle', d > 0.12 ? 0.9 : 1);
    }
    anim8.update(dt);
  }

  // anim8 also feeds main.js's HEEL_ANIM probe; HEEL_REF lets game/tools/ref_pose_check.py read his arm bones.
  const api = { obj, anim8, update, get phase() { return phase; }, dispose() { stopMoves(obj); obj.removeFromParent(); } };
  globalThis.HEEL_REF = api;
  return api;
}
