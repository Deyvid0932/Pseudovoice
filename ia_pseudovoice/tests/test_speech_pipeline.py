"""Voice admission, authorized hints and cloud fallback without provider calls."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage

from pseudovoice import server
from pseudovoice.config import settings
from pseudovoice.engine import InferenceEngine
from pseudovoice.resilient_queue import ResilientMessageQueue
from pseudovoice.speech_context import SpeechContext
from pseudovoice.speech_recognition import RecognitionResult, SpeechRecognizer, discard_transcript
from pseudovoice.speech_vad import SpeechSegmenter


class Detector:
    def __init__(self, probabilities):
        self.probabilities = iter(probabilities)

    def reset(self):
        pass

    def __call__(self, frame):
        return next(self.probabilities, 0)


class VoiceAdmissionTests(unittest.TestCase):
    def test_exact_preroll_first_syllable_and_natural_pause(self):
        segmenter = SpeechSegmenter(Detector([0] * 20 + [.95] * 10 + [0] * 47))
        quiet = b"\x01\x00" * 512 * 20
        self.assertEqual(segmenter.feed(quiet), [])
        self.assertEqual(len(segmenter.pre_roll), 9600)
        voice = b"\x10\x00" * 512 * 10
        self.assertEqual(segmenter.feed(voice), [])
        self.assertEqual(segmenter.feed(bytes(1024 * 46)), [])
        turns = segmenter.feed(bytes(1024))
        self.assertEqual(len(turns), 1)
        self.assertEqual(turns[0].speech_ms, 320)
        self.assertEqual(turns[0].audio[:9600], quiet[-9600:])
        self.assertEqual(turns[0].audio[9600:9600 + len(voice)], voice)

    def test_hold_to_talk_waits_for_release_and_reset_removes_old_pcm(self):
        segmenter = SpeechSegmenter(Detector([.95] * 5 + [0] * 60))
        self.assertEqual(segmenter.feed(bytes(1024 * 65), auto_end=False), [])
        self.assertEqual(segmenter.finish().speech_ms, 160)
        self.assertIsNone(segmenter.finish())
        self.assertFalse(segmenter.audio)
        self.assertFalse(segmenter.pre_roll)

    def test_silence_is_bounded_and_does_not_submit(self):
        segmenter = SpeechSegmenter(Detector([]))
        self.assertEqual(segmenter.feed(bytes(16000 * 2 * 5)), [])
        self.assertLessEqual(len(segmenter.pre_roll), 9600)
        self.assertIsNone(segmenter.finish())

    def test_short_replies_and_legitimate_repetition_are_not_blacklisted(self):
        for text in ["Sí", "No", "Ya", "OK", "Vale", "Para", "Stop"]:
            self.assertFalse(discard_transcript(text, "Deyvi, Rem", 128, 128))
        self.assertTrue(discard_transcript("sí", "", 96, 96))
        self.assertTrue(discard_transcript("UTP", "", 128, 128))
        self.assertFalse(discard_transcript("Todo bien", "Todo bien", 320, 320))
        self.assertFalse(discard_transcript("Me llamo Deyvi", "Me llamo Deyvi", 500, 320))
        self.assertTrue(discard_transcript("Subtítulos por amara.org", "", 500, 0))
        self.assertFalse(discard_transcript("Busco subtítulos por amara.org", "", 700, 320))


class ContextTests(unittest.TestCase):
    def test_hints_use_authorized_memories_and_only_last_assistant(self):
        cache = SpeechContext((7, 3, 4))
        cache.update({"userId": 7, "characterId": 3, "userName": "Deyvi", "characterName": "Rem",
                      "recognitionMemories": ["Estudia en la UTP y programa en Spring Boot."],
                      "individualInstructions": ["Habla de Java."], "sensitiveMemories": ["SecretoPrivado"]})
        anchor, prompt = cache.prompt([AIMessage(content="ViejoContexto"), HumanMessage(content="ErrorDelMicrofono"),
                                       AIMessage(content="x" * 300 + "Final"), HumanMessage(content="OtroError")])
        self.assertIn("Spring Boot", anchor)
        self.assertIn("UTP", anchor)
        self.assertNotIn("SecretoPrivado", prompt)
        self.assertNotIn("ErrorDelMicrofono", prompt)
        self.assertNotIn("ViejoContexto", prompt)
        self.assertTrue(prompt.endswith("x" * 245 + "Final"))
        with self.assertRaises(ValueError):
            cache.update({"userId": 8, "characterId": 3})

    def test_hints_are_bounded_and_never_include_full_memories(self):
        cache = SpeechContext((1, 2, 3))
        cache.update({"userId": 1, "characterId": 2,
                      "recognitionMemories": ["Estudia en " + " ".join(f"Producto{i}" for i in range(100))]})
        anchor, _ = cache.prompt([])
        self.assertLessEqual(len(anchor), 600)
        self.assertLessEqual(len(anchor.split(", ")), 30)
        self.assertNotIn("Estudia en", anchor)


class RecognitionTests(unittest.IsolatedAsyncioTestCase):
    async def test_groq_receives_prompt_once_without_local_pass(self):
        local = MagicMock()
        recognizer = SpeechRecognizer()
        request = httpx.Request("POST", "https://api.groq.com/openai/v1/audio/transcriptions")
        response = httpx.Response(200, request=request, json={"text": "Hola Rem.", "segments": []})
        post = AsyncMock(return_value=response)
        client = AsyncMock()
        client.post = post
        with patch.object(settings, "STT_MODE", "hybrid"), patch.object(settings, "GROQ_API_KEY", "test-only"), \
             patch("pseudovoice.speech_recognition.httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            result = await recognizer.recognize(local, bytes(16000), "UTP, Rem", asyncio.Lock())
        self.assertEqual(result.provider, "groq")
        self.assertEqual(post.await_count, 1)
        self.assertEqual(post.call_args.kwargs["data"]["prompt"], "UTP, Rem")
        self.assertEqual(post.call_args.kwargs["files"]["file"][1][:4], b"RIFF")
        local.transcribe_result.assert_not_called()

    async def test_failed_groq_falls_back_with_same_prompt_and_cooldown(self):
        local = MagicMock()
        local.transcribe_result.side_effect = lambda pcm, prompt: RecognitionResult("Hola Rem", "whisper", "base")
        recognizer = SpeechRecognizer()
        client = AsyncMock()
        client.post.side_effect = httpx.ConnectError("offline")
        with patch.object(settings, "STT_MODE", "hybrid"), patch.object(settings, "GROQ_API_KEY", "test-only"), \
             patch("pseudovoice.speech_recognition.httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            first = await recognizer.recognize(local, bytes(1024), "UTP, Rem", asyncio.Lock())
            second = await recognizer.recognize(local, bytes(1024), "UTP, Rem", asyncio.Lock())
        self.assertEqual(first.fallback_reason, "cloud_unavailable")
        self.assertEqual(second.fallback_reason, "cooldown")
        self.assertEqual(client.post.await_count, 1)
        self.assertEqual(local.transcribe_result.call_count, 2)
        self.assertEqual(local.transcribe_result.call_args.args[1], "UTP, Rem")

    async def test_cache_refresh_failure_stays_scoped_and_revocation_clears(self):
        socket = object()
        cache = SpeechContext((7, 3, 4))
        cache.update({"userId": 7, "characterId": 3, "recognitionMemories": ["UTP"]})
        server.speech_contexts[socket] = cache
        try:
            with patch.object(server, "conversation_context", new=AsyncMock(side_effect=httpx.ConnectError("offline"))):
                self.assertIs(await server.refresh_speech_context(socket, force=True), cache)
                self.assertEqual(cache.data["recognitionMemories"], ["UTP"])
            with patch.object(server, "conversation_context", new=AsyncMock(return_value={
                    "userId": 7, "characterId": 3, "recognitionMemories": ["Java"]})):
                await server.refresh_speech_context(socket, force=True)
                self.assertEqual(cache.data["recognitionMemories"], ["Java"])
            request = httpx.Request("GET", "http://test/context")
            error = httpx.HTTPStatusError("revoked", request=request, response=httpx.Response(403, request=request))
            with patch.object(server, "conversation_context", new=AsyncMock(side_effect=error)):
                with self.assertRaises(httpx.HTTPStatusError):
                    await server.refresh_speech_context(socket, force=True)
                self.assertEqual(cache.data, {})
        finally:
            server.speech_contexts.pop(socket, None)

    async def test_queue_preserves_metadata_in_single_idempotent_turn(self):
        queue = ResilientMessageQueue()
        metrics = dict.fromkeys(["stt_latency_ms", "decision_latency_ms", "llm_latency_ms", "tts_latency_ms", "total_turn_latency_ms"], 0)
        await queue.enqueue_turn(4, "turn-1", "Hola", "Hola Deyvi", "reactive", metrics,
                                 transcription_metadata={"provider": "groq", "original": "Hola"})
        batch = await queue._queue.get()
        self.assertEqual(len(batch["messages"]), 2)
        self.assertEqual(batch["messages"][0]["transcriptionMetadata"]["provider"], "groq")
        self.assertEqual({m["turnId"] for m in batch["messages"]}, {"turn-1"})

    def test_local_engine_passes_initial_prompt_and_preserves_segments(self):
        local = InferenceEngine.__new__(InferenceEngine)
        local.whisper = MagicMock()
        local.whisper.transcribe.return_value = ([SimpleNamespace(start=0, end=.5, text=" Hola Rem ", avg_logprob=-.1, no_speech_prob=.01)], None)
        result = local.transcribe_result(bytes(16000), "UTP, Rem")
        self.assertEqual(local.whisper.transcribe.call_args.kwargs["initial_prompt"], "UTP, Rem")
        self.assertEqual(result.original, "Hola Rem")
        self.assertEqual(result.segments[0]["start"], 0)


class StreamingTests(unittest.TestCase):
    def test_server_vad_transcribes_and_persists_only_one_turn(self):
        local = MagicMock()
        local.transcribe_result.return_value = RecognitionResult("hola", "whisper", "base", "hola")
        local.get_reference_audio_path.return_value = "fish:voice_123456789"
        detector = Detector([0] * 12 + [.95] * 10 + [0] * 47)
        with patch.object(server, "engine", local), patch.object(settings, "STT_MODE", "local"), \
             patch.object(settings, "INFERENCE_ACCESS_KEY", ""), \
             patch.object(server, "resolve_user", return_value=7), \
             patch.object(server, "conversation_context", return_value={"userId": 7, "characterId": 3}), \
             patch.object(server, "authorize_model"), patch.object(server, "load_recent_history", return_value=[]), \
             patch.object(server, "SpeechSegmenter", side_effect=lambda: SpeechSegmenter(detector)), \
             patch.object(server, "synthesize_and_send", return_value=False), \
             patch.object(server, "queue_memory_turn", new=AsyncMock()), \
             patch.object(server.message_queue, "enqueue_turn", new=AsyncMock()) as persist:
            with TestClient(server.app).websocket_connect("/ws/inference") as ws:
                ws.send_json({"type": "session_config", "conversation_id": 4, "user_token": "jwt", "server_vad": True,
                              "data": {"character_id": 3, "reference_audio_name": "fish:voice_123456789"}})
                self.assertTrue(ws.receive_json()["server_vad"])
                ws.send_json({"type": "capture_start", "auto_end": True})
                ws.send_bytes(bytes(1024 * 69))
                events = []
                while not events or events[-1]["type"] != "turn_complete":
                    events.append(ws.receive_json())
                self.assertEqual([e["type"] for e in events], ["turn_start", "transcript", "assistant_response", "turn_complete"])
                self.assertEqual(events[1]["transcription_metadata"]["speech_ms"], 320)
                self.assertEqual(len({e["turn_id"] for e in events}), 1)
                ws.send_json({"type": "end_of_speech"})
                self.assertEqual(ws.receive_json()["type"], "capture_discarded")
            persist.assert_awaited_once()
            local.transcribe_result.assert_called_once()


if __name__ == "__main__":
    unittest.main()
