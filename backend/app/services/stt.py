"""On-device speech-to-text via faster-whisper."""

from __future__ import annotations

import io
import threading
import wave
from functools import lru_cache

import numpy as np
from faster_whisper import WhisperModel

from app.core.config import settings

_TARGET_SAMPLE_RATE = 16_000
_lock = threading.Lock()


@lru_cache(maxsize=1)
def _load_whisper() -> WhisperModel:
    return WhisperModel(
        settings.stt_whisper_model,
        device=settings.stt_whisper_device,
        compute_type=settings.stt_whisper_compute_type,
    )


def _pcm16_mono_from_wav(data: bytes) -> tuple[np.ndarray, int]:
    """Decode a WAV blob to float32 mono PCM in [-1, 1]."""
    with wave.open(io.BytesIO(data), "rb") as wf:
        channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        sample_rate = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sample_width != 2:
        raise ValueError("Only 16-bit PCM WAV is supported")

    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)

    return samples, int(sample_rate)


def _resample_linear(audio: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate or audio.size == 0:
        return audio
    duration = audio.size / src_rate
    dst_len = max(1, int(round(duration * dst_rate)))
    x_old = np.linspace(0.0, 1.0, num=audio.size, endpoint=False)
    x_new = np.linspace(0.0, 1.0, num=dst_len, endpoint=False)
    return np.interp(x_new, x_old, audio).astype(np.float32)


def transcribe_wav_bytes(wav_bytes: bytes) -> str:
    """Transcribe a 16-bit PCM WAV (any common sample rate / mono or stereo)."""
    audio, sample_rate = _pcm16_mono_from_wav(wav_bytes)
    if audio.size == 0:
        return ""

    audio = _resample_linear(audio, sample_rate, _TARGET_SAMPLE_RATE)

    with _lock:
        model = _load_whisper()
        segments, _info = model.transcribe(
            audio,
            language="en",
            task="transcribe",
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        parts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]

    return " ".join(parts).strip()
