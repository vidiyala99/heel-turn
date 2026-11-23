"""Two tabs join one online room via ?room= and both see two wrestlers. Usage: python game/ui/online_check.py"""
from playwright.sync_api import sync_playwright
URL = "http://localhost:5173"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader"])
    errs, pages = [], []
    for i in range(2):
        pg = b.new_page(viewport={"width": 900, "height": 600})
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pages.append(pg)
    a, g = pages
    a.goto(URL); a.wait_for_function("window.HEEL", timeout=30000)
    r = a.evaluate("HEEL.startMatch({mode:'online', host:true, room:'PLAYTST', p1:'vex', p2:'kane'})")
    print("host:", r)
    g.goto(URL + "/?room=PLAYTST"); g.wait_for_function("window.HEEL", timeout=30000)
    print("guest:", g.evaluate("HEEL.startMatch({mode:'online', room:'PLAYTST', p1:'mae'})"))
    g.wait_for_timeout(3000)
    for n, pg in (("host", a), ("guest", g)):
        print(n, pg.evaluate("JSON.stringify({s: HEEL.session, slot: G.session && G.session.slot, w: G.state && G.state.w.map(w => w.id)})"))
    print("ERRORS:", errs or "none")
    b.close()
