// Spectator side panel: odds board, fan-points balance, 1-tap bets, live prop-poll bars.
// PLAY MONEY ONLY: fan points have no cash value and cannot be bought. Talks to agents/odds (port 8790).
//
//   import { mountOdds } from './ui/odds.js';           // and <link rel="stylesheet" href="ui/odds.css">
//   const odds = mountOdds(document.body, { match: 'm5', fan: 'fan_ana' });
//   odds.setMatch('m6');   odds.show(false);   odds.destroy();
//
// Options: api (default `http://${location.hostname || '127.0.0.1'}:8790`), match ('next'), fan (persisted in
// localStorage 'heel.fan'), pollMs (1500), chips ([25, 50, 100]).
const FALLBACK_FAN = () => `fan_${Math.random().toString(36).slice(2, 8)}`;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const pct = (p) => `${Math.round(p * 100)}%`;
const line = (l) => (l > 0 ? `+${l}` : String(l));
const label = (c) => c.replace('_', ' ');

export function mountOdds(root, opts = {}) {
  const api = opts.api || `http://${location.hostname || '127.0.0.1'}:8790`;
  const chips = opts.chips || [25, 50, 100];
  let match = opts.match || 'next';
  let fan = opts.fan || localStorage.getItem('heel.fan') || FALLBACK_FAN();
  localStorage.setItem('heel.fan', fan);
  let chip = chips[0];
  let timer = 0;
  let dead = false;
  const voted = new Set(JSON.parse(localStorage.getItem('heel.voted') || '[]'));

  const panel = el('aside', 'odds-panel');
  panel.setAttribute('aria-label', 'Fan points odds and polls');
  panel.innerHTML = `
    <header class="op-head">
      <div class="op-title display">THE BOOK</div>
      <div class="op-bal"><span class="op-bal-n display">0</span><span class="op-bal-u">fan points</span></div>
    </header>
    <div class="op-note">Play money only. No cash value.</div>
    <div class="op-chips" role="radiogroup" aria-label="Stake per tap"></div>
    <section class="op-board" aria-label="Odds board"><div class="op-sec display">TO WIN <span class="op-match"></span></div><ol class="op-rows"></ol></section>
    <section class="op-polls" aria-label="Live polls"><div class="op-sec display">CROWD CALLS</div><div class="op-plist"></div></section>
    <div class="op-toast" role="status" aria-live="polite"></div>`;
  root.appendChild(panel);
  const $ = (s) => panel.querySelector(s);

  chips.forEach((c) => {
    const b = el('button', 'op-chip display', String(c));
    b.setAttribute('role', 'radio');
    b.onclick = () => { chip = c; paintChips(); };
    $('.op-chips').appendChild(b);
  });
  function paintChips() {
    [...$('.op-chips').children].forEach((b) => {
      const on = Number(b.textContent) === chip;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  }
  paintChips();

  let toastT = 0;
  function toast(msg, kind = '') {
    const t = $('.op-toast');
    t.textContent = msg;
    t.className = `op-toast show ${kind}`;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.className = 'op-toast'; }, 2600);
  }

  async function req(path, body) {
    const r = await fetch(api + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }

  async function bet(pick, market = 'winner') {
    try {
      const b = await req('/bet', { fan, pick, stake: chip, match, market });
      toast(`${chip} on ${label(pick)} at x${b.decimal_odds}`, 'ok');
      $('.op-bal-n').textContent = b.balance;
      tick();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function vote(poll, choice) {
    const key = `${match}:${poll}`;
    if (voted.has(key)) return toast('You already called this one', 'err');
    try {
      await req('/vote', { poll, choice, match, fan });
      voted.add(key);
      localStorage.setItem('heel.voted', JSON.stringify([...voted]));
      tick();
    } catch (e) { toast(e.message, 'err'); }
  }

  function paintBoard(odds, mine) {
    $('.op-match').textContent = opts.title || ''; // a match name, never the raw id
    const ol = $('.op-rows');
    ol.replaceChildren(...odds.board.map((r) => {
      const li = el('li', 'op-row');
      const won = odds.settled === r.wrestler;
      li.classList.toggle('won', won);
      li.classList.toggle('lost', !!odds.settled && !won);
      const btn = el('button', 'op-pick');
      btn.disabled = !!odds.settled;
      const name = (opts.names || {})[r.wrestler] || r.name;
      btn.setAttribute('aria-label', `Bet ${chip} fan points on ${name}, pays ${r.decimal_odds} times`);
      btn.append(el('span', 'op-name display', name), el('span', 'op-line', line(r.line)), el('span', 'op-pay', `x${r.decimal_odds}`));
      const bar = el('span', 'op-bar');
      bar.style.setProperty('--p', r.win_prob);
      bar.append(el('span', 'op-pct', pct(r.win_prob)));
      btn.append(bar);
      const stake = mine.filter((b) => b.market === 'winner' && b.pick === r.wrestler).reduce((s, b) => s + b.stake, 0);
      if (stake) btn.append(el('span', 'op-mine', `${stake} on`));
      btn.onclick = () => bet(r.wrestler);
      li.append(btn);
      return li;
    }));
  }

  function paintPolls(polls) {
    $('.op-plist').replaceChildren(...polls.map((p) => {
      const card = el('div', `op-poll ${p.status}`);
      card.append(el('div', 'op-q', p.question));
      const total = Object.values(p.votes).reduce((a, b) => a + b, 0);
      p.choices.forEach((c) => {
        const row = el('div', 'op-choice');
        row.classList.toggle('hit', p.outcome === c);
        const v = el('button', 'op-vote');
        v.disabled = p.status !== 'open';
        v.setAttribute('aria-label', `Vote ${label(c)}: ${pct(p.share[c])} of ${total} votes`);
        const bar = el('span', 'op-vbar');
        bar.style.setProperty('--p', p.share[c] || 0);
        v.append(bar, el('span', 'op-c display', label(c)), el('span', 'op-vp', `${pct(p.share[c] || 0)} of fans`));
        v.onclick = () => vote(p.id, c);
        const b = el('button', 'op-back', `Bet ${chip}, win ${Math.round(chip * p.decimal_odds[c])}`);
        b.disabled = p.status !== 'open';
        b.setAttribute('aria-label', `Bet ${chip} fan points on ${label(c)}`);
        b.onclick = () => bet(c, p.id);
        row.append(v, b);
        card.append(row);
      });
      card.append(el('div', 'op-meta', p.status === 'open' ? `${total} votes` : `CALLED: ${label(p.outcome)}`));
      return card;
    }));
  }

  let lastSettled = null;
  async function tick() {
    if (dead) return;
    try {
      const [odds, polls, me] = await Promise.all([req(`/odds?match=${encodeURIComponent(match)}`),
        req(`/polls?match=${encodeURIComponent(match)}`), req(`/fan?fan=${encodeURIComponent(fan)}`)]);
      $('.op-bal-n').textContent = me.balance;
      paintBoard(odds, me.bets.filter((b) => b.match === match));
      paintPolls(polls);
      const settled = new Set(me.bets.filter((b) => b.status !== 'open').map((b) => b.bet_id));
      const fresh = me.bets.filter((b) => settled.has(b.bet_id) && lastSettled && !lastSettled.has(b.bet_id));
      if (lastSettled) { // null on the first tick: old history is not news
        const won = fresh.filter((b) => b.status === 'won').reduce((s, b) => s + b.payout, 0);
        if (fresh.length) toast(won ? `CASHED ${won} fan points` : 'Tickets settled. Next time.', won ? 'ok' : '');
      }
      lastSettled = settled;
      panel.classList.remove('offline');
    } catch {
      panel.classList.add('offline');
    }
  }

  function loop() {
    clearTimeout(timer);
    tick().finally(() => { if (!dead) timer = setTimeout(loop, opts.pollMs || 1500); });
  }
  loop();

  return {
    el: panel,
    setMatch(m) { match = m; lastSettled = null; loop(); },
    setFan(f) { fan = f; localStorage.setItem('heel.fan', f); loop(); },
    show(on = true) { panel.classList.toggle('hidden', !on); },
    refresh: loop,
    destroy() { dead = true; clearTimeout(timer); panel.remove(); },
  };
}
