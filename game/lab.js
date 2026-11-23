import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadBodies } from './arena/bodies.js';
import { contactReport } from './moves/index.js';
import { MOVES, playPaired, playSolo, updateMoves, stopMoves, getRig } from './moves/index.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);
scene.fog = new THREE.Fog(0x0e1116, 12, 30);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 100);
camera.position.set(4.6, 2.3, 3.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0.2);
controls.enableDamping = true;

// Light: overhead key (ring lights), cool fill, warm rim from behind.
scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x1a1410, 0.55));
const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
key.position.set(2.5, 7, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0xffb27a, 1.4);
rim.position.set(-4, 3, -5);
scene.add(rim);

// Ring: mat, apron, posts, three ropes.
const RING = 6.2, H = 0.0;
const mat = new THREE.Mesh(new THREE.BoxGeometry(RING, 0.2, RING), new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.92 }));
mat.position.y = H - 0.1;
mat.receiveShadow = true;
scene.add(mat);
const apron = new THREE.Mesh(new THREE.BoxGeometry(RING + 0.3, 1.0, RING + 0.3), new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.8 }));
apron.position.y = -0.71;
scene.add(apron);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.2;
scene.add(floor);
const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.35 });
const ropeMat = new THREE.MeshStandardMaterial({ color: 0xe0483e, roughness: 0.5 });
const half = RING / 2 - 0.1;
const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
for (const [x, z] of corners) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 12), postMat);
  post.position.set(x, 0.75, z);
  post.castShadow = true;
  scene.add(post);
}
for (const y of [0.45, 0.85, 1.25]) {
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = corners[i], [x2, z2] = corners[(i + 1) % 4];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 8), ropeMat);
    rope.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    rope.rotation.z = Math.PI / 2;
    rope.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    scene.add(rope);
  }
}

// Bodies.
const gltf = await new GLTFLoader().loadAsync('/models/Xbot.glb');
// ?bodies=kane,vex dresses attacker,victim (and the ref) in roster bodies instead of tinted Xbots.
const bodyIds = new URLSearchParams(location.search).get('bodies')?.split(',');
const bodies = bodyIds ? await loadBodies(new GLTFLoader()) : null;
let bodyIdx = 0;
function makeBot(tint) {
  if (bodies) {
    const { obj, animations } = bodies.make(bodyIds[bodyIdx++] || 'ref');
    scene.add(obj);
    getRig(obj);
    const mixer = new THREE.AnimationMixer(obj);
    mixer.clipAction(animations.find((a) => a.name === 'idle')).play();
    return { obj, mixer };
  }
  const obj = SkeletonUtils.clone(gltf.scene);
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      if (tint) {
        o.material = o.material.clone();
        o.material.color.set(tint);
        if (o.name.includes('Joints')) o.material.color.multiplyScalar(0.45);
      }
    }
  });
  scene.add(obj);
  getRig(obj);
  const mixer = new THREE.AnimationMixer(obj);
  const idle = gltf.animations.find((a) => a.name === 'idle');
  if (idle) mixer.clipAction(idle).play();
  return { obj, mixer };
}
const A = makeBot(0xd2563f);
const V = makeBot(0x4f7fbf);
const REF = makeBot(0x2a2a2a);
REF.obj.visible = false;
const bots = [A, V, REF];

function place(bot, x, z, yaw) {
  stopMoves(bot.obj);
  bot.obj.position.set(x, 0, z);
  bot.obj.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}
function reset() {
  place(A, 0, -0.6, 0);
  place(V, 0, 0.7, Math.PI);
  place(REF, 0, 0, 0);
  REF.obj.visible = false;
}
reset();

