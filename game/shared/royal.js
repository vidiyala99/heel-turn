// OVER THE TOP: the battle royal. Pure data like sim.js (no three.js), so the arena server runs it too.
// Up to 5 wrestlers share one ring (1 or 2 humans + AIs); the rest enter on a timer (runtime entrants); the only way
// out is the over-the-top-rope toss; last one standing wins. The 1v1 sim (shared/sim.js) is untouched by this file.
//
// Match:     { mode: 'royal', w: [Wrestler], over, winner, how, introT, clock, events, alliance, betray, proposals,
//              lou: { awayT, briber, lowBlow }, mem, order (elimination order), nextEntryT }
// Wrestler:  sim.js's wrestler plus { slot, human, foe (slot it fights), intent, entered, out }.
//            state 'waiting' = not in the ring yet (the renderer hides it).
// Proposal:  { id, kind: 'betray'|'bribe', by, on (slots), reason, cites, status: pending|approved|blocked|lapsed,
//              at (clock), bandId (the agents server's proposal id when BAND made it) }
// Agent director: alliance -> two AIs share one target (the human). Nothing here schemes: a betrayal or a bribe only
// exists when the agents server's LLM plans one (adoptBand opens the proposal from its desk room); the commissioner
// approves or blocks; an approved turn ends in a forced toss of the partner, an approved envelope turns Lou's back.
// Events (besides sim.js's): agent {row}, alliance {a, b, target}, entrant {slot}, eliminated {slot, by},
//   betrayal {by, on}, verdict {id, kind, decision, bandId}, bribe {decision}.
import { T } from './tuning.js';
import { ROSTER, RING, MAT_Y, INTRO_SECS, short as fullShort } from './sim.js';
import { think } from './ai.js';
import { onHit, impact, moveSpeed } from './drama.js';

export const ROYAL_EXTRA = { riot: { name: 'Kid Riot', tint: 0xf59e0b } }; // the fifth body for a full card
const CAST = { ...ROSTER, ...ROYAL_EXTRA };
const CALL = { vex: 'Vex', kane: 'Kane', silas: 'Crane', mae: 'Mae', riot: 'Riot' }; // what the booth calls them
const short = (w) => CALL[w.id] || fullShort(w);
export const R = {
  max: 5, startAi: 2, entryEvery: 5, tossHp: 40, spentHp: 15, lapse: 20, awaySecs: 10, foeEvery: 1.2,
};
const AI_ORDER = ['silas', 'vex', 'mae', 'kane', 'riot'];
const MOVES = T.sim.moves;
const BUSY = ['wind', 'active', 'rec', 'stun', 'down', 'thrown', 'taunt', 'out', 'intro', 'waiting'];

// Stub Bruin rows (agents/fixtures/marts.json) until the client passes the live marts in createRoyal({ mem }).
export const STUB_MEM = {
  relationships: [
    { a: 'silas', b: 'vex', trust: 0.3, grudge: 0.7, last_betrayal: "m12: vex stole silas's pin" },
    { a: 'vex', b: 'silas', trust: 0.6, grudge: 0.1 },
    { a: 'mae', b: 'silas', trust: 0.2, grudge: 0.8, last_betrayal: 'm9: silas low-blowed mae behind lou' },
    { a: 'kane', b: 'mae', trust: 0.8, grudge: 0 }, { a: 'mae', b: 'kane', trust: 0.75, grudge: 0 },
  ],
  ref_ledger: [
    { ref: 'lou', match: 'm10', bribe_from: 'silas', accepted: true, caught: false },
    { ref: 'lou', match: 'm11', bribe_from: 'vex', accepted: true, caught: true },
    { ref: 'lou', match: 'm12', bribe_from: 'silas', accepted: false, caught: false },
  ],
};

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const emit = (m, e) => m.events.push(e);
const busy = (w) => BUSY.includes(w.state);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearRopes = (w) => Math.max(Math.abs(w.x), Math.abs(w.z)) > RING - 0.9;
const live = (w) => w && w.entered && !w.out && w.state !== 'thrown';
function anim(w, name, speed = 1) {
  if (w.anim === name) { w.animSpeed = speed; return; }
  w.anim = name; w.animSpeed = speed; w.animSeq++;
}
const fact = (m, kind, actor, target, extra = {}) =>
  m.events.push({ k: 'fact', t_ms: Math.round(m.clock * 1000), kind, actor, target, situation: 'opening', ...extra });
