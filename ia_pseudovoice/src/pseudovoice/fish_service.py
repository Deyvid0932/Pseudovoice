"""Fish API adapter: secrets and paid requests stay inside the local service."""
import io
import json
import re
import threading
import time
import wave
from pathlib import Path

import av
import httpx
import numpy as np

from .config import settings

VOICE_ID = re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
_usage_lock = threading.Lock()
_catalog_lock = threading.Lock()
_catalog_cache: dict[tuple, tuple[float, dict]] = {}


class FishError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def headers() -> dict[str, str]:
    if not settings.FISH_AUDIO_API_KEY:
        raise FishError(503, "Falta FISH_AUDIO_API_KEY (o FISH_AUDIO) en el .env de la raíz.")
    if settings.FISH_AUDIO_MODEL not in {"s2.1-pro-free", "s2.1-pro", "s2-pro", "s1"}:
        raise FishError(503, "FISH_AUDIO_MODEL debe indicar un modelo de pago reconocido.")
    return {"Authorization": f"Bearer {settings.FISH_AUDIO_API_KEY}", "model": settings.FISH_AUDIO_MODEL}


def check(response: httpx.Response) -> None:
    if not response.is_error:
        return
    messages = {
        401: "Fish rechazó la clave API. Revisa FISH_AUDIO en Python.",
        402: "Saldo insuficiente o acceso de pago no disponible en Fish Audio.",
        403: "Fish no permite usar esta voz u operación con tu cuenta.",
        404: "Esta voz de Fish ya no está disponible. Elige otra voz.",
        400: "Fish rechazó la muestra o los parámetros de la voz.",
        422: "Fish no aceptó la muestra o los parámetros de audio.",
        429: "Fish alcanzó su límite de concurrencia. Intenta nuevamente.",
    }
    # Do not echo provider bodies: they may contain audio, text or credentials.
    raise FishError(response.status_code, messages.get(response.status_code, "Fish Audio no está disponible temporalmente."))


def request(method: str, path: str, **kwargs) -> httpx.Response:
    try:
        with httpx.Client(timeout=httpx.Timeout(90, connect=15)) as client:
            response = client.request(method, settings.FISH_AUDIO_BASE_URL.rstrip("/") + path, headers=headers(), **kwargs)
        check(response)
        return response
    except httpx.HTTPError as exc:
        raise FishError(502, "No se pudo conectar con Fish Audio. Comprueba tu conexión.") from exc


def valid_id(voice_id: str) -> str:
    if not VOICE_ID.fullmatch(voice_id):
        raise ValueError("Identificador de voz inválido.")
    return voice_id


def safe_url(value) -> str | None:
    if not isinstance(value, str):
        return None
    if value.startswith("coverimage/") and re.fullmatch(r"coverimage/[A-Za-z0-9_-]+", value):
        return "https://public-platform.r2.fish.audio/" + value
    return value if value.startswith("https://") else None


def normalize_model(item: dict) -> dict:
    samples = item.get("samples") or []
    sample_url = None
    for sample in samples:
        if isinstance(sample, dict):
            sample_url = safe_url(sample.get("audio")) or safe_url(sample.get("url")) or safe_url(sample.get("audio_url"))
        else:
            sample_url = safe_url(sample)
        if sample_url:
            break
    return {"id": item.get("_id", ""), "name": item.get("title") or "Voz de Fish",
            "avatar_url": safe_url(item.get("cover_image")), "description": item.get("description") or "",
            "languages": item.get("languages") or [], "sample_url": sample_url,
            "state": item.get("state", "unknown"), "visibility": item.get("visibility", "private")}


def catalog(q: str = "", language: str = "", page: int = 1) -> dict:
    key = (q, language, page)
    with _catalog_lock:
        cached = _catalog_cache.get(key)
        if cached and time.monotonic() - cached[0] < 120:
            return cached[1]
    params = {"page_size": 20, "page_number": page, "self": "false", "sort_by": "score"}
    if q:
        params["title"] = q[:100]
    if language:
        params["language"] = language[:20]
    data = request("GET", "/model", params=params).json()
    # Only public models; never expose the workspace's private clones.
    items = [normalize_model(i) for i in data.get("items", []) if i.get("visibility") == "public" and not i.get("dmca_taken_down")]
    result = {"items": items, "total": data.get("total", 0), "has_more": data.get("has_more", len(data.get("items", [])) == 20)}
    with _catalog_lock:
        if len(_catalog_cache) > 100:
            _catalog_cache.clear()
        _catalog_cache[key] = (time.monotonic(), result)
    return result


def model(voice_id: str) -> dict:
    return request("GET", f"/model/{valid_id(voice_id)}").json()


def normalize_audio(audio: bytes) -> tuple[bytes, float]:
    """Decode the actual container, bounded to three minutes; accept MP3 and WAV."""
    try:
        pcm = bytearray()
        with av.open(io.BytesIO(audio)) as source:
            if not source.streams.audio:
                raise ValueError("El archivo no contiene audio.")
            stream = source.streams.audio[0]
            if stream.codec_context.name not in {"mp3", "mp3float", "pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le", "pcm_u8", "pcm_f64le"}:
                raise ValueError("Sube un MP3 o WAV compatible.")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=24000)
            for frame in source.decode(stream):
                for out in resampler.resample(frame):
                    pcm.extend(out.to_ndarray().astype("<i2").tobytes())
                if len(pcm) > 24000 * 2 * 180:
                    raise ValueError("La muestra supera tres minutos. Usa un fragmento de voz más corto.")
            for out in resampler.resample(None):
                pcm.extend(out.to_ndarray().astype("<i2").tobytes())
        duration = len(pcm) / 48000
        if duration < 1:
            raise ValueError("La muestra debe contener al menos un segundo de audio.")
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32)
        if not len(samples) or float(np.sqrt(np.mean(samples ** 2))) < 10:
            raise ValueError("La muestra está vacía o contiene silencio.")
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(24000); wav.writeframes(pcm)
        return output.getvalue(), duration
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("No se puede decodificar el archivo. Sube un MP3 o WAV válido.") from exc


def create_voice(wav: bytes, name: str) -> dict:
    data = {"type": "tts", "title": name[:100], "train_mode": "fast", "visibility": "private", "generate_sample": "false"}
    result = request("POST", "/model", data=data, files=[("voices", ("reference.wav", wav, "audio/wav"))]).json()
    valid_id(result.get("_id", ""))
    return result


def synthesize(text: str, voice_id: str) -> bytes:
    response = request("POST", "/v1/tts", json={"text": text, "reference_id": valid_id(voice_id),
                       "format": "pcm", "sample_rate": 24000, "latency": "normal"})
    pcm = response.content
    if not pcm or len(pcm) % 2:
        raise FishError(502, "Fish devolvió audio PCM incompleto.")
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    with _usage_lock:
        with (settings.DATA_DIR / "fish_usage.jsonl").open("a", encoding="utf-8") as log:
            log.write(json.dumps({"timestamp": time.time(), "model": settings.FISH_AUDIO_MODEL,
                                  "input_utf8_bytes": len(text.encode("utf-8")), "audio_seconds": len(pcm) / 48000,
                                  "billing": "local_usage_estimate"}) + "\n")
    return pcm
