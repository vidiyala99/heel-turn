"""Feel probe: measures responsiveness and drama timings in a real browser and shoots the big moments.
Usage: python game/tools/feel_probe.py [url] [--shots]
Prints JSON. Works on builds without the feel layer too (then only the sim-side numbers are filled)."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = next((a for a in sys.argv[1:] if a.startswith("http")), "http://localhost:5175")
SHOTS = "--shots" in sys.argv
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"

# rAF probe: time from a keydown to the first frame where the player's sim x has moved
PROBE = """() => new Promise((res) => {
  const x0 = G.P1.x, t0 = performance.now();
  const tick = () => { if (G.P1.x !== x0) return res(performance.now() - t0);
    if (performance.now() - t0 > 1000) return res(-1); requestAnimationFrame(tick); };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd' })); requestAnimationFrame(tick);
})"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=30000)
    for k, w in [("Enter", 700), ("Enter", 700), ("ArrowRight", 400), ("Enter", 600), ("Enter", 600)]:
        pg.keyboard.press(k); pg.wait_for_timeout(w)  # title -> menu -> exhibition -> select -> fight (as play.py)
    pg.wait_for_function("HEEL_UI.state === 'match' && G.state && G.state.introT <= 0", timeout=20000)
    has_feel = pg.evaluate("!!window.FEEL")
    out = {"feel": has_feel, "fps": pg.evaluate("""() => new Promise(r => { let n = 0; const t0 = performance.now();
        const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); })""")}
    # 0) idle life: how far heads/chests travel in 1 s of standing still, life layer off vs on
    IDLE = """async (off) => { FEEL.life.off = off; G.P1.x = -1.2; G.P2.x = 1.2; G.P1.z = G.P2.z = 0;
      G.P2.state = 'stun'; G.P2.t = 1.5; for (let k = 0; k < 20; k++) await new Promise(r => requestAnimationFrame(r)); let prev = FEEL.pose, travel = 0;
      for (let k = 0; k < 60; k++) { await new Promise(r => requestAnimationFrame(r)); G.P2.x = 1.2; G.P2.state = 'stun'; G.P2.t = 1;
        const p = FEEL.pose; for (let a = 0; a < p.length; a++) for (let b = 0; b < p[a].length; b++)
          travel += Math.hypot(...p[a][b].map((v, c) => v - prev[a][b][c])); prev = p; }
      return +(travel * 100).toFixed(1); }"""
    if has_feel:
        out["idleTravelCm_lifeOff"] = pg.evaluate(IDLE, True)
        if SHOTS: pg.screenshot(path=str(OUT / "feel-idle-before.png"))
        out["idleTravelCm_lifeOn"] = pg.evaluate(IDLE, False)
        if SHOTS: pg.screenshot(path=str(OUT / "feel-idle-after.png"))
    # 1) input -> motion, five tries, park the AI so it does not interfere
    lat = []
    for _ in range(5):
        pg.evaluate("G.P2.x = 2.6; G.P2.z = 2.6; G.P1.x = -1.5; G.P1.z = 0")
        lat.append(round(pg.evaluate(PROBE)))
        pg.wait_for_timeout(250)
        pg.evaluate("window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd' }))")
        pg.wait_for_timeout(300)
    out["inputToSimMotionMs"] = lat
    if has_feel:
        out["inputToViewMotionMs"] = pg.evaluate("FEEL.metrics.inputToMotionMs")
    # 2) a strike that lands: screenshot inside the hitstop
    pg.evaluate("G.P1.x = -0.5; G.P1.z = 0; G.P2.x = 0.5; G.P2.z = 0; G.P2.state = 'stun'; G.P2.t = 0.5; G.P1.st = 100")
    pg.keyboard.press("KeyJ")
    if has_feel:
        pg.wait_for_function("G.state.freeze > 0", timeout=3000, polling="raf")
        if SHOTS: pg.screenshot(path=str(OUT / "feel-hit.png"))
    pg.wait_for_timeout(700)
    # 3) near-fall: slam, cover, force the AI's kickout to land at 2.9
    pg.evaluate("G.P2.hp = 45; G.P1.x = -0.5; G.P2.x = 0.5; G.P1.z = G.P2.z = 0; G.P1.st = 100; G.P2.state = 'stun'; G.P2.t = 1.2; G.P1.state = 'idle'")  # stunned: the AI cannot cut the grapple off
    pg.keyboard.press("KeyK")
    pg.wait_for_function("G.P2.state === 'down'", timeout=4000)
    pg.wait_for_timeout(1800)  # let the slam land (a pin mid-slam is covered by tools/pin_float_check.py)
    pg.evaluate("G.P1.x = G.P2.x - 0.9; G.P1.z = G.P2.z; G.P1.state = 'idle'")
    pg.keyboard.press("KeyK")
    pg.wait_for_function("!!G.state.pin", timeout=3000)
    pg.evaluate("G.state.pin.kickAt = 2.9")
    t0 = pg.evaluate("performance.now()")
    pg.wait_for_function("!G.state.pin || G.state.pin.count >= 2 && G.state.pin.t >= 0.85 * 2.6", timeout=15000, polling="raf")
    out["bodiesAtNearFall"] = pg.evaluate("[FEEL.bodies, G.state.w.map(w => [w.x, w.y, w.z].map(n => +n.toFixed(2)))]") if has_feel else None
    if SHOTS: pg.screenshot(path=str(OUT / "feel-nearfall.png"))
    pg.wait_for_function("!G.state.pin", timeout=15000)
    out["pinStartToKickoutRealMs"] = round(pg.evaluate("performance.now()") - t0)
    out["kickedOutAtCount"] = pg.evaluate("G.P2.state") == "down" and not pg.evaluate("G.state.over")
    pg.wait_for_timeout(1500)
    # 4) finisher: full meter, grapple, shoot at the landing flash
    pg.evaluate("G.P2.hp = 60; G.P1.mo = 100; G.P1.st = 100; G.P1.x = -0.5; G.P2.x = 0.5; G.P1.z = G.P2.z = 0; G.P2.state = 'stun'; G.P2.t = 1.2; G.P1.state = 'idle'")
    pg.keyboard.press("KeyK")
    if has_feel:
        pg.wait_for_function("(FEEL.metrics.events.impact || 0) && G.state.freeze > 0 && G.P2.state === 'down'", timeout=6000, polling="raf")
        pg.wait_for_timeout(260)  # the flash has mostly faded; letterbox, slow-mo and the low angle hold
        if SHOTS: pg.screenshot(path=str(OUT / "feel-finisher.png"))
        out["letterboxOn"] = pg.evaluate("document.body.classList.contains('feel-cine')")
    pg.wait_for_timeout(2500)
    if has_feel:
        m = pg.evaluate("FEEL.metrics")
        out["hitstopMs"] = m["hitstopMs"]; out["slowmoMs"] = m["slowmoMs"]; out["events"] = m["events"]
    out["errors"] = errs
    print(json.dumps(out, indent=1))
    pg.evaluate("window.speechSynthesis && speechSynthesis.cancel()")
    b.close()