const agent = (m, row, src = 'BAND') => emit(m, { k: 'agent', src, row: { t_ms: Math.round(m.clock * 1000), ...row } });

export function rel(m, a, b) {
  const r = (m.mem.relationships || []).find((x) => x.a === a && x.b === b);
  const schemer = a === 'silas';
  const row = r || { a, b, trust: schemer ? 0.4 : 0.5, grudge: schemer ? 0.5 : 0.2 };
  return { ...row, cite: `relationships.${a}>${b}${r ? '' : ' (default)'} trust ${row.trust} grudge ${row.grudge}` };
}
function makeW(id, slot, human) {
  const r = CAST[id] || CAST.vex;
  return {
    id: CAST[id] ? id : 'vex', name: r.name, tint: r.tint, slot, human,
    x: 0, y: MAT_Y, z: -RING - 3, vx: 0, vz: 0, facing: 0, rotX: 0,
    hp: 100, st: 100, mo: 0, state: 'waiting', t: 0, move: null, out: false, entered: false, autoBlock: false, arc: null,
    foe: -1, foeT: 0, intent: 'pressure', anim: 'Idle', animSpeed: 1, animSeq: 0,
    stats: { strikes: 0, grapples: 0, blocks: 0, reversals: 0 },
  };
}
const SPOTS = [[-1.7, 1.2], [1.7, 1.2], [0, -1.6], [-1.6, -1.4], [1.6, -1.4]];

// humans: roster ids for slots 0 (and 1). The AIs fill the card to R.max in AI_ORDER (skipping the humans' picks).
export function createRoyal({ humans = ['kane'], mem = null, seed } = {}) {
  const hs = humans.filter(Boolean).slice(0, 2);
  const ais = AI_ORDER.filter((id) => !hs.includes(id)).slice(0, R.max - hs.length);
  const m = {
    mode: 'royal', w: [...hs.map((id, i) => makeW(id, i, true)), ...ais.map((id, k) => makeW(id, hs.length + k, false))],
    over: false, winner: -1, how: null, pin: null, introT: INTRO_SECS, events: [], clock: 0, freeze: 0,
    seed: seed ?? ((Date.now() % 100000) + 1), habits: null, aiPlansLog: [],
    mem: mem || STUB_MEM, alliance: null, allianceDone: false, betray: null, proposals: [],
    lou: { awayT: 0, briber: -1, lowBlow: false }, order: [], nextEntryT: R.entryEvery, ext: {},
  };
  const first = hs.length + R.startAi;
  m.w.forEach((w, i) => { if (i < first) enter(m, i, false); });
  emit(m, { k: 'call', text: `OVER THE TOP! ${m.w.length} wrestlers, one ring. Over the top rope and you are gone.` });
  return m;
}

function enter(m, i, runtime) {
  const w = m.w[i], [x, z] = SPOTS[i % SPOTS.length];
  w.entered = true; w.state = runtime ? 'intro' : 'intro'; w.t = runtime ? 0.9 : 0;
  w.x = runtime ? Math.sign(x || 1) * (RING - 0.5) : x; w.z = runtime ? z : z; w.y = MAT_Y;
  w.facing = Math.atan2(-w.x, -w.z); anim(w, runtime ? 'Running' : 'Idle', 1.2);
  if (runtime) {
    fact(m, 'entry', i, null);
    emit(m, { k: 'entrant', slot: i });
    emit(m, { k: 'banner', text: `NEW ENTRANT: ${short(w).toUpperCase()}`, secs: 1.6 });
    emit(m, { k: 'call', text: `Here comes ${w.name}! A new entrant hits the ring!` });
    agent(m, { wrestler: 'lou', intent: 'entrant', target: w.id, reason: `runtime entrant: band_add_participant(${w.id}) into the ring room`, cites: [] });
  }
}

