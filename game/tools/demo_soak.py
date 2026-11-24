"""Demo soak: N full ?demo=1 matches back to back (menu -> versus -> intro -> match -> results -> rematch), headless.
Fails a run on: any page error, a T-pose (both arms flat sideways for > 0.5 s outside a move, any body incl. the
ref and the announcer), a body floating above the mat outside a scripted move, drawn hips > 30 cm off the sim
outside a move, any sim state (other than idle/walking) stuck > 10 s, or the results screen not reached.
Usage: python game/tools/demo_soak.py [url] [runs]. Default url is the production preview on 4173."""
import sys
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/?demo=1&mute=1"
RUNS = int(sys.argv[2]) if len(sys.argv) > 2 else 5
FLAT_LO, FLAT_HI, TPOSE_S = 70.0, 110.0, 0.5
FLOAT_M, FLOAT_S, DRIFT_M, DRIFT_S, STUCK_S = 0.25, 0.3, 0.30, 0.3, 10.0
FREE = {"idle", "walk", "run", "block"}
ATTACK, LEAN_M = {"wind", "active", "rec"}, 0.40

# In-page sampler, every 100 ms: per wrestler arm angles, lowest bone height, drawn hips vs sim; ref arm angles.
SAMPLER = """() => { window.__soak = []; clearInterval(window.__soakTick);
  const ang = (o, a, b) => { const u = o.getObjectByName(a), l = o.getObjectByName(b); if (!u || !l) return null;
    u.updateWorldMatrix(true, false); l.updateWorldMatrix(true, false);
    const p = u.matrixWorld.elements, q = l.matrixWorld.elements, dx = q[12] - p[12], dy = q[13] - p[13], dz = q[14] - p[14];
    return Math.acos(Math.max(-1, Math.min(1, -dy / Math.hypot(dx, dy, dz)))) * 180 / Math.PI; };
  const low = (o) => { let m = 1e9; o.traverse((b) => { if (b.isBone) { b.updateWorldMatrix(true, false); m = Math.min(m, b.matrixWorld.elements[13]); } }); return m; };
  const side = (o, a, b) => { const u = o.getObjectByName(a), l = o.getObjectByName(b); if (!u || !l) return null;
    const p = u.matrixWorld.elements, q = l.matrixWorld.elements, d = [q[12] - p[12], q[13] - p[13], q[14] - p[14]];
    const n = Math.hypot(...d), e = o.matrixWorld.elements, rn = Math.hypot(e[0], e[1], e[2]);
    return Math.abs((d[0] * e[0] + d[1] * e[1] + d[2] * e[2]) / (n * rn)); };
  // per frame: the largest one-frame turn of each drawn body (a facing snap shows as a spike), read and reset per sample
  window.__yawMax = [0, 0]; window.__yawPrev = [null, null];
  const yawLoop = () => { const vs = window.HEEL_VIEWS ? HEEL_VIEWS() : [];
    vs.forEach((o, i) => { const e = o.matrixWorld.elements, y = Math.atan2(e[8], e[10]), p = window.__yawPrev[i];
      if (p != null) { let d = Math.abs(y - p); if (d > Math.PI) d = 2 * Math.PI - d; window.__yawMax[i] = Math.max(window.__yawMax[i], d * 180 / Math.PI); }
      window.__yawPrev[i] = y; });
    window.__yawRaf = requestAnimationFrame(yawLoop); };
  cancelAnimationFrame(window.__yawRaf); yawLoop();
  window.__soakTick = setInterval(() => {
    const st = window.G && G.state, sy = window.HEEL_SYNC && HEEL_SYNC(), an = window.HEEL_ANIM && HEEL_ANIM();
    const row = { t: performance.now() / 1000, ui: window.HEEL_UI && HEEL_UI.state, bell: (window.HEEL_ENTRANCE_LOG || []).some((e) => e.ev === 'bell'),
      intro: st ? st.introT > 0 : true, pair: !!(st && st.pair), over: !!(st && st.over), w: [] };
    const objs = window.HEEL_VIEWS ? HEEL_VIEWS() : [];
    if (sy && st) sy.w.forEach((w, i) => {
      const o = objs[i];
      row.w.push({ state: w.state, move: w.move, lying: w.lying, drift: Math.hypot(w.hx - w.sx, w.hz - w.sz),
        inRing: Math.max(Math.abs(w.sx), Math.abs(w.sz)) < 3.0, low: o ? low(o) : null,
        l: o ? ang(o, 'upperarm_l', 'lowerarm_l') : null, r: o ? ang(o, 'upperarm_r', 'lowerarm_r') : null,
        sl: o ? side(o, 'upperarm_l', 'lowerarm_l') : null, sr: o ? side(o, 'upperarm_r', 'lowerarm_r') : null,
        clip: an && an.w[i] ? an.w[i].clip : null, turn: window.__yawMax[i] });
      window.__yawMax[i] = 0;
    });
    const ref = window.HEEL_REF;
    if (ref && ref.obj && ref.obj.parent) row.ref = { phase: ref.phase, l: ang(ref.obj, 'upperarm_l', 'lowerarm_l'), r: ang(ref.obj, 'upperarm_r', 'lowerarm_r'),
      sl: side(ref.obj, 'upperarm_l', 'lowerarm_l'), sr: side(ref.obj, 'upperarm_r', 'lowerarm_r') };
    window.__soak.push(row);
  }, 100); }"""


