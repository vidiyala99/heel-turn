// Rough cut: the clips in docs/VIDEO.md order, each loudness-normalized (loudnorm I=-16:TP=-1.5:LRA=11) with a
// burned-in caption (Impact), plus a BAND placeholder card and a close card, concatenated to
// docs/video/heel-turn-roughcut.mp4; --vertical also writes a 1080x1920 centre crop. Prints per-segment loudness.
// Run: node game/tools/capture/roughcut.mjs [--vertical]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, RAW } from './record.mjs';

const FF = process.env.FFMPEG || 'C:/Users/aakas/Tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe';
const CLIPS = path.join(ROOT, 'docs/video/clips');
const TMP = path.join(RAW, 'cut'); fs.mkdirSync(TMP, { recursive: true });
const FONT = 'C\\:/Windows/Fonts/impact.ttf';
const ENC = '-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -r 30 -c:a aac -b:a 160k -ar 48000 -ac 2'.split(' ');

// [clip or card, seconds cap, caption]
const SEQ = [
  ['01-title-select', 10, 'HEEL TURN. AI wrestlers that remember how you fight.'],
  ['02-entrance', 18, 'You play. The ring announcer brings them out.'],
  ['04-fight', 15, 'Every AI move is an LLM plan, logged with the memory row it read.'],
  ['05-booth', 10, 'Rex and Dot call it live (Fish Audio voices on Runware).'],
  ['07-results', 13, 'What the AI learned about you, from Bruin memory.'],
  ['03-promo', 9, 'Promos are written from memory of how you fight.'],
  ['06-over-the-top', 23, 'Over the Top. Alliances, a betrayal, and the commissioner rules on it.'],
  ['card:BAND', 4, 'BAND console clip goes here (needs Aakash login).'],
  ['09-bruin-run', 13, 'Bruin turns fights into checked memory: 13 assets, 80 checks.'],
  ['10-learning-chart', 10, 'Memory adds a small, measured effect.'],
  ['08-invite-join', 15.5, 'A friend joins by link. One ring, humans and AI wrestlers.'],
  ['card:CLOSE', 8, 'Track 02: Co-op Multiplayer Game. Bruin, BAND, Runware, AdaL.'],
];

const run = (args) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
const meanDb = (f) => { const e = spawnSync(FF, ['-hide_banner', '-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr; const m = e.match(/mean_volume: (-?[\d.]+)/); return m ? +m[1] : null; };
const capFilter = (txtFile, size = 46, y = 'h-150') =>
  `drawtext=fontfile='${FONT}':textfile='${txtFile.replace(/\\/g, '/').replace(':', '\\:')}':fontsize=${size}:fontcolor=white:borderw=3:bordercolor=black@0.85:box=1:boxcolor=black@0.45:boxborderw=18:x=(w-text_w)/2:y=${y}`;

const parts = [];
SEQ.forEach(([id, cap, caption], k) => {
  const out = path.join(TMP, `${String(k).padStart(2, '0')}.mp4`);
  const txt = path.join(TMP, `${k}.txt`); fs.writeFileSync(txt, caption);
  if (id.startsWith('card:')) {
    const title = path.join(TMP, `${k}-t.txt`);
    fs.writeFileSync(title, id === 'card:BAND' ? 'BAND CONSOLE' : 'HEEL TURN');
    run(['-f', 'lavfi', '-t', String(cap), '-i', 'color=c=0x0b0f14:s=1920x1080:r=30', '-f', 'lavfi', '-t', String(cap), '-i', 'anullsrc=r=48000:cl=stereo',
      '-vf', `${capFilter(title, 150, '(h-text_h)/2-80').replace(/:box=1[^:]*:boxcolor=[^:]*:boxborderw=18/, '')},${capFilter(txt, 52, '(h/2)+90')}`, ...ENC, '-shortest', out]);
  } else {
    const src = path.join(CLIPS, `${id}.mp4`);
    if (!fs.existsSync(src)) { console.log('missing', id); return; }
    run(['-t', String(cap), '-i', src, '-vf', capFilter(txt), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000', ...ENC, out]);
  }
  parts.push(out);
  console.log(id.padEnd(20), 'mean', meanDb(out), 'dB');
});
const list = path.join(TMP, 'list.txt');
fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
const final = path.join(ROOT, 'docs/video/heel-turn-roughcut.mp4');
run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
const dur = spawnSync(FF, ['-hide_banner', '-i', final], { encoding: 'utf8' }).stderr.match(/Duration: ([\d:.]+)/)?.[1];
console.log('ROUGH CUT', final, 'duration', dur, 'mean', meanDb(final), 'dB');
if (process.argv.includes('--vertical')) {
  const v = path.join(ROOT, 'docs/video/heel-turn-roughcut-vertical.mp4');
  // blurred full frame behind, the 16:9 frame scaled to width in the middle (captions stay readable)
  run(['-i', final, '-filter_complex', '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20[bg];[0:v]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2,setsar=1[v]', '-map', '[v]', '-map', '0:a', ...ENC, '-movflags', '+faststart', v]);
  console.log('VERTICAL', v);
}
