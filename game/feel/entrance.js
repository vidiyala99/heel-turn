// Pre-bell entrances: one ~7 s walk per wrestler, then the bell. Enter skips to the bell.
// Each entrance: the big screen shows the wrestler's entrance card, a visible spotlight cone and two stage
// lights in their palette, the body walks from its corner to its start mark and hits a taunt, the crowd
// swells, the ring announcer reads the intro, and the music stings. Camera: a low tracking shot on the walker.
//   const ent = createEntrance({ scene, camera, screen, matY, ring, getViews, play, layer });
//   ent.start(match) -> the sim waits (main.js skips step while ent.active); ent.frame(dt) -> true while it owns the camera
import * as THREE from 'three';
import { CHARACTERS } from '../shared/characters.js';
import { playSolo, stopMoves } from '../moves/index.js';
import { introLines } from '../../voice/announcer.js';

const WALK_S = 3.6, TAUNT_S = 3.4, SPEED = 1.15;
const TAUNT = { vex: 'tauntArms', kane: 'chestPound', silas: 'tauntArms', mae: 'chestPound' };

const loadCard = (id) => Object.assign(new THREE.TextureLoader().load(`/art/entrance-${id}.jpg`), { colorSpace: THREE.SRGBColorSpace });
export function createEntrance({ scene, camera, screen, matY, ring, getViews, play, layer, cardLoader = loadCard }) {
  const cards = {};
  const card = (id) => cards[id] ||= cardLoader(id);

  // rig: a hard white key spot with a visible additive cone, and two colored wash lights
  const key = new THREE.SpotLight(0xffffff, 0, 16, 0.32, 0.4, 1.2);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 40, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const washA = new THREE.PointLight(0xffffff, 0, 14), washB = new THREE.PointLight(0xffffff, 0, 14);
  scene.add(key, key.target, cone, washA, washB);

  let seq = null, voice = Promise.resolve(); // { match, order: [slot...], k (index into order), t, phase, from, to, screenWas }
  const camPos = new THREE.Vector3(), camAt = new THREE.Vector3();

  function begin(k) {
    const { match } = seq, i = seq.order[k], w = match.w[i], c = CHARACTERS[w.id];
    seq.k = k; seq.t = 0; seq.phase = 'walk';
    const side = Math.sign(w.x) || 1;
    seq.from = new THREE.Vector3(side * (ring - 0.45), matY, ring - 0.45);   // near corner on their side
    seq.to = new THREE.Vector3(w.x, matY, w.z);
    seq.pos[i].copy(seq.from); seq.yaw[i] = 0;
    screen.material.map = card(w.id); screen.material.needsUpdate = true;
    const pal = c?.palette || { primary: 0xffffff, accent: 0xffffff };
    cone.material.color.set(pal.primary); washA.color.set(pal.primary); washB.color.set(pal.accent);
    layer?.swell?.(0.8, 4); layer?.sting?.(w.id);
    // introduced in walk-out order, one line after another; a skip (seq gone) drops what is still queued
    const lines = introLines(match.w[seq.order[0]].id, match.w[seq.order[1]].id);
    (k === 0 ? [lines[0], lines[1]] : [lines[2]]).forEach((l) => { voice = voice.then(() => seq && layer?.announce?.(l)).catch(() => {}); });
  }

  function start(match) {
    const views = getViews();
    if (views.length < 2) return;
    // the opponent comes out first, the player last; whoever has not come out yet waits by their corner, out of the light
    // pos/yaw: where entrance puts each body (syncViews resets bodies to the sim every frame, so this writes after it)
    const pos = match.w.map((w) => new THREE.Vector3(Math.sign(w.x) * (ring - 0.45), matY, ring - 0.45));
    seq = { match, order: [1, 0], screenWas: screen.material.map, pos, yaw: match.w.map(() => 0) };
    begin(0);
  }

  function finish() {
    if (!seq) return;
    getViews().forEach((v, i) => { stopMoves(v.root); const w = seq.match.w[i]; v.root.position.set(w.x, w.y, w.z); v.root.rotation.set(0, w.facing, 0); play(v, 'idle'); });
    screen.material.map = seq.screenWas; screen.material.needsUpdate = true;
    key.intensity = 0; cone.material.opacity = 0; washA.intensity = washB.intensity = 0;
    seq.match.introT = Math.min(seq.match.introT, 0.01); // straight to the bell
    seq = null;
  }

  globalThis.addEventListener?.('keydown', (e) => { if (seq && e.code === 'Enter') { e.preventDefault(); finish(); } });

  function frame(dt) {
    if (!seq) return false;
    const views = getViews(), i = seq.order[seq.k], v = views[i];
    if (!v) { finish(); return false; }
    seq.t += dt;
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
    } else if (seq.t > TAUNT_S) {
      stopMoves(root);
      if (seq.k + 1 < seq.order.length) begin(seq.k + 1); else { finish(); return false; }
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
