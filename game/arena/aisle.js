// The entrance stage and aisle: a raised stage with a lit backdrop screen (the wrestler's entrance card) behind the
// far-right corner, a ramp down to a runner on the floor, and ring steps at that corner. The stands and the crowd
// leave a gap for it (inGap). path(mark) is the walk an entrance follows: stage mark, down the ramp, along the aisle,
// up the steps (climb: true), through the ropes, to the wrestler's mark.
//   const aisle = createAisle({ scene, matY, ring });  aisle.setCard(texture); aisle.path(markVec3) -> [{ p, climb }]
import * as THREE from 'three';

export const AISLE_THETA = (3 * Math.PI) / 4;   // radial direction of the aisle (three's y rotation: +z -> (sin, 0, cos))
export const AISLE_GAP = 0.3;                    // half-width of the gap in the stands, radians
const STAGE_H = 0.45;

// is world (x, z) inside the aisle's wedge? (the crowd and the stands skip it)
export function inGap(x, z) {
  const a = Math.atan2(x, z);
  let d = Math.abs(a - AISLE_THETA) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d < AISLE_GAP;
}

// local (lateral, radial) -> world, y kept
const S = Math.sin(AISLE_THETA), C = Math.cos(AISLE_THETA);
const toWorld = (lat, r, y) => new THREE.Vector3(lat * C + r * S, y, -lat * S + r * C);

export function createAisle({ scene, matY, ring }) {
  const g = new THREE.Group(); g.name = 'EntranceAisle'; g.rotation.y = AISLE_THETA;
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.55, metalness: 0.3 });
  const runner = new THREE.MeshStandardMaterial({ color: 0x3a0a10, roughness: 0.7, emissive: 0x2a0508, emissiveIntensity: 0.4 });
  const led = new THREE.MeshBasicMaterial({ color: 0xf5c542 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.receiveShadow = true; g.add(b); return b; };

  // aisle runner with LED edge strips, from the steps out to the ramp
  box(1.6, 0.04, 5.0, runner, 0, 0.02, 8.3);
  box(0.05, 0.05, 5.0, led, -0.82, 0.03, 8.3); box(0.05, 0.05, 5.0, led, 0.82, 0.03, 8.3);
  // ramp up to the stage
  const rl = Math.hypot(1.2, STAGE_H), ramp = box(1.6, 0.06, rl, runner, 0, STAGE_H / 2, 11.4);
  ramp.rotation.x = -Math.atan2(STAGE_H, 1.2);
  // stage deck with a lit front lip
  box(4.6, STAGE_H, 2.6, dark, 0, STAGE_H / 2, 13.3);
  box(4.6, 0.05, 0.05, led, 0, STAGE_H - 0.02, 12.0);
  // backdrop: frame + screen (the entrance card), facing the ring
  box(4.9, 3.6, 0.2, dark, 0, STAGE_H + 1.8, 14.7);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.48), screenMat);
  scr.position.set(0, STAGE_H + 1.85, 14.58); scr.rotation.y = Math.PI; g.add(scr);
  const glow = new THREE.PointLight(0xffffff, 12, 6); glow.position.set(0, STAGE_H + 1.8, 13.6); g.add(glow);
  // ring steps at the corner, three treads up to the apron
  for (let k = 0; k < 3; k++) { const h = matY * (3 - k) / 3; box(1.1, h, 0.32, dark, 0, h / 2, 5.25 + k * 0.32); }
  scene.add(g);

  const path = (mark) => [
    { p: toWorld(0, 13.4, STAGE_H) },                // stage mark
    { p: toWorld(0, 12.0, STAGE_H) },                // stage front
    { p: toWorld(0, 10.8, 0) },                      // foot of the ramp
    { p: toWorld(0, 6.05, 0) },                      // foot of the steps
    { p: toWorld(0, 5.25, matY), climb: true },      // up the steps
    { p: toWorld(-0.5, 4.6, matY), climb: true },    // onto the apron beside the post
    { p: toWorld(-0.55, 3.9, matY), climb: true },   // through the ropes
    { p: new THREE.Vector3(mark.x, matY, mark.z) },  // to the mark
  ];

  return {
    group: g, stageMark: toWorld(0, 13.4, STAGE_H), stageH: STAGE_H,
    // low camera on the aisle floor, looking back up at the stage
    stageCam: toWorld(0.9, 10.2, 0.75),
    setCard(tex) { screenMat.map = tex; screenMat.needsUpdate = true; glow.intensity = tex ? 12 : 0; },
    setGlow(color) { glow.color.set(color); },
    path,
  };
}
