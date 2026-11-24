// Demo capture: records the live game in a headed Chromium at 1920x1080 with the game's own audio.
// No loopback device is needed: an init script taps every AudioNode connected to an AudioContext destination (and
// every <audio> element) into one MediaStreamDestination and records it with MediaRecorder (webm/opus). The browser
// runs with --mute-audio, so the speakers stay silent while the tap still hears the mix. The page loads with
// ?capture=1 so voice/tts.js plays the neural voices, crowd and music under automation (never speechSynthesis).
// Each session writes raw/<session>.webm (video), raw/<session>-N-audio.wav (aligned to the video) and raw/<session>.json (marks, ms from
// the video's first frame, plus the audio offset). cut.mjs turns marks into docs/video/clips/NN-name.mp4.
// Run (from repo root): node game/tools/capture/record.mjs <session>   sessions: exhibition | royal | online | page
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  const g = execSync('npm root -g').toString().trim();
  for (const p of ['@playwright/cli/node_modules/playwright', '@playwright/mcp/node_modules/playwright']) {
    try { return require(path.join(g, p)); } catch {}
  }
  throw new Error('playwright not found (npm i -g @playwright/cli)');
}
const { chromium } = loadPlaywright();

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const RAW = path.join(ROOT, 'docs/video/raw');
fs.mkdirSync(RAW, { recursive: true });
export const URL0 = process.env.HEEL_URL || 'http://localhost:5173';
const W = 1920, H = 1080;

// runs before any page script: the audio tap and a log of voice events
const TAP = `(() => {
  const AC = window.AudioContext; if (!AC) return;
  const connect = AudioNode.prototype.connect;
  const mix = new AC(); const dest = mix.createMediaStreamDestination();
  // a silent constant keeps the stream flowing from t=0, so MediaRecorder never drops the quiet stretches (sync)
  const hum = mix.createConstantSource(); hum.offset.value = 0; connect.call(hum, dest); hum.start(); mix.resume();
  const taps = new WeakMap();
  function tapFor(ctx) {
    if (ctx === mix) return null;
    let t = taps.get(ctx);
    if (!t) { t = ctx.createMediaStreamDestination(); taps.set(ctx, t); connect.call(mix.createMediaStreamSource(t.stream), dest); }
    return t;
  }
  AudioNode.prototype.connect = function (d, ...rest) {
    const r = connect.call(this, d, ...rest);
    try { if (d instanceof AudioDestinationNode) { const t = tapFor(this.context); if (t) connect.call(this, t, ...rest); } } catch (e) { console.warn('tap', e); }
    return r;
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!this.__tapped) { this.__tapped = true; this.addEventListener('playing', () => {
      try { const s = this.captureStream(); if (s.getAudioTracks().length) connect.call(mix.createMediaStreamSource(s), dest); } catch (e) { console.warn('tap el', e); }
    }, { once: true }); }
    return play.call(this);
  };
  // chunks stream to node as they are made, so a page reload (Vite HMR) keeps the audio recorded before it;
  // each document load is one segment, keyed by its start time
  const seg = Date.now(); let n = 0;
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  rec.ondataavailable = async (e) => {
    if (!e.data.size) return;
    const i = n++; const b = new Uint8Array(await e.data.arrayBuffer());
    let s = ''; for (let k = 0; k < b.length; k += 0x8000) s += String.fromCharCode.apply(null, b.subarray(k, k + 0x8000));
    window.__capChunk && window.__capChunk(seg, i, btoa(s));
  };
  rec.start(500); window.__capT0 = seg;
  window.__capStop = () => new Promise((res) => { rec.onstop = () => setTimeout(res, 300); rec.stop(); });
  window.__voiceLog = [];
  addEventListener('heel:voice', (e) => window.__voiceLog.push({ ...e.detail, wall: Date.now() }));
})();`;

