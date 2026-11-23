// Rig: maps a skinned humanoid to canonical bone names and applies poses.
//
// Pose convention (rig-agnostic): each bone gets an Euler [x, y, z] in degrees,
// expressed in CHARACTER space at the bind T-pose (character faces +Z, left is +X,
// up is +Y), applied as an offset from the bone's rest orientation. Children
// inherit parent motion, so "elbow bend" is always forearm Y regardless of arm.
//   left arm:   [pitch, 0, -90 + abduction]   pitch -90 = forward, -180 = overhead
//   right arm:  mirror (negate y and z)
//   forearm:    left [0, -bend, 0], right [0, +bend, 0]
//   up leg:     [pitch, 0, +-abd]  pitch negative lifts the thigh forward
//   leg (knee): [bend, 0, 0] positive bends the shin back
//   spine/neck/head: x positive bends forward
import * as THREE from 'three';

export const BONES = [
  'hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'lShoulder', 'lArm', 'lForearm', 'lHand',
  'rShoulder', 'rArm', 'rForearm', 'rHand',
  'lUpLeg', 'lLeg', 'lFoot', 'rUpLeg', 'rLeg', 'rFoot',
];

// Candidate names per canonical bone, normalized (lowercase, alphanumerics only).
// Mixamo (Xbot), Quaternius (UpperArm.L style), KayKit (upperarm.l style).
export const BONE_MAP = {
  hips: ['mixamorighips', 'hips', 'pelvis'],
  spine: ['mixamorigspine', 'spine', 'abdomen', 'spine01'],
  spine1: ['mixamorigspine1', 'spine1', 'chest', 'torso', 'spine02'],
  spine2: ['mixamorigspine2', 'spine2', 'upperchest', 'spine03'],
  neck: ['mixamorigneck', 'neck', 'neck01'],
  head: ['mixamorighead', 'head'],
  lShoulder: ['mixamorigleftshoulder', 'shoulderl', 'clavicleleft', 'claviclel'],
  lArm: ['mixamorigleftarm', 'upperarml', 'armleft', 'arml'],
  lForearm: ['mixamorigleftforearm', 'lowerarml', 'forearml'],
  lHand: ['mixamoriglefthand', 'handl', 'wristl'],
  rShoulder: ['mixamorigrightshoulder', 'shoulderr', 'clavicleright', 'clavicler'],
  rArm: ['mixamorigrightarm', 'upperarmr', 'armright', 'armr'],
  rForearm: ['mixamorigrightforearm', 'lowerarmr', 'forearmr'],
  rHand: ['mixamorigrighthand', 'handr', 'wristr'],
  lUpLeg: ['mixamorigleftupleg', 'upperlegl', 'thighl', 'uplegl'],
  lLeg: ['mixamorigleftleg', 'lowerlegl', 'shinl', 'calfl'],
  lFoot: ['mixamorigleftfoot', 'footl'],
  rUpLeg: ['mixamorigrightupleg', 'upperlegr', 'thighr', 'uplegr'],
  rLeg: ['mixamorigrightleg', 'lowerlegr', 'shinr', 'calfr'],
  rFoot: ['mixamorigrightfoot', 'footr'],
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const D2R = Math.PI / 180;
const _e = new THREE.Euler();

// Character-space offset quaternion for one bone. Accepts [x,y,z] Euler degrees
// (applied z, then y, then x about fixed axes) or ordered steps [['x',deg],['z',deg]].
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const _s = new THREE.Quaternion();
export function offsetQuat(deg, out = new THREE.Quaternion()) {
  if (Array.isArray(deg[0])) {
    out.identity();
    for (const [ax, d] of deg) out.premultiply(_s.setFromAxisAngle(AX[ax], d * D2R));
    return out;
  }
  _e.set(deg[0] * D2R, deg[1] * D2R, deg[2] * D2R, 'XYZ');
  return out.setFromEuler(_e);
}

export class Rig {
  // root: the character Object3D whose origin sits at the feet.
  constructor(root) {
    this.root = root;
    this.bones = {};
    const byName = new Map();
    root.traverse((o) => {
      if (o.isBone) byName.set(norm(o.name), o);
    });
    for (const key of BONES) {
      const hit = BONE_MAP[key].find((n) => byName.has(n));
      if (hit) this.bones[key] = byName.get(hit);
    }
    const missing = ['hips', 'spine', 'head', 'lArm', 'rArm', 'lUpLeg', 'rUpLeg'].filter((k) => !this.bones[k]);
    if (missing.length) throw new Error(`Rig: missing bones ${missing.join(', ')}`);

    // Capture rest (bind) orientation with the root at identity.
    const savedPos = root.position.clone();
    const savedQuat = root.quaternion.clone();
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    // Node TRS as loaded is the bind pose. (skeleton.pose() would drop the
    // Armature node's transform on Mixamo exports, so it is not used.)
    root.updateMatrixWorld(true);
    const rootInv = root.matrixWorld.clone().invert();
    this.rest = {};
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const [key, bone] of Object.entries(this.bones)) {
      m.multiplyMatrices(rootInv, bone.matrixWorld).decompose(p, q, s);
      const rw = q.clone();
      // local = restLocal * rw^-1 * offset * rw  ->  pre = restLocal * rw^-1
      const pre = bone.quaternion.clone().multiply(rw.clone().invert());
      this.rest[key] = { local: bone.quaternion.clone(), rw, pre, worldPos: p.clone() };
    }
    this.hipHeight = this.rest.hips.worldPos.y;
    root.position.copy(savedPos);
    root.quaternion.copy(savedQuat);
    root.updateMatrixWorld(true);
  }

  // Local quaternion for a bone given a character-space offset quaternion.
  localFor(key, offset, out) {
    const r = this.rest[key];
    return out.copy(r.pre).multiply(offset).multiply(r.rw);
  }

  snapshot() {
    const snap = {};
    for (const [k, b] of Object.entries(this.bones)) snap[k] = b.quaternion.clone();
    return snap;
  }

  resetToRest() {
    for (const [k, b] of Object.entries(this.bones)) b.quaternion.copy(this.rest[k].local);
  }
}
