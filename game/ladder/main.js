// game/ladder.html entry: you (?p1=) vs a scripted AI (?p2=) in the main arena, ladder match rules. Bodies are the
// roster's Quaternius bodies in attire (arena/bodies.js, clip map shared/anims.js), same as the main game.
// The match opens on a 3-2-1 + bell intro; nothing moves before the bell and the AI waits ~2 s after it.
// ?scene=climb|betray|grab builds a deterministic frozen moment for screenshots (window.ladderScene.ready).
// ?ai=ally:4 makes the AI hold the ladder for you and shove it at rung 4 (betrayal demo, playable).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildArena, MAT_Y } from './arena.js';
import { mountLadder } from './mount.js';
import { LADDER, createMatch, underCase } from './state.js';
import { SCENES } from './scenes.js';
import { loadBodies } from '../arena/bodies.js';
import { createAnimator } from '../shared/anims.js';
import { CHARACTERS, WRESTLER_IDS, cssHex } from '../shared/characters.js';
import { createTTS } from '../../voice/tts.js';
import { createCrowd } from '../../voice/crowd.js';
import { openerLine, winnerLine } from '../../voice/announcer.js';

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

const pick = (v, fallback) => (WRESTLER_IDS.includes(v) ? v : fallback);
const P1 = pick(params.get('p1'), 'vex');
const P2 = pick(params.get('p2'), WRESTLER_IDS.find((id) => id !== P1));
const bodies = await loadBodies(new GLTFLoader());
function makeBody(id) {
  const { obj, animations } = bodies.make(id);
  scene.add(obj);
  return { obj, anim8: createAnimator(obj, animations) };
}
const you = makeBody(P1), rival = makeBody(P2);
window.ladderCast = { p1: P1, p2: P2 };
// Fair by default: the AI thinks every 0.4 s and winds up 0.45 s before a shove or punch, so a human can beat it.
const aiPolicy = (() => {
  const m = /^ally:(\d+)$/.exec(params.get('ai') || '');
  return { think: 0.4, windup: 0.45, ...(m ? { ally: 'p1', betrayAtRung: +m[1] } : { contest: true }) };
})();
const PLAYERS = [
  { id: 'p1', name: CHARACTERS[P1].name, human: true, x: -1.8, z: 0.6, yaw: Math.PI / 2, ...you },
  { id: 'ai', name: CHARACTERS[P2].name, x: 1.8, z: -0.9, yaw: -Math.PI / 2, ...rival },
];
const LADDER_START = { x: 0, z: 2.2, yaw: Math.PI / 2 };
const freshMatch = () => createMatch({ players: PLAYERS, ladder: LADDER_START });

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const feedList = $('feedList');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const NAMES = { p1: CHARACTERS[P1].name, ai: CHARACTERS[P2].name };
for (const [el, id, tag] of [['p1', P1, 'You'], ['p2', P2, 'AI']]) {
  $(el).querySelector('.n').innerHTML = `${esc(CHARACTERS[id].name)} <i>${tag}</i>`;
  $(el).style.setProperty('--tint', cssHex(CHARACTERS[id].palette.ui));
}
const TAG = { ladder_strike: 'hit', ladder_set: 'set', ladder_climb: 'climb', ladder_hold: 'hold', ladder_betray: 'betray', ladder_grab: 'grab', ladder_tip: 'tip' };
let lastFeed = null;
function feed(e) {
  // identical consecutive lines collapse into one with a count
  const key = `${e.actor}|${e.kind}|${e.text}|${e.success}`;
  if (lastFeed && lastFeed.key === key && feedList.firstChild === lastFeed.el) {
    lastFeed.n++;
    lastFeed.el.querySelector('.x').textContent = ` ×${lastFeed.n}`;
    return;
  }
  const p = document.createElement('p');
  const tag = TAG[e.kind] || e.kind;
  p.innerHTML = `<span class="k ${tag}">${tag}</span><b>${esc(NAMES[e.actor] || e.actor)}</b> ${esc(e.text || '')}`
    + `${e.success === false ? ' <span class="s">(failed)</span>' : ''} <span class="s">· ${e.situation}</span><b class="x"></b>`;
  lastFeed = { key, el: p, n: 1 };
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
  const b = $('bannerText'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  $('banner').classList.toggle('on', !!text);
}

function hintFor(m) {
  const w = m.wrestlers.p1, L = m.ladder, k = (key, label) => `<kbd>${key}</kbd>${label}`;
  if (phase !== 'live') return 'Wait for the bell';
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
  if (L.state === 'carried') return k('J', `Get close and hit ${NAMES.ai}`);
  if (Math.hypot(w.x - m.wrestlers.ai.x, w.z - m.wrestlers.ai.z) < 1.2) return `${k('J', 'Hit')} &nbsp; or get to the ladder`;
  return 'Get to the ladder';
}

function updateHud() {
  const m = mode.state;
  $('p1').querySelector('.bar > div').style.width = m.wrestlers.p1.stamina + '%';
  $('p2').querySelector('.bar > div').style.width = m.wrestlers.ai.stamina + '%';
  const h = hintFor(m);
  if ($('hint').innerHTML !== h) $('hint').innerHTML = h;
  if (m.winner && !announced) {
    announced = true;
    banner(m.winner === 'p1' ? 'You win' : `${NAMES[m.winner]} wins`, `${NAMES[m.winner]} pulled down the briefcase`);
    crowd.bell(3);
    setTimeout(() => tts.speak(winnerLine(m.winner === 'p1' ? P1 : P2)).catch(() => {}), 1200);
  }
}

// ---------- input ----------
const keys = new Set();
let frozen = false;
addEventListener('keydown', (e) => {
  if (frozen) return;
  keys.add(e.code);
  if (e.code === 'KeyR' && !e.repeat) { startMatch(); return; }
  if (phase !== 'live') return;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  const m = mode.state, L = m.ladder;
  if (e.code === 'KeyE') mode.act('p1', L.state === 'carried' && L.by === 'p1' ? 'setup' : 'pickup');
  if (e.code === 'KeyQ') mode.act('p1', L.state === 'climbed' && L.by === 'p1' ? 'descend' : 'drop');
  if (e.code === 'KeyF') mode.act('p1', L.holder === 'p1' ? 'betray_shove' : 'shove');
  if (e.code === 'KeyH') mode.act('p1', L.holder === 'p1' ? 'release' : 'hold');
  if (e.code === 'KeyG') mode.act('p1', 'grab');
  if (e.code === 'KeyJ') mode.act('p1', 'strike');
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

// ---------- intro: names, 3-2-1, bell; the AI goes after a beat ----------
// phase: 'intro' (frozen, idle) -> 'live' (bell rung; the AI's policy starts ~2 s later). Esc pause reloads for restart.
let phase = 'intro', announced = false, intro = 0;
const tts = createTTS();
const crowd = createCrowd();
const voiceUp = fetch('/voice/api/health').then((r) => r.json()).then((h) => !!(h.tts ?? h.runware)).catch(() => false);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.ladderPhase = () => phase;
async function startMatch() {
  const run = ++intro;
  phase = 'intro'; announced = false;
  mode.setState(freshMatch()); mode.setPolicy('ai', null);
  feedList.textContent = ''; lastFeed = null;
  $('banner').classList.add('intro');
  banner(`${NAMES.p1} vs ${NAMES.ai}`, 'Ladder match · first to pull down the briefcase');
  try { crowd.start(); } catch {}
  const speech = (await voiceUp) ? tts.speak(openerLine()).catch(() => {}) : null;
  await Promise.race([Promise.all([wait(1600), speech]), wait(4200)]);
  for (const n of ['3', '2', '1']) {
    if (run !== intro) return;
    banner(n, ''); await wait(700);
  }
  if (run !== intro) return;
  try { crowd.bell(1); } catch {}
  banner('Fight', 'Get to the ladder');
  phase = 'live';
  mode.setPolicy('ai', { ...aiPolicy, delay: 2 });
  await wait(900);
  if (run === intro && !announced) { banner(''); $('banner').classList.remove('intro'); }
}

// ---------- deterministic scenes ----------
if (SCENE && SCENES[SCENE]) {
  phase = 'live';
  mode.setPolicy('ai', null);
  const view = SCENES[SCENE](mode, freshMatch, MAT_Y);
  camera.position.set(...view.pos); lookCur.set(...view.target); camera.lookAt(lookCur);
  frozen = true;
  updateHud();
}
else startMatch();
window.ladderScene = { name: SCENE || null, ready: true, frozen };

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!frozen) {
    const mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const mz = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
    mode.input('p1', phase === 'live' ? mx : 0, phase === 'live' ? mz : 0);
    if (phase === 'live' && keys.has('Space')) mode.act('p1', 'climb'); // no-op while a step is in progress
    mode.update(dt);
    followCamera(dt);
    arena.update(clock.elapsedTime, mode.state.winner ? 1.8 : 1);
    updateHud();
  }
  composer.render();
  requestAnimationFrame(frame);
}
frame();
