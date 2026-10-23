"""Personality prompt composition safeguards."""
import unittest

from pseudovoice.prompt_builder import build_system_prompt
from pseudovoice.session import Rule


class PromptBuilderTests(unittest.TestCase):
    def test_personality_prompt_is_included_and_cannot_override_system_limits(self):
        prompt = build_system_prompt(7, [], "Eres cálida y curiosa.")
        self.assertIn("### PROMPT BASE DE PERSONALIDAD DEL PERSONAJE", prompt)
        self.assertIn("Eres cálida y curiosa.", prompt)
        self.assertIn("no puede anular las reglas de seguridad", prompt)
        self.assertIn("LÍMITES DEL SISTEMA", prompt)

    def test_empty_personality_prompt_keeps_neutral_default_and_existing_rules(self):
        rule = Rule(id=1, category="PERSONALIDAD", code="warm", shortLabel="Cálida",
                    description="Habla con calidez.", priority=1, isActive=True)
        prompt = build_system_prompt(2, [rule], "  ")
        self.assertNotIn("PROMPT BASE DE PERSONALIDAD", prompt)
        self.assertIn("Cálida: Habla con calidez.", prompt)


if __name__ == "__main__":
    unittest.main()
