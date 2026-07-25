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
    return "\n".join([*previous, user_prompt])


@router.post("/")
def create_transaction(body: CreateTransactionRequest):
    conn = get_connection()
    try:
        combined_prompt = _combined_user_prompt(conn, body.chat_id, body.user_prompt)
        result = run_logger_agent([{"role": "user", "content": combined_prompt}])

        agent_response = result["agent_response"]
        tool_name = result["tool_name"]
        tool_args = result["tool_args"]
        tool_result = result["tool_result"]

        print(body.chat_id, agent_response)

        transaction_id = None
        if tool_name == "log_transaction" and isinstance(tool_result, int):
            transaction_id = tool_result

        conn.execute(
            """
            INSERT INTO evaluations (
                chat_id, user_prompt, agent_response, tool_name,
                tool_args_json, tool_result, transaction_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                body.chat_id,
                body.user_prompt,
                agent_response,
                tool_name,
                json.dumps(tool_args) if tool_args is not None else None,
                None if tool_result is None else str(tool_result),
                transaction_id,
            ),
        )
        conn.commit()

        parsed_agent_response = None
        if agent_response:
            try:
                parsed_agent_response = json.loads(agent_response)
            except json.JSONDecodeError:
                parsed_agent_response = agent_response

        return {
            "chat_id": body.chat_id,
            "user_prompt": body.user_prompt,
            "combined_prompt": combined_prompt,
            "agent_response": parsed_agent_response,
            "tool_name": tool_name,
            "tool_args": tool_args,
            "tool_result": tool_result,
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
            SELECT id, chat_id, created_at, user_prompt, agent_response, tool_name,
                   tool_args_json, tool_result, transaction_id, verdict, notes
            FROM evaluations
            WHERE chat_id = ?
            ORDER BY id ASC
            """,
            (chat_id,),
        ).fetchall()
        evaluations = []
        for row in rows:
            item = dict(row)
            if item.get("agent_response"):
                try:
                    item["agent_response"] = json.loads(item["agent_response"])
                except json.JSONDecodeError:
                    pass
            evaluations.append(item)
        return {"chat_id": chat_id, "evaluations": evaluations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting evaluations: {e}") from e
    finally:
        conn.close()
