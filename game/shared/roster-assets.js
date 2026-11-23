// Which body each roster id (and the referee) wears. Read by game/arena/bodies.js.
// body: a GLB in /models/wrestlers (Quaternius Universal Base Characters, CC0; see CREDITS.md there).
// hair: hair meshes to keep (all others in the GLB are hidden). scale: [width, height, depth].
// skin multiplies the skin texture. trunks recolors the dark gear pixels of the base texture.
// top: torso garment ('singlet' | 'stripes' | 'sports' | null). legs: full-length tights/trousers color or null.
export const ROSTER_ASSETS = {
  vex: {
    body: 'male', hair: ['Hair_Buzzed'], hairColor: 0x2b8cff, scale: [1, 1.02, 1],
    skin: 0xf2d6c4, trunks: 0x1f6fe0, top: null, legs: null, boots: 0x0d2a5c,
  },
  kane: {
    body: 'male', hair: ['Hair_Beard', 'Hair_Buzzed'], hairColor: 0xb4441c, scale: [1.16, 1.1, 1.16],
    skin: 0xf0c4a8, trunks: 0xb3242b, top: { kind: 'singlet', color: 0xb3242b }, legs: null, boots: 0x1a0c0c,
  },
  silas: {
    body: 'male', hair: ['Hair_Long'], hairColor: 0x1c1420, scale: [0.97, 1.03, 0.97],
    skin: 0xe8d2c6, trunks: 0x5b2fa8, top: null, legs: 0x3a1f6e, boots: 0x150b22,
  },
  mae: {
    body: 'female', hair: ['Hair_Buns'], hairColor: 0xd8dde4, scale: [0.95, 1.0, 0.95],
    skin: 0xe6c3ae, trunks: 0x8a929e, top: null, legs: null, boots: 0x22262d,
  },
  ref: {
    body: 'male', hair: ['Hair_SimpleParted'], hairColor: 0x2a1d16, scale: [0.98, 0.98, 0.98],
    skin: 0xe9c9b2, trunks: 0x121316, top: { kind: 'stripes', color: 0xf2f2f2, alt: 0x121316 }, legs: 0x121316, boots: 0x0c0c0e,
  },
};
export const BODY_URLS = { male: '/models/wrestlers/body_male.glb', female: '/models/wrestlers/body_female.glb' };
export const CLIPS_URL = '/models/wrestlers/clips.glb';
// Universal Animation Library clip -> name the game plays.
export const CLIP_NAMES = { Idle_Loop: 'idle', Walk_Loop: 'walk', Jog_Fwd_Loop: 'run', Punch_Jab: 'jab', Hit_Chest: 'hit' };
