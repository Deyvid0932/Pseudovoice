"""Streaming Silero ONNX with independent recurrent state and bounded PCM buffers."""
from dataclasses import dataclass

import numpy as np

from .config import settings


class SileroStream:
    def __init__(self):
        # Reuse the CPU ONNX session bundled with faster-whisper, never PyTorch.
        from faster_whisper.vad import get_vad_model
        self.session = get_vad_model().session
        self.inputs = {item.name for item in self.session.get_inputs()}
        self.reset()

    def reset(self):
        self.h = np.zeros((1, 1, 128), dtype=np.float32)
        self.c = np.zeros((1, 1, 128), dtype=np.float32)
        self.state = np.zeros((2, 1, 128), dtype=np.float32)
        self.context = np.zeros((1, 64), dtype=np.float32)

    def __call__(self, pcm: bytes) -> float:
        audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32).reshape(1, -1) / 32768
        inputs = {"input": np.concatenate([self.context, audio], axis=1)}
        if "h" in self.inputs:
            inputs.update(h=self.h, c=self.c)
            probability, self.h, self.c = self.session.run(None, inputs)
        else:
            inputs.update(state=self.state, sr=np.array(16000, dtype=np.int64))
            probability, self.state = self.session.run(None, inputs)
        self.context = audio[:, -64:].copy()
        return float(probability.reshape(-1)[0])


@dataclass
class SpeechSegment:
    audio: bytes
    speech_ms: float
    strong_ms: float


class SpeechSegmenter:
    FRAME_BYTES = 512 * 2
    FRAME_MS = 32

    def __init__(self, detector=None):
        self.detector = detector or SileroStream()
        self.reset()

    def reset(self):
        self.pending = bytearray()
        self.pre_roll = bytearray()
        self.audio = bytearray()
        self.speech_ms = self.strong_ms = self.silence_ms = self.strong_run_ms = 0
        self.detector.reset()

    def feed(self, pcm: bytes, auto_end: bool = True) -> list[SpeechSegment]:
        if len(pcm) % 2:
            raise ValueError("PCM debe contener muestras completas de 16 bits.")
        self.pending.extend(pcm)
        segments = []
        while len(self.pending) >= self.FRAME_BYTES:
            frame = bytes(self.pending[:self.FRAME_BYTES])
            del self.pending[:self.FRAME_BYTES]
            probability = self.detector(frame)
            speech = probability >= settings.VAD_THRESHOLD
            if speech and not self.audio:
                self.audio.extend(self.pre_roll)
                self.pre_roll.clear()
            if self.audio or speech:
                self.audio.extend(frame)
                if speech:
                    self.speech_ms += self.FRAME_MS
                    self.silence_ms = 0
                else:
                    self.silence_ms += self.FRAME_MS
                self.strong_run_ms = self.strong_run_ms + self.FRAME_MS if probability >= settings.VAD_STRONG_THRESHOLD else 0
                self.strong_ms = max(self.strong_ms, self.strong_run_ms)
                if len(self.audio) > 16000 * 2 * 90:
                    self.reset()
                    raise ValueError("El turno de voz supera 90 segundos.")
                if auto_end and self.silence_ms >= settings.VAD_SILENCE_MS:
                    remaining = self.pending
                    self.pending = bytearray()
                    segment = self.finish()
                    self.pending = remaining
                    if segment:
                        segments.append(segment)
            else:
                self.pre_roll.extend(frame)
                limit = settings.VAD_PRE_ROLL_MS * 16 * 2
                if len(self.pre_roll) > limit:
                    del self.pre_roll[:-limit]
        return segments

    def finish(self) -> SpeechSegment | None:
        # Keep the unprocessed tail, but do not count padding as detected speech.
        result = SpeechSegment(bytes(self.audio + self.pending), self.speech_ms, self.strong_ms) if self.audio else None
        self.reset()
        return result
