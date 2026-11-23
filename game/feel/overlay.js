// Broadcast overlay for big moments: impact flash, cinematic letterbox, the announcer's lower-third,
// the crowd heat meter, and a red edge glow while a wrestler is fired up. DOM only, created here.
import { T } from '../shared/tuning.js';

const CSS = `
#feel-flash{position:fixed;inset:0;background:#fff8e6;opacity:0;pointer-events:none;z-index:11}
.feel-bar{position:fixed;left:0;right:0;height:${T.view.letterbox * 100}vh;background:#000;z-index:14;pointer-events:none;
  transition:transform 260ms cubic-bezier(0.23,1,0.32,1)}
#feel-bar-top{top:0;transform:translateY(-100%)} #feel-bar-bot{bottom:0;transform:translateY(100%)}
body.feel-cine #feel-bar-top,body.feel-cine #feel-bar-bot{transform:translateY(0)}
body:not(.feel-cine) .feel-bar{transition-duration:180ms}
#feel-call{position:fixed;left:24px;bottom:62px;z-index:16;pointer-events:none;display:flex;align-items:stretch;
  opacity:0;transform:translateX(-14px);transition:opacity 160ms ease-out,transform 220ms cubic-bezier(0.23,1,0.32,1);max-width:calc(100vw - 48px)}
#feel-call.on{opacity:1;transform:none}
#feel-call i{width:6px;background:#f5c542;flex:none}
#feel-call span{background:rgba(5,6,10,.88);padding:8px 16px 9px 12px;font:400 clamp(20px,2.6vw,32px)/1.05 Anton,Impact,sans-serif;
  letter-spacing:.5px;text-transform:uppercase;color:#fff}
#feel-call span b{color:#f5c542;font-weight:400}
#feel-heat{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:12;pointer-events:none;width:min(240px,40vw);
  font:400 12px Anton,Impact,sans-serif;letter-spacing:2px;color:#9aa4b2;text-align:center}
#feel-heat .track{height:6px;background:#1b1f29;margin-top:4px;display:flex;justify-content:space-between;overflow:hidden}
#feel-heat .track i{display:block;height:100%;width:0;transition:width 240ms ease-out}
#feel-heat .track i:first-child{background:#2b8cff} #feel-heat .track i:last-child{background:#e8333b}
#feel-heat.hot{color:#f5c542}
#feel-fired{position:fixed;inset:0;pointer-events:none;z-index:13;opacity:0;transition:opacity 200ms ease-out;
  box-shadow:inset 0 0 120px 20px rgba(232,51,59,.55)}
@media (prefers-reduced-motion: reduce){#feel-call{transform:none}.feel-bar{transition:none}}
`;

export function createOverlay() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = (id, cls = '') => { const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; document.body.appendChild(d); return d; };
  const flash = el('feel-flash'); el('feel-bar-top', 'feel-bar'); el('feel-bar-bot', 'feel-bar');
  const callEl = el('feel-call'); callEl.innerHTML = '<i></i><span></span>';
  const heat = el('feel-heat'); heat.innerHTML = 'CROWD<div class="track"><i></i><i></i></div>';
  const fired = el('feel-fired');
  const keys = document.querySelector('.keys');
  if (keys && !keys.dataset.feel) { keys.dataset.feel = 1; keys.insertAdjacentHTML('beforeend', '<br><kbd>Shift</kbd> or double-tap run · <kbd>I</kbd> Irish whip'); }
  let callT = 0, flashA = 0;

  return {
    flash(a) { flashA = Math.max(flashA, a); },
    cinematic(on) { document.body.classList.toggle('feel-cine', !!on); },
    announce(html, secs = 2.2) { callEl.querySelector('span').innerHTML = html; callEl.classList.add('on'); callT = secs; },
    visible(on) { heat.style.display = on ? '' : 'none'; if (!on) { callEl.classList.remove('on'); fired.style.opacity = 0; } },
    update(dt, st) {
      if (flashA > 0) { flash.style.opacity = flashA.toFixed(3); flashA = Math.max(0, flashA - dt * 4.5); if (!flashA) flash.style.opacity = 0; }
      if (callT > 0 && (callT -= dt) <= 0) callEl.classList.remove('on');
      if (!st) return;
      const [a, b] = st.w.map((w) => w.heat || 0);
      const [ia, ib] = heat.querySelectorAll('i');
      ia.style.width = a / 2 + '%'; ib.style.width = b / 2 + '%';
      heat.classList.toggle('hot', Math.max(a, b) > 70);
      fired.style.opacity = st.w.some((w) => w.fired > 0) ? 1 : 0;
    },
  };
}
