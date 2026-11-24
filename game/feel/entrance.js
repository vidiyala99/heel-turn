// Pre-bell entrances, paced by the ring announcer's voice. He stands center-ring in a tux and opens the show;
// each wrestler walks out as their intro line starts, and the next segment waits for that line to end (capped);
// then he leaves the ring and the bell rings. Enter skips to the bell and cuts his audio. Muted runs pace by the
// reading-speed estimate agent-layer.js holds announce() to. window.HEEL_ENTRANCE_LOG keeps the timestamps.
// Each entrance (arena/aisle.js): the wrestler appears on the entrance stage under a spot in their palette, taunts
// while their intro line plays, walks the aisle, climbs the steps and through the ropes (cut to the wide shot) to
// their mark. Nobody is visible before their own entrance. Camera: low on the stage, low tracking down the aisle.
//   const ent = createEntrance({ scene, camera, screen, matY, ring, getViews, play, layer, announcer });
//   announcer: { obj, anim8 } (bodies.make('ring') + createAnimator), optional
//   ent.start(match) -> the sim waits (main.js skips step while ent.active); ent.frame(dt) -> true while it owns the camera
import * as THREE from 'three';
import { CHARACTERS } from '../shared/characters.js';
import { stopMoves } from '../moves/index.js';
import { introLines } from '../../voice/announcer.js';

const TAUNT_MIN = 1.6, SPEED = 1.3, CLIMB_SPEED = 1.1, WALK_CAP = 16, STAGE_CAP = 7;
const OPEN_MIN = 1.5, OPEN_CAP = 9, SEG_CAP = 12, EXIT_S = 1.8; // seconds

