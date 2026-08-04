from pathlib import Path

from pydantic import BaseModel

# app/core/config.py → backend/
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseModel):
    database_path: Path = BACKEND_ROOT / "storage" / "data.db"
    audio_storage_path: Path = BACKEND_ROOT / "storage" / "audio"

    # logger Agent (text + native audio via Ollama)
    logger_model: str = "gemma4:e2b"
    logger_system_prompt_path: Path = BACKEND_ROOT / "app" / "prompts" / "logger.md"
    logger_temperature: float = 0


settings = Settings()
