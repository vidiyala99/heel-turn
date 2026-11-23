// The broadcast booth: the announce desk at ringside (far side, facing the hard camera), Rex and Dot seated
// behind it in headsets, and the camera cutaway to the desk on big moments. Voice events ('heel:voice' from
// agent-layer.js) tell it who is talking: the speaker leans in and gestures, the other turns toward them.
//   const booth = createBooth({ scene, bodies, matY, ring });
//   booth.update(dt)             every frame (clips + lean)
//   booth.onEvent(e)             sim events: 'nearfall' and a finisher impact queue a cutaway
//   booth.restore(camera)        top of the frame: undo last frame's cutaway so the match camera lerps from its own pose
//   booth.direct(camera)         after the match camera is set: true while the cutaway holds the camera
import * as THREE from 'three';
import { createAnimator } from '../shared/anims.js';

const DESK = { w: 3.0, h: 0.8, d: 0.72 };
const SEAT_HEAD_Y = 1.36;       // seated head height (the bodies sink behind the drape; the desk hides the legs)
const CUT_S = 1.2;              // cutaway length (cap 1.5 s: never hold the camera through player input longer)
const COOLDOWN_S = 14;          // at most one cutaway per this many seconds
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function drapeTexture(logo) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 280;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 280); grd.addColorStop(0, '#10162c'); grd.addColorStop(1, '#070a16');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 280);
  for (let x = 0; x < 1024; x += 6) { g.fillStyle = `rgba(255,255,255,${0.012 + (x % 24 === 0 ? 0.018 : 0)})`; g.fillRect(x, 0, 2, 280); } // pleats
  g.fillStyle = '#c1121f'; g.fillRect(0, 0, 1024, 16); g.fillStyle = '#f5c542'; g.fillRect(0, 16, 1024, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const draw = () => { const s = 250; g.drawImage(logo, 512 - s / 2, 26, s, s); t.needsUpdate = true; };
  if (logo.complete && logo.naturalWidth) draw(); else logo.onload = draw;
  return t;
}

function screenTexture(kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#06101f'; g.fillRect(0, 0, 256, 160);
  if (kind === 'stats') {
    g.fillStyle = '#f5c542'; g.font = '700 22px Anton, Impact, sans-serif'; g.fillText('HEEL TURN', 14, 34);
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#2b8cff' : '#e8333b'; g.fillRect(14, 52 + i * 20, 60 + ((i * 53) % 150), 10); }
  } else {
    const grd = g.createRadialGradient(128, 80, 10, 128, 80, 140); grd.addColorStop(0, '#30405e'); grd.addColorStop(1, '#06101f');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 160); g.strokeStyle = '#b9bec6'; g.lineWidth = 6; g.strokeRect(70, 40, 116, 80);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildDesk() {
  const desk = new THREE.Group(); desk.name = 'AnnounceDesk';
  const top = new THREE.Mesh(new THREE.BoxGeometry(DESK.w + 0.1, 0.05, DESK.d + 0.08), new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.35, metalness: 0.3 }));
  top.position.y = DESK.h; top.castShadow = top.receiveShadow = true; desk.add(top);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x0b1024, roughness: 0.9 });
  const logo = new Image(); logo.src = '/art/mat-logo.png';
  const front = new THREE.MeshStandardMaterial({ map: drapeTexture(logo), roughness: 0.85, emissive: 0xffffff, emissiveIntensity: 0.06 });
  front.emissiveMap = front.map;
  // drape: the box's +z face (toward the ring and the hard camera) carries the logo
  const drape = new THREE.Mesh(new THREE.BoxGeometry(DESK.w, DESK.h - 0.02, DESK.d), [cloth, cloth, cloth, cloth, front, cloth]);
  drape.position.y = (DESK.h - 0.02) / 2; drape.receiveShadow = true; desk.add(drape);
  // monitors face the talent (backs to the ring), plus one stats screen tilted up on the near edge
  const shell = new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.5, metalness: 0.4 });
  // at the desk ends, angled in toward the talent, so the hard camera and the cutaway see faces, not screens
  for (const [x, kind] of [[-1.28, 'feed'], [1.28, 'stats']]) {
    const m = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.04), shell); m.add(box);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.28), new THREE.MeshBasicMaterial({ map: screenTexture(kind) }));
    scr.position.z = -0.021; scr.rotation.y = Math.PI; m.add(scr);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), shell); stand.position.y = -0.2; m.add(stand);
    m.position.set(x, DESK.h + 0.24, 0.12); m.rotation.set(-0.1, Math.sign(x) * 0.55, 0); m.scale.setScalar(0.8); desk.add(m);
  }
  // headset glow: the "on air" lamp on the desk
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xe8333b }));
  lamp.position.set(0, DESK.h + 0.05, 0.3); desk.add(lamp);
  // chairs behind
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.6 });
  for (const x of [-0.7, 0.7]) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.08), chairMat);
    back.position.set(x, 0.95, -0.92); desk.add(back);
  }
  return desk;
}

function headset() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.4, metalness: 0.3 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 8, 24, Math.PI), black); g.add(band);
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), black);
    cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.105, 0, 0); g.add(cup);
  }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.15, 6), black);
  boom.rotation.x = Math.PI / 2.4; boom.position.set(0.1, -0.06, 0.07); g.add(boom);
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), black); mic.position.set(0.085, -0.1, 0.14); g.add(mic);
  return g;
}

