// Which body each roster id (and the referee) wears, derived from the character bible (shared/characters.js).
// Read by game/arena/bodies.js. body: a GLB in /models/wrestlers (Quaternius Universal Base Characters, CC0;
// see CREDITS.md there). hair: hair meshes to keep (all others in the GLB are hidden). scale: [width, height, depth].
import { CHARACTERS } from './characters.js';
import { USED_CLIPS } from './anims.js';

export const ROSTER_ASSETS = Object.fromEntries(Object.entries(CHARACTERS).map(([id, c]) => [id, {
  body: c.body, hair: c.hair, hairColor: c.hairColor, scale: c.build, palette: c.palette, attire: c.attire,
}]));
export const BODY_URLS = { male: '/models/wrestlers/body_male.glb', female: '/models/wrestlers/body_female.glb' };
export const CLIPS_URL = '/models/wrestlers/clips.glb';
// Universal Animation Library clips the game keeps, by their own names (shared/anims.js maps them).
export const CLIP_NAMES = Object.fromEntries(USED_CLIPS.map((c) => [c, c]));
