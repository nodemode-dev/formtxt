import json
import re

from fastapi import WebSocket

MAX_STEPS = 500
CLEAN = re.compile(r"[^A-Za-z0-9_-]")


class Session:
    def __init__(self, doc: str, tab: str, sid: str, base_doc: dict) -> None:
        self.doc = doc
        self.tab = tab
        self.sid = sid
        self.base_doc = base_doc
        self.base_version = 0
        self.log: list[tuple[dict, str]] = []
        self.peers: dict[str, "Peer"] = {}

    @property
    def version(self) -> int:
        return self.base_version + len(self.log)


class Peer:
    def __init__(self, ws: WebSocket, cid: str, name: str, color: str, access: str, room: "Room", doc: str) -> None:
        self.room = room
        self.doc = doc
        self.ws = ws
        self.cid = cid
        self.name = name
        self.color = color
        self.access = access
        self.session: Session | None = None
        self.tab = ""
        self.cursor: dict | None = None

    def card(self) -> dict:
        return {"id": self.cid, "name": self.name, "color": self.color, "tab": self.tab, "access": self.access}


class Room:
    def __init__(self) -> None:
        self.peers: dict[str, Peer] = {}
        self.sessions: dict[str, Session] = {}


_rooms: dict[str, Room] = {}
_component_sockets: set[WebSocket] = set()
_counter = {"n": 0}


def clean(value: object, size: int) -> str:
    return CLEAN.sub("", str(value or ""))[:size]


def only_comments(steps: list) -> bool:
    for s in steps:
        if not isinstance(s, dict) or s.get("stepType") not in ("addMark", "removeMark"):
            return False
        mark = s.get("mark")
        if not isinstance(mark, dict) or "comment" not in str(mark.get("type", "")):
            return False
    return True


async def _send(peer: Peer, message: dict) -> None:
    try:
        await peer.ws.send_text(json.dumps(message, separators=(",", ":")))
    except Exception:
        await drop(peer)


async def _broadcast(room: Room, message: dict, skip: Peer | None = None) -> None:
    for p in list(room.peers.values()):
        if p is not skip:
            await _send(p, message)


async def _announce(room: Room) -> None:
    await _broadcast(room, {"t": "peers", "peers": [p.card() for p in room.peers.values()]})


async def attach(doc_id: str, ws: WebSocket, cid: str, name: str, color: str, access: str) -> Peer:
    room = _rooms.setdefault(doc_id, Room())
    cid = clean(cid, 24) or f"c{_counter['n']}"
    _counter["n"] += 1
    while cid in room.peers:
        cid = f"{cid[:20]}{_counter['n']}"
        _counter["n"] += 1
    peer = Peer(ws, cid, str(name or "Guest")[:60], color if re.fullmatch(r"#[0-9a-fA-F]{6}", color or "") else "#2563eb", access, room, doc_id)
    room.peers[cid] = peer
    await _announce(room)
    return peer


def _leave_session(peer: Peer) -> None:
    sess = peer.session
    peer.session = None
    if sess is None:
        return
    sess.peers.pop(peer.cid, None)
    if not sess.peers:
        room = peer.room
        if room.sessions.get(sess.tab) is sess:
            room.sessions.pop(sess.tab, None)


async def drop(peer: Peer) -> None:
    room = peer.room
    if room.peers.get(peer.cid) is not peer:
        return
    _leave_session(peer)
    room.peers.pop(peer.cid, None)
    await _broadcast(room, {"t": "leave", "id": peer.cid})
    await _announce(room)
    if not room.peers:
        _rooms.pop(peer.doc, None)


def _tail(sess: Session, since: int) -> dict:
    items = sess.log[max(0, since - sess.base_version):]
    return {"steps": [s for s, _ in items], "ids": [c for _, c in items]}


