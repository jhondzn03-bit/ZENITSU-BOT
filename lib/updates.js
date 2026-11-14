// ─── Actualizaciones del bot ──────────────────────────────────────────────
// Se publican UNA sola vez: el id se guarda en la DB y, si el bot se
// reinicia sin cambios, no se vuelve a avisar al owner ni al canal.

export const BOT_UPDATES = [
  '🎨 ¡NUEVO .setemoji! Cambia el rayito ⚡ del menú por el emoji que quieras: .setemoji 🔥 (o 🌙, 💀, 🐉...). Vuelve al original con .setemoji reset',
  '🎙️ .voz más compatible: audio OGG/Opus 16 kHz mono con duración real (así WhatsApp sí reproduce la nota de voz) y respaldo a audio normal si el teléfono lo rechaza',
  '🎙️ ¡NUEVO .voz! La IA te responde con una nota de voz real (OGG/Opus) y arreglé .tts, que sonaba "Este audio no está disponible"',
  '👁️ .ver arreglado: ahora sí abre fotos/videos de una sola visualización y reintenta si WhatsApp ya borró el medio',
  '🚫 .antilink borra el enlace AL INSTANTE, antes de cualquier otra consulta, y aplica también a admins',
  '🌙 Menú renovado: UNA sola columna hacia abajo, con el prefijo real (.) y los alias de cada comando; la descripción va debajo como cita (> texto)',
  '🎄 Menús corregidos: cada estilo se ve como debe y YA NO todos salen navideños (solo .setmenu navideno / .navidad on)',
  '🎬 .peliculasgratis ARREGLADO: descarga películas pesadas completas (video hasta 64 MB, archivo hasta 1.5 GB) y ya no dice "muy pesado"',
  '🚫 .antilink mejorado: detecta enlaces sin https (www., t.me, discord.gg, bit.ly) y avisa antes de expulsar',
  '🔌 APIs caídas reemplazadas: reacciones anime con purrbot/nekos.life y descargas IG/FB/X/Spotify con yt-dlp automático',
  '⬇️ yt-dlp se instala solo en el servidor si falta: las descargas ya no mueren por "no está instalado"',
  '🎨 ¡NUEVO .stickerly! Stickers buenos y transparentes desde Sticker.ly: gatos, memes, anime y más',
  '🎨 .setmenu arreglado: el estilo que eliges ahora SÍ se ve, y el menú navideño es 100% ZENITSU (sin fuentes copiadas)',
  '🔘 ¡NUEVO .botones! Botones interactivos compatibles con WhatsApp (si falla, respaldo en texto)',
  '🪄 .canalsticker ahora usa Sticker.ly: stickers de verdad, no fotos rectangulares',
  '👁️ .ver arreglado: revela fotos, videos y audios de una sola visualización (reintenta la descarga)',
  '📢 .canalsticker ahora manda SIEMPRE a tus dos canales (el grupo solo si escribes .canalsticker grupo)',
  '🪄 .sinfondo + .hd/.hd2/.hd3/.hd4 ya conservan la transparencia DE VERDAD (se guarda el PNG original)',
  '📢 .canalsticker ahora manda stickers a TUS DOS CANALES por ID (sin configurar enlaces)',
  '📌 Los memes de .meme salen desde Pinterest: más variedad y sin depender de APIs caídas',
  '🎄 Menú navideño con RAYOS ⚡ (sin estrellas) y modo Navidad en TODOS los estilos: .navidad on|off',
  '🪄 .hd, .hd2, .hd3 y .hd4 mejoran cada vez más y ya NO devuelven el fondo de .sinfondo',
  '🔌 APIs muertas eliminadas: descargas de TikTok, IG, FB, X, Spotify y MediaFire más rápidas',
  '🔎 ¡NUEVO .checkchannel! Verifica cualquier canal: ID newsletter, seguidores, estado y descripción',
  '🧹 Comandos optimizados: alias ordenados y sin choques (.repo, .poke y compañía ya responden bien)',
  '☁️ ¡ZENITSU BOT en HidenCloud 24/7! Ya no depende de Termux',
  '🎄 Menú navideño disponible: .setmenu navideno (Santa, nieve y regalos)',
  '📡 ¡NUEVO .stickercanal! Manda stickers al grupo donde se usa, pidiendo admin',
  '🤖 Subbots autónomos: .subbots, .code y sesión propia para cada uno',
  '🎨 .canalsticker: 50 stickers aleatorios al canal o a un grupo por su link',
  '✅ Reacciones de estado: ⏳ al ejecutar y ✅ al terminar (❌ si falla)',
  '📌 .pin descarga todas las imágenes antes de armar el álbum',
  '💣 ¡NUEVO .tumbargrupo! Lluvia de mensajes del canal + expulsa a todos (owner only, con confirmación)',
  '👢 ¡NUEVO .kickall! Expulsa a TODOS los miembros de un grupo de golpe (se salvan owner, bot y creador)',
  '⚡ ¡Bienvenidas ZENITSU! La llegada y salida del grupo ahora grita Respiración del Trueno',
  '👤 Adiós al LID en las bienvenidas: menciona el @número real (o el nombre) de quien llega',
  '👑 .autoadmin con feedback real: asciende al owner al instante en los grupos donde ya es admin',
  '🎄 ¡MENÚ NAVIDEÑO! Ho, ho, ho: Santa, nieve y regalos, con la descripción bajo cada comando',
  '👑 Nuevo .autoadmin: el bot y el owner se vuelven administradores automáticamente en los grupos',
  '✨ Mensajes más limpios: se quitó la marca "> ZENITSU BOT", solo queda el banner del canal ⚡',
  '📱 El menú muestra el sistema real: Android · Linux (Termux)',
  '🌙 ¡MENÚ LUNA EDITION! Rediseño completo: luna, rayos, estrellas y nubes moradas',
  '＃ Cada comando ahora en SU PROPIA línea, sin columnas: más fácil de leer',
  '👤 El menú te saluda con tu @mención y muestra los datos reales del bot',
  '🔒 Contenido +18 RETIRADO por completo: no aparece en el menú ni se puede usar',
  '🎬 Las películas clásicas de .peliculasgratis ahora llegan como VIDEO que se reproduce directo en el chat',
  '📦 ¡319 comandos! Todos gratis para todos',
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
