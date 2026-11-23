// Ladder poses and moves in the game/moves format (see game/moves/moves.js header).
// registerLadderMoves(unit) adds them to the shared MOVES/POSES registries at runtime;
// game/moves files are not edited. `unit` = 1 / (rig.hipHeight / 1.04) so that authored
// metre offsets (rung height, fall height) land exactly despite the director's hip scaling.
import { MOVES, POSES, mirror } from '../moves/index.js';
import { STAND } from '../moves/poses.js';
import { LADDER } from './state.js';

// Same helpers as game/moves/poses.js (not exported there): arm(pitch, abduction, elbowBend, twist).
const arm = (side, pitch, abd = 0, bend = 10, twist = 0) => {
  const s = side === 'l' ? 1 : -1;
  return { [`${side}Arm`]: [['x', twist], ['z', s * (-90 + abd)], ['x', pitch]], [`${side}Forearm`]: [0, -s * bend, 0] };
};
const leg = (side, pitch, abd = 0, knee = 0, foot = 0) => {
  const s = side === 'l' ? 1 : -1;
  return { [`${side}UpLeg`]: [pitch, 0, s * abd], [`${side}Leg`]: [knee, 0, 0], [`${side}Foot`]: [foot, 0, 0] };
};
const P = (o) => ({ ...STAND, ...o });

const CLIMB_REACH = P({
  spine: [10, 0, 0], neck: [-18, 0, 0],
  ...arm('l', -95, 18, 85), ...arm('r', -150, 14, 40),
  ...leg('l', -62, 6, 78, -10), ...leg('r', -4, 6, 8, -4),
});
const CLIMB_PUSH = P({
  spine: [6, 0, 0], neck: [-14, 0, 0],
  ...arm('l', -85, 18, 95), ...arm('r', -125, 14, 60),
  ...leg('l', -30, 6, 34, -8), ...leg('r', 14, 6, 40, 10),
});

export const LADDER_POSES = {
  // On the ladder: hands on the rails at head height, both feet on one rung.
  ladderStand: P({
    spine: [8, 0, 0], neck: [-12, 0, 0],
    ...arm('l', -105, 18, 75), ...arm('r', -105, 18, 75),
    ...leg('l', -8, 6, 14, -6), ...leg('r', -8, 6, 14, -6),
  }),
  climbReachL: CLIMB_REACH,
  climbPushL: CLIMB_PUSH,
  climbReachR: mirror(CLIMB_REACH),
  climbPushR: mirror(CLIMB_PUSH),
  // Top rung: up on the toes, both hands at the case.
  grabReach: P({
    spine: [-6, 0, 0], spine1: [-4, 0, 0], neck: [-30, 0, 0],
    ...arm('l', -168, 8, 12), ...arm('r', -172, 8, 8),
    ...leg('l', -6, 6, 10, 12), ...leg('r', -6, 6, 10, 12),
  }),
  caseChest: P({
    spine: [4, 0, 0], neck: [-6, 0, 0],
    ...arm('l', -70, 4, 110, 60), ...arm('r', -75, 4, 105, 60),
    ...leg('l', -10, 6, 14), ...leg('r', -10, 6, 14),
  }),
  caseRaise: P({
    spine: [-10, 0, 0], spine1: [-6, 0, 0], neck: [-20, 0, 0],
    ...arm('r', -175, 10, 10), ...arm('l', -30, 70, 40),
    ...leg('l', -4, 6, 6), ...leg('r', -4, 6, 6),
  }),
  fallFlail: P({
    spine: [-18, 0, 0], neck: [-20, 0, 0],
    ...arm('l', -150, 60, 30), ...arm('r', -140, 55, 35),
    ...leg('l', -40, 10, 50), ...leg('r', -15, 10, 30),
  }),
  // Setting the ladder up: heave it up, then plant it.
  setLift: P({
    spine: [-8, 0, 0], neck: [-14, 0, 0],
    ...arm('l', -135, 14, 35), ...arm('r', -130, 14, 35),
    ...leg('l', -20, 8, 26, -6), ...leg('r', 8, 8, 14, -8),
  }),
  setPlant: P({
    spine: [22, 0, 0], neck: [-16, 0, 0],
    ...arm('l', -72, 14, 20), ...arm('r', -70, 14, 20),
    ...leg('l', -34, 8, 40, -10), ...leg('r', 18, 8, 12, -12),
  }),
  shoveLoad: P({
    spine: [-6, 0, 0], neck: [-8, 0, 0],
    ...arm('l', -70, 20, 120, 20), ...arm('r', -70, 20, 120, 20),
    ...leg('l', -24, 8, 30, -6), ...leg('r', 10, 8, 16, -8),
  }),
  shovePush: P({
    spine: [22, 0, 0], neck: [-18, 0, 0],
    ...arm('l', -88, 12, 5), ...arm('r', -88, 12, 5),
    ...leg('l', -44, 8, 50, -10), ...leg('r', 26, 8, 6, -18),
  }),
  // Upper-body overlays while walking/idling (applied on top of the mixer, see mount.js).
  carryLadder: { spine: [6, -10, 0], ...arm('r', -20, 25, 60, 20), ...arm('l', -60, -10, 70, 50) },
  holdLadder: { spine: [18, 0, 0], neck: [-14, 0, 0], ...arm('l', -80, 16, 50), ...arm('r', -80, 16, 50) },
};