def runs_of(rows, pred):
    """Longest stretch (s) where pred(row) holds."""
    best, start = 0.0, None
    for r in rows:
        if pred(r):
            start = r["t"] if start is None else start
            best = max(best, r["t"] - start + 0.1)
        else:
            start = None
    return best


def flat(x):
    """T-pose: both arms level and pointing out to the body's sides (|arm . body right| > 0.85)."""
    a, b, sa, sb = x["l"], x["r"], x.get("sl"), x.get("sr")
    return None not in (a, b, sa, sb) and FLAT_LO < a < FLAT_HI and FLAT_LO < b < FLAT_HI and sa > 0.85 and sb > 0.85


def judge(rows):
    fails, stats = [], {}
    for i in (0, 1):
        ws = [r for r in rows if len(r["w"]) > i]
        def w(r): return r["w"][i]
        tp = runs_of(ws, lambda r: not w(r)["move"] and flat(w(r)))
        live = lambda r: r["bell"] and not r["intro"] and not r["over"]
        fl = runs_of(ws, lambda r: live(r) and not r["pair"] and not w(r)["move"] and w(r)["inRing"]
                     and w(r)["low"] is not None and w(r)["low"] - 1.1 > FLOAT_M)
        # a strike or grab clip leans the hips into the swing by design (up to ~32 cm): judged at LEAN_M, not DRIFT_M
        lim = lambda r: LEAN_M if w(r)["state"] in ATTACK else DRIFT_M
        dr = runs_of(ws, lambda r: live(r) and not r["pair"] and not w(r)["move"] and w(r)["drift"] > lim(r))
        # a stretch of one non-free state: only the same state counts as stuck
        st_best, cur, t0 = 0.0, None, 0
        for r in ws:
            s = w(r)["state"] if live(r) and w(r)["state"] not in FREE else None
            if s != cur: cur, t0 = s, r["t"]
            if s: st_best = max(st_best, r["t"] - t0)
        maxdrift = max((w(r)["drift"] for r in ws if live(r) and not r["pair"] and not w(r)["move"]), default=0)
        pops = [w(r)["turn"] for r in ws if live(r) and not r["pair"] and not w(r)["move"] and w(r).get("turn") is not None]
        stats[i] = dict(turnpop=max(pops, default=0), tpose=tp, float=fl, drift=dr, maxdrift=maxdrift, stuck=st_best)
        if tp > TPOSE_S: fails.append(f"w{i} T-pose {tp:.1f}s")
        if fl > FLOAT_S: fails.append(f"w{i} floats {fl:.1f}s")
        if dr > DRIFT_S: fails.append(f"w{i} hips off sim {dr:.1f}s (max {maxdrift:.2f} m)")
        if st_best > STUCK_S: fails.append(f"w{i} stuck {st_best:.1f}s")
    refs = [r for r in rows if r.get("ref")]
    rtp = runs_of(refs, lambda r: r["ref"]["phase"] == "roam" and flat(r["ref"]))
    stats["ref"] = dict(tpose=rtp)
    if rtp > TPOSE_S: fails.append(f"ref T-pose {rtp:.1f}s")
    return fails, stats


