// Small-N spot check: counter rate when the AI's plan comes from the agents/ LLM planner (POST /plan, as
// game/agent-layer.js does every 4 s) vs the sim's own counting model. Same 10 seeds, same bot humans, memory OFF.
//   node learning/llm_check.mjs [--matches 10]
// Spawns `python3 -m agents.server` on a free port with HEEL_BAND_MODE=mock (no BAND traffic) and kills it at the end.
// Needs OPENAI_API_KEY in the environment; without it the server answers from its deterministic fallback, and this says so.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { runMatch, PERSONAS } from './batch.mjs';
import { situationOf } from '../game/shared/sim.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('matches', 10);
const freePort = () => new Promise((ok) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const port = await freePort(), base = `http://127.0.0.1:${port}`;
const srv = spawn('python3', ['-m', 'agents.server'], { cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, HEEL_AGENTS_PORT: String(port), HEEL_BAND_MODE: 'mock' }, stdio: ['ignore', 'ignore', 'pipe'] });
let errText = ''; srv.stderr.on('data', (d) => { errText += d; });

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    if (i > 50) throw new Error(`agents server did not start: ${errText.slice(-400)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  const sources = {}, errors = [];
  let matchId = 0;
  const llmPlanner = (match) => async (m) => {
    const habits = Object.fromEntries(Object.entries(m.habits).map(([s, mv]) => [s, Object.fromEntries(Object.entries(mv).map(([k, n]) => [k, n - 1]))]));
    const st = (w) => ({ stamina: +(w.st / 100).toFixed(2), down: ['down', 'pinned', 'thrown'].includes(w.state), eliminated: !!w.out });
    const body = { match, t_ms: Math.round(m.clock * 1000), wrestlers: [{ id: 'mae', ...st(m.w[1]) }],
      humans: [{ id: 'p1', situation: situationOf(m), ...st(m.w[0]), habits }],
      crowd: { p1: +(m.w[0].mo / 100).toFixed(2), mae: +(m.w[1].mo / 100).toFixed(2) }, pin: null };
    const res = await (await fetch(`${base}/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const k = (res.plans || []).findIndex((p) => p.wrestler === 'mae');
    if (k < 0) { errors.push(res.error || 'no plan for mae'); return null; }
    const p = res.plans[k], meta = res.meta[k];
    sources[meta.source] = (sources[meta.source] || 0) + 1;
    if (meta.error) errors.push(meta.error);
    const expect = (p.cites?.[0] || '').match(/\/(strike|grapple|block)$/)?.[1] || null; // same parse as agent-layer.js
    return { intent: p.intent, expect };
  };

  const names = ['striker', 'turtle', 'grappler'], rows = [], lat = [];
  for (let i = 0; i < N; i++) {
    const persona = names[i % names.length], seed = 7001 + i, table = PERSONAS[persona](0, 1);
    const count = await runMatch({ seed, habits: null, table });
    const llm = await runMatch({ seed, habits: null, table, extPlanner: llmPlanner(`learning-llm-${++matchId}-${Date.now()}`) });
    lat.push(...llm.lat);
    for (const [arm, r] of [['counting', count], ['llm', llm]]) rows.push({ arm, persona, seed, human_moves: r.human_moves, countered: r.countered, rate: r.human_moves ? r.countered / r.human_moves : 0 });
    console.error(`match ${i + 1}/${N} ${persona}: counting ${(rows.at(-2).rate * 100).toFixed(0)}%  llm ${(rows.at(-1).rate * 100).toFixed(0)}%`);
  }
  const stat = (a) => { const m = a.reduce((s, x) => s + x, 0) / a.length, sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); return { mean: +m.toFixed(3), ci95: +(1.96 * sd / Math.sqrt(a.length)).toFixed(3), n: a.length }; };
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
  const ok = (r) => r.human_moves > 0; // no human move = no counter rate (excluded, counted below)
  const pairs = rows.filter((r) => r.arm === 'llm').map((r, i) => [r, rows.filter((x) => x.arm === 'counting')[i]]).filter(([a, b]) => ok(a) && ok(b));
  const diffs = pairs.map(([a, b]) => a.rate - b.rate);
  const out = {
    excluded_zero_move_matches: rows.filter((r) => !ok(r)).length,
    note: 'SMALL N spot check, not the learning proof. Memory OFF both arms; same seeds and bot humans.',
    openai_key_present: !!process.env.OPENAI_API_KEY, plan_sources: sources, errors: [...new Set(errors)].slice(0, 5),
    counting: stat(pairs.map(([, b]) => b.rate)), llm: stat(pairs.map(([a]) => a.rate)),
    llm_minus_counting_paired: stat(diffs),
    plan_latency_ms: { n: lat.length, p50: q(lat, 0.5), p90: q(lat, 0.9), max: Math.round(Math.max(...lat)) }, rows,
  };
  writeFileSync('docs/learning/llm-spot-check.json', JSON.stringify(out, null, 2) + '\n');
  const { rows: _, ...brief } = out;
  console.log(JSON.stringify(brief, null, 2));
} finally { srv.kill(); }
