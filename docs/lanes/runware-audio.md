# Lane: Runware audio (voices, music, SFX)

Goal: push HEEL TURN's audio onto Runware (sponsor prize) as far as it honestly goes: booth and wrestler voices, menu
and entrance music, crowd and bell SFX. All code in `voice/`. Renderer: `node voice/render-runware-assets.mjs
voices|music|sfx [name] [model]`. It writes every asset with model, prompt, seed, cost and latency to
`voice/assets/manifest.json`.

## 1. Runware audio catalog (2026-11-23)
Source: Runware `modelSearch` API (`category: audio`, 33 live models) and each model's OpenAPI schema at
`https://runware.ai/docs/models/<slug>/schema.json`. Prices are the schema's `x-pricing`.
| kind | AIR | controls that matter here | price |
|---|---|---|---|
| TTS | `inworld:tts@2` (Realtime TTS-2) | 133 named voices, `speed` 0.5-1.5, `language`, voice direction carried across a session | $0.000035/char |
| TTS | `inworld:tts@1.5-max` / `@1.5-mini` | 73 voices, `speed`, `temperature` 0.1-2 | $0.00005 / $0.000025 per char |
| TTS | `xai:tts@0` | 27 voices, inline speech tags (laugh, pause, whisper, emphasis) per the model description | $0.000015/char |
| TTS | `alibaba:qwen@3-tts-1.7b-voicedesign` | voice from a written description (`positivePrompt`), `speed`, `language` (`English` etc, not `en`) | $0.000015/char |
| TTS | `alibaba:qwen@3-tts-1.7b-base` / `-customvoice` | cloning from a 3 s sample (not used: original voices only) | n/a |
| TTS | `minimax:speech@2.8` | 332 voices, `languageBoost`, `turbo` | $0.0001/char HD, $0.00006 turbo |
| TTS | `fishaudio:s2.1@pro` | bracket cues `[laughs]`, multi-speaker in one call, voice IDs from fish.audio library | $0.000015/byte |
| TTS | `bytedance:seed-audio@1.0` | expressive TTS, voice conversion, `pitch`/`speed`/`volume` | $0.00263/s |
| TTS | `runware:dia2@2b` | dialogue, non-verbal cues, cloning | per request |
| TTS | `heygen:voice@1.0` (+ `-turbo`, `-turbo-free`) | public voices, `expressiveness` | $0.00003/char |
| TTS | `google:gemini@3.8-flash-tts`, `@3.1-flash-tts` (deprecated) | multi-speaker, `temperature`, `seed` | per token |
| TTS | `elevenlabs:20..27@1` (v1 to Eleven v3) | ElevenLabs voice IDs | n/a in schema |
| music | `runware:ace-step@v1.5-xl-sft` / `-xl-base` / `-xl-turbo`, `@v1.5-base` / `-turbo` | `duration` 30-300 s, `seed`, `bpm`, `keyScale`, `lyrics`, repaint, CFG | ~$0.007-0.011 per clip (measured) |
| music | `minimax:music@2.6`, `minimax:music@cover` | full songs, section tags, `instrumental`; no duration control | $0.15/clip |
| music | `elevenlabs:1@1` (Music V1) | | n/a |
| SFX | `mirelo:1@1` (Mirelo SFX 1.5) | text or video to audio, `duration` 1-10 s, `seed`, `steps` | $0.00025/s listed; billed $0.03-0.06 per clip (measured) |
Not in the catalog: speech-to-text. Not tried for time: MiniMax Speech, Fish, Seed Audio, ElevenLabs, Gemini.

