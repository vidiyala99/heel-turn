# Lane: voice (commentary, wrestler voices, crowd)

Goal: two commentators (Rex Ramsey, play-by-play, excitable; Dot Calloway, color, dry and heel-sympathetic) and
taunts for Vex, Brutus Kane, Silas Crane and Old Iron Mae, over a procedural crowd. All code lives in `voice/`.

## 2026-11-23: neural booth (OpenAI TTS until the Runware key arrives)
Problem: with no `RUNWARE_API_KEY`, every line fell back to browser `speechSynthesis`, which sounded robotic.
- Provider order in `server.js`: Runware (sponsor) -> OpenAI `gpt-4o-mini-tts` -> browser. Per-speaker voice and
  style instructions live in `voices.js` (Rex `ash`, earnest hyped play-by-play that screams big moments; Dot
  `ballad`, smug cackling heel sympathizer; Vex `verse`, Kane `onyx`, Silas `fable`, Mae `shimmer`). Disk cache key
  = sha256(model|voice|style|text). Start with `cd voice && npm start` (loads `../.env`).
- Warm cache: at start the server renders all 511 template lines (every roster name pair, taunts, move calls), 6 at
  a time. First run takes about 3 minutes and then lives on disk.
- Browser (`tts.js`): clips are prefetched when a line is queued, played through a voice bus on the crowd's
  AudioContext (110 Hz high-pass, -3 dB at 300 Hz, +4 dB at 3.2 kHz, 4:1 compressor). A clip not ready 2 s after its
  cue is dropped. An LLM line that is late swaps to its pre-rendered template line.
- Booth (`commentary.js`): stale threshold 2 s, measured from the cue (a follow-up's cue is the end of Rex's call).
  Dot answers 0.4 to 1 s after Rex ends on big moments. `ev.move` (body_slam, suplex, ddt, clothesline, irish_whip)
  gets a named call. The sim only emits strike, grapple (called as a slam), finisher, toss and reversal today, so
  the named-move banks wait for the sim to send `move`. LLM lines get `story` (Bruin grudge plus the last 4 BAND
  plan intents) from `agent-layer.js`.
- Crowd: fades in at the match screen and out at the results screen. Ring bell on entry or `bell`, three rings on an elimination.
- Music (`music.js`): synth hard-rock loop on title, menu, select, versus and results. Plays after the first key
  press, follows the Settings volume, ducks on screen changes, and plays a per-wrestler sting on versus.
  `game/ui/menu.js` dispatches `heel:screen`.
- Silence under automation: with `navigator.webdriver` set, or `?mute=1`, nothing speaks or plays. speechSynthesis
  is never called under webdriver, even in tests.

Measured (n=12 each, local server, `node voice/test/latency-neural.mjs`): cached first byte p50 3.6 ms (2.5 to 6.6),
uncached p50 1463 ms (1112 to 1761). Headless Chromium with `--mute-audio` (`node voice/test/browser-neural.mjs`):
6/6 lines started on the neural path 11 to 30 ms after their cue, AudioContext running, 0 speechSynthesis calls,
no page errors. Samples: `docs/audio/sample-1-bell.mp3` "There's the bell! Here we GO!", `-2-strike` "Brutus Kane
lights up Vex!", `-3-slam` "Brutus Kane picks up Vex, BODY SLAM!", `-4-near-fall` "Cover! One! Two! NO!",
`-5-kickout` (Dot) "Oh, stay DOWN. Nobody paid to watch you hope.", `-6-finisher` "HERE IT COMES! Silas Crane hits the finisher!".
Not verified: nobody has listened to the voices or the music yet, and the live game booth has not been heard end to end.

## Files
- `commentary.js`: game event -> line. Shuffle-bag templates (`lines.js`), one voice at a time, priority queue, OpenAI follow-ups for big moments.
- `tts.js`: `speak(line)`. Uses Runware mp3 through the proxy when the proxy has a key, browser `speechSynthesis` otherwise. Calls `onDuck(true/false)` around each line.
- `voices.js`: six speakers. Each has a Runware Inworld voice name and a fallback pitch/rate.
- `crowd.js`: WebAudio crowd with a pink-noise murmur bed, swells, clap and "HEY" chants, and `duck()`. No samples.
- `server.js`: Node proxy on port 8787 with no dependencies. Serves `/voice/*`, `/voice/api/health`, `/voice/api/tts` (mp3 cached on disk by sha256) and `/voice/api/line` (OpenAI).
- `demo.html`: one button per sample event. Run `node voice/server.js` and open http://localhost:8787/voice/demo.html. Add `?tts=browser` to force the fallback.

