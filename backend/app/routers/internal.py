"""Internal ingestion endpoints (node agents). Auth via shared secret header."""
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from ..config import settings
from .. import nodes

router = APIRouter(prefix="/api/internal", tags=["internal"])


class NodeMetrics(BaseModel):
    name: str
    role: str = ""
    cpu: float = 0
    mem: float = 0
    disk: float = 0


@router.post("/nodes")
async def post_node_metrics(body: NodeMetrics, x_node_secret: str | None = Header(default=None)):
    if not settings.node_secret or x_node_secret != settings.node_secret:
        raise HTTPException(401, "bad node secret")
    nodes.put(body.name, body.model_dump())
    return {"ok": True}