async def _join(peer: Peer, msg: dict) -> None:
    room = peer.room
    tab = clean(msg.get("tab"), 60)
    _leave_session(peer)
    peer.tab = tab
    sess = room.sessions.get(tab)
    sid, version = msg.get("sid"), msg.get("version")
    out: dict = {"t": "init", "access": peer.access, "you": peer.cid}
    if sess and isinstance(sid, str) and sid == sess.sid and isinstance(version, int) and sess.base_version <= version <= sess.version:
        out.update(mode="resume", sid=sess.sid, version=sess.version, base=None, **_tail(sess, version))
    elif sess:
        out.update(mode="replace", sid=sess.sid, version=sess.version, base={"version": sess.base_version, "doc": sess.base_doc}, **_tail(sess, sess.base_version))
    elif isinstance(msg.get("doc"), dict) and peer.access == "edit":
        _counter["n"] += 1
        sess = Session(peer.doc, tab, f"s{_counter['n']}x{peer.cid}", msg["doc"])
        room.sessions[tab] = sess
        out.update(mode="fresh", sid=sess.sid, version=0, base=None, steps=[], ids=[])
    else:
        out.update(mode="gone", sid="", version=0, base=None, steps=[], ids=[])
        peer.session = None
        await _send(peer, out)
        await _announce(room)
        return
    sess.peers[peer.cid] = peer
    peer.session = sess
    out["peers"] = [p.card() for p in room.peers.values()]
    await _send(peer, out)
    await _announce(room)
    for other in room.peers.values():
        if other is not peer and other.cursor and other.tab == tab:
            await _send(peer, {"t": "presence", **other.cursor})


async def _steps(peer: Peer, msg: dict) -> None:
    sess = peer.session
    if sess is None:
        return
    steps, version = msg.get("steps"), msg.get("version")
    if not isinstance(steps, list) or not isinstance(version, int) or not steps or len(steps) > MAX_STEPS:
        return
    if peer.access == "view" or (peer.access == "comment" and not only_comments(steps)):
        await _send(peer, {"t": "denied", "access": peer.access, "version": sess.version, **_tail(sess, version)})
        return
    if not all(isinstance(s, dict) for s in steps):
        return
    if version != sess.version:
        if version < sess.base_version or version > sess.version:
            await _send(peer, {"t": "init", "mode": "replace", "access": peer.access, "you": peer.cid, "sid": sess.sid, "version": sess.version, "base": {"version": sess.base_version, "doc": sess.base_doc}, **_tail(sess, sess.base_version)})
        else:
            await _send(peer, {"t": "steps", "from": version, "version": sess.version, **_tail(sess, version)})
        return
    for s in steps:
        sess.log.append((s, peer.cid))
    note = {"t": "steps", "from": version, "version": sess.version, "steps": steps, "ids": [peer.cid] * len(steps), "base": sess.base_version}
    for p in list(sess.peers.values()):
        await _send(p, note)


async def _snap(peer: Peer, msg: dict) -> None:
    sess = peer.session
    version, doc = msg.get("version"), msg.get("doc")
    if sess is None or peer.access != "edit" or not isinstance(version, int) or not isinstance(doc, dict):
        return
    if sess.base_version < version <= sess.version:
        del sess.log[: version - sess.base_version]
        sess.base_version = version
        sess.base_doc = doc


async def _presence(peer: Peer, msg: dict) -> None:
    room = peer.room
    anchor, head = msg.get("anchor"), msg.get("head")
    if not isinstance(anchor, int) or not isinstance(head, int):
        return
    peer.cursor = {"id": peer.cid, "name": peer.name, "color": peer.color, "tab": peer.tab, "anchor": anchor, "head": head}
    for p in list(room.peers.values()):
        if p is not peer and p.tab == peer.tab:
            await _send(p, {"t": "presence", **peer.cursor})


async def _hello(peer: Peer, msg: dict) -> None:
    room = peer.room
    peer.name = str(msg.get("name") or peer.name)[:60]
    color = str(msg.get("color") or "")
    if re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        peer.color = color
    await _announce(room)


HANDLERS = {"join": _join, "steps": _steps, "snap": _snap, "presence": _presence, "hello": _hello}


async def handle(peer: Peer, msg: dict) -> None:
    fn = HANDLERS.get(str(msg.get("t")))
    if fn:
        await fn(peer, msg)


def people(doc_id: str) -> list[dict]:
    room = _rooms.get(doc_id)
    return [p.card() for p in room.peers.values()] if room else []


def open_docs() -> list[str]:
    return list(_rooms)


async def component_attach(ws: WebSocket) -> None:
    _component_sockets.add(ws)


def component_detach(ws: WebSocket) -> None:
    _component_sockets.discard(ws)


async def component_broadcast(message: dict) -> None:
    text = json.dumps(message, separators=(",", ":"))
    for ws in list(_component_sockets):
        try:
            await ws.send_text(text)
        except Exception:
            _component_sockets.discard(ws)
