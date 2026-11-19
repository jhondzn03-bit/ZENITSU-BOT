// ─── Paquetes de stickers de WhatsApp ──────────────────────────────────────
// Arma un ZIP .wastickers (contents.json + stickers WebP) y lo envía como
// "paquete de stickers": en WhatsApp aparece una tarjeta para añadir el pack
// completo, en vez de 20 stickers sueltos uno por uno.
import { generateWAMessageFromContent, prepareWAMessageMedia, proto } from '@whiskeysockets/baileys';
import { mediaToSticker } from './sticker.js';
import { createZip } from './zip.js';

const MAX_PACK = 30;

function safeName(value, fallback = 'ZENITSU') {
  return String(value || fallback)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, 40) || fallback;
}

// stickers: [{ buffer, animated, emojis }] → ZIP listo para WhatsApp
export function buildWastickers({ name = 'ZENITSU BOT', publisher = 'Zenitsu', stickers = [] }) {
  const chosen = stickers.filter((s) => s?.buffer?.length).slice(0, MAX_PACK);
  if (!chosen.length) throw new Error('No hay stickers para armar el paquete');

  const files = [];
  const entries = [];
  chosen.forEach((sticker, index) => {
    const fileName = `sticker_${index}.webp`;
    files.push({ name: fileName, data: sticker.buffer });
    entries.push({
      fileName,
      isAnimated: Boolean(sticker.animated),
      emojis: Array.isArray(sticker.emojis) && sticker.emojis.length ? sticker.emojis : ['🎨'],
      accessibilityLabel: '',
      mimetype: 'image/webp',
    });
  });

  const contents = {
    android_play_store_link: 'https://play.google.com/store/apps/details?id=com.whatsapp.stickers',
    ios_app_download_link: 'https://apps.apple.com/app/sticker-maker-studio/id1443326857',
    name: safeName(name, 'ZENITSU BOT'),
    publisher: safeName(publisher, 'Zenitsu'),
    stickers: entries.map((e, i) => ({
      image_file: e.fileName,
      emojis: e.emojis,
      ...(chosen[i]?.animated ? { animated: true } : {}),
    })),
  };
  files.unshift({ name: 'contents.json', data: Buffer.from(JSON.stringify(contents)) });

  return { zip: createZip(files), entries, contents };
}

// Convierte imágenes/PNG de Sticker.ly a WebP 512 (sin deformar) y arma el pack.
export async function packFromStickerBuffers(buffers = [], { pack = 'ZENITSU BOT', author = 'Zenitsu', emojis } = {}) {
  const stickers = [];
  const errors = [];
  for (const buffer of buffers) {
    if (!buffer?.length) continue;
    try {
      const webp = await mediaToSticker(buffer, { isVideo: false, pack, author });
      stickers.push({ buffer: webp, animated: false, emojis: emojis || ['🎨'] });
    } catch (err) {
      errors.push(err?.message || 'conversión fallida');
    }
    if (stickers.length >= MAX_PACK) break;
  }
  if (!stickers.length) throw new Error(errors[0] || 'No pude convertir los stickers');
  return { ...buildWastickers({ name: pack, publisher: author, stickers }), errors };
}

// Envía el pack. WhatsApp muestra la tarjeta "Añadir stickers" con el NOMBRE
// del paquete cuando el .wastickers llega como DOCUMENTO (es el mismo formato
// que usa WhatsApp al exportar un pack). El mensaje StickerPackMessage armado
// a mano no lo renderizan todos los clientes, por eso va de respaldo.
export async function sendStickerPack(sock, jid, wastickers, options = {}) {
  const { caption = '', quoted = null, fileName = 'zenitsu.wastickers' } = options;
  try {
    const msg = await sock.sendMessage(
      jid,
      {
        document: wastickers.zip,
        mimetype: 'application/octet-stream',
        fileName,
        caption: String(caption || ''),
      },
      quoted ? { quoted } : {},
    );
    if (msg?.key?.id) {
      console.log(`[PACK] .wastickers enviado: ${fileName} (${wastickers.entries.length} stickers)`);
      return msg;
    }
  } catch (err) {
    console.error('[PACK] envío como documento falló:', err?.message || err);
  }

  // Respaldo: mensaje nativo StickerPackMessage.
  const media = await prepareWAMessageMedia(
    {
      document: wastickers.zip,
      mimetype: 'application/octet-stream',
      fileName,
    },
    { upload: sock.waUploadToServer },
  );
  const doc = media?.documentMessage;
  if (!doc?.directPath) throw new Error('WhatsApp no subió el paquete');

  const message = {
    stickerPackMessage: {
      stickerPackId: `com.zenitsu.${Date.now().toString(36)}`,
      name: wastickers.contents.name,
      publisher: wastickers.contents.publisher,
      stickers: wastickers.entries,
      fileLength: doc.fileLength,
      fileSha256: doc.fileSha256,
      fileEncSha256: doc.fileEncSha256,
      mediaKey: doc.mediaKey,
      directPath: doc.directPath,
      caption: String(caption || ''),
      packDescription: 'Stickers de ZENITSU BOT ⚡',
      mediaKeyTimestamp: doc.mediaKeyTimestamp,
      stickerPackSize: wastickers.entries.length,
      stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.THIRD_PARTY,
    },
  };

  const msg = generateWAMessageFromContent(jid, message, {
    userJid: sock?.user?.id || '',
    ...(quoted ? { quoted } : {}),
  });
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
  return msg;
}
