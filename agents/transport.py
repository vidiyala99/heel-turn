"""BAND transport: the only place that talks to band.ai.

HEEL_BAND_MODE=mock (default): in-process rooms with BAND's delivery rules.
HEEL_BAND_MODE=live: band-sdk REST client (band_rest), one client per agent key.

Delivery rules the mock enforces (from band.ai/hacker-guide "Mentions"):
- only participants of a room see anything in it (private locker rooms);
- an AGENT receives a message only if it is @mentioned (or sent it);
- a HUMAN participant (the commissioner) sees every message in rooms they are in.
Every call is appended to `console` so the demo can print a BAND console.
"""
from __future__ import annotations

import itertools
import json
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

ROOM_LIMIT = 250  # BAND max_chat_rooms per account (403 limit_reached at 250/250)
POOL_FILE = Path(__file__).parent / ".band_rooms.json"


class BandRoomLimit(RuntimeError):
    """BAND refused to create a room: the account hit max_chat_rooms."""

    reason = "BAND: room limit"


def _is_room_limit(err: Exception) -> bool:
    text = f"{err} {getattr(err, 'body', '')}"
    return "limit_reached" in text or "room limit" in text.lower()


@dataclass
class Message:
    id: str
    room: str
    sender: str
    text: str
    mentions: list[str]
    t: float = field(default_factory=time.time)


class MockBand:
    mode = "mock"

    def __init__(self, cast: dict[str, str]):
        """cast: participant id -> 'agent' | 'human'."""
        self.cast = dict(cast)
        self.rooms: dict[str, dict] = {}
        self.messages: list[Message] = []
        self.console: list[str] = []
        self._ids = itertools.count(1)

    def _log(self, line: str) -> None:
        self.console.append(line)

    # --- BAND platform tools -------------------------------------------------------
    def create_room(self, owner: str, title: str) -> str:
        rid = f"room-{next(self._ids)}"
        self.rooms[rid] = {"title": title, "owner": owner, "members": [owner]}
        self._log(f"band_create_chatroom by={owner} title={title!r} -> {rid}")
        return rid

    def lookup_peers(self, actor: str) -> list[dict]:
        peers = [{"id": p, "handle": p, "name": p, "type": k} for p, k in self.cast.items() if p != actor and k == "agent"]
        self._log(f"band_lookup_peers by={actor} -> {[p['id'] for p in peers]}")
        return peers

    def add_participant(self, room: str, actor: str, participant: str) -> None:
        r = self.rooms[room]
        if actor not in r["members"]:
            raise PermissionError(f"{actor} is not in {room}")
        if participant not in self.cast:
            raise KeyError(participant)
        if participant not in r["members"]:
            r["members"].append(participant)
        self._log(f"band_add_participant room={room}({r['title']}) by={actor} add={participant}")

    def remove_participant(self, room: str, actor: str, participant: str) -> None:
        r = self.rooms[room]
        if actor != r["owner"]:
            raise PermissionError(f"{actor} does not own {room}")
        if participant in r["members"]:
            r["members"].remove(participant)
        self._log(f"band_remove_participant room={room}({r['title']}) by={actor} remove={participant}")

    def participants(self, room: str) -> list[str]:
        return list(self.rooms[room]["members"])

    def room_usage(self) -> int:
        return len(self.rooms)

    def send(self, room: str, sender: str, text: str, mentions: list[str]) -> Message:
        r = self.rooms[room]
        if sender not in r["members"]:
            raise PermissionError(f"{sender} is not in {room}")
        if not mentions:
            raise ValueError("BAND messages require at least one @mention")
        bad = [m for m in mentions if m not in r["members"]]
        if bad:
            raise PermissionError(f"cannot mention non-members {bad} in {room}")
        msg = Message(f"msg-{next(self._ids)}", room, sender, text, list(mentions))
        self.messages.append(msg)
        self._log(f"band_send_message room={room}({r['title']}) from={sender} @{','.join(mentions)}: {text}")
        return msg

    def inbox(self, viewer: str, room: str | None = None) -> list[Message]:
        """What `viewer` actually receives (the mention-scoped boundary)."""
        out = []
        for m in self.messages:
            if room and m.room != room:
                continue
            members = self.rooms[m.room]["members"]
            if viewer not in members:
                continue
            if self.cast.get(viewer) == "human" or viewer == m.sender or viewer in m.mentions:
                out.append(m)
        return out

    def verdicts(self, room: str, judge: str, proposer: str) -> list[Message]:
        """Messages the judge (commissioner) addressed to the proposer in `room`."""
        return [m for m in self.messages if m.room == room and m.sender == judge and proposer in m.mentions]


