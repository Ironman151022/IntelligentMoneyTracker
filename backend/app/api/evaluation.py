import json
import math
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.database import get_connection

router = APIRouter(prefix="/evaluations", tags=["evaluations"])

PAGE_SIZE = 20
Verdict = Literal["pending", "ok", "not_ok"]


class UpdateEvaluationRequest(BaseModel):
    verdict: Verdict | None = None
    notes: str | None = Field(default=None)


def _serialize_row(row) -> dict:
    item = dict(row)
    if item.get("agent_response"):
        try:
            item["agent_response"] = json.loads(item["agent_response"])
        except (json.JSONDecodeError, TypeError):
            pass
    if item.get("tool_args_json"):
        try:
            item["tool_args"] = json.loads(item["tool_args_json"])
        except (json.JSONDecodeError, TypeError):
            item["tool_args"] = item["tool_args_json"]
    else:
        item["tool_args"] = None
    item.pop("tool_args_json", None)
    return item


@router.get("/")
def list_evaluations(
    page: int = Query(1, ge=1),
    limit: int = Query(PAGE_SIZE, ge=1, le=100),
):
    conn = get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) AS n FROM evaluations").fetchone()["n"]
        offset = (page - 1) * limit
        rows = conn.execute(
            """
            SELECT id, chat_id, created_at, user_prompt, agent_response, tool_name,
                   tool_args_json, tool_result, transaction_id, verdict, notes
            FROM evaluations
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()

        total_pages = max(1, math.ceil(total / limit)) if total else 1
        return {
            "items": [_serialize_row(row) for row in rows],
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing evaluations: {e}") from e
    finally:
        conn.close()


@router.patch("/{evaluation_id}")
def update_evaluation(evaluation_id: int, body: UpdateEvaluationRequest):
    if body.verdict is None and body.notes is None:
        raise HTTPException(status_code=400, detail="Provide verdict and/or notes")

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM evaluations WHERE id = ?",
            (evaluation_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Evaluation not found")

        fields: list[str] = []
        values: list[object] = []
        if body.verdict is not None:
            fields.append("verdict = ?")
            values.append(body.verdict)
        if body.notes is not None:
            fields.append("notes = ?")
            values.append(body.notes)

        values.append(evaluation_id)
        conn.execute(
            f"UPDATE evaluations SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT id, chat_id, created_at, user_prompt, agent_response, tool_name,
                   tool_args_json, tool_result, transaction_id, verdict, notes
            FROM evaluations
            WHERE id = ?
            """,
            (evaluation_id,),
        ).fetchone()
        return _serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating evaluation: {e}") from e
    finally:
        conn.close()
