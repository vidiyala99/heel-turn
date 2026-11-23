// Entrance check: drives feel/entrance.js on the real body/clips for a vex-vs-kane exhibition, without a GPU.
// Asserts: each wrestler's entrance runs 6-8 s, the walker ends on their sim start mark, the camera stays low
// (below chest height) during the walk, the screen shows their card, the announcer gets opener + 2 intros,
// the bell is released at the end (match.introT ~0), and finish() (what Enter calls) ends it at once.
// Run (from game/): node tools/entrance-check.mjs
import * as THREE from 'three';
import { loadLou } from './ref-pose-probe.mjs';
import { createEntrance } from '../feel/entrance.js';
import { updateMoves } from '../moves/index.js';
import { createMatch } from '../shared/sim.js';

const MAT_Y = 1.1, RING = 3.2, DT = 1 / 30;
const bodies = await loadLou();
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial());

async function run(skipAt) {
  const match = createMatch('vex', 'kane');
  const views = match.w.map((w) => {
    const { obj, animations } = bodies.make(w.id); scene.add(obj);
    const mixer = new THREE.AnimationMixer(obj);
    return { id: w.id, root: obj, holder: obj, mixer, actions: Object.fromEntries(animations.map((c) => [c.name, mixer.clipAction(c)])), cur: null };
  });
  const play = (v, n) => { const a = v.actions[n]; if (a && v.cur !== a) { a.reset().play(); v.cur?.stop(); v.cur = a; } };
  const said = [], stings = [];
  const layer = { announce: (l) => { said.push(l.text); return Promise.resolve(); }, swell() {}, sting: (id) => stings.push(id) };
  const ent = createEntrance({ scene, camera, screen, matY: MAT_Y, ring: RING, getViews: () => views, play, layer, cardLoader: (id) => ({ id }) });
  ent.start(match);
  const per = [], fails = [];
  let t = 0, k = -1, kStart = 0, maxCamY = 0, walking = null;
  while (ent.active && t < 30) {
    const slot = ent.active ? (screen.material.map?.id === 'kane' ? 1 : 0) : null;
    if (slot !== k) { if (k >= 0) per.push(+(t - kStart).toFixed(2)); k = slot; kStart = t; walking = slot; }
    if (skipAt && t >= skipAt) { ent.finish(); break; }
    views.forEach((v) => v.mixer.update(DT));
    ent.frame(DT); updateMoves(DT); t += DT; await null; // let queued announcer lines run
    if (t - kStart < 2.5) maxCamY = Math.max(maxCamY, camera.position.y);
  }
  if (!skipAt) per.push(+(t - kStart).toFixed(2));
  return { match, per, t, maxCamY, said, stings, views, fails };
}

const fails = [];
const a = await run();
console.log(`entrance times per wrestler (kane, vex): ${a.per.join(' s, ')} s; total ${a.t.toFixed(2)} s; max camera y during walk ${a.maxCamY.toFixed(2)} m (mat ${MAT_Y}); stings ${a.stings.join(',')}`);
console.log('announcer:', a.said.length, 'lines |', a.said.join(' | '));
for (const s of a.per) if (s < 6 || s > 8) fails.push(`entrance took ${s} s`);
if (a.maxCamY > MAT_Y + 1.2) fails.push(`camera not low-angle: ${a.maxCamY.toFixed(2)}`);
if (a.said.length !== 3 || !a.said[1].includes('KANE')) fails.push(`announcer lines ${a.said.length}`);
if (a.match.introT > 0.02) fails.push(`bell not released, introT ${a.match.introT}`);
a.views.forEach((v, i) => { const w = a.match.w[i]; const d = Math.hypot(v.root.position.x - w.x, v.root.position.z - w.z); if (d > 0.05) fails.push(`${w.id} ${d.toFixed(2)} m off mark`); });
const b = await run(2);
console.log(`skip at 2 s: active after finish = false, introT ${b.match.introT}`);
if (b.match.introT > 0.02) fails.push('skip did not release the bell');
if (fails.length) { console.log('FAIL\n' + fails.join('\n')); process.exit(1); }
console.log('PASS');
