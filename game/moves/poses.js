// Named poses. Values are character-space Euler degrees (see rig.js header).
// Helpers keep authoring in body terms: arm(pitch, abduction, elbowBend).

// twist: rotation about the upper arm's own axis, applied first. Positive turns the
// elbow-flex plane inward, so a bent forearm crosses in front of the body (cradle, hug).
const arm = (side, pitch, abd = 0, bend = 10, twist = 0) => {
  const s = side === 'l' ? 1 : -1;
  return {
    [`${side}Arm`]: [['x', twist], ['z', s * (-90 + abd)], ['x', pitch]],
    [`${side}Forearm`]: [0, -s * bend, 0],
  };
};
const leg = (side, pitch, abd = 0, knee = 0, foot = 0) => {
  const s = side === 'l' ? 1 : -1;
  return {
    [`${side}UpLeg`]: [pitch, 0, s * abd],
    [`${side}Leg`]: [knee, 0, 0],
    [`${side}Foot`]: [foot, 0, 0],
  };
};
const arms = (pitch, abd, bend) => ({ ...arm('l', pitch, abd, bend), ...arm('r', pitch, abd, bend) });
const legs = (pitch, abd, knee, foot = 0) => ({ ...leg('l', pitch, abd, knee, foot), ...leg('r', pitch, abd, knee, foot) });

// Mirror a pose across the character's sagittal plane: swap L/R, negate y and z.
export function mirror(pose) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) {
    const mk = k[0] === 'l' && k[1] === k[1].toUpperCase() ? 'r' + k.slice(1)
      : k[0] === 'r' && k[1] === k[1].toUpperCase() ? 'l' + k.slice(1) : k;
    out[mk] = Array.isArray(v[0]) ? v.map(([ax, d]) => [ax, ax === 'x' ? d : -d]) : [v[0], -v[1], -v[2]];
  }
  return out;
}

const ZERO = { hips: [0, 0, 0], spine: [0, 0, 0], spine1: [0, 0, 0], spine2: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0] };
export const STAND = { ...ZERO, ...arms(0, 12, 14), ...legs(0, 2, 0) };
const P = (o) => ({ ...STAND, ...o });

const RUN_A = P({
  spine: [16, 6, 0], spine1: [4, 4, 0],
  ...arm('l', 45, 12, 85), ...arm('r', -60, 12, 95),
  ...leg('l', -60, 2, 55, -5), ...leg('r', 25, 2, 75, 25),
});
const WALK_A = P({
  spine: [-6, 8, 0], spine2: [-4, 4, 0], neck: [-4, -8, 0],
  ...arm('l', 40, 16, 20), ...arm('r', -55, 16, 45),
  ...leg('l', -32, 2, 8, -6), ...leg('r', 22, 2, 30, 18),
});

