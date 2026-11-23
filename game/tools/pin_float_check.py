"""Pin float check: covers the instant the slam lands (paired slam still animating), then measures settled hip
heights above the mat and hip-to-sim distance during the pin, after a kickout and after the win; shoots the pin
and the results screen. Usage: python game/tools/pin_float_check.py <url> <tag>"""
import json, sys
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; TAG = sys.argv[2]
SAMPLE = """async (n) => { const out = []; for (let k = 0; k < n; k++) { await new Promise(r => requestAnimationFrame(r));
  const b = FEEL.pose.map((bones) => bones[2]), s = G.state.w; out.push(b.map((p, i) => [+(p[1] - 1.1).toFixed(2), +Math.hypot(p[0] - s[i].x, p[2] - s[i].z).toFixed(2)])); }
  return out; }"""
def stats(rows):
    rows = rows[-20:]
    return {"victimHipMax": max(r[1][0] for r in rows), "attackerHipMax": max(r[0][0] for r in rows), "maxAboveMat": max(max(r[0][0], r[1][0]) for r in rows), "maxXZoff": max(max(r[0][1], r[1][1]) for r in rows)}
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    pg = b.new_page(viewport={"width": 1280, "height": 800}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=30000)
    for k, w in [("Enter", 700), ("Enter", 700), ("ArrowRight", 400), ("Enter", 600), ("Enter", 600)]:
        pg.keyboard.press(k); pg.wait_for_timeout(w)
    pg.wait_for_function("HEEL_UI.state === 'match' && G.state && G.state.introT <= 0", timeout=20000)
    out = {}
    for run in ("kickout", "three"):
        pg.evaluate("G.P2.hp = 45; G.P1.x = -0.5; G.P2.x = 0.5; G.P1.z = G.P2.z = 0; G.P1.st = 100; G.P2.state = 'stun'; G.P2.t = 1.2; G.P1.state = 'idle'")
        pg.keyboard.press("KeyK")
        pg.wait_for_function("G.P2.state === 'down'", timeout=4000, polling="raf")
        pg.evaluate("G.P1.x = G.P2.x - 0.9; G.P1.z = G.P2.z; G.P1.state = 'idle'")  # cover at once: slam still animating
        pg.keyboard.press("KeyK")
        pg.wait_for_function("!!G.state.pin", timeout=3000, polling="raf")
        pg.evaluate("G.state.pin.kickAt = %s" % ("2.9" if run == "kickout" else "Infinity"))
        rows = pg.evaluate(SAMPLE, 90)
        out[run + "_pin"] = stats(rows)
        pg.screenshot(path=f"../docs/shots/fix-pin-{run}-{TAG}.png")
        if run == "kickout":
            pg.wait_for_function("!G.state.pin", timeout=15000)
            pg.wait_for_timeout(2500)
            out["after_kickout"] = stats(pg.evaluate(SAMPLE, 30))
        else:
            pg.wait_for_function("G.state.over", timeout=15000)
            out["after_win"] = stats(pg.evaluate(SAMPLE, 60))
            pg.wait_for_function("HEEL_UI.state === 'results'", timeout=15000)
            pg.wait_for_timeout(800)
            out["learned"] = pg.evaluate("[...document.querySelectorAll('#r-learned li')].map(l => l.textContent)")
            pg.screenshot(path=f"../docs/shots/fix-results-{TAG}.png")
    out["errors"] = errs
    print(json.dumps(out, indent=1)); pg.evaluate("window.speechSynthesis && speechSynthesis.cancel()"); b.close()
