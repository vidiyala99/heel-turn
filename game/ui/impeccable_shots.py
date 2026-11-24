"""Capture every HEEL TURN screen at 1920x1080 and 1440x900 for the impeccable pass.
Usage: python game/ui/impeccable_shots.py <tag> [url]. Writes docs/shots/impeccable-<tag>-<screen>-<w>.png."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else "before"
URL = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5173/?mute=1"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
SIZES = [(1920, 1080), (1440, 900)]


def snap(pg, name):
    for w, h in SIZES:
        pg.set_viewport_size({"width": w, "height": h}); pg.wait_for_timeout(250)
        pg.screenshot(path=str(OUT / f"impeccable-{TAG}-{name}-{w}.png"))
    print("shot", name, pg.evaluate("HEEL_UI.state"))


def boot(b):
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    pg.on("pageerror", lambda e: print("pageerror:", e))
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=60000)
    pg.wait_for_timeout(2000)
    return pg


def press(pg, k, w=450): pg.keyboard.press(k); pg.wait_for_timeout(w)


def until(pg, state, k="Enter"):
    for _ in range(20):
        if pg.evaluate("HEEL_UI.state") == state: return
        press(pg, k, 500)
    raise SystemExit("stuck")


with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    pg = boot(b)
    snap(pg, "title")
    until(pg, "menu"); snap(pg, "menu")
    press(pg, "Enter", 700); press(pg, "ArrowRight", 200); snap(pg, "select")
    press(pg, "Enter", 350); snap(pg, "versus")
    pg.wait_for_function("HEEL_UI.state === 'match'", timeout=10000)
    # lower-third: force the strap on (the voice lane is muted in tests)
    pg.evaluate("dispatchEvent(new CustomEvent('heel:voice', {detail:{phase:'start', speaker:'rex'}}))")
    pg.wait_for_timeout(500); snap(pg, "lowerthird")
    try:
        pg.wait_for_function("(window.HEEL_ENTRANCE_LOG || []).some(e => e.ev === 'bell')", timeout=60000)
        pg.wait_for_function("!(window.HEEL_PROMO && HEEL_PROMO.holding)", timeout=45000)
    except Exception as e:
        print("no bell:", str(e)[:80])
    pg.keyboard.down("KeyD")
    for i in range(18): press(pg, "KeyJ" if i % 3 else "KeyK", 150)
    pg.keyboard.up("KeyD")
    snap(pg, "match")
    pg.evaluate("""HEEL_UI.showResults({ winner: 'p2', how: 'Pinfall', stats: { strikes: [14, 9], grapples: [3, 7], blocks: [2, 6], damage: [61, 100] },
      aiPlansLog: ['You strike at the opening bell 70% of the time. It now opens with a block.',
                   'After taking a hit you grapple right back. It saves its strikes for that moment.',
                   'You taunt when your meter is near full. It rushes you when you do.'] })""")
    pg.wait_for_timeout(800); snap(pg, "results")
    pg.close()

    pg = boot(b)
    until(pg, "menu")
    for _ in range(3): press(pg, "ArrowDown", 150)
    press(pg, "Enter", 700); press(pg, "ArrowRight", 200); press(pg, "Enter")
    pg.wait_for_function("HEEL_UI.state === 'match' && G.state && G.state.mode === 'royal'", timeout=15000)
    got = set()
    for t in range(1500):
        pg.wait_for_timeout(100)
        s = pg.evaluate("({ entered: G.state.w.filter(w => w.entered).length, card: !!document.querySelector('.rr-card:not([hidden])'), over: G.state.over })")
        if s["entered"] >= 5 and "royal" not in got:
            got.add("royal"); snap(pg, "royal")
            press(pg, "o", 1500); snap(pg, "odds"); press(pg, "o", 500)
        if s["card"] and "card" not in got:
            got.add("card"); pg.wait_for_timeout(300); snap(pg, "card"); press(pg, "y")
        if len(got) == 2 or s["over"]: break
    print("royal got", got)
    b.close()
