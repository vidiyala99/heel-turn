// The sponsor-judged agent layer, seen from the client: Bruin memory (facts out, marts in), BAND agent
// plans in the decision log, and the booth (voice). main.js calls the hooks; nothing here blocks a frame.
//   const layer = createAgentLayer({ logRow, call });
//   layer.matchStart({ match, wrestlers: [id, id], humans: [bool, bool] })  -> Promise<habits|null>
//   layer.facts(facts)  layer.tick(simState)  layer.matchEnd()
import { situationOf } from './shared/sim.js';
import { createCommentary } from '../voice/commentary.js';
import { createTTS } from '../voice/tts.js';
import { createCrowd } from '../voice/crowd.js';
import { mountMusic } from '../voice/music.js';

const SIM_TO_ROSTER = { kane: 'brutus' };
const PLAN_EVERY_S = 4;
const NAMES = { vex: 'Vex', kane: 'Kane', brutus: 'Kane', silas: 'Crane', mae: 'Mae', lou: 'Lou', commissioner: 'Commissioner' };
const TINT = { vex: '#2b8cff', kane: '#e8333b', silas: '#8b5cf6', mae: '#c0c6cf', lou: '#f1f1f1' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function createAgentLayer({ logRow, call }) {
  let cur = null; // { match, ids, humans, wrestlers, buf, flushT }
  const debug = { written: 0, memory: null, plans: [], agents: null, errors: [], spoken: [] };

  // --- the booth: Rex and Dot call every fact; captions ride the ticker. Runware voices when the proxy has a key,
  // browser speechSynthesis otherwise (no key yet). The crowd starts on the first key press (autoplay rules).
  const crowd = createCrowd();
  const tts = createTTS({ onDuck: (on) => crowd.duck(on), ctx: () => crowd.context });
  const t0 = performance.now();
  const story = { grudge: null, plot: [] }; // Bruin grudge + recent BAND plans: the LLM lines call back to them
  const boothOpts = { say: (line) => tts.speak(line), prefetch: (line) => tts.prefetch(line), story: () => story, onCaption: caption };
  let booth = createCommentary(boothOpts);
  fetch('/voice/api/health').then((r) => r.json()).then((h) => {
    debug.voice = h;
    if (h.llm) booth = createCommentary({ ...boothOpts, llm: '/voice/api/line' });
  }).catch(() => { debug.voice = { offline: true }; });
  // menus get music; the booth and crowd only live from the bell to the results screen
  const music = mountMusic(undefined, { onScreen: (s) => { if (s === 'match') { try { crowd.start(); } catch {} } crowd.setLive(s === 'match' || s === 'pause'); } });
  function caption(line) {
    const who = { rex: 'Rex', dot: 'Dot', vex: 'Vex', kane: 'Kane', silas: 'Crane', mae: 'Mae' }[line.speaker] || line.speaker;
    debug.spoken.push({ t_s: +((performance.now() - t0) / 1000).toFixed(2), speaker: line.speaker, source: line.source, text: line.text });
    call(`${who}: ${line.text}`);
  }
  function toBooth(f) {
    if (!cur) return;
    const sim = (i) => (i == null ? undefined : cur.wrestlers[i]); // the booth names wrestlers, not players
    const ev = { kind: f.finisher ? 'finisher' : f.kind, actor: sim(f.actor), target: sim(f.target), situation: f.situation, t_ms: f.t_ms };
    if (typeof f.success === 'boolean') ev.success = f.success;
    try { booth.onEvent(ev); crowd.onEvent(ev); } catch (e) { debug.errors.push('booth ' + e.message); }
  }
  window.HEEL_DEBUG = () => debug;

  function ids(wrestlers, humans) {
    let n = 0; return wrestlers.map((id, i) => (humans[i] ? `p${++n}` : SIM_TO_ROSTER[id] || id));
  }
  function flush() {
    if (!cur || !cur.buf.length) return Promise.resolve();
    const facts = cur.buf; cur.buf = [];
    return post('/mem/events', { match: cur.match, ids: cur.ids, facts })
      .then((r) => r.json()).then((r) => { debug.written += r.written || 0; })
      .catch((e) => debug.errors.push('mem/events ' + e.message));
  }

  async function matchStart({ match, wrestlers, humans }) {
    if (cur) { clearInterval(cur.flushT); flush(); }
    cur = { match, wrestlers, humans, ids: ids(wrestlers, humans), buf: [], flushT: setInterval(flush, 1000) };
    const ai = wrestlers.find((_, i) => !humans[i]);
    if (!ai) return null;
    // Memory: the AI reads the player's habits and its grudges from the Bruin marts before the bell.
    try {
      const mem = await fetch(`/mem/for?player=p1&wrestler=${ai}`).then((r) => r.json());
      debug.memory = mem;
      if (mem.error) throw new Error(mem.error);
      const habits = {}; let best = null;
      for (const [sit, moves] of Object.entries(mem.habits || {})) {
        habits[sit] = {};
        for (const [mv, r] of Object.entries(moves)) {
          habits[sit][mv] = 1 + Number(r.n || 0);
          if (!best || r.n > best.n) best = { sit, mv, ...r };
        }
      }
      const who = NAMES[ai] || ai;
      if (best) logRow(planHtml({ wrestler: ai, intent: 'memory', reason: `read Bruin before the bell: you ${best.mv} ${Math.round(best.share * 100)}% of the time when ${best.sit.replace('_', ' ')}`, cites: [best.cite] }, 'BRUIN'));
      else logRow(planHtml({ wrestler: ai, intent: 'memory', reason: 'Bruin has no habits for you yet: first meeting', cites: [] }, 'BRUIN'));
      const g = (mem.feelings || [])[0];
      story.grudge = g && g.grudge > 0 ? { who: ai, about: g.about, trust: g.trust, grudge: g.grudge, last_betrayal: g.last_betrayal } : null;
      if (g && g.grudge > 0) logRow(planHtml({ wrestler: ai, intent: 'grudge', target: g.about, reason: `trust ${g.trust}, grudge ${g.grudge}${g.last_betrayal ? `, betrayed in ${g.last_betrayal}` : ''}`, cites: [g.cite] }, 'BRUIN'));
      debug.memoryText = `${who} habits from Bruin`;
      return best ? habits : null;
    } catch (e) {
      debug.errors.push('mem/for ' + e.message);
      return null;
    }
  }

  function facts(list) { if (cur) { cur.buf.push(...list); list.forEach(toBooth); } }

  async function matchEnd() {
    if (!cur) return;
    clearInterval(cur.flushT);
    await flush();
    post('/mem/end', { match: cur.match }).catch(() => {}); // Bruin refresh runs server side; never awaited
  }

  // --- agent brains: the LLM plan is the decider; the sim executes m.extPlan frame by frame ---
  let inFlight = false, nextAt = 0, downLogged = false;
  // Status chip in the DECISION LOG header: is the LLM deciding right now, or the scripted fallback?
  function chip(text, live) {
    const h = document.querySelector('.log h4'); if (!h) return;
    let c = h.querySelector('.dl-chip');
    if (!c) { c = document.createElement('span'); c.className = 'dl-chip'; h.appendChild(c); }
    c.textContent = text; c.dataset.live = live ? '1' : '0';
  }
  chip('AI: connecting', false);
  const last = {};
  function request(m) {
    const humanId = (i) => cur.ids[i];
    const wrestlers = [], humans = [];
    m.w.forEach((w, i) => {
      const base = { stamina: +(w.st / 100).toFixed(2), down: ['down', 'pinned', 'thrown'].includes(w.state), eliminated: !!w.out };
      if (cur.humans[i]) {
        const habits = {};
        for (const [sit, mv] of Object.entries(m.habits)) habits[sit] = Object.fromEntries(Object.entries(mv).map(([k, n]) => [k, n - 1]));
        humans.push({ id: humanId(i), situation: situationOf(m), ...base, habits });
      } else wrestlers.push({ id: w.id, ...base });
    });
    const idOf = (i) => (cur.humans[i] ? humanId(i) : m.w[i].id);
    return {
      match: cur.match, t_ms: Math.round(m.clock * 1000), wrestlers, humans,
      crowd: Object.fromEntries(m.w.map((w, i) => [idOf(i), +(w.mo / 100).toFixed(2)])),
      pin: m.pin ? { by: idOf(m.pin.att), on: idOf(m.pin.victim) } : null,
    };
  }
  function show(p, meta) {
    const llm = meta?.source === 'openai';
    const secs = meta?.ms != null ? `${(meta.ms / 1000).toFixed(1)} s` : '';
    const label = llm ? `LLM, ${secs}` : meta?.source === 'rule' ? 'rule' : `fallback${meta?.error ? `: ${meta.error.slice(0, 60)}` : ''}`;
    const expect = (p.cites?.[0] || '').match(/\/(strike|grapple|block)$/)?.[1] || null;
    const sig = `${p.intent}|${p.target}|${expect}`, same = last[p.wrestler] === sig;
    last[p.wrestler] = sig;
    if (p.wrestler === 'lou' && !p.target && same) return expect;
    logRow(planHtml({ ...p, label }, p.wrestler === 'lou' ? 'REF' : llm ? 'LLM' : 'FALLBACK'), `llm-${p.wrestler}`, same);
    if (!same && llm && p.wrestler !== 'lou' && p.reason) call(`${NAMES[p.wrestler] || p.wrestler}: "${p.reason}"`);
    return expect;
  }
  function tick(m) {
    if (!cur || m.over || m.introT > 0 || inFlight || m.clock < nextAt) return;
    inFlight = true; nextAt = m.clock + PLAN_EVERY_S;
    const t0 = performance.now(), body = request(m);
    post('/agents/plan', body).then((r) => r.json()).then((res) => {
      if (res.error) throw new Error(res.reason || res.error);
      downLogged = false;
      const src = (res.plans || []).map((p, k) => [p.wrestler, res.meta?.[k]?.source]).filter(([w]) => w !== 'lou');
      const live = src.length && src.every(([, s]) => s === 'openai');
      chip(live ? `AI: LLM live · BAND ${res.band}` : `AI: fallback${src[0]?.[1] ? '' : ' (no plan)'}`, live);
      debug.agents = { band: res.band, planner: res.planner, memory: res.memory, latency_ms: res.latency_ms, rtt_ms: Math.round(performance.now() - t0), pending: (res.pending || []).map((x) => x.id) };
      (res.plans || []).forEach((p, k) => {
        const meta = res.meta?.[k];
        if (p.intent && p.intent !== 'attack') story.plot = [...story.plot, { who: p.wrestler, intent: p.intent, target: p.target, reason: p.reason }].slice(-4);
        debug.plans.push({ t: body.t_ms, wrestler: p.wrestler, intent: p.intent, target: p.target, reason: p.reason, cites: p.cites, source: meta?.source, ms: meta?.ms, error: meta?.error });
        const changed = last[p.wrestler] !== `${p.intent}|${p.target}|${(p.cites?.[0] || '').match(/\/(strike|grapple|block)$/)?.[1] || null}`;
        const expect = show(p, meta);
        if (changed && p.wrestler !== 'lou' && meta?.source === 'openai') m.aiPlansLog.push(`${NAMES[p.wrestler] || p.wrestler} (LLM): ${p.reason}`);
        if (p.wrestler !== 'lou' && cur && m === cur.m) m.extPlan = { intent: p.intent, target: p.target, expect, at: m.clock, source: meta?.source };
      });
    }).catch((e) => {
      debug.errors.push('agents/plan ' + e.message);
      chip(`AI: fallback (${/^BAND:/.test(e.message) ? e.message : 'agents offline'})`, false);
      nextAt = m.clock + 2; // retry sooner while the server is down
      if (!downLogged) { downLogged = true; logRow(planHtml({ wrestler: 'agents', intent: 'offline', reason: `agents server unreachable (${e.message}); the scripted fallback plans meanwhile`, cites: [] }, 'FALLBACK')); }
    }).finally(() => { inFlight = false; });
  }

  // the entrance (feel/entrance.js) and the winner call use the same voice bus, crowd and music
  const announce = (line) => { caption(line); return tts.speak(line); };
  const swell = (a, s) => { try { crowd.start(); crowd.swell(a, s); } catch {} };
  const sting = (id) => music.sting(id);
  return { matchStart, facts, matchEnd, tick, bind(m) { if (cur) cur.m = m; }, debug, announce, swell, sting };
}

// One decision-log row: source chip, who -> intent (target), the reason, then the mart rows it cites.
export function planHtml(p, source = 'BAND') {
  const who = (NAMES[p.wrestler] || p.wrestler) + (p.label ? ` (${p.label})` : ''), tint = TINT[p.wrestler] || '#f5c542';
  const tgt = p.target ? ` <span class="dl-t">${esc(NAMES[p.target] || p.target)}</span>` : '';
  const verdict = p.vetoed_by ? ` <span class="dl-v no">blocked by ${esc(p.vetoed_by)}</span>` : p.approved_by ? ` <span class="dl-v">approved by ${esc(p.approved_by)}</span>` : '';
  const cites = (p.cites || []).length ? `<span class="dl-c">${(p.cites || []).map(esc).join(' · ')}</span>` : '';
  return `<span class="dl-row" style="--tint:${tint}"><span class="dl-src">${source}</span><em>${esc(who)}</em> ${esc(String(p.intent).replace('_', ' '))}${tgt}${verdict}`
    + `<span class="dl-r">${esc(p.reason)}</span>${cites}</span>`;
}

// Decision-log styling for agent rows (injected so the shell's index.html stays the shell's).
const css = document.createElement('style');
css.textContent = `
.log { width: 360px; max-height: 42vh; }
.log p:has(.dl-row) { margin: 6px 0; }
.dl-row { display: block; border-left: 3px solid var(--tint); padding-left: 8px; animation: dl-in .18s cubic-bezier(.2,.8,.2,1); }
.dl-src { font: 600 9.5px/1 ui-monospace, Consolas, monospace; letter-spacing: .08em; color: #05060a; background: var(--tint); padding: 2px 4px; margin-right: 6px; vertical-align: 1px; }
.dl-t { color: #fff; }
.dl-chip { float: right; font: 600 10px/1 ui-monospace, Consolas, monospace; letter-spacing: .04em; padding: 3px 6px; margin-top: 2px; color: #05060a; background: #9aa3b2; }
.dl-chip[data-live="1"] { background: #7ee0a1; }
.dl-x { font: 600 10.5px ui-monospace, Consolas, monospace; color: var(--gold, #f5c542); }
.dl-v { color: #7ee0a1; font-size: 11px; } .dl-v.no { color: #ff8a8a; }
.dl-r { display: block; color: #cfd6e1; }
.dl-c { display: block; font: 10.5px/1.35 ui-monospace, Consolas, monospace; color: #9aa3b2; word-break: break-word; }
@keyframes dl-in { from { opacity: 0; transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .dl-row { animation: none; } }
@media (max-width: 720px) { .log { width: auto; left: 16px; max-height: 30vh; } }
`;
document.head.appendChild(css);
