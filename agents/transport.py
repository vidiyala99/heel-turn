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
import os
import re
import time
from dataclasses import dataclass, field


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

    def participants(self, room: str) -> list[str]:
        return list(self.rooms[room]["members"])

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

        resp = self._client(owner).agent_api_chats.create_agent_chat(chat=ChatRoomRequest(title=title), request_options=self._opts())
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

    def add_participant(self, room: str, actor: str, participant: str) -> None:
        from band_rest import ParticipantRequest

        self._client(actor).agent_api_participants.add_agent_chat_participant(
            room, participant=ParticipantRequest(participant_id=self.ids[participant]), request_options=self._opts())
        self.rooms[room]["members"].append(participant)
        self._log(f"band_add_participant room={room}({self.rooms[room]['title']}) by={actor} add={participant}")

    def participants(self, room: str) -> list[str]:
        return list(self.rooms[room]["members"])

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
        return Message(_dig_id(resp) or "?", room, sender, text, list(mentions))

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
                out.append(Message(getattr(m, "id", "?"), room, judge, getattr(m, "content", ""), [proposer]))
        return out


def _env(pid: str, suffix: str) -> str | None:
    return os.environ.get(f"HEEL_BAND_{pid.upper()}_{suffix}")


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


def make_transport(cast: dict[str, str]):
    mode = os.environ.get("HEEL_BAND_MODE", "mock").lower()
    return LiveBand(cast) if mode == "live" else MockBand(cast)
