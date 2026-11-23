// game/ladder.html entry: Xbot (you) vs a scripted AI Xbot in the main arena, ladder match rules.
// ?scene=climb|betray|grab builds a deterministic frozen moment for screenshots (window.ladderScene.ready).
// ?ai=ally:4 makes the AI hold the ladder for you and shove it at rung 4 (betrayal demo, playable).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildArena, MAT_Y } from './arena.js';
import { mountLadder } from './mount.js';
import { LADDER, createMatch, underCase } from './state.js';
import { SCENES } from './scenes.js';

const params = new URLSearchParams(location.search);
const SCENE = params.get('scene');
window.ladderEvents = [];

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.03);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, MAT_Y + 3.4, 10);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.92));
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

const arena = buildArena(scene);

const gltf = await new GLTFLoader().loadAsync('/models/Xbot.glb');
const clip = (n) => gltf.animations.find((a) => a.name === n);
function makeBot(tint) {
  const obj = skClone(gltf.scene);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    o.material = o.material.clone(); o.material.color.set(tint);
    if (o.name.includes('Joints')) o.material.color.multiplyScalar(0.45);
  });
  scene.add(obj);
  return { obj, mixer: new THREE.AnimationMixer(obj) };
}
const you = makeBot(0xd2563f), rival = makeBot(0x4f7fbf);
const aiPolicy = (() => {
  const m = /^ally:(\d+)$/.exec(params.get('ai') || '');
  return m ? { ally: 'p1', betrayAtRung: +m[1] } : {};
})();
const PLAYERS = [
  { id: 'p1', name: 'You', human: true, x: -1.8, z: 0.6, yaw: Math.PI / 2, ...you, clips: { idle: clip('idle'), walk: clip('walk') } },
  { id: 'ai', name: 'Silas Crane', x: 1.8, z: -0.9, yaw: -Math.PI / 2, ai: aiPolicy, ...rival, clips: { idle: clip('idle'), walk: clip('walk') } },
];
const LADDER_START = { x: 0, z: 2.2, yaw: Math.PI / 2 };
const freshMatch = () => createMatch({ players: PLAYERS, ladder: LADDER_START });

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const feedList = $('feedList');
const NAMES = { p1: 'You', ai: 'Silas Crane' };
const TAG = { ladder_set: 'set', ladder_climb: 'climb', ladder_hold: 'hold', ladder_betray: 'betray', ladder_grab: 'grab', ladder_tip: 'tip' };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
function feed(e) {
  const p = document.createElement('p');
  const tag = TAG[e.kind] || e.kind;
  p.innerHTML = `<span class="k ${tag}">${tag}</span><b>${esc(NAMES[e.actor] || e.actor)}</b> ${esc(e.text || '')}`
    + `${e.success === false ? ' <span class="s">(failed)</span>' : ''} <span class="s">· ${e.situation}</span>`;
  feedList.prepend(p);
  while (feedList.children.length > 7) feedList.lastChild.remove();
}
let shake = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function onCamera(cue) {
  if (reduceMotion || SCENE) return;
  shake = Math.max(shake, cue === 'shake' ? 0.22 : cue === 'thump' ? 0.05 : 0.08);
}

const mode = mountLadder(scene, {
  players: PLAYERS, matY: MAT_Y, ladderStart: LADDER_START, onCamera,
  onEvent: (e) => { window.ladderEvents.push(e); feed(e); },
});
window.ladder = mode;

function banner(text, sub) {
  $('bannerText').textContent = text; $('bannerSub').textContent = sub || '';
  $('banner').classList.toggle('on', !!text);
}

