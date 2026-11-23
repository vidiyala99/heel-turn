// Headless (no browser, no WebGL) check of the ladder mode: loads the real Xbot rig with three.js in
// Node, mounts the real mode, runs the same scenes as ladder.html?scene=..., and measures bones.
// Optional: pass a Vite base URL to also check every ladder module compiles through Vite.
// Usage (from game/): node ladder/verify-node.mjs [http://localhost:5199/]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getRig } from '../moves/index.js';
import { mountLadder } from './mount.js';
import { SCENES } from './scenes.js';
import { LADDER, createMatch, SITUATIONS, KINDS } from './state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `  (${detail})` : ''}`); if (!ok) failures++; };
const f2 = (v) => v.toFixed(2);

const base = process.argv[2];
if (base) {
  for (const p of ['ladder.html', 'ladder/main.js', 'ladder/mount.js', 'ladder/state.js', 'ladder/arena.js', 'ladder/moves-ladder.js', 'ladder/scenes.js']) {
    const r = await fetch(new URL(p, base));
    check(r.ok, `vite serves ${p}`, `HTTP ${r.status}`);
  }
}

const buf = fs.readFileSync(path.join(here, '..', 'public', 'models', 'Xbot.glb'));
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
const clip = (n) => gltf.animations.find((a) => a.name === n);
check(!!clip('idle') && !!clip('walk'), 'Xbot has idle + walk clips', gltf.animations.map((a) => a.name).join(','));

const MAT_Y = 1.1;
function setup() {
  const scene = new THREE.Scene();
  const bot = () => { const obj = skClone(gltf.scene); scene.add(obj); return { obj, mixer: new THREE.AnimationMixer(obj) }; };
  const a = bot(), b = bot();
  const players = [
    { id: 'p1', name: 'You', human: true, x: -1.8, z: 0.6, yaw: Math.PI / 2, ...a, clips: { idle: clip('idle'), walk: clip('walk') } },
    { id: 'ai', name: 'Silas Crane', x: 1.8, z: -0.9, yaw: -Math.PI / 2, ai: {}, ...b, clips: { idle: clip('idle'), walk: clip('walk') } },
  ];
  const events = [];
  const mode = mountLadder(scene, { players, matY: MAT_Y, ladderStart: { x: 0, z: 2.2, yaw: Math.PI / 2 }, onEvent: (e) => events.push(e) });
  const fresh = () => createMatch({ players, ladder: { x: 0, z: 2.2, yaw: Math.PI / 2 } });
  return { scene, mode, fresh, events, p1: a.obj, ai: b.obj };
}
const bone = (obj, name) => { obj.updateMatrixWorld(true); return getRig(obj).bones[name].getWorldPosition(new THREE.Vector3()); };
const schemaOk = (e) => KINDS.includes(e.kind) && SITUATIONS.includes(e.situation) && typeof e.match === 'string' && Number.isFinite(e.t_ms) && typeof e.actor === 'string';

console.log('Xbot hip height', f2(getRig(skClone(gltf.scene)).hipHeight));

// climb: mid-step onto rung 5
{
  const { mode, fresh, events, p1 } = setup();
  mode.setPolicy('ai', null);
  SCENES.climb(mode, fresh, MAT_Y);
  const L = mode.state.ladder;
  check(L.state === 'climbed' && L.rung === 5, 'climb: state climbed rung 5', `${L.state} ${L.rung}`);
  const feet = [bone(p1, 'lFoot').y, bone(p1, 'rFoot').y].map((y) => y - MAT_Y);
  check(Math.max(...feet) > 4 * LADDER.RUNG && Math.min(...feet) > 3 * LADDER.RUNG - 0.15, 'climb: feet are up on the ladder mid-step', `feet above mat ${feet.map(f2)}`);
  const hands = ['lHand', 'rHand'].map((h) => bone(p1, h));
  const hz = hands.map((h) => Math.hypot(h.x - L.x, h.z - L.z));
  check(hz.every((d) => d < 0.75), 'climb: both hands near the ladder', `hand dist ${hz.map(f2)}`);
  mode.advance(0.4);
  const settled = [bone(p1, 'lFoot').y, bone(p1, 'rFoot').y].map((y) => y - MAT_Y);
  check(settled.every((y) => Math.abs(y - 5 * LADDER.RUNG) < 0.2), 'climb: after the step both feet sit near rung 5', `feet ${settled.map(f2)} vs rung ${f2(5 * LADDER.RUNG)}`);
  check(events.filter((e) => e.kind === 'ladder_climb').length === 5 && events.every(schemaOk), 'climb: 5 ladder_climb events, PLAN schema');
}

