// Line banks. {a} = actor display name, {t} = target display name.
// Keys are commentary kinds (see KIND_OF in commentary.js), values per speaker.

export const NAMES = {
  vex: 'Vex', kane: 'Brutus Kane', silas: 'Silas Crane', mae: 'Old Iron Mae',
  p1: 'the challenger', p2: 'the newcomer',
};

export const CALLS = {
  strike: {
    rex: [
      '{a} lights up {t}!', 'Right hand from {a}!', '{a} with a stiff shot!', 'Big strike, {t} staggers!',
      '{a} unloading on {t}!', 'Oh, that one echoed!', '{a} going to the body!', 'Forearm! {t} felt that!',
    ],
    dot: [
      'Efficient. I like it.', '{t} walked right into that.', 'Fundamentals, Rex.', 'That was rude. Good.',
    ],
  },
  slam: {
    rex: [
      '{a} plants {t} into the canvas!', 'SLAM! The whole ring shook!', '{a} hoists {t} up and DOWN!',
      'Body slam! {t} is folded in half!', 'Oh my, {a} just drove {t} through the mat!', '{a} with a thunderous slam!',
    ],
    dot: [
      'Gravity remains undefeated.', '{t} should invest in a chiropractor.', 'Textbook. Painful textbook.',
      'That mat has a family, Rex.',
    ],
  },
  near_fall: {
    rex: [
      'Cover! One! Two! NO!', '{a} hooks the leg! Two and nine tenths!', 'So close! {t} is still alive!',
      'The ref\'s hand was coming down! Not yet!', 'Pin attempt by {a}, the crowd is losing it!',
    ],
    dot: [
      'Should\'ve hooked both legs.', 'Lazy cover. I\'d have sat on him.', 'Lou counts like he\'s paid by the hour.',
    ],
  },
  kickout: {
    rex: [
      '{t} KICKS OUT!', 'Shoulder up! {t} refuses to stay down!', 'Kickout! What heart from {t}!',
      'At the last second, {t} escapes!', 'NO! {t} is not done!',
    ],
    dot: [
      'Stubborn. Annoyingly stubborn.', 'Someone tell {t} the script.', 'That only delays the inevitable.',
    ],
  },
  elimination: {
    rex: [
      '{t} goes OVER THE TOP! Eliminated!', '{a} dumps {t} to the floor! Gone!', 'And {t} is OUT of this match!',
      'Over the top rope! {t} has been eliminated!', 'Goodbye, {t}! {a} sends them packing!',
    ],
    dot: [
      'Take the stairs next time, {t}.', 'One less mouth to feed.', 'Elimination is a mindset. {a} has it.',
      'I\'ll miss {t}. No I won\'t.',
    ],
  },
  entry: {
    rex: [
      'Here comes {a}!', 'The countdown hits zero, it\'s {a}!', 'Listen to this place! {a} is in the building!',
      'A new entrant! {a} is headed for the ring!', '{a} hits the ramp and the crowd ERUPTS!',
    ],
    dot: [
      'Finally, some talent.', 'Fresh legs, bad intentions.', '{a} has been waiting for this all night.',
    ],
  },
  alliance: {
    rex: [
      '{a} and {t} shaking hands? An alliance!', 'Wait, {a} is teaming up with {t}!', 'A partnership forming in the corner!',
      '{a} and {t} on the same page, for now!',
    ],
    dot: [
      'Every alliance has an expiration date.', 'Watch {a}\'s eyes. Never trust a handshake.', 'Smart. For about four minutes.',
    ],
  },
  betrayal: {
    rex: [
      'NO! {a} turns on {t}!', 'BETRAYAL! {a} stabs {t} in the back!', 'I can\'t believe it, {a} just attacked their own partner!',
      'How could you, {a}? HOW COULD YOU?', 'The alliance is OVER! {a} lays out {t}!',
    ],
    dot: [
      'Now THAT is wrestling.', 'Beautiful. Just beautiful.', '{t} never saw it coming. I did.',
      'I told you, Rex. Expiration date.', 'Business is business.',
    ],
  },
  finisher: {
    rex: [
      'HERE IT COMES! {a} hits the finisher!', 'THAT\'S IT! THAT\'S THE FINISHER!', 'Lights out for {t}!',
      'OH MY! {a} with the big one!', '{a} calls for it, and DELIVERS!',
    ],
    dot: [
      'Somebody check if {t} is still in the building.', 'Signature. Undeniable.', 'And that is why {a} gets top billing.',
    ],
  },
  bribe: {
    rex: ['Is the referee taking something from {a}?!', 'Wait, what did {a} just hand Lou?'],
    dot: ['Lou has a mortgage, Rex.', 'Free market. Look it up.'],
  },
};

// Wrestler taunts, keyed by wrestler then moment.
export const TAUNTS = {
  vex: {
    taunt: ['Cameras on me, please!', 'Say my name!', 'Look at this face. Flawless.', 'You came to see Vex!'],
    win: ['Was there ever any doubt?', 'Another one for the highlight reel!'],
    entry: ['The main event has arrived!', 'Vex is HERE!'],
    betray: ['Nothing personal, darling. It\'s for the cameras.'],
  },
  kane: {
    taunt: ['KANE SMASH.', 'Get up. I\'m not done.', 'You break easy.', 'MORE!'],
    win: ['Next.', 'Too small.'],
    entry: ['Clear the ring.', 'Who\'s first?'],
    betray: ['Partner? I work alone.'],
  },
  silas: {
    taunt: ['Everything is going to plan.', 'You think you\'re winning? Adorable.', 'Patience. Patience.', 'I already know your next move.'],
    win: ['Checkmate.', 'As I foresaw.'],
    entry: ['Let\'s see who trusts whom tonight.', 'Hello, friends. For now.'],
    betray: ['You trusted me. That was your mistake.', 'I never said I was loyal.'],
  },
  mae: {
    taunt: ['I\'ve been doing this since before you were born.', 'Come on, kid. Teach me something.', 'Seen it. Countered it.', 'Iron doesn\'t bend.'],
    win: ['Respect your elders.', 'Still got it.'],
    entry: ['Old Iron Mae, reporting for duty.', 'Twenty years and still swinging.'],
    betray: ['Sorry, kid. Survival first.'],
  },
};
