// OVER THE TOP, seen from the client: the roster strip, the commissioner card (APPROVE / BLOCK, keys Y / N), the odds
// panel (key O, agents/odds on :8790), the agents server (BAND plans + proposals in, verdicts out) and the odds feed.
// main.js owns the sim and the 3D; this file never blocks a frame.
//   const rc = createRoyalClient({ logRow, planHtml, decide });   decide(id, 'approve'|'block') applies the verdict
//   rc.start({ matchId, commissioner, online })   rc.frame(st)   rc.events(evs, st)   rc.tick(m)   rc.stop()
import './ui/odds.css';
import './ui/royal.css';
import { mountOdds } from './ui/odds.js';
import { ROSTER_ASSETS } from './shared/roster-assets.js';
import { adoptBand } from './shared/royal.js';

// The fifth body (Kid Riot): registered here so shared/roster-assets.js stays the attire lane's file.
ROSTER_ASSETS.riot ||= {
  body: 'male', hair: ['Hair_Buzzed'], hairColor: 0xf59e0b, scale: [1.02, 0.98, 1.02],
  skin: 0xc68a62, trunks: 0xd97706, top: null, legs: null, boots: 0x3a2206,
};

const ODDS_ID = { kane: 'brutus' }; // Bruin roster ids
const NAMES = { vex: 'Vex', kane: 'Kane', silas: 'Crane', mae: 'Mae', riot: 'Riot', lou: 'Lou' };
const TINT = { vex: '#2b8cff', kane: '#e8333b', silas: '#8b5cf6', mae: '#c0c6cf', riot: '#f59e0b' };
const PLAN_EVERY_S = 4;
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createRoyalClient({ logRow, planHtml, decide }) {
  let cur = null; // { matchId, commissioner, online, odds, strip, card, shown, inFlight, nextAt, last }
  const debug = { plans: [], pending: [], verdicts: [], odds: [], errors: [] };
  window.HEEL_ROYAL = () => debug;

  function el(tag, cls, html) { const n = document.createElement(tag); n.className = cls; if (html != null) n.innerHTML = html; return n; }

  function start({ matchId, commissioner = true, online = false }) {
    stop();
    document.body.classList.add('royal');
    const strip = el('div', 'rr-strip'); strip.setAttribute('aria-label', 'Wrestlers in the battle royal');
    const card = el('section', 'rr-card'); card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-live', 'assertive'); card.hidden = true;
    document.body.append(strip, card);
    let odds = null;
    try { odds = mountOdds(document.body, { match: matchId, api: oddsApi() }); } catch (e) { debug.errors.push('odds ' + e.message); }
    cur = { matchId, commissioner, online, odds, strip, card, shown: null, inFlight: false, nextAt: 0, last: {}, oddsOn: true };
    setOdds(true);
    card.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) vote(b.dataset.v); });
  }
  function stop() {
    if (!cur) return;
    cur.strip.remove(); cur.card.remove(); cur.odds?.destroy();
    document.body.classList.remove('royal', 'odds-open');
    cur = null;
  }
  function setOdds(on) { if (!cur) return; cur.oddsOn = on; cur.odds?.show(on); document.body.classList.toggle('odds-open', !!(on && cur.odds)); }

  // ---------- commissioner card ----------
  function vote(d) {
    if (!cur?.shown || !cur.commissioner) return;
    const id = cur.shown; cur.shown = null; cur.card.hidden = true;
    decide(id, d === 'y' ? 'approve' : 'block');
  }
  function paintCard(st) {
    const p = st.proposal;
    if (!p) { if (cur.shown) { cur.shown = null; cur.card.hidden = true; } return; }
    const by = st.w[p.by], on = p.on >= 0 ? st.w[p.on] : null;
    if (cur.shown !== p.id) {
      cur.shown = p.id;
      const head = p.kind === 'bribe' ? `${NAMES[by.id]} slipped Lou an envelope` : `${NAMES[by.id]} wants to turn on ${NAMES[on.id]}`;
      const ask = p.kind === 'bribe' ? 'Lou looks away for 10 seconds if you allow it.' : `${NAMES[by.id]} throws his own partner over the top if you allow it.`;
      cur.card.innerHTML = `
        <div class="rr-who">Commissioner's call</div>
        <h3 class="rr-head">${esc(head)}</h3>
        <p class="rr-ask">${esc(ask)}</p>
        <p class="rr-why">${esc(p.reason)}</p>
        ${(p.cites || []).length ? `<p class="rr-cite">${p.cites.map(esc).join('<br>')}</p>` : ''}
        <div class="rr-time"><i></i></div>
        ${cur.commissioner
          ? `<div class="rr-btns"><button class="rr-b rr-yes" data-v="y"><kbd>Y</kbd>Approve</button><button class="rr-b rr-no" data-v="n"><kbd>N</kbd>Block</button></div>`
          : '<p class="rr-wait">The host is the commissioner tonight. Waiting on their call.</p>'}`;
      cur.card.hidden = false;
      cur.card.dataset.kind = p.kind;
    }
    const bar = cur.card.querySelector('.rr-time i');
    if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, p.left / 20))})`;
  }

  // ---------- roster strip ----------
  function paintStrip(st) {
    const al = st.alliance;
    const rows = st.w.map((w, i) => {
      const ally = al && (al.a === i ? al.b : al.b === i ? al.a : -1);
      const tag = w.out ? 'OUT' : !w.entered ? (st.nextEntry != null && st.w.findIndex((x) => !x.entered) === i ? `IN ${Math.ceil(st.nextEntry)}s` : 'WAITING')
        : ally >= 0 && ally !== undefined ? `WITH ${NAMES[st.w[ally].id].toUpperCase()}` : w.human ? 'YOU' : '';
      const target = al && al.target === i && !w.out ? ' rr-hunted' : '';
      return `<div class="rr-w${w.out ? ' out' : ''}${!w.entered ? ' wait' : ''}${target}" style="--t:${TINT[w.id] || '#f5c542'}">
        <div class="rr-n">${esc(NAMES[w.id] || w.id)}${w.human ? '<b>P' + (i + 1) + '</b>' : ''}</div>
        <div class="rr-hp"><i style="transform:scaleX(${Math.max(0, w.hp) / 100})"></i></div>
        <div class="rr-tag">${tag}</div></div>`;
    }).join('');
    const away = st.lou?.away ? `<div class="rr-lou">LOU LOOKS AWAY ${Math.ceil(st.lou.awayT)}s</div>` : '';
    const html = rows + away;
    if (cur.strip._html !== html) { cur.strip.innerHTML = html; cur.strip._html = html; }
  }

  function frame(st) {
    if (!cur || !st || st.mode !== 'royal') return;
    paintStrip(st); paintCard(st);
  }

  // ---------- odds feed: entries, eliminations, the envelope and the turn ----------
  function toOdds(list) {
    if (!cur?.commissioner || !list.length) return; // one client feeds the book
    const body = list.map((e) => ({ match: cur.matchId, ...e }));
    debug.odds.push(...body);
    post(`${oddsApi()}/event`, body).catch((e) => debug.errors.push('odds/event ' + e.message));
  }
  const oddsApi = () => `http://${location.hostname || '127.0.0.1'}:${new URLSearchParams(location.search).get('oddsPort') || 8790}`;
  const rid = (w) => ODDS_ID[w.id] || w.id;

  function events(evs, st) {
    if (!cur || !st) return;
    const feed = [];
    for (const e of evs) {
      if (e.k === 'agent') logRow(planHtml(e.row, e.src), e.row.intent === 'entrant' ? null : `royal-${e.row.wrestler}-${e.row.intent}`, false);
      else if (e.k === 'alliance') logRow(`<span class="dl-row rr-ally" style="--tint:#f5c542"><span class="dl-src">ALLIANCE</span><em>${NAMES[st.w[e.a].id]} + ${NAMES[st.w[e.b].id]}</em> gang up on <span class="dl-t">${NAMES[st.w[e.target].id]}</span><span class="dl-r">shared target: both now hunt ${NAMES[st.w[e.target].id]}</span></span>`);
      else if (e.k === 'fact' && e.kind === 'entry') feed.push({ kind: 'entry', actor: rid(st.w[e.actor]) });
      else if (e.k === 'eliminated') feed.push({ kind: 'elimination', actor: st.w[e.by] ? rid(st.w[e.by]) : null, target: rid(st.w[e.slot]) });
      else if (e.k === 'betrayal') feed.push({ kind: 'betray', actor: rid(st.w[e.by]), target: rid(st.w[e.on]) });
      else if (e.k === 'bribe') feed.push({ kind: e.decision === 'accept' ? 'bribe_accept' : 'bribe_decline', actor: 'lou', target: 'silas' });
      else if (e.k === 'verdict') {
        debug.verdicts.push(e);
        // the commissioner's call goes back through the agents server to the BAND desk room
        if (e.bandId && cur.commissioner) post('/agents/verdict', { id: e.bandId, decision: e.decision }).then((r) => r.json()).then((r) => debug.verdicts.push({ band: r })).catch((x) => debug.errors.push('verdict ' + x.message));
      }
    }
    toOdds(feed);
  }

  // ---------- agents server: BAND plans and proposals (exhibition: the client owns the sim) ----------
  function tick(m) {
    if (!cur || m.over || m.introT > 0 || cur.inFlight || m.clock < cur.nextAt) return;
    cur.inFlight = true; cur.nextAt = m.clock + PLAN_EVERY_S;
    const humans = [], wrestlers = [];
    let hn = 0;
    m.w.forEach((w) => {
      if (!w.entered) return;
      const base = { stamina: +(w.st / 100).toFixed(2), down: ['down', 'thrown'].includes(w.state), eliminated: !!w.out };
      if (w.human) humans.push({ id: `p${++hn}`, situation: 'opening', ...base });
      else if (w.id !== 'riot') wrestlers.push({ id: w.id, ...base });
    });
    const body = { match: cur.matchId, t_ms: Math.round(m.clock * 1000), wrestlers, humans, crowd: {}, pin: null };
    post('/agents/plan', body).then((r) => r.json()).then((res) => {
      if (res.error) throw new Error(res.error);
      debug.pending = (res.pending || []).map((p) => p.id);
      adoptBand(m, res.pending);
      (res.plans || []).forEach((p, k) => {
        const meta = res.meta?.[k] || {};
        debug.plans.push({ t: body.t_ms, wrestler: p.wrestler, intent: p.intent, target: p.target, source: meta.source });
        const sig = `${p.intent}|${p.target}`;
        if (cur.last[p.wrestler] === sig) return;
        cur.last[p.wrestler] = sig;
        if (p.wrestler === 'lou' && !p.target) return;
        const label = meta.source === 'openai' ? `LLM, ${((meta.ms || 0) / 1000).toFixed(1)} s` : meta.source || 'fallback';
        logRow(planHtml({ ...p, label }, p.wrestler === 'lou' ? 'REF' : meta.source === 'openai' ? 'LLM' : 'BAND'), `royal-plan-${p.wrestler}`, false);
        // the plan sets attitude only for wrestlers outside the alliance machinery
        const w = m.w.find((x) => x.id === p.wrestler && !x.human);
        if (w && w.intent === 'pressure' && ['counter', 'taunt', 'toss', 'pin', 'target'].includes(p.intent)) w.intent = p.intent;
      });
    }).catch((e) => { debug.errors.push('agents/plan ' + e.message); cur && (cur.nextAt = m.clock + 2); })
      .finally(() => { if (cur) cur.inFlight = false; });
  }

  addEventListener('keydown', (e) => {
    if (!cur || e.repeat || e.target?.tagName === 'INPUT') return;
    if (e.code === 'KeyY') vote('y');
    else if (e.code === 'KeyN') vote('n');
    else if (e.code === 'KeyO') setOdds(!cur.oddsOn);
  });

  return { start, stop, frame, events, tick, debug, setCommissioner(b) { if (cur && cur.commissioner !== b) { cur.commissioner = b; cur.shown = null; } }, setCommissioner(b) { if (cur && cur.commissioner !== b) { cur.commissioner = b; cur.shown = null; } }, get active() { return !!cur; } };
}
