// The sponsor-judged agent layer, seen from the client: Bruin memory (facts out, marts in), BAND agent
// plans in the decision log, and the booth (voice). main.js calls the hooks; nothing here blocks a frame.
//   const layer = createAgentLayer({ logRow, call });
//   layer.matchStart({ match, wrestlers: [id, id], humans: [bool, bool] })  -> Promise<habits|null>
//   layer.facts(facts)  layer.tick(simState)  layer.matchEnd()
const SIM_TO_ROSTER = { kane: 'brutus' };
const NAMES = { vex: 'Vex', kane: 'Kane', brutus: 'Kane', silas: 'Crane', mae: 'Mae', lou: 'Lou', commissioner: 'Commissioner' };
const TINT = { vex: '#2b8cff', kane: '#e8333b', silas: '#8b5cf6', mae: '#c0c6cf', lou: '#f1f1f1' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function createAgentLayer({ logRow, call }) {
  let cur = null; // { match, ids, humans, wrestlers, buf, flushT }
  const debug = { written: 0, memory: null, plans: [], agents: null, errors: [] };
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
      if (g && g.grudge > 0) logRow(planHtml({ wrestler: ai, intent: 'grudge', target: g.about, reason: `trust ${g.trust}, grudge ${g.grudge}${g.last_betrayal ? `, betrayed in ${g.last_betrayal}` : ''}`, cites: [g.cite] }, 'BRUIN'));
      debug.memoryText = `${who} habits from Bruin`;
      return best ? habits : null;
    } catch (e) {
      debug.errors.push('mem/for ' + e.message);
      return null;
    }
  }

  function facts(list) { if (cur) cur.buf.push(...list); }

  async function matchEnd() {
    if (!cur) return;
    clearInterval(cur.flushT);
    await flush();
    post('/mem/end', { match: cur.match }).catch(() => {}); // Bruin refresh runs server side; never awaited
  }

  return { matchStart, facts, matchEnd, tick() {}, debug };
}

// One decision-log row: source chip, who -> intent (target), the reason, then the mart rows it cites.
export function planHtml(p, source = 'BAND') {
  const who = NAMES[p.wrestler] || p.wrestler, tint = TINT[p.wrestler] || '#f5c542';
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
.dl-v { color: #7ee0a1; font-size: 11px; } .dl-v.no { color: #ff8a8a; }
.dl-r { display: block; color: #cfd6e1; }
.dl-c { display: block; font: 10.5px/1.35 ui-monospace, Consolas, monospace; color: #9aa3b2; word-break: break-word; }
@keyframes dl-in { from { opacity: 0; transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .dl-row { animation: none; } }
@media (max-width: 720px) { .log { width: auto; left: 16px; max-height: 30vh; } }
`;
document.head.appendChild(css);
