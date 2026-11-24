"""Entrance stage + aisle shots: on stage, mid-aisle, entering the ring; prints HEEL_ENTRANCE_LOG.
Usage: python game/ui/aisle_shots.py [url]. Writes docs/shots/aisle-*.png."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173/?mute=1"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
OUT.mkdir(parents=True, exist_ok=True)
has = lambda ev: f"(window.HEEL_ENTRANCE_LOG || []).some(e => e.ev === '{ev}')"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=30000)
    st = lambda: pg.evaluate("HEEL_UI.state")
    for want in ("menu", "select"):
        for _ in range(20):
            if st() == want: break
            pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200); pg.keyboard.press("Enter")
    pg.wait_for_function(has("seg0_start"), timeout=30000); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(OUT / "aisle-stage.png"))
    pg.wait_for_function(has("seg0_walk"), timeout=30000); pg.wait_for_timeout(2600)
    pg.screenshot(path=str(OUT / "aisle-mid.png"))
    pg.wait_for_function(has("seg0_climb"), timeout=30000); pg.wait_for_timeout(500)
    pg.screenshot(path=str(OUT / "aisle-enter.png"))
    pg.wait_for_function(has("seg1_start"), timeout=40000); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(OUT / "aisle-stage2.png"))
    pg.wait_for_function(has("bell"), timeout=60000)
    log = pg.evaluate("HEEL_ENTRANCE_LOG"); t0 = log[0]["t"]
    for e in log: print(f"{(e['t'] - t0) / 1000:6.2f}s {e['ev']}")
    print("errors:", errs or "none")
    b.close()