export const POSES = {
  stand: STAND,
  stance: P({
    spine: [14, 0, 0], neck: [-10, 0, 0],
    ...arm('l', -45, 18, 85), ...arm('r', -35, 18, 80),
    ...leg('l', -30, 8, 40, -8), ...leg('r', -8, 8, 28, -12),
  }),

  // Collar-and-elbow: left hand behind opponent's neck, right hand on their elbow.
  tieup: P({
    spine: [24, 0, 0], spine1: [6, 0, 0], neck: [-14, 0, 0],
    ...arm('l', -100, 10, 70, 45), ...arm('r', -58, 2, 62, 35),
    ...leg('l', -34, 6, 34, -10), ...leg('r', 22, 6, 12, -14),
  }),
  tieupPush: P({
    spine: [32, 0, 0], spine1: [8, 0, 0], neck: [-18, 0, 0],
    ...arm('l', -95, 10, 60, 45), ...arm('r', -62, 2, 50, 35),
    ...leg('l', -42, 6, 50, -12), ...leg('r', 30, 6, 8, -20),
  }),

  // Body slam.
  slamReach: P({
    spine: [42, 0, 0], spine1: [10, 0, 0], neck: [-25, 0, 0],
    ...arm('l', -75, 0, 35), ...arm('r', -95, 6, 30),
    ...leg('l', -62, 12, 85, -18), ...leg('r', -48, 12, 72, -18),
  }),
  slamCarry: P({
    spine: [-16, 0, 0], spine1: [-8, 0, 0], neck: [-14, 0, 0],
    ...arm('l', -84, 6, 75, 75), ...arm('r', -70, 6, 70, 70),
    ...leg('l', -12, 10, 14), ...leg('r', 6, 10, 8),
  }),
  slamDrive: P({
    spine: [48, 0, 0], spine1: [12, 0, 0], neck: [-20, 0, 0],
    ...arm('l', -85, 4, 25), ...arm('r', -80, 4, 25),
    ...leg('l', -78, 10, 105, -20), ...leg('r', -20, 10, 70, 10),
  }),
  limp: P({
    spine: [-6, 0, 0], neck: [-12, 0, 0],
    ...arm('l', -20, 40, 35), ...arm('r', -40, 30, 40),
    ...leg('l', -24, 6, 32), ...leg('r', -10, 6, 18),
  }),
  // Held face-up across the attacker's chest: limbs hang toward the mat.
  held: P({
    spine: [-8, 0, 0], neck: [-20, 0, 0], head: [-10, 0, 0],
    ...arm('l', 35, 35, 30), ...arm('r', 20, 25, 35),
    ...leg('l', 12, 8, 55, 20), ...leg('r', 22, 8, 40, 20),
  }),
  lyingHurt: P({
    neck: [12, 0, 0], head: [8, 0, 0],
    ...arm('l', -10, 55, 35), ...arm('r', -30, 35, 60),
    ...leg('l', -8, 8, 12, 20), ...leg('r', -38, 6, 66, 10),
  }),

  // Front facelock (suplex + DDT setups).
  bentOver: P({
    spine: [34, 0, 0], spine1: [16, 0, 0], spine2: [10, 0, 0], neck: [-24, 0, 0],
    ...arm('l', -55, 6, 25), ...arm('r', -40, 6, 30),
    ...leg('l', -24, 6, 28, -6), ...leg('r', -6, 6, 18, -8),
  }),
  facelock: P({
    spine: [18, 0, 0], neck: [10, 0, 0],
    ...arm('l', -62, 4, 95, 80), ...arm('r', -80, 10, 40, 30),
    ...leg('l', -24, 8, 30, -8), ...leg('r', 12, 8, 14, -12),
  }),
  suplexLift: P({
    spine: [-26, 0, 0], spine1: [-12, 0, 0], neck: [-18, 0, 0],
    ...arm('l', -165, 6, 55), ...arm('r', -150, 10, 45),
    ...leg('l', -6, 8, 10), ...leg('r', 10, 8, 6),
  }),
  suplexBridge: P({
    spine: [-20, 0, 0], neck: [-10, 0, 0],
    ...arm('l', -160, 10, 70), ...arm('r', -150, 10, 60),
    ...leg('l', -50, 10, 80, 20), ...leg('r', -45, 10, 75, 20),
  }),
  inverted: P({
    spine: [0, 0, 0], neck: [-10, 0, 0],
    ...arm('l', -170, 20, 20), ...arm('r', -165, 20, 25),
    ...leg('l', 0, 4, 6, 25), ...leg('r', -6, 4, 4, 25),
  }),
  whipOver: P({
    spine: [-10, 0, 0],
    ...arm('l', -150, 40, 30), ...arm('r', -140, 40, 30),
    ...leg('l', -20, 6, 20, 25), ...leg('r', -30, 6, 30, 25),
  }),

  // DDT.
  ddtDrop: P({
    spine: [-18, 0, 0], neck: [12, 0, 0],
    ...arm('l', -60, 4, 95, 80), ...arm('r', -90, 30, 20),
    ...leg('l', -70, 10, 15, 10), ...leg('r', -55, 10, 25, 10),
  }),
  ddtPlant: P({
    spine: [30, 0, 0], spine1: [12, 0, 0], neck: [-30, 0, 0],
    ...arm('l', -150, 30, 20), ...arm('r', -140, 30, 25),
    ...leg('l', -10, 8, 10, 20), ...leg('r', 10, 8, 20, 20),
  }),
  faceDown: P({
    neck: [-20, 0, 0], head: [-10, 0, 0],
    ...arm('l', -150, 20, 40), ...arm('r', -20, 30, 20),
    ...leg('l', 4, 8, 15, 30), ...leg('r', -20, 8, 30, 30),
  }),

  // Clothesline.
  run: RUN_A,
  runB: mirror(RUN_A),
  lineRunA: { ...RUN_A, ...arm('r', -4, 88, 4) },
  lineRunB: { ...mirror(RUN_A), ...arm('r', -4, 88, 4) },
  lineFollow: P({
    spine: [8, -28, 0], spine1: [0, -12, 0],
    ...arm('l', 40, 20, 60), ...arm('r', -40, 84, 10, 40),
    ...leg('l', -40, 4, 40, -6), ...leg('r', 18, 4, 30, 10),
  }),
  bumpAir: P({
    spine: [-14, 0, 0], neck: [-30, 0, 0],
    ...arm('l', -150, 50, 25), ...arm('r', -160, 45, 30),
    ...leg('l', -70, 10, 18), ...leg('r', -55, 10, 28),
  }),

  // Pin and referee.
  cover: P({
    spine: [0, 0, 0], neck: [-25, 0, 0],
    ...arm('l', -95, 4, 30), ...arm('r', -40, 30, 70),
    ...leg('l', -14, 10, 8, 30), ...leg('r', -55, 14, 95, 20),
  }),
  pinned: P({
    neck: [16, 0, 0],
    ...arm('l', -10, 60, 25), ...arm('r', -20, 50, 30),
    ...leg('l', -50, 8, 70, 15), ...leg('r', -6, 6, 10, 15),
  }),
  refDown: P({
    spine: [45, 0, 0], spine1: [10, 0, 0], neck: [-35, 0, 0],
    ...arm('l', -40, 30, 40), ...arm('r', -150, 20, 15),
    ...leg('l', -95, 10, 95, -10), ...leg('r', 0, 4, 105, 40),
  }),
  refSlap: P({
    spine: [55, 0, 0], spine1: [14, 0, 0], neck: [-40, 0, 0],
    ...arm('l', -40, 30, 40), ...arm('r', -80, 22, 5),
    ...leg('l', -95, 10, 95, -10), ...leg('r', 0, 4, 105, 40),
  }),

  // Kip-up.
  kipTuck: P({
    neck: [30, 0, 0],
    ...arm('l', -165, 25, 140), ...arm('r', -165, 25, 140),
    ...leg('l', -135, 6, 110, 20), ...leg('r', -135, 6, 110, 20),
  }),
  kipKick: P({
    spine: [-25, 0, 0], neck: [-10, 0, 0],
    ...arm('l', -170, 20, 40), ...arm('r', -170, 20, 40),
    ...leg('l', -40, 6, 10, 20), ...leg('r', -40, 6, 10, 20),
  }),
  kipLand: P({
    spine: [30, 0, 0], neck: [-25, 0, 0],
    ...arm('l', -80, 30, 40), ...arm('r', -80, 30, 40),
    ...leg('l', -95, 14, 120, -25), ...leg('r', -95, 14, 120, -25),
  }),

  // Taunts.
  tauntLoad: P({
    spine: [24, 0, 0], neck: [10, 0, 0],
    ...arm('l', -20, 20, 100), ...arm('r', -20, 20, 100),
    ...leg('l', -30, 12, 45, -10), ...leg('r', -30, 12, 45, -10),
  }),
  armsUp: P({
    spine: [-14, 0, 0], spine1: [-8, 0, 0], neck: [-24, 0, 0],
    ...arm('l', -20, 152, 22), ...arm('r', -20, 152, 22),
    ...legs(0, 10, 4),
  }),
  poundL: P({
    spine: [-6, 0, 0], spine2: [-6, 0, 0], neck: [-22, 0, 0],
    ...arm('l', -40, 22, 150), ...arm('r', -20, 60, 95),
    ...leg('l', -10, 12, 12), ...leg('r', 4, 12, 6),
  }),
  poundR: P({
    spine: [-6, 0, 0], spine2: [-6, 0, 0], neck: [-22, 0, 0],
    ...arm('l', -20, 60, 95), ...arm('r', -40, 22, 150),
    ...leg('l', -10, 12, 12), ...leg('r', 4, 12, 6),
  }),
  roar: P({
    spine: [-18, 0, 0], spine1: [-8, 0, 0], neck: [-35, 0, 0],
    ...arm('l', 15, 60, 110), ...arm('r', 15, 60, 110),
    ...legs(0, 14, 10),
  }),

  // Entrance strut.
  walk: WALK_A,
  walkB: mirror(WALK_A),
  stepsPose: P({
    spine: [-10, -10, 0], spine1: [-6, 0, 0], neck: [-22, 20, 0],
    ...arm('l', -10, 40, 70), ...arm('r', -168, 10, 8),
    ...leg('l', -62, 6, 64, -12), ...leg('r', 4, 6, 4),
  }),
};
