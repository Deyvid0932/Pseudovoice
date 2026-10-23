import logging
from typing import Dict, List, Optional
from .session import Rule

logger = logging.getLogger("pseudovoice.rules_cache")

class RulesMemoryCache:
    """
    Caché en memoria de directivas de voz y reglas jerárquicas.
    Elimina cualquier llamada HTTP síncrona durante el ciclo en tiempo real de voz.
    Acceso O(1) directo en RAM.
    """

    def __init__(self):
        self._cache: Dict[int, List[Rule]] = {}

    def set_rules(self, character_id: int, rules: List[Rule]) -> None:
        """Almacena o actualiza las reglas asociadas a un personaje."""
        self._cache[character_id] = rules
        logger.info(
            "Caché actualizada para character_id=%d: %d reglas registradas.",
            character_id,
            len(rules),
        )

    def get_rules(self, character_id: int) -> List[Rule]:
        """Obtiene las reglas en memoria para el personaje. Si no hay, retorna lista vacía."""
        return self._cache.get(character_id, [])

    def has_rules(self, character_id: int) -> bool:
        """Verifica si existen reglas en memoria para el personaje."""
        return character_id in self._cache and len(self._cache[character_id]) > 0

    def clear(self) -> None:
        """Limpia toda la caché en memoria."""
        self._cache.clear()

# Singleton global de acceso ultra rápido
rules_cache = RulesMemoryCache()
