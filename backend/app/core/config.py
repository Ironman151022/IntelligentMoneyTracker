from pathlib import Path

from pydantic import BaseModel

# app/core/config.py → backend/
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseModel):
    database_path: Path = BACKEND_ROOT / "storage" / "data.db"

    # logger Agent
    logger_model: str = "gemma4:e2b"
    logger_system_prompt_path: Path = BACKEND_ROOT / "app" / "prompts" / "logger.md"
    logger_temperature: float = 0

    # Speech-to-text (faster-whisper). Try: tiny.en | base.en | small.en | medium.en
    stt_whisper_model: str = "medium.en"
    stt_whisper_device: str = "cpu"
    stt_whisper_compute_type: str = "int8"


settings = Settings()