function hintFor(m) {
  const w = m.wrestlers.p1, L = m.ladder, k = (key, label) => `<kbd>${key}</kbd>${label}`;
  if (m.winner) return k('R', 'Rematch');
  if (mode.time * 1000 < w.downUntil) return 'Down on the mat...';
  const d = Math.hypot(w.x - L.x, w.z - L.z);
  if (L.state === 'climbed' && L.by === 'p1') {
    if (L.rung < LADDER.TOP) return `${k('Space', `Climb · rung ${L.rung} of ${LADDER.TOP}`)}`;
    return underCase(m) ? k('G', 'Grab the briefcase') : k('Q', 'Step off: the ladder is not under the case');
  }
  if (L.holder === 'p1') return L.state === 'climbed' ? `${k('F', 'Shove it over')} &nbsp; ${k('H', 'Let go')}` : k('H', 'Let go');
  if (L.state === 'carried' && L.by === 'p1') return `${k('E', 'Set it up under the case')} &nbsp; ${k('Q', 'Drop')}`;
  if (L.state === 'climbed' && d <= LADDER.REACH) return `${k('F', 'Shove the ladder')} &nbsp; ${k('H', 'Hold it')}`;
  if (L.state === 'standing' && d <= LADDER.REACH) return `${k('Space', 'Climb')} &nbsp; ${k('H', 'Hold')} &nbsp; ${k('F', 'Shove')}`;
  if ((L.state === 'on_mat' || L.state === 'tipped') && d <= LADDER.PICK_REACH) return k('E', 'Pick up the ladder');
  if (L.state === 'carried') return k('F', 'Get close and knock it out of his hands');
  return 'Get to the ladder';
}

function updateHud() {
  const m = mode.state;
  $('p1').querySelector('.bar > div').style.width = m.wrestlers.p1.stamina + '%';
  $('p2').querySelector('.bar > div').style.width = m.wrestlers.ai.stamina + '%';
  const h = hintFor(m);
  if ($('hint').innerHTML !== h) $('hint').innerHTML = h;
  if (m.winner && !$('banner').classList.contains('on')) banner(m.winner === 'p1' ? 'You win' : `${NAMES[m.winner]} wins`, 'Briefcase pulled down');
}

// ---------- input ----------
const keys = new Set();
let frozen = false;
addEventListener('keydown', (e) => {
  if (frozen) return;
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  const m = mode.state, L = m.ladder;
  if (e.code === 'KeyE') mode.act('p1', L.state === 'carried' && L.by === 'p1' ? 'setup' : 'pickup');
  if (e.code === 'KeyQ') mode.act('p1', L.state === 'climbed' && L.by === 'p1' ? 'descend' : 'drop');
  if (e.code === 'KeyF') mode.act('p1', L.holder === 'p1' ? 'betray_shove' : 'shove');
  if (e.code === 'KeyH') mode.act('p1', L.holder === 'p1' ? 'release' : 'hold');
  if (e.code === 'KeyG') mode.act('p1', 'grab');
  if (e.code === 'KeyR') { mode.setState(freshMatch()); banner(''); feedList.textContent = ''; }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---------- camera ----------
const camWant = new THREE.Vector3(), look = new THREE.Vector3(), lookCur = new THREE.Vector3(0, MAT_Y + 1.2, 0);
function followCamera(dt) {
  const f = mode.focus(), a = you.obj.position, b = rival.obj.position;
  const mx = (a.x + b.x) * 0.25 + f.ladder.x * 0.5, mz = (a.z + b.z) * 0.25 + f.ladder.z * 0.5;
  const ch = f.climbHeight;
  camWant.set(mx * 0.5, MAT_Y + 3.2 + ch * 0.55, mz + 9.2 + ch * 0.4);
  look.set(mx, MAT_Y + 1.2 + ch * 0.85, mz);
  const k = 1 - Math.exp(-3 * dt);
  camera.position.lerp(camWant, k); lookCur.lerp(look, k);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= 0.86; if (shake < 0.005) shake = 0; }
  camera.lookAt(lookCur);
}

// ---------- deterministic scenes ----------
if (SCENE && SCENES[SCENE]) {
  mode.setPolicy('ai', null);
  const view = SCENES[SCENE](mode, freshMatch, MAT_Y);
  camera.position.set(...view.pos); lookCur.set(...view.target); camera.lookAt(lookCur);
  frozen = true;
  updateHud();
}
window.ladderScene = { name: SCENE || null, ready: true, frozen };

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!frozen) {
    const mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const mz = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
    mode.input('p1', mx, mz);
    if (keys.has('Space')) mode.act('p1', 'climb'); // no-op while a step is in progress
    mode.update(dt);
    followCamera(dt);
    arena.update(clock.elapsedTime, mode.state.winner ? 1.8 : 1);
    updateHud();
  }
  composer.render();
  requestAnimationFrame(frame);
}
frame();
