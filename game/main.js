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
import { createAgentLayer, planHtml } from './agent-layer.js';
import { createRoyal, stepRoyal, verdict as royalVerdict } from './shared/royal.js';
import { createRoyalClient } from './royal-client.js';
import { playPaired, playSolo, updateMoves, isBusy, stopMoves, releaseMoves, getRig, activeMove, contactReport } from './moves/index.js';
import { createFeel } from './feel/index.js';
import { T } from './shared/tuning.js';
import { loadBodies } from './arena/bodies.js';
import { createAnimator, animFor } from './shared/anims.js';
import { createReferee } from './arena/referee.js';
import { createEntrance } from './feel/entrance.js';
import { createAisle, inGap, AISLE_THETA, AISLE_GAP } from './arena/aisle.js';
import { createBooth } from './arena/booth.js';
import { mountLowerThird } from './feel/lowerthird.js';
import { winnerLine } from '../voice/announcer.js';
import { CHARACTERS, cssHex } from './shared/characters.js';
import { DEMO } from './demo.js';

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
  let a = Math.random() * Math.PI * 2;
  while (inGap(Math.cos(a) * r, Math.sin(a) * r)) a = Math.random() * Math.PI * 2; // the entrance aisle stays clear
  const y = 0.4 + row * 0.55;
  crowdSeat.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y, p: Math.random() * 6.28 });
  col.setHSL(Math.random(), 0.35, 0.18 + Math.random() * 0.25); crowd.setColorAt(i, col);
}
scene.add(crowd);
// stands
for (let row = 0; row < 14; row++) {
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(8.9 + row * 0.9, 8.9 + row * 0.9, 0.55, 64, 1, true, AISLE_THETA + AISLE_GAP, Math.PI * 2 - AISLE_GAP * 2),
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
const aisle = createAisle({ scene, matY: MAT_Y, ring: RING });

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
function nameColor(i, id) { const e = $('n' + i), c = CHARACTERS[id]; if (e && c) e.style.color = cssHex(c.palette.ui); }
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
// OVER THE TOP: the commissioner's verdict lands in the local sim, or goes to the arena server online.
const royal = createRoyalClient({
  logRow: (html, key, same) => log(html, key, same), planHtml,
  decide: (id, decision) => {
    if (session?.mode === 'online') session.room.send('in', { k: 'verdict', id, decision });
    else if (session?.royal) royalVerdict(session.match, id, decision);
  },
});

// ---------- wrestler views (render only; state lives in shared/sim.js) ----------
const loader = new GLTFLoader();
// Roster bodies (arena/bodies.js, config in shared/roster-assets.js); the sim stays the source of truth.
const bodies = await loadBodies(loader);
// the broadcast: Rex and Dot at the announce desk (arena/booth.js) and the speaker name strap (feel/lowerthird.js)
const booth = createBooth({ scene, bodies, matY: MAT_Y, ring: RING }); mountLowerThird();

function makeView(w) {
  const { obj, animations } = bodies.make(w.id);
  obj.position.set(w.x, w.y, w.z); obj.rotation.y = w.facing; scene.add(obj);
  getRig(obj);
  return { id: w.id, holder: obj, root: obj, anim8: createAnimator(obj, animations), seq: -1, anim: null, lying: false };
}
// Clip names and timing live in shared/anims.js.
function play(v, name, speed = 1) { v.anim8.play(name, speed); }
let views = [];
let nextFinisher = false;
const GRAPPLES = ['bodyslam', 'suplex', 'ddt'];
function safe(fn) { try { fn(); } catch (e) { console.warn('[heel] move', e); } }
function onAnim(i, w, prev) {
  const v = views[i], o = views[w.foe ?? 1 - i];
  if (!o) return;
  const name = w.anim;
  const over = !!current()?.over;
  const clip = animFor(w, over);
  if (clip) {
    // on its feet again (pin cover after a kickout, the win): ease out of any held pose into the clip
    if (isBusy(v.root) && (w.state === 'idle' || over)) safe(() => releaseMoves(v.root));
    const loco = clip === 'walk' || clip === 'run' || clip === 'sprint';
    play(v, clip, loco ? Math.max(0.8, w.animSpeed * 0.8) : 1); return;
  }
  play(v, 'idle'); // under a procedural move the clip layer settles to idle
  if (name === 'Death') {
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
  else if (name === 'Standing') {
    // committed (exhibition): kip up from where the sim says the hips lie, facing his sim facing, so the get-up
    // starts under the drawn body and ends where the sim will put him; online keeps the drawn-root start
    const root = w.state === 'getup' ? { position: new THREE.Vector3(w.x, MAT_Y, w.z), yaw: w.facing } : { position: v.root.position, yaw: v.root.rotation.y };
    safe(() => { stopMoves(v.root); playSolo('kipup', v.root, { root }); }); v.lying = false;
  }
}
// Committed paired move (shared/pair.js, exhibition): play it on the sim's root and the sim's clock, so both
// bodies stay on one timeline; when it ends, write where the drawn bodies landed back into the sim.
const _hip = new THREE.Vector3();
function startPair(e) {
  const A = views[e.att], D = views[e.def], m = session?.match;
  if (!A || !D || !m) return;
  let last = 0;
  const clock = () => { const p = m.pair; if (p && p.seq === e.seq) last = p.t; else if (!p || p.seq > e.seq) last = Math.max(last, 99); return last; };
  if (e.phase === 'move' && e.move !== 'lockknee') D.lying = true;
  safe(() => playPaired(e.move, A.root, D.root, {
    root: { position: new THREE.Vector3(e.root.x, MAT_Y, e.root.z), yaw: e.root.yaw }, clock,
    onEnd: () => {
      if (m.pair && m.pair.seq !== e.seq) return; // handed over to the next move: nothing to write back
      const a = m.w[e.att], d = m.w[e.def];
      a.x = A.root.position.x; a.z = A.root.position.z;
      const hips = getRig(D.root).bones.hips;
      if (D.lying && hips) { hips.getWorldPosition(_hip); d.x = _hip.x; d.z = _hip.z; } else { d.x = D.root.position.x; d.z = D.root.position.z; }
    },
  }));
}
function clearViews() {
  for (const v of views) { safe(() => stopMoves(v.root)); scene.remove(v.holder); } views = [];
  if (ref) { safe(() => ref.dispose()); ref = null; }
}

// Referee Lou Varga (an agent on the server side): body and behavior in arena/referee.js.
let ref = null;
function updateRef(st, dt) {
  ref ||= createReferee({
    body: bodies.make('lou'), matY: MAT_Y, ring: RING,
    alive: (root, o) => feel.alive(root, { ...o, target: () => views[1] && views[0].holder.position.clone().lerp(views[1].holder.position, 0.5) }),
  });
  if (!ref.obj.parent) scene.add(ref.obj);
  ref.update(st, dt);
}
const _tp = new THREE.Vector3(), _tq = new THREE.Quaternion(), _te = new THREE.Euler();
function syncViews(ws, dt) {
  ws.forEach((w, i) => {
    if (!views[i] || views[i].id !== w.id) {
      if (views[i]) scene.remove(views[i].holder);
      views[i] = makeView(w); setText('n' + i, w.name); nameColor(i, w.id); play(views[i], 'idle');
    }
  });
  ws.forEach((w, i) => {
    const v = views[i];
    v.holder.visible = w.state !== 'waiting';
    if (w.animSeq !== v.seq) { const prev = v.anim; v.anim = w.anim; v.seq = w.animSeq; onAnim(i, w, prev); }
    const moving = !!activeMove(v.root);
    if (v.moved && !moving) v.easeT = 0.4; // a move just let go: ease home from where it left the body
    v.moved = moving;
    if (!isBusy(v.root)) {
      // follow the sim; after a move lets go (it may end a step away, e.g. off the pin cover) ease over instead of popping
      _tp.set(w.x, w.y + (w.rotX ? 0.12 : 0), w.z); _tq.setFromEuler(_te.set(w.rotX, w.facing, 0, 'YXZ'));
      const gap = v.root.position.distanceTo(_tp);
      if (dt === 0) { /* hitstop or pause: hold the frame, never snap */ }
      else if (v.easeT > 0 && gap > 0.02 && gap < 2.5) { v.easeT -= dt; const k = Math.min(1 - Math.exp(-dt * 14), 0.25 / gap); v.root.position.lerp(_tp, k); v.root.quaternion.slerp(_tq, 1 - Math.exp(-dt * 14)); }
      else { v.root.position.copy(_tp); v.root.quaternion.copy(_tq); }
    }
    v.anim8.update(dt);
  });
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
  const match = createMatch(p1, p2, savedHabits, { committed: true, demo: DEMO });
  savedHabits = match.habits;
  session = { mode: 'exhibition', slot: 0, match, ctl: [newControl(true), newControl(false)], entrance: true };
  // Bruin memory: the AI's habit table for you comes from the marts when they answer before/at the bell.
  const id = 'm' + Date.now().toString(36);
  const started = layer.matchStart({ match: id, wrestlers: [p1, p2], humans: [true, false] });
  layer.bind(match);
  started.then((h) => {
    if (h && session?.match === match) { match.habits = normHabits(h); savedHabits = match.habits; }
  });
}

function startLocalRoyal(p1) {
  const match = createRoyal({ humans: [p1] });
  session = { mode: 'exhibition', royal: true, slot: 0, match, ctl: match.w.map((_, i) => newControl(i === 0)) };
  const id = 'r' + Date.now().toString(36);
  layer.matchStart({ match: id, wrestlers: match.w.map((w) => w.id), humans: match.w.map((w) => w.human) });
  layer.bind(match);
  royal.start({ matchId: id, commissioner: true, humans: [{ slot: 0, id: p1 }], mySlot: 0 });
}

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
async function startOnline(cfg, p1, p2) {
  const client = new Client(serverUrl());
  const code = roomCode(cfg.room || params.get('room')) || Array.from({ length: 6 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');
  const join = () => withTimeout(client.joinById(code, { pick: p1 }), 4000, 'join');
  const kind = cfg.mode === 'royal' ? 'royal' : 'ring';
  const create = () => withTimeout(client.create(kind, { roomId: code, p1, p2 }), 4000, 'create');
  // Host creates the room under the shell's code; a guest joins it. Either falls back to the other,
  // so whoever arrives first opens the ring.
  const host = cfg.host ?? !(cfg.room || params.get('room'));
  const [first, second] = host ? [create, join] : [join, create];
  const room = await first().catch((e) => { console.warn('[heel] room', host ? 'create' : 'join', 'failed, trying the other', e); return second(); });
  const s = { mode: 'online', slot: -1, room, snaps: [], latest: null, sentMove: '0,0' };
  session = s;
  const url = new URL(location.href); url.searchParams.set('room', room.roomId);
  if (kind === 'royal') { url.searchParams.set('royal', '1'); royal.start({ matchId: 'r' + room.roomId, commissioner: host, online: true }); }
  history.replaceState(null, '', url);
  s.invite = url.toString();
  showInvite(s.invite);
  room.onMessage('s', (snap) => {
    if (session !== s) return;
    snap.at = performance.now();
    s.snaps.push(snap); if (s.snaps.length > 12) s.snaps.shift();
    s.latest = snap; s.slot = snap.slots.indexOf(room.sessionId);
    if (snap.mode === 'royal') royal.setCommissioner(s.slot === 0); // player 1 rules on proposals
    if (!s.full && snap.slots.filter(Boolean).length >= (snap.mode === 'royal' ? 2 : snap.slots.length)) { s.full = true; hideInvite(); }
    handleEvents(snap.ev);
  });
  room.onLeave(() => { if (session === s) { call('Lost the arena server. Back to the menu to play offline.'); s.lost = true; } });
}

async function startMatch(cfg = {}) {
  toMenu();
  const p1 = ROSTER[cfg.p1] ? cfg.p1 : 'vex';
  const p2 = ROSTER[cfg.p2] ? cfg.p2 : (p1 === 'kane' ? 'vex' : 'kane');
  if (cfg.mode === 'royal' && !(cfg.room || params.get('room'))) { startLocalRoyal(p1); return { mode: 'royal' }; }
  if (cfg.mode === 'online' || cfg.mode === 'royal') {
    try { await startOnline(cfg, p1, p2); return { mode: 'online', room: session.room.roomId, invite: session.invite }; }
    catch (e) { console.warn('[heel] arena server unreachable, falling back to a local match', e); }
  }
  if (cfg.mode === 'royal') { startLocalRoyal(p1); call('Arena server unreachable. Over the Top against the AI instead.'); return { mode: 'royal' }; }
  startLocal(p1, p2);
  if (cfg.mode === 'online') call('Arena server unreachable. Exhibition vs the AI instead.');
  return { mode: 'exhibition' };
}

function toMenu() {
  entrance.finish();
  if (session?.room) session.room.leave().catch(() => {});
  session = null; clearViews(); hideInvite(); paused = false; royal.stop();
  bannerT = 0; const b = $('banner'); if (b) b.style.opacity = 0;
  keysDown.clear();
}

function rematch() {
  if (!session) return;
  if (session.mode === 'online') session.room.send('in', { k: 'rematch' });
  else if (session.royal) startLocalRoyal(session.match.w[0].id);
  else { const [a, b] = session.match.w; startLocal(a.id, b.id); }
}

let shake = 0;
let pairCam = null;
// Shell settings: { volume, shake } on window.HEEL_SETTINGS (read live, so 'heel:settings' needs no listener).
const shakeScale = () => (window.HEEL_SETTINGS?.shake === false || window.HEEL_SETTINGS?.shake === 0 ? 0 : 1);
function handleEvents(evs) {
  const facts = evs.filter((e) => e.k === 'fact');
  if (facts.length && session?.mode === 'exhibition') layer.facts(facts);
  if (royal.active) royal.events(evs, currentRaw());
  for (const e of evs) {
    feel.onEvent(e, currentRaw()); booth.onEvent(e);
    if (e.k === 'banner') banner(e.text, e.secs);
    else if (e.k === 'call') call(e.text);
    else if (e.k === 'log') log(e.html, e.key, e.same);
    else if (e.k === 'shake') shake = Math.max(shake, e.v * shakeScale());
    else if (e.k === 'finisher') { nextFinisher = true; shake = 0.6 * shakeScale(); bloom.strength = 1.6; }
    else if (e.k === 'wobble') wobble(e.ax, e.sign);
    else if (e.k === 'pair') startPair(e);
    else if (e.k === 'end') matchEnded(e);
  }
}
// Payload contract with the shell (game/ui/menu.js): winner is the slot ('p1' host / exhibition player,
// 'p2' guest or AI); stats are [p1, p2] arrays.
function matchEnded(e) {
  const st = currentRaw();
  const col = (k) => e.stats.map((x) => x[k]);
  const result = {
    winner: e.royal ? (e.winner === Math.max(0, session.slot) ? 'p1' : 'p2') : e.winner === 0 ? 'p1' : 'p2', how: e.how,
    stats: { strikes: col('strikes'), grapples: col('grapples'), blocks: col('blocks'), reversals: col('reversals') },
    aiPlansLog: e.aiPlansLog,
    winnerId: st.w[e.winner].id, winnerName: st.w[e.winner].name, mode: session.mode, mySlot: Math.max(0, session.slot),
  };
  setTimeout(() => layer.announce(winnerLine(result.winnerId)), 450); // as the results banner lands (its wipe is ~420 ms)
  layer.promoPost(result, st.w); // winner then loser promo on the results screen
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
// Animation probe (game/tools/anim_check.py): per character, the clip and move driving it, the chest's angle
// to the body root, and the largest per-frame chest jump since the last read (a twist shows as a spike).
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
function chestRel(v, out) {
  if (!v?.root || !v.holder) return null;
  const sp = getRig(v.root).bones.spine2; if (!sp) return null;
  v.holder.getWorldQuaternion(_qa); sp.getWorldQuaternion(out);
  return out.premultiply(_qa.invert());
}
function trackChest(v) {
  if (!v || !v.root || !v.holder) return; // the ref (arena/referee.js) has its own shape
  if (!chestRel(v, _qb)) return;
  if (v.prevChest) v.maxStep = Math.max(v.maxStep || 0, 2 * Math.acos(Math.min(1, Math.abs(v.prevChest.dot(_qb)))) * 180 / Math.PI);
  (v.prevChest ||= new THREE.Quaternion()).copy(_qb);
}
function probe(v, w) {
  const rel = chestRel(v, _qc), step = v.maxStep || 0; v.maxStep = 0;
  const m = v.anim8, a = m.action; const miss = m.miss; m.miss = null;
  return { id: v.id, state: w?.state ?? null, anim: w?.anim ?? null, clip: m.name, req: m.req,
    once: a ? a.loop === THREE.LoopOnce : false, clipTime: a ? +a.time.toFixed(3) : null, miss,
    move: activeMove(v.root), step: +step.toFixed(1),
    chest: rel ? +(2 * Math.acos(Math.min(1, Math.abs(rel.w))) * 180 / Math.PI).toFixed(2) : null };
}
window.HEEL_ANIM = () => ({ t: performance.now(), over: !!current()?.over,
  w: views.map((v, i) => probe(v, current()?.w[i])), ref: ref ? probe(ref, null) : null });
// Sync probe (game/tools/sync-probe.mjs): per wrestler the drawn hips (floor x/z) next to the sim position, the
// move driving the body, and the paired move's live hand-contact errors (meters).
const _sh = new THREE.Vector3();
window.HEEL_SYNC = () => { const st = currentRaw(); return st && { pair: st.pair ? { move: st.pair.move, phase: st.pair.phase, t: st.pair.t, seq: st.pair.seq } : null,
  contacts: contactReport(), w: views.map((v, i) => { getRig(v.root).bones.hips?.getWorldPosition(_sh);
    return { hx: _sh.x, hz: _sh.z, rx: v.root.position.x, rz: v.root.position.z, sx: st.w[i].x, sz: st.w[i].z, fy: st.w[i].facing,
      ry: (() => { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(v.root.quaternion); return Math.atan2(f.x, f.z); })(), state: st.w[i].state, move: activeMove(v.root), lying: v.lying }; }) }; };
window.HEEL_VIEWS = () => views.map((v) => v.holder); // drawn bodies for game/tools/demo_soak.py
window.G = {
  get P1() { return currentRaw()?.w[0]; }, get P2() { return currentRaw()?.w[1]; },
  get state() { return currentRaw(); }, get session() { return window.HEEL.session; },
};

// ---------- loop ----------
const clock = new THREE.Clock();
const feel = createFeel({ scene, camera, getViews: () => views });
const entrance = createEntrance({ scene, camera, screen, matY: MAT_Y, ring: RING, getViews: () => views, play, layer, aisle,
  announcer: (({ obj, animations }) => ({ obj, anim8: createAnimator(obj, animations) }))(bodies.make('ring')) });
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  booth.restore(camera); booth.update(dt);
  const { simDt, viewDt } = feel.begin(dt, current());
  // entrances (exhibition only): start once both bodies exist; the sim waits for the bell until they finish
  if (session?.entrance && views.length === 2) { session.entrance = false; entrance.start(session.match); }
  if (session?.mode === 'exhibition' && !paused && !entrance.active && !layer.holding) { // holding: the pre-match promo
    (session.royal ? stepRoyal : step)(session.match, simDt, session.ctl);
    handleEvents(session.match.events); session.match.events = [];
    if (session.royal) royal.tick(session.match); // BAND plans + proposals for the battle royal
    else layer.tick(session.match); // posts to the agents server every ~4 s; never awaited here
  }
  const st = current();
  if (st) royal.frame(st);
  if (st) {
    const sdt = paused && session.mode === 'exhibition' ? 0 : viewDt;
    safe(() => updateRef(st, sdt)); syncViews(st.w, sdt);
    if (sdt > 0) updateMoves(sdt); // after every clip layer (ref included), so moves blend over a fresh pose
  }
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
  if (st && entrance.frame(paused ? 0 : dt)) feel.frame(dt, st);
  else if (!st) {
    feel.frame(dt, null);
    // attract mode: slow orbit around the empty ring
    const a = t * 0.12;
    camera.position.lerp(new THREE.Vector3(Math.sin(a) * 13, 6.5, Math.cos(a) * 13), 0.05);
    camera.lookAt(0, MAT_Y + 0.6, 0);
  } else {
    const live = views.filter((v, i) => st.w[i] && st.w[i].state !== 'waiting' && !st.w[i].out).map((v) => v.holder.position);
    const pts = live.length >= 2 ? live : views.slice(0, 2).map((v) => v.holder.position);
    const mid = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const spread = Math.max(...pts.map((p) => p.distanceTo(mid))) * 2;
    let want;
    if (st.introT > 0) {
      // intro sweep: swing from a high side angle down to the broadcast position over INTRO_SECS
      const k = 1 - st.introT / INTRO_SECS, a = (1 - k) * 2.2, r = 9 + 5 * (1 - k);
      want = new THREE.Vector3(Math.sin(a) * r, 4 + 4 * (1 - k), Math.cos(a) * r);
    } else if (st.mode === 'royal') {
      // battle royal: keep the whole ring centred and drift only a little toward the action
      want = new THREE.Vector3(mid.x * 0.25 + Math.sin(t * 0.1) * 0.8, 7.4, 11.2 + mid.z * 0.25);
      mid.multiplyScalar(0.25);
    } else if (st.pair) {
      // committed move: the camera holds the frame it had when the lock-up started (no orbit drift, no chasing a
      // flying body); feel/ still adds the impact shake and punch-in on top
      pairCam ||= { want: new THREE.Vector3(mid.x * 0.5, 5.2 + spread * 0.35, mid.z + 8.5 + spread * 0.6), mid: mid.clone() };
      want = pairCam.want; mid.copy(pairCam.mid);
    } else want = new THREE.Vector3(mid.x * 0.5 + Math.sin(t * 0.12) * 2, 5.2 + spread * 0.35, mid.z + 8.5 + spread * 0.6);
    if (!st.pair && pairCam) pairCam = null;
    camera.position.lerp(want, st.introT > 0 ? 0.06 : 0.04);
    feel.addTrauma(shake * 0.5); shake = 0;
    camera.lookAt(mid.x, MAT_Y + 0.9, mid.z);
    feel.frame(dt, st, mid);
    booth.direct(camera); // a 1.2 s cutaway to the desk after a near-fall or a finisher
    st.w.forEach((w, i) => { setWidth('h' + i, w.hp); setWidth('s' + i, w.st); setWidth('m' + i, w.mo); });
  }
  bloom.strength = THREE.MathUtils.lerp(bloom.strength, 0.35, 0.05);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0 && $('banner')) $('banner').style.opacity = 0; }
  views.forEach(trackChest); trackChest(ref);
  composer.render();
  requestAnimationFrame(frame);
}
frame();
