"""Is a promo actually voiced? Headless with --mute-audio but the audio path on (?voice=1): plays an exhibition to the
pre-match promo and prints every 'heel:voice' start (speaker, mode). PASS when a wrestler line starts in mode 'neural'.
Writes docs/shots/polish-promo-sub.png. Usage: python game/ui/promo_voice.py [url]"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173") + "/?voice=1"
OUT = Path(__file__).resolve().parents[2] / "docs" / "shots"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio", "--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    pg.add_init_script("window.VOICE_LOG = []; addEventListener('heel:voice', e => VOICE_LOG.push(e.detail));")
    pg.goto(URL)
    pg.wait_for_function("window.HEEL_UI && HEEL_UI.state === 'title'", timeout=30000)
    for want in ("menu", "select"):
        for _ in range(20):
            if pg.evaluate("HEEL_UI.state") == want: break
            pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    pg.keyboard.press("Enter")
    pg.wait_for_function("HEEL_UI.state === 'match'", timeout=8000)
    pg.wait_for_function("(window.HEEL_ENTRANCE_LOG || []).some(e => e.ev === 'bell')", timeout=90000)
    pg.wait_for_function("document.querySelector('.promo.on')", timeout=10000)
    try:
        pg.wait_for_function("VOICE_LOG.some(v => v.phase === 'start' && ['vex','kane','silas','mae'].includes(v.speaker))", timeout=15000)
    except Exception:
        print(pg.evaluate("JSON.stringify({v: VOICE_LOG.map(v => [v.phase, v.speaker, v.mode]), e: HEEL_DEBUG().errors, p: (HEEL_DEBUG().promos||[]).length})"))
    pg.wait_for_timeout(600); pg.screenshot(path=str(OUT / "polish-promo-sub.png"))
    pg.wait_for_function("!HEEL_PROMO.holding", timeout=40000)
    log = pg.evaluate("VOICE_LOG.filter(v => v.phase === 'start').map(v => [v.speaker, v.mode, v.text.slice(0, 60)])")
    b.close()
for row in log: print(" ", *row)
ok = any(s in ("vex", "kane", "silas", "mae") and m == "neural" for s, m, _ in log)
print("PROMO VOICE", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
