// CPU wrestler behavior: an explicit state machine with steering, run every sim step. The LLM plan never moves a
// limb: it sets the attitude (weights) and which habit to expect; this layer turns that into continuous movement.
//
// brain = { state, t, dir, rng, feint }   attitude = { aggression, caution, showboat, scheme } in 0..1
// States: stalk (circle at range with footwork) -> close (pursue) -> attack (one move) -> stalk
//         react (0.4 s block / cut-off strike on a read wind-up), punish (grapple a stunned foe),
//         reset (back off to the ropes, then come again), taunt (foe down or showboating), trash (point and talk).
// Randomness comes from brain.rng (seeded per match), so a server replay is deterministic.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// LLM intent -> attitude. Unknown or missing plan = a balanced brawler.
const ATTITUDE = {
  counter: { aggression: 0.75, caution: 0.35, showboat: 0.2, scheme: 0.2 },
  target: { aggression: 0.9, caution: 0.2, showboat: 0.2, scheme: 0.1 },
  pin: { aggression: 0.95, caution: 0.1, showboat: 0.1, scheme: 0.1 },
  toss: { aggression: 0.95, caution: 0.1, showboat: 0.2, scheme: 0.1 },
  taunt: { aggression: 0.5, caution: 0.3, showboat: 0.9, scheme: 0.2 },
  ally: { aggression: 0.4, caution: 0.7, showboat: 0.3, scheme: 0.3 },
  betray: { aggression: 0.7, caution: 0.4, showboat: 0.2, scheme: 0.9 },
  pressure: { aggression: 0.7, caution: 0.3, showboat: 0.3, scheme: 0.2 },
};
export const attitudeFor = (intent) => ATTITUDE[intent] || ATTITUDE.pressure;

const TRASH = {
  vex: ['Look at the lights, look at ME!', 'You came to the wrong show.', 'Smile, you are on my highlight reel.'],
  kane: ['KANE SMASH.', 'Get up so I can put you down.', 'You hit like a fan.'],
  silas: ['Everyone has a price. Yours is low.', 'I already know your next move.', 'Trust me. That is your first mistake.'],
  mae: ['I was winning belts before you could walk.', 'Slow down, kid. Old Iron sets the pace.', 'Seen that move a thousand times.'],
};

const COUNTER = { strike: 'block', grapple: 'strike', block: 'grapple' };
const STALK_R = 1.9, ATTACK_R = 1.15;

export function newBrain(seed) {
  const rng = mulberry32(seed);
  return { state: 'stalk', t: 0, dir: rng() < 0.5 ? 1 : -1, rng, feint: 0, said: -99, lastMove: 0 };
}

