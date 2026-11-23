"""Mid-match screenshot plus an FPS sample, through the real shell (title -> select -> match).
Usage: python game/tools/match_shot.py <base-url> <out.png> [--headed] [p1] [p2]
Prints the mean FPS over 5 s of play (requestAnimationFrame count). Headed mode is the real number;
headless swiftshader is a software-GPU floor."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith("--")]
headed = "--headed" in sys.argv
base, out = args[0], Path(args[1])
p1 = args[2] if len(args) > 2 else "kane"
p2 = args[3] if len(args) > 3 else "mae"
with sync_playwright() as p:
    launch = ["--mute-audio"] + ([] if headed else ["--use-gl=angle", "--enable-unsafe-swiftshader"])
    b = p.chromium.launch(headless=not headed, args=launch)
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text[:300]))
    pg.goto(base + "/?mute=1")
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title' && window.HEEL", timeout=30000)
    for _ in range(12):
        if pg.evaluate("HEEL_UI.state") == "select": break
        pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    ids = ["vex", "kane", "silas", "mae"]
    for _ in range(ids.index(p1)): pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(150)
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(out.with_name(out.stem + "-select.png")))
    pg.keyboard.press("Enter")
    pg.wait_for_function("HEEL_UI.state === 'match'", timeout=10000)
    pg.wait_for_timeout(4500)
    pg.keyboard.down("KeyD"); pg.wait_for_timeout(900); pg.keyboard.up("KeyD")
    fps = pg.evaluate("""() => new Promise((r) => { let n = 0; const t0 = performance.now();
      const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else r(n * 1000 / (performance.now() - t0)); };
      requestAnimationFrame(f); })""")
    pg.screenshot(path=str(out))
    print("wrote", out, "| fps (5 s, %s): %.1f" % ("headed" if headed else "headless swiftshader", fps))
    print("ERRORS:", errs or "none")
    pg.evaluate("window.speechSynthesis && speechSynthesis.cancel()")
    b.close()
