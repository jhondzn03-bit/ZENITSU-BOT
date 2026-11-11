// ─── Actualizaciones del bot ──────────────────────────────────────────────
// Se publican UNA sola vez: el id se guarda en la DB y, si el bot se
// reinicia sin cambios, no se vuelve a avisar al owner ni al canal.

export const BOT_UPDATES = [
  '🧠 *{prefix}opencode* — IA que ejecuta comandos en lenguaje natural, ahora con router local instantáneo',
  '🛠️ *{prefix}crearcmd* — crea comandos propios por grupo (texto e imágenes)',
  '🎨 *{prefix}settheme* — 13 temas que cambian el menú y TODAS las respuestas',
  '📏 Menú *línea recta*: comandos en fila horizontal, más corto y ordenado',
  '📣 *{prefix}spam* acepta una fila de enlaces y entra a TODOS los grupos',
  '📢 *{prefix}canal* — publico mis actualizaciones en tu canal de WhatsApp',
  '⏰ *{prefix}remind* — recordatorios persistentes',
  '🔎 *{prefix}ytsearch* / *{prefix}ttsearch* — buscan y eliges por número',
];

// Hash estable del contenido: si cambia, hay actualización nueva.
export function updatesId(list) {
  const s = (list || []).join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
