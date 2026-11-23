// One row per speaker. runware = Inworld TTS voice name (runware.ai/docs/models/inworld-tts-1-5-mini);
// pitch/rate = browser speechSynthesis fallback, spread apart so the six stay distinct on one system voice.
export const VOICES = {
  rex:   { label: 'Rex Ramsey (play-by-play)', runware: 'Blake',     speed: 1.15, pitch: 1.15, rate: 1.25, lang: 'en-US', prefer: /male|david|guy|daniel/i },
  dot:   { label: 'Dot Calloway (color)',      runware: 'Deborah',   speed: 0.95, pitch: 0.9,  rate: 0.95, lang: 'en-GB', prefer: /female|zira|samantha|kate|serena/i },
  vex:   { label: 'Vex (showboat)',            runware: 'Jason',     speed: 1.1,  pitch: 1.4,  rate: 1.15, lang: 'en-US', prefer: /male/i },
  kane:  { label: 'Brutus Kane (brute)',       runware: 'Hades',     speed: 0.85, pitch: 0.3,  rate: 0.8,  lang: 'en-US', prefer: /male/i },
  silas: { label: 'Silas Crane (schemer)',     runware: 'Sebastian', speed: 0.9,  pitch: 0.75, rate: 0.85, lang: 'en-GB', prefer: /male/i },
  mae:   { label: 'Old Iron Mae (veteran)',    runware: 'Loretta',   speed: 1.0,  pitch: 0.65, rate: 1.0,  lang: 'en-US', prefer: /female/i },
};
