// ─── Stickers aleatorios ────────────────────────────────────────────────────
// Junta imágenes SFW de nekos.best, las convierte a WebP y las manda DE
// VERDAD a un chat (canal o grupo). Solo cuenta como enviado el sticker que
// WhatsApp confirmó (con key.id); lo demás se reporta como fallido/omitido.
// El historial de hashes evita repetir stickers entre ejecuciones.
import crypto from 'node:crypto';
import { db, save } from './db.js';
import { fetchBuffer, fetchJson, sleep } from './utils.js';
import { mediaToSticker } from './sticker.js';

const STICKER_CATEGORIES = ['waifu', 'neko', 'kitsune', 'husbando'];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Junta hasta `limit` URLs de imágenes aleatorias (sin repetir) de nekos.best.
// Tope global de tiempo (45s por defecto): si la API está lenta o caída, se
// devuelve lo que haya en vez de dejar el comando colgado minutos.
export async function collectImageUrls(limit, deadlineMs = 45000) {
  const urls = [];
  const seen = new Set();
  const started = Date.now();
  for (let round = 0; round < 8 && urls.length < limit; round++) {
    for (const category of shuffle(STICKER_CATEGORIES)) {
      if (urls.length >= limit) break;
      if (Date.now() - started > deadlineMs) return urls;
      try {
        const data = await fetchJson(
          `https://nekos.best/api/v2/${category}?amount=20`,
          {},
          15000,
        );
        for (const item of data?.results || []) {
          const url = item?.url;
          if (!url || seen.has(url)) continue;
          seen.add(url);
          urls.push(url);
          if (urls.length >= limit) break;
        }
      } catch {}
    }
  }
  return urls;
}

// Envía hasta `count` stickers NUEVOS a `jid` y devuelve el conteo real.
//   onProgress(sent, count): se llama después de cada sticker confirmado.
export async function sendStickerBatch(sock, jid, count, { onProgress } = {}) {
  const data = db();
  if (!Array.isArray(data.canalStickerHistory)) data.canalStickerHistory = [];
  const history = new Set(data.canalStickerHistory);
  const usedNow = new Set();
  const pack = data.stickerPack || 'ZENITSU BOT';
  const author = data.stickerAuthor || 'Zenitsu';

  const candidates = await collectImageUrls(Math.min(240, count * 4));
  if (!candidates.length) {
    return { sent: 0, failed: 0, skipped: 0, noImages: true };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const url of candidates) {
    if (sent >= count) break;
    try {
      const image = await fetchBuffer(url, {}, 30000);
      const imageHash = crypto.createHash('sha256').update(image).digest('hex');
      if (usedNow.has(imageHash) || history.has(imageHash)) {
        skipped++;
        continue;
      }

      const webp = await mediaToSticker(image, { pack, author });
      const webpHash = crypto.createHash('sha256').update(webp).digest('hex');
      if (usedNow.has(webpHash) || history.has(webpHash)) {
        skipped++;
        continue;
      }

      // Envío real: si WhatsApp no devuelve key.id, no se cuenta.
      const msg = await sock.sendMessage(jid, { sticker: webp });
      if (!msg?.key?.id) throw new Error('WhatsApp no confirmó el sticker');

      usedNow.add(imageHash);
      usedNow.add(webpHash);
      data.canalStickerHistory.push(imageHash, webpHash);
      sent++;
      save();

      if (onProgress) {
        try {
          await onProgress(sent, count);
        } catch {}
      }
      // Pequeña pausa para no saturar el chat.
      await sleep(350);
    } catch {
      failed++;
    }
  }

  // El historial no crece sin límite: se guardan los últimos 800 hashes.
  if (data.canalStickerHistory.length > 800) {
    data.canalStickerHistory = data.canalStickerHistory.slice(-800);
  }
  save();

  return { sent, failed, skipped, noImages: false };
}
