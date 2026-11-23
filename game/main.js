// HEEL TURN prototype (throwaway, pstack prototype playbook). Keyboard only.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.035);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 7, 12);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ---------- arena ----------
const RING = 3.2;          // half-size of the mat
const MAT_Y = 1.1;         // mat height
scene.add(new THREE.HemisphereLight(0x6677aa, 0x0a0a10, 0.35));

function matTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#b9bec6'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * 1024, Math.random() * 1024, 3, 3); }
  g.strokeStyle = '#c1121f'; g.lineWidth = 22; g.strokeRect(30, 30, 964, 964);
  g.save(); g.translate(512, 512); g.rotate(-0.12);
  g.font = '900 150px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(193,18,31,0.85)'; g.fillText('HEEL TURN', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const mat = new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 0.6, 0.2, RING * 2 + 0.6),
  [0, 0, 0, 0, 0, 0].map((_, i) => i === 2 ? new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.85 })
    : new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.9 })));
mat.position.y = MAT_Y - 0.1; mat.receiveShadow = true; scene.add(mat);
const apron = new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 0.7, MAT_Y - 0.2, RING * 2 + 0.7),
  new THREE.MeshStandardMaterial({ color: 0x0b1024, roughness: 0.6, metalness: 0.2 }));
apron.position.y = (MAT_Y - 0.2) / 2; scene.add(apron);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0c0d12, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const P = RING + 0.15;
const postMat = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.9, roughness: 0.25 });
const padMat = new THREE.MeshStandardMaterial({ color: 0xc1121f, roughness: 0.5 });
const corners = [[P, P], [-P, P], [-P, -P], [P, -P]];
for (const [x, z] of corners) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 16), postMat);
  post.position.set(x, MAT_Y + 0.65, z); post.castShadow = true; scene.add(post);
  for (let k = 0; k < 3; k++) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), padMat);
    pad.position.set(x, MAT_Y + 0.4 + k * 0.38, z); scene.add(pad);
  }
}
const ropeColors = [0xd62828, 0xf1f1f1, 0x1d4ed8];
const ropes = [];
for (let k = 0; k < 3; k++) for (let s = 0; s < 4; s++) {
  const a = corners[s], b = corners[(s + 1) % 4];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 10),
    new THREE.MeshStandardMaterial({ color: ropeColors[k], roughness: 0.4, emissive: ropeColors[k], emissiveIntensity: 0.08 }));
  rope.position.set((a[0] + b[0]) / 2, MAT_Y + 0.4 + k * 0.38, (a[1] + b[1]) / 2);
  rope.rotation.set(0, 0, Math.PI / 2);
  if (a[0] === b[0]) rope.rotation.set(Math.PI / 2, 0, 0);
  rope.userData.base = rope.position.clone(); rope.userData.side = s;
  rope.castShadow = true; scene.add(rope); ropes.push(rope);
}

// lighting rig: overhead truss spots + rim lights
const spots = [];
for (const [x, z, c] of [[4, 4, 0xffffff], [-4, 4, 0xfff1d6], [-4, -4, 0xffffff], [4, -4, 0xd6e4ff]]) {
  const s = new THREE.SpotLight(c, 55, 30, 0.5, 0.55, 1.4);
  s.position.set(x, 11, z); s.target.position.set(0, MAT_Y, 0);
  s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004;
  scene.add(s, s.target); spots.push(s);
}
const rimA = new THREE.PointLight(0xe8333b, 40, 25); rimA.position.set(-9, 4, -6); scene.add(rimA);
const rimB = new THREE.PointLight(0x2b8cff, 40, 25); rimB.position.set(9, 4, -6); scene.add(rimB);
// truss
const truss = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.08, 8, 64), postMat);
truss.rotation.x = Math.PI / 2; truss.position.y = 11; scene.add(truss);

