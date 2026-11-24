// Cuts recorded sessions into docs/video/clips/NN-name.mp4 (H.264 CRF 23 + AAC, 1920x1080, 30 fps) and reports
// each clip's loudness. Marks come from docs/video/raw/<session>.json (ms from the video's first frame).
// Run: node game/tools/capture/cut.mjs [clipId ...]   (no args: every clip whose session exists)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, RAW } from './record.mjs';

export const FF = process.env.FFMPEG || 'C:/Users/aakas/Tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe';
export const CLIPS = path.join(ROOT, 'docs/video/clips');
fs.mkdirSync(CLIPS, { recursive: true });

// id, session, start mark (+ms), end mark (+ms), max seconds
const PLAN = {
  '01-title-select': ['exhibition', '01_start', 0, '01_end', 600, 15],
  '02-entrance': ['entrance', 'stage', -3000, 'inring', 300, 15.5],
  '03-promo': ['exhibition', '03_start', -500, '03_end', 800, 15],
  '04-fight': ['exhibition', '04_start', 0, '04_end', 0, 15],
  '05-booth': ['exhibition', 'booth', -1000, 'booth', 9000, 12],
  '06-over-the-top': ['royal', 'royal_in', 0, 'royal_out', 0, 30],
  '07-results': ['entrance', '07_start', 500, '07_end', 0, 13],
  '08-invite-join': ['online', '08_link', -300, '08_end', 0, 15.5],
  '09-bruin-run': ['page-terminal', 'start', 0, 'end', 0, 14],
  '10-learning-chart': ['page-chart', 'start', 0, 'end', 0, 10],
};

const sh = (args) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
export function meanDb(file) {
  const r = require_spawn(file);
  const m = r.match(/mean_volume: (-?[\d.]+) dB/), x = r.match(/max_volume: (-?[\d.]+) dB/);
  return { mean: m ? +m[1] : null, max: x ? +x[1] : null };
}
import { spawnSync } from 'node:child_process';
function require_spawn(file) {
  return spawnSync(FF, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
}

// marks found after the fact: the first booth line (Rex or Dot) after the promo; the Over the Top window around the
// first commissioner card (from just before the alliance or card, to the outcome after the vote)
function derive(j) {
  const ms = { ...j.marks };
  const v = (j.contexts[0]?.voice || []).filter((x) => x.phase === 'start' && /rex|dot/i.test(x.speaker) && x.t > (ms['03_end'] || 0) && x.t < (ms['04_end'] || 1e12));
  if (v.length) ms.booth = v[0].t;
  // the first wrestler's walk-out: end of the announcer's line (stage) to standing in the ring
  for (const k of Object.keys(ms)) { if (/seg0_line_done$/.test(k)) ms.stage = ms[k]; if (/seg0_in_ring$/.test(k)) ms.inring = ms[k]; }
  if (ms['06_card'] != null) {
    ms.royal_in = Math.max(ms['06_match'] || 0, Math.min(ms['06_alliance'] ?? 1e12, ms['06_card'] - 14000), ms['06_card'] - 18000);
    ms.royal_out = Math.min(ms['06_end'], (ms['06_heelturn'] && ms['06_heelturn'] > ms['06_card'] ? ms['06_heelturn'] + 3000 : ms['06_vote'] + 9000));
  }
  return ms;
}

const V = '-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -r 30 -c:a aac -b:a 160k -ar 48000 -ac 2 -movflags +faststart'.split(' ');

function cut(id) {
  const [sess, a, da, b, db, max] = PLAN[id];
  const meta = path.join(RAW, `${sess}.json`);
  if (!fs.existsSync(meta)) return console.log(id, 'SKIP (no session', sess + ')');
  const j = JSON.parse(fs.readFileSync(meta, 'utf8'));
  const ms = derive(j);
  if (ms[a] == null || ms[b] == null) return console.log(id, 'SKIP (marks missing)', a, b);
  const s = Math.max(0, (ms[a] + da) / 1000);
  const dur = Math.min(max, (ms[b] + db) / 1000 - s);
  const out = path.join(CLIPS, `${id}.mp4`);
  const inputs = [], filt = [];
  j.contexts.forEach((c, i) => {
    const off = (c.audioOffset || 0) / 1000;
    inputs.push('-ss', s.toFixed(3), '-t', dur.toFixed(3), '-i', c.video);
    const as = s - off;
    if (as >= 0) inputs.push('-ss', as.toFixed(3), '-t', dur.toFixed(3), '-i', c.audio);
    else inputs.push('-t', (dur + as).toFixed(3), '-i', c.audio);
    const delay = as < 0 ? Math.round(-as * 1000) : 0;
    filt.push(`[${2 * i + 1}:a]adelay=${delay}|${delay},apad,atrim=0:${dur.toFixed(3)},aresample=48000[a${i}]`);
  });
  if (j.contexts.length === 1) {
    filt.push('[0:v]fps=30,scale=1920:1080:flags=lanczos,setsar=1[v]');
    filt.push('[a0]anull[a]');
  } else {
    // two windows side by side on a 1080p frame
    filt.push('[0:v]fps=30,scale=956:538[l];[2:v]fps=30,scale=956:538[r];[l][r]hstack,pad=1920:1080:2:271:color=0x0b0f14,setsar=1[v]');
    filt.push('[a0][a1]amix=inputs=2:normalize=0[a]');
  }
  sh([...inputs, '-filter_complex', filt.join(';'), '-map', '[v]', '-map', '[a]', ...V, '-t', dur.toFixed(3), out]);
  const errs = (j.errors || []).filter((e) => e.t / 1000 >= s - 1 && e.t / 1000 <= s + dur + 1);
  const L = meanDb(out);
  console.log(`${id}  ${dur.toFixed(1)} s  mean ${L.mean} dB  max ${L.max} dB${errs.length ? '  PAGE ERRORS IN WINDOW: ' + errs.map((e) => e.msg).join('; ') : ''}`);
}

const want = process.argv.slice(2);
for (const id of Object.keys(PLAN)) if (!want.length || want.includes(id)) cut(id);
