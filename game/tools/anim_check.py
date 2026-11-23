"""Animation check on the real page: play an exhibition (strikes, a slam, knockdown, get-up, pin, win, results)
and record every 100 ms, per character, the clip and move driving it (window.HEEL_ANIM in main.js).
Usage: python game/tools/anim_check.py [url] [--tag before]
Asserts: no missing-clip fallback, no one-shot clip restarting while it should hold, the winner's celebration
plays once and settles into a loop, the loser stays down, and the chest never drifts more than 5 degrees in
any held state (3 s windows). Writes docs/shots/anim-*.png and docs/shots/anim-log.json. Exit 1 on a failure."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith("--")]
TAG = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else ""
URL = (args[0] if args and args[0].startswith("http") else "http://localhost:5173") + "/?mute=1"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
OUT.mkdir(parents=True, exist_ok=True)
pre = f"anim{('-' + TAG) if TAG else ''}"

RECORD = """() => { window.__anim = []; clearInterval(window.__animIv);
  window.__animIv = setInterval(() => { try { window.__anim.push(window.HEEL_ANIM()); } catch (e) {} }, 100); }"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: m.type in ("error", "warning") and "[heel]" in m.text and errs.append(m.text))
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=30000)
    st = lambda: pg.evaluate("HEEL_UI.state")
    def key(k, w=400): pg.keyboard.press(k); pg.wait_for_timeout(w)
    def until(state, k="Enter"):
        for _ in range(20):
            if st() == state: return
            key(k, 500)
        raise SystemExit(f"stuck at {st()}, wanted {state}")
    until("menu"); until("select")
    key("ArrowRight", 200); key("Enter", 300)
    for _ in range(40):
        if st() == "match": break
        pg.wait_for_timeout(500)
    else: raise SystemExit(f"never reached match: {st()}")
    pg.evaluate(RECORD)
    pg.wait_for_timeout(3500)  # intro and bell
    shots = set()
    def snap(name):
        if name not in shots: pg.screenshot(path=str(OUT / f"{pre}-{name}.png")); shots.add(name)
    # strikes: walk in and jab
    pg.keyboard.down("KeyD")
    for i in range(24):
        pg.keyboard.press("KeyJ")
        for _ in range(4):
            pg.wait_for_timeout(35)
            if "strike" not in shots and pg.evaluate("G.P1.anim === 'Punch' && G.P1.state === 'rec'"): snap("strike")
    pg.keyboard.up("KeyD")
    # a slam that does not end it: knockdown and get-up (keep P2 healthy so there is no pin finish yet)
    pg.evaluate("G.P2.hp = Math.max(G.P2.hp, 60); G.P1.st = 100")
    pg.keyboard.down("KeyD")
    for i in range(60):
        pg.keyboard.press("KeyK"); pg.wait_for_timeout(120)
        if pg.evaluate("G.P2.state === 'down' || G.P2.state === 'thrown'"): break
    pg.keyboard.up("KeyD")
    pg.wait_for_timeout(700); snap("knockdown")
    for _ in range(200):
        pg.wait_for_timeout(50)
        if pg.evaluate("G.P2.anim === 'Standing'"): pg.wait_for_timeout(450); snap("getup"); break
    pg.wait_for_timeout(1200)
    # the finish: slam, pin, win
    pg.keyboard.down("KeyD")
    for i in range(240):
        pg.evaluate("G.P2.hp = 1; G.P1.hp = 100; G.P1.mo = 100; G.P1.st = 100")
        pg.keyboard.press("KeyK"); pg.wait_for_timeout(150)
        if pg.evaluate("!!(G.state && G.state.over)"): break
    pg.keyboard.up("KeyD")
    pg.wait_for_timeout(1400); snap("winner")
    pg.wait_for_timeout(3600)  # the winner settles; the held window for the drift check
    log = pg.evaluate("window.__anim")
    final_ui = st()
    pg.evaluate("window.speechSynthesis && speechSynthesis.cancel()")
    b.close()

(OUT / f"{pre}-log.json").write_text(json.dumps(log))
fails = []
names = ["p1", "p2"]
# 1. missing-clip fallbacks (the probe reports miss when the sim asked for an anim the clip map lacks)
for s in log:
    for i, w in enumerate(s["w"]):
        if w.get("miss"): fails.append(f"{names[i]} missing clip for anim {w['anim']}")
