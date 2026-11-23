# Audio credits

- **Menu music and entrance stings** (`music.js`): synthesized at runtime with WebAudio (distorted saw power chords,
  noise drums). No samples, no downloaded tracks, no wrestling themes. Original to this repo. I did not try a CC0
  download (OpenGameArt or Pixabay) inside the time box, so the synth loop shipped as the stated fallback.
- **Crowd and ring bell** (`crowd.js`): synthesized at runtime (pink noise, filtered bursts, inharmonic bell partials).
- **Voices**: OpenAI `gpt-4o-mini-tts` (generated at runtime, cached in `voice/.cache/`), Runware Inworld TTS when
  `RUNWARE_API_KEY` is set. Original characters. The prompts tell the models not to imitate real commentators.
- `docs/audio/sample-*.mp3`: OpenAI `gpt-4o-mini-tts` renders of six booth lines (see `docs/lanes/voice.md`).
