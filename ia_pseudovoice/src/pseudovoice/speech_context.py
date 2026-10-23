"""Session-owned recognition hints derived from authorized factual context."""
import re
import time
from dataclasses import dataclass, field

from .config import settings

TERM = re.compile(r"\b(?:[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ+#.-]*(?:[ \t]+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ+#.-]*){0,3})\b")
STOP = {"El", "La", "Los", "Las", "Un", "Una", "Es", "Le", "Tiene", "Estudia", "Trabaja", "Vive", "Me", "Se", "Soy", "Estoy", "Usuario", "Personaje"}


@dataclass
class SpeechContext:
    # Each socket owns its cache; no context can survive a change of identity.
    identity: tuple[int, int, int]
    data: dict = field(default_factory=dict)
    updated_at: float = 0.0
    dirty: bool = True

    def update(self, data: dict) -> None:
        if (data.get("userId"), data.get("characterId")) != self.identity[:2]:
            raise ValueError("El contexto no pertenece a esta sesión.")
        self.data = data
        self.updated_at = time.monotonic()
        self.dirty = False

    def needs_refresh(self) -> bool:
        return self.dirty or time.monotonic() - self.updated_at >= settings.SPEECH_CONTEXT_TTL_SECONDS

    def prompt(self, history: list) -> tuple[str, str]:
        values = settings.STT_BASE_VOCABULARY.split(",")
        values += [self.data.get("userName", ""), self.data.get("characterName", "")]
        # Only the server's approved, non-sensitive, scoped subset is eligible.
        sources = list(self.data.get("recognitionMemories", [])) + list(self.data.get("individualInstructions", []))
        for source in sources:
            values.extend(term for term in TERM.findall(source) if term not in STOP)
        terms, seen, size = [], set(), 0
        for value in values:
            term = " ".join(str(value).split()).strip()[:100]
            if not term or term.casefold() in seen:
                continue
            extra = len(term) + (2 if terms else 0)
            if len(terms) >= settings.STT_MAX_TERMS or size + extra > settings.STT_MAX_VOCABULARY_CHARS:
                break
            terms.append(term)
            seen.add(term.casefold())
            size += extra
        anchor = ", ".join(terms)
        recent = next((str(item.content)[-settings.STT_ASSISTANT_CONTEXT_CHARS:] for item in reversed(history)
                       if getattr(item, "type", None) == "ai" and isinstance(item.content, str)), "")
        return anchor, (anchor + (". " + recent if recent else ""))
