// HEEL TURN client: arena rendering, wrestler views, and the window.HEEL contract for the shell (game/ui).
// Combat rules live in shared/sim.js (run here for exhibition, on game/server for online).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Client } from '@colyseus/sdk';
import { createMatch, step, newControl, normHabits, ROSTER, INTRO_SECS } from './shared/sim.js';
import { createAgentLayer } from './agent-layer.js';
import { playPaired, playSolo, updateMoves, isBusy, stopMoves, getRig } from './moves/index.js';
import { createFeel } from './feel/index.js';
import { T } from './shared/tuning.js';
import { loadBodies } from './arena/bodies.js';

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

// ---------- UI helpers (ids owned by the shell's index.html; all optional) ----------
const $ = (id) => document.getElementById(id);
let bannerT = 0;
function banner(text, secs = 1.4) { const b = $('banner'); if (!b) return; b.textContent = text; b.style.opacity = 1; bannerT = secs; }
function call(text) { const c = $('call'); if (c) c.textContent = text; }
function log(html, key, same) {
  const l = $('log'); if (!l) return;
  // A repeated plan (same key, same intent) updates its line with a count instead of a new copy.
  const old = key && same && [...l.children].find((c) => c.dataset.key === key);
  if (old) { old.dataset.n = String(Number(old.dataset.n || 1) + 1); old.innerHTML = `${html} <span class="dl-x">x${old.dataset.n}</span>`; return; }
  const p = document.createElement('p'); p.innerHTML = html; if (key) p.dataset.key = key; l.prepend(p);
  while (l.children.length > 12) l.lastChild.remove();
}
function setText(id, text) { const e = $(id); if (e) e.textContent = text; }
function setWidth(id, pct) { const e = $(id); if (e) e.style.width = pct + '%'; }

// Invite chip for online rooms, created here so index.html stays the shell's.
function showInvite(link) {
  let el = $('heel-invite');
  if (!el) {
    el = document.createElement('div'); el.id = 'heel-invite';
    el.style.cssText = 'position:fixed;top:120px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:8px;align-items:center;'
      + 'background:rgba(5,6,10,.85);border:1px solid #f5c542;padding:8px 12px;font:600 13px Inter,system-ui,sans-serif;color:#fff;max-width:calc(100vw - 32px);';
    el.innerHTML = '<span>Invite a rival:</span><input readonly style="width:300px;max-width:45vw;background:#1b1f29;color:#fff;border:1px solid #3a404d;padding:4px 6px;font:inherit"/>'
      + '<button style="background:#f5c542;color:#000;border:0;padding:5px 10px;font:inherit;cursor:pointer">Copy link</button>';
    const input = el.querySelector('input'), btn = el.querySelector('button');
    btn.onclick = () => {
      const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy link'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, () => input.select());
      else input.select();
    };
    document.body.appendChild(el);
  }
  el.querySelector('input').value = link; el.style.display = 'flex';
}
function hideInvite() { const el = $('heel-invite'); if (el) el.style.display = 'none'; }

const layer = createAgentLayer({ logRow: (html, key, same) => log(html, key, same), call: (t) => call(t) });

// ---------- wrestler views (render only; state lives in shared/sim.js) ----------
const loader = new GLTFLoader();
// Roster bodies (arena/bodies.js, config in shared/roster-assets.js); the sim stays the source of truth.
const bodies = await loadBodies(loader);
const CLIP = { Idle: 'idle', Walking: 'walk', Running: 'run' };

