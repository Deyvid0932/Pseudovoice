"""Local CPU speech recognition and memory, with Fish Audio synthesis."""

import asyncio
import hashlib
import json
import logging
import os
import re
from pathlib import Path
from typing import AsyncIterator

import numpy as np

from .config import settings
from .fish_service import synthesize

logger = logging.getLogger("pseudovoice.engine")
VOICE_ID = re.compile(r"[A-Za-z0-9_-]{8,128}\Z")


class InferenceEngine:
    def __init__(self):
        from faster_whisper import WhisperModel

        settings.WHISPER_MODEL_DIR.mkdir(parents=True, exist_ok=True)
        settings.VOICES_DIR.mkdir(parents=True, exist_ok=True)
        self.device = "cpu"
        self.embedding_model = None
        logger.info("Cargando Whisper %s en CPU (int8). La primera ejecución descarga el modelo.", settings.WHISPER_MODEL_SIZE)
        self.whisper = WhisperModel(
            settings.WHISPER_MODEL_SIZE,
            device="cpu",
            compute_type="int8",
            cpu_threads=settings.CPU_THREADS,
            download_root=str(settings.WHISPER_MODEL_DIR),
        )
        logger.info("Transcripción local lista.")

    def embed_text(self, text: str) -> list[float]:
        """Keep the multilingual 384-dimension memory using ONNX on the CPU."""
        if self.embedding_model is None:
            from fastembed import TextEmbedding

            self.embedding_model = TextEmbedding(
                model_name=settings.EMBEDDING_MODEL,
                cache_dir=str(settings.EMBEDDING_MODEL_DIR),
                threads=settings.CPU_THREADS,
            )
        vector = np.asarray(next(self.embedding_model.embed([text[:4000]])), dtype=np.float32)
        if vector.shape != (384,):
            raise RuntimeError("El modelo de memoria debe producir vectores de 384 dimensiones.")
        norm = np.linalg.norm(vector)
        return (vector / norm if norm else vector).tolist()

    def transcribe(self, audio_bytes: bytes, sample_rate: int = 16000) -> str:
        return self.transcribe_result(audio_bytes, sample_rate=sample_rate).text

    def transcribe_result(self, audio_bytes: bytes, prompt: str = "", sample_rate: int = 16000):
        from .speech_recognition import RecognitionResult
        if not audio_bytes:
            return RecognitionResult("", "whisper", settings.WHISPER_MODEL_SIZE)
        if sample_rate != 16000 or len(audio_bytes) % 2:
            raise ValueError("Se requiere audio PCM 16-bit mono a 16000 Hz.")
        audio = np.frombuffer(audio_bytes, dtype="<i2").astype(np.float32) / 32768.0
        segments, _ = self.whisper.transcribe(
            audio,
            beam_size=3,
            language=settings.STT_LANGUAGE,
            initial_prompt=prompt or settings.STT_BASE_VOCABULARY,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )
        rows = [{"start": s.start, "end": s.end, "text": s.text.strip(),
                 "avg_logprob": s.avg_logprob, "no_speech_prob": s.no_speech_prob} for s in segments]
        text = " ".join(s["text"] for s in rows).strip()
        return RecognitionResult(text, "whisper", settings.WHISPER_MODEL_SIZE, text, rows)

    def get_reference_audio_path(self, reference_audio_name: str) -> str:
        if reference_audio_name.startswith("fish:"):
            voice_id = reference_audio_name.removeprefix("fish:").strip()
            if not VOICE_ID.fullmatch(voice_id):
                raise ValueError("El identificador de voz de Fish no es válido.")
            return f"fish:{voice_id}"

        raise ValueError("Este personaje necesita una voz de Fish. Elige una en Explorar voces; se conservará su historial.")

    def split_sentences(self, text: str) -> list[str]:
        return [s.strip() for s in re.split(r"(?<=[.!?:;\n])\s+", text.strip()) if s.strip()]

    def synthesize_sentence_chunk(self, sentence: str, reference_audio_path: str) -> bytes:
        if not sentence:
            return b""
        reference = self.get_reference_audio_path(reference_audio_path)
        return synthesize(sentence, reference.removeprefix("fish:"))

    def synthesize_cached_reply(self, text: str, reference_audio_path: str) -> bytes:
        reference = self.get_reference_audio_path(reference_audio_path)
        cache_dir = settings.DATA_DIR / "audio_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        identity = f"{reference}:{settings.FISH_AUDIO_MODEL}:{text}"
        cache_path = cache_dir / (hashlib.sha256(identity.encode("utf-8")).hexdigest() + ".pcm")
        if cache_path.is_file():
            return cache_path.read_bytes()
        pcm = self.synthesize_sentence_chunk(text, reference)
        if pcm:
            temporary = cache_path.with_suffix(".tmp")
            temporary.write_bytes(pcm)
            os.replace(temporary, cache_path)
        return pcm

    async def synthesize_stream(self, text_or_stream, reference_audio_path: str) -> AsyncIterator[bytes]:
        if isinstance(text_or_stream, str):
            for sentence in self.split_sentences(text_or_stream):
                pcm = await asyncio.to_thread(self.synthesize_sentence_chunk, sentence, reference_audio_path)
                if pcm:
                    yield pcm
        else:
            async for text in text_or_stream:
                for sentence in self.split_sentences(text):
                    pcm = await asyncio.to_thread(self.synthesize_sentence_chunk, sentence, reference_audio_path)
                    if pcm:
                        yield pcm