// ---------- the agent director (alliances, betrayal, bribe) ----------
const aiIn = (m) => m.w.filter((w) => !w.human && live(w));
function director(m, dt) {
  // runtime entrants
  const waiting = m.w.filter((w) => !w.entered);
  if (waiting.length) {
    m.nextEntryT -= dt;
    if (m.nextEntryT <= 0) { enter(m, waiting[0].slot, true); m.nextEntryT = R.entryEvery; }
  }
  const humans = m.w.filter((w) => w.human && live(w));
  // alliance: the schemer (or first AI) offers; the AI that trusts it most accepts; both go after a human
  if (!m.alliance && !m.allianceDone && humans.length && m.clock > 1.5) {
    const ais = aiIn(m), off = ais.find((w) => w.id === 'silas') || ais[0];
    const cands = ais.filter((w) => w !== off).map((w) => ({ w, r: rel(m, w.id, off.id) })).sort((a, b) => b.r.trust - a.r.trust);
    if (off && cands.length && cands[0].r.trust >= 0.5) {
      const p = cands[0].w, tgt = humans.sort((a, b) => a.hp - b.hp)[0];
      m.alliance = { a: off.slot, b: p.slot, target: tgt.slot, since: m.clock };
      m.allianceDone = true;
      off.intent = p.intent = 'target';
      off.foe = p.foe = tgt.slot;
      fact(m, 'alliance', off.slot, p.slot);
      emit(m, { k: 'alliance', a: off.slot, b: p.slot, target: tgt.slot });
      emit(m, { k: 'call', text: `${short(off)} and ${short(p)} are working together! Both of them are going after ${short(tgt)}!` });
      agent(m, { wrestler: off.id, intent: 'ally', target: p.id, reason: `offers an alliance in a private locker room: "we take out ${short(tgt)} first"`, cites: [] });
      agent(m, { wrestler: p.id, intent: 'ally', target: off.id, reason: `ACCEPTS: trusts ${short(off)} ${cands[0].r.trust}; shared target ${short(tgt)}`, cites: [cands[0].r.cite] });
    }
  }
  const al = m.alliance;
  if (al) {
    const A = m.w[al.a], B = m.w[al.b], tgt = m.w[al.target];
    if (A.out || B.out) { m.alliance = null; }
    else if (!m.w.some((w) => !w.out && w !== A && w !== B)) { // only the partners are left: it is every man for himself
      m.alliance = null; A.intent = B.intent = 'pressure';
      emit(m, { k: 'call', text: `It's down to the two partners! ${short(A)} and ${short(B)} square up!` });
    }
    else {
      if (!live(tgt)) { // the shared target is gone: pick the next human, or the alliance is all that is left
        const next = humans[0];
        if (next) { al.target = next.slot; if (A.intent !== 'betray') A.foe = next.slot; B.foe = next.slot; }
      }
    }
  }
  // betrayal under way: give it 20 s, then it fizzles
  if (m.betray && m.betray.status === 'executing') {
    m.betray.t += dt;
    const by = m.w[m.betray.by], on = m.w[m.betray.on];
    if (by.out || on.out || m.betray.t > 20) { m.betray.status = 'fizzled'; if (!by.out) by.intent = 'pressure'; }
    else { by.foe = on.slot; by.intent = 'betray'; }
  }
  if (m.lou.awayT > 0) {
    m.lou.awayT = Math.max(0, m.lou.awayT - dt);
    if (!m.lou.awayT) { emit(m, { k: 'call', text: 'Lou turns back around like nothing happened.' }); }
  }
  for (const p of m.proposals) if (p.status === 'pending' && m.clock - p.at > R.lapse) verdict(m, p.id, 'block', 'lapsed');
}

function propose(m, kind, by, on, reason, cites, bandId = null) {
  const id = bandId || `${kind}-${m.proposals.length + 1}`;
  const p = { id, kind, by, on, reason, cites, status: 'pending', at: m.clock, bandId };
  m.proposals.push(p);
  const w = m.w[by];
  agent(m, { wrestler: kind === 'bribe' ? 'lou' : w.id, intent: kind === 'bribe' ? 'bribe_accept' : 'betray', target: kind === 'bribe' ? w.id : m.w[on].id, reason: `${reason}. Waiting on the commissioner.`, cites }, kind === 'bribe' ? 'REF' : 'BAND');
  emit(m, { k: 'proposal', id, kind });
  return p;
}

