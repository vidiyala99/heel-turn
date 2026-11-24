"""Measure every audio bus through the real mix code: python game/ui/mix_check.py [url].
Speech (cached TTS clips on the voice bus) is the 0 dB reference; prints dBFS and dB-vs-speech per bus, and checks the
targets in voice/mix.js LEVEL within 1.5 dB, plus Settings volume 0.5 -> about -6 dB."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173") + "/mixcheck.html"
ROOT = Path(__file__).resolve().parents[2]
clips = sorted((ROOT / "voice" / ".cache").glob("*.mp3"), key=lambda p: p.stat().st_size)[-6:]
urls = ["/@fs/" + p.as_posix().lstrip("/") for p in clips]
TARGET = {"crowd": -12, "crowdUnder": -18, "music": -14, "musicUnder": -26}

with sync_playwright() as p:
    b = p.chromium.launch(args=["--mute-audio", "--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page()
    out = None
    for attempt in range(4):  # a Vite reload (another edit landing) destroys the page mid-run: start over
        try:
            pg.goto(URL); out = pg.evaluate("clips => MIX(clips)", urls); break
        except Exception as e:
            print("retry:", str(e).splitlines()[0])
    b.close()
if out is None: sys.exit("MIX INCONCLUSIVE: the page kept reloading")
print(json.dumps(out, indent=1))
bad = [k for k, t in TARGET.items() if abs(out[k + "_vsSpeech"] - t) > 1.5]
half = out["crowdAtHalfVolume"] - out["crowd"]
if abs(half + 6) > 1.5: bad.append(f"settings volume 0.5 changed crowd by {half:.1f} dB")
print("MIX", "PASS" if not bad else "FAIL " + ", ".join(bad))
sys.exit(1 if bad else 0)