// Camera cues.
let shake = 0, shakeAmp = 0;
let override = null; // { pos, target, until }
const savedCam = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
function onCamera(cue) {
  if (cue === 'shake') { shake = 0.28; shakeAmp = 0.07; }
  if (cue === 'thump') { shake = 0.12; shakeAmp = 0.025; }
  if (cue === 'low-angle' || cue === 'close') {
    if (!override) { savedCam.pos.copy(camera.position); savedCam.target.copy(controls.target); }
    const mid = new THREE.Vector3().addVectors(A.obj.position, V.obj.position).multiplyScalar(0.5);
    const side = new THREE.Vector3(1, 0, 0.35).normalize();
    override = cue === 'low-angle'
      ? { pos: mid.clone().addScaledVector(side, 3.3).setY(0.35), target: mid.clone().setY(1.5), until: simTime + 1.6 }
      : { pos: mid.clone().addScaledVector(side, 2.4).setY(1.6), target: mid.clone().setY(1.2), until: simTime + 1.0 };
  }
}

// HUD.
const log = document.getElementById('log');
const countEl = document.getElementById('count');
const lines = [];
function note(html) {
  lines.unshift(html);
  lines.length = Math.min(lines.length, 6);
  log.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
}
const cbs = {
  onImpact: ({ move, damage }) => note(`<b>${MOVES[move].label}</b> impact${damage ? `, ${damage} dmg` : ''}`),
  onCamera,
  onEvent: (ev) => {
    if (ev.type !== 'count') return;
    countEl.textContent = ev.n;
    countEl.classList.add('on');
    setTimeout(() => countEl.classList.remove('on'), 420);
    note(`Count <b>${ev.n}</b>`);
  },
  onEnd: ({ move }) => note(`${MOVES[move].label} done`),
};

// Each lab slot: set the bodies where the move expects them, then play.
const lying = () => V.obj.userData.lying;
const SLOTS = [
  ['1', 'lockup', () => { reset(); playPaired('lockup', A.obj, V.obj, cbs); }],
  ['2', 'bodyslam', () => { reset(); playPaired('bodyslam', A.obj, V.obj, cbs); V.obj.userData.lying = true; }],
  ['3', 'suplex', () => { reset(); playPaired('suplex', A.obj, V.obj, cbs); V.obj.userData.lying = true; }],
  ['4', 'ddt', () => { reset(); playPaired('ddt', A.obj, V.obj, cbs); V.obj.userData.lying = 'face'; }],
  ['5', 'clothesline', () => {
    reset(); place(A, 0.5, -2.3, 0); place(V, 0, 0.7, Math.PI);
    playPaired('clothesline', A.obj, V.obj, cbs); V.obj.userData.lying = true;
  }],
  ['6', 'pin', () => {
    if (lying() !== true) { reset(); playPaired('bodyslam', A.obj, V.obj, {}); advance(2.4); }
    playPaired('pin', A.obj, V.obj, cbs);
    // Referee kneels beside the victim's shoulders, on the far side from the cover.
    const pelvis = getRig(V.obj).bones.hips.getWorldPosition(new THREE.Vector3());
    const head = getRig(V.obj).bones.head.getWorldPosition(new THREE.Vector3());
    const along = head.clone().sub(pelvis).setY(0).normalize();
    const side = new THREE.Vector3(along.z, 0, -along.x);
    if (side.dot(A.obj.position.clone().sub(pelvis)) > 0) side.negate();
    REF.obj.visible = true;
    place(REF, 0, 0, 0);
    REF.obj.position.copy(head).addScaledVector(side, 0.95).setY(0);
    REF.obj.lookAt(head.x, 0, head.z);
    playSolo('refcount', REF.obj, cbs);
  }],
  ['7', 'kipup', () => {
    reset(); playPaired('bodyslam', A.obj, V.obj, {}); advance(2.6);
    playSolo('kipup', V.obj, cbs); V.obj.userData.lying = false;
  }],
  ['8', 'tauntArms', () => { reset(); place(V, 2.2, 1.5, Math.PI); playSolo('tauntArms', A.obj, cbs); }],
  ['9', 'chestPound', () => { reset(); place(V, 2.2, 1.5, Math.PI); playSolo('chestPound', A.obj, cbs); }],
  ['0', 'strut', () => { reset(); place(V, 2.2, 1.5, Math.PI); place(A, -0.6, -2.6, 0); playSolo('strut', A.obj, cbs); }],
];

