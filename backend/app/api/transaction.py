import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.logger import run_logger_agent
from app.services.database import get_connection

router = APIRouter(prefix="/transactions", tags=["transactions"])


class CreateTransactionRequest(BaseModel):
    user_prompt: str
    chat_id: str


def _combined_user_prompt(conn, chat_id: str, user_prompt: str) -> str:
    """Join prior prompts in this chat with the current one for follow-ups."""
    rows = conn.execute(
        """
        SELECT user_prompt FROM evaluations
        WHERE chat_id = ?
        ORDER BY id ASC
        """,
        (chat_id,),
    ).fetchall()
    previous = [row["user_prompt"] for row in rows]
    if not previous:
        return user_prompt
    return ", ".join([*previous, user_prompt])


def _parse_json_field(value: str | None):
    if not value:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return value


@router.post("/")
def create_transaction(body: CreateTransactionRequest):
    conn = get_connection()
    try:
        combined_prompt = _combined_user_prompt(conn, body.chat_id, body.user_prompt)
        print(body.chat_id, ":", combined_prompt)
        result = run_logger_agent([{"role": "user", "content": combined_prompt}])

        agent_response_raw = result["agent_response_raw"]
        agent_response_content = result["agent_response_content"]
        transaction_id = result["transaction_id"]

        print(body.chat_id, agent_response_content)

        conn.execute(
            """
            INSERT INTO evaluations (
                chat_id, user_prompt, combined_prompt,
                agent_response_raw, agent_response_content, transaction_id
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                body.chat_id,
                body.user_prompt,
                combined_prompt,
                agent_response_raw,
                agent_response_content,
                transaction_id,
            ),
        )
        conn.commit()

        return {
            "chat_id": body.chat_id,
            "user_prompt": body.user_prompt,
            "combined_prompt": combined_prompt,
            "agent_response_content": _parse_json_field(agent_response_content),
            "transaction_id": transaction_id,
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating transaction: {e}") from e
    finally:
        conn.close()


@router.get("/{chat_id}")
def get_chat_evaluations(chat_id: str):
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, chat_id, created_at, user_prompt, combined_prompt,
                   agent_response_raw, agent_response_content, transaction_id,
                   verdict, notes
            FROM evaluations
            WHERE chat_id = ?
            ORDER BY id ASC
            """,
            (chat_id,),
        ).fetchall()
        evaluations = []
        for row in rows:
            item = dict(row)
            item["agent_response_raw"] = _parse_json_field(item.get("agent_response_raw"))
            item["agent_response_content"] = _parse_json_field(
                item.get("agent_response_content")
            )
            evaluations.append(item)
        return {"chat_id": chat_id, "evaluations": evaluations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting evaluations: {e}") from e
    finally:
        conn.close()
