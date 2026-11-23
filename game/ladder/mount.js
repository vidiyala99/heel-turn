// Ladder match mode: projects the pure model (state.js) onto a three.js scene.
//
//   const mode = mountLadder(scene, { players, onEvent, onCamera, matY });
//   players: [{ id, name, obj, mixer?, clips?: { idle, walk }, human?, ai?: true | { ally, betrayAtRung } }]
//            obj = character root with its origin at the feet (an Xbot gltf.scene clone)
//   mode.update(dt)              call once per frame (drives mixers and game/moves updateMoves)
//   mode.act(id, action)         'pickup'|'drop'|'setup'|'climb'|'descend'|'hold'|'release'|'shove'|'betray_shove'|'grab'
//   mode.input(id, mx, mz)       ground movement direction for a human (or an LLM-driven) wrestler
//   mode.setPolicy(id, policy)   change a scripted AI's policy at runtime (null = stop the scripted AI)
//   mode.onEvent(cb) -> off()    PLAN-schema events
//   mode.state / setState(m)     the pure model
//   mode.advance(seconds)        fixed-step update (deterministic scenes and tests)
//   mode.dispose()
import * as THREE from 'three';
import { playSolo, updateMoves, stopMoves, getRig } from '../moves/index.js';
import { offsetQuat } from '../moves/rig.js';
import { LADDER, TIMING, createMatch, act as actPure, move as movePure, aiDecide, climbSpot, landingSpot, faceOffset } from './state.js';
import { registerLadderMoves, LADDER_POSES } from './moves-ladder.js';

const UP = new THREE.Vector3(0, 1, 0);
const CASE_H = 4.55;                               // briefcase centre above the mat
const RAIL_LEN = LADDER.HEIGHT / Math.cos(LADDER.TILT);
const yawQuat = (y, out = new THREE.Quaternion()) => out.setFromAxisAngle(UP, y);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawOf = (obj) => { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion); return Math.atan2(f.x, f.z); };
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

function buildLadderMesh() {
  const frame = new THREE.Group();
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc7ced8, metalness: 0.85, roughness: 0.3 });
  const rungMat = new THREE.MeshStandardMaterial({ color: 0x8d96a3, metalness: 0.8, roughness: 0.45 });
  const footMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.9 });
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  const sides = [1, -1].map((s) => {
    const hinge = new THREE.Group();
    frame.add(hinge);
    for (const x of [-0.26, 0.26]) {
      const rail = mesh(new THREE.BoxGeometry(0.055, RAIL_LEN, 0.04), railMat);
      rail.position.set(x, -RAIL_LEN / 2, 0); hinge.add(rail);
      const foot = mesh(new THREE.BoxGeometry(0.08, 0.05, 0.075), footMat);
      foot.position.set(x, -RAIL_LEN + 0.025, 0); hinge.add(foot);
    }
    for (let r = 1; r * LADDER.RUNG < LADDER.HEIGHT - 0.08; r++) {
      const along = (LADDER.HEIGHT - r * LADDER.RUNG) / Math.cos(LADDER.TILT);
      const rung = mesh(new THREE.BoxGeometry(0.52, 0.035, 0.075), rungMat);
      rung.position.set(0, -along, 0); hinge.add(rung);
    }
    return { hinge, s };
  });
  const cap = mesh(new THREE.BoxGeometry(0.64, 0.07, 0.26), footMat);
  frame.add(cap);
  let fold = -1;
  function setFold(theta) {
    if (Math.abs(theta - fold) < 1e-4) return;
    fold = theta;
    for (const { hinge, s } of sides) { hinge.position.y = RAIL_LEN * Math.cos(theta); hinge.rotation.x = -s * theta; }
    cap.position.y = RAIL_LEN * Math.cos(theta) + 0.035;
  }
  setFold(LADDER.TILT);
  return { frame, setFold, get fold() { return fold; } };
}

function buildCase(matY) {
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.45, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 1, roughness: 0.25, emissive: 0x3a2a00, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.11), leather); body.castShadow = true; g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.035, 0.116), gold); band.position.y = 0.1; g.add(band);
  for (const x of [-0.13, 0.13]) { const latch = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.125), gold); latch.position.set(x, 0.1, 0); g.add(latch); }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 20, Math.PI), gold); handle.position.y = 0.17; g.add(handle);
  const cableLen = 9.6 - CASE_H;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cableLen, 6), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6 }));
  cable.position.set(0, matY + CASE_H + 0.24 + cableLen / 2, 0);
  return { group: g, cable };
}

