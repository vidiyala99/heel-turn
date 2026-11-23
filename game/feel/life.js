// Procedural life layered on top of the clips: breathing, weight shift, a fighting-stance bounce,
// the head tracking the opponent, and a flinch on near misses. Runs after mixer/move updates each
// frame and only nudges bones (the mixer rewrites them next frame), so it never fights a move.
// feel.alive(root, { target, role }) adds any other character (the ref: role 'ref' gets gestures).
import * as THREE from 'three';
import { getRig, isBusy } from '../moves/index.js';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
const D = Math.PI / 180;

function nudge(rig, bone, x, y, z) {
  const n = rig.bones[bone]; if (!n) return;
  n.quaternion.multiply(_q.setFromEuler(_e.set(x * D, y * D, z * D)));
}

export function createLife() {
  const extras = []; // { root, target, role, seed }
  const flinch = [0, 0];
  let t = 0, off = false;

  function animate(root, { seed, target, role, energy = 1, flinchK = 0, stance = true }) {
    const rig = getRig(root);
    const k = Math.min(1.6, energy);
    // breathing: chest rises, shoulders follow
    const br = Math.sin(t * 2.4 + seed);
    nudge(rig, 'spine1', 1.6 * br, 0, 0); nudge(rig, 'spine2', 1.2 * br, 0, 0);
    nudge(rig, 'lShoulder', 0, 0, 1.5 * br); nudge(rig, 'rShoulder', 0, 0, -1.5 * br);
    // weight shift side to side, slow
    const ws = Math.sin(t * 1.1 + seed * 2);
    nudge(rig, 'hips', 0, 2 * ws, 3 * ws); nudge(rig, 'spine', 0, -1.5 * ws, -2.5 * ws);
    if (role !== 'ref' && stance) {
      // fighting stance: lean in, bounce on the balls of the feet
      nudge(rig, 'spine', 6 * k, 0, 0);
      const b = Math.abs(Math.sin(t * 5.2 * (0.8 + 0.2 * k) + seed));
      root.position.y += (0.012 + 0.014 * k) * b;
      nudge(rig, 'lLeg', 10 * k * (0.6 + 0.4 * b), 0, 0); nudge(rig, 'rLeg', 10 * k * (0.6 + 0.4 * b), 0, 0);
      nudge(rig, 'lUpLeg', -5 * k, 0, 0); nudge(rig, 'rUpLeg', -5 * k, 0, 0);
    } else if (role === 'ref') {
      // ref: hands on knees lean while watching, an occasional pointing gesture
      nudge(rig, 'spine', 10, 0, 0);
      const g = Math.max(0, Math.sin(t * 0.7 + seed)) ** 6;
      nudge(rig, 'rArm', -50 * g, 0, 0);
    }
    // head and eyes follow the target, clamped so it never looks owlish
    if (target) {
      root.getWorldPosition(_v); const tgt = target();
      if (tgt) {
        const yaw = Math.atan2(tgt.x - _v.x, tgt.z - _v.z) - root.rotation.y;
        const rel = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        const lim = 55 * D, y = Math.max(-lim, Math.min(lim, rel)) / D;
        nudge(rig, 'neck', 0, y * 0.35, 0); nudge(rig, 'head', -4 + 2 * br, y * 0.45, 0);
      }
    }
    if (flinchK > 0.01) { nudge(rig, 'spine1', -14 * flinchK, 0, 0); nudge(rig, 'head', -10 * flinchK, 0, 0); root.position.y -= 0.03 * flinchK; }
  }

  return {
    alive(root, opts = {}) { extras.push({ root, seed: Math.random() * 6, ...opts }); },
    set off(v) { off = v; }, get off() { return off; },
    nearMiss(slot) { flinch[slot] = 1; },
    update(dt, st, views) {
      t += dt;
      if (off) return;
      views.forEach((v, i) => {
        flinch[i] *= Math.pow(0.004, dt);
        const w = st?.w[i];
        if (!w || isBusy(v.root) || v.lying || ['down', 'pinned', 'thrown', 'out', 'pinning'].includes(w.state)) return;
        const o = views[1 - i];
        animate(v.root, {
          seed: i * 2.3, flinchK: flinch[i],
          energy: 0.7 + (w.heat || 0) / 120 + (w.fired > 0 ? 0.5 : 0) - (w.st < 30 ? 0.3 : 0),
          target: o ? () => o.holder.position : null, stance: w.anim !== 'Running' && w.state !== 'taunt',
        });
      });
      for (const x of extras) { if (x.root.parent && !isBusy(x.root)) animate(x.root, x); }
    },
  };
}
