// ─── Actualizaciones del bot ──────────────────────────────────────────────
// Se publican UNA sola vez: el id se guarda en la DB y, si el bot se
// reinicia sin cambios, no se vuelve a avisar al owner ni al canal.

export const BOT_UPDATES = [
  '📦 ¡318 COMANDOS! 59 nuevos en esta tanda, todos gratis para todos',
  '👻 Avisos decorados de ADMIN: nuevo administrador y administrador removido, con menciones y mi repo de GitHub',
  '✿ Aviso cuando alguien cambia o elimina la IMAGEN del grupo (se puede apagar con adminnotice off)',
  '🎭 16 reacciones anime nuevas: enojado, feliz, aburrido, patada, puñetazo, bostezo, facepalm, disparo y más',
  '🔎 INVESTIGACIÓN: películas + IMDb, pokémon, recetas, cócteles, libros, acciones, COVID, "un día como hoy", StackOverflow, Epic Games gratis, NASA, fondos de pantalla y más',
  '🖼️ IMÁGENES: filtros espejo, sepia, pixelado, blanco y negro, blur, rotar, negativo y contraste + leer QR y extraer texto (OCR) de fotos',
  '📥 DESCARGAS: películas clásicas de dominio público, video de YouTube como documento, audio de TikTok, repos de GitHub en ZIP',
  '🧰 HERRAMIENTAS: correo temporal con bandeja, is.gd, apps estilo Play Store',
  '📨 TODOS los mensajes del bot ahora aparecen como REENVIADOS desde este canal ⚡',
  '🏆 .top y .topxp ahora muestran solo la gente que usa el bot en el grupo',
  '🎮 Nuevos juegos: adivina el número, perros y gatos aleatorios, citas de Kanye',
];

// Hash estable del contenido: si cambia, hay actualización nueva.
export function updatesId(list) {
  const s = (list || []).join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
