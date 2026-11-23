// Move registry. Every track is keyframes on a SHARED move root (the attacker's
// floor position and facing at the moment the move starts; +Z is forward).
//
// key = { t, pose, p, r, ease }
//   t     seconds
//   pose  name in POSES (or a pose object)
//   p     pelvis offset in meters from a standing pelvis at the move root [x, y, z]
//   r     body rotation about the pelvis as ordered world-axis steps [['y',180],['x',-90]]
//   ease  curve for the segment that ENDS at this key
// Missing p/r inherit from the previous key.
//
// Timing rules (emil-design-eng, translated to bodies): anticipation dip before
// every big action, ease-out on lifts (fast off the mat, hang at the top),
// ease-in on drops (gravity), a hitstop freeze on impact, and a short settle.

const FACE = [['y', 180]];              // victim facing the attacker
const LIE = -0.86;                      // pelvis offset when flat on the mat
const ACROSS = [['y', 180], ['z', -90], ['x', 90]]; // on back, head toward attacker's left (+X)
const k = (t, pose, p, r, ease = 'inOutSine') => ({ t, pose, p, r, ease });
const imp = (t, damage, extra = {}) => ({ t, type: 'impact', damage, cue: 'shake', hitstop: 0.075, ...extra });
const cam = (t, cue) => ({ t, type: 'camera', cue });