export function mountLadder(scene, { players, onEvent, onCamera, matY = 1.1, matchId = 'ladder-1', ring = 3.2, ladderStart, driveMoves = true } = {}) {
  const firstRig = getRig(players[0].obj);
  registerLadderMoves(1.04 / firstRig.hipHeight);

  let m = createMatch({ matchId, ring, players: players.map((p) => ({ id: p.id, name: p.name, human: p.human, x: p.x, z: p.z, yaw: p.yaw })), ladder: ladderStart });
  let now = 0;
  const tms = () => Math.round(now * 1000);
  const listeners = new Set(onEvent ? [onEvent] : []);
  const timers = [];
  const later = (secs, fn) => timers.push({ at: now + secs, fn });
  const cam = (cue) => onCamera?.(cue);

  const views = {};
  for (const p of players) {
    const actions = {};
    if (p.mixer) for (const [k, clip] of Object.entries(p.clips || {})) if (clip) actions[k] = p.mixer.clipAction(clip);
    const v = { id: p.id, p, obj: p.obj, mixer: p.mixer, actions, cur: null, mode: 'ground', yaw: m.wrestlers[p.id].yaw,
      overlay: null, ow: 0, inMx: 0, inMz: 0, ai: p.ai ? { policy: p.ai === true ? {} : p.ai, next: 0, toward: null } : null };
    views[p.id] = v;
    playClip(v, 'idle');
  }

  function playClip(v, name) {
    const a = v.actions[name];
    if (!a || v.cur === a) return;
    a.reset().fadeIn(0.18).play();
    if (v.cur) v.cur.fadeOut(0.18);
    v.cur = a;
  }
  function toGround(v) { stopMoves(v.obj); v.mode = 'ground'; v.yaw = yawOf(v.obj); }
  const groundOnEnd = (v) => () => { v.mode = 'ground'; v.yaw = yawOf(v.obj); };
  const rootAt = (spot, y) => ({ position: new THREE.Vector3(spot.x, y, spot.z), yaw: spot.yaw });

  // ---------- ladder + briefcase views ----------
  const ladder = buildLadderMesh();
  const pivot = new THREE.Group(), body = new THREE.Group();
  pivot.add(body); body.add(ladder.frame); scene.add(pivot);
  const brief = buildCase(matY);
  scene.add(brief.group, brief.cable);
  let tipStart = -1e9, caseHolder = null, caseAttachAt = 0, firstFrame = true;
  const CARRY_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  const LIE_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const tgt = { pp: new THREE.Vector3(), pq: new THREE.Quaternion(), bp: new THREE.Vector3(), bq: new THREE.Quaternion(), fold: LADDER.TILT };

  function ladderTargets() {
    const L = m.ladder;
    if (L.state === 'standing' || L.state === 'climbed') {
      tgt.pp.set(L.x, matY, L.z); tgt.pq.identity(); tgt.bp.set(0, 0, 0); yawQuat(L.yaw, tgt.bq); tgt.fold = LADDER.TILT;
      return false;
    }
    if (L.state === 'on_mat') {
      tgt.pp.set(L.x, matY + 0.04, L.z); yawQuat(L.yaw, tgt.pq); tgt.bp.set(0, 0, RAIL_LEN / 2); tgt.bq.copy(LIE_Q); tgt.fold = 0;
      return false;
    }
    if (L.state === 'carried') {
      const c = views[L.by];
      const y = c.mode === 'ground' ? c.yaw : yawOf(c.obj);
      tgt.pp.copy(c.obj.position).add(new THREE.Vector3(-Math.cos(y) * 0.32, 0.82, Math.sin(y) * 0.32));
      yawQuat(y, tgt.pq); tgt.bp.set(0, 0, -RAIL_LEN / 2 + 0.3); tgt.bq.copy(CARRY_Q); tgt.fold = 0;
      return false;
    }
    // tipped: rigid rotation about the base edge, starting when the shove lands.
    const { dir } = L.tip, P = L.prev, fo = faceOffset(0);
    const u = Math.min(1, Math.max(0, (now - tipStart) / 0.65));
    const settle = u >= 1 ? Math.max(0, 1 - (now - tipStart - 0.65) / 0.3) : 0;
    const angle = (u * u) * (Math.PI / 2 - LADDER.TILT) - Math.sin(settle * Math.PI) * 0.06;
    tgt.pp.set(P.x + dir.x * fo, matY, P.z + dir.z * fo);
    tgt.pq.setFromAxisAngle(new THREE.Vector3(dir.z, 0, -dir.x), angle);
    tgt.bp.set(-dir.x * fo, 0, -dir.z * fo); yawQuat(P.yaw, tgt.bq); tgt.fold = LADDER.TILT;
    return true;
  }
  function updateLadderView(dt) {
    const direct = ladderTargets() || firstFrame;
    const k = direct ? 1 : damp(m.ladder.state === 'carried' ? 18 : 10, dt);
    pivot.position.lerp(tgt.pp, k); pivot.quaternion.slerp(tgt.pq, k);
    body.position.lerp(tgt.bp, k); body.quaternion.slerp(tgt.bq, k);
    ladder.setFold(ladder.fold + (tgt.fold - ladder.fold) * (direct ? 1 : damp(9, dt)));
  }
  const _hand = new THREE.Vector3();
  function updateCaseView() {
    const hang = new THREE.Vector3(m.case.x, matY + CASE_H, m.case.z);
    brief.cable.visible = !caseHolder;
    if (!caseHolder) {
      brief.group.position.copy(hang);
      brief.group.rotation.set(0, Math.sin(now * 0.6) * 0.25, Math.sin(now * 0.9) * 0.03);
      return;
    }
    const hand = getRig(views[caseHolder].obj).bones.rHand;
    if (!hand) return;
    hand.getWorldPosition(_hand);
    const want = _hand.clone().add(new THREE.Vector3(0, 0.12, 0));
    const u = Math.min(1, (now - caseAttachAt) / 0.12);
    brief.group.position.lerpVectors(hang, want, u);
    brief.group.rotation.set(0, yawOf(views[caseHolder].obj), 0);
  }

  // ---------- upper-body overlays (carry / hold) on top of the mixer ----------
  const poseCache = new Map();
  const _local = new THREE.Quaternion();
  function overlay(obj, name, w) {
    if (!poseCache.has(name)) {
      const q = {};
      for (const [bone, deg] of Object.entries(LADDER_POSES[name])) q[bone] = offsetQuat(deg, new THREE.Quaternion());
      poseCache.set(name, q);
    }
    const rig = getRig(obj), q = poseCache.get(name);
    for (const bone in q) {
      const node = rig.bones[bone];
      if (!node) continue;
      rig.localFor(bone, q[bone], _local);
      node.quaternion.slerp(_local, w);
    }
  }

  // ---------- actions: pure transition, then the visuals for it ----------
  function emit(e) { for (const cb of [...listeners]) { try { cb(e); } catch (err) { console.error(err); } } }

  function visuals(prev, next, id, action, events) {
    const v = views[id], PL = prev.ladder, NL = next.ladder;
    if (action === 'climb' && NL.state === 'climbed' && NL.by === id) {
      const from = NL.rung - 1;
      v.mode = 'move';
      playSolo(NL.rung % 2 ? 'ladderClimbL' : 'ladderClimbR', v.obj, { root: rootAt(climbSpot(NL, from), matY + from * LADDER.RUNG), onCamera: cam });
    } else if (action === 'grab' && next.winner === id) {
      v.mode = 'move';
      playSolo('ladderGrab', v.obj, {
        root: rootAt(climbSpot(NL, NL.rung), matY + NL.rung * LADDER.RUNG), onCamera: cam,
        onEvent: (ev) => { if (ev.type === 'grab') { caseHolder = id; caseAttachAt = now; } },
      });
    } else if (action === 'setup' && NL.state === 'standing') {
      v.mode = 'move';
      playSolo('ladderSetup', v.obj, { root: { position: v.obj.position.clone(), yaw: v.yaw }, onCamera: cam, onEnd: groundOnEnd(v) });
    } else if ((action === 'shove' || action === 'betray_shove') && events.length) {
      const target = PL.state === 'carried' ? next.wrestlers[PL.by] : PL;
      const yaw = Math.atan2(target.x - v.obj.position.x, target.z - v.obj.position.z);
      if (v.mode !== 'ground') stopMoves(v.obj);
      v.mode = 'move';
      playSolo('ladderShove', v.obj, { root: { position: v.obj.position.clone(), yaw }, onCamera: cam, onEnd: groundOnEnd(v) });
    } else if (action === 'descend') toGround(v);

    if (NL.state === 'tipped' && PL.state !== 'tipped') {
      tipStart = now + TIMING.SHOVE_LAG_MS / 1000;
      const fallen = PL.state === 'climbed' ? PL.by : null;
      if (fallen) {
        const c = views[fallen], rung = PL.rung, side = PL.side;
        later(TIMING.SHOVE_LAG_MS / 1000, () => {
          c.mode = 'move';
          playSolo(`ladderFall${rung}`, c.obj, { root: rootAt(climbSpot(PL, rung, side), matY + rung * LADDER.RUNG), onCamera: cam });
        });
        later(TIMING.SHOVE_LAG_MS / 1000 + 1.3, () => {
          const land = landingSpot(PL, rung, side);
          playSolo('kipup', c.obj, { root: rootAt(land, matY), onCamera: cam, onEnd: groundOnEnd(c) });
        });
      }
    }
  }

  function act(id, action) {
    const prev = m;
    const r = actPure(m, id, action, tms());
    if (r.state === prev) return [];
    m = r.state;
    visuals(prev, m, id, action, r.events);
    for (const e of r.events) emit(e);
    return r.events;
  }

  // ---------- frame ----------
  function update(dt) {
    now += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= now) { const t = timers.splice(i, 1)[0]; t.fn(); }
    const t = tms();
    for (const v of Object.values(views)) {
      if (!v.ai) continue;
      if (now >= v.ai.next) {
        v.ai.next = now + 0.25;
        const d = aiDecide(m, v.id, t, v.ai.policy);
        v.ai.toward = d?.toward || null;
        if (d?.action) act(v.id, d.action);
      }
      const w = m.wrestlers[v.id];
      if (v.ai.toward) {
        const dx = v.ai.toward.x - w.x, dz = v.ai.toward.z - w.z;
        if (Math.hypot(dx, dz) > 0.1) { v.inMx = dx; v.inMz = dz; } else { v.inMx = v.inMz = 0; }
      } else { v.inMx = v.inMz = 0; }
    }
    for (const v of Object.values(views)) {
      const before = m.wrestlers[v.id];
      m = movePure(m, v.id, v.inMx, v.inMz, dt, t);
      v.moving = m.wrestlers[v.id] !== before && v.mode === 'ground';
      playClip(v, v.moving ? 'walk' : 'idle');
    }
    for (const v of Object.values(views)) v.mixer?.update(dt);
    if (driveMoves) updateMoves(dt);
    const L = m.ladder;
    for (const v of Object.values(views)) {
      if (v.mode === 'ground') {
        const w = m.wrestlers[v.id];
        v.obj.position.set(w.x, matY, w.z);
        v.yaw += wrap(w.yaw - v.yaw) * (firstFrame ? 1 : damp(14, dt));
        yawQuat(v.yaw, v.obj.quaternion);
      }
      const want = v.mode !== 'ground' ? null
        : L.state === 'carried' && L.by === v.id ? 'carryLadder'
          : L.holder === v.id ? 'holdLadder' : null;
      if (want) v.overlay = want;
      v.ow += ((want ? 1 : 0) - v.ow) * damp(12, dt);
      if (v.overlay && v.ow > 0.01) overlay(v.obj, v.overlay, v.ow);
    }
    updateLadderView(dt);
    updateCaseView();
    firstFrame = false;
  }

  function setState(next) {
    m = next;
    timers.length = 0;
    caseHolder = null;
    tipStart = m.ladder.state === 'tipped' ? now - 10 : -1e9;
    firstFrame = true;
    for (const v of Object.values(views)) { toGround(v); v.yaw = m.wrestlers[v.id].yaw; v.ow = 0; v.overlay = null; }
  }

  return {
    update,
    act,
    input(id, mx, mz) { const v = views[id]; if (v) { v.inMx = mx; v.inMz = mz; } },
    setPolicy(id, policy) { const v = views[id]; if (v) v.ai = policy ? { policy, next: 0, toward: null } : null; },
    onEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    get state() { return m; },
    setState,
    advance(seconds, step = 1 / 60) { for (let s = 0; s < seconds - 1e-6; s += step) update(Math.min(step, seconds - s)); },
    get time() { return now; },
    focus() {
      const L = m.ladder, c = L.state === 'climbed' ? m.wrestlers[L.by] : null;
      return { ladder: { x: L.x, z: L.z }, climbHeight: c ? L.rung * LADDER.RUNG : 0, case: m.case };
    },
    caseObject: brief.group,
    ladderObject: pivot,
    dispose() {
      scene.remove(pivot, brief.group, brief.cable);
      for (const v of Object.values(views)) stopMoves(v.obj);
      listeners.clear(); timers.length = 0;
    },
  };
}
