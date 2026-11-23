# Audio credits

- **Menu loop and entrance themes** (`assets/music/*.mp3`, played by `music.js`): generated on Runware with ACE-Step
  v1.5 XL SFT (`runware:ace-step@v1.5-xl-sft`, Apache-2.0 open model run by Runware). Instrumental only, negative prompt
  `vocals, singing, voice, lyrics, speech`. Generated for this repo by `node voice/render-runware-assets.mjs music`.
  Prompts, seed, bpm, key, cost and latency per file are in `assets/manifest.json`.
  | file | seed | s | bpm | key | prompt (after the shared hard-rock prefix) |
  |---|---|---|---|---|---|
  | menu-loop | 1000 | 75 | 138 | E minor | pro-wrestling TV menu theme, palm-muted power-chord riff, loopable, no intro, no fade out |
  | entrance-vex | 1001 | 30 | 150 | A major | glam rock swagger, cocky showboat entrance, pyro hit, flashy licks, cowbell |
  | entrance-kane | 1002 | 30 | 90 | D minor | doom metal, crushing slow sludge riff, brute monster entrance, pounding toms |
  | entrance-silas | 1003 | 30 | 110 | C# minor | sinister schemer, creeping chromatic riff, dark industrial rock |
  | entrance-mae | 1004 | 30 | 128 | G major | gritty southern rock, veteran tough woman, slide guitar, stomping drums |
  The synthesized WebAudio loop and stings in `music.js` remain as the fallback when a file does not load.
- **SFX** (`assets/sfx/*.mp3`): Runware Mirelo SFX 1.5 (`mirelo:1@1`), text-to-audio, seeds 1000 to 1004 in the order
  bell, crowd-roar, crowd-pop, crowd-gasp, crowd-boo. Prompts in `assets/manifest.json`. `crowd.js` still synthesizes
  its crowd and bell at runtime; these files are not wired in yet.
- **License notes**: Runware's terms grant the customer the outputs of API generations; ACE-Step is Apache-2.0. I did
  not read Mirelo's or Runware's terms page in this run (guess, not verified). No reference audio, no existing songs or
  wrestling themes were used as input.
- **Voices**: Runware per speaker (`voices.js`): Inworld TTS-2 (`inworld:tts@2`) for Rex, the ring announcer, Vex,
  Silas, Mae; xAI TTS (`xai:tts@0`) for Dot and Kane. Stock voices from each provider's library, original characters,
  no cloning. OpenAI `gpt-4o-mini-tts` when only `OPENAI_API_KEY` is set. Candidates in `assets/candidates/` (28 clips,
  including Qwen3-TTS VoiceDesign renders from written voice descriptions).
- **Crowd and ring bell** (`crowd.js`): synthesized at runtime (pink noise, filtered bursts, inharmonic bell partials).
- `docs/audio/sample-*.mp3`: OpenAI `gpt-4o-mini-tts` renders of six booth lines (see `docs/lanes/voice.md`).
