"""Promos in a real exhibition and a real Over the Top match: pre-match (after the entrances, before the bell),
mid-match (knockdown / kickout) and post-match (results screen). Usage: python game/ui/promo_play.py [url].
Writes docs/shots/polish-promo-pre.png, polish-promo-results.png, polish-promo-royal.png; prints the promo log."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173") + "/?mute=1"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
OUT.mkdir(parents=True, exist_ok=True)
LOG = "(HEEL_DEBUG().promos || []).map(p => `${p.moment} ${p.speaker}>${p.opponent} ${p.meta && p.meta.source} ${p.ms}ms: ` + p.lines.map(l => l.speaker + ': ' + l.text + (l.facts && l.facts.length ? ' [' + l.facts.join(' | ') + ']' : '')).join(' / '))"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=30000)
    st = lambda: pg.evaluate("HEEL_UI.state")
    def until(state):
        for _ in range(20):
            if st() == state: return
            pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
        raise SystemExit(f"stuck at {st()}, wanted {state}")
    until("menu"); until("select"); pg.keyboard.press("Enter")
    pg.wait_for_function("HEEL_UI.state === 'match'", timeout=8000)
    pg.wait_for_function("(window.HEEL_ENTRANCE_LOG || []).some(e => e.ev === 'bell')", timeout=60000)
    pg.wait_for_function("document.querySelector('.promo.on')", timeout=8000)
    held = pg.evaluate("HEEL_PROMO.holding && G.state.introT > 0")
    pg.wait_for_timeout(1400); pg.screenshot(path=str(OUT / "polish-promo-pre.png"))
    print("pre-match promo on screen, bell held:", held)
    pg.keyboard.press("Enter"); pg.keyboard.press("Enter")  # skip: finish typing, then next line
    pg.wait_for_function("!HEEL_PROMO.holding", timeout=30000); print("bell after promo")
    # knock the AI down for a mid-match line, then finish it
    pg.evaluate("G.P2.hp = 1; G.P1.mo = 100")
    for i in range(160):
        pg.evaluate("G.P2.hp = Math.min(G.P2.hp, 1); if (!['pinned','thrown'].includes(G.P2.state)) { G.P1.x = G.P2.x - 0.7; G.P1.z = G.P2.z; G.P1.facing = Math.PI / 2; }")
        pg.keyboard.press("KeyK"); pg.wait_for_timeout(150)
        if st() == "results": break
    print("state:", st())
    pg.wait_for_function("HEEL_UI.state === 'results' && document.querySelector('.promo.on') && document.querySelector('.promo-tag').textContent === 'Post-match'", timeout=25000)
    pg.wait_for_timeout(1400); pg.screenshot(path=str(OUT / "polish-promo-results.png")); print("results promo on screen")
    pg.wait_for_function("!document.querySelector('.promo.on')", timeout=40000)
    log = pg.evaluate(LOG)
    # Over the Top
    pg.goto(URL); pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=30000)
    until("menu")
    for _ in range(3): pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(150)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(700); pg.keyboard.press("Enter")
    pg.wait_for_function("HEEL_UI.state === 'match' && G.state && G.state.mode === 'royal'", timeout=10000)
    try:
        pg.wait_for_function("document.querySelector('.promo.on')", timeout=12000)
        pg.wait_for_timeout(1200); pg.screenshot(path=str(OUT / "polish-promo-royal.png")); print("over the top promo on screen")
        print("bell held during the promo:", pg.evaluate("HEEL_PROMO.holding"))
    except Exception as e:
        print("over the top promo: not seen", e)
    for line in log + pg.evaluate(LOG): print(" ", line)
    print("ERRORS:", errs or "none")
    b.close()
