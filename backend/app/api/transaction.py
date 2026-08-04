import asyncio
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.agents.logger import run_logger_agent
from app.services.audio_store import (
    audio_ref,
    load_wav_bytes,
    parse_audio_ref,
    save_wav_bytes,
)
from app.services.database import get_connection

router = APIRouter(prefix="/transactions", tags=["transactions"])

_VOICE_USER_TEXT = (
    "The attached audio is the user's utterance for this turn. "
    "Extract the money event from the audio (and any earlier context below). "
    "Reply with the JSON action object only."
)


class CreateTransactionRequest(BaseModel):
    user_prompt: str
    chat_id: str


def _prior_user_prompts(conn, chat_id: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT user_prompt FROM evaluations
        WHERE chat_id = ?
        ORDER BY id ASC
        """,
        (chat_id,),
    ).fetchall()
    return [row["user_prompt"] for row in rows]


def _combined_user_prompt(previous: list[str], user_prompt: str) -> str:
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


def _build_logger_messages(
    previous: list[str],
    *,
    text_prompt: str | None = None,
    wav_bytes: bytes | None = None,
) -> list[dict]:
    """Build the single user turn for the logger (text and/or audio)."""
    text_bits: list[str] = []
    images: list[bytes] = []

    for prior in previous:
        audio_path = parse_audio_ref(prior)
        if audio_path is not None:
            try:
                images.append(load_wav_bytes(audio_path))
            except (OSError, ValueError):
                text_bits.append(prior)
        else:
            text_bits.append(prior)

    if wav_bytes is not None:
        images.append(wav_bytes)
        content = _VOICE_USER_TEXT
        if text_bits:
            content = (
                "Earlier text in this chat:\n- "
                + "\n- ".join(text_bits)
                + "\n\n"
                + _VOICE_USER_TEXT
                + " Earlier audio clips (if any) are also attached, oldest first; "
                "the last clip is the newest utterance."
            )
        elif len(images) > 1:
            content = (
                _VOICE_USER_TEXT
                + " Multiple audio clips are attached in chronological order; "
                "the last clip is the newest utterance."
            )
    else:
        assert text_prompt is not None
        content = _combined_user_prompt(text_bits, text_prompt)

    message: dict = {"role": "user", "content": content}
    if images:
        # Ollama 0.6.x routes WAV bytes through `images` into the audio encoder.
        message["images"] = images
    return [message]


def _persist_evaluation(
    conn,
    *,
    chat_id: str,
    user_prompt: str,
    combined_prompt: str,
    result: dict,
) -> dict:
    agent_response_raw = result["agent_response_raw"]
    agent_response_content = result["agent_response_content"]
    transaction_id = result["transaction_id"]

    print(chat_id, agent_response_content)

    conn.execute(
        """
        INSERT INTO evaluations (
            chat_id, user_prompt, combined_prompt,
            agent_response_raw, agent_response_content, transaction_id
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            chat_id,
            user_prompt,
            combined_prompt,
            agent_response_raw,
            agent_response_content,
            transaction_id,
        ),
    )
    conn.commit()

    return {
        "chat_id": chat_id,
        "user_prompt": user_prompt,
        "combined_prompt": combined_prompt,
        "agent_response_content": _parse_json_field(agent_response_content),
        "transaction_id": transaction_id,
    }


@router.post("/")
def create_transaction(body: CreateTransactionRequest):
    conn = get_connection()
    try:
        previous = _prior_user_prompts(conn, body.chat_id)
        combined_prompt = _combined_user_prompt(previous, body.user_prompt)
        print(body.chat_id, ":", combined_prompt)
        result = run_logger_agent(
            _build_logger_messages(previous, text_prompt=body.user_prompt)
        )
        return _persist_evaluation(
            conn,
            chat_id=body.chat_id,
            user_prompt=body.user_prompt,
            combined_prompt=combined_prompt,
            result=result,
        )
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating transaction: {e}") from e
    finally:
        conn.close()


@router.post("/voice")
async def create_transaction_from_voice(
    chat_id: str = Form(...),
    audio: UploadFile = File(...),
):
    """Save mic WAV → send audio (not a transcript) straight to the logger agent."""
    raw = await audio.read()
    conn = get_connection()
    try:
        rel_path = save_wav_bytes(raw, chat_id)
        user_prompt = audio_ref(rel_path)
        previous = _prior_user_prompts(conn, chat_id)
        combined_prompt = _combined_user_prompt(previous, user_prompt)
        print(chat_id, ":", combined_prompt)

        messages = _build_logger_messages(previous, wav_bytes=raw)
        result = await asyncio.to_thread(run_logger_agent, messages)

        payload = _persist_evaluation(
            conn,
            chat_id=chat_id,
            user_prompt=user_prompt,
            combined_prompt=combined_prompt,
            result=result,
        )
        payload["audio_path"] = str(rel_path)
        return payload
    except ValueError as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error creating transaction from voice: {e}",
        ) from e
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
