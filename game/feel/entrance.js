// Pre-bell entrances, paced by the ring announcer's voice. He stands center-ring in a tux and opens the show;
// each wrestler walks out as their intro line starts, and the next segment waits for that line to end (capped);
// then he leaves the ring and the bell rings. Enter skips to the bell and cuts his audio. Muted runs pace by the
// reading-speed estimate agent-layer.js holds announce() to. window.HEEL_ENTRANCE_LOG keeps the timestamps.
// Each entrance: the big screen shows the wrestler's entrance card, a visible spotlight cone and two stage
// lights in their palette, the body walks from its corner to its start mark and hits a taunt, the crowd
// swells, and the music stings. Camera: a low tracking shot on the walker.
//   const ent = createEntrance({ scene, camera, screen, matY, ring, getViews, play, layer, announcer });
//   announcer: { obj, anim8 } (bodies.make('ring') + createAnimator), optional
//   ent.start(match) -> the sim waits (main.js skips step while ent.active); ent.frame(dt) -> true while it owns the camera
import * as THREE from 'three';
import { CHARACTERS } from '../shared/characters.js';
import { playSolo, stopMoves } from '../moves/index.js';
import { introLines } from '../../voice/announcer.js';

const TAUNT_MIN = 1.6, SPEED = 1.15, WALK_S = 3.6;
const OPEN_MIN = 1.5, OPEN_CAP = 9, SEG_CAP = 12, EXIT_S = 1.8; // seconds
const TAUNT = { vex: 'tauntArms', kane: 'chestPound', silas: 'tauntArms', mae: 'chestPound' };

