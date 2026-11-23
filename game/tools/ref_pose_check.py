"""Ref Lou T-pose check: samples his upper-arm angle from straight down every 200 ms across a full exhibition
(entrance, bell, fight, a kicked-out pin, the winning pin, results) and a full OVER THE TOP match. Fails when either
arm sits near horizontal (> 70 deg from down) for more than 0.3 s while he roams (counting on the mat is a gesture).
Usage: python game/tools/ref_pose_check.py [url]. Writes docs/shots/ref-fixed-*.png. Exit 1 on a hold."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173/?mute=1"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
FLAT, HOLD = 70.0, 0.3

# In-page sampler: upperarm -> lowerarm world direction against world down, plus what drives the body.
SAMPLER = """() => { window.__refRows = []; clearInterval(window.__refTick);
  const ang = (obj, a, b) => { const u = obj.getObjectByName(a), l = obj.getObjectByName(b); if (!u || !l) return null;
    u.updateWorldMatrix(true, false); l.updateWorldMatrix(true, false);
    const p = u.matrixWorld.elements, q = l.matrixWorld.elements, dx = q[12] - p[12], dy = q[13] - p[13], dz = q[14] - p[14];
    return Math.acos(Math.max(-1, Math.min(1, -dy / Math.hypot(dx, dy, dz)))) * 180 / Math.PI; };
  window.__refTick = setInterval(() => { const r = window.HEEL_REF; if (!r || !r.obj.parent) return;
    window.__refRows.push({ t: performance.now() / 1000, ui: window.HEEL_UI && HEEL_UI.state, phase: r.phase, clip: r.anim8.name,
      l: ang(r.obj, 'upperarm_l', 'lowerarm_l'), r: ang(r.obj, 'upperarm_r', 'lowerarm_r') }); }, 200); }"""


def judge(tag, rows):
    worst, run, start, phases = 0.0, 0.0, None, set()
    clips = {r["clip"] for r in rows}
    for i, r in enumerate(rows):
        phases.add(f'{r["ui"]}/{r["phase"]}')
        flat = r["phase"] == "roam" and max(r["l"] or 0, r["r"] or 0) > FLAT
        if flat:
            start = r["t"] if start is None else start
            run = max(run, r["t"] - start + 0.2)
        else:
            start = None
    arms = [max(r["l"] or 0, r["r"] or 0) for r in rows if r["phase"] == "roam"]
    ok = rows and run <= HOLD and None not in clips
    print(f"{tag}: {len(rows)} samples, clips={sorted(c or 'NONE' for c in clips)}, states={sorted(phases)}")
    print(f"{tag}: roam arm angle from down max={max(arms, default=0):.1f} median={sorted(arms)[len(arms) // 2] if arms else 0:.1f}; "
          f"longest flat run={run:.1f}s -> {'PASS' if ok else 'HOLD'}")
    return ok


def boot(b):
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=60000)
    pg.evaluate(SAMPLER)
    for _ in range(10):
        if pg.evaluate("HEEL_UI.state") == "menu": break
        pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    return pg, errs


def exhibition(b):
    pg, errs = boot(b)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200); pg.keyboard.press("Enter")
    pg.wait_for_function("HEEL_UI.state === 'match'", timeout=10000)
    pg.wait_for_timeout(2500); pg.screenshot(path=str(OUT / "ref-fixed-entrance.png"))
    pg.wait_for_function("(window.HEEL_ENTRANCE_LOG || []).some(e => e.ev === 'bell')", timeout=60000)
    pg.wait_for_timeout(300); pg.screenshot(path=str(OUT / "ref-fixed-bell.png"))
    pg.keyboard.down("KeyD")
    for i in range(40): pg.keyboard.press("KeyJ" if i % 3 else "KeyK"); pg.wait_for_timeout(150)
    pg.keyboard.up("KeyD")
    pg.screenshot(path=str(OUT / "ref-fixed-match.png"))
    for run in ("kickout", "three"):
        for attempt in range(4):  # the forced slam can whiff; retry the setup
            try:
                pg.evaluate("G.P2.hp = 45; G.P1.x = -0.5; G.P2.x = 0.5; G.P1.z = G.P2.z = 0; G.P1.st = 100; G.P2.state = 'stun'; G.P2.t = 1.2; G.P1.state = 'idle'")
                pg.keyboard.press("KeyK")
                pg.wait_for_function("G.P2.state === 'down'", timeout=6000, polling="raf")
                pg.evaluate("G.P1.x = G.P2.x - 0.9; G.P1.z = G.P2.z; G.P1.state = 'idle'")
                pg.keyboard.press("KeyK")
                pg.wait_for_function("!!G.state.pin", timeout=4000, polling="raf")
                break
            except Exception as e:
                print(f"pin setup {run} attempt {attempt + 1} missed: {str(e)[:60]}"); pg.wait_for_timeout(2500)
        else:
            raise SystemExit(f"could not force the {run} pin")
        pg.evaluate("G.state.pin.kickAt = %s" % ("2.9" if run == "kickout" else "Infinity"))
        pg.wait_for_timeout(1600); pg.screenshot(path=str(OUT / f"ref-fixed-pin-{run}.png"))
        if run == "kickout":
            pg.wait_for_function("!G.state.pin", timeout=15000); pg.wait_for_timeout(3000)
            pg.screenshot(path=str(OUT / "ref-fixed-after-kickout.png"))
    pg.wait_for_function("HEEL_UI.state === 'results'", timeout=20000)
    pg.wait_for_timeout(1500); pg.screenshot(path=str(OUT / "ref-fixed-results.png"))
    rows = pg.evaluate("window.__refRows"); pg.close()
    return judge("EXHIBITION", rows) and not errs or print("errors:", errs[:3])


def royal(b):
    pg, errs = boot(b)
    for _ in range(3): pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(150)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200); pg.keyboard.press("Enter")
    pg.wait_for_function("HEEL_UI.state === 'match' && G.state && G.state.mode === 'royal'", timeout=10000)
    shot = False
    for _ in range(1800):
        pg.wait_for_timeout(100)
        s = pg.evaluate("(() => { const m = G.state; if (!m) return { over: true, n: 0, card: false }; return { over: m.over, n: m.w.filter(w => w.entered).length, card: !!document.querySelector('.rr-card:not([hidden])') }; })()")
        if s["card"]: pg.keyboard.press("y")
        if not shot and s["n"] >= 4: shot = True; pg.wait_for_timeout(400); pg.screenshot(path=str(OUT / "ref-fixed-royal.png"))
        if s["over"]: break
    pg.wait_for_timeout(1500); pg.screenshot(path=str(OUT / "ref-fixed-royal-end.png"))
    rows = pg.evaluate("window.__refRows"); pg.close()
    return judge("OVER THE TOP", rows) and not errs or print("errors:", errs[:3])


with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    ok = [exhibition(b), royal(b)]
    b.close()
print("REF POSE:", "PASS" if all(ok) else "HOLD")
sys.exit(0 if all(ok) else 1)
