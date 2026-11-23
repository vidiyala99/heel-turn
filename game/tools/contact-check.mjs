// Contact check: for each body pair, scrub every grappling move at key frames in lab.html and print the
// distance from each contact hand to its target point. Fails (exit 1) when any full-weight contact is >= 4 cm.
// usage: node tools/contact-check.mjs [baseUrl]   (needs `npx vite --port 5176` running in game/)
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5176';
const PAIRS = [['kane', 'vex'], ['vex', 'kane'], ['mae', 'silas'], ['silas', 'mae']];
const FRAMES = { lockup: [0.6, 1.2, 1.6], bodyslam: [0.6, 1.0, 1.3], suplex: [0.62, 1.2, 1.4], ddt: [0.5, 0.7, 0.9] };
const LIMIT_CM = 4;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
let worst = 0;
for (const [a, v] of PAIRS) {
  await page.goto(`${base}/lab.html?bodies=${a},${v}`);
  await page.waitForFunction(() => window.lab);
  const rows = await page.evaluate((frames) => {
    const out = [];
    for (const [id, ts] of Object.entries(frames)) for (const t of ts) {
      window.lab.scrub(id, t);
      for (const r of window.lab.contacts()) out.push({ id, t, ...r });
    }
    return out;
  }, FRAMES);
  for (const r of rows) {
    const cm = r.err * 100;
    if (r.w > 0.99) worst = Math.max(worst, cm);
    console.log(`${a}>${v} ${r.id}@${r.t} ${r.by}.${r.hand}->${r.on} w=${r.w.toFixed(2)} ${cm.toFixed(1)} cm`);
  }
}
await browser.close();
console.log(`worst full-weight contact: ${worst.toFixed(1)} cm (limit ${LIMIT_CM})`);
process.exit(worst < LIMIT_CM ? 0 : 1);
