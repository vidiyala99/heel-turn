"""BAND room census and cleanup. Run from repo root:

  python -m agents.tools.band_rooms list                      read-only: count, names, created dates, owner
  python -m agents.tools.band_rooms prune --keep 20 --dry-run  what a prune would delete, deletes nothing
  python -m agents.tools.band_rooms prune --keep 20 --yes      delete (needs HEEL_BAND_HUMAN_KEY, a Band *user* key)

Only rooms OWNED by one of our 5 HEEL TURN agents or by a Tom/Jerry test agent are prune candidates, oldest first.
The pooled rooms in agents/.band_rooms.json and every room owned by anyone else (other agents, the human) are never
candidates. Agents cannot delete rooms on BAND (the agent API has no delete); the human API's bulk delete can, which is
why a real prune needs the owner's user key. Keys come from the environment or .env and are never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from agents.transport import POOL_FILE, ROOM_LIMIT, list_rooms  # noqa: E402

AGENTS = ("vex", "kane", "silas", "mae", "lou")
TEST_AGENT = re.compile(r"\b(tom|jerry)\b", re.I)


def load_env() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
        if m and not line.lstrip().startswith("#"):
            os.environ.setdefault(m.group(1), m.group(2).strip('"').strip("'"))


def census() -> list[dict]:
    """Every room any of our agents is in, once, with its owner."""
    from band_rest import RestClient

    ours = {os.environ[f"HEEL_BAND_{a.upper()}_ID"]: a for a in AGENTS}
    rooms: dict[str, dict] = {}
    for a in AGENTS:
        for row in list_rooms(RestClient(api_key=os.environ[f"HEEL_BAND_{a.upper()}_KEY"])):
            owner = next((p for p in row.get("participants") or [] if p.get("role") == "owner"), None)
            rooms[row["id"]] = {
                "id": row["id"], "title": row.get("title") or "", "created": str(row.get("inserted_at"))[:19],
                "owner": (owner or {}).get("name") or "?", "owner_type": (owner or {}).get("type") or "?",
                "ours": bool(owner) and owner.get("id") in ours,
                "test": bool(owner) and str(owner.get("type")) == "Agent" and bool(TEST_AGENT.search(owner.get("name") or "")),
            }
    return sorted(rooms.values(), key=lambda r: r["created"])


def pooled() -> set[str]:
    if not POOL_FILE.exists():
        return set()
    return {r["id"] for r in json.loads(POOL_FILE.read_text()).values()}


def candidates(rooms: list[dict], keep: int) -> tuple[list[dict], list[dict]]:
    pool = pooled()
    ours = [r for r in rooms if (r["ours"] or r["test"]) and r["id"] not in pool]  # oldest first
    cut = max(0, len(ours) - keep)
    return ours[:cut], ours[cut:]


def cmd_list(rooms: list[dict]) -> None:
    owned = sum(r["ours"] for r in rooms)
    print(f"rooms visible to our 5 agents: {len(rooms)}   owned by our agents: {owned}/{ROOM_LIMIT}   "
          f"tom/jerry-owned: {sum(r['test'] for r in rooms)}   other owners: {sum(not (r['ours'] or r['test']) for r in rooms)}")
    by_owner: dict[str, int] = {}
    for r in rooms:
        by_owner[r["owner"]] = by_owner.get(r["owner"], 0) + 1
    print("by owner: " + ", ".join(f"{k}={v}" for k, v in sorted(by_owner.items(), key=lambda kv: -kv[1])))
    for r in rooms:
        tag = "ours" if r["ours"] else "test" if r["test"] else "OTHER"
        print(f"  {r['created']}  {tag:5}  {r['owner'][:22]:22}  {r['title']}")


def cmd_prune(rooms: list[dict], keep: int, dry: bool, yes: bool) -> int:
    drop, kept = candidates(rooms, keep)
    print(f"prune candidates (owned by our agents or tom/jerry, not pooled): {len(drop) + len(kept)}")
    print(f"would delete {len(drop)} oldest, keep newest {len(kept)}; untouched other-owner rooms: "
          f"{sum(not (r['ours'] or r['test']) for r in rooms)}; pooled rooms protected: {len(pooled())}")
    if drop:
        print(f"  oldest to delete: {drop[0]['created']} {drop[0]['title']!r}   newest to delete: "
              f"{drop[-1]['created']} {drop[-1]['title']!r}")
    for r in drop:
        print(f"  DELETE {r['created']}  {r['owner'][:22]:22}  {r['title']}")
    if dry:
        print("dry run: nothing deleted")
        return 0
    if not yes:
        print("refusing: pass --yes to delete (and --dry-run first)")
        return 2
    key = os.environ.get("HEEL_BAND_HUMAN_KEY")
    if not key:
        print("refusing: agents cannot delete BAND rooms; set HEEL_BAND_HUMAN_KEY (the account owner's user API key)")
        return 2
    from band_rest import RestClient

    client = RestClient(api_key=key)
    ids = [r["id"] for r in drop]
    for i in range(0, len(ids), 100):  # bulk delete takes up to 100 ids per job
        job = client.human_api_bulk_deletions.bulk_delete_my_chats(ids=ids[i:i + 100])
        print(f"bulk delete job {getattr(getattr(job, 'data', job), 'id', '?')} accepted for {len(ids[i:i + 100])} rooms")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    pr = sub.add_parser("prune")
    pr.add_argument("--keep", type=int, required=True)
    pr.add_argument("--dry-run", action="store_true")
    pr.add_argument("--yes", action="store_true")
    a = ap.parse_args(argv)
    load_env()
    rooms = census()
    if a.cmd == "list":
        cmd_list(rooms)
        return 0
    return cmd_prune(rooms, a.keep, a.dry_run, a.yes)


if __name__ == "__main__":
    sys.exit(main())