function makeView(w) {
  const { obj, animations } = bodies.make(w.id);
  obj.position.set(w.x, w.y, w.z); obj.rotation.y = w.facing; scene.add(obj);
  getRig(obj);
  const mixer = new THREE.AnimationMixer(obj);
  const actions = {}; for (const c of animations) actions[c.name] = mixer.clipAction(c);
  return { id: w.id, holder: obj, root: obj, mixer, actions, cur: null, seq: -1, anim: null, lying: false };
}
function play(v, name, speed = 1) {
  const a = v.actions[name]; if (!a || v.cur === a) { if (a) a.timeScale = speed; return; }
  a.reset(); a.timeScale = speed; a.fadeIn(T.view.locomotionFade).play();
  if (v.cur) v.cur.fadeOut(T.view.locomotionFade);
  v.cur = a;
}
let views = [];
let nextFinisher = false;
const GRAPPLES = ['bodyslam', 'suplex', 'ddt'];
function safe(fn) { try { fn(); } catch (e) { console.warn('[heel] move', e); } }
function onAnim(i, w, prev) {
  const v = views[i], o = views[1 - i];
  if (!o) return;
  const name = w.anim;
  if (CLIP[name]) {
    // the sim says this wrestler is on its feet: release any held pose (pin cover after a kickout) so the body
    // snaps back to the sim position in syncViews
    if (w.state === 'idle' && isBusy(v.root)) safe(() => stopMoves(v.root));
    play(v, CLIP[name], name === 'Idle' ? 1 : Math.max(0.8, w.animSpeed * 0.8)); return;
  }
  const follow = () => { const s = current()?.w[i]; return s && { position: s, yaw: s.facing }; }; // strikes track the sim
  if (name === 'Punch') safe(() => playSolo('jab', v.root, { speed: T.view.jabSpeed, follow }));
  else if (name === 'No' && w.state === 'stun') safe(() => { if (!isBusy(v.root)) playSolo('hitReact', v.root, { speed: T.view.hitReactSpeed, follow }); });
  else if (name === 'Death') {
    const id = nextFinisher ? 'suplex' : GRAPPLES[Math.floor(Math.random() * GRAPPLES.length)];
    const fin = nextFinisher; nextFinisher = false;
    safe(() => {
      stopMoves(o.root); stopMoves(v.root);
      playPaired(id, o.root, v.root, {
        onCamera: (cue) => { if (fin && cue === 'low-angle') shake = Math.max(shake, 0.5 * shakeScale()); },
        onImpact: () => { shake = Math.max(shake, (fin ? 0.6 : 0.3) * shakeScale()); },
      });
    });
    v.lying = true;
  } else if (name === 'Sitting') safe(() => {
    // The cover is rooted at the sim, on the mat: never at the victim's drawn body, which may still be mid-slam
    // in the air or where the slam's track left it. The pin track lays the victim 0.75 m along the root's +z.
    const vs = current()?.w[1 - i]; if (!vs) return;
    const yaw = Math.atan2(vs.x - w.x, vs.z - w.z);
    const root = { position: new THREE.Vector3(vs.x - Math.sin(yaw) * 0.75, MAT_Y, vs.z - Math.cos(yaw) * 0.75), yaw };
    stopMoves(v.root); stopMoves(o.root); playPaired('pin', v.root, o.root, { root });
  });
  else if (name === 'Dance') safe(() => { stopMoves(v.root); playSolo(i === 0 ? 'tauntArms' : 'chestPound', v.root, { root: { position: new THREE.Vector3(w.x, MAT_Y, w.z), yaw: w.facing } }); }); // the win: up off the cover
  else if (name === 'ThumbsUp') safe(() => { if (!isBusy(v.root)) playSolo(i === 0 ? 'tauntArms' : 'chestPound', v.root, {}); });
  else if (name === 'Standing') { safe(() => { stopMoves(v.root); playSolo('kipup', v.root, { root: { position: v.root.position, yaw: v.root.rotation.y } }); }); v.lying = false; }
}
function clearViews() {
  for (const v of views) { safe(() => stopMoves(v.root)); scene.remove(v.holder); } views = [];
  if (ref) { safe(() => stopMoves(ref.root)); scene.remove(ref.holder); ref = null; }
}

