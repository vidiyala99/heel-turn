// HEEL TURN feel layer (client only): the time clock (hitstop freeze, slow-mo), the camera director
// (trauma shake, punch-in, FOV kick, low-angle cuts for near-falls and finishers), impact FX, sound,
// the broadcast overlay, and run input. main.js calls four hooks per frame:
//   const { simDt, viewDt } = feel.begin(dt, st)   top of the frame
//   feel.onEvent(e, st)                             each sim event
//   feel.frame(dt, st, mid)                         after main's camera.lookAt
//   feel.running(keysDown)                          when building the move control
// window.FEEL.metrics records measured timings (input->motion, hitstops, slow-mo spans) for tests.
import * as THREE from 'three';
import { T } from '../shared/tuning.js';
import { createFx } from './fx.js';
import { createOverlay } from './overlay.js';
import { createLife } from './life.js';
import { getRig } from '../moves/index.js';
import * as sfx from './sfx.js';

const V = T.view, MAT_Y = 1.1, BASE_FOV = 42;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const shakeOn = () => !(window.HEEL_SETTINGS?.shake === false || window.HEEL_SETTINGS?.shake === 0);
const short = (w) => w.name.split(' ').slice(-1)[0].replace(/"/g, '').toUpperCase();

export function createFeel({ scene, camera, getViews }) {
  const fx = createFx(scene), ui = createOverlay(), life = createLife();
  const lastImpact = [-9, -9], prevState = ['', ''];
  const base = new THREE.Vector3(); let hasBase = false;
  let trauma = 0, punch = 0, punchAt = new THREE.Vector3(), fov = 0, t = 0;
  let cut = null;            // { kind: 'nearfall'|'finisher', until (real s), slot }
  let scale = 1, slowTarget = 1, slowUntil = 0, finisherLanding = false;
  const metrics = { inputToMotionMs: [], hitstopMs: [], slowmoMs: [], events: {} };
  let pendingInput = null, motionRef = null, freezeStart = 0, slowStart = 0;

  // ---------- input: run (Shift, or a double-tapped direction) + latency probe ----------
  const DIRS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'], lastUp = {};
  let latch = false;
  addEventListener('keydown', (e) => {
    sfx.unlock();
    if (e.repeat) return;
    if (DIRS.includes(e.code)) {
      if (performance.now() - (lastUp[e.code] || 0) < 260) latch = true;
      const v = getViews()[0]; if (v) { pendingInput = performance.now(); motionRef = v.holder.position.clone(); }
    }
  }, true);
  addEventListener('keyup', (e) => { if (DIRS.includes(e.code)) lastUp[e.code] = performance.now(); }, true);

  function addTrauma(v) { if (shakeOn()) trauma = Math.min(1, trauma + v); }
  function kick(kind, at) {
    if (reduced()) return;
    punch = Math.max(punch, V.punchIn[kind] ?? 0.1); punchAt.copy(at);
    fov = Math.max(fov, V.fovKick[kind] ?? 1);
  }
  function slowmo(s, secs) { slowTarget = s; slowUntil = t + secs; }

  function onEvent(e, st) {
    metrics.events[e.k] = (metrics.events[e.k] || 0) + 1;
    const w = st?.w;
    if (e.k === 'impact') {
      lastImpact[e.slot] = t;
      const at = new THREE.Vector3(e.x, MAT_Y + 0.9, e.z), big = e.kind !== 'strike';
      const att = w?.[1 - e.slot], dx = att ? e.x - att.x : 0, dz = att ? e.z - att.z : 0, len = Math.hypot(dx, dz) || 1;
      addTrauma(V.shake[big ? (e.kind === 'finisher' ? 'finisher' : 'slam') : 'strike'] * (0.6 + e.dmg / 25));
      kick(e.kind === 'finisher' ? 'finisher' : big ? 'slam' : 'strike', at);
      if (big) { fx.dust(e.x, e.z, e.kind === 'finisher' ? 1 : 0.65); fx.sweat(e.x, MAT_Y - 0.9, e.z, 0, 0, 0.5); sfx.thud(e.kind === 'finisher' ? 1 : 0.7); }
      else { fx.sweat(e.x, MAT_Y, e.z, dx / len, dz / len, 0.4); sfx.slap(0.3); }
      if (e.kind === 'finisher') {
        ui.flash(V.flash.finisher); sfx.pop(1); finisherLanding = true;
        slowmo(V.slowmo.finisher, 0.45);
        if (cut?.kind === 'finisher') cut.until = t + 1.3;
        ui.announce(`<b>${w ? short(w[1 - e.slot]) : ''}</b> plants him. The building is shaking.`, 2.6);
      } else if (e.kind === 'clothesline') { sfx.pop(0.5); ui.announce('Off the ropes, <b>right into the clothesline!</b>'); }
    } else if (e.k === 'finisher') {
      cut = { kind: 'finisher', until: t + 3.2, slot: -1 }; ui.cinematic(true); slowmo(V.slowmo.finisher, V.slowmo.finisherSecs);
      sfx.pop(0.6); finisherLanding = false;
    } else if (e.k === 'pincount') { sfx.slap(0.6); if (e.n === 3) { sfx.pop(1); ui.announce('<b>ONE, TWO, THREE.</b> It is over.', 3); } }
    else if (e.k === 'nearfall') {
      sfx.gasp(); setTimeout(() => sfx.pop(0.7), 260); ui.flash(V.flash.nearFall); addTrauma(0.25);
      ui.announce(`<b>KICKOUT AT ${e.at.toFixed(1)}!</b> How is he still in this?`, 2.6);
      slowUntil = t + 0.25;
    } else if (e.k === 'whip') { sfx.slap(0.2); addTrauma(V.shake.whip); }
    else if (e.k === 'rebound') { sfx.ropes(); }
    else if (e.k === 'fired') { sfx.pop(0.8); addTrauma(0.3); ui.announce(`<b>${w ? short(w[e.slot]) : ''} IS FIRED UP</b> and the crowd is with him!`, 2.6); }
    else if (e.k === 'nosell') { sfx.slap(0.5); ui.announce('He <b>no-sold it!</b>'); }
    else if (e.k === 'bell') sfx.bell();
    else if (e.k === 'end') { ui.cinematic(false); cut = null; }
  }

  // ---------- clock: freeze on hitstop, slow-mo for near-falls and finishers ----------
  function begin(dt, st) {
    t += dt;
    if (hasBase) camera.position.copy(base);   // drop last frame's shake so main's lerp works from the clean path
    // near-fall: the third slap is coming (pin past 2.5 counts) -> slow the world down
    const pinDrama = st?.pin && st.pin.t / T.sim.pin.count >= 2.5;
    if (pinDrama) { slowTarget = V.slowmo.nearFall; slowUntil = t + 0.05; if (!cut || cut.kind !== 'nearfall') cut = { kind: 'nearfall', until: Infinity, slot: st.pin.victim }; }
    else if (cut?.kind === 'nearfall' && !st?.pin) cut.until = Math.min(cut.until, t + 0.5);
    if (t > slowUntil) slowTarget = 1;
    const target = reduced() ? Math.max(slowTarget, 0.6) : slowTarget;
    scale += (target - scale) * (target < scale ? 0.5 : 0.12); // snap into slow-mo, ease back out
    if (Math.abs(scale - 1) < 0.01) scale = 1;
    // metrics
    if (scale < 0.95 && !slowStart) slowStart = performance.now();
    if (scale >= 0.95 && slowStart) { metrics.slowmoMs.push(Math.round(performance.now() - slowStart)); slowStart = 0; }
    const frozen = (st?.freeze || 0) > 0;
    if (frozen && !freezeStart) freezeStart = performance.now();
    if (!frozen && freezeStart) { metrics.hitstopMs.push(Math.round(performance.now() - freezeStart)); freezeStart = 0; }
    return { simDt: frozen ? dt : dt * scale, viewDt: frozen ? 0 : dt * scale }; // hitstop runs on real time, even in slow-mo
  }

  function frame(dt, st, mid) {
    fx.update(dt * scale);
    ui.visible(!!st); ui.update(dt, st);
    const heat = st ? Math.max(...st.w.map((w) => w.heat || 0)) : 0;
    sfx.crowd(heat);
    const views = getViews();
    if (pendingInput && views[0] && views[0].holder.position.distanceTo(motionRef) > 0.001) {
      metrics.inputToMotionMs.push(Math.round(performance.now() - pendingInput)); pendingInput = null;
    }
    if (!st) { hasBase = false; return; }
    // near miss: a strike or grapple went to recovery without landing on a rival who was close
    st.w.forEach((w, i) => {
      if (w.state === 'rec' && prevState[i] === 'active' && t - lastImpact[1 - i] > 0.3 && w.move !== 'whip') {
        const o = st.w[1 - i]; if (Math.hypot(w.x - o.x, w.z - o.z) < 2.4) { life.nearMiss(1 - i); metrics.events.nearMiss = (metrics.events.nearMiss || 0) + 1; }
      }
      prevState[i] = w.state;
    });
    life.update(st.freeze > 0 ? 0 : dt * scale, st, views);
    // cuts: low angles that frame the drama
    if (cut && t > cut.until) { if (cut.kind === 'finisher') ui.cinematic(false); cut = null; }
    if (cut && views.length === 2) {
      // aim at where the bodies are drawn (the pin's paired move places them, not the sim)
      const [ha, hb] = views.map((v) => v.holder.position);
      const focus = cut.kind === 'nearfall' ? ha.clone().add(hb).multiplyScalar(0.5) : mid;
      const lim = 3.0, fy = Math.max(MAT_Y, focus.y), want = cut.kind === 'nearfall'
        ? new THREE.Vector3(focus.x + 1.4, fy + 0.45, focus.z + 2.6)       // low, where the ref slaps the count
        : new THREE.Vector3(mid.x - 2.2, MAT_Y + 0.55, mid.z + 4.2);      // low and wide, looking up at the lift
      want.x = Math.max(-lim, Math.min(lim, want.x)); want.z = Math.max(-lim, Math.min(lim, want.z));
      camera.position.lerp(want, cut.fresh ? 0.25 : 1); cut.fresh = true;
      camera.lookAt(focus.x, cut.kind === 'nearfall' ? fy + 0.3 : MAT_Y + 1.2, focus.z);
    }
    // punch-in toward the impact, decays fast (follow-through)
    if (punch > 0.002) camera.position.lerp(punchAt, punch * 0.5);
    punch *= Math.pow(0.002, dt);
    base.copy(camera.position); hasBase = true;
    // trauma shake: squared so small hits stay small, layered sines so it reads as camera, not jitter
    if (trauma > 0) {
      const s = trauma * trauma * (reduced() ? 0.25 : 1), k = 0.38;
      camera.position.x += s * k * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 91.7) * 0.4);
      camera.position.y += s * k * (Math.sin(t * 53.9 + 1.3) * 0.6 + Math.sin(t * 79.1) * 0.4);
      camera.rotation.z += s * 0.04 * Math.sin(t * 37.1 + 2);
      trauma = Math.max(0, trauma - dt * 1.7);
    }
    const f = BASE_FOV - fov;
    if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); }
    fov *= Math.pow(0.004, dt); if (fov < 0.02) fov = 0;
  }

  // crowd bob multiplier for main's instanced crowd
  const hype = (st) => 1 + (st ? Math.max(...st.w.map((w) => w.heat || 0)) / 60 + (scale < 1 ? 0.6 : 0) : 0);
  const running = (keysDown) => {
    if (!DIRS.some((k) => keysDown.has(k))) latch = false;
    return latch || keysDown.has('ShiftLeft') || keysDown.has('ShiftRight');
  };
  const api = { begin, onEvent, frame, addTrauma, hype, running, metrics, life, alive: life.alive, get scale() { return scale; },
    // world-space y of head + chest per wrestler (a probe for 'is anyone frozen')
    get pose() { return getViews().map((v) => ['head', 'spine2', 'hips'].map((b) => { const n = getRig(v.root).bones[b]; return n ? n.getWorldPosition(new THREE.Vector3()).toArray() : [0, 0, 0]; })); },
    get bodies() { return getViews().map((v) => v.holder.position.toArray().map((n) => +n.toFixed(2))); } };
  window.FEEL = api;
  return api;
}
