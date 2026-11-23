"""Card art from the 3D models: public/art/render-<id>.png -> portrait-<id>.jpg (1024x1024) and entrance-<id>.jpg
(1920x1080) through BFL FLUX Kontext image-conditioned editing, so the cards keep the model's face, hair, attire and
palette. Old cards are kept once as *-v1.jpg. Writes CREDITS-cards.json beside the art (prompt, seed, model).
Usage: python game/tools/cards_from_renders.py [ids] [kinds]   (env BFL_API_KEY; never printed)
  ids: comma list (default vex,kane,silas,mae,ref); kinds: portrait,entrance (ref gets a portrait only)."""
import base64, io, json, os, shutil, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

ART = Path(__file__).resolve().parents[1] / "public" / "art"
KEY = os.environ["BFL_API_KEY"]
MODEL = "flux-kontext-pro"
STYLE = ("Repaint this 3D character render as stylized original illustrated wrestling game art, bold painterly "
         "comic-book style, dramatic arena lighting, no real brands. Keep the exact same character: same face, same "
         "hair, same outfit pieces and the same colors as the render. ")
LOOK = {
    "vex": ("Vex", "VEX THE VOLTAGE", "short spiky electric-blue buzzed hair, sleeveless open electric-blue sequin vest over a bare chest, "
            "navy trunks with blue waistband, white wrist tape", "electric blue lightning"),
    "kane": ("Brutus Kane", "BRUTUS KANE", "huge muscular man, short red hair and red beard, red wrestling singlet with black straps, "
             "black elbow pads, gold wrist tape", "red fire and smoke"),
    "silas": ("Silas Crane", "SILAS CRANE", "slim man with long black hair, long black coat with purple lapels and cuffs worn open "
              "over a bare chest, purple tights", "purple mist with green-tinged spotlights"),
    "mae": ("Old Iron Mae", "OLD IRON MAE", "tough veteran woman, silver-white hair in two buns, black singlet with silver side "
            "panels and silver straps, silver wrist tape", "cold silver steel sparks and white spotlights"),
    "ref": ("Lou Varga", None, "referee with short dark parted hair, black-and-white vertically striped referee shirt with black "
            "collar, black slacks", "neutral white spotlights"),
}


def post(prompt, img_b64, aspect, seed):
    body = json.dumps({"prompt": prompt, "input_image": img_b64, "aspect_ratio": aspect, "seed": seed,
                       "output_format": "png", "safety_tolerance": 2}).encode()
    req = urllib.request.Request(f"https://api.bfl.ai/v1/{MODEL}", data=body,
                                 headers={"x-key": KEY, "Content-Type": "application/json", "accept": "application/json"})
    job = json.load(urllib.request.urlopen(req, timeout=60))
    poll = job.get("polling_url") or f"https://api.bfl.ai/v1/get_result?id={job['id']}"
    for _ in range(180):
        time.sleep(2)
        r = json.load(urllib.request.urlopen(urllib.request.Request(poll, headers={"x-key": KEY}), timeout=30))
        if r["status"] == "Ready":
            return urllib.request.urlopen(r["result"]["sample"], timeout=60).read()
        if r["status"] not in ("Pending", "Processing", "Queued"):
            raise RuntimeError(f"bfl status {r['status']}")
    raise TimeoutError("bfl poll")


def fit(raw, w, h):
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def job(cid, kind, seed):
    name, banner, look, mood = LOOK[cid]
    render = (ART / f"render-{cid}.png").read_bytes()
    if kind == "portrait":
        prompt = STYLE + f"Chest-up portrait of {name}: {look}. Confident wrestler expression, dark blurred arena background, {mood} rim light. No text."
        out, size, aspect = ART / f"portrait-{cid}.jpg", (1024, 1024), "1:1"
    else:
        prompt = STYLE + f"Wide cinematic wrestler entrance screen: {name} ({look}) standing on the entrance ramp, {mood} stage, huge clean text \"{banner}\" at the bottom. No other text."
        out, size, aspect = ART / f"entrance-{cid}.jpg", (1920, 1080), "16:9"
    v1 = out.with_name(out.stem + "-v1.jpg")
    if out.exists() and not v1.exists():
        shutil.copy(out, v1)
    raw = post(prompt, base64.b64encode(render).decode(), aspect, seed)
    fit(raw, *size).save(out, quality=90)
    return {"file": out.name, "model": MODEL, "seed": seed, "input": f"render-{cid}.png", "prompt": prompt}


if __name__ == "__main__":
    ids = (sys.argv[1] if len(sys.argv) > 1 else "vex,kane,silas,mae,ref").split(",")
    kinds = (sys.argv[2] if len(sys.argv) > 2 else "portrait,entrance").split(",")
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 64001
    jobs = [(c, k) for c in ids for k in kinds if not (c == "ref" and k == "entrance")]
    log = ART / "CREDITS-cards.json"
    meta = json.loads(log.read_text()) if log.exists() else {}
    with ThreadPoolExecutor(6) as ex:
        futs = {ex.submit(job, c, k, seed + i): (c, k) for i, (c, k) in enumerate(jobs)}
        for f, (c, k) in futs.items():
            try:
                r = f.result(); meta[r["file"]] = r; print("ok", r["file"], "seed", r["seed"])
            except Exception as e:  # report and continue; the run is rerun per id
                print("FAIL", c, k, type(e).__name__, str(e)[:200])
    log.write_text(json.dumps(meta, indent=1))
