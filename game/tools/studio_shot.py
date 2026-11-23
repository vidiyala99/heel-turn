"""Screenshot dressed characters in the studio page (game/studio.html).
Usage: python game/tools/studio_shot.py <base-url> <out-dir> [ids] [frame] [size] [yaw]
  ids: comma list (default vex,kane,silas,mae,ref); frame: full | bust | legs.
Writes <out-dir>/<prefix><id>.png and prints console errors. Card renders use frame=full size=1024."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], Path(sys.argv[2])
ids = (sys.argv[3] if len(sys.argv) > 3 else "vex,kane,silas,mae,ref").split(",")
frame = sys.argv[4] if len(sys.argv) > 4 else "full"
size = int(sys.argv[5]) if len(sys.argv) > 5 else 768
yaw = sys.argv[6] if len(sys.argv) > 6 else "18"
prefix = sys.argv[7] if len(sys.argv) > 7 else f"studio-{frame}-"
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--mute-audio"])
    pg = b.new_page(viewport={"width": size, "height": size})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: m.type in ("error", "warning") and errs.append(m.type + ": " + m.text[:400]))
    for i in ids:
        pg.goto(f"{base}/studio.html?id={i}&size={size}&frame={frame}&yaw={yaw}")
        pg.wait_for_function("window.STUDIO && STUDIO.ready", timeout=30000)
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(out / f"{prefix}{i}.png"))
        print("wrote", out / f"{prefix}{i}.png")
    print("ERRORS:", errs or "none")
    pg.evaluate("window.speechSynthesis && speechSynthesis.cancel()")
    b.close()
