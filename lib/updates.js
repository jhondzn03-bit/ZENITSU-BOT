// ─── Actualizaciones del bot ──────────────────────────────────────────────
// Se publican UNA sola vez: el id se guarda en la DB y, si el bot se
// reinicia sin cambios, no se vuelve a avisar al owner ni al canal.

export const BOT_UPDATES = [
  '🌙 ¡MENÚ LUNA EDITION! Rediseño completo: luna, rayos, estrellas y nubes moradas',
  '＃ Cada comando ahora en SU PROPIA línea, sin columnas: más fácil de leer',
  '👤 El menú te saluda con tu @mención y muestra los datos reales del bot',
  '🔒 Contenido +18 RETIRADO por completo: no aparece en el menú ni se puede usar',
  '🎬 Las películas clásicas de .peliculasgratis ahora llegan como VIDEO que se reproduce directo en el chat',
  '📦 301 comandos visibles para todos, gratis (318 registrados en total)',
  '🎭 36 reacciones anime con GIF: llorar, abrazar, besar, puñetazo, bostezo y más',
  '👻 Avisos decorados de admins e imagen del grupo (se apagan con adminnotice off)',
  '📨 Todos los mensajes del bot aparecen como REENVIADOS desde este canal ⚡',
  '🔎 INVESTIGACIÓN: IMDb, pokémon, recetas, cócteles, libros, NASA, Epic Games gratis y más',
  '🖼️ IMÁGENES: filtros sepia, pixelado, blur, espejo + leer QR y extraer texto de fotos',
];

// Hash estable del contenido: si cambia, hay actualización nueva.
export function updatesId(list) {
  const s = (list || []).join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
