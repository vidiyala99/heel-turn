// Booth agents: Rex and Dot as LLM agents, not template players.
// Each has a persona, goals and memory (what it said, which schemes it called). Every ~2.5 s one of them reads the
// shared board (match events, the wrestler agents' plans and reasons, Bruin memory, the transcript) and decides what
// to say next, or passes. Lines are generated ahead of the action and wait in a ready slot until the voice is free.
// Only instant hit reactions ("OH!", "BODY SLAM!") come from the bank (lines.js HITS); a line goes stale and is
// dropped when it is too old or a big moment landed after it was written.
//
// Shapes
//   event  { kind, actor?, target?, success? }                 -> board.events  { seq, at, kind, actor, target }
//   plan   { wrestler, intent, target?, reason? }              -> board.plans   { seq, at, who, intent, target, reason }
//   memory { grudge?, habits?, bribes? }  (Bruin)
//   line   { speaker, text, source: 'llm'|'bank', ref, seq, genAt, ms, kind }   ref = what it reacted to
//   generate({ speaker, brief }) -> Promise<string>  (raw model reply: "[ref] spoken line" or "[pass]")
import { HITS, NAMES } from './lines.js';

const PRIORITY = { strike: 1, reversal: 1, grapple: 2, knockdown: 2, toss: 2, pin: 3, kickout: 3, entry: 3,
  alliance_offer: 3, alliance: 3, bribe: 4, finisher: 4, elimination: 5, betray: 5, betrayal: 5 };
const BIG = 4;
export const CADENCE_MS = 2500;   // one generation per tick, alternating minds
const STALE_MS = 6000;            // a generated line older than this is never spoken
const HIT_FRESH_MS = 600;         // a bank hit reaction is only worth it right on the hit
const GAP_MS = 250;

export const PERSONAS = {
  rex: { name: 'Rex Ramsey', role: 'play-by-play',
    goals: ['call the action honestly', 'hype the face (Mae, the challenger) and anyone fighting fair', 'be scandalized by cheating, bribes and betrayals', 'when a wrestler is plotting, worry out loud before it happens'] },
  dot: { name: 'Dot Calloway', role: 'color commentator',
    goals: ['root for the heels (Silas Crane, Brutus Kane, Vex)', 'defend every cheater and every bribe', 'needle Rex: answer what he just said, mock his outrage', 'brag when a scheme you predicted pays off'] },
};
const OTHER = { rex: 'dot', dot: 'rex' };
const TASK = 'You are live in the booth. Decide your next spoken line. Prefer, in order: answer what your partner just said if it deserves it; '
  + 'speculate about a scheme a wrestler plan hints at BEFORE it happens (name the wrestler and what they are eyeing); call a decision that just happened (betrayal, bribe) with its reason; '
  + 'call back to memory (grudges, habits, the bribe ledger). Never just narrate a single punch. Do not repeat anything in booth_so_far. '
  + 'Only state facts that are on this board; speculation must come from a wrestler plan. 8 to 12 words. '
  + 'Start with ONE tag for what you react to: [rex], [dot], [plan:<wrestler>], [event:<kind>], [memory]. If nothing is worth saying, reply exactly [pass].';

const age = (now, at) => +((now - at) / 1000).toFixed(1);
const nm = (id) => NAMES[id] ?? id;

// "[plan:silas] Crane keeps looking at Lou..." -> { ref: 'plan:silas', text } ; "[pass]" -> null
export function parseReply(raw) {
  const s = String(raw ?? '').trim().replace(/^"|"$/g, '');
  const m = s.match(/^\[([^\]]{1,40})\]\s*(.*)$/s);
  const ref = m ? m[1].trim().toLowerCase() : 'free';
  const text = (m ? m[2] : s).trim().replace(/^"|"$/g, '');
  if (ref === 'pass' || !text || /^\[?pass\]?$/i.test(text)) return null;
  return { ref, text };
}

// generate() over voice/server.js POST /voice/api/line: the whole briefing rides in `event` (the server keeps it whole).
export function viaLineEndpoint(url, fetchImpl = globalThis.fetch) {
  return async ({ speaker, brief }) => {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speaker, event: brief, example: '[plan:silas] Crane keeps looking at Lou. I do not like it.' }) });
    if (!r.ok) throw new Error(`line ${r.status}`);
    return (await r.json()).text;
  };
}