// crowd: instanced bodies around the ring, bobbing
const CROWD = 1400;
const crowdGeo = new THREE.CapsuleGeometry(0.22, 0.5, 2, 6);
const crowd = new THREE.InstancedMesh(crowdGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), CROWD);
const crowdSeat = [];
const tmp = new THREE.Object3D(); const col = new THREE.Color();
for (let i = 0; i < CROWD; i++) {
  const row = Math.floor(Math.random() * 14);
  const r = 8.5 + row * 0.9;
  const a = Math.random() * Math.PI * 2;
  const y = 0.4 + row * 0.55;
  crowdSeat.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y, p: Math.random() * 6.28 });
  col.setHSL(Math.random(), 0.35, 0.18 + Math.random() * 0.25); crowd.setColorAt(i, col);
}
scene.add(crowd);
// stands
for (let row = 0; row < 14; row++) {
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(8.9 + row * 0.9, 8.9 + row * 0.9, 0.55, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x111319, side: THREE.DoubleSide, roughness: 1 }));
  ring.position.y = row * 0.55; scene.add(ring);
}
// big screen
function screenTex(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1024, 512); grd.addColorStop(0, '#2a0508'); grd.addColorStop(1, '#05060a');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
  g.font = '900 170px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#f5c542'; g.fillText(text, 512, 230);
  g.font = '600 40px Inter, sans-serif'; g.fillStyle = '#fff'; g.fillText('OVER THE TOP  ·  LIVE', 512, 390);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const screen = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: screenTex('HEEL TURN') }));
screen.position.set(0, 10, -19); scene.add(screen);

// ---------- UI helpers ----------
const $ = (id) => document.getElementById(id);
let bannerT = 0;
function banner(text, secs = 1.4) { $('banner').textContent = text; $('banner').style.opacity = 1; bannerT = secs; }
function call(text) { $('call').textContent = text; }
function log(html) {
  const p = document.createElement('p'); p.innerHTML = html; $('log').prepend(p);
  while ($('log').children.length > 9) $('log').lastChild.remove();
}

// ---------- wrestlers ----------
const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/models/RobotExpressive.glb');
const box = new THREE.Box3().setFromObject(gltf.scene); const H = box.max.y - box.min.y;
const SCALE = 1.9 / H;

const MOVES = { strike: { wind: 0.22, active: 0.12, rec: 0.3, stam: 9 }, grapple: { wind: 0.42, active: 0.12, rec: 0.35, stam: 14 } };
const BEATS = { strike: 'grapple', grapple: 'block', block: 'strike' };
const COUNTER = { strike: 'block', grapple: 'strike', block: 'grapple' };

function makeWrestler(name, tint, x) {
  const root = skClone(gltf.scene); root.scale.setScalar(SCALE);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.material = o.material.clone();
      if (o.material.color && o.material.color.getHSL({}).s > 0.2) o.material.color.set(tint);
      o.material.metalness = 0.35; o.material.roughness = 0.45;
    }
  });
  const holder = new THREE.Group(); holder.add(root); holder.position.set(x, MAT_Y, 0); scene.add(holder);
  const mixer = new THREE.AnimationMixer(root);
  const actions = {}; for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);
  for (const n of ['Punch', 'Death', 'Jump', 'Yes', 'No', 'ThumbsUp', 'Wave', 'Dance', 'Standing']) {
    if (actions[n]) { actions[n].setLoop(THREE.LoopOnce); actions[n].clampWhenFinished = true; }
  }
  const w = {
    name, holder, root, mixer, actions, cur: null,
    hp: 100, st: 100, mo: 0, state: 'idle', t: 0, move: null, facing: 0, vel: new THREE.Vector3(),
    out: false, hits: 0,
  };
  play(w, 'Idle');
  return w;
}
function play(w, name, speed = 1) {
  const a = w.actions[name]; if (!a || w.cur === a) { if (a) a.timeScale = speed; return; }
  a.reset(); a.timeScale = speed; a.fadeIn(0.12).play();
  if (w.cur) w.cur.fadeOut(0.12);
  w.cur = a;
}