// betray: AI holds, then shoves its partner off rung 5
{
  const { mode, fresh, events, p1, ai } = setup();
  mode.setPolicy('ai', null);
  SCENES.betray(mode, fresh, MAT_Y);
  const st = mode.state;
  check(st.ladder.state === 'tipped', 'betray: ladder tipped');
  const kinds = events.map((e) => e.kind);
  check(kinds.includes('ladder_hold') && kinds.at(-1) === 'ladder_betray', 'betray: hold then betray events', kinds.join(','));
  const bet = events.at(-1);
  check(bet.actor === 'ai' && bet.target === 'p1' && bet.success === true, 'betray: actor ai, target p1, success');
  const tilt = new THREE.Vector3(0, 1, 0).applyQuaternion(mode.ladderObject.quaternion).angleTo(new THREE.Vector3(0, 1, 0));
  check(tilt > 0.15 && tilt < 1.4, 'betray: ladder is mid-tip', `tilt ${f2(tilt * 57.3)} deg`);
  const hips = bone(p1, 'hips').y - MAT_Y;
  check(hips > 0.3 && hips < 5 * LADDER.RUNG + 1.3, 'betray: climber is mid-air', `hips ${f2(hips)} m above mat`);
  const aiHands = ['lHand', 'rHand'].map((h) => bone(ai, h)), aiHips = bone(ai, 'hips');
  check(aiHands.every((h) => Math.hypot(h.x - aiHips.x, h.z - aiHips.z) > 0.25), 'betray: holder arms extended in the shove', aiHands.map((h) => f2(Math.hypot(h.x - aiHips.x, h.z - aiHips.z))).join(','));
  mode.advance(3.2);
  const w = mode.state.wrestlers.p1, hip2 = bone(p1, 'hips');
  check(hip2.y - MAT_Y > 0.8, 'betray: climber is back on his feet after the kip-up', `hips ${f2(hip2.y - MAT_Y)}`);
  check(Math.hypot(p1.position.x - w.x, p1.position.z - w.z) < 0.05, 'betray: body ends where the model says', `body ${f2(p1.position.x)},${f2(p1.position.z)} model ${f2(w.x)},${f2(w.z)}`);
  const tilt2 = new THREE.Vector3(0, 1, 0).applyQuaternion(mode.ladderObject.quaternion).angleTo(new THREE.Vector3(0, 1, 0));
  check(Math.abs(tilt2 - (Math.PI / 2 - LADDER.TILT)) < 0.05, 'betray: ladder ends lying on its face', `tilt ${f2(tilt2 * 57.3)} deg`);
}

// grab: top rung, briefcase in hand
{
  const { mode, fresh, events, p1 } = setup();
  mode.setPolicy('ai', null);
  SCENES.grab(mode, fresh, MAT_Y);
  check(mode.state.winner === 'p1' && events.at(-1)?.kind === 'ladder_grab', 'grab: p1 wins with a ladder_grab event');
  const hand = bone(p1, 'rHand'), cp = mode.caseObject.getWorldPosition(new THREE.Vector3());
  check(cp.distanceTo(hand) < 0.3, 'grab: briefcase is in the right hand', `dist ${f2(cp.distanceTo(hand))}`);
  check(hand.y - MAT_Y > 4.0, 'grab: case raised high above the ring', `hand ${f2(hand.y - MAT_Y)} m above mat`);
}

// The case hangs where the top-rung reach can get it.
{
  const { mode, fresh, p1 } = setup();
  mode.setPolicy('ai', null);
  const m = fresh();
  m.ladder = { ...m.ladder, state: 'standing', x: 0, z: 0, yaw: 0 };
  m.wrestlers.p1 = { ...m.wrestlers.p1, x: 0, z: 1.2 };
  mode.setState(m); mode.advance(0.2);
  for (let i = 0; i < LADDER.TOP; i++) { mode.act('p1', 'climb'); mode.advance(0.62); }
  mode.act('p1', 'grab'); mode.advance(0.3); // the reach key of ladderGrab
  const reach = ['lHand', 'rHand'].map((h) => bone(p1, h));
  const caseHang = new THREE.Vector3(0, MAT_Y + 4.55, 0);
  const d = Math.min(...reach.map((h) => h.distanceTo(caseHang)));
  check(d < 0.45, 'grab: at the reach key a hand is near the hanging case', `closest hand ${f2(d)} m from case; hands ${reach.map((h) => [h.x, h.y - MAT_Y, h.z].map(f2).join('/')).join(' ')}`);
}

// Live: the scripted AI goes for the ladder.
{
  const { mode, events } = setup();
  mode.advance(8);
  const L = mode.state.ladder;
  check(L.state !== 'on_mat', 'live: scripted AI moved the ladder within 8 s', `ladder ${L.state} by ${L.by} rung ${L.rung}; events ${events.map((e) => e.kind).join(',')}`);
  mode.advance(12);
  console.log('live after 20 s:', JSON.stringify({ ladder: mode.state.ladder.state, rung: mode.state.ladder.rung, winner: mode.state.winner }), events.map((e) => e.kind).join(','));
}

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
