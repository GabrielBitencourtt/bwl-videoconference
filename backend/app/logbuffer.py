"""In-memory ring buffer of recent request logs, for the admin live console."""
import itertools
import time
from collections import deque

_buf: deque = deque(maxlen=800)
_seq = itertools.count(1)


def add(entry: dict) -> None:
    entry["seq"] = next(_seq)
    entry["t"] = round(time.time(), 3)
    _buf.append(entry)


def since(after: int = 0, limit: int = 300) -> list:
    out = [e for e in _buf if e["seq"] > after]
    return out[-limit:]


def snapshot() -> list:
    return list(_buf)
