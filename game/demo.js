// Live demo mode (?demo=1): one path that cannot break. Exhibition only, the human is Vex against Brutus Kane,
// the full intro runs, and grapples resolve only into moves whose contacts hold (lock-up, body slam, lock-up knee,
// strikes, pin). It looks exactly like the normal game: no label, no banner. Off the demo path nothing changes.
export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';
export const DEMO_P1 = 'vex', DEMO_P2 = 'kane';