class LiveBand:
    """band.ai via band_rest (installed with `pip install band-sdk`).

    Env per participant id X (upper-cased): HEEL_BAND_X_ID, HEEL_BAND_X_KEY (agents), HEEL_BAND_X_HANDLE (optional,
    else looked up via /peers). Commissioner: HEEL_BAND_COMMISSIONER_ID and HEEL_BAND_COMMISSIONER_HANDLE (a human user).
    The commissioner's approve/block is typed by the human in the Band app, mentioning the proposer.
    """

    mode = "live"

    def __init__(self, cast: dict[str, str]):
        from band_rest import RestClient  # noqa: F401  (fail fast if band-sdk missing)

        self.cast = dict(cast)
        self.console: list[str] = []
        self.rooms: dict[str, dict] = {}
        self._clients: dict[str, object] = {}
        self.ids = {p: _env(p, "ID") for p in cast}
        self.handles = {p: os.environ.get(f"HEEL_BAND_{p.upper()}_HANDLE") for p in cast}
        missing = [f"HEEL_BAND_{p.upper()}_{s}" for p, k in cast.items() for s in (("ID", "KEY") if k == "agent" else ("ID",))
                   if not os.environ.get(f"HEEL_BAND_{p.upper()}_{s}")]
        if missing:
            raise RuntimeError("live BAND needs env: " + ", ".join(missing))

    def _client(self, actor: str):
        from band_rest import RestClient

        if actor not in self._clients:
            self._clients[actor] = RestClient(api_key=_env(actor, "KEY"))
        return self._clients[actor]

    def _opts(self):
        return {"max_retries": 3}

    def _log(self, line: str) -> None:
        self.console.append(line)

    def create_room(self, owner: str, title: str) -> str:
        from band_rest import ChatRoomRequest

        try:
            resp = self._client(owner).agent_api_chats.create_agent_chat(chat=ChatRoomRequest(title=title),
                                                                         request_options=self._opts())
        except Exception as e:
            if _is_room_limit(e):
                raise BandRoomLimit(f"BAND refused room {title!r}: max_chat_rooms reached") from e
            raise
        rid = _dig_id(resp)
        self.rooms[rid] = {"title": title, "owner": owner, "members": [owner]}
        self._log(f"band_create_chatroom by={owner} title={title!r} -> {rid}")
        return rid

    def lookup_peers(self, actor: str) -> list[dict]:
        resp = self._client(actor).agent_api_peers.list_agent_peers(request_options=self._opts())
        data = getattr(resp, "data", resp) or []
        peers = []
        for p in data:
            pid = next((k for k, v in self.ids.items() if v == p.id), p.id)
            if pid in self.handles and not self.handles[pid]:
                self.handles[pid] = p.handle
            peers.append({"id": pid, "handle": p.handle, "name": p.name, "type": str(p.type)})
        self._log(f"band_lookup_peers by={actor} -> {[p['id'] for p in peers]}")
        return peers

    def sync_room(self, room: str, owner: str, title: str) -> None:
        """Adopt an existing room (from the pool file): read its roster so adds and removes stay idempotent."""
        resp = self._client(owner).agent_api_participants.list_agent_chat_participants(room, request_options=self._opts())
        by_id = {v: k for k, v in self.ids.items()}
        members = [by_id[p.id] for p in (getattr(resp, "data", None) or []) if p.id in by_id]
        self.rooms[room] = {"title": title, "owner": owner, "members": members or [owner]}

    def add_participant(self, room: str, actor: str, participant: str) -> None:
        from band_rest import ParticipantRequest

        if participant in self.rooms[room]["members"]:
            return
        self._client(actor).agent_api_participants.add_agent_chat_participant(
            room, participant=ParticipantRequest(participant_id=self.ids[participant]), request_options=self._opts())
        self.rooms[room]["members"].append(participant)
        self._log(f"band_add_participant room={room}({self.rooms[room]['title']}) by={actor} add={participant}")

    def remove_participant(self, room: str, actor: str, participant: str) -> None:
        self._client(actor).agent_api_participants.remove_agent_chat_participant(
            room, self.ids[participant], request_options=self._opts())
        if participant in self.rooms[room]["members"]:
            self.rooms[room]["members"].remove(participant)
        self._log(f"band_remove_participant room={room}({self.rooms[room]['title']}) by={actor} remove={participant}")

    def participants(self, room: str) -> list[str]:
        return list(self.rooms[room]["members"])

    def room_usage(self) -> int:
        """Distinct rooms our agents own (the rooms that count against the account's max_chat_rooms)."""
        owned = set()
        for pid, kind in self.cast.items():
            if kind != "agent":
                continue
            for row in list_rooms(self._client(pid)):
                if any(p.get("id") == self.ids[pid] and p.get("role") == "owner" for p in row.get("participants") or []):
                    owned.add(row["id"])
        return len(owned)

    def send(self, room: str, sender: str, text: str, mentions: list[str]) -> Message:
        from band_rest import ChatMessageRequest, ChatMessageRequestMentionsItem

        items, prefix = [], []
        for m in mentions:
            h = self.handles.get(m) or m
            items.append(ChatMessageRequestMentionsItem(id=self.ids[m], handle=h, name=m))
            prefix.append(f"@{h}")
        content = " ".join(prefix) + " " + text
        resp = self._client(sender).agent_api_messages.create_agent_chat_message(
            room, message=ChatMessageRequest(content=content, mentions=items), request_options={"max_retries": 0})
        self._log(f"band_send_message room={room}({self.rooms[room]['title']}) from={sender} @{','.join(mentions)}: {text}")
        return Message(_dig_id(resp) or "?", room, sender, text, list(mentions), _ts(_dig(resp, "data", "inserted_at")))

    def inbox(self, viewer: str, room: str | None = None) -> list[Message]:
        raise NotImplementedError("live inbox: open the Band app console")

    def verdicts(self, room: str, judge: str, proposer: str) -> list[Message]:
        """Read the proposer's room messages and keep the ones the commissioner sent."""
        resp = self._client(proposer).agent_api_messages.list_agent_messages(room, status="all", request_options=self._opts())
        data = getattr(resp, "data", None) or []
        judge_id = self.ids[judge]
        out = []
        for m in data:
            sender = getattr(m, "sender_id", None) or getattr(getattr(m, "sender", None), "id", None)
            if sender == judge_id:
                out.append(Message(getattr(m, "id", "?"), room, judge, getattr(m, "content", ""), [proposer],
                                   _ts(getattr(m, "inserted_at", None))))
        return out


