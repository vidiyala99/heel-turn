// Renders HEEL TURN's Runware audio: voice candidates, music and SFX. Every asset is written with its model, prompt,
// seed, cost and latency to voice/assets/manifest.json, so the picks in voices.js and CREDITS.md are reproducible.
//   node voice/render-runware-assets.mjs voices|music|sfx [name-filter] [model-filter]
// Voices render twice in one request (MP3 to keep, WAV to measure duration, loudness and pitch).
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const ASSETS = join(ROOT, 'assets');
const MANIFEST = join(ASSETS, 'manifest.json');
const URL_ = process.env.RUNWARE_URL || 'https://api.runware.ai/v1';

async function run(tasks, timeout = 300000) {
  for (const t of tasks) { t.taskUUID = crypto.randomUUID(); t.taskType = 'audioInference'; t.includeCost = true; t.outputType = 'base64Data'; }
  const t0 = Date.now();
  const r = await fetch(URL_, { method: 'POST', signal: AbortSignal.timeout(timeout),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RUNWARE_API_KEY}` }, body: JSON.stringify(tasks) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.errors) throw new Error(`runware ${r.status}: ${JSON.stringify(out.errors ?? out).slice(0, 400)}`);
  const ms = Date.now() - t0;
  return tasks.map(t => ({ ...out.data.find(d => d.taskUUID === t.taskUUID), ms }));
}

// 16-bit PCM WAV -> duration, RMS dBFS, peak dBFS, median pitch (autocorrelation over voiced 40 ms frames)
export function measureWav(buf) {
  let p = 12, fmt, data;
  while (p < buf.length - 8) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') { data = buf.subarray(p + 8, Math.min(buf.length, p + 8 + size)); break; }
    p += 8 + size + (size & 1);
  }
  if (!fmt || fmt.bits !== 16) return { error: `unsupported wav ${JSON.stringify(fmt)}` };
  const n = Math.floor(data.length / 2 / fmt.ch), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768;
  let sum = 0, peak = 0;
  for (const v of x) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
  const db = (v) => Math.round(20 * Math.log10(v + 1e-9) * 10) / 10;
  const frame = Math.round(fmt.rate * 0.04), pitches = [];
  for (let s = 0; s + frame * 2 < n; s += frame) {
    let e = 0; for (let i = 0; i < frame; i++) e += x[s + i] ** 2;
    if (Math.sqrt(e / frame) < 0.03) continue;
    let best = 0, lag = 0;
    for (let L = Math.round(fmt.rate / 400); L <= Math.round(fmt.rate / 60); L++) {
      let c = 0; for (let i = 0; i < frame; i++) c += x[s + i] * x[s + i + L];
      if (c > best) { best = c; lag = L; }
    }
    if (best / e > 0.5) pitches.push(fmt.rate / lag);
  }
  pitches.sort((a, b) => a - b);
  return { seconds: Math.round(n / fmt.rate * 100) / 100, rmsDb: db(Math.sqrt(sum / n)), peakDb: db(peak),
    pitchHz: pitches.length ? Math.round(pitches[pitches.length >> 1]) : null, voicedFrames: pitches.length };
}

// ---- voices: same line per speaker on each model; qwen VoiceDesign gets a written description of an original voice
const LINES = {
  rex: 'HERE IT COMES! Brutus Kane picks him up... BODY SLAM! One! Two! NO! He kicked out!',
  dot: 'Oh, stay down. Nobody paid to watch you hope. [laugh] Silas, you beautiful snake.',
  ring: 'Ladies and gentlemen... this match is scheduled for ONE FALL! Introducing... OLD IRON MAE!',
  vex: 'Cameras on me, people! This face? Undefeated. Look at it and weep!',
  kane: 'You are small. I am Kane. Get in the ring... and break.',
  silas: 'Alliances are lovely things, darling. Right up until the moment I cash them in.',
  mae: "Thirty years in this ring, kid. I've broken better than you before breakfast.",
};
const DESIGN = {
  rex: 'An earnest, hyped male sports play-by-play announcer in his 40s, fast punchy delivery, rising excitement, shouting the big moments, live TV arena energy.',
  dot: 'A smug, dry, sardonic middle-aged woman color commentator, amused and mocking, relaxed pace, a wicked little cackle in her voice.',
  ring: 'A deep, booming male arena ring announcer, rich baritone, slow and grand, stretching the long vowels, huge resonant finish, big hall.',
  vex: 'A cocky, arrogant young male showboat athlete, loud, theatrical and preening, full of himself.',
  kane: 'A huge brute of a man with a very low, slow, growling, menacing bass voice, few words, each one heavy.',
  silas: 'A silky, scheming, condescending male villain, quiet and measured, a smile you can hear, refined accent.',
  mae: 'A grizzled veteran woman wrestler in her 50s, gravelly low voice, tough, unimpressed and a little amused, firm and direct.',
};
// voice per model: Inworld TTS-2 (133 named voices) and xAI TTS (27 voices with inline tags). Picks chosen to span pitch.
const PICKS = {
  rex:   { 'inworld:tts@2': ['Blake', 'Marcus'], 'xai:tts@0': ['leo'] },
  dot:   { 'inworld:tts@2': ['Deborah', 'Veronica'], 'xai:tts@0': ['ara'] },
  ring:  { 'inworld:tts@2': ['Dominus', 'Hades'], 'xai:tts@0': ['atlas'] },
  vex:   { 'inworld:tts@2': ['Jason', 'Tyler'], 'xai:tts@0': ['rex'] },
  kane:  { 'inworld:tts@2': ['Hades', 'Damon'], 'xai:tts@0': ['zagan'] },
  silas: { 'inworld:tts@2': ['Sebastian', 'Lucian'], 'xai:tts@0': ['sal'] },
  mae:   { 'inworld:tts@2': ['Loretta', 'Marlene'], 'xai:tts@0': ['una'] },
};
const slug = (s) => s.replace(/[^a-z0-9.]+/gi, '_').toLowerCase();

function voiceTasks(speaker) {
  const text = LINES[speaker], jobs = [];
  for (const [model, voices] of Object.entries(PICKS[speaker])) for (const voice of voices)
    jobs.push({ model, voice, task: { model, speech: { text: model.startsWith('inworld') ? text.replace(/ ?\[laugh\]/g, '') : text, voice } } });
  jobs.push({ model: 'alibaba:qwen@3-tts-1.7b-voicedesign', voice: 'design', prompt: DESIGN[speaker],
    task: { model: 'alibaba:qwen@3-tts-1.7b-voicedesign', positivePrompt: DESIGN[speaker], speech: { text: text.replace(/ ?\[laugh\]/g, ''), voice: 'design', language: 'English' } } });
  return jobs;
}

// ---- music (ACE-Step v1.5 XL SFT: duration 30..300 s, seed, bpm, key; instrumental via vocalLanguage unknown)
const ROCK = 'instrumental hard rock, arena rock, distorted electric guitars, driving drums, bass, no vocals';
const MUSIC = {
  'menu-loop': { duration: 75, bpm: 138, keyScale: 'E minor', prompt: `${ROCK}, pro-wrestling TV show menu theme, chugging palm-muted power-chord riff, steady groove, loopable, consistent energy from start to end, no intro, no fade out` },
  'entrance-vex': { duration: 30, bpm: 150, keyScale: 'A major', prompt: `${ROCK}, flashy glam rock swagger, cocky showboat wrestler entrance, big pyro hit at the start, flashy guitar licks, cowbell` },
  'entrance-kane': { duration: 30, bpm: 90, keyScale: 'D minor', prompt: `${ROCK}, doom metal, crushing slow sludge riff, huge brute monster wrestler entrance, low tuned guitars, pounding tom drums, menacing` },
  'entrance-silas': { duration: 30, bpm: 110, keyScale: 'C# minor', prompt: `${ROCK}, sinister scheming villain wrestler entrance, creeping chromatic guitar riff, dark industrial rock, sly and theatrical` },
  'entrance-mae': { duration: 30, bpm: 128, keyScale: 'G major', prompt: `${ROCK}, gritty southern rock, veteran tough woman wrestler entrance, slide guitar, stomping drums, proud and battle-worn` },
};
const MUSIC_MODEL = 'runware:ace-step@v1.5-xl-sft';

// ---- sfx (Mirelo SFX 1.5 text-to-audio, 1..10 s)
const SFX = {
  bell: { duration: 3, prompt: 'single boxing ring bell strike, loud metallic clang ringing out in a large arena' },
  'crowd-roar': { duration: 6, prompt: 'huge arena crowd roaring and cheering wildly, thousands of fans, stadium' },
  'crowd-pop': { duration: 3, prompt: 'sudden explosive arena crowd pop, thousands of fans erupt in a short loud cheer' },
  'crowd-gasp': { duration: 3, prompt: 'large arena crowd gasping in shock all at once, then murmuring' },
  'crowd-boo': { duration: 5, prompt: 'large arena crowd booing loudly at a villain, thousands of fans jeering' },
};
const SFX_MODEL = 'mirelo:1@1';

async function main() {
  const [what, filter = '', modelFilter = ''] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '{"voices":{},"music":{},"sfx":{}}'));
  const save = () => writeFile(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  if (what === 'voices') {
    await mkdir(join(ASSETS, 'candidates'), { recursive: true });
    for (const speaker of Object.keys(LINES).filter(s => s.includes(filter))) {
      await Promise.all(voiceTasks(speaker).filter(j => j.model.includes(modelFilter)).map(async (j) => {
        const name = `${speaker}-${slug(j.model)}-${slug(j.voice)}`;
        try {
          const [mp3, wav] = await run([{ ...j.task, outputFormat: 'MP3' }, { ...j.task, outputFormat: 'WAV' }], 60000);
          await writeFile(join(ASSETS, 'candidates', `${name}.mp3`), Buffer.from(mp3.audioBase64Data, 'base64'));
          const m = measureWav(Buffer.from(wav.audioBase64Data, 'base64'));
          manifest.voices[name] = { speaker, model: j.model, voice: j.voice, prompt: j.prompt, text: j.task.speech.text, ms: mp3.ms, cost: (mp3.cost ?? 0) + (wav.cost ?? 0), ...m };
          console.log(name, JSON.stringify(manifest.voices[name].seconds), m.rmsDb, m.pitchHz, mp3.ms + 'ms');
        } catch (e) { console.log(name, 'FAILED', e.message); manifest.voices[name] = { speaker, model: j.model, voice: j.voice, error: e.message }; }
      }));
      await save();
    }
  }
  const media = { music: [MUSIC, MUSIC_MODEL], sfx: [SFX, SFX_MODEL] }[what];
  if (media) {
    const [table, model] = media;
    await mkdir(join(ASSETS, what), { recursive: true });
    await Promise.all(Object.entries(table).filter(([n]) => n.includes(filter)).map(async ([name, s]) => {
      const seed = 1000 + Object.keys(table).indexOf(name);
      const task = what === 'music'
        ? { model, positivePrompt: s.prompt, negativePrompt: 'vocals, singing, voice, lyrics, speech', duration: s.duration, seed, outputFormat: 'MP3',
            settings: { bpm: s.bpm, keyScale: s.keyScale, vocalLanguage: 'unknown', lyrics: '[Instrumental]' } }
        : { model, positivePrompt: s.prompt, duration: s.duration, seed, outputFormat: 'MP3' };
      try {
        const [r] = await run([task]);
        const buf = Buffer.from(r.audioBase64Data, 'base64');
        await writeFile(join(ASSETS, what, `${name}.mp3`), buf);
        manifest[what][name] = { model, prompt: s.prompt, seed, duration: s.duration, bpm: s.bpm, keyScale: s.keyScale, bytes: buf.length, ms: r.ms, cost: r.cost };
        console.log(what, name, buf.length, r.ms + 'ms', r.cost);
      } catch (e) { console.log(what, name, 'FAILED', e.message); }
    }));
    await save();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