// The agents server's pending proposals (BAND desk room): each is a scheme an agent's LLM chose (a betrayal, or an
// envelope Lou's LLM accepted). Open it here under BAND's id so the commissioner card shows it with the LLM's reason.
export function adoptBand(m, pending) {
  for (const bp of pending || []) {
    const kind = bp.kind, plan = bp.plan || {};
    if (m.proposals.some((p) => p.bandId === bp.id)) continue;
    const by = m.w.find((w) => w.id === bp.proposer && !w.human && live(w));
    if (!by || m.proposals.some((p) => p.kind === kind && p.by === by.slot)) continue;
    if (kind === 'betray' && !m.betray) {
      const on = m.w.find((w) => w.id === (plan.target === 'brutus' ? 'kane' : plan.target) && live(w));
      if (on && on !== by) propose(m, 'betray', by.slot, on.slot, plan.reason || 'the LLM plans a turn', plan.cites || [], bp.id);
    }
    if (kind === 'bribe') propose(m, 'bribe', by.slot, -1, plan.reason || 'Lou took the envelope', plan.cites || [], bp.id);
  }
}

// The commissioner's call. decision: 'approve' | 'block'. why: 'lapsed' when nobody ruled in time.
export function verdict(m, id, decision, why = '') {
  const p = m.proposals.find((x) => x.id === id && x.status === 'pending');
  if (!p || m.over) return false;
  const ok = decision === 'approve';
  p.status = why === 'lapsed' ? 'lapsed' : ok ? 'approved' : 'blocked';
  const by = m.w[p.by];
  emit(m, { k: 'verdict', id: p.id, kind: p.kind, decision: ok ? 'approve' : 'block', bandId: p.bandId, lapsed: why === 'lapsed' });
  const who = why === 'lapsed' ? 'nobody (lapsed)' : 'commissioner';
  if (p.kind === 'betray') {
    const on = m.w[p.on];
    agent(m, { wrestler: by.id, intent: 'betray', target: on.id, reason: ok ? `${short(by)} turns on ${short(on)}` : `${short(by)} stays with ${short(on)}, for now`, cites: p.cites, [ok ? 'approved_by' : 'vetoed_by']: who });
    if (ok && !by.out && !on.out) {
      m.betray = { by: p.by, on: p.on, status: 'executing', t: 0 };
      by.foe = p.on; by.intent = 'betray';
      emit(m, { k: 'call', text: `Wait... ${short(by)} is looking at ${short(on)}, not the target. Oh no.` });
    } else emit(m, { k: 'call', text: `${short(by)} thinks about it... and keeps working with ${short(on)}.` });
  } else {
    agent(m, { wrestler: 'lou', intent: ok ? 'bribe_accept' : 'bribe_decline', target: by.id, reason: ok ? 'pockets the envelope and looks away for 10 seconds' : 'refuses the envelope and calls it out in front of everyone', cites: p.cites, [ok ? 'approved_by' : 'vetoed_by']: who }, 'REF');
    emit(m, { k: 'bribe', decision: ok ? 'accept' : 'decline' });
    if (ok) {
      m.lou.awayT = R.awaySecs; m.lou.briber = p.by; m.lou.lowBlow = true;
      emit(m, { k: 'banner', text: 'LOU LOOKS AWAY', secs: 1.6 });
      emit(m, { k: 'call', text: `Lou Varga turns his back! ${short(by)} has a free hand for ten seconds!` });
    } else {
      emit(m, { k: 'banner', text: 'LOU SAYS NO!', secs: 1.6 });
      emit(m, { k: 'call', text: `Lou throws the envelope back at ${short(by)} and lays into him! ${short(by)} is stuck arguing!` });
      if (live(by)) { by.state = 'stun'; by.t = 2.5; by.mo = 0; anim(by, 'No', 1); by.heat = 0; }
    }
  }
  return true;
}