// api: { act, block, tryPin, step (move toward x,z at speed), dist, busy, near ropes, say (caption) }
// api.foe / api.intent (optional): the wrestler to fight and this wrestler's own plan intent, for N-wrestler rings
// (shared/royal.js). Without them it is the 1v1 rival and the match-wide plan.
export function think(m, i, dt, api) {
  const me = m.w[i], you = api.foe || m.w[1 - i];
  const b = me.brain || (me.brain = newBrain((m.seed || 1) + i * 7919));
  const att = attitudeFor(api.intent || m.extPlan?.intent || m.aiIntent?.split('_')[0] || 'pressure');
  const expect = m.aiIntent?.startsWith('counter_') ? m.aiIntent.slice(8) : null;
  const r = b.rng, d = api.dist(me, you);
  b.t += dt;
  const go = (s) => { b.state = s; b.t = 0; };

  // Interrupts first: a read on the human's wind-up beats whatever we were doing.
  if (you.state === 'wind' && d < 1.8 && !b.read) {
    b.read = true;
    if (you.move === 'strike' && r() < (expect === 'strike' ? 0.85 : 0.45)) { api.block(0.4); return go('react'); }
    if (you.move !== 'strike' && r() < 0.7) { api.act('strike'); return go('react'); }
  }
  if (you.state !== 'wind') b.read = false;
  if (api.busy(me)) return;
  if (you.state === 'stun' && d < 1.35 && r() < dt * 8) { api.act('grapple'); return go('punish'); }
  if (you.state === 'down') {
    // one cover, then make them earn it: after a kickout, work the crowd before covering again
    if (m.clock - (b.pinAt ?? -99) > 4 && api.tryPin()) { b.pinAt = m.clock; return go('stalk'); }
    if (d > 1.3) return api.step(you.x, you.z, 2.4);
    if (b.state !== 'taunt' && r() < dt * (0.6 + att.showboat)) { api.act('taunt'); return go('taunt'); }
    return orbit(b, me, you, dt, api, 1.2, 1.2);
  }

  switch (b.state) {
    case 'react': case 'punish': case 'attack': case 'taunt':
      return go(r() < 0.25 + att.caution * 0.3 ? 'reset' : 'stalk');
    case 'trash':
      orbit(b, me, you, dt, api, STALK_R + 0.4, 0.8);
      if (b.t > 0.9) go('stalk');
      return;
    case 'reset': {
      // back off toward the nearest ropes, then come again
      const ax = Math.abs(me.x) > Math.abs(me.z) ? 'x' : 'z';
      const tx = ax === 'x' ? Math.sign(me.x || 1) * 2.5 : me.x, tz = ax === 'z' ? Math.sign(me.z || 1) * 2.5 : me.z;
      api.step(tx, tz, 2.0);
      if (b.t > 0.7 + r() * 0.5) go('close');
      return;
    }
    case 'close':
      if (d <= ATTACK_R) return go('attack-ready');
      return api.step(you.x, you.z, 2.6);
    case 'attack-ready': {
      if (d > ATTACK_R + 0.25) return go('close');
      const pick = attackFor(expect, me, r);
      if (pick === 'feint') { b.feint++; api.block(0.25); return go('stalk'); } // fake, then circle back out
      api.act(pick); b.lastMove = m.clock; return go('attack');
    }
    default: { // stalk: circle at range with footwork; decide when to step in
      orbit(b, me, you, dt, api, STALK_R, 1.6);
      const urge = dt * (0.6 + att.aggression * 2.2);
      if (b.t > 0.35 && r() < urge) return go('close');
      if (b.t > 0.6 && r() < dt * att.showboat * 0.5 && m.clock - b.said > 6) {
        b.said = m.clock; api.say(pickLine(me.id, r)); api.act('taunt'); return go('trash');
      }
      if (r() < dt * 0.4) b.dir = -b.dir; // change direction now and then
    }
  }
}

function attackFor(expect, me, r) {
  if (me.mo >= 100) return 'grapple'; // finisher
  const x = r();
  if (expect === 'block') return x < 0.75 ? 'grapple' : 'strike';      // a blocker eats grapples
  if (expect === 'grapple') return x < 0.75 ? 'strike' : 'grapple';    // a grappler eats strikes
  if (expect === 'strike') return x < 0.3 ? 'feint' : x < 0.75 ? 'grapple' : 'strike'; // bait the striker
  return x < 0.12 ? 'feint' : x < 0.6 ? 'strike' : 'grapple';
}

// Circle the opponent at radius rad (tangential footwork plus a radial spring).
function orbit(b, me, you, dt, api, rad, speed) {
  const dx = me.x - you.x, dz = me.z - you.z, d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;
  const radial = (rad - d) * 1.5;
  let tx = me.x + (-uz * b.dir * speed + ux * radial) * 0.5, tz = me.z + (ux * b.dir * speed + uz * radial) * 0.5;
  if (Math.max(Math.abs(tx), Math.abs(tz)) > 2.7) { b.dir = -b.dir; tx = me.x - ux * 0.3; tz = me.z - uz * 0.3; }
  api.step(tx, tz, speed, you);
}

function pickLine(id, r) {
  const lines = TRASH[id] || TRASH.kane;
  return lines[Math.floor(r() * lines.length)];
}

export const counterOf = (move) => COUNTER[move];
