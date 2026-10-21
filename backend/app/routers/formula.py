from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import formula

router = APIRouter(prefix="/formula", tags=["formula"])


class Item(BaseModel):
    code: str = Field(max_length=2000)
    format: str = Field(default="", max_length=200)
    grid: list[list[str]] | None = None
    row: int = -1
    col: int = -1


class Batch(BaseModel):
    items: list[Item] = Field(max_length=2000)


@router.post("/eval")
def evaluate(body: Batch) -> dict:
    if body.items and any(len(i.grid or []) > 2000 for i in body.items):
        raise HTTPException(413, "Tables up to 2,000 rows are supported in formulas.")
    return {"results": [formula.evaluate(i.code, i.format, i.grid, i.row, i.col) for i in body.items]}