// ---------- fighting ----------
function pickFoe(m, i) {
  const me = m.w[i], al = m.alliance;
  if (m.betray?.status === 'executing' && m.betray.by === i) return m.betray.on;
  if (al && (al.a === i || al.b === i) && live(m.w[al.target])) return al.target;
  const ally = al && (al.a === i ? al.b : al.b === i ? al.a : -1);
  let best = -1, bs = Infinity;
  m.w.forEach((w, j) => {
    if (j === i || !live(w) || j === ally) return;
    const s = dist(me, w) + (w.human && !me.human ? -0.8 : 0) + (w.state === 'down' ? 3 : 0) + (j === me.foe ? -0.4 : 0);
    if (s < bs) { bs = s; best = j; }
  });
  return best;
}

function act(m, i, kind) {
  const w = m.w[i], opp = m.w[w.foe];
  if (busy(w) || !opp) return;
  if (kind === 'block') { w.state = 'block'; w.stats.blocks++; anim(w, 'No', 1.6); fact(m, 'block', i, w.foe); return; }
  if (kind === 'taunt') { w.state = 'taunt'; w.t = 1.2; anim(w, w.human ? 'Dance' : 'ThumbsUp', 1.4); fact(m, 'taunt', i, null); return; }
  if (kind === 'grapple' && w.mo >= 100 && dist(w, opp) < 1.6) kind = 'finisher';
  const mv = MOVES[kind === 'finisher' ? 'grapple' : kind];
  if (!mv || w.st < mv.stam * 0.5) return;
  if (kind === 'strike') w.stats.strikes++; else w.stats.grapples++;
  w.st -= mv.stam; w.state = 'wind'; w.move = kind; w.t = mv.wind;
  anim(w, kind === 'strike' ? 'Punch' : 'Jump', kind === 'strike' ? 2.4 : 1.8);
}

function resolve(m, att, def) {
  const kind = att.move, ai = att.slot, di = def?.slot, base = kind === 'finisher' ? 'grapple' : kind;
  const betrayal = m.betray?.status === 'executing' && m.betray.by === ai && m.betray.on === di;
  // the partner never sees it coming: the turn reaches a little further than a normal move
  const reach = betrayal ? 1.8 : kind === 'strike' ? 1.45 : 1.35;
  if (!def || !live(def) || dist(att, def) > reach) { if (def) fact(m, base, ai, di, { success: false }); return; }
  if (def.state === 'down') return;
  const shady = m.lou.awayT > 0 && m.lou.briber === ai;
  if (kind === 'strike') {
    if (def.state === 'block' && !betrayal) {
      def.st -= 6; def.stats.reversals++; att.state = 'stun'; att.t = 0.45; anim(att, 'No');
      fact(m, 'strike', ai, di, { success: false }); fact(m, 'reversal', di, ai); return;
    }
    fact(m, 'strike', ai, di, { success: true });
    if (shady && m.lou.lowBlow) {
      m.lou.lowBlow = false;
      hit(m, def, 18, att); def.t = 1.4;
      emit(m, { k: 'banner', text: 'LOW BLOW!', secs: 1.1 });
      emit(m, { k: 'call', text: `LOW BLOW by ${short(att)}! Lou didn't see a thing!` });
    } else hit(m, def, betrayal ? 12 : 8, att);
    if (betrayal && !m.betray.cheap) { m.betray.cheap = true; emit(m, { k: 'call', text: `${short(att)} cheap-shots his own partner ${short(def)}!` }); }
    att.mo = Math.min(100, att.mo + 12);
    return;
  }
  const fin = kind === 'finisher';
  // a spent wrestler (hp under R.spentHp) goes over from anywhere: no two-man stalemates at 0 hp mid-ring
  const forced = betrayal || (shady && nearRopes(def)) || def.hp < R.spentHp;
  const toss = forced || (nearRopes(def) && def.hp < R.tossHp);
  att.mo = fin ? 0 : Math.min(100, att.mo + 18);
  fact(m, 'grapple', ai, di, { success: true, ...(fin ? { finisher: true } : {}) });
  throwW(m, def, att, fin ? 28 : 15, toss, forced);
  if (betrayal) {
    m.betray.status = 'done';
    m.alliance = null;
    def.foe = ai; def.intent = 'target';
    att.intent = 'pressure';
    fact(m, 'betray', ai, di);
    emit(m, { k: 'betrayal', by: ai, on: di });
    emit(m, { k: 'banner', text: 'HEEL TURN!', secs: 2.2 });
    emit(m, { k: 'finisher' });
    emit(m, { k: 'call', text: `${short(att).toUpperCase()} TURNS ON ${short(def).toUpperCase()}! He throws his own partner OVER THE TOP!` });
  } else if (fin) { emit(m, { k: 'banner', text: 'FINISHER!', secs: 1.4 }); emit(m, { k: 'finisher' }); }
  else if (toss) emit(m, { k: 'call', text: `${short(att)} launches ${short(def)} OVER THE TOP ROPE!` });
}

