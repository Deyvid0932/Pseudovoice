"""Local CPU and authenticated session checks without network calls."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from pseudovoice import engine, server
from pseudovoice.session import SessionConfig


class LocalEngineTests(unittest.TestCase):
    def test_response_length_defaults_to_normal(self):
        config = SessionConfig(character_id=1, reference_audio_name="fish:voice_123456789")
        self.assertEqual(config.response_length, "normal")
        for value in ("short", "normal", "long"):
            self.assertEqual(SessionConfig(character_id=1, reference_audio_name="fish:voice_123456789",
                                           response_length=value).response_length, value)
        with self.assertRaises(ValueError):
            SessionConfig(character_id=1, reference_audio_name="fish:voice_123456789", response_length="invalid")

    def test_whisper_uses_cpu_int8(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(engine.settings, "WHISPER_MODEL_DIR", Path(folder)), \
                 patch.object(engine.settings, "VOICES_DIR", Path(folder)), \
                 patch("faster_whisper.WhisperModel") as whisper:
                local = engine.InferenceEngine()
            self.assertEqual(local.device, "cpu")
            self.assertEqual(whisper.call_args.kwargs["device"], "cpu")
            self.assertEqual(whisper.call_args.kwargs["compute_type"], "int8")

    def test_websocket_auth_and_session_ownership(self):
        with patch.object(server.settings, "INFERENCE_ACCESS_KEY", "test-key" * 8), \
             patch.object(server, "resolve_user", return_value=7) as user, \
             patch.object(server, "conversation_context", return_value={"userId": 7, "characterId": 1}) as context, \
             patch.object(server, "authorize_model", return_value={"visibility": "public"}) as authorize, \
             patch.object(server, "load_recent_history", return_value=[]) as history, \
             patch.object(httpx.AsyncClient, "get", side_effect=AssertionError("Unexpected network")):
            client = TestClient(server.app)  # No lifespan/model downloads or queue worker.
            with client.websocket_connect("/ws/inference") as ws:
                ws.send_json({"type": "auth", "token": "test-key" * 8})
                self.assertEqual(ws.receive_json()["type"], "authenticated")
                message = {"type": "session_config", "conversation_id": 1, "user_token": "user-jwt", "data": {
                    "character_id": 1, "reference_audio_name": "fish:voice_123456789", "character_rules": []}}
                for wrong in ({"userId": 8, "characterId": 1}, {"userId": 7, "characterId": 2}):
                    context.return_value = wrong
                    ws.send_json(message)
                    self.assertEqual(ws.receive_json()["type"], "error")
                    authorize.assert_not_called()
                    history.assert_not_awaited()
                context.return_value = {"userId": 7, "characterId": 1}
                ws.send_json(message)
                self.assertEqual(ws.receive_json()["type"], "session_ready")
                ws.send_json({"type": "ping"})
                self.assertEqual(ws.receive_json()["type"], "pong")
            user.assert_awaited_with("Bearer user-jwt")
            context.assert_awaited_with(1)
            authorize.assert_called_once_with("voice_123456789", 7)
            history.assert_awaited_once_with(1)

    def test_websocket_discards_capture_before_next_voice_turn(self):
        with patch.object(server.settings, "INFERENCE_ACCESS_KEY", ""), \
             patch.object(server, "resolve_user", return_value=7), \
             patch.object(server, "conversation_context", return_value={"userId": 7, "characterId": 1}), \
             patch.object(server, "authorize_model"), \
             patch.object(server.asyncio, "to_thread", new=AsyncMock(return_value={})), \
             patch.object(server, "load_recent_history", return_value=[]), \
             patch.object(server, "process_turn") as turn:
            ws = AsyncMock()
            ws.receive.side_effect = [
                {"text": json.dumps({"type": "session_config", "conversation_id": 1, "user_token": "user-jwt", "data": {
                    "character_id": 1, "reference_audio_name": "fish:voice_123456789", "character_rules": []}})},
                {"bytes": b"old-capture"},
                {"text": json.dumps({"type": "discard_audio"})},
                {"text": json.dumps({"type": "end_of_speech"})},
                {"bytes": b"new-user-speech"},
                {"text": json.dumps({"type": "end_of_speech"})},
                {"type": "websocket.disconnect"},
            ]
            asyncio.run(server.websocket_inference_endpoint(ws))
            self.assertEqual(ws.send_json.call_args_list[0].args[0]["type"], "session_ready")
            turn.assert_awaited_once()
            self.assertEqual(turn.call_args.args[1], b"new-user-speech")

    def test_websocket_backend_voice_overrides_client_and_rejection_clears_session(self):
        with patch.object(server.settings, "INFERENCE_ACCESS_KEY", ""), \
             patch.object(server, "resolve_user", return_value=7), \
             patch.object(server, "conversation_context", return_value={"userId": 7, "characterId": 1,
                          "referenceAudioPath": "fish:backend_voice_123"}) as context, \
             patch.object(server, "authorize_model") as authorize, \
             patch.object(server, "load_recent_history", return_value=[]), \
             patch.object(server, "process_turn") as turn:
            client = TestClient(server.app)
            with client.websocket_connect("/ws/inference") as ws:
                message = {"type": "session_config", "conversation_id": 1, "user_token": "user-jwt", "data": {
                    "character_id": 1, "reference_audio_name": "fish:client_voice_123", "character_rules": []}}
                ws.send_json(message)
                self.assertEqual(ws.receive_json()["type"], "session_ready")
                authorize.assert_called_once_with("backend_voice_123", 7)
                context.return_value = {"userId": 8, "characterId": 1}
                ws.send_json(message)
                self.assertEqual(ws.receive_json()["type"], "error")
                ws.send_json({"type": "text_message", "text": "Hola"})
                self.assertEqual(ws.receive_json()["type"], "error")
                turn.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