def _env(pid: str, suffix: str) -> str | None:
    return os.environ.get(f"HEEL_BAND_{pid.upper()}_{suffix}")


def _dig(resp, *path):
    cur = resp
    for k in path:
        cur = cur.get(k) if isinstance(cur, dict) else getattr(cur, k, None)
    return cur


def _ts(value) -> float:
    """Server timestamp -> epoch seconds (verdicts are compared on the server's clock, not ours)."""
    if isinstance(value, datetime):
        return value.timestamp()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            pass
    return time.time()


def list_rooms(client, page_size: int = 100) -> list[dict]:
    """Every room an agent is in, with its roster (band_rest list_agent_chats, all pages)."""
    rows, page = [], 1
    while True:
        resp = client.agent_api_chats.list_agent_chats(page=page, page_size=page_size, include="participants")
        d = resp.model_dump() if hasattr(resp, "model_dump") else resp
        rows += d.get("data") or []
        meta = d.get("metadata") or {}
        if page >= (meta.get("total_pages") or 1):
            return rows
        page += 1


def _dig_id(resp) -> str:
    for path in (("data", "id"), ("id",)):
        cur = resp
        for k in path:
            cur = getattr(cur, k, None) if not isinstance(cur, dict) else cur.get(k)
        if cur:
            return str(cur)
    return ""


VERDICT_RE = re.compile(r"\b(approve|approved|block|blocked|veto)\b", re.I)


def parse_verdict(text: str) -> str | None:
    m = VERDICT_RE.search(text or "")
    if not m:
        return None
    return "approve" if m.group(1).lower().startswith("approv") else "block"


class RoomPool:
    """A fixed set of BAND rooms, one per purpose, created once and reused by every match.

    Matches are told apart by a [match] tag in message text, not by new rooms, so playing never walks the account
    into the 250-room cap. Live mode persists {purpose: {id, owner, title}} in agents/.band_rooms.json (gitignored).
    """

    def __init__(self, band, path: Path | None):
        self.band = band
        self.path = path
        self.rooms: dict[str, dict] = {}
        if path and path.exists():
            for purpose, r in json.loads(path.read_text()).items():
                try:
                    band.sync_room(r["id"], r["owner"], r["title"])
                except Exception as e:  # deleted or unreadable room: recreate it on first use
                    band.console.append(f"pool: dropped {purpose} ({type(e).__name__})")
                    continue
                self.rooms[purpose] = r

    def get(self, purpose: str, owner: str) -> str:
        if purpose not in self.rooms:
            title = f"HEEL TURN {purpose}"
            self.rooms[purpose] = {"id": self.band.create_room(owner, title), "owner": owner, "title": title}
            if self.path:
                self.path.write_text(json.dumps(self.rooms, indent=2))
        return self.rooms[purpose]["id"]

    def reset(self, baseline: dict[str, set[str]]) -> None:
        """Between matches: remove everyone the last match added, so the next entrants are real adds again."""
        for purpose, r in self.rooms.items():
            keep = baseline.get(purpose, set()) | {r["owner"]}
            for m in self.band.participants(r["id"]):
                if m not in keep:
                    self.band.remove_participant(r["id"], r["owner"], m)


def make_pool(band) -> RoomPool:
    return RoomPool(band, POOL_FILE if band.mode == "live" else None)


def make_transport(cast: dict[str, str]):
    mode = os.environ.get("HEEL_BAND_MODE", "mock").lower()
    return LiveBand(cast) if mode == "live" else MockBand(cast)
