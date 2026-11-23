"""Play a real exhibition: title -> menu -> Exhibition -> select -> fight AI -> results -> rematch.
Usage: python game/ui/play.py [url]. Writes docs/shots/play-*.png; prints console errors."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text))
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=30000)
    st = lambda: pg.evaluate("HEEL_UI.state")
    def key(k, w=400): pg.keyboard.press(k); pg.wait_for_timeout(w)
    def until(state, k="Enter"):  # press k until the shell reaches state (keys during a screen wipe are dropped)
        for _ in range(20):
            if st() == state: return
            key(k, 500)
        raise SystemExit(f"stuck at {st()}, wanted {state}")
    until("menu"); print("after title:", st())
    until("select"); print("after menu enter:", st())
    key("ArrowRight", 200); key("Enter", 300)  # pick P1; Exhibition draws a random opponent and goes to versus
    pg.screenshot(path=str(OUT / "play-select.png")); print("select->", st())
    pg.wait_for_function("HEEL_UI.state === 'match'", timeout=8000); print("in match")
    # the entrance is paced by the ring announcer's lines (muted: reading-speed estimates); wait for the bell
    pg.wait_for_function("(window.HEEL_ENTRANCE_LOG || []).some(e => e.ev === 'bell')", timeout=60000)
    print("entrance:", " ".join(e["ev"] for e in pg.evaluate("HEEL_ENTRANCE_LOG")))
    # the pre-match promo holds the bell until both wrestlers have spoken (or the promo server is down)
    pg.wait_for_function("!(window.HEEL_PROMO && HEEL_PROMO.holding)", timeout=45000)
    print("pre-match promo:", pg.evaluate("(HEEL_DEBUG().promos || []).map(p => p.moment + ' ' + (p.meta && p.meta.source) + ' ' + p.lines.length + ' lines').join('; ') || 'none'"))
    pg.wait_for_timeout(1500)
    # walk in and fight for real
    pg.keyboard.down("KeyD")
    for i in range(40):
        key("KeyJ" if i % 3 else "KeyK", 150)
        if i == 20: pg.screenshot(path=str(OUT / "play-match.png"))
    pg.keyboard.up("KeyD")
    # force a finish: empty P2's health, then grapple/pin until it ends
    pg.evaluate("G.P2.hp = 1; G.P1.mo = 100")
    pg.keyboard.down("KeyD")
    shot = False
    for i in range(80):
        pg.keyboard.press("KeyK")
        for _ in range(6):
            pg.wait_for_timeout(25)
            if not shot and pg.evaluate("G.P2 && G.P2.state === 'thrown'"):
                pg.wait_for_timeout(450); pg.screenshot(path=str(OUT / "play-suplex.png")); shot = True; print("suplex shot taken")
        if st() == "results": break
        if i == 6: key("Space", 900); pg.screenshot(path=str(OUT / "play-move.png"))
    pg.keyboard.up("KeyD")
    pg.wait_for_timeout(2000)
    print("end state:", st())
    pg.screenshot(path=str(OUT / "play-results.png"))
    print("results text:", pg.inner_text("#s-results")[:300].replace("\n", " | "))
    pg.evaluate("document.querySelector('[data-act=rematch]').click()")
    pg.wait_for_timeout(3000); print("after rematch:", st(), pg.evaluate("!!G.state && !G.state.over"))
    print("ERRORS:", errs or "none")
    pg.evaluate("window.speechSynthesis && speechSynthesis.cancel()")
    b.close()
