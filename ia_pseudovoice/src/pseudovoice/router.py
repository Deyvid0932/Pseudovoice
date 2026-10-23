import re
import time
from typing import Optional, Tuple
from .session import PCCommand, RoutingDecision


class LocalIntentRouter:

    def __init__(self):
        self.re_open_app = re.compile(
            r"\b(abre|abrir|inicia|iniciar|ejecuta|ejecutar|lanzar)\s+(el\s+|la\s+)?(spotify|chrome|discord|steam|terminal|navegador|vscode|blender|obs|calculator|calculadora)\b",
            re.IGNORECASE,
        )
        self.re_close_app = re.compile(
            r"\b(cierra|cerrar|termina|terminar|mata|matar)\s+(el\s+|la\s+)?(spotify|chrome|discord|steam|terminal|navegador|vscode|blender|obs|calculator|calculadora)\b",
            re.IGNORECASE,
        )
        self.re_volume_up = re.compile(
            r"\b(sube|subir|aumenta|aumentar|más)\s+(el\s+)?(volumen|audio|sonido)\b",
            re.IGNORECASE,
        )
        self.re_volume_down = re.compile(
            r"\b(baja|bajar|reduce|reducir|menos)\s+(el\s+)?(volumen|audio|sonido)\b",
            re.IGNORECASE,
        )
        self.re_mute = re.compile(
            r"\b(silencia|silenciar|mutea|mutear|apaga el micro|silencio|quitar sonido)\b",
            re.IGNORECASE,
        )
        self.re_media_play_pause = re.compile(
            r"\b(pausa|pausar|reanuda|reanudar|reproduce|reproducir)\s*(la música|el video|la canción)?\b",
            re.IGNORECASE,
        )
        self.re_media_next = re.compile(
            r"\b(siguiente|pasa)\s+(canción|tema|pista|video)\b",
            re.IGNORECASE,
        )
        self.re_web_action = re.compile(
            r"\b(busca|buscar|investiga|investigar|navega|navegar|visita|visitar|entra|entrar|accede|acceder|consulta|consultar|ve|abre|abrir|haz clic|presiona|rellena|completa|envía|envia|descarga|sube|publica|crea|redacta|escribe|reserva|compra)\b",
            re.IGNORECASE,
        )
        self.re_web_target = re.compile(
            r"\b(internet|web|página|pagina|sitio|navegador|google|youtube|amazon|github|docs|formulario|url)\b|https?://|\b[a-z0-9-]+\.(com|org|net|io|gov|edu)\b",
            re.IGNORECASE,
        )

        self.re_acknowledgments = re.compile(
            r"^(ok|vale|entendido|de acuerdo|gracias|muchas gracias|perfecto|claro|excelente|exacto|listo)\b[.!?:;]?$",
            re.IGNORECASE,
        )
        self.re_greetings = re.compile(
            r"^(?:hola|hey|buenas|buenos días|buenas tardes|buenas noches)(?:[,!?. ]+(?:jev))?[.!? ]*$",
            re.IGNORECASE,
        )
        self.re_how_are_you = re.compile(
            r"^(?:¿?cómo estás|¿?cómo te va|¿?qué tal estás|¿?cómo andas)(?:[,!? ]+(?:jev))?[.!? ]*$",
            re.IGNORECASE,
        )

    def evaluate(self, transcript: str) -> Tuple[RoutingDecision, float]:
        """
        Ejecuta la evaluación de intención y mide la latencia exacta en milisegundos.
        Garantiza latencia < 50ms (típicamente < 2ms).
        """
        start_time = time.perf_counter()
        clean_text = transcript.strip()
        if re.search(r"\b(no|nunca|sin)\b", clean_text, re.I):
            return RoutingDecision(route="complex", needs_llm=True), (time.perf_counter() - start_time) * 1000

        pc_decision = self._check_pc_commands(clean_text)
        if pc_decision:
            latency_ms = (time.perf_counter() - start_time) * 1000
            return pc_decision, latency_ms

        if self.re_web_action.search(clean_text) and self.re_web_target.search(clean_text):
            decision = RoutingDecision(route="web_task", needs_llm=False)
            return decision, (time.perf_counter() - start_time) * 1000

        reactive_decision = self._check_reactive(clean_text)
        if reactive_decision:
            latency_ms = (time.perf_counter() - start_time) * 1000
            return reactive_decision, latency_ms

        decision = RoutingDecision(
            route="complex",
            tts_text=None,
            command=None,
            needs_llm=True,
        )
        latency_ms = (time.perf_counter() - start_time) * 1000
        return decision, latency_ms

    def _check_pc_commands(self, text: str) -> Optional[RoutingDecision]:
        text = re.sub(r"^(?:jev[,:]?\s*)?(?:por favor[,:]?\s*)?", "", text, flags=re.IGNORECASE).strip()
        text = text.rstrip(".!? ")
        m = self.re_open_app.fullmatch(text)
        if m:
            app_target = m.group(3).lower()
            return RoutingDecision(
                route="pc_command",
                command=PCCommand(action="open_app", target=app_target),
                tts_text=f"Confirma en pantalla si quieres abrir {app_target}.",
                needs_llm=False,
            )

        m = self.re_close_app.fullmatch(text)
        if m:
            app_target = m.group(3).lower()
            return RoutingDecision(
                route="pc_command",
                command=PCCommand(action="close_app", target=app_target),
                tts_text=f"Confirma en pantalla si quieres cerrar {app_target}.",
                needs_llm=False,
            )

        if self.re_volume_up.match(text):
            return RoutingDecision(
                route="pc_command",
                command=PCCommand(action="volume_control", target="up", parameters={"step": 10}),
                tts_text="He solicitado subir el volumen al control de tu PC.",
                needs_llm=False,
            )

        if self.re_volume_down.match(text):
            return RoutingDecision(
                route="pc_command",
                command=PCCommand(action="volume_control", target="down", parameters={"step": 10}),
                tts_text="He solicitado bajar el volumen al control de tu PC.",
                needs_llm=False,
            )

        if self.re_mute.match(text):
            return RoutingDecision(
                route="pc_command",
                command=PCCommand(action="volume_control", target="mute"),
                tts_text="He solicitado cambiar el silencio al control de tu PC.",
                needs_llm=False,
            )

        if self.re_media_play_pause.match(text):
            return RoutingDecision(
                route="pc_command",
                command=PCCommand(action="media_control", target="play_pause"),
                tts_text="Pausando o reproduciendo medio.",
                needs_llm=False,
            )

        if self.re_media_next.match(text):
            return RoutingDecision(
                route="pc_command",
                command=PCCommand(action="media_control", target="next_track"),
                tts_text="Siguiente pista.",
                needs_llm=False,
            )

        return None

    def _check_reactive(self, text: str) -> Optional[RoutingDecision]:
        if self.re_greetings.match(text):
            return RoutingDecision(
                route="reactive",
                tts_text="¡Hola! Qué gusto escucharte. ¿Cómo estás?",
                needs_llm=False,
            )
        if self.re_how_are_you.match(text):
            return RoutingDecision(
                route="reactive",
                tts_text="Estoy bien, gracias por preguntar. Me alegra que estemos hablando.",
                needs_llm=False,
            )

        if self.re_acknowledgments.search(text):
            lower = text.lower()
            if "gracias" in lower:
                reply = "¡Con mucho gusto!"
            elif "ok" in lower or "vale" in lower or "entendido" in lower or "de acuerdo" in lower:
                reply = "Entendido."
            else:
                reply = "De acuerdo."

            return RoutingDecision(
                route="reactive",
                tts_text=reply,
                needs_llm=False,
            )

        return None


JevRouter = LocalIntentRouter
