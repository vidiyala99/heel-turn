// Chromium (launched with --mute-audio) plays the six-line sample sequence through the neural path: crowd
// AudioContext, broadcast voice bus, buffer sources. Reports audio-start latency per line, page errors, and that
// speechSynthesis was never called. node voice/test/browser-neural.mjs [base=http://localhost:8787]
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../game/node_modules/', import.meta.url));
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8787';

const browser = await chromium.launch({ args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/voice/demo.html`);
const out = await page.evaluate(async () => {
  let synthCalls = 0;
  speechSynthesis.speak = () => { synthCalls++; };
  let sources = 0;
  const start0 = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { sources++; return start0.apply(this, a); };
  const { createTTS, MUTED } = await import('/voice/tts.js');
  const { createCrowd } = await import('/voice/crowd.js');
  const crowd = createCrowd({ muted: false });
  await crowd.start();
  const starts = [];
  const tts = createTTS({ base: '/voice/api', mode: 'neural', muted: false, ctx: () => crowd.context, onDuck: crowd.duck,
    onStart: (l, how) => starts.push({ text: l.text, how, ms: +(performance.now() - l.eventAt).toFixed(1) }) });
  const seq = [
    ['rex', 'bell', 'There\'s the bell! Here we GO!'], ['rex', 'strike', 'Brutus Kane lights up Vex!'],
    ['rex', 'slam', 'Brutus Kane picks up Vex, BODY SLAM!'], ['rex', 'near_fall', 'Cover! One! Two! NO!'],
    ['dot', 'kickout', 'Oh, stay DOWN. Nobody paid to watch you hope.'], ['rex', 'finisher', 'HERE IT COMES! Silas Crane hits the finisher!'],
  ];
  crowd.bell(1);
  for (const [speaker, kind, text] of seq) {
    const line = { speaker, kind, text, eventAt: performance.now() };
    const t = setTimeout(() => {}, 0);
    await Promise.race([tts.speak(line), new Promise(r => setTimeout(r, 1500))]); // don't wait out every clip
    clearTimeout(t);
  }
  return { MUTED_by_default: MUTED, ctxState: crowd.context.state, bufferSourcesStarted: sources, synthCalls, starts };
});
await page.evaluate(() => speechSynthesis.cancel());
await browser.close();
console.log(JSON.stringify({ ...out, errors }, null, 1));
