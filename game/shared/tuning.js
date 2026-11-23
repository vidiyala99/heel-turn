// HEEL TURN feel tuning: every number that sets how the match feels, in one place.
// `sim` is gameplay timing: shared/sim.js and shared/drama.js read it on the client AND the arena server,
// so online and exhibition matches play the same. `view` is client-only (camera, FX, audio, slow-mo).
// Frames below are at 60 fps (1 frame = 16.7 ms).

export const T = {
  sim: {
    walk: 4.2,            // m/s (was 2.8)
    run: 6.6,             // m/s while Shift is held or after a double-tapped direction
    aiSpeedScale: 1.5,    // the AI's approach speed (2.4 m/s base) scales with the player's
    moves: {
      strike: { wind: 0.11, active: 0.06, rec: 0.18, stam: 9 },   // 7f startup (was 13f), 21f total (was 39f)
      grapple: { wind: 0.28, active: 0.08, rec: 0.26, stam: 14 }, // was 0.42 / 0.12 / 0.35
    },
    hitstop: { strike: 0.075, block: 0.05, slam: 0.11, finisher: 0.16, clothesline: 0.12 }, // seconds the sim freezes
    // Irish whip: send the rival into the ropes, they rebound, meet them with a strike for a clothesline.
    whip: { range: 1.6, speed: 7.0, stam: 10, rec: 0.25, reboundT: 1.1, clothesDmg: 14 },
    // Crowd heat per wrestler, 0-100: taunts, big moves and kickouts build it; it cools over time.
    heat: { taunt: 26, strike: 3, slam: 8, finisher: 25, kickout: 14, nearFall: 22, whip: 4, decay: 1.6 },
    // Fired up: low HP plus a hot crowd. No-sells one strike, moves faster, for `secs`.
    fired: { hp: 40, heat: 60, secs: 7, speed: 1.3, heatCost: 35 },
    // Pin: seconds per count; an AI victim that kicks out late does it at `nearFallAt` counts (2.9).
    pin: { count: 0.85, nearFallAt: 2.9, earlyKickHp: 55, keepFightingHp: 12 },
  },
  view: {
    locomotionFade: 0.08,   // s crossfade into walk/run/idle clips (was 0.15)
    jabSpeed: 1.5,          // jab clip plays faster so its impact pose lines up with the 7f startup
    hitReactSpeed: 1.4,
    slowmo: { nearFall: 0.3, finisher: 0.35, finisherSecs: 1.1 }, // time scale and real seconds
    shake: { strike: 0.28, block: 0.15, slam: 0.55, finisher: 0.9, whip: 0.2 },  // camera trauma 0-1
    punchIn: { strike: 0.12, slam: 0.28, finisher: 0.45 },                         // fraction toward the action
    fovKick: { strike: 1.5, slam: 3.5, finisher: 6 },                              // degrees
    flash: { finisher: 0.85, nearFall: 0.25 },
    letterbox: 0.11,        // bar height, fraction of the viewport
  },
};