export const MOVES = {
  lockup: {
    kind: 'paired', label: 'Lock-up', duration: 1.8,
    meta: { damage: 0, stamina: 4, range: 1.6, startup: 25 },
    attacker: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.18, 'stance', [0, -0.08, -0.04], [], 'outCubic'),
      k(0.42, 'tieup', [0, -0.05, 0.2], [], 'outCubic'),
      k(0.75, 'tieupPush', [0, -0.08, 0.3]),
      k(1.05, 'tieup', [0, -0.06, 0.2]),
      k(1.35, 'tieupPush', [0, -0.08, 0.34]),
      k(1.8, 'tieup', [0, -0.06, 0.3]),
    ],
    victim: [
      k(0, 'stand', [0, 0, 1.3], FACE),
      k(0.18, 'stance', [0, -0.08, 1.32], FACE, 'outCubic'),
      k(0.42, 'tieup', [0, -0.05, 0.88], FACE, 'outCubic'),
      k(0.75, 'tieup', [0, -0.06, 0.95]),
      k(1.05, 'tieupPush', [0, -0.08, 0.86]),
      k(1.35, 'tieup', [0, -0.06, 0.99]),
      k(1.8, 'tieup', [0, -0.06, 0.96]),
    ],
    events: [imp(0.42, 0, { cue: 'close', hitstop: 0.06 })],
    hold: { attacker: false, victim: false },
  },

  bodyslam: {
    kind: 'paired', label: 'Body slam', duration: 2.3,
    meta: { damage: 12, stamina: 14, range: 1.0, startup: 85 },
    attacker: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.28, 'slamReach', [0, -0.24, 0.1], [], 'outCubic'),
      k(0.45, 'slamReach', [0, -0.27, 0.12]),
      k(0.85, 'slamCarry', [0, 0, 0], [], 'outCubic'),
      k(1.15, 'slamCarry', [0, 0.02, -0.03]),
      k(1.42, 'slamDrive', [0, -0.32, 0.2], [], 'inQuad'),
      k(1.9, 'slamDrive', [0, -0.3, 0.2]),
      k(2.3, 'stand', [0, 0, 0.18], [], 'outCubic'),
    ],
    victim: [
      k(0, 'stand', [0, 0, 0.72], FACE),
      k(0.28, 'limp', [0, -0.02, 0.6], FACE, 'outCubic'),
      k(0.45, 'limp', [0, 0.04, 0.52], [['y', 180], ['x', -12]]),
      k(0.85, 'held', [0, 0.36, 0.6], ACROSS, 'outCubic'),
      k(1.15, 'held', [0, 0.4, 0.58], ACROSS),
      k(1.42, 'lyingHurt', [0, LIE, 0.8], ACROSS, 'inQuad'),
      k(1.58, 'lyingHurt', [0, LIE + 0.07, 0.8], ACROSS, 'outQuad'),
      k(1.75, 'lyingHurt', [0, LIE, 0.8], ACROSS, 'inQuad'),
    ],
    events: [cam(0.85, 'low-angle'), imp(1.42, 12)],
    hold: { attacker: false, victim: true },
  },

  suplex: {
    kind: 'paired', label: 'Vertical suplex', duration: 3.2,
    meta: { damage: 15, stamina: 18, range: 0.9, startup: 109 },
    attacker: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.3, 'facelock', [0, -0.05, 0], [], 'outCubic'),
      k(0.62, 'facelock', [0, -0.14, 0]),
      k(1.05, 'suplexLift', [0, 0.03, -0.05], [], 'outCubic'),
      k(1.4, 'suplexLift', [0, 0.02, -0.08]),
      k(1.62, 'suplexLift', [0, -0.3, -0.25], [['x', -35]], 'inQuad'),
      k(1.82, 'suplexBridge', [0, LIE + 0.04, -0.45], [['x', -88]], 'inQuad'),
      k(2.3, 'kipLand', [0, -0.55, -0.35], [['x', -50]]),
      k(2.7, 'kipLand', [0, -0.38, -0.35], [], 'outCubic'),
      k(3.2, 'stand', [0, 0, -0.35], [], 'outCubic'),
    ],
    victim: [
      k(0, 'stand', [0, 0, 0.72], FACE),
      k(0.3, 'bentOver', [0.14, -0.12, 0.56], [['y', 180], ['x', -35]], 'outCubic'),
      k(0.62, 'bentOver', [0.14, -0.16, 0.54], [['y', 180], ['x', -38]]),
      k(1.05, 'inverted', [0.3, 1.2, 0.08], [['y', 180], ['x', -180]], 'outCubic'),
      k(1.4, 'inverted', [0.3, 1.24, 0.06], [['y', 180], ['x', -180]]),
      k(1.62, 'whipOver', [0.26, 0.6, -1.05], [['y', 180], ['x', -225]], 'inQuad'),
      k(1.82, 'lyingHurt', [0.2, LIE, -1.95], [['y', 180], ['x', -270]], 'inQuad'),
      k(1.98, 'lyingHurt', [0.2, LIE + 0.06, -1.97], [['y', 180], ['x', -270]], 'outQuad'),
      k(2.14, 'lyingHurt', [0.2, LIE, -1.98], [['y', 180], ['x', -270]], 'inQuad'),
    ],
    events: [cam(0.62, 'low-angle'), imp(1.82, 15)],
    hold: { attacker: false, victim: true },
  },

  ddt: {
    kind: 'paired', label: 'DDT', duration: 2.4,
    meta: { damage: 14, stamina: 12, range: 0.9, startup: 60 },
    attacker: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.3, 'facelock', [0, -0.05, 0], [], 'outCubic'),
      k(0.55, 'facelock', [0, 0.04, 0.02], [], 'outQuad'),
      k(0.85, 'ddtDrop', [0, -0.38, -0.3], [['x', -45]], 'inQuad'),
      k(1.0, 'ddtDrop', [0, LIE + 0.04, -0.45], [['x', -86]], 'inQuad'),
      k(1.6, 'kipLand', [0, -0.55, -0.4], [['x', -40]]),
      k(2.0, 'kipLand', [0, -0.38, -0.4], [], 'outCubic'),
      k(2.4, 'stand', [0, 0, -0.4], [], 'outCubic'),
    ],
    victim: [
      k(0, 'stand', [0, 0, 0.72], FACE),
      k(0.3, 'bentOver', [0.14, -0.12, 0.55], [['y', 180], ['x', -40]], 'outCubic'),
      k(0.55, 'bentOver', [0.14, -0.06, 0.52], [['y', 180], ['x', -45]]),
      k(0.85, 'ddtPlant', [0.12, -0.1, 0.1], [['y', 180], ['x', -100]], 'inQuad'),
      k(1.0, 'ddtPlant', [0.12, -0.3, -0.15], [['y', 180], ['x', -135]], 'inQuad'),
      k(1.18, 'ddtPlant', [0.2, -0.36, -0.08], [['y', 180], ['x', -128]]),
      k(1.45, 'faceDown', [0.5, LIE, 0.15], [['y', 180], ['x', -90]], 'inQuad'),
    ],
    events: [imp(1.0, 14)],
    hold: { attacker: false, victim: true },
  },

  clothesline: {
    kind: 'paired', label: 'Running clothesline', duration: 1.9,
    meta: { damage: 10, stamina: 10, range: 4.0, startup: 43 },
    attacker: [
      k(0, 'stance', [0, -0.06, 0], []),
      k(0.15, 'lineRunA', [0, -0.04, 0.6], [], 'outQuad'),
      k(0.3, 'lineRunB', [0, 0, 1.25], [], 'linear'),
      k(0.45, 'lineRunA', [0, -0.04, 1.9], [], 'linear'),
      k(0.6, 'lineRunB', [0, 0, 2.55], [], 'linear'),
      k(0.72, 'lineFollow', [0, -0.02, 3.0], [], 'linear'),
      k(1.0, 'lineFollow', [0, -0.05, 3.5], [], 'outCubic'),
      k(1.5, 'stance', [0, -0.04, 3.65], [], 'outCubic'),
    ],
    victim: [
      k(0, 'stance', [-0.5, -0.06, 3.0], FACE),
      k(0.72, 'stance', [-0.5, -0.06, 3.0], FACE),
      k(0.82, 'bumpAir', [-0.5, 0.18, 3.25], [['y', 180], ['x', 40]], 'outQuad'),
      k(0.95, 'bumpAir', [-0.5, 0.24, 3.5], [['y', 180], ['x', 80]]),
      k(1.08, 'lyingHurt', [-0.5, LIE, 3.72], [['y', 180], ['x', 90]], 'inQuad'),
      k(1.22, 'lyingHurt', [-0.5, LIE + 0.07, 3.75], [['y', 180], ['x', 90]], 'outQuad'),
      k(1.36, 'lyingHurt', [-0.5, LIE, 3.76], [['y', 180], ['x', 90]], 'inQuad'),
    ],
    events: [imp(0.72, 6, { hitstop: 0.09 }), imp(1.08, 4, { hitstop: 0.06 })],
    hold: { attacker: false, victim: true },
  },

  pin: {
    kind: 'paired', label: 'Pin cover', duration: 3.4, anchor: 'victim',
    meta: { damage: 0, stamina: 6, range: 1.5, startup: 42 },
    attacker: [
      k(0, 'stand', [0.3, 0, 0.1], []),
      k(0.35, 'kipLand', [0.3, -0.4, 0.22], [], 'outCubic'),
      k(0.7, 'cover', [0.3, -0.66, 0.3], [['x', 90]], 'inQuad'),
      k(3.4, 'cover', [0.3, -0.66, 0.3], [['x', 90]]),
    ],
    victim: [
      k(0, 'lyingHurt', [0, LIE, 0.75], ACROSS),
      k(0.7, 'pinned', [0, LIE, 0.75], ACROSS),
      k(2.2, 'pinned', [0, LIE + 0.02, 0.75], ACROSS),
      k(3.4, 'pinned', [0, LIE, 0.75], ACROSS),
    ],
    events: [imp(0.7, 0, { cue: 'low-angle', hitstop: 0.05 })],
    hold: { attacker: true, victim: true },
  },

  refcount: {
    kind: 'solo', label: 'Referee count', duration: 3.4,
    meta: { damage: 0, stamina: 0, range: 0, startup: 78 },
    track: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.5, 'refDown', [0, -0.5, 0], [], 'outCubic'),
      k(1.1, 'refDown', [0, -0.5, 0]),
      k(1.3, 'refSlap', [0, -0.52, 0], [], 'inQuad'),
      k(1.7, 'refDown', [0, -0.5, 0], [], 'outCubic'),
      k(2.1, 'refSlap', [0, -0.52, 0], [], 'inQuad'),
      k(2.5, 'refDown', [0, -0.5, 0], [], 'outCubic'),
      k(2.9, 'refSlap', [0, -0.52, 0], [], 'inQuad'),
      k(3.4, 'refSlap', [0, -0.52, 0]),
    ],
    events: [
      { t: 1.3, type: 'count', n: 1 }, { t: 2.1, type: 'count', n: 2 }, { t: 2.9, type: 'count', n: 3, cue: 'shake' },
    ],
    hold: true,
  },

  jab: {
    kind: 'solo', label: 'Jab', duration: 0.42,
    meta: { damage: 8, stamina: 6, range: 1.2, startup: 6 },
    track: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.08, 'stance', [0, -0.04, -0.04], [], 'outCubic'),
      k(0.17, 'slamReach', [0, -0.02, 0.14], [['y', -18]], 'outQuad'),
      k(0.42, 'stand', [0, 0, 0], [], 'outCubic'),
    ],
    events: [imp(0.17, 8)],
    hold: false,
  },

  hitReact: {
    kind: 'solo', label: 'Hit reaction', duration: 0.45,
    meta: { damage: 0, stamina: 0, range: 0, startup: 0 },
    track: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.08, 'limp', [0, -0.06, -0.16], [['x', -12]], 'outQuad'),
      k(0.45, 'stand', [0, 0, 0], [], 'outCubic'),
    ],
    events: [],
    hold: false,
  },

  kipup: {
    kind: 'solo', label: 'Kip-up', duration: 1.5,
    meta: { damage: 0, stamina: 8, range: 0, startup: 51 },
    track: [
      k(0, 'lyingHurt', [0, LIE, 0], [['x', -90]]),
      k(0.35, 'kipTuck', [0, LIE + 0.04, 0], [['x', -115]], 'inOutSine'),
      k(0.6, 'kipKick', [0, -0.4, 0.25], [['x', -55]], 'outQuad'),
      k(0.85, 'kipLand', [0, -0.38, 0.45], [], 'inQuad'),
      k(1.5, 'stand', [0, 0, 0.45], [], 'outCubic'),
    ],
    events: [{ t: 0.85, type: 'camera', cue: 'shake' }],
    hold: false,
  },

  tauntArms: {
    kind: 'solo', label: 'Taunt: arms raised', duration: 2.0,
    meta: { damage: 0, stamina: -10, range: 0, startup: 33 },
    track: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.3, 'tauntLoad', [0, -0.16, 0], [], 'outCubic'),
      k(0.55, 'armsUp', [0, 0.04, 0], [], 'outBack'),
      k(1.0, 'armsUp', [0, 0, 0]),
      k(1.5, 'armsUp', [0, 0.02, 0]),
      k(2.0, 'stand', [0, 0, 0], [], 'outCubic'),
    ],
    events: [cam(0.55, 'low-angle')],
    hold: false,
  },

  chestPound: {
    kind: 'solo', label: 'Taunt: chest pound', duration: 2.3,
    meta: { damage: 0, stamina: -10, range: 0, startup: 15 },
    track: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.25, 'poundL', [0, -0.03, 0], [], 'outCubic'),
      k(0.42, 'poundR', [0, -0.03, 0], [], 'outCubic'),
      k(0.59, 'poundL', [0, -0.03, 0], [], 'outCubic'),
      k(0.76, 'poundR', [0, -0.03, 0], [], 'outCubic'),
      k(1.05, 'roar', [0, 0.02, 0], [], 'outBack'),
      k(1.85, 'roar', [0, 0, 0]),
      k(2.3, 'stand', [0, 0, 0], [], 'outCubic'),
    ],
    events: [cam(0.25, 'thump'), cam(0.42, 'thump'), cam(0.59, 'thump'), cam(0.76, 'thump'), cam(1.05, 'close')],
    hold: false,
  },

  strut: {
    kind: 'solo', label: 'Entrance strut', duration: 5.0,
    meta: { damage: 0, stamina: 0, range: 0, startup: 0 },
    track: [
      k(0, 'stand', [0, 0, 0], []),
      ...[0, 1, 2, 3, 4, 5].map((i) => k(0.3 + i * 0.5, i % 2 ? 'walkB' : 'walk', [0, -0.03, 0.3 + i * 0.62], [], 'inOutSine')),
      k(3.25, 'stand', [0, 0, 3.75], [], 'outCubic'),
      k(3.65, 'stepsPose', [0, 0.1, 3.95], [['y', -12]], 'outBack'),
      k(4.6, 'stepsPose', [0, 0.1, 3.95], [['y', -12]]),
      k(5.0, 'stand', [0, 0, 3.95], [], 'outCubic'),
    ],
    events: [cam(3.65, 'low-angle')],
    hold: false,
  },
};