function hit(m, def, dmg, att) {
  if (onHit(m, def, dmg, att)) return;
  def.hp = Math.max(0, def.hp - dmg); def.state = 'stun'; def.t = 0.26; anim(def, 'No', 2);
  const ax = def.x - att.x, az = def.z - att.z, len = Math.hypot(ax, az) || 1;
  def.vx += (ax / len) * 3.2; def.vz += (az / len) * 3.2;
  def.mo = Math.min(100, def.mo + 4);
  emit(m, { k: 'shake', v: 0.12 });
  impact(m, def, att, 'strike', dmg);
}

function throwW(m, def, att, dmg, toss, forced) {
  def.hp = Math.max(0, def.hp - dmg); def.state = 'thrown'; def.t = 0;
  let dx = def.x - att.x, dz = def.z - att.z;
  if (forced) { if (Math.abs(def.x) >= Math.abs(def.z)) { dx = Math.sign(def.x || 1); dz = 0; } else { dx = 0; dz = Math.sign(def.z || 1); } }
  if (dx * dx + dz * dz < 0.01) { dx = 1; dz = 0; }
  const len = Math.hypot(dx, dz); dx /= len; dz /= len;
  const edge = forced ? RING - Math.abs(dx ? def.x : def.z) + 1.4 : 3.2;
  const reach = toss ? Math.max(3.2, edge) : 1.1;
  let tx = def.x + dx * reach, tz = def.z + dz * reach;
  if (!toss) { tx = clamp(tx, -RING + 0.4, RING - 0.4); tz = clamp(tz, -RING + 0.4, RING - 0.4); }
  def.arc = { fx: def.x, fy: def.y, fz: def.z, tx, tz, dur: toss ? 1.0 : 0.6, toss, dmg, by: att.slot };
  anim(def, 'Death', 1.6); emit(m, { k: 'shake', v: 0.35 });
}

function aiStep(m, i, dt) {
  const me = m.w[i];
  if (busy(me)) return;
  const foe = m.w[me.foe];
  if (!foe) { anim(me, 'Idle'); return; }
  // the turn: walk up behind the partner (who is busy with the shared target) and take him over the top
  if (m.betray?.status === 'executing' && m.betray.by === i && foe.slot === m.betray.on) {
    if (dist(me, foe) < 1.25 && !['down', 'thrown', 'out'].includes(foe.state)) return act(m, i, 'grapple');
    if (dist(me, foe) >= 1.25) return moveToward(me, foe.x, foe.z, dt, 2.6);
  }
  think(m, i, dt, {
    foe, intent: me.intent,
    act: (k) => act(m, i, k),
    block: (secs) => { if (busy(me)) return; me.state = 'block'; me.stats.blocks++; anim(me, 'No', 1.6); me.t = secs; me.autoBlock = true; },
    tryPin: () => false,
    step: (x, z, speed) => moveToward(me, x, z, dt, speed),
    dist, busy,
    say: (text) => emit(m, { k: 'call', text: `${short(me)}: "${text}"`, speaker: me.id, trash: true }),
  });
}
function moveToward(w, x, z, dt, speed) {
  const dx = x - w.x, dz = z - w.z, len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  speed *= T.sim.aiSpeedScale;
  w.x += (dx / len) * speed * dt; w.z += (dz / len) * speed * dt;
  w.facing = Math.atan2(dx, dz); anim(w, 'Walking', 1.3);
}

function handleInput(m, i, kind) {
  const w = m.w[i];
  if (m.over || m.introT > 0 || !live(w)) return;
  if (kind === 'blockUp') { if (w.state === 'block' && !w.autoBlock) w.state = 'idle'; return; }
  if (kind === 'whip') return; // no Irish whips in a crowded ring
  act(m, i, kind);
}

