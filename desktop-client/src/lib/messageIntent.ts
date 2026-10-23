export type MessageIntent = "conversation" | "web_task" | "ambiguous_web_task";

const webAction = /\b(busca|buscar|investiga|investigar|navega|navegar|visita|visitar|entra|entrar|accede|acceder|consulta|consultar|ve|abre|abrir|haz clic|presiona|rellena|completa|envía|envia|descarga|sube|publica|crea|redacta|escribe|reserva|compra)\b/i;
const webTarget = /\b(internet|web|página|pagina|sitio|navegador|google|youtube|amazon|github|docs|formulario|url)\b|https?:\/\/|\b[a-z0-9-]+\.(?:com|org|net|io|gov|edu)\b/i;
const vagueTarget = /\b(esto|eso|aquí|aqui|ahí|ahi|ese sitio|esta página|esta pagina|ese enlace|ese link)\b/i;
const standalonePcAction = /^\s*(?:jev[,:]?\s*)?(?:por favor[,:]?\s*)?(?:abre|abrir|inicia|iniciar|ejecuta|ejecutar|lanzar|cierra|cerrar|termina|terminar)\s+(?:el\s+|la\s+)?(?:spotify|chrome|discord|steam|terminal|navegador|vscode|blender|obs|calculator|calculadora)\s*[.!?]*\s*$/i;

export function classifyMessageIntent(text: string): MessageIntent {
  const value = text.trim();
  if (!webAction.test(value) || standalonePcAction.test(value)) return "conversation";
  if (webTarget.test(value)) return "web_task";
  if (vagueTarget.test(value)) return "ambiguous_web_task";
  return "conversation";
}
