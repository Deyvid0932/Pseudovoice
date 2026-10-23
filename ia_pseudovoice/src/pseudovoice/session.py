from typing import Any, Dict, List, Literal, Optional

try:
    from pydantic import BaseModel, Field

    class Rule(BaseModel):
        """Regla individual asociada a un personaje, alineada con backend PostgreSQL (Integer)."""
        id: int
        category: str
        code: str
        shortLabel: str
        description: str
        priority: int = Field(..., description="Prioridad jerárquica. Menor número = mayor jerarquía.")
        isActive: bool = True

    class SessionConfig(BaseModel):
        """Metadatos de sesión transmitidos por el cliente al iniciar o actualizar la conexión."""
        character_id: int
        reference_audio_name: str
        character_rules: List[Rule] = []
        response_length: Literal["short", "normal", "long"] = "normal"
        save_response_audio: bool = False

    class PCCommand(BaseModel):
        """Payload de comando estructurado para ejecución por el cliente nativo/OS Controller."""
        action: str = Field(..., description="Acción a realizar: 'open_app', 'close_app', 'volume_control', 'media_control', 'system_action'")
        target: str = Field(..., description="Objetivo: 'spotify', 'chrome', 'mute', 'up', 'down', etc.")
        parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)

    class RoutingDecision(BaseModel):
        """Resultado de la clasificación local de intención."""
        route: Literal["pc_command", "reactive", "web_task", "complex"]
        tts_text: Optional[str] = None
        command: Optional[PCCommand] = None
        needs_llm: bool = False

    class TelemetryMetrics(BaseModel):
        """Métricas de latencia exactas medidas en cada fase del pipeline."""
        stt_latency_ms: float = 0.0
        decision_latency_ms: float = 0.0
        llm_latency_ms: float = 0.0
        tts_latency_ms: float = 0.0  # Time To First Audio Chunk (TTFAC)
        total_turn_latency_ms: float = 0.0

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class Rule:
        id: int
        category: str
        code: str
        shortLabel: str
        description: str
        priority: int
        isActive: bool = True

    @dataclass
    class SessionConfig:
        character_id: int
        reference_audio_name: str
        character_rules: List[Rule] = field(default_factory=list)
        response_length: str = "normal"
        save_response_audio: bool = False

    @dataclass
    class PCCommand:
        action: str
        target: str
        parameters: Optional[Dict[str, Any]] = field(default_factory=dict)

        def model_dump(self):
            return {"action": self.action, "target": self.target, "parameters": self.parameters}

    @dataclass
    class RoutingDecision:
        route: str
        tts_text: Optional[str] = None
        command: Optional[PCCommand] = None
        needs_llm: bool = False

    @dataclass
    class TelemetryMetrics:
        stt_latency_ms: float = 0.0
        decision_latency_ms: float = 0.0
        llm_latency_ms: float = 0.0
        tts_latency_ms: float = 0.0
        total_turn_latency_ms: float = 0.0

        def model_dump(self):
            return {
                "stt_latency_ms": self.stt_latency_ms,
                "decision_latency_ms": self.decision_latency_ms,
                "llm_latency_ms": self.llm_latency_ms,
                "tts_latency_ms": self.tts_latency_ms,
                "total_turn_latency_ms": self.total_turn_latency_ms,
            }

