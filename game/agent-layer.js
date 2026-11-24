// The sponsor-judged agent layer, seen from the client: Bruin memory (facts out, marts in), BAND agent
// plans in the decision log, and the booth (voice). main.js calls the hooks; nothing here blocks a frame.
//   const layer = createAgentLayer({ logRow, call });
//   layer.matchStart({ match, wrestlers: [id, id], humans: [bool, bool] })  -> Promise<habits|null>
//   layer.facts(facts)  layer.tick(simState)  layer.matchEnd()
import { situationOf } from './shared/sim.js';
import { createCommentary } from '../voice/commentary.js';
import { createBoothAgents, viaLineEndpoint } from '../voice/booth-agent.js';
import { createTTS } from '../voice/tts.js';
import { createCrowd } from '../voice/crowd.js';
import { mountMusic } from '../voice/music.js';
import { createPromo } from './ui/promo.js';
import './ui/promo.css';

const SIM_TO_ROSTER = { kane: 'brutus' };
const PROMO_BASE = `${location.protocol}//${location.hostname}:8789`;
const PLAN_EVERY_S = 4;
const NAMES = { vex: 'Vex', kane: 'Kane', brutus: 'Kane', silas: 'Crane', mae: 'Mae', lou: 'Lou', commissioner: 'Commissioner', rex: 'Rex', dot: 'Dot' };
const TINT = { vex: '#2b8cff', kane: '#e8333b', silas: '#8b5cf6', mae: '#c0c6cf', lou: '#f1f1f1', rex: '#f5c542', dot: '#ff7ab6' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function createAgentLayer({ logRow, call }) {
  let cur = null; // { match, ids, humans, wrestlers, buf, flushT }
  const debug = { written: 0, memory: null, plans: [], agents: null, errors: [], spoken: [] };

  // --- the booth: Rex and Dot call every fact; captions ride the ticker. Runware voices when the proxy has a key,
  // browser speechSynthesis otherwise (no key yet). The crowd starts on the first key press (autoplay rules).
  const crowd = createCrowd();
  // Voice events for the screen (arena/booth.js leans the speaker in, feel/lowerthird.js shows the name strap):
  // window 'heel:voice' { phase: 'start'|'end', speaker, text, mode }. Muted or voiceless runs (automation, no
  // TTS) still get an 'end' after a reading-speed estimate, so the visuals and the entrance keep real timing.
  const voice = (phase, line, mode) => dispatchEvent(new CustomEvent('heel:voice', { detail: { phase, speaker: line.speaker, text: line.text, mode, t: performance.now() } }));
  const started = new Map(); // speaker -> { mode, at }
  const tts = createTTS({ onDuck: (on) => crowd.duck(on), ctx: () => crowd.context, onStart: (line, mode) => { started.set(line.speaker, { mode, at: performance.now() }); voice('start', line, mode); } });
  const estMs = (line) => (600 + line.text.split(/\s+/).length * (line.speaker === 'ring' ? 430 : 330));
  // speak, then 'end'. hold=true: the promise also waits out the estimate when no real audio played (the entrance).
  async function voiced(line, hold = false) {
    const t = performance.now();
    try { await tts.speak(line); } catch { /* a failed voice must not stall */ }
    const s = started.get(line.speaker);
    if (!s || s.at < t) return; // never started (dropped as stale): no strap
    const left = s.mode === 'neural' || s.mode === 'speechSynthesis' ? 0 : estMs(line) - (performance.now() - s.at);
    if (left > 0 && hold) await new Promise((r) => setTimeout(r, left));
    if (left > 0 && !hold) { setTimeout(() => voice('end', line, s.mode), left); return; }
    voice('end', line, s.mode);
  }
  const t0 = performance.now();
  const story = { grudge: null, plot: [] }; // Bruin grudge + recent BAND plans: the LLM lines call back to them
  const boothOpts = { say: (line) => voiced(line), prefetch: (line) => tts.prefetch(line), story: () => story, onCaption: caption };
  let booth = createCommentary(boothOpts);
  fetch('/voice/api/health').then((r) => r.json()).then((h) => {
    debug.voice = h;
    // Rex and Dot become LLM agents (voice/booth-agent.js): every line lands in the decision log with what it reacted to
    if (h.llm) booth = createBoothAgents({ generate: viaLineEndpoint('/voice/api/line'), say: boothOpts.say, prefetch: boothOpts.prefetch, onLine: (l) => {
      caption(l);
      logRow(planHtml({ wrestler: l.speaker, label: l.source === 'llm' ? `LLM, ${(l.ms / 1000).toFixed(1)} s` : 'bank', intent: 'says', reason: l.text, cites: [l.source === 'llm' ? `reacted to ${l.ref}` : `hit reaction to ${l.ref}`] }, l.source === 'llm' ? 'LLM' : 'BANK'));
    } });
    if (cur) booth.start?.();
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
    promoPre(wrestlers, humans);
    booth.start?.();
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
      booth.setMemory?.({ grudge: story.grudge, habits: best ? `the player ${best.mv}s ${Math.round(best.share * 100)}% of the time when ${best.sit.replace('_', ' ')}` : null });
      if (g && g.grudge > 0) logRow(planHtml({ wrestler: ai, intent: 'grudge', target: g.about, reason: `trust ${g.trust}, grudge ${g.grudge}${g.last_betrayal ? `, betrayed in ${g.last_betrayal}` : ''}`, cites: [g.cite] }, 'BRUIN'));
      debug.memoryText = `${who} habits from Bruin`;
      return best ? habits : null;
    } catch (e) {
      debug.errors.push('mem/for ' + e.message);
      return null;
    }
  }

  function facts(list) { if (cur) { cur.buf.push(...list); list.forEach(toBooth); list.forEach(promoMid); } }

  async function matchEnd() {
    if (!cur) return;
    clearInterval(cur.flushT);
    booth.stop?.();
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
        booth.onPlan?.(p);
        if (p.intent && p.intent !== 'attack') story.plot = [...story.plot, { who: p.wrestler, intent: p.intent, target: p.target, reason: p.reason }].slice(-4);
        debug.plans.push({ t: body.t_ms, wrestler: p.wrestler, intent: p.intent, target: p.target, reason: p.reason, cites: p.cites, source: meta?.source, ms: meta?.ms, error: meta?.error });
        const changed = last[p.wrestler] !== `${p.intent}|${p.target}|${(p.cites?.[0] || '').match(/\/(strike|grapple|block)$/)?.[1] || null}`;
        const expect = show(p, meta);
        if (changed && p.wrestler !== 'lou' && meta?.source === 'openai') m.aiPlansLog.push(`${NAMES[p.wrestler] || p.wrestler} (LLM): ${p.reason}`);
        // a crooked count only arrives once the commissioner approved the bribe (brain._ref_job): Lou then misses rope breaks
        if (p.wrestler === 'lou' && p.intent === 'count_fast') m.refBribed = true;
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
  // announce(line) resolves when the line has finished (or its estimate, when muted); hush() drops queued ones.
  let lastAnnounce = Promise.resolve();
  const announce = (line) => { caption(line); return (lastAnnounce = voiced(line, true)); };
  const hush = () => { try { tts.stop(); } catch { /* nothing playing */ } };
  const swell = (a, s) => { try { crowd.start(); crowd.swell(a, s); } catch {} };
  const sting = (id) => music.sting(id);

  // --- promos (agents/promo on :8789): each wrestler cuts a promo from its Bruin memory, voiced through the booth's
  // TTS bus. pre: after the entrances, before the bell (main.js holds the sim while `holding`); mid: one line on a
  // knockdown or a kickout, at most every MID_EVERY_MS; post: winner then loser on the results screen.
  const MID_EVERY_MS = 10000;
  const promo = createPromo({
    base: PROMO_BASE,
    // the cue sits ahead so a clip rendered during the fetch still plays (tts.js drops clips late past their cue)
    speak: (l) => voiced({ speaker: l.speaker, text: l.text, kind: 'promo', eventAt: performance.now() + 4000 }, true),
    stop: () => hush(),
    subtitle: true,
  });
  const promoDebug = (debug.promos = []);
  let holding = false, pre = null, preGen = 0, midAt = -1e9, busy = false;
  const promoState = (extra = {}) => {
    if (!cur) return extra;
    const players = {}; let n = 0;
    cur.wrestlers.forEach((w, i) => { if (cur.humans[i]) players[w] = `p${++n}`; });
    return { match: cur.match, players, ...extra };
  };
  // shorter promos: pre keeps each speaker's best line (one that quotes memory, else the first)
  function trim(out, moment) {
    if (!out?.lines?.length || moment !== 'pre') return out;
    const by = new Map();
    for (const l of out.lines) { const b = by.get(l.speaker); if (!b || (!b.cites?.length && l.cites?.length)) by.set(l.speaker, l); }
    return { ...out, lines: [...by.values()] };
  }
  async function fetchPromo(req) {
    const t = performance.now();
    const out = trim(await promo.fetchLines(req), req.moment);
    promoDebug.push({ moment: req.moment, speaker: req.speaker, opponent: req.opponent, ms: Math.round(performance.now() - t), meta: out.meta, lines: out.lines });
    out.lines.forEach((l) => tts.prefetch({ speaker: l.speaker, text: l.text, kind: 'promo' }));
    return out;
  }
  async function showPromo(out, moment) {
    if (!out?.lines?.length) return;
    busy = true;
    try { await promo.show(out.lines, moment); } finally { busy = false; }
  }
  // HEEL_PROMO.play(moment, speaker, opponent, state): fetch + show; never throws; resolves when the promo ends
  async function play(moment, speaker, opponent, state = {}) {
    try { const out = await fetchPromo({ moment, speaker, opponent, match_state: promoState(state) }); await showPromo(out, moment); return out; }
    catch (e) { debug.errors.push('promo ' + e.message); return null; }
  }
  function promoPre(wrestlers, humans) {
    promo.close(); pre = null; holding = false; midAt = performance.now();
    const me = wrestlers[humans.indexOf(true)] ?? wrestlers[0];
    const rival = wrestlers.find((w) => w !== me && !humans[wrestlers.indexOf(w)]) ?? wrestlers.find((w) => w !== me);
    if (!rival) return;
    holding = true;
    const gen = ++preGen;
    setTimeout(() => { if (gen === preGen && pre) { pre = null; holding = false; } }, 60000); // no entrance-end: never strand the bell
    const req = { moment: 'pre', speaker: rival, opponent: me, match_state: promoState() };
    pre = { at: performance.now(), out: fetchPromo(req).catch((e) => { debug.errors.push('promo ' + e.message); return null; }) };
    // Over the Top has no entrances: the promo runs as soon as its lines arrive
    if (wrestlers.length > 2) runPre();
  }
  async function runPre() {
    const p = pre; pre = null;
    if (!p) { holding = false; return; }
    const out = await Promise.race([p.out, new Promise((r) => setTimeout(() => r(null), 4500))]);
    try { if (out && cur && window.HEEL_UI?.state !== 'menu') await showPromo(out, 'pre'); }
    finally { holding = false; }
  }
  addEventListener('heel:entrance-end', () => { if (pre) runPre(); });
  function promoMid(f) {
    if (!cur || busy || holding || (f.kind !== 'knockdown' && f.kind !== 'kickout')) return;
    const now = performance.now(); if (now - midAt < MID_EVERY_MS) return;
    const speaker = cur.wrestlers[f.actor], opponent = cur.wrestlers[f.target];
    if (!speaker || !opponent) return;
    midAt = now;
    play('mid', speaker, opponent, { event: f.kind === 'kickout' ? 'near_fall' : 'opponent_down' });
  }
  // post: winner then loser, after the winner call lands
  async function promoPost(result, w) {
    const ids = w.map((x) => x.id), me = ids[result.mySlot ?? 0];
    const winner = result.winnerId, loser = winner === me ? ids.find((x) => x !== winner) : me;
    if (!winner || !loser) return;
    promo.close();
    const req = { moment: 'post', speaker: winner, opponent: loser, match_state: promoState({ winner, finish: result.how }) };
    const out = fetchPromo(req).catch((e) => { debug.errors.push('promo ' + e.message); return null; });
    await new Promise((r) => setTimeout(r, 700)); await lastAnnounce.catch(() => {});
    const o = await out; if (window.HEEL_UI?.state === 'results') await showPromo(o, 'post');
  }
  window.HEEL_PROMO = { play, el: promo.el, get holding() { return holding; } };

  return { matchStart, facts, matchEnd, tick, bind(m) { if (cur) cur.m = m; }, debug, announce, hush, swell, sting, promoPost,
    get holding() { return holding; } };
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
