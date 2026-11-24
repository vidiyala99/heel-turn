// Speaker lower-third: a broadcast name strap over the #call ticker while Rex, Dot or the ring announcer talk.
// Listens to 'heel:voice' ({ phase: 'start'|'end', speaker }) from agent-layer.js. Mount once; nothing to call.
import { CHARACTERS, cssHex } from '../shared/characters.js';

const CREW = ['rex', 'dot', 'ring'];
const HOLD_MS = 450; // the strap lingers a beat after the line ends, so back-to-back lines do not flicker

export function mountLowerThird() {
  if (document.getElementById('l3')) return;
  const css = document.createElement('style');
  css.textContent = `
#l3 { position: fixed; left: 24px; bottom: 150px; z-index: 6; display: grid; grid-template-columns: 6px auto; pointer-events: none;
  opacity: 0; transform: translateY(6px); clip-path: inset(0 100% 0 0);
  transition: clip-path 150ms cubic-bezier(.23,1,.32,1), opacity 150ms ease-out, transform 150ms ease-out; }
#l3[data-on="1"] { opacity: 1; transform: none; clip-path: inset(0 0 0 0);
  transition: clip-path 240ms cubic-bezier(.23,1,.32,1), opacity 120ms ease-out, transform 240ms cubic-bezier(.23,1,.32,1); }
#l3 .bar { background: var(--tint, #f5c542); }
#l3 .txt { background: rgba(7,9,16,.92); padding: 6px 14px 7px 10px; }
#l3 .nm { font: 400 18px/1.05 Anton, Impact, sans-serif; letter-spacing: .02em; color: #fff; }
#l3 .rl { font: 600 11px/1.3 Inter, system-ui, sans-serif; color: #c9d0dc; }
#l3 .rl b { color: var(--tint, #f5c542); font-weight: 600; }
@media (prefers-reduced-motion: reduce) { #l3, #l3[data-on="1"] { transform: none; clip-path: none; transition: opacity 160ms linear; } }
@media (max-width: 720px) { #l3 { left: 12px; bottom: 120px; } #l3 .nm { font-size: 18px; } }
`;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'l3'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<span class="bar"></span><span class="txt"><div class="nm"></div><div class="rl"></div></span>';
  document.body.appendChild(el);
  let who = null, off = 0;
  addEventListener('heel:voice', (e) => {
    const { phase, speaker } = e.detail || {};
    if (!CREW.includes(speaker)) return;
    if (phase === 'start') {
      clearTimeout(off);
      const c = CHARACTERS[speaker];
      if (who !== speaker) {
        el.querySelector('.nm').textContent = speaker === 'ring' ? 'Ring announcer' : c.name;
        el.querySelector('.rl').innerHTML = speaker === 'ring' ? '<b>Live</b> from ringside' : `<b>${c.role}</b>`;
        el.style.setProperty('--tint', speaker === 'ring' ? '#f5c542' : cssHex(c.palette.ui));
      }
      who = speaker; el.dataset.on = '1';
    } else if (phase === 'end' && who === speaker) {
      off = setTimeout(() => { el.dataset.on = '0'; who = null; }, HOLD_MS);
    }
  });
}
