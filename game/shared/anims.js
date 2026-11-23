// One clip map for every body (wrestlers and Ref Lou): game anim -> Universal Animation Library clip, loop mode,
// speed, crossfade, and what a one-shot settles into. Clips are built into public/models/wrestlers/clips.glb by
// game/tools/bodies/build_bodies.py (keep CLIPS there in step with USED_CLIPS here).
//   once: LoopOnce + clampWhenFinished. then: the anim to cross into when it finishes (none = hold the last frame).
//   fade: crossfade seconds into this anim (0.12 to 0.2: short enough to read as a reaction, long enough to never snap).
import * as THREE from 'three';

export const ANIMS = {
  idle: { clip: 'Idle_Loop', fade: 0.18 },
  walk: { clip: 'Walk_Loop', fade: 0.15 },
  run: { clip: 'Jog_Fwd_Loop', fade: 0.15 },
  sprint: { clip: 'Sprint_Loop', fade: 0.15 },
  stance: { clip: 'Crouch_Idle_Loop', fade: 0.2 },
  jab: { clip: 'Punch_Jab', once: true, speed: 1.7, fade: 0.12, then: 'idle' },
  cross: { clip: 'Punch_Cross', once: true, speed: 1.8, fade: 0.12, then: 'idle' },
  hook: { clip: 'Melee_Hook', once: true, speed: 1.1, fade: 0.12, then: 'idle' },
  grab: { clip: 'Push_Loop', once: true, speed: 2.2, fade: 0.12, then: 'idle' },
  block: { clip: 'Sword_Block', once: true, speed: 1.6, fade: 0.12 },          // guard comes up and holds
  guard: { clip: 'Idle_Shield_Loop', fade: 0.15 },
  hitHead: { clip: 'Hit_Head', once: true, speed: 1.2, fade: 0.12, then: 'idle' },
  hitChest: { clip: 'Hit_Chest', once: true, speed: 1.0, fade: 0.12, then: 'idle' },
  knockback: { clip: 'Hit_Knockback', once: true, fade: 0.12, then: 'idle' },
  knockdown: { clip: 'Death01', once: true, speed: 1.3, fade: 0.15 },          // falls and stays down
  getUp: { clip: 'LayToIdle', once: true, speed: 1.2, fade: 0.2, then: 'idle' },
  taunt: { clip: 'Yes', once: true, speed: 1.8, fade: 0.15, then: 'idle' },
  celebrate: { clip: 'Yes', once: true, speed: 1.1, fade: 0.2, then: 'victory' }, // the win: once, then settle
  victory: { clip: 'Idle_FoldArms_Loop', fade: 0.2 },
  dance: { clip: 'Dance_Loop', fade: 0.2 },
  disgust: { clip: 'Idle_No_Loop', fade: 0.2 },
  climb: { clip: 'ClimbUp_1m', once: true, fade: 0.15, then: 'idle' },
  roll: { clip: 'Roll', once: true, fade: 0.12, then: 'idle' },
};
export const USED_CLIPS = [...new Set(Object.values(ANIMS).map((a) => a.clip))];

// The sim's renderer hint (w.anim, plus state where one hint means two things) -> game anim.
// null: a procedural move (moves/) drives the body; the clip layer underneath settles to idle.
export function animFor(w, over) {
  switch (w.anim) {
    case 'Idle': return w.state === 'block' ? 'block' : 'idle';
    case 'Walking': return 'walk';
    case 'Running': return w.animSpeed > 1.4 ? 'sprint' : 'run';
    case 'Punch': return 'jab';
    case 'Jump': return 'grab';
    case 'No': return w.state === 'block' ? 'block' : (w.hp % 2 ? 'hitHead' : 'hitChest');
    case 'Dance': return over ? 'celebrate' : 'taunt';
    case 'ThumbsUp': return 'taunt';
    default: return null; // Death (slam), Sitting (pin cover), Standing (kip-up): procedural
  }
}

// Per-body animator. The mixer is the base pose every frame: three only writes a bone whose mixed value changed,
// so bones with constant tracks (spine_01 in every clip) keep whatever the move and life layers wrote last frame,
// and those additive nudges pile up into a twist. update() puts back the mixer's own pose before it runs, so
// moves/ and feel/life.js always layer on a clean clip pose.
export function createAnimator(obj, clips) {
  const mixer = new THREE.AnimationMixer(obj);
  const actions = {};
  for (const c of clips) actions[c.name] = mixer.clipAction(c);
  const bones = [];
  obj.traverse((o) => { if (o.isBone) bones.push(o); });
  const base = bones.map((b) => b.quaternion.clone());
  let primed = false;
  const self = { name: null, action: null, req: 0, miss: null, mixer };
  mixer.addEventListener('finished', (e) => {
    const spec = ANIMS[self.name];
    if (e.action === self.action && spec?.then) self.play(spec.then);
  });
  self.play = (name, speed) => {
    const spec = ANIMS[name], a = spec && actions[spec.clip];
    if (!a) { self.miss = name; return; }
    const ts = (spec.speed || 1) * (speed || 1);
    if (self.name === name && !spec.once) { a.timeScale = ts; return; }
    if (self.name === name && spec.once && a.isRunning()) return; // a one-shot never restarts on a repeat request
    const prev = self.action;
    a.reset();
    a.setLoop(spec.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!spec.once;
    a.timeScale = ts;
    a.setEffectiveWeight(1).play();
    if (prev && prev !== a) a.crossFadeFrom(prev, spec.fade ?? 0.15, false);
    else if (!prev) a.fadeIn(spec.fade ?? 0.15);
    self.name = name; self.action = a; self.req++;
  };
  self.update = (dt) => {
    if (primed) for (let i = 0; i < bones.length; i++) bones[i].quaternion.copy(base[i]);
    mixer.update(dt);
    for (let i = 0; i < bones.length; i++) base[i].copy(bones[i].quaternion);
    primed = true;
  };
  return self;
}