// Referee Lou Varga (an agent on the server side): white shirt, black joints, works the ropes and counts pins.
let ref = null;
function makeRef() {
  const v = makeView({ id: 'lou', tint: 0xf1f1f1, x: 0, y: MAT_Y, z: -RING + 0.55, facing: 0 });
  v.holder.traverse((o) => { if (o.isMesh && o.name.includes('Joints')) o.material.color.set(0x111111); });
  v.holder.scale.setScalar(0.94);
  play(v, 'idle'); v.pinSeen = false; v.home = new THREE.Vector3(0, MAT_Y, -RING + 0.55);
  feel.alive(v.root, { role: 'ref', target: () => views[1] && views[0].holder.position.clone().lerp(views[1].holder.position, 0.5) });
  return v;
}
function updateRef(st, dt) {
  if (!ref) ref = makeRef();
  const [A, B] = st.w;
  if (st.pin && !ref.pinSeen) {
    // slide in beside the pinned wrestler and slap the mat: one, two, (three)
    ref.pinSeen = true;
    const vic = st.w[st.pin.victim], side = Math.sign(vic.z || 1);
    const at = new THREE.Vector3(vic.x + 0.35, MAT_Y, vic.z - side * 0.75);
    safe(() => { stopMoves(ref.root); playSolo('refcount', ref.root, { root: { position: at, yaw: side > 0 ? 0 : Math.PI } }); });
  } else if (!st.pin && ref.pinSeen) { ref.pinSeen = false; safe(() => stopMoves(ref.root)); } // refcount holds its pose until released
  if (!isBusy(ref.root)) {
    // shadow the action along the near-side ropes, always facing the wrestlers
    const mid = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
    const want = new THREE.Vector3(THREE.MathUtils.clamp(mid.x * 0.6, -RING + 0.6, RING - 0.6), MAT_Y, mid.z > 0 ? -RING + 0.55 : RING - 0.55);
    const moving = ref.root.position.distanceTo(want) > 0.08;
    ref.root.position.lerp(want, Math.min(1, dt * 1.6));
    ref.root.rotation.set(0, Math.atan2(mid.x - ref.root.position.x, mid.z - ref.root.position.z), 0);
    play(ref, moving ? 'walk' : 'idle', moving ? 0.9 : 1);
  }
  ref.mixer.update(dt);
}
function syncViews(ws, dt) {
  ws.forEach((w, i) => {
    if (!views[i] || views[i].id !== w.id) {
      if (views[i]) scene.remove(views[i].holder);
      views[i] = makeView(w); setText('n' + i, w.name); play(views[i], 'idle');
    }
  });
  ws.forEach((w, i) => {
    const v = views[i];
    if (w.animSeq !== v.seq) { const prev = v.anim; v.anim = w.anim; v.seq = w.animSeq; onAnim(i, w, prev); }
    if (!isBusy(v.root)) {
      v.root.position.set(w.x, w.y, w.z);
      v.root.rotation.set(w.rotX, w.facing, 0, 'YXZ');
      if (w.rotX) v.root.position.y = w.y + 0.12;
    }
    v.mixer.update(dt);
  });
  if (dt > 0) updateMoves(dt);
}

// ---------- session: none (attract mode), exhibition (local sim) or online (Colyseus room) ----------
let session = null;
let paused = false;
let savedHabits = null; // the AI remembers you across exhibition rematches
const endCbs = [];
const params = new URLSearchParams(location.search);
const INTERP_MS = 100;

function serverUrl() {
  return params.get('server') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;
}
function withTimeout(p, ms, what) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))]);
}

