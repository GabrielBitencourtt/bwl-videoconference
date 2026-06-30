"""In-memory store of the latest metrics pushed by each node's agent."""
import time

_nodes: dict = {}


def put(name: str, data: dict) -> None:
    data["ts"] = time.time()
    _nodes[name] = data


def all_nodes() -> list:
    now = time.time()
    return [{**v, "name": k, "age_s": round(now - v["ts"])} for k, v in sorted(_nodes.items())]
