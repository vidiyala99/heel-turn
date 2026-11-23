"""Two tabs join one OVER THE TOP room via ?room=CODE&royal=1, each picks a wrestler, both see the same 5-wrestler ring.
Usage: python game/ui/online_royal.py [base]   base like http://localhost:5178/?mute=1&server=ws://localhost:2577
Writes docs/shots/royal-online-{a,b}.png; prints each tab's slot, card and whether the snapshots agree."""
import json
import random
import string
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5178/?mute=1"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
CODE = "".join(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
url = f"{BASE}&room={CODE}&royal=1"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    tabs = []
    for i, right in enumerate([0, 2]):
        pg = b.new_page(viewport={"width": 1280, "height": 800})
        errs = []
        pg.on("pageerror", lambda e, errs=errs: errs.append(str(e)))
        pg.goto(url)
        pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'select'", timeout=60000)
        for _ in range(right): pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(150)
        pg.keyboard.press("Enter")
        pg.wait_for_function("G.state && G.state.mode === 'royal'", timeout=15000)
        tabs.append((pg, errs))
        pg.wait_for_timeout(1500)
    tabs[0][0].wait_for_function("G.state && G.state.clock > 6", timeout=40000)
    out = []
    for k, (pg, errs) in enumerate(tabs):
        pg.keyboard.down("KeyD"); pg.wait_for_timeout(600); pg.keyboard.up("KeyD")
        s = pg.evaluate("""(() => { const s = G.state; return { slot: G.session.slot, room: G.session.room, card: s.w.map(w => w.id),
          humans: s.w.filter(w => w.human).map(w => w.id), entered: s.w.filter(w => w.entered).length, clock: +s.clock.toFixed(1),
          p1x: +s.w[0].x.toFixed(2), p2x: +s.w[1].x.toFixed(2) }; })()""")
        s["errors"] = errs[:3]
        out.append(s)
        pg.screenshot(path=str(OUT / f"royal-online-{'ab'[k]}.png"))
    print(json.dumps(out, indent=1))
    same = out[0]["room"] == out[1]["room"] and out[0]["card"] == out[1]["card"] and {out[0]["slot"], out[1]["slot"]} == {0, 1}
    print("SAME ROOM, SAME CARD, SLOTS 0 AND 1:", same)
    b.close()
