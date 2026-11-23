// Game memory on the server side: sim facts -> bruin/data/events.jsonl, a Bruin refresh between matches, and
// cached mart reads for the next match. Used by the Colyseus room directly and by the browser through the
// vite plugin (game/server/memory-plugin.js) for exhibition matches.
import { appendFileSync, copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshMemory, ask } from '../../bruin/memory.mjs';

const BRUIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bruin');
// Keys for the Bruin inference asset come from the repo .env (never logged); the shell's env wins.
const ENV = join(BRUIN, '..', '.env');
if (existsSync(ENV)) for (const line of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
export const EVENTS = join(BRUIN, 'data', 'events.jsonl');
const FIXTURES = join(BRUIN, 'fixtures', 'events.jsonl');
const KINDS = new Set(['strike', 'grapple', 'block', 'reversal', 'knockdown', 'pin', 'kickout', 'elimination', 'entry',
  'taunt', 'alliance_offer', 'alliance_reply', 'betray', 'plan', 'commentary']);
const SITUATIONS = new Set(['opening', 'after_block', 'low_stamina', 'cornered']);
const ROSTER = new Set(readFileSync(join(BRUIN, 'assets', 'seeds', 'wrestlers.csv'), 'utf8')
  .split(/\r?\n/).slice(1).map((l) => l.split(',')[0]).filter(Boolean));
const SIM_TO_ROSTER = { kane: 'brutus' }; // the sim's id for Brutus Kane

// A sim slot -> Bruin roster id: humans are p1/p2 (habits are per player), AI slots are their wrestler.
export function rosterIds(wrestlerIds, humanSlots) {
  let n = 0;
  return wrestlerIds.map((id, i) => (humanSlots[i] ? `p${++n}` : SIM_TO_ROSTER[id] || id));
}

const seq = new Map();
// facts: sim 'fact' events (slots). ids: rosterIds(...). Drops anything the staging checks would reject,
// since one bad row blocks the whole refresh.
export function appendFacts(match, facts, ids) {
  if (!existsSync(EVENTS) || statSync(EVENTS).size === 0) copyFileSync(FIXTURES, EVENTS); // keep the seeded history
  const lines = [];
  for (const f of facts) {
    const actor = ids[f.actor], target = f.target == null ? null : ids[f.target];
    if (!KINDS.has(f.kind) || !SITUATIONS.has(f.situation) || !ROSTER.has(actor) || (target && !ROSTER.has(target))) continue;
    const n = (seq.get(match) || 0) + 1; seq.set(match, n);
    const row = { event_id: `${match}-${String(n).padStart(4, '0')}`, match, t_ms: f.t_ms, actor, kind: f.kind, situation: f.situation };
    if (target) row.target = target;
    if (typeof f.success === 'boolean') row.success = f.success;
    if (f.text) row.text = f.text;
    lines.push(JSON.stringify(row));
  }
  if (lines.length) appendFileSync(EVENTS, lines.join('\n') + '\n');
  return lines.length;
}

// One refresh at a time; a request during a refresh queues exactly one more. Never awaited by the game loop.
let running = null, again = false;
export const status = { refreshes: 0, lastOk: null, lastMs: null, lastAt: null, running: false };
export function refreshSoon() {
  if (running) { again = true; return running; }
  status.running = true;
  const t0 = Date.now();
  running = refreshMemory().then((ok) => {
    Object.assign(status, { refreshes: status.refreshes + 1, lastOk: ok, lastMs: Date.now() - t0, lastAt: new Date().toISOString(), running: false });
    cache.clear();
    console.log(`[memory] bruin refresh ${ok ? 'ok' : 'FAILED (a check blocked it; last good marts kept)'} in ${status.lastMs} ms`);
  }).finally(() => { running = null; if (again) { again = false; refreshSoon(); } });
  return running;
}

// Mart reads, cached until the next refresh (memory only changes between matches).
// bruin query opens the DuckDB file read-write, so two at once fail on the lock: reads go one at a time.
const cache = new Map();
let lane = Promise.resolve();
export async function askCached(name, vars = {}) {
  const k = name + JSON.stringify(vars);
  if (!cache.has(k)) {
    const p = lane.then(() => ask(name, vars));
    lane = p.catch(() => {});
    cache.set(k, p.catch((e) => { cache.delete(k); throw e; }));
  }
  return cache.get(k);
}

// What the next match's AI reads: the player's habits in every situation, and who it holds grudges against.
export async function memoryFor(player, wrestler) {
  if (running) await running; // do not read half-written marts
  const habits = {};
  for (const row of await askCached('habits_all', { player })) (habits[row.situation] ||= {})[row.move] = { n: row.n, share: row.share, cite: row.cite };
  const feelings = wrestler ? await askCached('feelings_of', { me: SIM_TO_ROSTER[wrestler] || wrestler }).catch(() => []) : [];
  return { habits, feelings, refresh: { ...status } };
}

export function eventCount() {
  if (!existsSync(EVENTS)) return 0;
  return readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean).length;
}
