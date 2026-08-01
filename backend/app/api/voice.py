from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.stt import transcribe_wav_bytes

router = APIRouter(prefix="/voice", tags=["voice"])


class TranscribeResponse(BaseModel):
    text: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile = File(...)):
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio upload")

    try:
        text = transcribe_wav_bytes(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {exc}",
        ) from exc

    return TranscribeResponse(text=text)
