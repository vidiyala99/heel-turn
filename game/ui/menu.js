// HEEL TURN front-end shell: title, menus, roster, versus, pause, results.
// Talks to the engine only through window.HEEL = { startMatch(cfg), onMatchEnd(cb), toMenu(), setPaused(bool) }.
// The engine may load after this file (or not at all); every call is guarded.

const ROSTER = [
  { id: 'vex', name: 'Vex', full: 'Vex “The Voltage”', role: 'Showboat', tint: '#2b8cff',
    line: 'Fast hands, faster mouth. Wins the crowd first, the match second.', power: 55, speed: 90, technique: 70 },
  { id: 'kane', name: 'Brutus Kane', full: 'Brutus Kane', role: 'Brute', tint: '#e8333b',
    line: 'Does not run the ropes. Runs through them.', power: 95, speed: 42, technique: 50 },
  { id: 'silas', name: 'Silas Crane', full: 'Silas Crane', role: 'Schemer', tint: '#8b4dff',
    line: 'Studies you for three rounds, then takes the fourth.', power: 60, speed: 66, technique: 92 },
  { id: 'mae', name: 'Old Iron Mae', full: 'Old Iron Mae', role: 'Veteran', tint: '#c9ced8',
    line: 'Thirty years in the ring. She has a counter for everything you try.', power: 76, speed: 52, technique: 86 },
];
const byId = Object.fromEntries(ROSTER.map((w) => [w.id, w]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- settings (per-viewer convenience; engine reads window.HEEL_SETTINGS) ----------
const SETTINGS_KEY = 'heelturn.settings';
const settings = { volume: 0.7, shake: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch {}
window.HEEL_SETTINGS = settings;
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  const H = engine(); if (H && typeof H.setSettings === 'function') H.setSettings({ ...settings });
  dispatchEvent(new CustomEvent('heel:settings', { detail: { ...settings } }));
}

// ---------- sound: tiny synth blips, no asset files ----------
let ac = null;
function blip(kind) {
  if (settings.volume <= 0) return;
  try {
    ac = ac || new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    const spec = { move: [520, 0.04, 'square'], ok: [780, 0.09, 'sawtooth'], back: [240, 0.08, 'triangle'], lock: [140, 0.12, 'square'], slam: [90, 0.35, 'sawtooth'] }[kind];
    o.type = spec[2]; o.frequency.setValueAtTime(spec[0], t);
    if (kind === 'ok') o.frequency.exponentialRampToValueAtTime(spec[0] * 1.5, t + spec[1]);
    if (kind === 'slam') o.frequency.exponentialRampToValueAtTime(40, t + spec[1]);
    g.gain.setValueAtTime(0.12 * settings.volume, t); g.gain.exponentialRampToValueAtTime(0.0001, t + spec[1]);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + spec[1] + 0.02);
  } catch {}
}

// ---------- engine bridge ----------
const engine = () => (window.HEEL && typeof window.HEEL === 'object' ? window.HEEL : null);
function callEngine(fn, ...args) {
  const H = engine();
  if (!H || typeof H[fn] !== 'function') return false;
  try { H[fn](...args); return true; } catch (e) { console.warn('[HEEL ui]', fn, e); return false; }
}
let hookedEnd = false;
function hookEngine() {
  const H = engine(); if (!H) return false;
  if (!hookedEnd && typeof H.onMatchEnd === 'function') { H.onMatchEnd((r) => showResults(r)); hookedEnd = true; }
  if (state !== 'match' && state !== 'pause') callEngine('toMenu');
  return true;
}
if (!hookEngine()) { const iv = setInterval(() => { if (hookEngine()) clearInterval(iv); }, 200); }

// ---------- DOM ----------
const art = (id, kind = 'portrait') => `/art/${kind}-${id}.jpg`;
function face(w, cls = '') {
  if (!w) return `<div class="sil ${cls}" style="--tint:#333"></div>`;
  return `<img class="${cls}" src="${art(w.id)}" alt="${w.full}" onerror="this.outerHTML='<div class=&quot;sil&quot; style=&quot;--tint:${w.tint}&quot;></div>'">`;
}
const keys = (...k) => k.map((x) => `<kbd class="k">${x}</kbd>`).join('');
const rail = (items) => `<div class="rail">${items.map(([k, t]) => `<span>${k} ${t}</span>`).join('')}</div>`;
const RAIL_STD = rail([[keys('↑', '↓'), 'Move'], [keys('Enter'), 'Select'], [keys('Esc'), 'Back']]);

const MENU = [
  { id: 'exhibition', label: 'Exhibition', desc: 'One on one against the AI. It watches what you lean on and plans around it, match after match.' },
  { id: 'ladder', label: 'Ladder Match', desc: 'A briefcase hangs over the ring. Carry the ladder, climb it, and watch who shoves it over.' },
  { id: 'online', label: 'Online', desc: 'Make a room and send the link. Your friend lands straight on the roster screen.' },
  { id: 'royal', label: 'Over the Top', desc: 'Battle royal: five wrestlers, one ring. The AIs make deals and break them; you rule on every bribe and betrayal.' },
  { id: 'tag', label: 'Tag Team', locked: true, desc: 'Two on two with hot tags. Locked: coming after Over the Top.' },
  { id: 'howto', label: 'How to Play', desc: 'Controls, the strike, grapple, block triangle, and how the AI learns.' },
  { id: 'settings', label: 'Settings', desc: 'Volume and camera shake.' },
];

const ui = document.createElement('div'); ui.id = 'ui';
ui.innerHTML = `
<section class="screen" id="s-title" aria-label="Title">
  <div class="scrim light"></div>
  <div class="wordmark">
    <h1 class="display">Heel <b>Turn</b></h1>
    <div class="slashbar"></div>
  </div>
  <button class="press display" data-act="start">Press Enter</button>
</section>

<section class="screen" id="s-menu" aria-label="Main menu">
  <div class="scrim"></div>
  <div class="menu-wrap">
    <div class="mini display">Heel <b>Turn</b></div>
    <nav class="mlist">${MENU.map((m) => `<button class="mi display${m.locked ? ' locked' : ''}" data-nav data-id="${m.id}">${m.label}${m.locked ? '<span class="lock">LOCKED</span>' : ''}</button>`).join('')}</nav>
  </div>
  <aside class="mdesc"><h3 class="display" id="md-h"></h3><p id="md-p"></p></aside>
  ${RAIL_STD}
</section>

<section class="screen" id="s-howto" aria-label="How to play">
  <div class="scrim full"></div>
  <div class="panel">
    <h2 class="display">How to <b>Play</b></h2>
    <div class="howto">
      <div>
        <h4>Controls</h4>
        <div class="ctl">
          <div class="keys2">${keys('W', 'A', 'S', 'D')}</div><div>Move around the ring</div>
          <div class="keys2">${keys('J')}</div><div>Strike</div>
          <div class="keys2">${keys('K')}</div><div>Grapple. Next to a downed opponent it pins; mash it to kick out.</div>
          <div class="keys2">${keys('L')}</div><div>Block (hold)</div>
          <div class="keys2">${keys('Space')}</div><div>Taunt to build your gold meter</div>
          <div class="keys2">${keys('K')}</div><div>With a full gold meter: finisher</div>
          <div class="keys2">${keys('Esc')}</div><div>Pause</div>
        </div>
      </div>
      <div>
        <h4>The triangle</h4>
        <div class="tri"><svg viewBox="0 0 300 260" role="img" aria-label="Strike beats grapple, grapple beats block, block beats strike">
          <defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#f5c542"/></marker></defs>
          <g stroke="#f5c542" stroke-width="3" fill="none" marker-end="url(#ah)">
            <path d="M160 52 L238 186"/><path d="M222 214 L78 214"/><path d="M62 186 L140 52"/>
          </g>
          <text x="150" y="38" text-anchor="middle">Strike</text>
          <text x="262" y="222" text-anchor="middle">Grapple</text>
          <text x="38" y="222" text-anchor="middle">Block</text>
          <text class="lbl" x="226" y="112">beats</text><text class="lbl" x="150" y="240" text-anchor="middle">beats</text><text class="lbl" x="44" y="112">beats</text>
        </svg></div>
      </div>
    </div>
    <p class="note"><strong>The AI learns your habits.</strong> Every match it logs what you do at the opening bell, after a block, when you are gassed and when you are cornered, then plans to counter it. Win the same way twice and expect it to be waiting. The results screen shows what it picked up.</p>
    <div class="row"><button class="btn focus" data-nav data-act="back">Back</button></div>
  </div>
</section>

<section class="screen" id="s-settings" aria-label="Settings">
  <div class="scrim full"></div>
  <div class="panel">
    <h2 class="display">Set<b>tings</b></h2>
    <div class="set" data-nav data-set="volume"><label>Volume</label><div class="meter"><i id="vol-i"></i></div><span class="val" id="vol-v"></span></div>
    <div class="set" data-nav data-set="shake"><label>Camera shake</label><button class="toggle" id="shake-t" tabindex="-1"></button><span class="val"></span></div>
    <p class="small">${keys('←', '→')} change a setting. Saved on this browser.</p>
    <div class="row"><button class="btn" data-nav data-act="back">Back</button></div>
  </div>
</section>

<section class="screen" id="s-online" aria-label="Online">
  <div class="scrim full"></div>
  <div class="panel">
    <h2 class="display">Online <b>Room</b></h2>
    <div class="small">Room code</div>
    <div class="roomcode" id="room-code"></div>
    <div class="small">Send this link. It opens straight to the roster screen in the same room.</div>
    <div class="invite"><code id="room-link"></code></div>
    <div class="row">
      <button class="btn" data-nav data-act="copy">Copy link</button>
      <button class="btn" data-nav data-act="online-pick">Pick wrestler</button>
      <button class="btn" data-nav data-act="back">Back</button>
    </div>
  </div>
</section>

<section class="screen" id="s-select" aria-label="Character select">
  <div class="scrim full"></div>
  <div class="head"><h2 class="display" id="sel-h">Choose your wrestler</h2><span class="who" id="sel-who">P1</span></div>
  <div class="roster">${ROSTER.map((w) => `
    <button class="wcard" data-nav data-id="${w.id}" aria-label="${w.full}">
      ${face(w)}
      <span class="tagp p1">P1</span><span class="tagp p2" id="tag2-${w.id}">CPU</span>
      <div class="plate"><div class="nm display">${w.name}</div></div>
    </button>`).join('')}
  </div>
  <div class="detail">
    <div><div class="bigname display" id="d-name"></div><div class="gim" id="d-line"></div></div>
    <div class="stats">
      <span>Power</span><div class="meter"><i id="d-pow"></i></div>
      <span>Speed</span><div class="meter"><i id="d-spd"></i></div>
      <span>Technique</span><div class="meter"><i id="d-tec"></i></div>
    </div>
    <button class="btn randbtn" data-nav data-id="random">Random</button>
  </div>
  ${rail([[keys('←', '→'), 'Choose'], [keys('Enter'), 'Lock in'], [keys('R'), 'Random'], [keys('Esc'), 'Back']])}
</section>

<section class="screen" id="s-vs" aria-label="Versus">
  <div class="vs-half l" id="vs-l"></div>
  <div class="vs-half r" id="vs-r"></div>
  <div class="vs-mark display">VS</div>
  <div class="vs-sub" id="vs-sub"></div>
</section>

<section class="screen" id="s-pause" aria-label="Paused">
  <div class="scrim"></div>
  <div class="menu-wrap">
    <div class="mini display">Paused</div>
    <nav class="mlist">
      <button class="mi display" data-nav data-act="resume">Resume</button>
      <button class="mi display" data-nav data-act="restart">Restart match</button>
      <button class="mi display" data-nav data-act="howto">How to Play</button>
      <button class="mi display" data-nav data-act="quit">Quit to menu</button>
    </nav>
  </div>
  ${RAIL_STD}
</section>

<section class="screen" id="s-results" aria-label="Results">
  <div class="scrim full"></div>
  <div class="res">
    <div>
      <div class="win display" id="r-win"></div>
      <div class="how" id="r-how"></div>
      <table id="r-stats"></table>
      <div class="row">
        <button class="btn" data-nav data-act="rematch">Rematch</button>
        <button class="btn" data-nav data-act="reselect">Character select</button>
        <button class="btn" data-nav data-act="tomenu">Main menu</button>
      </div>
    </div>
    <div class="learned"><h3 class="display">What the AI learned about you</h3><ol id="r-learned"></ol></div>
  </div>
</section>
<div id="wipe"></div>
<div class="toast" id="toast" role="status"></div>`;
document.body.appendChild(ui);
const $ = (s) => ui.querySelector(s);

// ---------- state machine ----------
let state = null;          // title | menu | howto | settings | online | select | vs | match | pause | results
let focus = 0;
let howtoFrom = 'menu';
const match = { mode: 'exhibition', p1: null, p2: null, room: null, host: true, difficulty: 'normal' };
let selPhase = 'p1';
let toastT = 0;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
const navItems = () => [...ui.querySelectorAll(`#s-${state} [data-nav]`)];

function setFocus(i, sound = true) {
  const items = navItems(); if (!items.length) return;
  focus = (i + items.length) % items.length;
  const cls = state === 'select' && selPhase === 'p2' && items[focus].classList.contains('wcard') ? 'cpu-focus' : 'focus';
  items.forEach((el) => el.classList.remove('focus', 'cpu-focus'));
  items[focus].classList.add(cls);
  if (sound) blip('move');
  onFocus(items[focus]);
}

function onFocus(el) {
  if (state === 'menu') { const m = MENU.find((x) => x.id === el.dataset.id); $('#md-h').textContent = m.label; $('#md-p').textContent = m.desc; }
  if (state === 'select') {
    const w = byId[el.dataset.id];
    if (w) {
      $('#d-name').textContent = w.full; $('#d-line').textContent = `${w.role}. ${w.line}`;
      $('#d-pow').style.width = w.power + '%'; $('#d-spd').style.width = w.speed + '%'; $('#d-tec').style.width = w.technique + '%';
    } else { $('#d-name').textContent = 'Random'; $('#d-line').textContent = selPhase === 'p1' ? 'Let the bookers decide who you are tonight.' : 'Let the bookers pick your opponent.'; }
  }
}

function render(next, opts = {}) {
  ui.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${next}`));
  state = next;
  document.body.classList.toggle('in-match', next === 'match');
  if (next === 'settings') paintSettings();
  if (next === 'select') paintSelect();
  setFocus(opts.focus ?? 0, false);
}

// broadcast wipe: swap screens while the slab covers the frame
let wiping = false;
function go(next, opts = {}) {
  if (wiping) return;
  if (opts.instant) { render(next, opts); return; }
  const w = $('#wipe'); wiping = true;
  w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
  setTimeout(() => { render(next, opts); }, reduceMotion ? 150 : 190);
  setTimeout(() => { wiping = false; w.classList.remove('go'); }, reduceMotion ? 300 : 420);
}

// ---------- screens ----------
function paintSettings() {
  $('#vol-i').style.width = Math.round(settings.volume * 100) + '%';
  $('#vol-v').textContent = Math.round(settings.volume * 100);
  const t = $('#shake-t'); t.textContent = settings.shake ? 'On' : 'Off'; t.classList.toggle('on', settings.shake);
}
function adjustSetting(el, dir) {
  if (el.dataset.set === 'volume') settings.volume = Math.min(1, Math.max(0, Math.round((settings.volume + dir * 0.1) * 10) / 10));
  if (el.dataset.set === 'shake') settings.shake = !settings.shake;
  paintSettings(); saveSettings(); blip('move');
}

function paintSelect() {
  const who = $('#sel-who');
  $('#sel-h').textContent = selPhase === 'p1' ? 'Choose your wrestler' : 'Choose your opponent';
  if (selPhase === 'p1') { who.textContent = match.mode === 'online' ? 'You' : 'P1'; who.classList.remove('cpu'); }
  else { who.textContent = 'Opponent (CPU)'; who.classList.add('cpu'); }
  ui.querySelectorAll('#s-select .wcard').forEach((c) => c.classList.toggle('picked', selPhase === 'p2' && c.dataset.id === match.p1));
}

function pick(id) {
  if (id === 'random') {
    const pool = ROSTER.filter((w) => selPhase === 'p1' || w.id !== match.p1);
    id = pool[Math.floor(Math.random() * pool.length)].id;
    const idx = ROSTER.findIndex((w) => w.id === id); setFocus(idx, false);
  }
  blip('lock');
  if (selPhase === 'p1') {
    match.p1 = id;
    if (match.mode === 'online') { match.p2 = null; return toVersus(); }
    if (match.mode === 'royal') { match.p2 = null; return startMatch(); } // the card fills itself; straight to the bell
    // Exhibition and Ladder: the bookers pick your opponent from the other three, then straight on.
    const others = ROSTER.filter((w) => w.id !== id);
    match.p2 = others[Math.floor(Math.random() * others.length)].id;
    if (match.mode === 'ladder') { location.href = `/ladder.html?p1=${match.p1}&p2=${match.p2}`; return; }
    toVersus();
  } else { match.p2 = id; toVersus(); }
}

function paintHalf(el, w, label) {
  el.innerHTML = `${w ? face(w) : '<div class="sil" style="--tint:#3b2d07"></div>'}<div class="nm display">${w ? w.full : 'Challenger'}<small>${w ? w.role : label}</small></div>`;
}
let vsTimer = 0;
function toVersus() {
  paintHalf($('#vs-l'), byId[match.p1]);
  paintHalf($('#vs-r'), byId[match.p2], match.mode === 'online' ? `Waiting in room ${match.room}` : '');
  $('#vs-sub').textContent = match.mode === 'online' ? `Online room ${match.room}` : 'Exhibition match';
  go('vs');
  setTimeout(() => { const s = $('#s-vs'); s.classList.remove('vs-anim'); void s.offsetWidth; s.classList.add('vs-anim'); blip('slam'); }, reduceMotion ? 150 : 190);
  clearTimeout(vsTimer);
  vsTimer = setTimeout(startMatch, 2000 + 190);
}

function startMatch() {
  const cfg = { mode: match.mode, p1: match.p1, p2: match.p2, difficulty: match.difficulty };
  if (match.mode === 'online' || (match.mode === 'royal' && match.room)) { cfg.room = match.room; cfg.host = match.host; }
  const ok = callEngine('startMatch', cfg);
  if (!ok) toast('Engine not connected yet. Showing the practice fight.');
  go('match');
}

function pause() { callEngine('setPaused', true); blip('back'); go('pause', { instant: true }); }
function resume() { callEngine('setPaused', false); blip('ok'); go('match', { instant: true }); }
function quitToMenu() { callEngine('toMenu'); go('menu'); }

function newRoom() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  match.room = Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  match.host = true;
  const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('room', match.room);
  $('#room-code').textContent = match.room; $('#room-link').textContent = url.toString();
}
async function copyLink() {
  const txt = $('#room-link').textContent;
  try { await navigator.clipboard.writeText(txt); toast('Invite link copied'); }
  catch {
    const r = document.createRange(); r.selectNodeContents($('#room-link'));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Link selected. Press Ctrl+C to copy.');
  }
}

// ---------- results ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function nameOf(v) {
  if (v == null) return null;
  if (v === 'p1' || v === 0) return byId[match.p1]?.full || 'Player 1';
  if (v === 'p2' || v === 1) return byId[match.p2]?.full || 'Opponent';
  if (typeof v === 'object') return v.name || nameOf(v.id);
  return byId[v]?.full || String(v);
}
function showResults(r = {}) {
  r = r || {};
  const winner = nameOf(r.winner ?? r.winnerId) || 'Winner';
  const p1Won = r.winner === 'p1' || r.winner === 0 || r.winner === match.p1 || r.winnerId === match.p1;
  $('#r-win').innerHTML = `${esc(winner)}<br><b>${p1Won ? 'wins' : 'beats you'}</b>`;
  $('#r-how').textContent = r.how || r.method || 'Decision';
  $('#r-how').style.display = r.how || r.method ? '' : 'none';
  const st = r.stats || {};
  const rows = Object.entries(st).map(([k, v]) => {
    let a = v, b = '';
    if (Array.isArray(v)) [a, b] = v; else if (v && typeof v === 'object') { a = v.p1 ?? v[0] ?? ''; b = v.p2 ?? v[1] ?? ''; }
    const label = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    return `<tr><td>${esc(label)}</td><td>${esc(a ?? '')}</td><td>${esc(b ?? '')}</td></tr>`;
  });
  $('#r-stats').innerHTML = rows.length
    ? `<tr><th>Match stats</th><th>${esc(byId[match.p1]?.name || 'You')}</th><th>${esc(byId[match.p2]?.name || 'Opponent')}</th></tr>${rows.join('')}`
    : '';
  const log = r.aiPlansLog || r.aiLog || [];
  const items = (Array.isArray(log) ? log : [log]).filter(Boolean).map((e) => typeof e === 'string' ? e : (e.text || e.plan || e.summary || e.reason || JSON.stringify(e)));
  $('#r-learned').innerHTML = items.length ? items.map((t) => `<li>${esc(t)}</li>`).join('') : '<li>Nothing yet. It needs a few exchanges to read you. Play a longer match.</li>';
  document.body.classList.remove('in-match');
  go('results');
}

// ---------- actions ----------
function activate(el) {
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (state === 'menu') {
    const m = MENU.find((x) => x.id === id);
    if (m.locked) { blip('back'); toast(`${m.label}: ${m.desc.split('Locked: ')[1] || 'coming soon'}`); return; }
    blip('ok');
    if (id === 'exhibition') { match.mode = 'exhibition'; selPhase = 'p1'; go('select'); }
    if (id === 'ladder') { match.mode = 'ladder'; selPhase = 'p1'; go('select'); }
    if (id === 'royal') { match.mode = 'royal'; selPhase = 'p1'; go('select'); }
    if (id === 'online') { match.mode = 'online'; newRoom(); go('online'); }
    if (id === 'howto') { howtoFrom = 'menu'; go('howto'); }
    if (id === 'settings') go('settings');
    return;
  }
  if (state === 'select') return pick(id);
  if (state === 'settings' && el.dataset.set) return adjustSetting(el, 1);
  blip(act === 'back' ? 'back' : 'ok');
  switch (act) {
    case 'start': go('menu'); break;
    case 'back': back(); break;
    case 'copy': copyLink(); break;
    case 'online-pick': selPhase = 'p1'; go('select'); break;
    case 'resume': resume(); break;
    case 'howto': howtoFrom = 'pause'; go('howto', { instant: true }); break;
    case 'quit': quitToMenu(); break;
    case 'restart': callEngine('setPaused', false); callEngine('rematch'); go('match', { instant: true }); break;
    case 'rematch': toVersus(); break;
    case 'reselect': callEngine('toMenu'); selPhase = 'p1'; go('select'); break;
    case 'tomenu': callEngine('toMenu'); go('menu'); break;
  }
}

function back() {
  switch (state) {
    case 'menu': blip('back'); go('title'); break;
    case 'howto': if (howtoFrom === 'pause') { go('pause', { instant: true }); } else go('menu', { focus: 5 }); break;
    case 'settings': go('menu', { focus: 6 }); break;
    case 'online': go('menu', { focus: 2 }); break;
    case 'select':
      blip('back');
      if (selPhase === 'p2') { selPhase = 'p1'; match.p1 = null; paintSelect(); setFocus(0, false); }
      else if (match.mode === 'online' && match.host) go('online');
      else go('menu', { focus: match.mode === 'online' ? 2 : match.mode === 'ladder' ? 1 : match.mode === 'royal' ? 3 : 0 });
      break;
    case 'pause': resume(); break;
    case 'results': callEngine('toMenu'); go('menu'); break;
  }
}

// ---------- input: capture phase so menu keys never reach the fight underneath ----------
const NEXT = ['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD'], PREV = ['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'];
const OK = ['Enter', 'NumpadEnter', 'KeyJ', 'Space'], BACK = ['Escape', 'KeyL', 'Backspace'];
addEventListener('keydown', (e) => {
  if (state === 'match') {
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) pause(); }
    return; // every other key belongs to the engine
  }
  e.stopImmediatePropagation();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  if (wiping || state === 'vs') return;
  if (state === 'title') { if (!e.repeat && (OK.includes(e.code) || e.code === 'Escape')) activate($('[data-act="start"]')); return; }
  const items = navItems(), cur = items[focus];
  if (state === 'settings' && cur?.dataset.set && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
    return adjustSetting(cur, e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1);
  }
  if (state === 'select' && e.code === 'KeyR' && !e.repeat) return pick('random');
  if (NEXT.includes(e.code)) return setFocus(focus + 1);
  if (PREV.includes(e.code)) return setFocus(focus - 1);
  if (e.repeat) return;
  if (OK.includes(e.code)) return activate(cur);
  if (BACK.includes(e.code)) return back();
}, true);

ui.addEventListener('pointermove', (e) => {
  const el = e.target.closest('[data-nav]'); if (!el) return;
  const i = navItems().indexOf(el); if (i >= 0 && i !== focus) setFocus(i);
});
ui.addEventListener('click', (e) => {
  const el = e.target.closest('[data-nav], [data-act]'); if (!el || wiping) return;
  const i = navItems().indexOf(el); if (i >= 0) focus = i;
  activate(el);
});

// ---------- boot ----------
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  match.mode = new URLSearchParams(location.search).get('royal') ? 'royal' : 'online';
  match.room = roomParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); match.host = false; selPhase = 'p1';
  render('select');
} else {
  render('title');
}
window.HEEL_UI = { get state() { return state; }, showResults, go };
