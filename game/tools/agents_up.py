"""Start the agents server for the game: python game/tools/agents_up.py  (run from anywhere)

Loads the repo .env (values never printed), serves on HEEL_AGENTS_PORT (default 8788: voice owns 8787), reads the live
Bruin marts, and tries HEEL_BAND_MODE=live first. HEEL_BAND_COMMISSIONER_ID is looked up from
HEEL_BAND_COMMISSIONER_HANDLE through BAND peers when unset. If live BAND cannot start, the exact error is printed and
the server falls back to mock BAND so the game keeps its brains.
"""
import os
import sys
import traceback
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
os.environ.setdefault("HEEL_AGENTS_PORT", "8788")
os.environ.setdefault("HEEL_BAND_MODE", "live")
os.environ.setdefault("HEEL_BRUIN_DUCKDB", str(ROOT / "bruin" / "data" / "heel_turn.duckdb"))


def resolve_commissioner():
    if os.environ.get("HEEL_BAND_COMMISSIONER_ID") or not os.environ.get("HEEL_BAND_COMMISSIONER_HANDLE"):
        return
    from band_rest import RestClient
    want = os.environ["HEEL_BAND_COMMISSIONER_HANDLE"].lstrip("@").lower()
    peers = RestClient(api_key=os.environ["HEEL_BAND_LOU_KEY"]).agent_api_peers.list_agent_peers()
    for p in getattr(peers, "data", peers):
        if (p.handle or "").lstrip("@").lower() == want:
            os.environ["HEEL_BAND_COMMISSIONER_ID"] = p.id
            print(f"[agents] commissioner @{want} resolved via BAND peers")
            return
    raise RuntimeError(f"commissioner handle @{want} not among Lou's BAND peers")


if os.environ["HEEL_BAND_MODE"] == "live":
    try:
        resolve_commissioner()
        import agents.server.__main__  # noqa: F401  (builds the Director at import; live BAND connects here)
    except SystemExit:
        raise
    except Exception as e:
        print(f"[agents] LIVE BAND FAILED: {type(e).__name__}: {e}")
        traceback.print_exc()
        print("[agents] falling back to HEEL_BAND_MODE=mock")
        os.environ["HEEL_BAND_MODE"] = "mock"
        for m in [m for m in sys.modules if m.startswith("agents")]:
            del sys.modules[m]

import runpy  # noqa: E402

print(f"[agents] band={os.environ['HEEL_BAND_MODE']} port={os.environ['HEEL_AGENTS_PORT']} "
      f"planner={'openai' if os.environ.get('OPENAI_API_KEY') else 'fallback'}")
runpy.run_module("agents.server", run_name="__main__")
