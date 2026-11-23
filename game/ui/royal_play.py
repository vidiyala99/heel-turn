"""Play OVER THE TOP twice through the real menu: once the commissioner approves every card (Y), once blocks (N).
Usage: python game/ui/royal_play.py [url]   (url may carry ?oddsPort=&server=). Writes docs/shots/royal-*.png and
prints what each run did: alliance, proposals, betrayal elimination, Lou, elimination order, winner, console errors."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5178/?mute=1"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
OUT.mkdir(parents=True, exist_ok=True)


def run(b, key, tag):
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e) + " " + (e.stack or "")[:700]))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text))
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=60000)
    st = lambda: pg.evaluate("HEEL_UI.state")
    for _ in range(10):
        if st() == "menu": break
        pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    for _ in range(3): pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(150)
    if tag == "approve": pg.screenshot(path=str(OUT / "royal-menu.png"))
    pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200)  # P1 = second card
    pg.keyboard.press("Enter")
    pg.wait_for_function("HEEL_UI.state === 'match' && G.state && G.state.mode === 'royal'", timeout=10000)
    shots, seen, cards = set(), {}, []
    for t in range(1800):  # up to 180 s
        pg.wait_for_timeout(100)
        s = pg.evaluate("""(() => { const m = G.state; return { clock: m.clock, over: m.over, inRing: m.w.filter(w => w.entered && !w.out).length,
          entered: m.w.filter(w => w.entered).length, betray: m.betray && m.betray.status, alliance: !!m.alliance, card: !!document.querySelector('.rr-card:not([hidden])'),
          banner: (document.getElementById('banner') || {}).textContent, bannerOn: getComputedStyle(document.getElementById('banner')).opacity > 0.5,
          log: (document.getElementById('log') || {}).innerText || '' }; })()""")
        if s["entered"] == 5 and "ring" not in shots and tag == "approve":
            shots.add("ring"); pg.screenshot(path=str(OUT / "royal-ring.png"))
            pg.set_viewport_size({"width": 1920, "height": 1080}); pg.wait_for_timeout(400)
            pg.screenshot(path=str(OUT / "royal-ring-1920.png"))
            pg.keyboard.press("o"); pg.wait_for_timeout(1800)
            pg.screenshot(path=str(OUT / "royal-odds-1920.png"))
            pg.set_viewport_size({"width": 1440, "height": 900}); pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / "royal-odds.png"))
            pg.keyboard.press("o")
        if "ALLIANCE" in s["log"] and "ally" not in shots:
            shots.add("ally"); pg.screenshot(path=str(OUT / f"royal-alliance-{tag}.png"))
        if s["card"]:
            title = pg.inner_text(".rr-card .rr-head")
            if title not in seen:
                seen[title] = True; cards.append(title)
                pg.wait_for_timeout(300)
                pg.screenshot(path=str(OUT / f"royal-card-{tag}-{len(cards)}.png"))
                pg.keyboard.press(key)
        if s["bannerOn"] and s["banner"] == "HEEL TURN!" and "betray" not in shots:
            shots.add("betray"); pg.wait_for_timeout(250); pg.screenshot(path=str(OUT / f"royal-betrayal-{tag}.png"))
        if s["over"]:
            break
    pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / f"royal-end-{tag}.png"))
    res = pg.evaluate("""(() => { const m = G.state, d = window.HEEL_ROYAL();
      return { secs: +m.clock.toFixed(1), over: m.over, winner: m.over ? m.w[m.winner].id : null,
        order: m.order.map(i => m.w[i].id), proposals: m.proposals.map(p => `${p.id} ${p.kind} ${p.status} band=${p.bandId}`),
        betray: m.betray, lou: m.lou, oddsSent: d.odds.map(e => `${e.kind}:${e.actor || ''}>${e.target || ''}`),
        bandVerdicts: d.verdicts.filter(v => v.band).map(v => `${v.band.id} ${v.band.status}`), plans: d.plans.length, errors: d.errors.slice(0, 5) }; })()""")
    res["cards"] = cards
    res["consoleErrors"] = errs[:5]
    print(tag.upper(), json.dumps(res, indent=1))
    pg.close()
    return res


with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    a = run(b, "y", "approve")
    z = run(b, "n", "block") if "approve-only" not in sys.argv else a
    b.close()
print("DIFFERENT OUTCOMES:", a["order"] != z["order"] or a["winner"] != z["winner"])