def play_match(pg, first):
    st = lambda: pg.evaluate("HEEL_UI.state")
    def key(k, w=400): pg.keyboard.press(k); pg.wait_for_timeout(w)
    t0 = time.time()
    if first:
        for want in ("menu", "select"):
            for _ in range(20):
                if st() == want: break
                key("Enter", 500)
        key("Enter", 300)  # any card: demo mode books Vex vs Brutus Kane
    pg.wait_for_function("HEEL_UI.state === 'match'", timeout=15000)
    names = pg.evaluate("[G.P1 && G.P1.id, G.P2 && G.P2.id]")
    pg.evaluate(SAMPLER)
    pg.wait_for_function("(window.HEEL_ENTRANCE_LOG || []).some(e => e.ev === 'bell')", timeout=90000)
    pg.wait_for_function("!(window.HEEL_PROMO && HEEL_PROMO.holding)", timeout=60000)
    intro_s = time.time() - t0
    pg.wait_for_timeout(1000)
    # fight for real: walk in, strike and grapple (lock-ups resolve to knee or body slam in demo mode)
    pg.keyboard.down("KeyD")
    for i in range(60):
        key("KeyJ" if i % 3 else "KeyK", 200)
    pg.keyboard.up("KeyD")
    # finish: low health, then grapple and cover until the bell
    pg.evaluate("G.P2.hp = Math.min(G.P2.hp, 8)")
    for i in range(160):
        if st() == "results": break
        held = "KeyD" if pg.evaluate("G.P1.x < G.P2.x") else "KeyA"
        pg.keyboard.down(held); key("KeyK", 150); pg.keyboard.up(held)
        key("KeyK", 150)
    pg.wait_for_function("HEEL_UI.state === 'results'", timeout=60000)
    rows = pg.evaluate("window.__soak")
    pg.evaluate("clearInterval(window.__soakTick)")
    return names, intro_s, time.time() - t0, rows


def main():
    table, bad = [], 0
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
        pg = b.new_page(viewport={"width": 1280, "height": 800})
        errs = []
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:160]))
        pg.goto(URL)
        pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=60000)
        for n in range(RUNS):
            e0 = len(errs)
            try:
                names, intro_s, total_s, rows = play_match(pg, n == 0)
                fails, stats = judge(rows)
                out = Path(__file__).parent / "capture"; out.mkdir(exist_ok=True)
                (out / f"soak-run-{n + 1}.json").write_text(json.dumps(rows))
                txt = pg.inner_text("#s-results")[:80].replace("\n", " | ")
            except Exception as ex:
                names, intro_s, total_s, rows, stats = ["?", "?"], 0, 0, [], {}
                fails = [f"flow: {str(ex)[:120]}"]
                txt = ""
            fails += errs[e0:]
            ok = not fails
            bad += not ok
            table.append((n + 1, "PASS" if ok else "FAIL", names, intro_s, total_s, len(rows), stats, fails, txt))
            print(f"run {n + 1}: {'PASS' if ok else 'FAIL'} {names} intro {intro_s:.0f}s total {total_s:.0f}s samples {len(rows)} "
                  f"stats {stats} {fails} results='{txt}'", flush=True)
            if n + 1 < RUNS:
                if pg.evaluate("HEEL_UI.state") != "results":
                    pg.goto(URL); pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=60000)
                    for _ in range(20):
                        if pg.evaluate("HEEL_UI.state") == "select": break
                        pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
                    pg.keyboard.press("Enter")
                else:
                    pg.wait_for_timeout(1500)
                    pg.click('[data-act="rematch"]')
        b.close()
    print("\n| run | result | pair | intro s | match s | samples | max hips drift m | fails |")
    print("|---|---|---|---|---|---|---|---|")
    for n, r, names, i_s, t_s, k, stats, fails, _ in table:
        md = max((stats.get(i, {}).get("maxdrift", 0) for i in (0, 1)), default=0)
        print(f"| {n} | {r} | {names[0]} vs {names[1]} | {i_s:.0f} | {t_s:.0f} | {k} | {md:.2f} | {'; '.join(fails) or '-'} |")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