const loadCard = (id) => Object.assign(new THREE.TextureLoader().load(`/art/entrance-${id}.jpg`), { colorSpace: THREE.SRGBColorSpace });
export function createEntrance({ scene, camera, screen, matY, ring, getViews, play, layer, announcer = null, cardLoader = loadCard }) {
  const cards = {};
  const card = (id) => cards[id] ||= cardLoader(id);
  const log = (ev, extra) => { (globalThis.HEEL_ENTRANCE_LOG ||= []).push({ ev, t: Math.round(performance.now()), ...extra }); };
  globalThis.addEventListener?.('heel:voice', (e) => { if (seq && e.detail?.speaker === 'ring') log('line_' + e.detail.phase, { text: e.detail.text.slice(0, 32) }); });

  // rig: a hard white key spot with a visible additive cone, and two colored wash lights
  const key = new THREE.SpotLight(0xffffff, 0, 16, 0.32, 0.4, 1.2);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 40, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const washA = new THREE.PointLight(0xffffff, 0, 14), washB = new THREE.PointLight(0xffffff, 0, 14);
  scene.add(key, key.target, cone, washA, washB);

  // the ring announcer: tux, a hand mic riding his right hand; only in the ring during the intro
  const mc = announcer?.obj || null, hand = mc?.getObjectByName('hand_r');
  let mic = null;
  if (mc) {
    mc.visible = false; scene.add(mc);
    mic = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.17, 10), new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0.5, roughness: 0.4 }));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.35 }));
    ball.position.y = 0.1; mic.add(grip, ball); mic.visible = false; scene.add(mic);
  }
  const _hp = new THREE.Vector3();

  let seq = null; // { match, order, k, t, segT, phase: open|walk|taunt|exit|done, from, to, screenWas, lines, lineDone, pos, yaw }
  const camPos = new THREE.Vector3(), camAt = new THREE.Vector3();

  // a line is announced; when it ends (or fails) the segment that owns it is told, unless a skip ended the sequence
  function say(line, tag) {
    const s = seq; s.lineDone = false;
    Promise.resolve(layer?.announce?.(line)).catch(() => {}).finally(() => { if (seq === s) { s.lineDone = true; log(tag + '_line_done'); } });
  }

  function begin(k) {
    const { match } = seq, i = seq.order[k], w = match.w[i], c = CHARACTERS[w.id];
    seq.k = k; seq.t = 0; seq.segT = 0; seq.phase = 'walk';
    const side = Math.sign(w.x) || 1;
    seq.from = new THREE.Vector3(side * (ring - 0.45), matY, ring - 0.45);   // near corner on their side
    seq.to = new THREE.Vector3(w.x, matY, w.z);
    seq.pos[i].copy(seq.from); seq.yaw[i] = 0;
    screen.material.map = card(w.id); screen.material.needsUpdate = true;
    const pal = c?.palette || { primary: 0xffffff, accent: 0xffffff };
    cone.material.color.set(pal.primary); washA.color.set(pal.primary); washB.color.set(pal.accent);
    layer?.swell?.(0.8, 4); layer?.sting?.(w.id);
    log('seg' + k + '_start', { id: w.id });
    say(seq.lines[k + 1], 'seg' + k); // the walk starts with the intro line
  }

  function start(match) {
    const views = getViews();
    if (views.length < 2) return;
    // the opponent comes out first, the player last; whoever has not come out yet waits by their corner, out of the light
    // pos/yaw: where entrance puts each body (syncViews resets bodies to the sim every frame, so this writes after it)
    const pos = match.w.map((w) => new THREE.Vector3(Math.sign(w.x) * (ring - 0.45), matY, ring - 0.45));
    const order = [1, 0];
    seq = { match, order, k: -1, t: 0, segT: 0, phase: 'open', screenWas: screen.material.map, pos, yaw: match.w.map(() => 0),
      lines: introLines(match.w[order[0]].id, match.w[order[1]].id), lineDone: false };
    globalThis.HEEL_ENTRANCE_LOG = []; log('open_start');
    if (mc) { mc.visible = mic.visible = true; mc.position.set(0, matY, -0.5); mc.rotation.set(0, 0, 0); announcer.anim8.play('idle'); }
    say(seq.lines[0], 'open');
  }

  function finish() {
    if (!seq) return;
    if (seq.phase !== 'done') layer?.hush?.(); // a skip cuts the announcer mid-line
    if (mc) mc.visible = mic.visible = false;
    getViews().forEach((v, i) => { stopMoves(v.root); const w = seq.match.w[i]; v.root.position.set(w.x, w.y, w.z); v.root.rotation.set(0, w.facing, 0); play(v, 'idle'); });
    screen.material.map = seq.screenWas; screen.material.needsUpdate = true;
    key.intensity = 0; cone.material.opacity = 0; washA.intensity = washB.intensity = 0;
    seq.match.introT = Math.min(seq.match.introT, 0.01); // straight to the bell
    log('bell', { skipped: seq.phase !== 'done' });
    seq = null;
  }

  globalThis.addEventListener?.('keydown', (e) => { if (seq && e.code === 'Enter') { e.preventDefault(); finish(); } });

  function updateMc(dt) {
    if (!mc?.visible) return;
    announcer.anim8.update(dt);
    if (hand) { mc.updateMatrixWorld(true); hand.getWorldPosition(_hp); mic.position.copy(_hp); mic.rotation.set(0, mc.rotation.y, 0.25); }
  }
  const lightsOff = () => { key.intensity = 0; cone.material.opacity = 0; washA.intensity = washB.intensity = 0; };

  function frame(dt) {
    if (!seq) return false;
    const views = getViews();
    seq.t += dt; seq.segT += dt;
    updateMc(dt);
    if (seq.phase === 'open') {
      // both wrestlers wait by their corners; a medium shot on the announcer, center ring
      views.forEach((u, j) => { u.root.position.copy(seq.pos[j]); u.root.rotation.set(0, 0, 0); });
      if ((seq.lineDone && seq.t > OPEN_MIN) || seq.t > OPEN_CAP) { log('open_end', { capped: !seq.lineDone }); begin(0); return true; }
      const p = mc ? mc.position : camAt.set(0, matY, 0);
      camPos.set(p.x + 0.6, matY + 1.3, p.z + 3.2); camAt.set(p.x, matY + 1.35, p.z);
      camera.position.lerp(camPos, Math.min(1, dt * 3)); camera.lookAt(camAt);
      return true;
    }
    if (seq.phase === 'exit') {
      // everyone on their marks; the announcer walks to the near corner and out, then the bell
      views.forEach((u, j) => { const w = seq.match.w[j]; u.root.position.set(w.x, w.y, w.z); u.root.rotation.set(0, w.facing, 0); });
      if (mc) {
        const to = camAt.set(ring + 0.4, matY, ring - 0.2), d = to.sub(mc.position); d.y = 0;
        const len = d.length();
        if (len > 0.05) { mc.rotation.set(0, Math.atan2(d.x, d.z), 0); mc.position.addScaledVector(d.normalize(), Math.min(len, 1.7 * dt)); announcer.anim8.play('walk'); }
      }
      if (seq.t > EXIT_S) { seq.phase = 'done'; log('exit_end'); finish(); return false; }
      camPos.set(0, matY + 3.4, ring + 5.6); camAt.set(0, matY + 0.9, 0);
      camera.position.lerp(camPos, Math.min(1, dt * 2)); camera.lookAt(camAt);
      return true;
    }
    const i = seq.order[seq.k], v = views[i];
    if (!v) { finish(); return false; }
    const root = v.root, pos = seq.pos[i];
    views.forEach((u, j) => { if (j !== i || seq.phase === 'walk') { u.root.position.copy(seq.pos[j]); u.root.rotation.set(0, seq.yaw[j], 0); } });
    if (seq.phase === 'walk') {
      const d = seq.to.clone().sub(pos); d.y = 0;
      const len = d.length();
      if (len > 0.05 && seq.t < WALK_S + 1) {
        pos.addScaledVector(d.normalize(), Math.min(len, SPEED * dt)); seq.yaw[i] = Math.atan2(d.x, d.z);
        root.position.copy(pos); root.rotation.set(0, seq.yaw[i], 0); play(v, 'walk', 0.9);
      } else {
        seq.phase = 'taunt'; seq.t = 0; play(v, 'idle');
        seq.yaw[i] = Math.atan2(-pos.x, ring - pos.z); root.rotation.set(0, seq.yaw[i], 0); // to the hard camera
        try { playSolo(TAUNT[v.id] || 'tauntArms', root, {}); } catch { /* pose missing on this rig */ }
        layer?.swell?.(1, 2.5);
      }
    } else if ((seq.t > TAUNT_MIN && seq.lineDone) || seq.segT > SEG_CAP) {
      stopMoves(root); log('seg' + seq.k + '_end', { capped: !seq.lineDone });
      if (seq.k + 1 < seq.order.length) begin(seq.k + 1);
      else { seq.phase = 'exit'; seq.t = 0; lightsOff(); log('exit_start'); return true; }
    }
    // lights ride the walker; fade in over 0.4 s
    const p = pos, up = Math.min(1, (seq.phase === 'walk' ? seq.t : 1) / 0.4);
    key.position.set(p.x, matY + 9, p.z + 0.3); key.target.position.copy(p); key.intensity = 140 * up;
    cone.position.set(p.x, matY + 4.5, p.z); cone.material.opacity = 0.09 * up;
    washA.position.set(p.x - 2.2, matY + 2.4, p.z + 1.6); washB.position.set(p.x + 2.2, matY + 2.4, p.z - 1.6);
    washA.intensity = washB.intensity = 30 * up;
    // low-angle tracking shot: just above the mat, ahead of the walker, looking up at the chest
    const yaw = seq.yaw[i];
    camPos.set(p.x + Math.sin(yaw) * 2.6 + Math.cos(yaw) * 0.9, matY + 0.35, p.z + Math.cos(yaw) * 2.6 - Math.sin(yaw) * 0.9);
    camAt.set(p.x, matY + 1.35, p.z);
    camera.position.lerp(camPos, Math.min(1, dt * 4)); camera.lookAt(camAt);
    return true;
  }

  return { start, frame, finish, get active() { return !!seq; } };
}