export function createBoothAgents({ generate, say, prefetch = () => {}, onLine = () => {}, onDrop = () => {}, now = () => performance.now(), rng = Math.random, cadenceMs = CADENCE_MS } = {}) {
  const board = { seq: 0, events: [], plans: [], memory: {}, transcript: [] };
  const minds = { rex: { notes: [] }, dot: { notes: [] } };
  const ready = [];            // generated lines waiting for the voice
  let hit = null;              // pending bank hit reaction
  let busy = false, timer = null, turn = 'rex', inflight = 0, lastBigSeq = 0;
  const stats = { generated: 0, passed: 0, failed: 0, spoken: { llm: 0, bank: 0 }, dropped: 0, ms: [] };

  function briefFor(speaker, focus) {
    const t = now(), p = PERSONAS[speaker];
    return {
      ...(focus && { react_now: `${focus.kind}: ${nm(focus.actor)}${focus.target ? ` on ${nm(focus.target)}` : ''}. Call it and say why it happened, tag [event:${focus.kind}].` }),
      you: `${p.name}, ${p.role}`, partner: PERSONAS[OTHER[speaker]].name, your_goals: p.goals,
      just_happened: board.events.slice(-6).map(e => ({ kind: e.kind, actor: nm(e.actor), target: e.target && nm(e.target), secs_ago: age(t, e.at) })),
      wrestler_plans: board.plans.slice(-5).map(x => ({ who: nm(x.who), intent: x.intent, target: x.target && nm(x.target), reason: x.reason, secs_ago: age(t, x.at) })),
      bruin_memory: board.memory,
      booth_so_far: board.transcript.slice(-6).map(l => `${PERSONAS[l.speaker]?.name ?? l.speaker}: ${l.text}`),
      your_notes: minds[speaker].notes.slice(-4),
      task: TASK,
    };
  }

  async function think(speaker, focus = null) {
    inflight++;
    const seq = board.seq, t0 = now();
    try {
      const reply = parseReply(await generate({ speaker, brief: briefFor(speaker, focus) }));
      const ms = Math.round(now() - t0);
      stats.ms.push(ms);
      if (!reply) { stats.passed++; return; }
      stats.generated++;
      const line = { speaker, text: reply.text, ref: reply.ref, source: 'llm', seq, genAt: now(), ms, big: !!focus && reply.ref.startsWith('event') };
      // one ready line per speaker: a fresher thought replaces an older one, but never a big-moment call
      const old = ready.findIndex(l => l.speaker === speaker);
      if (old >= 0 && ready[old].big && !line.big) { stats.dropped++; onDrop(line, 'outranked'); return; }
      if (old >= 0) { stats.dropped++; onDrop(ready[old], 'replaced'); ready.splice(old, 1); }
      ready.push(line);
      try { prefetch(line); } catch { /* warming is best effort */ }
      ready.sort((a, b) => b.big - a.big);  // big-moment calls jump idle thoughts
      pump();
    } catch { stats.failed++; } finally { inflight--; }
  }

  function tick() {
    if (inflight > 1) return;
    // banter: whoever did not speak last answers; otherwise alternate
    const last = board.transcript.at(-1);
    const speaker = last && now() - last.at < 5000 && last.source === 'llm' ? OTHER[last.speaker] : turn;
    turn = OTHER[speaker];
    think(speaker);
  }

  const stale = (l) => now() - l.genAt > STALE_MS || (lastBigSeq > l.seq && !l.ref.startsWith('event'));

  function next() {
    if (hit && now() - hit.at <= (hit.big ? 1500 : HIT_FRESH_MS)) { const h = hit; hit = null; return h; }
    hit = null;
    while (ready.length) {
      const l = ready.shift();
      if (stale(l)) { stats.dropped++; onDrop(l, 'stale'); continue; }
      return l;
    }
    return null;
  }

  async function pump() {
    if (busy) return;
    busy = true;
    for (let line; (line = next());) {
      const spoken = { ...line, at: now() };
      board.transcript.push(spoken);
      if (line.source === 'llm' && /^(plan|memory)/.test(line.ref)) minds[line.speaker].notes.push(`at ${age(now(), 0)}s you said (${line.ref}): ${line.text}`);
      stats.spoken[line.source]++;
      onLine(spoken);
      try { await say(spoken); } catch { /* a failed voice must not stall the booth */ }
      await new Promise(r => setTimeout(r, GAP_MS));
    }
    busy = false;
  }

  function onEvent(ev) {
    if (!ev?.kind || ev.success === false && !/betray/.test(ev.kind)) return;
    const pr = PRIORITY[ev.kind] ?? 1;
    const e = { seq: ++board.seq, at: now(), kind: ev.kind, actor: ev.actor, target: ev.target };
    board.events.push(e); if (board.events.length > 30) board.events.shift();
    const bank = HITS[ev.kind];
    if (bank && (!busy || pr >= BIG) && (pr >= 2 || rng() < 0.35)) { hit = { big: pr >= BIG, speaker: 'rex', text: bank[Math.floor(rng() * bank.length)], ref: `event:${ev.kind}`, source: 'bank', seq: e.seq, genAt: e.at, at: e.at, kind: ev.kind }; pump(); }
    if (pr >= BIG) { lastBigSeq = e.seq; think('rex', ev); setTimeout(() => think('dot', ev), 400); } // big moment: both minds react now, off cadence
  }

  function onPlan(p) {
    if (!p?.wrestler || !p.intent) return;
    board.plans.push({ seq: ++board.seq, at: now(), who: p.wrestler, intent: p.intent, target: p.target, reason: p.reason });
    if (board.plans.length > 20) board.plans.shift();
    if (p.wrestler === 'lou' && /count_fast|bribe/.test(p.intent)) (board.memory.bribes ??= []).push(p.reason || p.intent);
  }

  function setMemory(m) { Object.assign(board.memory, m); }
  function start() { if (!timer) { timer = setInterval(tick, cadenceMs); tick(); } }
  function stop() { clearInterval(timer); timer = null; }

  return { onEvent, onPlan, setMemory, start, stop, stats, board, get busy() { return busy; } };
}