export function createBooth({ scene, bodies, matY, ring }) {
  const root = new THREE.Group(); root.name = 'Booth';
  const z = -(ring + 1.75);
  root.position.set(0, 0, z);
  root.add(buildDesk());
  scene.add(root);
  // a soft key on the desk so the talent reads in the wide shot (the ring spots point at the mat)
  const key = new THREE.SpotLight(0xfff1d6, 18, 9, 0.6, 0.6, 1.3);
  key.position.set(0, 3.6, z + 2.4); key.target.position.set(0, 1.0, z - 0.4); scene.add(key, key.target);

  const crew = ['rex', 'dot'].map((id, i) => {
    const { obj, animations } = bodies.make(id);
    const anim8 = createAnimator(obj, animations);
    anim8.play('idle');
    const x = i === 0 ? -0.7 : 0.7;
    obj.position.set(x, 0, z - 0.62); scene.add(obj);
    const head = obj.getObjectByName('head');
    const hs = headset(); scene.add(hs);
    return { id, obj, anim8, head, hs, x, sink: null, talk: 0, want: 0, yaw: 0, gestureAt: -1 };
  });
  let speaking = null;
  const clock = { t: 0 };

  addEventListener('heel:voice', (e) => {
    const { phase, speaker } = e.detail || {};
    const c = crew.find((m) => m.id === speaker);
    if (phase === 'start') {
      speaking = c ? speaker : speaking;
      if (c && clock.t - c.gestureAt > 2.5) { c.anim8.play('taunt', 0.8); c.gestureAt = clock.t; }
    } else if (phase === 'end' && speaking === speaker) speaking = null;
  });

  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function update(dt) {
    clock.t += dt;
    for (const c of crew) {
      c.anim8.update(dt);
      if (c.sink == null && c.head) { c.obj.updateMatrixWorld(true); c.head.getWorldPosition(_p); c.sink = _p.y - SEAT_HEAD_Y; }
      const other = crew.find((m) => m !== c);
      const on = speaking === c.id, listen = speaking === other.id;
      c.talk += ((on ? 1 : 0) - c.talk) * Math.min(1, dt * 6);
      // the speaker leans in over the desk with a little emphasis bob; the listener turns toward them
      const bob = on ? Math.sin(clock.t * 7.5) * 0.02 : 0;
      const yawWant = listen ? Math.sign(other.x - c.x) * 0.45 : 0;
      c.yaw += (yawWant - c.yaw) * Math.min(1, dt * 4);
      c.obj.position.y = -(c.sink || 0) + bob * 0.5;
      c.obj.rotation.set(0.14 * c.talk + bob, c.yaw, 0, 'YXZ');
      if (c.head) {
        c.obj.updateMatrixWorld(true);
        c.head.getWorldPosition(_p); c.head.getWorldQuaternion(_q);
        _e.setFromQuaternion(_q, 'YXZ');
        c.hs.position.copy(_p).add(new THREE.Vector3(0, 0.07, 0));
        c.hs.rotation.set(c.obj.rotation.x, c.yaw, 0, 'YXZ');
      }
    }
  }

  // ---------- cutaway: a hard cut to a tight two-shot of the desk, then straight back ----------
  let cut = null, pending = null, lastCut = -Infinity, saved = null;
  const shot = new THREE.Vector3(), look = new THREE.Vector3();
  function queue(delay, who) {
    if (clock.t - lastCut < COOLDOWN_S || pending || cut) return;
    pending = { at: clock.t + delay, who };
  }
  function onEvent(e) {
    if (e.k === 'nearfall') queue(0.9, 'dot');                 // after feel's near-fall cut releases
    else if (e.k === 'impact' && e.kind === 'finisher') queue(1.5, 'rex'); // after the finisher landing shot
    else if (e.k === 'end' || e.k === 'bell') { pending = null; cut = null; }
  }
  function restore(camera) {
    if (saved) { camera.position.copy(saved.p); camera.quaternion.copy(saved.q); saved = null; }
  }
  function direct(camera) {
    if (pending && clock.t >= pending.at) {
      cut = { until: clock.t + CUT_S, t0: clock.t, who: pending.who }; pending = null; lastCut = clock.t;
      const c = crew.find((m) => m.id === cut.who); if (c) { c.anim8.play('taunt', 1); c.gestureAt = clock.t; }
    }
    if (!cut) return false;
    if (clock.t > cut.until) { cut = null; return false; }
    saved = { p: camera.position.clone(), q: camera.quaternion.clone() };
    // from just over the apron toward the desk, slightly low, a slow push-in unless reduced motion
    const k = reduced() ? 0 : (clock.t - cut.t0) / CUT_S;
    // from the floor between the apron and the desk, off to one side: a two-shot, under the rope line
    shot.set(1.75 - k * 0.15, 1.55, z + 1.3 - k * 0.12);
    look.set(-0.15, 1.2, z - 0.55);
    camera.position.copy(shot); camera.lookAt(look);
    return true;
  }

  const api = { update, onEvent, restore, direct, root, crew, get cutting() { return !!cut; }, cutNow(who = "dot") { pending = { at: clock.t, who }; } };
  globalThis.HEEL_BOOTH = api; // tests and the debug console
  return api;
}
