"""Drive the HEEL TURN front-end with the keyboard and save a screenshot per screen.

Usage: python game/ui/shots.py [http://localhost:5173]  (dev server must be running)
Writes docs/shots/ui-<screen>.png at 1440x900 and prints the state after each step.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
OUT.mkdir(parents=True, exist_ok=True)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL)
        pg.wait_for_function("window.HEEL_UI && window.HEEL_UI.state === 'title'", timeout=20000)
        pg.wait_for_timeout(2500)  # let the arena render

        def state():
            return pg.evaluate("HEEL_UI.state")

        def key(k, wait=500):
            pg.keyboard.press(k)
            pg.wait_for_timeout(wait)

        def shot(name):
            pg.screenshot(path=str(OUT / f"ui-{name}.png"))
            print(f"{name:16} state={state():8} in-match={pg.evaluate('document.body.classList.contains(\"in-match\")')}")

        print("HEEL engine present:", pg.evaluate("!!window.HEEL"))
        shot("title")
        key("Enter"); shot("menu")
        for _ in range(4): key("ArrowDown", 120)
        key("Enter"); shot("howto")
        key("Escape"); key("ArrowDown", 120); key("Enter"); key("ArrowLeft", 150); shot("settings")
        key("Escape"); key("ArrowUp", 120); key("ArrowUp", 120); key("ArrowUp", 120); key("ArrowUp", 120)
        key("Enter"); shot("online")
        key("Escape"); key("ArrowUp", 120); key("Enter"); key("ArrowRight", 150); shot("select")
        key("Enter"); key("ArrowRight", 150); shot("select-opponent")
        key("Enter", 700); shot("versus")
        pg.wait_for_timeout(2300); shot("match")
        key("Escape"); shot("pause")
        key("Enter", 700); print("after resume", state())
        key("Escape"); key("ArrowDown", 120); key("ArrowDown", 120); key("Enter", 700); print("after quit", state())
        pg.evaluate("""HEEL_UI.showResults({ winner: 'p2', how: 'Pinfall', stats: { strikes: [14, 9], grapples: [3, 7], blocks: [2, 6], damage: [61, 100] },
          aiPlansLog: ['You strike at the opening bell 70% of the time. It now opens with a block.',
                       'After taking a hit you grapple right back. It saves its strikes for that moment.',
                       'You taunt when your meter is near full. It rushes you when you do.'] })""")
        pg.wait_for_timeout(700); shot("results")
        pg.goto(URL + "/?room=AB12CD")
        pg.wait_for_function("window.HEEL_UI", timeout=20000); pg.wait_for_timeout(1500); shot("join-room")
        print("page errors:", errors or "none")
        b.close()


if __name__ == "__main__":
    main()