function startLocal(p1, p2) {
  const match = createMatch(p1, p2, savedHabits);
  savedHabits = match.habits;
  session = { mode: 'exhibition', slot: 0, match, ctl: [newControl(true), newControl(false)] };
  // Bruin memory: the AI's habit table for you comes from the marts when they answer before/at the bell.
  const id = 'm' + Date.now().toString(36);
  const started = layer.matchStart({ match: id, wrestlers: [p1, p2], humans: [true, false] });
  layer.bind(match);
  started.then((h) => {
    if (h && session?.match === match) { match.habits = normHabits(h); savedHabits = match.habits; }
  });
}

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
async function startOnline(cfg, p1, p2) {
  const client = new Client(serverUrl());
  const code = roomCode(cfg.room || params.get('room')) || Array.from({ length: 6 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');
  const join = () => withTimeout(client.joinById(code, { pick: p1 }), 4000, 'join');
  const create = () => withTimeout(client.create('ring', { roomId: code, p1, p2 }), 4000, 'create');
  // Host creates the room under the shell's code; a guest joins it. Either falls back to the other,
  // so whoever arrives first opens the ring.
  const host = cfg.host ?? !(cfg.room || params.get('room'));
  const [first, second] = host ? [create, join] : [join, create];
  const room = await first().catch((e) => { console.warn('[heel] room', host ? 'create' : 'join', 'failed, trying the other', e); return second(); });
  const s = { mode: 'online', slot: -1, room, snaps: [], latest: null, sentMove: '0,0' };
  session = s;
  const url = new URL(location.href); url.searchParams.set('room', room.roomId);
  history.replaceState(null, '', url);
  s.invite = url.toString();
  showInvite(s.invite);
  room.onMessage('s', (snap) => {
    if (session !== s) return;
    snap.at = performance.now();
    s.snaps.push(snap); if (s.snaps.length > 12) s.snaps.shift();
    s.latest = snap; s.slot = snap.slots.indexOf(room.sessionId);
    if (!s.full && snap.slots.every(Boolean)) { s.full = true; hideInvite(); }
    handleEvents(snap.ev);
  });
  room.onLeave(() => { if (session === s) { call('Lost the arena server. Back to the menu to play offline.'); s.lost = true; } });
}

async function startMatch(cfg = {}) {
  toMenu();
  const p1 = ROSTER[cfg.p1] ? cfg.p1 : 'vex';
  const p2 = ROSTER[cfg.p2] ? cfg.p2 : (p1 === 'kane' ? 'vex' : 'kane');
  if (cfg.mode === 'online') {
    try { await startOnline(cfg, p1, p2); return { mode: 'online', room: session.room.roomId, invite: session.invite }; }
    catch (e) { console.warn('[heel] arena server unreachable, falling back to a local match', e); }
  }
  startLocal(p1, p2);
  if (cfg.mode === 'online') call('Arena server unreachable. Exhibition vs the AI instead.');
  return { mode: 'exhibition' };
}

function toMenu() {
  if (session?.room) session.room.leave().catch(() => {});
  session = null; clearViews(); hideInvite(); paused = false;
  bannerT = 0; const b = $('banner'); if (b) b.style.opacity = 0;
  keysDown.clear();
}

function rematch() {
  if (!session) return;
  if (session.mode === 'online') session.room.send('in', { k: 'rematch' });
  else { const [a, b] = session.match.w; startLocal(a.id, b.id); }
}

let shake = 0;
// Shell settings: { volume, shake } on window.HEEL_SETTINGS (read live, so 'heel:settings' needs no listener).
const shakeScale = () => (window.HEEL_SETTINGS?.shake === false || window.HEEL_SETTINGS?.shake === 0 ? 0 : 1);
function handleEvents(evs) {
  const facts = evs.filter((e) => e.k === 'fact');
  if (facts.length && session?.mode === 'exhibition') layer.facts(facts);
  for (const e of evs) {
    feel.onEvent(e, currentRaw());
    if (e.k === 'banner') banner(e.text, e.secs);
    else if (e.k === 'call') call(e.text);
    else if (e.k === 'log') log(e.html, e.key, e.same);
    else if (e.k === 'shake') shake = Math.max(shake, e.v * shakeScale());
    else if (e.k === 'finisher') { nextFinisher = true; shake = 0.6 * shakeScale(); bloom.strength = 1.6; }
    else if (e.k === 'wobble') wobble(e.ax, e.sign);
    else if (e.k === 'end') matchEnded(e);
  }
}
// Payload contract with the shell (game/ui/menu.js): winner is the slot ('p1' host / exhibition player,
// 'p2' guest or AI); stats are [p1, p2] arrays.
function matchEnded(e) {
  const st = currentRaw();
  const col = (k) => e.stats.map((x) => x[k]);
  const result = {
    winner: e.winner === 0 ? 'p1' : 'p2', how: e.how,
    stats: { strikes: col('strikes'), grapples: col('grapples'), blocks: col('blocks'), reversals: col('reversals') },
    aiPlansLog: e.aiPlansLog,
    winnerId: st.w[e.winner].id, winnerName: st.w[e.winner].name, mode: session.mode, mySlot: Math.max(0, session.slot),
  };
  for (const cb of endCbs) { try { cb(result); } catch (err) { console.error(err); } }
  if (session.mode === 'exhibition') layer.matchEnd();
}

// Render state: the local match, or the server snapshot interpolated INTERP_MS behind real time.
function currentRaw() { return session?.mode === 'online' ? session.latest : session?.match; }
function current() {
  if (!session || session.mode === 'exhibition') return currentRaw();
  const { snaps, latest } = session;
  if (!latest) return null;
  const rt = performance.now() - INTERP_MS;
  for (let i = snaps.length - 1; i > 0; i--) {
    const a = snaps[i - 1], b = snaps[i];
    if (a.at <= rt && rt <= b.at) {
      const k = (rt - a.at) / Math.max(1, b.at - a.at);
      return { ...latest, w: b.w.map((w, j) => {
        const p = a.w[j];
        return { ...w, x: p.x + (w.x - p.x) * k, y: p.y + (w.y - p.y) * k, z: p.z + (w.z - p.z) * k, rotX: p.rotX + (w.rotX - p.rotX) * k };
      }) };
    }
  }
  return latest;
}

// ---------- input: the local player's wrestler (slot 0 offline, the assigned slot online) ----------
const keysDown = new Set();
const ACTION_KEYS = { KeyJ: 'strike', KeyK: 'grapple', KeyL: 'block', Space: 'taunt', KeyI: 'whip' };
function send(a) {
  if (!session || paused) return;
  if (session.mode === 'exhibition') session.ctl[0].queue.push(a);
  else if (session.slot >= 0) session.room.send('in', { k: 'act', a });
}
function sendMove() {
  if (!session) return;
  const mx = paused ? 0 : (keysDown.has('KeyD') ? 1 : 0) - (keysDown.has('KeyA') ? 1 : 0);
  const mz = paused ? 0 : (keysDown.has('KeyS') ? 1 : 0) - (keysDown.has('KeyW') ? 1 : 0);
  const run = !paused && feel.running(keysDown);
  if (session.mode === 'exhibition') { session.ctl[0].mx = mx; session.ctl[0].mz = mz; session.ctl[0].run = run; return; }
  const key = `${mx},${mz},${run}`;
  if (key !== session.sentMove) { session.sentMove = key; session.room.send('in', { k: 'move', x: mx, z: mz, run }); }
}
addEventListener('keydown', (e) => {
  if (e.repeat || !session || e.target?.tagName === 'INPUT') return;
  keysDown.add(e.code);
  if (ACTION_KEYS[e.code]) { if (e.code === 'Space') e.preventDefault(); send(ACTION_KEYS[e.code]); }
  if (e.code === 'KeyR' && currentRaw()?.over) rematch();
  sendMove();
});
addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
  if (e.code === 'KeyL') send('blockUp');
  sendMove();
});
addEventListener('blur', () => { keysDown.clear(); sendMove(); });

