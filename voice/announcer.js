// Ring announcer lines (speaker 'ring', voices.js). Original wording in the classic PA shape, built from the
// character bible (name, hometown, weight). The server pre-renders every line at start (warmCache), so the
// entrance and the winner call are disk reads.
//   introLines(p1, p2) -> [{ speaker, kind, text }]   winnerLine(id)   entrantLine(id)   announcerLines()
import { CHARACTERS } from '../game/shared/characters.js';

export const ROSTER = ['vex', 'kane', 'silas', 'mae'];
const line = (kind, text) => ({ speaker: 'ring', kind, text });
const c = (id) => CHARACTERS[id] || CHARACTERS.vex;
const NAME = (id) => c(id).name.toUpperCase();

export const openerLine = () => line('ring_open', 'Ladies and gentlemen... this contest is scheduled for ONE FALL!');
const from = (id) => `from ${c(id).hometown}... weighing in at ${c(id).weight} pounds... ${NAME(id)}!`;
export const winnerLine = (id) => line('ring_winner', `Here is your winner... ${NAME(id)}!`);
export const entrantLine = (id) => line('ring_entrant', `Next entrant... from ${c(id).hometown}... ${NAME(id)}!`);
export const introLines = (p1, p2) => [
  openerLine(),
  line('ring_intro', `Introducing first... ${from(p1)}`),
  line('ring_intro', `And ${c(p1).body === 'female' ? 'her' : 'his'} opponent... ${from(p2)}`),
];

// Everything the booth can ask the announcer for, deduplicated: the warm-cache list.
export function announcerLines(roster = ROSTER) {
  const out = new Map();
  const add = (l) => out.set(l.text, l);
  for (const a of roster) {
    add(winnerLine(a)); add(entrantLine(a));
    for (const b of roster) if (a !== b) introLines(a, b).forEach(add);
  }
  return [...out.values()];
}
