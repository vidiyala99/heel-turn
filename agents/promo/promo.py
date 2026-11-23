"""Wrestling promos written live by each wrestler agent from its Bruin memory.

promo(req) -> {"lines": [{"speaker", "text", "cites"}], "meta": {...}}
req = {"moment": "pre"|"mid"|"post", "speaker": id, "opponent": id, "match_state": {...}}
  pre : speaker then opponent, 2-3 lines each, calling each other out.
  mid : one short line from speaker (match_state.event: "opponent_down" | "near_fall").
  post: speaker is the winner, opponent the loser (match_state.winner overrides). Winner gloats or is gracious per
        gimmick, loser makes excuses and vows revenge. 2 lines each.
match_state (all optional): {"players": {wrestler_id: human_player_id}, "names": {id: display name}, "event": str,
  "winner": id, "match": "m13", "finish": "pin"|"toss"|...}

Every line's cites are ids of memory rows the speaker was shown (agents.memory.cite). The OpenAI writer is validated
(speakers, lengths, cites subset) and falls back to gimmick templates on timeout, bad JSON or a bad cite.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from agents import memory as mem

PERSONAS_FILE = Path(__file__).resolve().parent.parent / "personalities.json"
MOMENTS = ("pre", "mid", "post")
# words per line, lines per speaker
LIMITS = {"pre": (22, 3), "mid": (12, 1), "post": (22, 2)}
MAX_CHARS = 150


def load_personas() -> dict[str, dict]:
    data = json.loads(PERSONAS_FILE.read_text())
    out = {w["id"]: w for w in data["wrestlers"]}
    out[data["referee"]["id"]] = data["referee"]
    return out


# --- memory -> facts ---------------------------------------------------------------------
def facts_for(memory: mem.Memory, speaker: str, opponent: str, state: dict) -> list[dict]:
    """Memory rows the speaker can use against this opponent, each with a cite and a plain-English `fact`.

    Ordered most-quotable first: grudges, the opponent's habits, the ref ledger, records, tag-partner trust.
    """
    names = state.get("names") or {}
    players = state.get("players") or {}
    opp_name = names.get(opponent) or PERSONAS.get(opponent, {}).get("name") or opponent
    out: list[dict] = []

    rel = memory.relation(speaker, opponent)
    if rel and (float(rel["grudge"]) >= 0.3 or rel.get("last_betrayal")):
        f = f"grudge {float(rel['grudge']):.1f}, trust {float(rel['trust']):.1f} toward {opp_name}"
        if rel.get("last_betrayal"):
            f += f"; remembers {rel['last_betrayal']}"
        out.append({"cite": mem.cite("relationships", rel), "kind": "grudge", "fact": f, "row": rel})
    elif rel:
        out.append({"cite": mem.cite("relationships", rel), "kind": "respect",
                    "fact": f"trusts {opp_name} {float(rel['trust']):.1f}, no grudge", "row": rel})
    back = memory.relation(opponent, speaker)
    if back and back.get("last_betrayal"):
        out.append({"cite": mem.cite("relationships", back), "kind": "their_grudge",
                    "fact": f"{opp_name} still holds a grudge over {back['last_betrayal']}", "row": back})

    for who in dict.fromkeys([players.get(opponent), opponent]):
        if not who:
            continue
        for r in sorted(memory.habits_of(who), key=lambda r: -int(r["n"]))[:2]:
            out.append({"cite": mem.cite("habits", r), "kind": "habit", "row": r,
                        "fact": f"{opp_name} picked {r['move']} {r['n']} times when {r['situation'].replace('_', ' ')} "
                                f"({float(r['share']):.0%})"})

    for r in memory.ref_ledger("lou"):
        if r["bribe_from"] == opponent and r["accepted"]:
            how = "and got caught" if r["caught"] else "and nobody caught it"
            out.append({"cite": mem.cite("ref_ledger", r), "kind": "bribe", "row": r,
                        "fact": f"{opp_name} paid referee Lou in {r['match']}, {how}"})

    board = {r["wrestler"]: r for r in memory.tables["leaderboard"]}
    for who, kind in ((speaker, "my_record"), (opponent, "their_record")):
        r = board.get(who)
        if r:
            nm = "me" if who == speaker else opp_name
            out.append({"cite": mem.cite("leaderboard", r), "kind": kind, "row": r,
                        "fact": f"{nm}: {r['wins']} wins, {r['eliminations']} eliminations, {r['betrayals']} betrayals"})

    for r in memory.tables["partner_trust"]:
        if r["a"] == speaker:
            out.append({"cite": mem.cite("partner_trust", r), "kind": "partner", "row": r,
                        "fact": f"my tag partner {r['b']} at trust {float(r['trust']):.2f}: {r['last_event']}"})
    return out


# --- template fallback ---------------------------------------------------------------------
SITUATION = {"opening": "in the opening", "after_block": "right after a block", "low_stamina": "when you're gassed",
             "cornered": "when you're cornered"}
MOVE = {"strike": "threw the same strike", "grapple": "reached for the same grapple", "block": "turtled up behind a block"}


def retell(event: str, me: str, you: str) -> tuple[str, str]:
    """'m9: silas low-blowed mae behind lou' told by mae to silas -> ('M9', 'you low-blowed me behind Lou')."""
    match, _, what = event.partition(": ")
    words = []
    for i, w in enumerate(what.split()):
        base, poss = (w[:-2], True) if w.endswith("'s") else (w, False)
        if base == me:
            w = "my" if poss else ("I" if i == 0 else "me")
        elif base == you:
            w = "your" if poss else "you"
        elif base in PERSONAS:
            w = base.capitalize() + ("'s" if poss else "")
        words.append(w)
    return match.upper(), " ".join(words)


def jab(f: dict, me_id: str, opp_id: str, opp: str) -> str:
    """One quotable sentence from a fact, addressed to the opponent."""
    r = f["row"]
    k = f["kind"]
    if k == "grudge":
        if r.get("last_betrayal"):
            match, what = retell(r["last_betrayal"], me_id, opp_id)
            return f"{match}, {opp}. {what[0].upper() + what[1:]}. I wrote it down."
        return f"I've got a score to settle with you, {opp}."
    if k == "respect":
        return f"I trust you more than most, {opp}. That ends at the bell."
    if k == "their_grudge":
        match, what = retell(r["last_betrayal"], me_id, opp_id)
        return f"Still crying about {match}, {opp}? {what[0].upper() + what[1:]}. I'd do it again."
    if k == "habit":
        return (f"You {MOVE.get(r['move'], r['move'])} {r['n']} times "
                f"{SITUATION.get(r['situation'], r['situation'].replace('_', ' '))}, {opp}. I noticed.")
    if k == "bribe":
        tail = "and Lou got caught holding the envelope" if r["caught"] else "and you think nobody saw"
        return f"You paid off the ref in {r['match']}, {opp}, {tail}."
    if k == "my_record":
        return f"{r['wins']} wins. {r['eliminations']} bodies over the top rope. Look it up."
    if k == "their_record":
        return f"{r['wins']} wins, {opp}? I've seen better records in a pawn shop."
    if k == "partner":
        return f"Even my partner {r['b']} knows: {r['last_event']}."
    return f["fact"]


# Gimmick voice per moment. {opp} = opponent name, {me} = own name. "win"/"lose" are post-match roles.
TEMPLATES = {
    "showboat": {
        "pre": ["Cameras on ME, people! {opp}, you're the warm-up act.", "Tonight the highlight reel has one name on it."],
        "mid": ["Stay down, {opp}, you're blocking my shot!", "Did everyone see that? SAY you saw that!"],
        "win": ["Told you. Poster. Mine.", "Somebody get {opp} a mirror so they can see what losing looks like."],
        "lose": ["The lighting was wrong and the ref blinked.", "Enjoy it, {opp}. The rematch is MY show."],
    },
    "brute": {
        "pre": ["{opp}. Ring. Tonight.", "You walk in. You get carried out."],
        "mid": ["Get. Up.", "Stay down, {opp}."],
        "win": ["Told you. Carried out.", "Good fight, {opp}. Still lost."],
        "lose": ["Lucky. Once.", "I'm coming back for you, {opp}."],
    },
    "schemer": {
        "pre": ["{opp}, friend, everyone has a price. I already know yours.", "Shake my hand tonight. Watch your back after."],
        "mid": ["Comfortable down there, {opp}? Stay. It's cheaper.", "Two and a half, {opp}. Next time I pay for three."],
        "win": ["Honor was never on the table, {opp}.", "Plans beat muscle. Every time."],
        "lose": ["A setback is just a down payment, {opp}.", "Enjoy the win. I'm already negotiating the next one."],
    },
    "veteran": {
        "pre": ["Seen every trick twice, {opp}. Yours three times.", "Bring your best. I already watched the tape."],
        "mid": ["Seen that one before, kid.", "Breathe, {opp}. It gets worse."],
        "win": ["Good effort, {opp}. Study harder.", "Lesson's over. Same time next week."],
        "lose": ["You earned that one, {opp}. Don't get used to it.", "I'll be watching the tape tonight. All of it."],
    },
}
DEFAULT_GIMMICK = "brute"


def _pick(options: list, seed: str) -> str:
    return options[int(hashlib.sha1(seed.encode()).hexdigest(), 16) % len(options)]


def _name(pid: str, state: dict) -> str:
    return (state.get("names") or {}).get(pid) or PERSONAS.get(pid, {}).get("name") or pid


def _short(pid: str, state: dict) -> str:
    """What wrestlers call each other on the mic: Mae, Kane, Silas, Vex."""
    return (state.get("names") or {}).get(pid) or (pid.capitalize() if pid in PERSONAS else pid)


def template_lines(speaker: str, opponent: str, role: str, facts: list[dict], state: dict, n: int, seed: str) -> list[dict]:
    """n lines for one speaker: gimmick opener, then memory jabs (cited), gimmick closer."""
    g = TEMPLATES.get(PERSONAS.get(speaker, {}).get("gimmick"), TEMPLATES[DEFAULT_GIMMICK])[role]
    opp, me = _short(opponent, state), _short(speaker, state)
    fmt = lambda s: s.format(opp=opp, me=me)
    if role == "mid":
        f = next((f for f in facts if f["kind"] in ("habit", "grudge", "bribe")), None)
        if f and f["kind"] == "habit":
            r = f["row"]
            return [{"speaker": speaker, "text": f"{r['n']} {r['move']}s and you're on your back, {opp}.", "cites": [f["cite"]]}]
        return [{"speaker": speaker, "text": fmt(_pick(g, seed)), "cites": [f["cite"]] if f else []}]
    prefer = {"pre": ("grudge", "habit", "bribe", "their_grudge", "their_record", "respect", "my_record"),
              "win": ("grudge", "their_record", "habit", "my_record", "respect"),
              "lose": ("bribe", "habit", "grudge", "their_grudge", "partner", "my_record")}[role]
    ranked = sorted(facts, key=lambda f: prefer.index(f["kind"]) if f["kind"] in prefer else 99)
    ranked = [f for f in ranked if f["kind"] in prefer]
    lines = [{"speaker": speaker, "text": fmt(g[0]), "cites": []}]
    for f in ranked[: max(0, n - 2) or 1]:
        lines.append({"speaker": speaker, "text": jab(f, speaker, opponent, opp), "cites": [f["cite"]]})
    if len(lines) < n:
        lines.append({"speaker": speaker, "text": fmt(g[1]), "cites": []})
    return lines[:n]


# --- request shape -------------------------------------------------------------------------
def segments(req: dict) -> list[tuple[str, str, str, int]]:
    """[(speaker, opponent, role, n_lines)] in broadcast order."""
    moment, a, b = req["moment"], req["speaker"], req["opponent"]
    if moment not in MOMENTS:
        raise ValueError(f"moment must be one of {MOMENTS}")
    state = req.get("match_state") or {}
    if moment == "mid":
        return [(a, b, "mid", 1)]
    if moment == "pre":
        n = LIMITS["pre"][1]
        return [(a, b, "pre", n), (b, a, "pre", n)]
    winner = state.get("winner") or a
    loser = b if winner == a else a
    return [(winner, loser, "win", 2), (loser, winner, "lose", 2)]


# --- OpenAI writer -------------------------------------------------------------------------
ROLE_BRIEF = {
    "pre": "pre-match promo: call out the opponent by name, hype yourself",
    "mid": "mid-match trash talk, ONE short line, opponent is down or just kicked out",
    "win": "post-match promo as the WINNER: gloat if a heel or showboat, gracious-but-proud if a face",
    "lose": "post-match promo as the LOSER: make an excuse and vow revenge",
}


class Writer:
    def __init__(self):
        self.key = os.environ.get("OPENAI_API_KEY")
        self.model = os.environ.get("HEEL_PROMO_MODEL") or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        self.timeout = float(os.environ.get("HEEL_LLM_TIMEOUT_S", "2.5"))
        self.base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")

    @property
    def mode(self) -> str:
        return "openai" if self.key else "fallback"

    def write(self, seg, facts: list[dict], state: dict, moment: str) -> list[dict]:
        """One speaker's lines (one call per speaker so both speakers of a promo run in parallel inside the budget)."""
        sp, opp, role, n = seg
        p = PERSONAS.get(sp, {})
        words = LIMITS[moment][0]
        sys = (f"You are {_name(sp, state)}, a pro wrestler in the original game HEEL TURN, cutting a live TV promo. "
               f"Gimmick: {p.get('gimmick', 'wrestler')} ({p.get('side', '?')}). Voice: {p.get('voice', '')} "
               f"Task: {ROLE_BRIEF[role]}. Opponent: {_short(opp, state)}. "
               "Quote at least one concrete number or event from your memory list (the first items are the juiciest), "
               "talk TO the opponent, stay in character. "
               f"Exactly {n} line(s), each <= {words} words, punchy, PG-13, no hashtags, no stage directions. "
               'Reply JSON only: {"lines": [{"text": str, "cites": [cite ids from your memory that the line uses]}]}')
        user = json.dumps({"match": {k: state.get(k) for k in ("match", "finish", "event") if state.get(k)},
                           "memory": [{"cite": f["cite"], "fact": f["fact"]} for f in facts]})
        body = json.dumps({"model": self.model, "response_format": {"type": "json_object"}, "temperature": 0.9,
                           "max_tokens": 50 * n + 40,
                           "messages": [{"role": "system", "content": sys}, {"role": "user", "content": user}]}).encode()
        req = urllib.request.Request(f"{self.base}/chat/completions", data=body, method="POST",
                                     headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            out = json.loads(json.loads(r.read())["choices"][0]["message"]["content"])
        lines = [dict(l, speaker=sp) for l in out.get("lines") or [] if isinstance(l, dict)]
        return validate(lines, [seg], {sp: facts}, words)


def clip(text: str, words: int) -> str:
    w = " ".join(str(text).split()).strip('"')
    parts = w.split(" ")
    if len(parts) > words:
        w = " ".join(parts[:words]).rstrip(",;:") + "..."
    return w[:MAX_CHARS]


def validate(lines, segs, facts_by_speaker: dict, words: int) -> list[dict]:
    """Keep LLM lines only if each speaker got its line count and cited at least one real row of its own memory."""
    if not isinstance(lines, list):
        raise ValueError("lines is not a list")
    out = []
    for sp, _opp, _role, n in segs:
        allowed = {f["cite"] for f in facts_by_speaker[sp]}
        mine = [l for l in lines if isinstance(l, dict) and l.get("speaker") == sp and str(l.get("text", "")).strip()][:n]
        if len(mine) < n:
            raise ValueError(f"{sp}: {len(mine)}/{n} lines")
        cleaned = [{"speaker": sp, "text": clip(l["text"], words),
                    "cites": [c for c in (l.get("cites") or []) if c in allowed]} for l in mine]
        if allowed and not any(l["cites"] for l in cleaned):
            raise ValueError(f"{sp}: no valid cite (got {[l.get('cites') for l in mine]})")
        out += cleaned
    return out


# --- entry -----------------------------------------------------------------------------------
PERSONAS = load_personas()


class Promos:
    def __init__(self, memory: mem.Memory | None = None, writer: Writer | None = None):
        self.memory = memory or mem.Memory()
        self.writer = writer or Writer()

    def promo(self, req: dict) -> dict:
        t0 = time.perf_counter()
        state = req.get("match_state") or {}
        segs = segments(req)
        facts = {sp: facts_for(self.memory, sp, opp, state) for sp, opp, _r, _n in segs}
        seed = f"{req['moment']}|{req['speaker']}|{req['opponent']}|{state.get('match', '')}|{state.get('seed', '')}"

        def one(seg) -> tuple[list[dict], str, str | None]:
            sp, opp, role, n = seg
            err = None
            if self.writer.key:
                try:
                    return self.writer.write(seg, facts[sp], state, req["moment"]), "openai", None
                except Exception as e:
                    err = f"{sp}: {type(e).__name__}: {str(e)[:160]}"
            return template_lines(sp, opp, role, facts[sp], state, n, seed + sp), "fallback", err

        with ThreadPoolExecutor(max_workers=len(segs)) as pool:
            results = list(pool.map(one, segs))
        lines = [l for ls, _s, _e in results for l in ls]
        sources = {s for _l, s, _e in results}
        meta = {"moment": req["moment"], "source": sources.pop() if len(sources) == 1 else "mixed",
                "memory": self.memory.source, "model": self.writer.model if self.writer.key else None}
        errors = [e for _l, _s, e in results if e]
        if errors:
            meta["error"] = "; ".join(errors)
        for l in lines:
            l["name"] = _name(l["speaker"], state)
            l["facts"] = [f["fact"] for f in facts[l["speaker"]] if f["cite"] in l["cites"]]
        meta["ms"] = round((time.perf_counter() - t0) * 1000, 1)
        return {"lines": lines, "meta": meta}
