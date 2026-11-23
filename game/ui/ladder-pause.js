// Esc pause for the standalone ladder page: Resume, Restart match, Main menu. Plus a corner hint so it is findable.
const css = document.createElement('style');
css.textContent = `
#lp-hint { position: fixed; top: 12px; right: 16px; z-index: 30; font: 600 12px Inter, system-ui, sans-serif; color: #cfd6e1;
  background: rgba(5,6,10,.7); border: 1px solid #2a2f3a; padding: 6px 10px; }
#lp-hint kbd { background: #1b1f29; border: 1px solid #3a404d; padding: 0 5px; color: #fff; font-family: inherit; }
#lp { position: fixed; inset: 0; z-index: 40; display: none; place-items: center; background: rgba(5,6,10,.78); }
#lp.on { display: grid; }
#lp nav { display: grid; gap: 10px; min-width: 260px; }
#lp h2 { margin: 0 0 8px; font: 400 40px Anton, Impact, sans-serif; letter-spacing: 1px; color: #f5c542; text-align: center; }
#lp button { font: 400 24px Anton, Impact, sans-serif; letter-spacing: 1px; color: #fff; background: #1b1f29; border: 1px solid #3a404d;
  padding: 10px 18px; cursor: pointer; text-align: left; }
#lp button:focus-visible, #lp button:hover { outline: 2px solid #f5c542; outline-offset: 0; background: #2a2f3a; }`;
document.head.appendChild(css);
const hint = Object.assign(document.createElement('div'), { id: 'lp-hint', innerHTML: '<kbd>Esc</kbd> pause · restart · menu' });
const box = Object.assign(document.createElement('div'), { id: 'lp', innerHTML: `<nav aria-label="Paused"><h2>Paused</h2>
  <button data-a="resume">Resume</button><button data-a="restart">Restart match</button><button data-a="menu">Main menu</button></nav>` });
document.body.append(hint, box);
const open = (on) => { box.classList.toggle('on', on); if (on) box.querySelector('button').focus(); };
box.addEventListener('click', (e) => {
  const a = e.target.closest('button')?.dataset.a;
  if (a === 'resume') open(false);
  if (a === 'restart') location.reload();
  if (a === 'menu') location.href = '/';
});
addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); open(!box.classList.contains('on')); return; }
  if (box.classList.contains('on')) {
    e.stopImmediatePropagation(); // the fight underneath gets no keys while paused
    const bs = [...box.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') bs[(i + 1) % bs.length].focus();
    if (e.code === 'ArrowUp' || e.code === 'KeyW') bs[(i + bs.length - 1) % bs.length].focus();
  }
}, true);
