// Referee check: drives Lou (real body, real clips, real moves and life layer, same per-frame order as main.js)
// through 6 s of roaming, a 4 s pin and 3 s after it. Asserts:
//   upright: torso (pelvis->neck) within 10 deg of vertical whenever he is not counting
//   view:    while roaming, both wrestlers sit within +-70 deg of where he faces
//   count:   during the pin his pelvis drops at least 0.3 m; 1.5 s after it he is back up and roaming
// Run (from game/): node tools/ref-check.mjs
import * as THREE from 'three';
import { loadLou, lean } from './ref-pose-probe.mjs';
import { createReferee } from '../arena/referee.js';
import { updateMoves } from '../moves/index.js';
import { createLife } from '../feel/life.js';

const MAT_Y = 1.1, RING = 3.2, DT = 1 / 30;
const bodies = await loadLou();
const life = createLife();
const ref = createReferee({ body: bodies.make('lou'), matY: MAT_Y, ring: RING, alive: life.alive });
const scene = new THREE.Scene(); scene.add(ref.obj);
const pelvis = ref.obj.getObjectByName('pelvis'), _p = new THREE.Vector3();

const fails = [];
let maxLean = 0, maxView = 0, minPelvis = Infinity, standPelvis = 0;
for (let f = 0; f < 13 * 30; f++) {
  const t = f * DT;
  // wrestlers circle each other around a drifting center
  const cx = Math.sin(t * 0.4) * 1.2, cz = Math.cos(t * 0.3) * 0.8, a = t * 0.7;
  const A = { x: cx + Math.cos(a) * 0.9, z: cz + Math.sin(a) * 0.9 }, B = { x: cx - Math.cos(a) * 0.9, z: cz - Math.sin(a) * 0.9 };
  const pin = t >= 6 && t < 10 ? { victim: 1, count: 0 } : null;
  const st = { w: [A, B], pin };
  ref.update(st, DT); updateMoves(DT); if (!process.argv.includes('--no-life')) life.update(DT, st, []);
  ref.obj.updateMatrixWorld(true);
  const py = pelvis.getWorldPosition(_p).y;
  if (t > 0.5 && t < 6) standPelvis = Math.max(standPelvis, py);
  if (pin && t > 7) minPelvis = Math.min(minPelvis, py);
  if (ref.phase === 'roam') {
    const L = lean(ref.obj); maxLean = Math.max(maxLean, L);
    if (L > 10) fails.push(`t=${t.toFixed(2)} lean ${L.toFixed(1)} deg`);
    if (t > 1.5 && (t < 6 || t > 11.5)) for (const w of [A, B]) {
      const yaw = Math.atan2(w.x - ref.obj.position.x, w.z - ref.obj.position.z) - ref.obj.rotation.y;
      const off = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(yaw), Math.cos(yaw))));
      maxView = Math.max(maxView, off);
    }
  }
  if (t > 11.5 && ref.phase !== 'roam') fails.push(`t=${t.toFixed(2)} still ${ref.phase}`);
}
const drop = standPelvis - minPelvis;
console.log(`roam max lean ${maxLean.toFixed(1)} deg; max wrestler off-axis ${maxView.toFixed(1)} deg; pelvis standing ${standPelvis.toFixed(2)} m, counting ${minPelvis.toFixed(2)} m (drop ${drop.toFixed(2)} m); final phase ${ref.phase}`);
if (maxView > 70) fails.push(`wrestler ${maxView.toFixed(0)} deg off his view axis`);
if (drop < 0.3) fails.push(`pelvis only dropped ${drop.toFixed(2)} m to count`);
if (fails.length) { console.log('FAIL\n' + [...new Set(fails)].slice(0, 8).join('\n')); process.exit(1); }
console.log('PASS');
