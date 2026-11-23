// DOM check of game/ui/promo.js where Chromium cannot start: runs the real module under jsdom against the real
// promo server (spawned here), walks a promo with Enter, and asserts what a player would see in the lower-third.
//   node agents/promo/dom_check.mjs <path to jsdom>     e.g. /tmp/pw/node_modules/jsdom
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { JSDOM } = require(process.argv[2] || 'jsdom');
const ROOT = resolve(import.meta.dirname, '../..');
const PORT = 8789;

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1/' });
const w = dom.window;
Object.assign(globalThis, { document: w.document, KeyboardEvent: w.KeyboardEvent,
  addEventListener: w.addEventListener.bind(w), removeEventListener: w.removeEventListener.bind(w),
  matchMedia: () => ({ matches: false }) });

// reuse a promo server already on PORT, else start one for this run
const health = await fetch(`http://127.0.0.1:${PORT}/health`).then(r => r.json()).catch(() => null);
let py = null;
if (health) console.log(`[server] reusing :${PORT} ${JSON.stringify(health)}`);
else {
  py = spawn('python3', ['-m', 'agents.promo'], { cwd: ROOT, env: { ...process.env, HEEL_PROMO_PORT: String(PORT) } });
  await new Promise((r, j) => { py.stdout.on('data', d => { process.stdout.write(`[server] ${d}`); r(); }); py.on('exit', j); });
}

try {
  const { createPromo } = await import(resolve(ROOT, 'game/ui/promo.js'));
  const spoken = [];
  const promo = createPromo({ base: `http://127.0.0.1:${PORT}`, speak: l => { spoken.push(l); return new Promise(r => setTimeout(r, 400)); } });
  const el = promo.el;
  const $ = s => el.querySelector(s);
  const enter = () => w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
  const tick = ms => new Promise(r => setTimeout(r, ms));

  for (const req of [
    { moment: 'pre', speaker: 'vex', opponent: 'kane', match_state: { players: { kane: 'p1' } } },
    { moment: 'mid', speaker: 'mae', opponent: 'silas', match_state: { event: 'near_fall' } },
  ]) {
    const t0 = performance.now();
    const done = promo.play(req);
    while (!el.classList.contains('on')) await tick(20);
    const visibleMs = performance.now() - t0;
    await tick(60);
    const partial = $('.promo-text').textContent;
    const seen = [];
    while (el.classList.contains('on')) {
      enter(); await tick(40);                       // finish typing
      seen.push({ side: el.dataset.side, name: $('.promo-name').textContent, text: $('.promo-text').textContent,
        img: $('.promo-portrait img').getAttribute('src'), memory: [...el.querySelectorAll('.promo-memory span')].map(s => s.textContent) });
      enter(); await tick(40);                       // next line
    }
    const out = await done;
    console.log(`\n[${req.moment}] ${req.speaker} vs ${req.opponent}: overlay visible after ${visibleMs.toFixed(0)} ms, ` +
      `source=${out.meta.source}${out.meta.error ? ` (${out.meta.error})` : ''}; typing mid-line: "${partial}"`);
    for (const s of seen) console.log(`  [${s.side}] ${s.name} (${s.img}): ${s.text}${s.memory.length ? `  | memory: ${s.memory.join(' ; ')}` : ''}`);
    assert.equal(seen.length, out.lines.length, 'one card per line, Enter skips through all');
    assert.deepEqual(seen.map(s => s.text), out.lines.map(l => l.text), 'each card shows the full line after Enter');
    assert.ok(partial.length < out.lines[0].text.length, 'text types on');
    assert.ok(seen.every(s => s.img === `/art/portrait-${out.lines[seen.indexOf(s)].speaker}.jpg`), 'portrait per speaker');
    if (req.moment === 'pre') assert.deepEqual([...new Set(seen.map(s => s.side))], ['left', 'right'], 'speakers on opposite sides');
    assert.ok(seen.some(s => s.memory.length), 'memory facts shown');
  }
  assert.equal(spoken.length >= 3, true, 'speak hook called per line');
  console.log(`\nspeak() called ${spoken.length} times; all assertions passed`);
  promo.destroy();
} finally {
  py?.kill();
}
