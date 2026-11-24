// Broadcast lower-third for wrestler promos. Lines come from the promo service (agents/promo, POST /promo on :8789).
//
//   import { createPromo } from './ui/promo.js';
//   const promo = createPromo({ speak: createTTS().speak });          // speak is optional (voice/tts.js)
//   await promo.play({ moment: 'pre', speaker: 'mae', opponent: 'silas', match_state: {} });
//
// play() resolves when every line has shown (or Esc closes it). Enter finishes the typing, then skips to the next line.
// Each line shows the Bruin memory it quoted ("facts"), so the audience sees the agent remembering.

const TAG = { pre: 'Pre-match promo', mid: 'Trash talk', post: 'Post-match' };
const TYPE_MS = 22;            // per character
const HOLD_MS = 900;           // after typing, plus reading time below
const READ_MS_PER_CHAR = 38;

export function createPromo({ base = 'http://127.0.0.1:8789', art = '/art', root = document.body, speak = null,
  stop = null, timeoutMs = 4000, subtitle = false } = {}) {
  const el = document.createElement('div');
  el.className = 'promo';
  // subtitle: audio-first (owner 16:17). The voice carries the promo; the screen shows one subtitle line and a small
  // speaker tag, bottom center, no portrait card and no type-on.
  el.classList.toggle('sub', subtitle);
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="promo-card">
      <div class="promo-portrait"><img alt="" /></div>
      <div class="promo-body">
        <div class="promo-tag"></div>
        <div class="promo-name display"></div>
        <p class="promo-text"></p>
        <div class="promo-memory"></div>
      </div>
      <kbd class="promo-skip">Enter</kbd>
    </div>`;
  root.appendChild(el);
  const $ = s => el.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let skip = null;   // resolves the current wait early
  let closed = false;

  function onKey(e) {
    if (!el.classList.contains('on')) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); skip?.(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closed = true; skip?.(); }
  }
  addEventListener('keydown', onKey, true);

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // at least ms, and until `until` settles; Enter ends it at once
  function hold(ms, until) {
    return new Promise(resolve => {
      const done = () => { clearTimeout(t); skip = null; resolve(); };
      skip = () => { stop?.(); done(); }; // a skipped line cuts its voice
      const t = setTimeout(() => until.then(done), ms);
    });
  }

  async function typeOn(node, text) {
    let cut = reduced || subtitle;
    skip = () => { cut = true; };
    for (let i = 1; i <= text.length && !cut; i++) { node.textContent = text.slice(0, i); await sleep(TYPE_MS); }
    skip = null;
    node.textContent = text;
  }

  async function showLine(line, moment, side) {
    el.dataset.side = side;
    el.dataset.speaker = line.speaker;
    $('.promo-tag').textContent = TAG[moment] ?? 'Promo';
    $('.promo-name').textContent = line.name ?? line.speaker;
    const img = $('.promo-portrait img');
    img.onerror = () => { img.removeAttribute('src'); el.classList.add('no-art'); };
    el.classList.remove('no-art');
    img.src = `${art}/portrait-${line.speaker}.jpg`;
    const facts = line.facts?.length ? line.facts : line.cites ?? [];
    $('.promo-memory').innerHTML = '';
    for (const f of facts) {
      const s = document.createElement('span');
      s.textContent = f;
      $('.promo-memory').appendChild(s);
    }
    el.classList.toggle('has-memory', facts.length > 0);
    el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');

    const voice = speak ? Promise.resolve(speak({ speaker: line.speaker, text: line.text })).catch(() => {}) : null;
    await typeOn($('.promo-text'), line.text);
    if (closed) return;
    // voiced: hold until the audio ends; silent: hold for reading time
    await hold(HOLD_MS + (voice ? 0 : line.text.length * READ_MS_PER_CHAR), voice ?? Promise.resolve());
  }

  async function show(lines, moment = 'pre') {
    closed = false;
    const order = [...new Set(lines.map(l => l.speaker))];
    el.classList.add('on');
    try {
      for (const line of lines) {
        if (closed) break;
        await showLine(line, moment, order.indexOf(line.speaker) % 2 ? 'right' : 'left');
      }
    } finally {
      el.classList.remove('on');
      stop?.();
      if (speak && 'speechSynthesis' in globalThis) speechSynthesis.cancel();
    }
  }

  async function fetchLines(req) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(`${base}/promo`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req), signal: ctl.signal });
      if (!r.ok) throw new Error(`promo ${r.status}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // fetch + show; never throws (a dead promo service just means no promo)
  async function play(req) {
    try {
      const out = await fetchLines(req);
      await show(out.lines, req.moment);
      return out;
    } catch (e) {
      console.warn('[promo] skipped', e);
      return null;
    }
  }

  function destroy() { removeEventListener('keydown', onKey, true); el.remove(); }

  return { play, show, fetchLines, close: () => { closed = true; skip?.(); }, destroy, el };
}
