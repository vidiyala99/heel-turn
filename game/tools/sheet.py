"""Tile images side by side: python game/tools/sheet.py out.png a.png b.png ... [--rows N]"""
import sys
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith("--rows")]
rows = next((int(a.split("=")[1]) for a in sys.argv[1:] if a.startswith("--rows=")), 1)
out, paths = args[0], args[1:]
ims = [Image.open(p).convert("RGB") for p in paths]
h = max(i.height for i in ims)
ims = [i.resize((int(i.width * h / i.height), h)) for i in ims]
cols = -(-len(ims) // rows)
w = max(sum(i.width for i in ims[r * cols:(r + 1) * cols]) for r in range(rows))
sheet = Image.new("RGB", (w, h * rows), (7, 8, 11))
for r in range(rows):
    x = 0
    for i in ims[r * cols:(r + 1) * cols]:
        sheet.paste(i, (x, r * h)); x += i.width
sheet.save(out)
print("wrote", out, sheet.size)
