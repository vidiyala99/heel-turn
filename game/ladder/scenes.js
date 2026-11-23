// Deterministic ladder moments, shared by ladder.html (?scene=) and the Node check (verify-node.mjs).
// Each scene drives the real mount through act()/advance() and returns a camera { pos, target }.
import { LADDER, withLadder, withWrestler } from './state.js';

function stage(mode, fresh, aiAt) {
  let m = withLadder(fresh(), { state: 'standing', x: 0, z: 0, yaw: 0 });
  m = withWrestler(m, 'p1', { x: 0, z: 1.2, yaw: Math.PI });
  m = withWrestler(m, 'ai', aiAt);
  mode.setState(m);
  mode.advance(0.2);
}
const climbTo = (mode, rungs) => { for (let i = 0; i < rungs; i++) { mode.act('p1', 'climb'); mode.advance(0.62); } };

export const SCENES = {
  climb(mode, fresh, matY) {
    stage(mode, fresh, { x: 1.7, z: -1.3, yaw: -2.3 });
    climbTo(mode, 4);
    mode.act('p1', 'climb'); mode.advance(0.3); // mid-step onto rung 5
    return { pos: [4.6, matY + 2.3, 5.0], target: [0, matY + 1.9, 0.4] };
  },
  betray(mode, fresh, matY) {
    stage(mode, fresh, { x: 0.3, z: -1.1, yaw: 0 }); // within LADDER.REACH so it can hold
    climbTo(mode, 1);
    mode.act('ai', 'hold'); mode.advance(0.3);
    climbTo(mode, 4);
    mode.act('ai', 'betray_shove'); mode.advance(0.75); // shove lands at 0.3 s: ladder and climber mid-fall
    return { pos: [6.2, matY + 2.2, 2.6], target: [0, matY + 1.3, 0.7] };
  },
  grab(mode, fresh, matY) {
    stage(mode, fresh, { x: 1.6, z: -1.4, yaw: -2.6 });
    climbTo(mode, LADDER.TOP);
    mode.act('p1', 'grab'); mode.advance(1.7);
    return { pos: [3.8, matY + 3.0, 6.4], target: [0, matY + 3.3, 0.3] };
  },
};
