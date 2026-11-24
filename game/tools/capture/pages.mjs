// Builds the two static pages the recorder films: docs/video/raw/terminal.html (the real `bash bruin/run.sh` output
// from docs/video/raw/bruin-run.txt, scrolled in like a terminal; no line is invented) and chart.html
// (docs/learning/counter-rate.svg full screen). Run: node game/tools/capture/pages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, RAW } from './record.mjs';

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const all = fs.readFileSync(path.join(RAW, 'bruin-run.txt'), 'utf8').split(/\r?\n/);
// keep the real lines that read on screen: validation, the run lines, the checks summary (drop ingestion chatter)
const keep = all.filter((l) => !/>>/.test(l) && !/^exit /.test(l));
const color = (l) => /PASS|✓|succeeded|successfully|all good|No issues/.test(l) ? 'ok' : /Running:/.test(l) ? 'run' : /Finished:/.test(l) ? 'dim' : /FAIL|ERROR/.test(l) ? 'bad' : '';
const step = 11000 / keep.length;
const lines = keep.map((l, i) => `<div class="${color(l)}" style="animation-delay:${(0.6 + i * step / 1000).toFixed(2)}s">${esc(l) || '&nbsp;'}</div>`).join('\n');
fs.writeFileSync(path.join(RAW, 'terminal.html'), `<!doctype html><meta charset="utf-8"><title>bruin run</title>
<style>html,body{margin:0;background:#0d1117;height:100%;overflow:hidden}
.win{position:absolute;inset:40px 80px;background:#0b0f14;border:1px solid #30363d;border-radius:10px;overflow:hidden;box-shadow:0 20px 80px #000}
.bar{height:38px;background:#161b22;display:flex;align-items:center;gap:8px;padding:0 16px;color:#8b949e;font:15px Consolas,monospace}
.bar i{width:13px;height:13px;border-radius:50%;background:#ff5f56}.bar i+i{background:#ffbd2e}.bar i+i+i{background:#27c93f}
.body{position:absolute;inset:38px 0 0;padding:18px 26px;font:21px/1.38 Consolas,monospace;color:#c9d1d9;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden}
.body div{white-space:pre;opacity:0;animation:in .01s forwards}.ok{color:#3fb950}.run{color:#58a6ff}.dim{color:#6e7681}.bad{color:#f85149}
.p{color:#d2a8ff}@keyframes in{to{opacity:1}}</style>
<div class="win"><div class="bar"><i></i><i></i><i></i><span style="margin-left:12px">MultiplayerAI: bash</span></div>
<div class="body"><div class="p" style="animation-delay:0s">$ bash bruin/run.sh</div>
${lines}</div></div>`);

const svg = fs.readFileSync(path.join(ROOT, 'docs/learning/counter-rate.svg'), 'utf8');
fs.writeFileSync(path.join(RAW, 'chart.html'), `<!doctype html><meta charset="utf-8"><title>counter rate</title>
<style>html,body{margin:0;height:100%;background:#fff;display:grid;place-items:center;overflow:hidden}
svg{width:92vw;height:92vh}</style>${svg}`);
console.log('pages written', keep.length, 'terminal lines');