export function stepRoyal(m, dt, ctl) {
  if (m.freeze > 0) { m.freeze = Math.max(0, m.freeze - dt); return; }
  for (let i = 0; i < m.w.length; i++) { const c = ctl[i]; if (!c) continue; for (const k of c.queue) handleInput(m, i, k); c.queue.length = 0; }
  if (m.introT > 0) {
    m.introT -= dt;
    if (m.introT <= 0) {
      m.w.forEach((w, i) => { if (w.entered) { w.state = 'idle'; anim(w, 'Idle'); fact(m, 'entry', i, null); } });
      emit(m, { k: 'bell' }); emit(m, { k: 'banner', text: 'OVER THE TOP!', secs: 1.4 });
      emit(m, { k: 'call', text: 'The bell rings and it is every wrestler for themselves!' });
    }
    return;
  }
  if (m.over) return;
  m.clock += dt;
  director(m, dt);
  const before = m.w.map((w) => [w.x, w.z]);
  m.w.forEach((w, i) => {
    if (!w.entered || w.out) return;
    if ((w.foeT -= dt) <= 0 || !live(m.w[w.foe]) || w.human) { w.foe = pickFoe(m, i); w.foeT = R.foeEvery; }
    const c = ctl[i] || { human: false };
    if (w.human && c.human) {
      if (!busy(w) && w.state !== 'block') {
        const len = Math.hypot(c.mx, c.mz);
        if (len > 0) { const v = moveSpeed(w, c); w.x += (c.mx / len) * v * dt; w.z += (c.mz / len) * v * dt; w.facing = Math.atan2(c.mx, c.mz); anim(w, 'Running', v / 3.8); }
        else anim(w, 'Idle');
      }
    } else aiStep(m, i, dt);
  });
  m.w.forEach((w, i) => {
    if (!w.entered || w.state === 'out') return;
    const opp = m.w[w.foe];
    w.st = Math.min(100, w.st + dt * (w.state === 'idle' ? 10 : 4));
    w.x += w.vx * dt; w.z += w.vz * dt;
    const damp = Math.pow(0.02, dt); w.vx *= damp; w.vz *= damp;
    if (w.state === 'intro') { w.t -= dt; if (w.t <= 0) { w.state = 'idle'; anim(w, 'Idle'); } }
    else if (w.state === 'wind') { w.t -= dt; if (w.t <= 0) { w.state = 'active'; w.t = MOVES.strike.active; resolve(m, w, opp); } }
    else if (w.state === 'active') { w.t -= dt; if (w.t <= 0) { w.state = 'rec'; w.t = MOVES[w.move === 'finisher' ? 'grapple' : w.move].rec; } }
    else if (w.state === 'rec' || w.state === 'stun' || w.state === 'taunt') {
      w.t -= dt;
      if (w.state === 'taunt') w.mo = Math.min(100, w.mo + dt * 30);
      if (w.t <= 0) { w.state = 'idle'; anim(w, 'Idle'); }
    } else if (w.state === 'block' && w.autoBlock) { w.t -= dt; if (w.t <= 0) { w.state = 'idle'; w.autoBlock = false; anim(w, 'Idle'); } }
    else if (w.state === 'thrown') {
      w.t += dt; const a = w.arc, k = Math.min(1, w.t / a.dur);
      w.x = lerp(a.fx, a.tx, k); w.z = lerp(a.fz, a.tz, k);
      w.y = lerp(a.fy, a.toss ? 0 : MAT_Y, k) + Math.sin(k * Math.PI) * (a.toss ? 1.6 : 0.9);
      w.rotX = -k * Math.PI * 0.5;
      if (k >= 1) {
        emit(m, { k: 'shake', v: 0.4 });
        impact(m, w, m.w[a.by], a.dmg >= 28 ? 'finisher' : 'slam', a.dmg);
        if (a.toss) eliminate(m, i, a.by);
        else { w.state = 'down'; w.t = 2.2 + (100 - w.hp) / 40; fact(m, 'knockdown', a.by, i); }
      }
    } else if (w.state === 'down') {
      w.t -= dt; if (w.t <= 0) { w.state = 'idle'; w.rotX = 0; anim(w, 'Standing', 1.5); }
    }
    if (opp && ['idle', 'wind', 'block', 'active'].includes(w.state)) w.facing = Math.atan2(opp.x - w.x, opp.z - w.z);
    if (!w.out && w.state !== 'thrown') {
      const lim = RING - 0.35;
      for (const ax of ['x', 'z']) {
        if (Math.abs(w[ax]) > lim) { const sign = Math.sign(w[ax]); w[ax] = sign * lim; w['v' + ax] *= -0.6; emit(m, { k: 'wobble', ax, sign }); }
      }
      w.y = MAT_Y;
    }
  });
  // separation, every pair in the ring
  const inRing = m.w.filter((w) => live(w));
  for (let a = 0; a < inRing.length; a++) for (let b = a + 1; b < inRing.length; b++) {
    const A = inRing[a], B = inRing[b];
    let sx = A.x - B.x, sz = A.z - B.z; const sl = Math.hypot(sx, sz);
    if (sl >= 0.85) continue;
    const gap = 0.85 - sl; if (sl < 1e-2) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
    const push = gap * 0.5 + 0.01;
    A.x += sx * push; A.z += sz * push; B.x -= sx * push; B.z -= sz * push;
  }
  m.w.forEach((w, i) => {
    if ((w.anim === 'Walking' || w.anim === 'Running') && Math.hypot(w.x - before[i][0], w.z - before[i][1]) < 0.4 * dt) anim(w, 'Idle');
  });
}

