// Vite dev plugin: the browser's exhibition matches reach game/server/memory.js over /mem/*.
//   POST /mem/events {match, ids, facts}   append sim facts to bruin/data/events.jsonl
//   POST /mem/end    {match}               kick a Bruin refresh (returns at once)
//   GET  /mem/for?player=p1&wrestler=kane  habits + feelings from the marts for the next match
//   GET  /mem/status                       refresh status and the events row count
import { appendFacts, refreshSoon, memoryFor, status, eventCount } from './memory.js';

const SAFE = /^[a-z0-9_]+$/;
const body = (req) => new Promise((res, rej) => {
  let s = ''; req.on('data', (c) => { s += c; if (s.length > 1 << 20) req.destroy(); });
  req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch (e) { rej(e); } }); req.on('error', rej);
});
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

export default function memoryPlugin() {
  return {
    name: 'heel-memory',
    configureServer(server) {
      server.middlewares.use('/mem', async (req, res) => {
        try {
          const u = new URL(req.url, 'http://x');
          if (req.method === 'POST' && u.pathname === '/events') {
            const { match, ids, facts } = await body(req);
            if (!SAFE.test(match || '') || !Array.isArray(ids) || !Array.isArray(facts)) return send(res, 400, { error: 'bad body' });
            return send(res, 200, { written: appendFacts(match, facts, ids) });
          }
          if (req.method === 'POST' && u.pathname === '/end') { refreshSoon(); return send(res, 202, { refreshing: true }); }
          if (u.pathname === '/for') {
            const player = u.searchParams.get('player') || 'p1', wrestler = u.searchParams.get('wrestler') || '';
            if (!SAFE.test(player) || (wrestler && !SAFE.test(wrestler))) return send(res, 400, { error: 'bad ids' });
            return send(res, 200, await memoryFor(player, wrestler));
          }
          if (u.pathname === '/status') return send(res, 200, { ...status, events: eventCount() });
          send(res, 404, { error: 'not found' });
        } catch (e) { send(res, 500, { error: String(e?.message || e) }); }
      });
    },
  };
}
