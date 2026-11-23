"""Browser check for the agent layer: play exhibition matches that spam strike, then dump the decision log,
the agent plans and the spoken lines. Usage: python game/ui/agents_check.py [url] [matches]
Writes docs/shots/agents-*.png. Exit 1 if the in-game AI never says "expect your strike ... answer with block"."""
import json
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
MATCHES = int(sys.argv[2]) if len(sys.argv) > 2 else 1
MODE = sys.argv[3] if len(sys.argv) > 3 else "strike"  # "switch": strike for half the match, then block
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
OUT.mkdir(parents=True, exist_ok=True)

ok = False
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text))
    pg.on("console", lambda m: m.text.startswith("[heel]") and print("  console", m.text[:220]))
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=30000)
    def key(k, w=400): pg.keyboard.press(k); pg.wait_for_timeout(w)
    def until(state, k="Enter"):
        for _ in range(20):
            if pg.evaluate("HEEL_UI.state") == state: return
            key(k, 500)
        raise SystemExit(f"menu stuck at {pg.evaluate('HEEL_UI.state')}, wanted {state}")
    until("menu"); key("Enter", 600)  # Exhibition is the first item
    until("select", "Escape") if pg.evaluate("HEEL_UI.state") != "select" else None
    key("ArrowRight", 200); key("Enter", 300)  # pick P1; the opponent is random
    print("menu state:", pg.evaluate("HEEL_UI.state"))
    for n in range(MATCHES):
        pg.wait_for_function("HEEL_UI.state === 'match'", timeout=15000)
        pg.wait_for_timeout(3500)
        strikes = 0; walk_samples = []
        for i in range(70):
            # walk at the AI, strike every 200 ms
            dx = pg.evaluate("G.P2 && G.P1 ? G.P2.x - G.P1.x : 0")
            pg.keyboard.down("KeyD" if dx > 1.1 else "KeyA") if abs(dx) > 1.1 else None
            pg.evaluate("G.P1.hp = Math.max(G.P1.hp, 40)")  # keep the player in it so plans have time to change
            if pg.evaluate("!!(G.state.pin && G.state.pin.victim === 0)"):
                for _ in range(8): pg.keyboard.press("KeyK")
            pg.keyboard.press("KeyJ" if i < 35 or MODE != "switch" else "KeyL"); strikes += 1
            if i == 30: pg.screenshot(path=str(OUT / f"agents-plans{n + 1}.png"))
            pg.wait_for_timeout(200)
            pg.keyboard.up("KeyD"); pg.keyboard.up("KeyA")
            # walk-in-place probe: sample the AI over 3 frames; walking anim while not moving is a bug
            smp = pg.evaluate("""() => new Promise((res) => { const a = [G.P2.x, G.P2.z]; requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res({ anim: G.P2.anim, moved: Math.hypot(G.P2.x - a[0], G.P2.z - a[1]) })))); })""")
            walk_samples.append(smp)
            log = pg.inner_text("#log") if pg.query_selector("#log") else ""
            if re.search(r"expect your strike.*answer with block", log):
                ok = True
                if n == 0 and i < 69: pass
            if pg.evaluate("HEEL_UI.state") != "match": break
        pg.screenshot(path=str(OUT / f"agents-match{n + 1}.png"))
        print(f"match {n + 1}: strike keys {strikes}; decision log now:")
        print("  " + (pg.inner_text("#log") if pg.query_selector("#log") else "(no #log)").replace("\n", "\n  "))
        stuck = [x for x in walk_samples if x["anim"] in ("Walking", "Running") and x["moved"] < 0.005]
        print(f"  walk-in-place samples: {len(stuck)} of {len(walk_samples)}")
        lines = [l for l in (pg.inner_text("#log") or "").splitlines() if "plan:" in l]
        dup = sum(1 for a, b in zip(lines, lines[1:]) if re.sub(r"\(.*?\)", "", a) == re.sub(r"\(.*?\)", "", b))
        print(f"  adjacent repeated plan lines: {dup}")
        print("  habits:", json.dumps(pg.evaluate("G.state && G.state.habits")))
        dbg = pg.evaluate("window.HEEL_DEBUG ? HEEL_DEBUG() : null") or {}
        print("  agents:", dbg.get("agents"), "errors:", dbg.get("errors"), "voice:", dbg.get("voice"))
        for ln in dbg.get("spoken", []):
            print(f"  spoke t={ln['t_s']:7.2f}s {ln['speaker']:6} {ln.get('source')!s:8} {ln['text']}")
        chip = pg.evaluate("(document.querySelector('.dl-chip') || {}).textContent || ''")
        print("  status chip:", chip)
        for pl in dbg.get("plans", []):
            print(f"  plan t={pl['t']/1000:5.1f}s {pl['wrestler']:5} {pl.get('source')!s:8} {pl.get('ms')!s:>7}ms {pl['intent']}->{pl.get('target')} | {pl['reason']} | {pl.get('cites', [])[:2]}")
        # finish the match so it ends (and memory refreshes), then rematch
        pg.evaluate("G.P2.hp = 1; G.P1.mo = 100")
        for i in range(120):
            pg.keyboard.down("KeyD"); pg.keyboard.press("KeyK"); pg.wait_for_timeout(150)
            if pg.evaluate("HEEL_UI.state") == "results": break
        pg.keyboard.up("KeyD")
        pg.wait_for_timeout(1500)
        print(f"  end state: {pg.evaluate('HEEL_UI.state')}")
        if n + 1 < MATCHES:
            # wait for the server-side Bruin refresh this match triggered, so the next match reads it
            for _ in range(90):
                st = pg.evaluate("fetch('/mem/status').then(r => r.json())")
                if st.get("refreshes", 0) >= n + 1 and not st.get("running"): break
                pg.wait_for_timeout(1000)
            print("  bruin:", st)
            pg.evaluate("document.querySelector('[data-act=rematch]').click()")
    pg.wait_for_timeout(1000)
    print("final bruin status:", pg.evaluate("fetch('/mem/status').then(r => r.json())"))
    print("ERRORS:", errs or "none")
    b.close()
print("PASS counter plan seen in the decision log" if ok else "FAIL no counter plan in the decision log")
sys.exit(0 if ok else 1)
