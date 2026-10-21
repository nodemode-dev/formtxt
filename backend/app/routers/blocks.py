import json
import secrets
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core import config

router = APIRouter(prefix="/blocks", tags=["blocks"])

MAX_BLOCKS = 200
MAX_BYTES = 2_000_000


def _path():
    return config.data_dir() / "blocks.json"


def _read() -> list[dict]:
    try:
        data = json.loads(_path().read_text(encoding="utf-8"))
        return [b for b in data.get("blocks", []) if isinstance(b, dict) and b.get("id")]
    except (OSError, ValueError, AttributeError):
        return []


def _write(blocks: list[dict]) -> None:
    tmp = _path().with_suffix(".tmp")
    tmp.write_text(json.dumps({"blocks": blocks}, ensure_ascii=False), encoding="utf-8")
    tmp.replace(_path())


def _strip_media(node: Any) -> Any:
    if isinstance(node, list):
        return [_strip_media(n) for n in node if not (isinstance(n, dict) and n.get("type") == "image")]
    if isinstance(node, dict):
        return {k: _strip_media(v) for k, v in node.items()}
    return node


class NewBlock(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: str = Field(default="Saved", max_length=40)
    blocks: list[dict] = Field(min_length=1)


@router.get("")
def list_blocks() -> dict:
    return {"blocks": [{"id": b["id"], "name": b.get("name", ""), "category": b.get("category", "Saved"), "created": b.get("created", 0), "blocks": b.get("blocks", [])} for b in _read()]}


@router.post("")
def save_block(body: NewBlock) -> dict:
    blocks = _read()
    if len(blocks) >= MAX_BLOCKS:
        raise HTTPException(409, f"The library holds up to {MAX_BLOCKS} building blocks. Delete one first.")
    content = _strip_media(body.blocks)
    if len(json.dumps(content)) > MAX_BYTES:
        raise HTTPException(413, "That selection is too large for a building block (2 MB).")
    entry = {"id": "b_" + secrets.token_hex(5), "name": body.name.strip(), "category": body.category.strip() or "Saved", "created": time.time(), "blocks": content}
    blocks = [b for b in blocks if b.get("name", "").lower() != entry["name"].lower()]
    blocks.append(entry)
    _write(blocks)
    return entry


@router.delete("/{block_id}")
def delete_block(block_id: str) -> dict:
    blocks = _read()
    left = [b for b in blocks if b["id"] != block_id]
    if len(left) == len(blocks):
        raise HTTPException(404, "No building block has that id.")
    _write(left)
    return {"deleted": block_id}