## 2. Voices
Same line per speaker on Inworld TTS-2 (2 voices), xAI TTS (1 voice) and Qwen3 VoiceDesign (a written description of
an original voice). 28 clips in `voice/assets/candidates/`. Measured from a WAV render of the same request:
duration, RMS dBFS, median pitch by autocorrelation. Pick rule: pitch matches the role (low for the brute and the
announcer), the slow roles run longest, loud roles loudest, and the six live voices stay distinct in pitch.
| speaker | pick | s | RMS dB | pitch Hz | why |
|---|---|---|---|---|---|
| rex | `inworld:tts@2` Blake | 7.56 | -19.1 | 110 | loudest of the three named voices at full line length; Qwen ran 2 s short and tracked at 343 Hz |
| dot | `xai:tts@0` ara | 5.75 | -22.1 | 211 | only model in the set that takes `[laugh]` inline, for the cackle; longest read |
| ring | `inworld:tts@2` Hades | 7.46 | -19.7 | 106 | lowest pitch and longest of the named voices (long vowels). Qwen gave 11.0 s but at 293 Hz |
| vex | `inworld:tts@2` Jason | 4.62 | -18.7 | 168 | loudest candidate |
| kane | `xai:tts@0` zagan | 4.79 | -22.4 | 119 | low and slowest named voice. Hades is lower but taken by the announcer; Qwen hit 99 Hz and 7.8 s but a designed voice is regenerated per line, so it may drift |
| silas | `inworld:tts@2` Lucian | 5.35 | -26.4 | 102 | low and quiet (silky); the voice bus compressor lifts it |
| mae | `inworld:tts@2` Loretta | 5.16 | -20.7 | 172 | lowest female-range Inworld voice, slower than Marlene |
Full table with all 28 candidates: `voice/assets/manifest.json`. `voices.js` now holds `runware: { model, voice }`;
`server.js` sends the per-speaker model (`RUNWARE_TTS_MODEL` still forces one model), drops `speed` for xAI and strips
`[tags]` for non-xAI models.

## 3. Music and SFX
ACE-Step v1.5 XL SFT: `menu-loop` (75 s, 138 bpm, E minor) and `entrance-{vex,kane,silas,mae}` (30 s each, tempo and
key per gimmick). Mirelo SFX 1.5: `bell`, `crowd-roar`, `crowd-pop`, `crowd-gasp`, `crowd-boo`. Prompts, seeds and
license notes in `voice/CREDITS.md`. `music.js` plays `menu-loop.mp3` on a seamless `AudioBufferSource` loop and
the first 1.3 s of the entrance theme as the versus sting (`entrance(w)` plays 18 s), and falls back to the synth loop
and stings when a file fails to load or decode. The SFX are rendered but `crowd.js` does not use them yet.

## 4. Cache and latency
Cache key is now `provider|model|voice|speed|text` (OpenAI: `openai|model|voice|style|text`), so switching provider,
model or voice re-renders. Measured, `node voice/test/latency-runware.mjs` (in-process server, fresh cache dir, live
Runware, 12 lines across all 7 speakers):
- uncached: p50 2543 ms, p90 3158, min 1133, max 3191 (n=12, 12 misses). By model: Inworld TTS-2 p50 2747 ms (n=8),
  xAI p50 1335 ms (n=4).
- cached: p50 1.6 ms, p90 2.0, max 2.2 (n=12, 12 hits).
Uncached time is the Runware round trip for the full clip (base64 response, no streaming), so it scales with line
length. The warm cache at server start covers every template line, so only LLM lines pay it.

## VERIFIED
- `npm test --prefix voice`: 9 pass, 0 fail (server test now asserts kane goes to `xai:tts@0` / `zagan`).
- All 28 voice, 5 music and 5 SFX renders returned 200 with audio (after fixing Qwen's `language: 'English'`).
- Music file sizes scale with requested duration (menu 2.24 MB / entrance ~0.87 MB = 2.6, requested 75/30 = 2.5).
  I could not decode the MP3s for exact duration: no ffmpeg on this VM.

## NOT verified
- Nobody has listened. Picks rest on pitch, loudness and pace numbers, not on hearing style, so whether xAI renders
  `[laugh]` as a laugh, whether the loop seam is clean, and whether the entrance themes fit each gimmick are unknown.
- `music.js` file path is not run in a browser here (no Chromium). `node --check` passes.
- Not pushed: `git push` needed approval in this sandbox. Commits are local on `lane/runware-audio`.
- Mirelo and Runware output license terms: not read in this run.
