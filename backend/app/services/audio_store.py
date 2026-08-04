"""Persist uploaded voice clips under storage/audio/."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import BACKEND_ROOT, settings

_AUDIO_REF_RE = re.compile(r"^\[audio:(.+)\]$")


def audio_dir() -> Path:
    path = settings.audio_storage_path
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_wav_bytes(wav_bytes: bytes, chat_id: str) -> Path:
    """Write a WAV blob to disk; returns path relative to backend root."""
    if not wav_bytes:
        raise ValueError("Empty audio upload")
    if not wav_bytes.startswith(b"RIFF"):
        raise ValueError("Only WAV audio is supported")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    name = f"{chat_id}_{stamp}_{uuid.uuid4().hex[:8]}.wav"
    abs_path = audio_dir() / name
    abs_path.write_bytes(wav_bytes)
    return abs_path.relative_to(BACKEND_ROOT)


def audio_ref(rel_path: Path | str) -> str:
    return f"[audio:{rel_path}]"


def parse_audio_ref(user_prompt: str) -> Path | None:
    match = _AUDIO_REF_RE.match(user_prompt.strip())
    if not match:
        return None
    return BACKEND_ROOT / match.group(1)


def load_wav_bytes(rel_or_abs: Path) -> bytes:
    path = rel_or_abs if rel_or_abs.is_absolute() else BACKEND_ROOT / rel_or_abs
    data = path.read_bytes()
    if not data.startswith(b"RIFF"):
        raise ValueError(f"Not a WAV file: {path}")
    return data