function wobble(ax, sign) {
  for (const r of ropes) { const s = r.userData.side; const onSide = ax === 'x' ? (sign > 0 ? s === 3 : s === 1) : (sign > 0 ? s === 0 : s === 2); if (onSide) r.userData.wob = 0.25; }
}

// ---------- public contract for the shell (game/ui) ----------
window.HEEL = {
  startMatch,
  onMatchEnd(cb) { endCbs.push(cb); return () => { const i = endCbs.indexOf(cb); if (i >= 0) endCbs.splice(i, 1); }; },
  toMenu,
  setPaused(b) { paused = !!b; if (paused) { keysDown.clear(); sendMove(); } },
  rematch,
  get roster() { return ROSTER; },
  get session() { return session && { mode: session.mode, slot: session.slot, room: session.room?.roomId, invite: session.invite }; },
};
window.G = {
  get P1() { return currentRaw()?.w[0]; }, get P2() { return currentRaw()?.w[1]; },
  get state() { return currentRaw(); }, get session() { return window.HEEL.session; },
};

// ---------- loop ----------
const clock = new THREE.Clock();
const feel = createFeel({ scene, camera, getViews: () => views });
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const { simDt, viewDt } = feel.begin(dt, current());
  if (session?.mode === 'exhibition' && !paused) {
    step(session.match, simDt, session.ctl);
    handleEvents(session.match.events); session.match.events = [];
    layer.tick(session.match); // posts to the agents server every ~4 s; never awaited here
  }
  const st = current();
  if (st) { const sdt = paused && session.mode === 'exhibition' ? 0 : viewDt; syncViews(st.w, sdt); safe(() => updateRef(st, sdt)); }
  // crowd bob (louder when meters are high)
  const hype = feel.hype(st);
  for (let i = 0; i < CROWD; i++) {
    const s = crowdSeat[i];
    tmp.position.set(s.x, s.y + 0.45 + Math.max(0, Math.sin(t * 6 * hype + s.p)) * 0.08 * hype, s.z);
    tmp.lookAt(0, s.y, 0); tmp.updateMatrix(); crowd.setMatrixAt(i, tmp.matrix);
  }
  crowd.instanceMatrix.needsUpdate = true;
  for (const r of ropes) { if (r.userData.wob) { r.userData.wob *= 0.9; r.position.y = r.userData.base.y + Math.sin(t * 40) * r.userData.wob * 0.15; } }
  spots.forEach((s, i) => { s.intensity = 52 + Math.sin(t * 0.7 + i) * 5; });
  if (!st) {
    feel.frame(dt, null);
    // attract mode: slow orbit around the empty ring
    const a = t * 0.12;
    camera.position.lerp(new THREE.Vector3(Math.sin(a) * 13, 6.5, Math.cos(a) * 13), 0.05);
    camera.lookAt(0, MAT_Y + 0.6, 0);
  } else {
    const [A, B] = views.map((v) => v.holder.position);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const spread = A.distanceTo(B);
    let want;
    if (st.introT > 0) {
      // intro sweep: swing from a high side angle down to the broadcast position over INTRO_SECS
      const k = 1 - st.introT / INTRO_SECS, a = (1 - k) * 2.2, r = 9 + 5 * (1 - k);
      want = new THREE.Vector3(Math.sin(a) * r, 4 + 4 * (1 - k), Math.cos(a) * r);
    } else want = new THREE.Vector3(mid.x * 0.5 + Math.sin(t * 0.12) * 2, 5.2 + spread * 0.35, mid.z + 8.5 + spread * 0.6);
    camera.position.lerp(want, st.introT > 0 ? 0.06 : 0.04);
    feel.addTrauma(shake * 0.5); shake = 0;
    camera.lookAt(mid.x, MAT_Y + 0.9, mid.z);
    feel.frame(dt, st, mid);
    st.w.forEach((w, i) => { setWidth('h' + i, w.hp); setWidth('s' + i, w.st); setWidth('m' + i, w.mo); });
  }
  bloom.strength = THREE.MathUtils.lerp(bloom.strength, 0.35, 0.05);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0 && $('banner')) $('banner').style.opacity = 0; }
  composer.render();
  requestAnimationFrame(frame);
}
frame();
