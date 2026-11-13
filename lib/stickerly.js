// ─── Sticker.ly (stickers buenos de verdad) ────────────────────────────────
// La API pública de Sticker.ly devuelve packs con PNG transparentes de 512px:
// nada de fotos rectangulares con fondo. Se usan como fuente principal para
// .stickerly y para los stickers de los canales.
import { fetchJson, sleep } from './utils.js';

const SEARCH_URL = 'https://api.sticker.ly/v4/stickerPack/smartSearch';
const UA = 'androidapp.stickerly/3.31.0 (M2006C3LG; U; Android 29; in-ID; id;)';

// Búsquedas por defecto (en español) cuando no se indica una.
export const STICKERLY_QUERIES = [
  'memes',
  'risa',
  'graciosos',
  'gatos',
  'perros',
  'amor',
  'anime',
  'zenitsu',
  'amigos',
  'buenos dias',
  'animales',
  'chistosos',
];

function pickQuery() {
  return STICKERLY_QUERIES[Math.floor(Math.random() * STICKERLY_QUERIES.length)];
}

function stickerFileUrl(prefix, file) {
  const name =
    typeof file === 'string'
      ? file
      : file?.fileName || file?.filename || file?.name || file?.url || '';
  if (!name) return '';
  if (/^https?:\/\//i.test(name)) return name;
  const base = String(prefix || '').replace(/\/?$/, '/');
  return base + String(name).replace(/^\//, '');
}

// Busca packs en Sticker.ly y devuelve [{ id, name, author, animated, urls }].
export async function searchStickerly(keyword = '', packsLimit = 40) {
  const q = String(keyword || '').trim() || pickQuery();
  const body = JSON.stringify({
    keyword: q,
    enabledKeywordSearch: true,
    filter: {
      extendSearchResult: false,
      sortBy: 'RECOMMENDED',
      languages: ['ALL'],
      minStickerCount: 5,
      searchBy: 'ALL',
      stickerType: 'ALL',
    },
  });

  // La API a veces corta la primera petición: se reintenta una vez.
  let data = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      data = await fetchJson(
        SEARCH_URL,
        {
          method: 'POST',
          headers: {
            'user-agent': UA,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body,
        },
        25000,
      );
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await sleep(700);
    }
  }
  if (!data) throw lastErr || new Error('Sticker.ly no respondió');

  const raw = data?.result?.stickerPacks || data?.stickerPacks || [];
  const packs = [];
  for (const p of raw) {
    if (!p?.resourceUrlPrefix) continue;
    const animated = Boolean(p.isAnimated);
    const files = Array.isArray(p.resourceFiles) ? p.resourceFiles : [];
    const urls = [];
    for (const file of files) {
      // Solo PNG estáticos: los stickers animados pueden superar 1 MB y
      // WhatsApp los rechaza.
      if (animated) break;
      const url = stickerFileUrl(p.resourceUrlPrefix, file);
      if (!url || !/\.png(\?|$)/i.test(url)) continue;
      if (!urls.includes(url)) urls.push(url);
    }
    if (!urls.length) continue;
    packs.push({
      id: p.packId || '',
      name: p.name || 'Stickerly',
      author: p.authorName || '',
      animated,
      urls,
    });
    if (packs.length >= packsLimit) break;
  }
  return { query: q, packs };
}

// Junta hasta `limit` URLs de stickers buenos y variados de Sticker.ly.
export async function collectStickerlyStickers(limit = 20, keyword = '') {
  const wanted = Math.max(1, Number(limit) || 20);
  const { query, packs } = await searchStickerly(keyword);

  // Mezcla los packs para no mandar todos los stickers del mismo pack.
  const shuffled = [...packs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const urls = [];
  const seen = new Set();
  for (const pack of shuffled) {
    const files = [...pack.urls];
    for (let i = files.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [files[i], files[j]] = [files[j], files[i]];
    }
    for (const url of files) {
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= wanted) break;
    }
    if (urls.length >= wanted) break;
  }

  return { query, urls, packs: packs.length };
}
