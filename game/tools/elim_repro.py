"""Headless repro: start Over the Top, toss slot 2 out by hand, print any page error with its stack."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    pg = b.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e) + "\n" + (e.stack or "")[:900]))
    pg.goto("http://localhost:5178/?mute=1&oddsPort=8791")
    pg.wait_for_function("window.HEEL && window.HEEL_UI", timeout=60000)
    pg.evaluate("HEEL.startMatch({ mode: 'royal', p1: 'kane' }).then(() => HEEL_UI.go('match'))")
    pg.wait_for_function("G.state && G.state.clock > 1", timeout=20000)
    pg.evaluate("(() => { const w = G.state.w[2]; w.state = 'thrown'; w.t = 0; w.arc = { fx: w.x, fy: w.y, fz: w.z, tx: 5, tz: 0, dur: 0.3, toss: true, dmg: 28, by: 1 }; })()")
    pg.wait_for_timeout(2500)
    print("clock", pg.evaluate("G.state.clock"), "order", pg.evaluate("G.state.order"))
    print("\n".join(errs) or "no errors")
    b.close()
