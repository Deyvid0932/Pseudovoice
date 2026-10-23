"""One bounded cloud attempt, then CPU fallback; never logs audio or transcript."""
import asyncio
import io
import time
import unicodedata
import wave
from dataclasses import asdict, dataclass, field

import httpx

from .config import settings


@dataclass
class RecognitionResult:
    text: str
    provider: str
    model: str
    original: str = ""
    segments: list = field(default_factory=list)
    fallback_reason: str | None = None

    def metadata(self, speech_ms: float | None = None) -> dict:
        result = asdict(self)
        if speech_ms is not None:
            result["speech_ms"] = round(speech_ms)
        return result


class SpeechRecognizer:
    def __init__(self):
        self.retry_at = 0.0

    async def recognize(self, engine, pcm: bytes, prompt: str, lock: asyncio.Lock) -> RecognitionResult:
        fallback = None
        if settings.STT_MODE == "hybrid":
            if not settings.GROQ_API_KEY:
                fallback = "missing_credentials"
            elif time.monotonic() < self.retry_at:
                fallback = "cooldown"
            else:
                try:
                    audio = io.BytesIO()
                    with wave.open(audio, "wb") as wav:
                        wav.setnchannels(1)
                        wav.setsampwidth(2)
                        wav.setframerate(16000)
                        wav.writeframes(pcm)
                    async with asyncio.timeout(settings.STT_CLOUD_TIMEOUT_SECONDS):
                        async with httpx.AsyncClient(timeout=settings.STT_CLOUD_TIMEOUT_SECONDS) as client:
                            response = await client.post("https://api.groq.com/openai/v1/audio/transcriptions",
                                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                                files={"file": ("turn.wav", audio.getvalue(), "audio/wav")},
                                data={"model": settings.GROQ_STT_MODEL, "language": settings.STT_LANGUAGE,
                                      "prompt": prompt, "response_format": "verbose_json", "temperature": "0"})
                            response.raise_for_status()
                            body = response.json()
                    if not isinstance(body, dict) or not isinstance(body.get("text"), str):
                        raise ValueError("Invalid transcription response")
                    text = body["text"].strip()
                    segments = body.get("segments")
                    return RecognitionResult(text, "groq", settings.GROQ_STT_MODEL, text,
                                             segments[:200] if isinstance(segments, list) else [])
                except (httpx.HTTPError, TimeoutError, ValueError, TypeError):
                    self.retry_at = time.monotonic() + settings.STT_CLOUD_COOLDOWN_SECONDS
                    fallback = "cloud_unavailable"
        async with lock:
            result = await asyncio.to_thread(engine.transcribe_result, pcm, prompt)
        result.fallback_reason = fallback
        return result


def normalize(text: str) -> str:
    plain = "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if unicodedata.category(c) != "Mn")
    return " ".join("".join(c if c.isalnum() else " " for c in plain).split())


SHORT_REPLIES = {"si", "no", "ya", "ok", "vale", "para", "stop"}
SUSPICIOUS = ("amara org", "subtitulos realizados", "subtitulos por", "gracias por ver", "suscribete al canal")


def discard_transcript(text: str, anchor: str, speech_ms: float, strong_ms: float) -> bool:
    clean = normalize(text)
    if not clean or speech_ms < settings.VAD_SHORT_SPEECH_MS:
        return True
    if speech_ms < settings.VAD_MIN_SPEECH_MS:
        return strong_ms < 100 or clean not in SHORT_REPLIES
    suspicious = any(term in clean for term in SUSPICIOUS) or (len(clean) > 10 and clean in normalize(anchor))
    return suspicious and strong_ms < 100


speech_recognizer = SpeechRecognizer()
