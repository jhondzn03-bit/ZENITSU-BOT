// ─── Actualizaciones del bot ──────────────────────────────────────────────
// Se publican UNA sola vez: el id se guarda en la DB y, si el bot se
// reinicia sin cambios, no se vuelve a avisar al owner ni al canal.

export const BOT_UPDATES = [
  '🛒 *VENTAS* — categoría propia: los comandos de cada grupo aparecen aparte en el menú',
  '🖼️ Comandos personalizados ahora aceptan IMÁGENES (enviadas o respondiendo a una)',
  '🎨 6 temas nuevos: 👾 arcade · 🦇 gótico · 👑 real · 🍬 dulce · 🌙 luna · 🐉 dragón (19 en total)',
  '✨ Menú muy decorado: encabezados de doble línea con contador y viñetas en cada comando',
  '🧹 Comandos del menú SIN emojis pegados: nombres limpios y ordenados',
];

// Hash estable del contenido: si cambia, hay actualización nueva.
export function updatesId(list) {
  const s = (list || []).join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