let P1, P2, ref;
function reset() {
  for (const w of [P1, P2]) if (w) scene.remove(w.holder);
  P1 = makeWrestler('Vex "The Voltage"', 0x2b8cff, -1.6);
  P2 = makeWrestler('Brutus Kane', 0xe8333b, 1.6);
  $('n0').textContent = P1.name; $('n1').textContent = P2.name;
  over = false; pin = null; aiPlanT = 0;
  banner('FIGHT!', 1.2); call('The bell rings. Vex and Kane circle each other.');
}
let over = false, pin = null;

// ---------- input ----------
const keys = {};
addEventListener('keydown', (e) => {
  if (e.repeat) return; keys[e.code] = true;
  if (over && e.code === 'KeyR') reset();
  if (over || !P1) return;
  if (pin && pin.victim === P1 && e.code === 'KeyK') pin.mash += 1;
  if (e.code === 'KeyJ') act(P1, 'strike');
  if (e.code === 'KeyK') { if (!tryPin(P1, P2)) act(P1, 'grapple'); }
  if (e.code === 'KeyL') act(P1, 'block');
  if (e.code === 'Space') act(P1, 'taunt');
  if (e.code === 'KeyR') reset();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyL' && P1.state === 'block') P1.state = 'idle'; });

// ---------- habit memory (the learning loop in miniature; Bruin replaces this table) ----------
const habits = { opening: { strike: 1, grapple: 1, block: 1 }, after_hit: { strike: 1, grapple: 1, block: 1 } };
let lastSituation = 'opening';
function recordHabit(w, move) {
  if (w !== P1 || !BEATS[move]) return;
  habits[lastSituation][move] += 1;
}

// ---------- actions ----------
function busy(w) { return ['wind', 'active', 'rec', 'stun', 'down', 'thrown', 'taunt', 'pinning', 'pinned', 'out'].includes(w.state); }
function act(w, kind) {
  if (busy(w)) return;
  const opp = w === P1 ? P2 : P1;
  recordHabit(w, kind);
  if (kind === 'block') { w.state = 'block'; play(w, 'No', 1.6); return; }
  if (kind === 'taunt') { w.state = 'taunt'; w.t = 1.2; play(w, w === P1 ? 'Dance' : 'ThumbsUp', 1.4); call(`${short(w)} plays to the crowd!`); return; }
  if (kind === 'grapple' && w.mo >= 100 && dist(w, opp) < 1.6) kind = 'finisher';
  const m = MOVES[kind === 'finisher' ? 'grapple' : kind];
  if (w.st < m.stam * 0.5) { call(`${short(w)} is gassed!`); return; }
  w.st -= m.stam; w.state = 'wind'; w.move = kind; w.t = m.wind;
  play(w, kind === 'strike' ? 'Punch' : 'Jump', kind === 'strike' ? 2.4 : 1.8);
}
function short(w) { return w.name.split(' ').slice(-1)[0].replace(/"/g, ''); }
function dist(a, b) { return a.holder.position.distanceTo(b.holder.position); }
function nearRopes(w) { const p = w.holder.position; return Math.max(Math.abs(p.x), Math.abs(p.z)) > RING - 0.9; }

let shake = 0;
function resolve(att, def) {
  const kind = att.move;
  if (dist(att, def) > (kind === 'strike' ? 1.45 : 1.35) || def.out) { log(`<em>${short(att)}</em> whiffs the ${kind}.`); return; }
  if (def.state === 'down' || def.state === 'thrown' || def.state === 'pinned') return;
  if (kind === 'strike') {
    if (def.state === 'block') { def.st -= 6; att.state = 'stun'; att.t = 0.45; play(att, 'No'); call(`${short(def)} blocks and shoves ${short(att)} back.`); lastSituation = 'after_hit'; return; }
    hit(def, 8, att); if (def.state === 'wind' && def.move !== 'strike') { call(`${short(att)} cuts off the grapple attempt!`); }
    att.mo = Math.min(100, att.mo + 12); lastSituation = 'after_hit';
    return;
  }
  // grapple / finisher: beats block, loses to a strike already landed (handled by stun)
  const fin = kind === 'finisher';
  const toss = nearRopes(def) && def.hp < 40;
  att.mo = fin ? 0 : Math.min(100, att.mo + 18);
  throwW(def, att, fin ? 28 : 15, toss);
  if (fin) { banner('FINISHER!'); shake = 0.6; bloom.strength = 1.6; call(`${short(att)} hits the HEEL TURN DRIVER! The building shakes!`); }
  else call(toss ? `${short(att)} launches ${short(def)} OVER THE TOP ROPE!` : `${short(att)} with a thunderous slam!`);
  lastSituation = 'after_hit';
}
function hit(def, dmg, att) {
  def.hp = Math.max(0, def.hp - dmg); def.state = "stun"; def.t = 0.26; play(def, 'No', 2);
  const away = def.holder.position.clone().sub(att.holder.position).setY(0).normalize();
  def.vel.addScaledVector(away, 3.2); shake = Math.max(shake, 0.12);
  def.mo = Math.min(100, def.mo + 4);
}
function throwW(def, att, dmg, toss) {
  def.hp = Math.max(0, def.hp - dmg); def.state = 'thrown'; def.t = 0;
  const from = def.holder.position.clone();
  let dir = def.holder.position.clone().sub(att.holder.position).setY(0);
  if (dir.lengthSq() < 0.01) dir.set(1, 0, 0); dir.normalize();
  const to = toss ? from.clone().addScaledVector(dir, 3.2).setY(0) : from.clone().addScaledVector(dir, 1.1);
  if (!toss) { to.x = THREE.MathUtils.clamp(to.x, -RING + 0.4, RING - 0.4); to.z = THREE.MathUtils.clamp(to.z, -RING + 0.4, RING - 0.4); }
  def.arc = { from, to, dur: toss ? 1.0 : 0.6, toss };
  play(def, 'Death', 1.6); shake = Math.max(shake, 0.35);
}
function tryPin(att, def) {
  if (busy(att) || def.state !== 'down' || dist(att, def) > 1.6) return false;
  att.state = 'pinning'; def.state = 'pinned';
  pin = { att, victim: def, t: 0, count: 0, mash: 0 };
  play(att, 'Sitting'); call(`${short(att)} goes for the cover!`);
  return true;
}

// ---------- AI (scripted fighter + habit reading; the LLM plan layer slots in here) ----------
let aiPlanT = 0, aiIntent = 'pressure';
function aiThink(dt) {
  const me = P2, you = P1;
  if (me.out || busy(me)) return;
  aiPlanT -= dt;
  if (aiPlanT <= 0) {
    aiPlanT = 3.5;
    const h = habits[lastSituation];
    const fav = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
    const total = h.strike + h.grapple + h.block;
    aiIntent = fav[1] / total > 0.45 ? `counter_${fav[0]}` : 'pressure';
    log(aiIntent.startsWith('counter')
      ? `<em>Kane</em> plan: expect your <em>${fav[0]}</em> (${Math.round(fav[1] / total * 100)}% ${lastSituation.replace('_', ' ')}), answer with <em>${COUNTER[fav[0]]}</em>.`
      : `<em>Kane</em> plan: no clear habit yet (${total - 3} moves seen), apply pressure.`);
  }
  if (you.state === 'down' && tryPin(me, you)) return;
  const d = dist(me, you);
  if (d > 1.3) { moveToward(me, you.holder.position, dt, 2.4); return; }
  const r = Math.random();
  if (r > dt * 1.25) return; // reaction rate (~1.25 actions/s)
  if (me.mo >= 100) return act(me, 'grapple');
  if (you.state === 'wind' && you.move === 'grapple') return act(me, 'strike');
  if (you.state === 'wind' && you.move === 'strike') return act(me, Math.random() < 0.6 ? 'block' : 'strike');
  if (aiIntent.startsWith('counter_')) return act(me, COUNTER[aiIntent.slice(8)]);
  const pick = ['strike', 'strike', 'grapple', 'block'][Math.floor(Math.random() * 4)];
  if (pick === 'block') { me.state = 'block'; play(me, 'No', 1.6); me.t = 0.6; me.autoBlock = true; return; }
  act(me, pick);
}
function moveToward(w, target, dt, speed) {
  const d = target.clone().sub(w.holder.position).setY(0);
  if (d.length() < 0.05) return;
  d.normalize(); w.holder.position.addScaledVector(d, speed * dt);
  w.facing = Math.atan2(d.x, d.z); play(w, 'Walking', 1.3);
}

// ---------- update ----------
const clock = new THREE.Clock();
function update(dt) {
  if (!P1) return;
  // player movement
  if (!busy(P1) && P1.state !== 'block' && !over) {
    const v = new THREE.Vector3((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), 0, (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0));
    if (v.lengthSq() > 0) { v.normalize(); P1.holder.position.addScaledVector(v, 2.8 * dt); P1.facing = Math.atan2(v.x, v.z); play(P1, 'Running', 1.1); }
    else play(P1, 'Idle');
  }
  if (!over) aiThink(dt);

  for (const w of [P1, P2]) {
    const opp = w === P1 ? P2 : P1;
    w.st = Math.min(100, w.st + dt * (w.state === 'idle' ? 10 : 4));
    w.holder.position.addScaledVector(w.vel, dt); w.vel.multiplyScalar(Math.pow(0.02, dt));
    if (w.state === 'wind') { w.t -= dt; if (w.t <= 0) { w.state = 'active'; w.t = MOVES.strike.active; resolve(w, opp); } }
    else if (w.state === 'active') { w.t -= dt; if (w.t <= 0) { w.state = 'rec'; w.t = MOVES[w.move === 'finisher' ? 'grapple' : w.move].rec; } }
    else if (w.state === 'rec' || w.state === 'stun' || w.state === 'taunt') {
      w.t -= dt;
      if (w.state === 'taunt') w.mo = Math.min(100, w.mo + dt * 30);
      if (w.t <= 0) { w.state = 'idle'; play(w, 'Idle'); }
    } else if (w.state === 'block' && w.autoBlock) { w.t -= dt; if (w.t <= 0) { w.state = 'idle'; w.autoBlock = false; play(w, 'Idle'); } }
    else if (w.state === 'thrown') {
      w.t += dt; const k = Math.min(1, w.t / w.arc.dur);
      const p = w.arc.from.clone().lerp(w.arc.to, k);
      const peak = w.arc.toss ? 1.6 : 0.9;
      const baseY = THREE.MathUtils.lerp(w.arc.from.y, w.arc.toss ? 0 : MAT_Y, k);
      p.y = baseY + Math.sin(k * Math.PI) * peak; w.holder.position.copy(p);
      w.root.rotation.x = -k * Math.PI * 0.5;
      if (k >= 1) {
        shake = Math.max(shake, 0.4);
        if (w.arc.toss) { w.state = 'out'; w.out = true; eliminate(w, opp); }
        else { w.state = 'down'; w.t = 2.2 + (100 - w.hp) / 40; }
      }
    } else if (w.state === 'down') {
      w.t -= dt; if (w.t <= 0) { w.state = 'idle'; w.root.rotation.x = 0; play(w, 'Standing', 1.5); call(`${short(w)} is back on his feet!`); }
    }
    // face opponent when idle-ish
    if (['idle', 'wind', 'block', 'active'].includes(w.state)) w.facing = Math.atan2(opp.holder.position.x - w.holder.position.x, opp.holder.position.z - w.holder.position.z);
    w.holder.rotation.y = THREE.MathUtils.lerp(w.holder.rotation.y, w.facing, 0.25);
    // ring bounds + ropes rebound
    if (!w.out && w.state !== 'thrown') {
      const p = w.holder.position, lim = RING - 0.35;
      for (const ax of ['x', 'z']) if (Math.abs(p[ax]) > lim) { p[ax] = Math.sign(p[ax]) * lim; w.vel[ax] *= -0.6; wobble(ax, Math.sign(p[ax])); }
      p.y = MAT_Y;
    }
  }
  // separation
  const sep = P1.holder.position.clone().sub(P2.holder.position).setY(0);
  if (!P1.out && !P2.out && sep.length() < 0.85 && P1.state !== 'thrown' && P2.state !== 'thrown') {
    const gap = 0.85 - sep.length(); if (sep.lengthSq() < 1e-4) sep.set(1, 0, 0); sep.normalize().multiplyScalar(gap * 0.5 + 0.01);
    P1.holder.position.add(sep); P2.holder.position.sub(sep);
  }
  // pin count
  if (pin) {
    pin.t += dt;
    const need = pin.victim === P2 ? (pin.victim.hp / 100) * 2.4 : 0;
    if (pin.victim === P2 && Math.random() < dt * need * 1.4 && pin.t > 0.6) kickout();
    else if (pin.victim === P1 && pin.mash >= 6 + pin.count * 3) kickout();
    else if (pin.t > (pin.count + 1) * 0.85) {
      pin.count++; banner(String(pin.count), 0.6);
      if (pin.count === 3) win(pin.att, 'PINFALL');
    }
  }
  for (const w of [P1, P2]) w.mixer.update(dt);
}
function kickout() {
  call(`KICK OUT! ${short(pin.victim)} kicks out at ${pin.count}!`); banner('KICK OUT!', 0.8);
  pin.att.state = 'idle'; play(pin.att, 'Idle'); pin.victim.state = 'down'; pin.victim.t = 0.6; pin = null;
}
function eliminate(w, by) { win(by, 'OVER THE TOP'); }
function win(w, how) {
  over = true; pin = null; banner(`${short(w).toUpperCase()} WINS`, 999);
  call(`${how}! ${w.name} wins! Press R for a rematch. Kane remembers what you did.`);
  log(`<em>Result</em>: ${short(w)} by ${how.toLowerCase()}. Habits saved for the rematch.`);
  w.state = 'taunt'; w.t = 999; play(w, 'Dance');
}
function wobble(ax, sign) {
  for (const r of ropes) { const s = r.userData.side; const onSide = ax === 'x' ? (sign > 0 ? s === 3 : s === 1) : (sign > 0 ? s === 0 : s === 2); if (onSide) r.userData.wob = 0.25; }
}

// ---------- loop ----------
reset(); window.G = { get P1() { return P1; }, get P2() { return P2; }, habits };
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  const t = clock.elapsedTime;
  // crowd bob (louder when meters are high)
  const hype = 1 + ((P1?.mo || 0) + (P2?.mo || 0)) / 100;
  for (let i = 0; i < CROWD; i++) {
    const s = crowdSeat[i];
    tmp.position.set(s.x, s.y + 0.45 + Math.max(0, Math.sin(t * 6 * hype + s.p)) * 0.08 * hype, s.z);
    tmp.lookAt(0, s.y, 0); tmp.updateMatrix(); crowd.setMatrixAt(i, tmp.matrix);
  }
  crowd.instanceMatrix.needsUpdate = true;
  for (const r of ropes) { if (r.userData.wob) { r.userData.wob *= 0.9; r.position.y = r.userData.base.y + Math.sin(t * 40) * r.userData.wob * 0.15; } }
  spots.forEach((s, i) => { s.intensity = 52 + Math.sin(t * 0.7 + i) * 5; });
  // broadcast camera: follows the action
  if (P1) {
    const mid = P1.holder.position.clone().add(P2.holder.position).multiplyScalar(0.5);
    const spread = dist(P1, P2);
    const want = new THREE.Vector3(mid.x * 0.5 + Math.sin(t * 0.12) * 2, 5.2 + spread * 0.35, mid.z + 8.5 + spread * 0.6);
    camera.position.lerp(want, 0.04);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= 0.88; if (shake < 0.01) shake = 0; }
    camera.lookAt(mid.x, MAT_Y + 0.9, mid.z);
  }
  bloom.strength = THREE.MathUtils.lerp(bloom.strength, 0.35, 0.05);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').style.opacity = 0; }
  if (P1) for (const [i, w] of [[0, P1], [1, P2]]) { $('h' + i).style.width = w.hp + '%'; $('s' + i).style.width = w.st + '%'; $('m' + i).style.width = w.mo + '%'; }
  composer.render();
  requestAnimationFrame(frame);
}
frame();
