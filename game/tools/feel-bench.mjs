// Feel bench: measures the sim's responsiveness numbers headlessly at 60 fps.
// Usage: node game/tools/feel-bench.mjs [path/to/sim.js]   (default: game/shared/sim.js)
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const simPath = path.resolve(process.argv[2] || new URL('../shared/sim.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const { createMatch, step, newControl } = await import(pathToFileURL(simPath).href);
const DT = 1 / 60;

function fresh() {
  const m = createMatch('vex', 'kane');
  const ctl = [newControl(true), newControl(true)]; // both human: no AI noise
  for (let i = 0; i < 400 && m.introT > 0; i++) step(m, DT, ctl);
  m.events = [];
  return { m, ctl };
}
const frames = (m, ctl, until, max = 300) => { for (let f = 1; f <= max; f++) { step(m, DT, ctl); if (until(m)) return f; } return NaN; };
const frozenFrames = (m) => m.freeze ? Math.round(m.freeze / DT) : 0;

const out = {};
{ // walk + run speed, input-to-motion frames
  const { m, ctl } = fresh(); const w = m.w[0]; w.x = -2; w.z = 2;
  const x0 = w.x; ctl[0].mx = 1;
  out.inputToMotionFrames = frames(m, ctl, () => w.x !== x0);
  const xa = w.x; for (let f = 0; f < 30; f++) step(m, DT, ctl);
  out.walkSpeed = +((w.x - xa) / (30 * DT)).toFixed(2);
  ctl[0].run = true; w.x = -2; const xb = w.x; for (let f = 0; f < 20; f++) step(m, DT, ctl);
  const rs = (w.x - xb) / (20 * DT); out.runSpeed = Math.abs(rs - out.walkSpeed) > 0.05 ? +rs.toFixed(2) : 'none (same as walk)';
}
{ // strike: startup = input -> active (hit resolves); total = input -> idle again
  const { m, ctl } = fresh(); const [a, d] = m.w; a.x = -0.5; d.x = 0.5; a.z = d.z = 0;
  ctl[0].queue.push('strike');
  out.strikeStartupFrames = frames(m, ctl, () => a.state === 'active');
  let hs = 0; for (const e of m.events) if (e.k === 'impact') hs = e.hitstop;
  out.strikeHitstopMs = hs ? Math.round(hs * 1000) : 0;
  out.strikeTotalFrames = out.strikeStartupFrames + frames(m, ctl, () => a.state === 'idle');
}
{ // grapple startup and slam hitstop
  const { m, ctl } = fresh(); const [a, d] = m.w; a.x = -0.5; d.x = 0.5;
  ctl[0].queue.push('grapple');
  out.grappleStartupFrames = frames(m, ctl, () => d.state === 'thrown');
  frames(m, ctl, () => d.state === 'down'); step(m, DT, ctl);
  let hs = 0; for (const e of m.events) if (e.k === 'impact') hs = Math.max(hs, e.hitstop || 0);
  out.slamHitstopMs = hs ? Math.round(hs * 1000) : 0;
}
{ // pin: seconds per count
  const { m, ctl } = fresh(); const [a, d] = m.w; a.x = -0.5; d.x = 0.5; d.hp = 5;
  ctl[0].queue.push('grapple'); frames(m, ctl, () => d.state === 'down');
  a.x = d.x - 0.9; a.z = d.z; ctl[0].queue.push('grapple'); step(m, DT, ctl);
  const f = frames(m, ctl, () => m.over, 600);
  out.pinToThreeSecs = +(f * DT).toFixed(2);
}
{ // Irish whip: frames until the rival bounces off the ropes, then a timed strike for the clothesline
  const { m, ctl } = fresh(); const [a, d] = m.w; a.x = -0.4; d.x = 0.4; a.z = d.z = 0;
  ctl[0].queue.push('whip');
  out.whipToRopesFrames = frames(m, ctl, () => d.state === 'rebound');
  frames(m, ctl, () => Math.hypot(a.x - d.x, a.z - d.z) < 2.3, 120); ctl[0].queue.push('strike');
  frames(m, ctl, () => d.state === 'down' || d.state === 'idle', 200);
  out.whipClothesline = d.state === 'down' ? `down, hp ${d.hp}` : `missed (${d.state})`;
}
{ // near-fall: hurt AI victim kicks out at ~2.9
  const res = [];
  for (let k = 0; k < 200; k++) {
    // The victim stays inert (human, no input) through the slam, so the AI's state machine cannot cut the grapple
    // off and pin the player instead; it turns AI (kickout logic) while down, before the cover.
    const { m, ctl } = fresh(); const [a, d] = m.w; a.x = -0.5; d.x = 0.5; d.hp = 45;
    ctl[0].queue.push('grapple'); frames(m, ctl, () => d.state === 'down');
    ctl[1].human = false;
    a.x = d.x - 0.9; a.z = d.z; ctl[0].queue.push('grapple'); step(m, DT, ctl);
    if (m.pin?.victim !== 1) { res.push('nopin'); continue; }
    frames(m, ctl, () => !m.pin, 600);
    const nf = m.events.find((e) => e.k === 'nearfall'); res.push(nf ? nf.at : m.over ? 3 : 'early');
  }
  out.nearFallKickoutCounts_hp45 = res.slice(0, 20).join(' ');
  const kicks = res.filter((r) => typeof r === 'number' && r < 3);
  out.nearFallKickoutRate_hp45 = `${Math.round(kicks.length / res.length * 100)}% of ${res.length} pins, at ${Math.min(...kicks)}-${Math.max(...kicks)}`;
}
console.log(JSON.stringify(out, null, 1));