export async function session(name, { contexts = 1, url = URL0 } = {}) {
  const browser = await chromium.launch({
    headless: false,
    args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`, '--window-position=0,0', '--force-device-scale-factor=1', '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  const marks = {}; const errors = []; const pages = [];
  for (let i = 0; i < contexts; i++) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: RAW, size: { width: W, height: H } } });
    const segs = new Map(); // seg start (wall ms) -> [chunks]
    await ctx.exposeBinding('__capChunk', (_src, seg, i, b64) => { if (!segs.has(seg)) segs.set(seg, []); segs.get(seg)[i] = Buffer.from(b64, 'base64'); });
    await ctx.addInitScript(TAP);
    const page = await ctx.newPage();
    const t0 = Date.now();
    page.on('pageerror', (e) => errors.push({ t: Date.now() - t0, ctx: i, msg: String(e) }));
    page.on('framenavigated', (f) => { if (f === page.mainFrame() && page.__loaded) errors.push({ t: Date.now() - t0, ctx: i, msg: 'reload' }); });
    page.on('load', () => { page.__loaded = true; });
    pages.push({ ctx, page, t0, segs });
  }
  const P = pages[0];
  const sep = url.includes('?') ? '&' : '?';
  const api = {
    pages, page: P.page, errors, marks,
    url: (u = url) => u + (u.includes('?') ? '&' : '?') + 'capture=1',
    now: (i = 0) => Date.now() - pages[i].t0,
    mark(k, i = 0) { marks[k] = Date.now() - pages[i].t0; console.log('mark', k, marks[k]); },
    wait: (ms) => P.page.waitForTimeout(ms),
    async key(k, ms = 400, i = 0) { await pages[i].page.keyboard.press(k); await pages[i].page.waitForTimeout(ms); },
    state: (i = 0) => pages[i].page.evaluate('window.HEEL_UI && HEEL_UI.state'),
    async until(state, k = 'Enter', i = 0) {
      for (let n = 0; n < 25; n++) { if (await api.state(i) === state) return; await api.key(k, 500, i); }
      throw new Error(`stuck at ${await api.state(i)}, wanted ${state}`);
    },
    async finish() {
      const out = { session: name, marks, errors, contexts: [] };
      for (const [i, p] of pages.entries()) {
        await p.page.evaluate('window.__capStop()').catch((e) => console.warn('audio stop', e.message));
        await p.page.waitForTimeout(500);
        // one aligned track: each segment written out, delayed to its start, mixed (segments never overlap)
        const parts = [...p.segs.entries()].sort((a, b) => a[0] - b[0]).map(([seg, ch], k) => {
          const f = path.join(RAW, `${name}-${i}-seg${k}.webm`); fs.writeFileSync(f, Buffer.concat(ch.filter(Boolean))); return { f, off: Math.max(0, seg - p.t0) };
        });
        const audio = path.join(RAW, `${name}-${i}-audio.wav`);
        if (parts.length) {
          const FF = process.env.FFMPEG || 'C:/Users/aakas/Tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe';
          const fl = parts.map((q, k) => `[${k}:a]aresample=48000,adelay=${q.off}|${q.off}[s${k}]`).join(';') + ';' + parts.map((_, k) => `[s${k}]`).join('') + `amix=inputs=${parts.length}:normalize=0:duration=longest[a]`;
          execSync(`"${FF}" -hide_banner -loglevel error -y ${parts.map((q) => `-i "${q.f}"`).join(' ')} -filter_complex "${fl}" -map "[a]" -ac 2 "${audio}"`);
          for (const q of parts) fs.unlinkSync(q.f);
        }
        const audioOffset = 0;
        const voice = await p.page.evaluate('window.__voiceLog || []').catch(() => []);
        const vid = p.page.video();
        await p.ctx.close();
        const src = await vid.path();
        const dst = path.join(RAW, `${name}-${i}.webm`);
        fs.renameSync(src, dst);
        out.contexts.push({ video: dst, audio, audioOffset, segments: parts.map((q) => q.off), voice: voice.map((v) => ({ ...v, t: v.wall - p.t0 })) });
      }
      await browser.close();
      fs.writeFileSync(path.join(RAW, `${name}.json`), JSON.stringify(out, null, 1));
      console.log('saved', name, 'errors:', errors.length ? errors : 'none');
      return out;
    },
  };
  void sep;
  return api;
}

const sessions = {
  async entrance(s) { return sessions.exhibition(s); },
  // clips 01 title+select, 02 entrance, 03 promo, 04 fight, 05 booth, 07 results
  async exhibition(s) {
    const pg = s.page;
    await pg.goto(s.url(), { waitUntil: 'commit', timeout: 90000 });
    await pg.waitForFunction("window.HEEL_UI && HEEL_UI.state === 'title'", null, { timeout: 90000 });
    await s.wait(1500); s.mark('01_start');
    await s.wait(2500);
    await s.until('menu'); await s.wait(1500);
    await s.until('select'); await s.wait(800);
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) await s.key(k, 700);
    await s.key('Enter', 300);
    await pg.waitForFunction("HEEL_UI.state === 'match'", null, { timeout: 15000 });
    s.mark('01_end'); s.mark('02_start');
    // mark each entrance event as it lands (stage, aisle, climb-in) so the cut can pick the best stretch
    for (let n = 0, t = 0; t < 450; t++) {
      const log = await pg.evaluate('(window.HEEL_ENTRANCE_LOG || []).map(e => e.ev + (e.who ? ":" + e.who : ""))');
      for (; n < log.length; n++) s.mark(`ent${n}_${log[n]}`);
      if (log.some((e) => e.startsWith('bell'))) break;
      await s.wait(200);
    }
    s.mark('02_end'); s.mark('03_start');
    await pg.waitForFunction('!(window.HEEL_PROMO && HEEL_PROMO.holding)', null, { timeout: 60000 });
    s.mark('03_end');
    await s.wait(1200); s.mark('04_start');
    // fight: walk in, mix strikes and blocks, back off now and then so it stays out of long grapples
    for (let r = 0; r < 7; r++) {
      await pg.keyboard.down('KeyD');
      for (let i = 0; i < 8; i++) await s.key(i % 3 ? 'KeyJ' : 'KeyK', 180);
      await pg.keyboard.up('KeyD');
      await pg.keyboard.down('KeyA'); await s.wait(700); await pg.keyboard.up('KeyA');
      await s.key('KeyL', 500);
      if (await s.state() === 'results') break;
    }
    s.mark('04_end');
    // finish: empty P2, grapple until it ends
    await pg.evaluate('G.P2.hp = 1; G.P1.mo = 100');
    await pg.keyboard.down('KeyD');
    for (let i = 0; i < 80; i++) { await s.key('KeyK', 150); if (await s.state() === 'results') break; if (i === 6) await s.key('Space', 900); }
    await pg.keyboard.up('KeyD');
    await pg.waitForFunction("HEEL_UI.state === 'results'", null, { timeout: 30000 }).catch(() => {});
    s.mark('07_start'); await s.wait(14000); s.mark('07_end');
    console.log('learned:', await pg.innerText('#r-learned').catch(() => ''));
    console.log('log:', (await pg.innerText('#log').catch(() => '')).slice(0, 400));
  },

  // clip 06: Over the Top through the commissioner card (Y = approve)
  async royal(s) {
    const pg = s.page;
    await pg.goto(s.url(), { waitUntil: 'commit', timeout: 90000 });
    await pg.waitForFunction("window.HEEL_UI && HEEL_UI.state === 'title'", null, { timeout: 60000 });
    await s.until('menu');
    for (let i = 0; i < 3; i++) await s.key('ArrowDown', 200);
    await s.key('Enter', 700); await s.key('ArrowRight', 200); await s.key('Enter', 300);
    await pg.waitForFunction("HEEL_UI.state === 'match' && G.state && G.state.mode === 'royal'", null, { timeout: 15000 });
    s.mark('06_match');
    const seen = new Set();
    for (let t = 0; t < 1800; t++) {
      await s.wait(100);
      const st = await pg.evaluate(`(() => { const m = G.state; return { over: m.over, alliance: !!m.alliance, betray: m.betray && m.betray.status,
        card: !!document.querySelector('.rr-card:not([hidden])'), banner: (document.getElementById('banner') || {}).textContent,
        bannerOn: getComputedStyle(document.getElementById('banner')).opacity > 0.5, log: (document.getElementById('log') || {}).innerText || '' }; })()`);
      if (/ALLIANCE/.test(st.log) && !s.marks['06_alliance']) s.mark('06_alliance');
      if (st.card) {
        const title = await pg.innerText('.rr-card .rr-head').catch(() => '');
        if (!seen.has(title)) { seen.add(title); if (!s.marks['06_card']) s.mark('06_card'); console.log('card', title); await s.wait(2200); await s.key('KeyY', 100); if (!s.marks['06_vote']) s.mark('06_vote'); }
      }
      if (st.bannerOn && st.banner === 'HEEL TURN!' && !s.marks['06_heelturn']) s.mark('06_heelturn');
      if (st.over) { s.mark('06_over'); break; }
    }
    await s.wait(3000); s.mark('06_end');
  },

  // clip 08: host makes an online room, a second context joins by the invite link
  async online(s) {
    const [A, B] = s.pages.map((p) => p.page);
    await A.goto(s.url(), { waitUntil: 'commit', timeout: 90000 });
    await A.waitForFunction("window.HEEL_UI && HEEL_UI.state === 'title'", null, { timeout: 60000 });
    await B.goto(s.url(), { waitUntil: 'commit', timeout: 90000 }); // B idles on the title until it has the link
    s.mark('08_start');
    await s.until('menu');
    for (let i = 0; i < 8; i++) {
      if (await A.evaluate("(document.querySelector('#ui .focus') || {}).dataset?.id") === 'online') break;
      await s.key('ArrowDown', 300);
    }
    await s.key('Enter', 3000);
    const link = await A.evaluate(`(() => { const t = document.body.innerText.match(/https?:\\/\\/[^\\s]+room=[A-Z0-9]+[^\\s]*/); return t ? t[0] : (location.href.includes('room=') ? location.href : null); })()`);
    console.log('invite link:', link);
    if (!link) throw new Error('no invite link on screen');
    s.mark('08_link');
    await B.goto(link + (link.includes('capture=1') ? '' : '&capture=1'));
    await s.wait(3000);
    for (const p of [0, 1]) { await s.key('ArrowRight', 300, p); await s.key('Enter', 600, p); }
    // both lock in and land in the same ring: nudge whichever window is not in the match yet
    for (let t = 0; t < 20; t++) {
      const st = [await s.state(0), await s.state(1)]; console.log('states', st.join(' '));
      if (st.every((x) => x === 'match')) break;
      for (const p of [0, 1]) if (st[p] === 'select') await s.key('Enter', 200, p);
      await s.wait(1300);
    }
    s.mark('08_ring'); await s.wait(9000); s.mark('08_end');
  },

  // clips 09 and 10: a local page (terminal render or chart), recorded for HOLD seconds
  async page(s) {
    const file = process.argv[3]; const hold = +(process.argv[4] || 12000);
    await s.page.goto('file:///' + path.resolve(file).replace(/\\/g, '/'));
    await s.wait(500); s.mark('start'); await s.wait(hold); s.mark('end');
  },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  if (!sessions[name]) { console.error('sessions:', Object.keys(sessions).join(' ')); process.exit(2); }
  const s = await session(name === 'page' ? 'page-' + path.basename(process.argv[3] || 'x', path.extname(process.argv[3] || 'x')) : name, { contexts: name === 'online' ? 2 : 1 });
  try { await sessions[name](s); } catch (e) { console.error('FAILED', e.message); s.errors.push({ t: s.now(), msg: 'script: ' + e.message }); }
  await s.finish();
}
