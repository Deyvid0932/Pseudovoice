import unittest

from pseudovoice.router import JevRouter, LocalIntentRouter


class LocalIntentRouterTests(unittest.TestCase):
    def setUp(self):
        self.router = LocalIntentRouter()

    def test_pc_command_is_routed_locally(self):
        decision, _ = self.router.evaluate("Abre Chrome")

        self.assertEqual(decision.route, "pc_command")
        self.assertEqual(decision.command.action, "open_app")
        self.assertEqual(decision.command.target, "chrome")
        self.assertFalse(decision.needs_llm)

    def test_reactive_message_does_not_need_llm(self):
        decision, _ = self.router.evaluate("Hola")

        self.assertEqual(decision.route, "reactive")
        self.assertFalse(decision.needs_llm)

    def test_normal_question_uses_deepseek_route(self):
        decision, _ = self.router.evaluate("¿Qué opinas de esta idea?")

        self.assertEqual(decision.route, "complex")
        self.assertTrue(decision.needs_llm)

    def test_explicit_web_request_uses_agent_route(self):
        decision, _ = self.router.evaluate("Busca en internet información sobre energía solar")

        self.assertEqual(decision.route, "web_task")
        self.assertFalse(decision.needs_llm)

    def test_app_launch_is_not_misrouted_to_browser(self):
        decision, _ = self.router.evaluate("Abre Chrome")

        self.assertEqual(decision.route, "pc_command")

    def test_legacy_name_points_to_local_router(self):
        self.assertIs(JevRouter, LocalIntentRouter)


if __name__ == "__main__":
    unittest.main()
