"""Start the promo server for the game: python game/tools/promo_up.py  (run from anywhere)

Loads the repo .env (values never printed), reads the live Bruin marts (HEEL_BRUIN_DUCKDB, like agents_up.py), and
serves agents.promo on HEEL_PROMO_PORT (default 8789).
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

env = ROOT / ".env"
if env.exists():
    for line in env.read_text(encoding="utf8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
os.environ.setdefault("HEEL_BRUIN_DUCKDB", str(ROOT / "bruin" / "data" / "heel_turn.duckdb"))

from agents.promo.__main__ import main  # noqa: E402  (after env, so Promos() sees the key and the marts)

main()
