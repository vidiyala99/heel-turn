// Character bible: the one source for who each wrestler (and referee Lou) is and what they wear.
// Read by shared/roster-assets.js (3D body + attire), ui/menu.js (cards, select tints), and main.js (HUD names).
// Card art (public/art/portrait-*, entrance-*) is generated from studio renders of these models, so a palette
// change here means re-running tools/render_cards.py and tools/cards_from_renders.py.
//
// palette: ui (HUD/card tint: primary lifted for text contrast on dark), primary (main gear color), secondary (trim / boots), accent (detail: laces, piping, sparkle), skin.
// attire: the garment list bodies.js builds as skinned shells over the base mesh, in draw order.
export const CHARACTERS = {
  vex: {
    name: 'Vex', full: 'Vex “The Voltage”', role: 'Showboat',
    line: 'Fast hands, faster mouth. Wins the crowd first, the match second.', power: 55, speed: 90, technique: 70,
    body: 'male', build: [1, 1.02, 1], hair: ['Hair_Buzzed'], hairColor: 0x2b8cff,
    palette: { ui: 0x2b8cff, primary: 0x2b8cff, secondary: 0x0b1a3a, accent: 0xe9f3ff, skin: 0xf2d6c4 },
    attire: [
      { kind: 'trunks', color: 'secondary', trim: 'primary' },
      { kind: 'vest', color: 'primary', sequins: true },
      { kind: 'kneepads', color: 'secondary', trim: 'primary' },
      { kind: 'boots', color: 'primary', laces: 'accent', sole: 'accent' },
      { kind: 'wristTape', color: 'accent' },
    ],
  },
  kane: {
    name: 'Brutus Kane', full: 'Brutus Kane', role: 'Brute',
    line: 'Does not run the ropes. Runs through them.', power: 95, speed: 42, technique: 50,
    body: 'male', build: [1.16, 1.1, 1.16], hair: ['Hair_Beard', 'Hair_Buzzed'], hairColor: 0xa8401a,
    palette: { ui: 0xe8333b, primary: 0xb3242b, secondary: 0x141012, accent: 0xe8b04a, skin: 0xf0c4a8 },
    attire: [
      { kind: 'singlet', color: 'primary', trim: 'secondary', straps: true },
      { kind: 'kneepads', color: 'secondary', trim: 'primary' },
      { kind: 'boots', color: 'secondary', laces: 'primary', sole: 'primary' },
      { kind: 'elbowTape', color: 'secondary' },
      { kind: 'wristTape', color: 'accent' },
    ],
  },
  silas: {
    name: 'Silas Crane', full: 'Silas Crane', role: 'Schemer',
    line: 'Studies you for three rounds, then takes the fourth.', power: 60, speed: 66, technique: 92,
    body: 'male', build: [0.97, 1.03, 0.97], hair: ['Hair_Long'], hairColor: 0x15101a,
    palette: { ui: 0x8b5cf6, primary: 0x6a35c4, secondary: 0x150d22, accent: 0x7be05a, skin: 0xe8d2c6 },
    attire: [
      { kind: 'tights', color: 'primary', trim: 'accent' },
      { kind: 'coat', color: 'secondary', trim: 'primary' },
      { kind: 'boots', color: 'secondary', laces: 'accent', sole: 'primary' },
      { kind: 'wristTape', color: 'secondary' },
    ],
  },
  mae: {
    name: 'Old Iron Mae', full: 'Old Iron Mae', role: 'Veteran',
    line: 'Thirty years in the ring. She has a counter for everything you try.', power: 76, speed: 52, technique: 86,
    body: 'female', build: [0.95, 1.0, 0.95], hair: ['Hair_Buns'], hairColor: 0xd8dde4,
    palette: { ui: 0xc9ced8, primary: 0xb9c0cb, secondary: 0x16181d, accent: 0x6f7886, skin: 0xe6c3ae },
    attire: [
      { kind: 'singlet', color: 'secondary', trim: 'primary', panel: 'primary', straps: true },
      { kind: 'kneepads', color: 'primary', trim: 'secondary' },
      { kind: 'boots', color: 'secondary', laces: 'primary', sole: 'primary' },
      { kind: 'wristTape', color: 'primary' },
    ],
  },
  ref: {
    name: 'Lou Varga', full: 'Referee Lou Varga', role: 'Referee',
    body: 'male', build: [0.98, 0.98, 0.98], hair: ['Hair_SimpleParted'], hairColor: 0x2a1d16,
    palette: { ui: 0xf2f2f2, primary: 0xf2f2f2, secondary: 0x111214, accent: 0x111214, skin: 0xe9c9b2 },
    attire: [
      { kind: 'slacks', color: 'secondary' },
      { kind: 'refShirt', color: 'primary', stripe: 'secondary' },
      { kind: 'shoes', color: 'secondary', sole: 'secondary' },
    ],
  },
};
// Lou is 'ref' in the bible; older code calls him 'lou'.
CHARACTERS.lou = CHARACTERS.ref;
export const WRESTLER_IDS = ['vex', 'kane', 'silas', 'mae'];
export const cssHex = (n) => '#' + n.toString(16).padStart(6, '0');
