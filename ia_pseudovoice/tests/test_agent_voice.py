import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from pseudovoice import server
from pseudovoice.session import SessionConfig


class AgentVoiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.websocket = AsyncMock()
        self.config = SessionConfig(character_id=3, reference_audio_name="fish:voice_123456789")
        server.voice_sessions[self.websocket] = (4, 3)
        server.voice_output_locks[self.websocket] = asyncio.Lock()

    async def asyncTearDown(self):
        server.voice_sessions.pop(self.websocket, None)
        server.voice_output_locks.pop(self.websocket, None)

    async def test_agent_result_uses_selected_voice_and_audio_lifecycle(self):
        engine = MagicMock()
        synthesize = AsyncMock(return_value=True)
        with patch.object(server, "engine", engine), \
             patch.object(server.settings, "FISH_AUDIO_USD_PER_MILLION_UTF8_BYTES", 1), \
             patch.object(server.asyncio, "to_thread", new=AsyncMock(return_value="fish:voice_123456789")), \
             patch.object(server, "synthesize_and_send", synthesize):
            cost = await server.speak_agent_result(self.websocket, self.config, 4, "Google está abierto", "run-1", {"fishBudgetUsd": 0.01})
        self.assertGreater(cost, 0)
        self.assertEqual(synthesize.await_args.args[2], "fish:voice_123456789")
        self.assertEqual(synthesize.await_args.kwargs["expected_session"], (4, 3))
        self.assertEqual([call.args[0]["type"] for call in self.websocket.send_json.await_args_list], ["turn_start", "turn_complete"])

    async def test_zero_budget_keeps_text_without_paid_synthesis(self):
        with patch.object(server, "engine", MagicMock()), \
             patch.object(server.settings, "FISH_AUDIO_USD_PER_MILLION_UTF8_BYTES", 1), \
             patch.object(server, "synthesize_and_send", new=AsyncMock()) as synthesize:
            cost = await server.speak_agent_result(self.websocket, self.config, 4, "Resultado", "run-1", {"fishBudgetUsd": 0})
        synthesize.assert_not_awaited()
        self.assertEqual(cost, 0)
        self.assertEqual(self.websocket.send_json.await_args.args[0]["type"], "agent_voice_unavailable")

    async def test_changed_conversation_does_not_play_previous_task(self):
        server.voice_sessions[self.websocket] = (8, 3)
        with patch.object(server, "synthesize_and_send", new=AsyncMock()) as synthesize:
            cost = await server.speak_agent_result(self.websocket, self.config, 4, "Resultado", "run-1", {"fishBudgetUsd": 1})
        synthesize.assert_not_awaited()
        self.websocket.send_json.assert_not_awaited()
        self.assertEqual(cost, 0)

    async def test_synthesis_failure_releases_audio_lifecycle(self):
        with patch.object(server, "engine", MagicMock()), \
             patch.object(server.settings, "FISH_AUDIO_USD_PER_MILLION_UTF8_BYTES", 1), \
             patch.object(server.asyncio, "to_thread", new=AsyncMock(return_value="fish:voice_123456789")), \
             patch.object(server, "synthesize_and_send", new=AsyncMock(side_effect=RuntimeError("test"))):
            with self.assertRaises(RuntimeError):
                await server.speak_agent_result(self.websocket, self.config, 4, "Resultado", "run-1", {"fishBudgetUsd": 1})
        self.assertEqual(self.websocket.send_json.await_args.args[0]["type"], "turn_complete")