# 2. one-shot restarts: a LoopOnce clip whose time jumps back while the same play request stands
for i in range(2):
    prev = None
    for s in log:
        w = s["w"][i]
        if prev and w["clip"] == prev["clip"] and w.get("once") and w.get("req") == prev.get("req") \
                and w["clipTime"] is not None and prev["clipTime"] is not None and w["clipTime"] + 0.05 < prev["clipTime"]:
            fails.append(f"{names[i]} one-shot {w['clip']} restarted at t={s['t']:.0f}")
        prev = w
# 3. the finish: winner celebrates once then loops a victory idle; the loser stays down
end = [s for s in log if s["over"]]
if not end: fails.append("match never ended")
else:
    wi = next((i for i in range(2) if end[-1]["w"][i]["state"] == "taunt"), None)
    if wi is None: fails.append("no winner in taunt state")
    else:
        seq = []
        for s in end:
            c = s["w"][wi]["clip"]
            if not seq or seq[-1] != c: seq.append(c)
        print("winner clips after the bell:", seq)
        if seq[-1] is None or end[-1]["w"][wi].get("once"): fails.append(f"winner did not settle into a loop: {seq}")
        if len(seq) > 3: fails.append(f"winner clip churn: {seq}")
        lw = end[-1]["w"][1 - wi]
        print("loser at the end:", lw["state"], lw["clip"], lw["move"])
        if lw["state"] not in ("down", "pinned", "out") and lw["move"] is None and lw["clip"] not in ("lying", "defeat"):
            fails.append(f"loser got up: {lw}")
# 4. twists: the chest must never jump more than 45 degrees relative to the body in one frame
for i in range(2):
    big = [(s["t"], s["w"][i]["step"], s["w"][i]["anim"], s["w"][i]["clip"], s["w"][i]["move"]) for s in log if s["w"][i]["step"] > 45]
    print(names[i], "max per-frame chest step:", max(s["w"][i]["step"] for s in log), "deg; spikes>45:", len(big), big[:6])
    if big: fails.append(f"{names[i]} chest twisted {max(b[1] for b in big)} deg in one frame ({len(big)} samples) e.g. {big[0][2:]}")
# 5. chest drift in held states (no move running, or a move holding its last pose): over any 3 s window the
#    chest's mean angle in the last second may not move more than 5 degrees from the first second's
def drift_fail(i, run):
    seg_all = [x["chest"] for x in run]
    for k in range(0, len(run) - 29):
        seg = seg_all[k:k + 30]
        d = abs(sum(seg[-10:]) / 10 - sum(seg[:10]) / 10)
        if d > 5:
            r = run[k]
            return f"{names[i]} chest drift {d:.1f} deg over 3 s in {r['state']}/{r['anim']}/{r['clip']}/{r['move']}"
for i in range(2):
    run, worst = [], 0.0
    for s in log:
        w = s["w"][i]
        held = w["chest"] is not None and (w["move"] is None or w["move"].endswith(":held"))
        keyv = (w["state"], w["anim"], w["clip"], w["move"]) if held else None
        if run and keyv != run[0]["key"]:
            if len(run) >= 30 and (f := drift_fail(i, run)): fails.append(f)
            run = []
        if keyv: run.append({**w, "key": keyv})
    if len(run) >= 30 and (f := drift_fail(i, run)): fails.append(f)
# summary: per character, the clip timeline
for i in range(2):
    tl = []
    for s in log:
        w = s["w"][i]; k = f"{w['anim']}>{w['clip']}" + (f"+{w['move']}" if w["move"] else "")
        if not tl or tl[-1][0] != k: tl.append([k, 1])
        else: tl[-1][1] += 1
    print(names[i], " | ".join(f"{k} x{n}" for k, n in tl))
ref = [s["ref"]["clip"] for s in log if s.get("ref")]
print("ref clips:", sorted(set(c for c in ref if c)))
print("ui at end:", final_ui, "| samples:", len(log), "| shots:", sorted(shots))
print("ERRORS:", errs or "none")
fails = list(dict.fromkeys(fails))
print("FAIL\n  " + "\n  ".join(fails[:30]) if fails else "PASS")
sys.exit(1 if fails else 0)
