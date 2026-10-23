import base64
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from pseudovoice import server
from pseudovoice.wake_phrase import match_wake_phrase


class WakePhraseTests(unittest.TestCase):
    characters = [{"id": 1, "name": "Rem"}, {"id": 2, "name": "Jarvis"}, {"id": 3, "name": "Marin Kitagawa"}]

    def test_selects_any_named_character(self):
        for name, identity in [("Rem", 1), ("Jarvis", 2), ("Marin Kitagawa", 3)]:
            self.assertEqual(match_wake_phrase(f"Oye, {name}.", "Oye", self.characters)["character_id"], identity)

    def test_custom_phrase_preserves_following_request(self):
        result = match_wake_phrase("Despierta ahora Jarvis, busca información de Perú", "Despierta ahora", self.characters)
        self.assertEqual(result, {"character_id": 2, "remaining_text": "busca información de Perú"})

    def test_requires_phrase_at_start_and_complete_character_name(self):
        for text in ["Rem hola", "Me dijo oye Rem", "Oye Rembrandt", "Oye Marin", "Oye desconocido"]:
            self.assertIsNone(match_wake_phrase(text, "Oye", self.characters)["character_id"])

    def test_ambiguous_names_do_not_activate(self):
        self.assertIsNone(match_wake_phrase("Oye Rem", "Oye", [{"id": 1, "name": "Rem"}, {"id": 2, "name": "REM"}])["character_id"])

    def test_longest_name_and_accents(self):
        characters = [{"id": 1, "name": "Rem"}, {"id": 2, "name": "Rem García"}]
        self.assertEqual(match_wake_phrase("OYE rem garcia", "Oye", characters)["character_id"], 2)


class WakeEndpointTests(unittest.IsolatedAsyncioTestCase):
    def body(self, pcm=b"\x00\x00" * 4800):
        return server.WakeDetectionRequest(phrase="Oye", characters=[{"id": 1, "name": "Rem"}], audio_base64=base64.b64encode(pcm).decode())

    async def test_uses_local_transcription_without_chat_or_synthesis(self):
        with patch.object(server, "voice_user", new=AsyncMock(return_value=1)) as authorize, \
             patch.object(server, "engine", MagicMock()) as engine, \
             patch.object(server.asyncio, "to_thread", new=AsyncMock(return_value="Oye Rem")) as thread, \
             patch.object(server, "synthesize_and_send", new=AsyncMock()) as synthesize:
            result = await server.detect_wake_phrase(self.body(), "service-key", "user-key")
        authorize.assert_awaited_once()
        self.assertEqual(result["character_id"], 1)
        self.assertEqual(thread.await_args.args[0], engine.transcribe)
        synthesize.assert_not_awaited()

    async def test_rejects_invalid_pcm(self):
        with patch.object(server, "voice_user", new=AsyncMock(return_value=1)), patch.object(server, "engine", MagicMock()):
            with self.assertRaises(HTTPException) as error:
                await server.detect_wake_phrase(self.body(b"odd"))
        self.assertEqual(error.exception.status_code, 400)

    async def test_authentication_required_before_transcription(self):
        with patch.object(server, "voice_user", new=AsyncMock(side_effect=HTTPException(401, "Unauthorized"))), \
             patch.object(server.asyncio, "to_thread", new=AsyncMock()) as transcribe:
            with self.assertRaises(HTTPException):
                await server.detect_wake_phrase(self.body())
        transcribe.assert_not_awaited()