const bar = document.getElementById('bar');
for (const [k, id, fn] of SLOTS) {
  const b = document.createElement('button');
  b.innerHTML = `<kbd>${k}</kbd>${MOVES[id].label}`;
  b.onclick = () => { paused = false; fn(); };
  bar.append(b);
}
const slowBtn = document.createElement('button');
slowBtn.innerHTML = '<kbd>S</kbd>Slow-mo';
slowBtn.setAttribute('aria-pressed', 'false');
slowBtn.onclick = () => toggleSlow();
const resetBtn = document.createElement('button');
resetBtn.innerHTML = '<kbd>R</kbd>Reset';
resetBtn.onclick = () => { paused = false; V.obj.userData.lying = false; reset(); };
bar.append(slowBtn, resetBtn);

let timeScale = 1, paused = false;
function toggleSlow() {
  timeScale = timeScale === 1 ? 0.25 : 1;
  slowBtn.setAttribute('aria-pressed', String(timeScale !== 1));
}
addEventListener('keydown', (e) => {
  const slot = SLOTS.find(([k]) => k === e.key);
  if (slot) { paused = false; slot[2](); }
  if (e.key === 's' || e.key === 'S') toggleSlow();
  if (e.key === 'r' || e.key === 'R') { paused = false; V.obj.userData.lying = false; reset(); }
  if (e.key === ' ') paused = !paused;
});

// Simulation step shared by the render loop and the scrub lever.
let simTime = 0;
function step(dt) {
  simTime += dt;
  for (const b of bots) b.mixer.update(dt);
  updateMoves(dt);
}
function advance(seconds, dt = 1 / 120) {
  for (let t = 0; t < seconds - 1e-6; t += dt) step(Math.min(dt, seconds - t));
}

const clock = new THREE.Clock();
const camTmp = new THREE.Vector3();
function frame() {
  const raw = Math.min(clock.getDelta(), 0.05);
  if (!paused) step(raw * timeScale);
  controls.update();
  if (override) {
    if (simTime > override.until) {
      camera.position.lerp(savedCam.pos, 0.12);
      controls.target.lerp(savedCam.target, 0.12);
      if (camera.position.distanceTo(savedCam.pos) < 0.02) override = null;
    } else {
      camera.position.lerp(override.pos, 0.1);
      controls.target.lerp(override.target, 0.1);
    }
  }
  let jitter = null;
  if (shake > 0 && !paused) {
    shake -= raw;
    const a = shakeAmp * Math.max(0, shake / 0.28);
    jitter = camTmp.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    camera.position.add(jitter);
  }
  renderer.render(scene, camera);
  if (jitter) camera.position.sub(jitter);
  requestAnimationFrame(frame);
}
frame();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Lever for verification: jump to an exact moment of a move and freeze there.
//   lab.scrub('suplex', 1.3, { pos: [x,y,z], target: [x,y,z] })
window.lab = {
  MOVES,
  scrub(id, t, view) {
    const slot = SLOTS.find(([, sid]) => sid === id);
    paused = false;
    override = null; shake = 0;
    slot[2]();
    advance(t);
    paused = true;
    override = null; shake = 0;
    if (view?.pos) camera.position.set(...view.pos);
    if (view?.target) controls.target.set(...view.target);
    controls.update();
    renderer.render(scene, camera);
    return { a: A.obj.position.toArray(), v: V.obj.position.toArray() };
  },
  // Hold any pose object on the red bot (convention debugging).
  pose(pose, view) {
    MOVES.__pose = { kind: 'solo', label: 'pose', duration: 0.01, hold: true, events: [],
      track: [{ t: 0, pose, p: [0, 0, 0], r: [] }] };
    reset(); place(V, 3, 3, 0); paused = false;
    playSolo('__pose', A.obj, {});
    advance(0.3); paused = true;
    if (view?.pos) camera.position.set(...view.pos);
    if (view?.target) controls.target.set(...view.target);
    controls.update();
  },
  play(id) { paused = false; SLOTS.find(([, sid]) => sid === id)[2](); },
  rig: () => getRig(A.obj),
  contacts: contactReport,
  reset,
};