function eliminate(m, i, by) {
  const w = m.w[i], att = m.w[by];
  w.state = 'out'; w.out = true; w.rotX = -Math.PI / 2; m.order.push(i);
  fact(m, 'elimination', by, i);
  emit(m, { k: 'eliminated', slot: i, by });
  emit(m, { k: 'banner', text: `${short(w).toUpperCase()} IS OUT`, secs: 1.4 });
  emit(m, { k: 'call', text: `${w.name} is eliminated${att ? ` by ${short(att)}` : ''}! ${m.w.filter(live).length} left.` });
  const left = m.w.filter((x) => !x.out), waiting = left.filter((x) => !x.entered);
  if (waiting.length && left.length - waiting.length <= 1) m.nextEntryT = Math.min(m.nextEntryT, 1.5);
  if (!waiting.length && left.length === 1) win(m, left[0].slot);
}

function win(m, i) {
  const w = m.w[i];
  m.over = true; m.winner = i; m.how = 'OVER THE TOP';
  emit(m, { k: 'banner', text: `${short(w).toUpperCase()} WINS`, secs: 999 });
  emit(m, { k: 'call', text: `${w.name} is the last one standing! ${w.name} wins the battle royal!` });
  emit(m, { k: 'log', html: `<em>Result</em>: ${short(w)} wins Over the Top. Out in order: ${m.order.map((j) => short(m.w[j])).join(', ')}.` });
  w.state = 'taunt'; w.t = 999; anim(w, 'Dance');
  emit(m, { k: 'end', winner: i, how: m.how, royal: true, order: [...m.order], stats: m.w.map((x) => ({ ...x.stats })), aiPlansLog: [...m.aiPlansLog] });
}

// What the server sends each tick (and what the client renders from).
export function snapshotRoyal(m) {
  const p = m.proposals.find((x) => x.status === 'pending');
  return {
    mode: 'royal', w: m.w.map(({ arc, brain, ...w }) => w), over: m.over, winner: m.winner, how: m.how,
    introT: m.introT, freeze: m.freeze || 0, pin: null, clock: m.clock,
    alliance: m.alliance && { ...m.alliance }, betray: m.betray && { ...m.betray },
    proposal: p && { id: p.id, kind: p.kind, by: p.by, on: p.on, reason: p.reason, cites: p.cites, left: Math.max(0, R.lapse - (m.clock - p.at)) },
    lou: { away: m.lou.awayT > 0, awayT: m.lou.awayT }, order: [...m.order],
    nextEntry: m.w.some((w) => !w.entered) ? m.nextEntryT : null,
  };
}
