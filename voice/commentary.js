// Commentary: game event -> spoken line, one voice at a time.
// Event shape (docs/PLAN.md): { kind, actor, target?, success?, t_ms?, text? }
// Line shape: { speaker, text, kind, priority, source: 'template'|'llm' }
import { CALLS, TAUNTS, NAMES } from './lines.js';

// game event kind -> commentary kind
const KIND_OF = {
  strike: 'strike', reversal: 'strike', grapple: 'slam', knockdown: 'slam', pin: 'near_fall',
  kickout: 'kickout', elimination: 'elimination', entry: 'entry', alliance_offer: 'alliance',
  alliance_reply: 'alliance', alliance: 'alliance', betray: 'betrayal', betrayal: 'betrayal',
  finisher: 'finisher', taunt: 'taunt', bribe: 'bribe',
};
const PRIORITY = {
  strike: 1, slam: 2, taunt: 2, near_fall: 3, kickout: 3, entry: 3, alliance: 3, bribe: 3,
  finisher: 4, elimination: 5, betrayal: 5,
};
const BIG = 4;            // priority at or above which Dot follows up (via LLM when available)
const QUEUE_MAX = 3;      // pending lines beyond the one being spoken (a betrayal needs rex + dot + gloat)
const STALE_MS = 3000;    // a queued line older than this is dropped, never spoken late
const GAP_MS = 200;       // breath between lines
const LLM_WAIT_MS = 2500; // how long a follow-up waits on the LLM before using the template

const fill = (s, ev) => s.replaceAll('{a}', NAMES[ev.actor] ?? ev.actor ?? 'someone')
  .replaceAll('{t}', NAMES[ev.target] ?? ev.target ?? 'their opponent');

// Shuffle bag per key: draws without replacement, never repeats across a reshuffle boundary.
export function createBag(rng = Math.random) {
  const bags = new Map();
  return function draw(key, items) {
    let b = bags.get(key);
    if (!b || b.left.length === 0) {
      const last = b?.last;
      const left = items.map((_, i) => i);
      for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
      if (left.length > 1 && left[left.length - 1] === last) [left[0], left[left.length - 1]] = [left[left.length - 1], left[0]];
      b = { left, last }; bags.set(key, b);
    }
    b.last = b.left.pop();
    return items[b.last];
  };
}

// opts.say(line) -> Promise resolved when the line finishes playing (tts.js speak()).
// opts.llm: URL of the line endpoint (voice/server.js POST /voice/api/line) or null.
export function createCommentary({ say, llm = null, onCaption = () => {}, rng = Math.random, now = () => performance.now(), fetchImpl = globalThis.fetch } = {}) {
  const draw = createBag(rng);
  const queue = [];
  let busy = false;
  const stats = { spoken: 0, dropped: 0, llm: 0 };

  function template(kind, speaker, ev) {
    if (kind === 'taunt') {
      const bank = TAUNTS[speaker]; if (!bank) return null;
      const moment = bank[ev.moment] ? ev.moment : 'taunt';
      return draw(`${speaker}:${moment}`, bank[moment]);
    }
    const bank = CALLS[kind]?.[speaker];
    return bank ? fill(draw(`${speaker}:${kind}`, bank), ev) : null;
  }

  async function askLLM(ev, speaker, fallback) {
    if (!llm || !fetchImpl) return null;
    try {
      const r = await fetchImpl(llm, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: ev, speaker, names: NAMES, example: fallback }) });
      if (!r.ok) return null;
      const { text } = await r.json();
      return typeof text === 'string' && text.trim() ? text.trim() : null;
    } catch { return null; }
  }

  function enqueue(item) {
    // small stuff never stacks: one pending strike call is enough during a flurry
    if (item.priority < 3 && queue.some(x => x.kind === item.kind && x.speaker === item.speaker)) { stats.dropped++; return; }
    if (queue.length >= QUEUE_MAX) {
      const lowest = queue.reduce((m, x, i) => x.priority < queue[m].priority ? i : m, 0);
      stats.dropped++;
      if (queue[lowest].priority >= item.priority) return;
      queue.splice(lowest, 1);
    }
    queue.push(item);
    queue.sort((x, y) => y.priority - x.priority || x.at - y.at);
    pump();
  }

  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const item = queue.shift();
      if (now() - item.at > STALE_MS) { stats.dropped++; continue; }
      let text = item.text, source = 'template';
      if (item.llmText) {
        const got = await Promise.race([item.llmText, new Promise(r => setTimeout(r, Math.max(0, LLM_WAIT_MS - (now() - item.at)), null))]);
        if (got) { text = got; source = 'llm'; stats.llm++; }
      }
      const line = { speaker: item.speaker, text, kind: item.kind, priority: item.priority, source, eventAt: item.at };
      onCaption(line);
      stats.spoken++;
      try { await say(line); } catch { /* a failed voice must not stall the booth */ }
      await new Promise(r => setTimeout(r, GAP_MS));
    }
    busy = false;
  }

  function onEvent(ev) {
    const kind = KIND_OF[ev.kind];
    if (!kind || ev.success === false && kind !== 'betrayal') return;
    const priority = PRIORITY[kind];
    const at = now();
    if (kind === 'taunt') {
      const text = ev.text || template('taunt', ev.actor, ev);
      if (text) enqueue({ speaker: ev.actor, text, kind, priority, at });
      return;
    }
    enqueue({ speaker: 'rex', text: template(kind, 'rex', ev), kind, priority, at });
    if (priority >= BIG || (queue.length < QUEUE_MAX && rng() < 0.3)) {
      const fallback = template(kind, 'dot', ev);
      enqueue({ speaker: 'dot', text: fallback, kind, priority: priority - 0.5, at, llmText: priority >= BIG ? askLLM(ev, 'dot', fallback) : null });
    }
    // the betrayer gloats in their own voice
    if (kind === 'betrayal' && TAUNTS[ev.actor]) enqueue({ speaker: ev.actor, text: template('taunt', ev.actor, { moment: 'betray' }), kind: 'taunt', priority: priority - 1, at });
  }

  return { onEvent, stats, get busy() { return busy; } };
}