## VERIFIED
1. Unit and proxy tests pass. Command: `cd voice && npm test`
   ```
   ✔ bag never repeats back to back, across reshuffles
   ✔ every bank line is used before any repeats
   ✔ one voice at a time, bursts are dropped not queued      (10 strikes in a burst -> 2 spoken, 8 dropped)
   ✔ a betrayal outranks queued strikes and brings Dot plus the betrayer   (order: rex, rex, dot, silas)
   ✔ big moments use the LLM line when it answers in time, template otherwise
   ✔ taunts speak in the wrestler voice; failed moves stay silent
   ✔ tts proxies Runware once per text, then serves the disk cache   (stand-in Runware server: request shape, Bearer auth, 6 distinct voices, cache hit, 400/503/404 paths)
   ℹ pass 7  ℹ fail 0
   ```
2. Fallback path latency in our code, from event to `speechSynthesis` onstart, with a stub engine that starts on the next tick. Command: `cd voice && node test/latency.mjs`
   `{"events":10,"linesSpoken":14,"firstLine_ms":[2.38,2.08,2.08,2.12,2.15,1.33,2.13,2.15,2.16,2.11],"speakers":["rex","dot","silas"],"distinctPitchRate":3}`
   Our code adds about 2 ms. Most of that is the stub's own `setTimeout(0)`.
3. Live OpenAI color lines through the proxy (`gpt-4.1-mini`, real key from env). Same command, n=5, betrayal event:
   `{"llm_ms":[612,601,726,658,686]}`. An earlier run gave `[1447,842,1110,1965,671]`. Every call came in under the 2500 ms wait, so Dot uses the LLM line. Sample: "Silas Crane's loyalty has a price, and Brutus just didn't pay the tab."
4. The demo page and all modules are served with the right content types (200, text/html and text/javascript).

## NOT verified
- **Real Runware TTS.** `RUNWARE_API_KEY` is not set on this VM. The request shape comes from runware.ai/docs/models/inworld-tts-1-5-mini: `taskType: audioInference`, `model: inworld:tts@1.5-mini`, `speech: {text, voice, speed}`, `outputFormat: MP3`, `outputType: base64Data`. The endpoint `https://api.runware.ai/v1` with a Bearer token and the `data[0].audioBase64Data` response field are from memory of Runware's REST API (guess). I could not load the auth doc page because it returned 404. First live check: `RUNWARE_API_KEY=... node voice/server.js`, then `curl -XPOST localhost:8787/voice/api/tts -d '{"speaker":"kane","text":"KANE SMASH."}' -H content-type:application/json -o k.mp3`. If it fails, the 502 body quotes Runware's error. The voice picks (Blake, Deborah, Jason, Hades, Sebastian, Loretta) are guesses from the names and have not been listened to.
- **Real browser audio.** Headless Chromium downloaded, but it cannot start: `libnspr4.so` is missing and apt is not allowed here. Not measured yet: the real speechSynthesis engine startup time, `crowd.js` sound, ducking, and whether the six fallback voices sound distinct. The pitch/rate values give 6 distinct pairs (the test above used 3 speakers). `voice/test/browser.mjs` runs demo.html headless and prints latency on any machine where Chromium starts.
- **Design skills not loaded.** No player-facing visual shipped. demo.html is a dev page, and the caption DOM belongs to game/ui.

## How main.js should call it
```js
import { createCommentary } from '../voice/commentary.js';
import { createTTS } from '../voice/tts.js';
import { createCrowd } from '../voice/crowd.js';

const crowd = createCrowd();                       // call crowd.start() inside the first click/keydown handler
const tts = createTTS({ onDuck: crowd.duck });     // base defaults to '/voice/api'
const health = await fetch('/voice/api/health').then(r => r.json()).catch(() => ({}));
const booth = createCommentary({
  say: tts.speak,
  llm: health.llm ? '/voice/api/line' : null,
  onCaption: (line) => ui.caption(line.speaker, line.text),   // game/ui owns the caption element
});
// every game event, same shape as docs/PLAN.md `event`:
function onGameEvent(ev) { booth.onEvent(ev); crowd.onEvent(ev); }
```
- Event kinds understood: strike, reversal, grapple, knockdown, pin (near-fall), kickout, elimination, entry, alliance_offer, alliance_reply, betray, finisher, taunt, bribe. `actor`/`target` are the ids `vex|kane|silas|mae` (others are spoken as given). `success: false` stays silent. `taunt` speaks `ev.text` when it is set, so BAND/LLM taunts play in the wrestler's own voice. `ev.moment: 'win'|'entry'` picks those taunt banks.
- Vite dev: proxy `/voice/api` to `http://localhost:8787` in `vite.config.js`, and run `node voice/server.js` alongside. Without the proxy, everything still works on browser voices and templates, because a failed health check means no Runware and no LLM.
- Env: `RUNWARE_API_KEY`, `OPENAI_API_KEY`, optional `OPENAI_MODEL`, `RUNWARE_TTS_MODEL`, `PORT`, `VOICE_CACHE_DIR`. No keys are on disk.