const loadCard = (id) => Object.assign(new THREE.TextureLoader().load(`/art/entrance-${id}.jpg`), { colorSpace: THREE.SRGBColorSpace });
export function createEntrance({ scene, camera, screen, matY, ring, getViews, play, layer, aisle = null, announcer = null, cardLoader = loadCard }) {
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
    seq.k = k; seq.t = 0; seq.segT = 0; seq.phase = 'stage'; seq.leg = 1; seq.cut = false;
    seq.path = aisle.path(new THREE.Vector3(w.x, matY, w.z));
    seq.pos[i].copy(seq.path[0].p); seq.yaw[i] = Math.atan2(-seq.pos[i].x, -seq.pos[i].z); // facing the ring
    const v = getViews()[i]; if (v) { v.root.visible = true; play(v, 'taunt'); } // the clip taunt keeps them facing the ring (playSolo turns the root)
    screen.material.map = card(w.id); screen.material.needsUpdate = true; aisle.setCard(card(w.id));
    const pal = c?.palette || { primary: 0xffffff, accent: 0xffffff };
    cone.material.color.set(pal.primary); washA.color.set(pal.primary); washB.color.set(pal.accent); aisle.setGlow(pal.primary);
    layer?.swell?.(0.8, 4); layer?.sting?.(w.id);
    camera.position.copy(aisle.stageCam); camera.lookAt(seq.pos[i].x, seq.pos[i].y + 1.45, seq.pos[i].z); // cut to the stage
    log('seg' + k + '_start', { id: w.id });
    say(seq.lines[k + 1], 'seg' + k); // the walk starts with the intro line
  }

  function start(match) {
    const views = getViews();
    if (views.length < 2) return;
    // the opponent comes out first, the player last; whoever has not come out yet waits by their corner, out of the light
    // pos/yaw: where entrance puts each body (syncViews resets bodies to the sim every frame, so this writes after it)
    const pos = match.w.map(() => new THREE.Vector3(0, -30, 0)); // backstage (under the floor), hidden until their own entrance
    views.forEach((v) => { v.root.visible = false; });
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
    aisle.setCard(null);
    getViews().forEach((v, i) => { v.root.visible = true; stopMoves(v.root); const w = seq.match.w[i]; v.root.position.set(w.x, w.y, w.z); v.root.rotation.set(0, w.facing, 0); play(v, 'idle'); });
    screen.material.map = seq.screenWas; screen.material.needsUpdate = true;
    key.intensity = 0; cone.material.opacity = 0; washA.intensity = washB.intensity = 0;
    seq.match.introT = Math.min(seq.match.introT, 0.01); // straight to the bell
    log('bell', { skipped: seq.phase !== 'done' });
    seq = null;
    globalThis.dispatchEvent?.(new CustomEvent('heel:entrance-end')); // agent-layer.js runs the pre-match promo, then the bell
  }

  globalThis.addEventListener?.('keydown', (e) => { if (seq && e.code === 'Enter') { e.preventDefault(); finish(); } });

  function updateMc(dt) {
    if (!mc?.visible) return;
    announcer.anim8.update(dt);
    if (hand) { mc.updateMatrixWorld(true); hand.getWorldPosition(_hp); mic.position.copy(_hp); mic.rotation.set(0, mc.rotation.y, 0.25); }
  }
  const cutWide = () => { camera.position.set(0, matY + 3.2, ring + 5.4); camera.lookAt(0, matY + 0.9, 0); };
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
    // whoever already came out stands on their mark; whoever has not stays hidden backstage
    views.forEach((u, j) => { if (j === i) return; const w = seq.match.w[j];
      if (seq.order.indexOf(j) < seq.k) { u.root.position.set(w.x, w.y, w.z); u.root.rotation.set(0, w.facing, 0); } else u.root.position.copy(seq.pos[j]); });
    root.position.copy(pos); root.rotation.set(0, seq.yaw[i], 0);
    if (seq.phase === 'stage') {
      // on the stage under the spot, taunting, while the announcer reads the intro; then down the aisle
      if ((seq.t > TAUNT_MIN && seq.lineDone) || seq.t > STAGE_CAP) {
        stopMoves(root); log('seg' + seq.k + '_walk', { capped: !seq.lineDone }); seq.phase = 'walk'; seq.t = 0; layer?.swell?.(1, 2.5);
      }
    } else if (seq.phase === 'walk') {
      const tgt = seq.path[seq.leg], climb = !!tgt.climb, d = tgt.p.clone().sub(pos);
      const flat = Math.hypot(d.x, d.z), step = (climb ? CLIMB_SPEED : SPEED) * dt;
      if (climb && !seq.cut) { seq.cut = true; log('seg' + seq.k + '_climb'); cutWide(); }
      if (flat > 0.03) seq.yaw[i] = Math.atan2(d.x, d.z);
      if (flat <= step || d.length() < 0.03) {
        pos.copy(tgt.p);
        if (++seq.leg >= seq.path.length) { seq.phase = 'mark'; seq.t = 0; play(v, 'idle'); log('seg' + seq.k + '_in_ring');
          const w = seq.match.w[i]; seq.yaw[i] = w.facing; }
      } else {
        const f = step / flat, y0 = pos.y;
        pos.x += d.x * f; pos.z += d.z * f; pos.y = y0 + (tgt.p.y - y0) * f;
        if (climb && tgt.p.y > y0 + 0.01) pos.y += Math.sin(Math.min(1, f) * Math.PI) * 0.05; // a little step-up lift
        play(v, 'walk', climb ? 0.8 : 0.95);
      }
      if (seq.segT > WALK_CAP) { pos.copy(seq.path.at(-1).p); seq.phase = 'mark'; seq.t = 0; play(v, 'idle'); log('seg' + seq.k + '_in_ring', { capped: true }); }
      root.position.copy(pos); root.rotation.set(0, seq.yaw[i], 0);
    } else if ((seq.t > 0.6 && seq.lineDone) || seq.segT > SEG_CAP + WALK_CAP) {
      log('seg' + seq.k + '_end', { capped: !seq.lineDone });
      if (seq.k + 1 < seq.order.length) begin(seq.k + 1);
      else { seq.phase = 'exit'; seq.t = 0; lightsOff(); log('exit_start'); return true; }
      return true;
    }
    // lights ride the walker; fade in over 0.4 s
    const p = pos, up = Math.min(1, (seq.phase === 'stage' ? seq.t : 1) / 0.4);
    key.position.set(p.x, p.y + 9, p.z + 0.3); key.target.position.copy(p); key.intensity = 140 * up;
    cone.position.set(p.x, p.y + 4.5, p.z); cone.material.opacity = (seq.cut ? 0.09 : 0.035) * up; // the low aisle cameras sit inside the cone
    washA.position.set(p.x - 2.2, p.y + 2.4, p.z + 1.6); washB.position.set(p.x + 2.2, p.y + 2.4, p.z - 1.6);
    washA.intensity = washB.intensity = 30 * up;
    if (seq.cut) {
      // in the ring: the wide hard-camera shot, drifting toward the walker
      camPos.set(p.x * 0.3, matY + 3.2, ring + 5.4); camAt.set(p.x * 0.6, matY + 0.9, p.z * 0.6);
      camera.position.lerp(camPos, Math.min(1, dt * 1.5)); camera.lookAt(camAt);
      return true;
    }
    if (seq.phase === 'stage') {
      // low on the aisle floor, looking up at the stage and the backdrop card
      camera.position.lerp(aisle.stageCam, Math.min(1, dt * 3)); camAt.set(p.x, p.y + 1.45, p.z); camera.lookAt(camAt);
      return true;
    }
    // aisle: a low tracking shot from the aisle side, ahead of the walker, looking up at the chest
    const yaw = seq.yaw[i];
    camPos.set(p.x + Math.sin(yaw) * 2.6 + Math.cos(yaw) * 1.3, 0.55, p.z + Math.cos(yaw) * 2.6 - Math.sin(yaw) * 1.3);
    camAt.set(p.x, p.y + 1.35, p.z);
    camera.position.lerp(camPos, Math.min(1, dt * 3)); camera.lookAt(camAt);
    return true;
  }

  return { start, frame, finish, get active() { return !!seq; } };
}