const LIE = -0.86;
const LEAN = [['x', 6]];
const k = (t, pose, p, r, ease = 'inOutSine') => ({ t, pose, p, r, ease });
const D2T = Math.tan(LADDER.TILT);

function climbStep(side, unit) {
  const dy = LADDER.RUNG * unit, dz = LADDER.RUNG * D2T * unit, S = side.toUpperCase();
  return {
    kind: 'solo', label: `Climb (${S})`, duration: 0.6,
    meta: { damage: 0, stamina: 5, range: 0, startup: 0 },
    track: [
      k(0, 'ladderStand', [0, 0, 0], LEAN),
      k(0.16, `climbReach${S}`, [0, 0.03 * unit, 0.01], LEAN, 'outCubic'),
      k(0.42, `climbPush${S}`, [0, dy * 0.85, dz * 0.85], LEAN, 'outCubic'),
      k(0.6, 'ladderStand', [0, dy, dz], LEAN, 'inOutSine'),
    ],
    events: [{ t: 0.42, type: 'camera', cue: 'thump' }],
    hold: true,
  };
}

// Knocked off rung `rung`: flail, fall backward, land flat on the back (ends where kipup starts).
export function fallMove(rung, unit) {
  const h = rung * LADDER.RUNG * unit, back = LADDER.FALL_BACK * unit;
  return {
    kind: 'solo', label: `Ladder fall (rung ${rung})`, duration: 1.25,
    meta: { damage: 18, stamina: 20, range: 0, startup: 0 },
    track: [
      k(0, 'ladderStand', [0, 0, 0], LEAN),
      k(0.15, 'fallFlail', [0, 0.05, -0.15], [['x', -25]], 'outQuad'),
      k(0.75, 'bumpAir', [0, -h * 0.6, -back * 0.7], [['x', -70]], 'inQuad'),
      k(1.0, 'lyingHurt', [0, -h + LIE, -back], [['x', -90]], 'inQuad'),
      k(1.12, 'lyingHurt', [0, -h + LIE + 0.07, -back], [['x', -90]], 'outQuad'),
      k(1.25, 'lyingHurt', [0, -h + LIE, -back], [['x', -90]], 'inQuad'),
    ],
    events: [{ t: 1.0, type: 'impact', damage: 18, cue: 'shake', hitstop: 0.09 }],
    hold: true,
  };
}

export function registerLadderMoves(unit = 1) {
  Object.assign(POSES, LADDER_POSES);
  MOVES.ladderClimbL = climbStep('l', unit);
  MOVES.ladderClimbR = climbStep('r', unit);
  for (let r = 0; r <= LADDER.TOP; r++) MOVES[`ladderFall${r}`] = fallMove(r, unit);
  MOVES.ladderGrab = {
    kind: 'solo', label: 'Briefcase grab', duration: 2.6,
    meta: { damage: 0, stamina: 0, range: 0, startup: 0 },
    track: [
      k(0, 'ladderStand', [0, 0, 0], LEAN),
      k(0.3, 'grabReach', [0, 0.12, 0.04], LEAN, 'outCubic'),
      k(0.42, 'grabReach', [0, 0.14, 0.04], LEAN),
      k(0.8, 'caseChest', [0, 0.02, 0], [], 'outCubic'),
      k(1.4, 'caseRaise', [0, 0.06, -0.04], [['x', -6]], 'outBack'),
      k(2.6, 'caseRaise', [0, 0.06, -0.04], [['x', -6]]),
    ],
    events: [{ t: 0.42, type: 'grab', cue: 'close', hitstop: 0.12 }, { t: 1.4, type: 'camera', cue: 'shake' }],
    hold: true,
  };
  MOVES.ladderSetup = {
    kind: 'solo', label: 'Set up ladder', duration: 0.9,
    meta: { damage: 0, stamina: 4, range: 0, startup: 0 },
    track: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.25, 'setLift', [0, -0.08, 0], [], 'outCubic'),
      k(0.55, 'setPlant', [0, -0.12, 0.1], [], 'inQuad'),
      k(0.9, 'stand', [0, 0, 0], [], 'outCubic'),
    ],
    events: [{ t: 0.55, type: 'camera', cue: 'thump' }],
    hold: false,
  };
  MOVES.ladderShove = {
    kind: 'solo', label: 'Ladder shove', duration: 0.7,
    meta: { damage: 0, stamina: 6, range: 0, startup: 0 },
    track: [
      k(0, 'stand', [0, 0, 0], []),
      k(0.2, 'shoveLoad', [0, -0.05, -0.08], [], 'outCubic'),
      k(0.32, 'shovePush', [0, -0.1, 0.18], [], 'inQuad'),
      k(0.7, 'stand', [0, 0, 0], [], 'outCubic'),
    ],
    events: [{ t: 0.32, type: 'camera', cue: 'thump' }],
    hold: false,
  };
  return MOVES;
}
