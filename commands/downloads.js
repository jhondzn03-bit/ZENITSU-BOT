import { config } from '../config.js';
import {
  extractUrl,
  fetchBuffer,
  formatBytes,
  formatNumber,
  isUrl,
  truncate,
  withWatermark,
} from '../lib/utils.js';
import {
  facebookDownload,
  guessMimeFromUrl,
  instagramDownload,
  mediafireDownload,
  pinterestDownload,
  searchYouTube,
  spotifyDownload,
  tiktokDownload,
  tiktokSearch,
  twitterDownload,
  youtubeDownload,
} from '../lib/api.js';
import { trackSent } from '../lib/state.js';

function kindFromUrl(url) {
  const mime = guessMimeFromUrl(url);
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  return 'unknown';
}

async function sendMediaUrl(ctx, url, caption = '', options = {}) {
  const kind = options.kind || kindFromUrl(url);
  // Las URLs de googlevideo van firmadas para ESTA IP: los servidores de
  // WhatsApp las descargan desde otra IP y reciben 403. Por eso los archivos
  // de YouTube se envían siempre como buffer (descarga local + subida).
  const mustBuffer = /googlevideo\.com/i.test(String(url));
  if (kind === 'audio') {
    if (!mustBuffer) {
      try {
        const sent = await ctx.sock.sendMessage(
          ctx.chat,
          {
            audio: { url },
            mimetype: options.mimetype || 'audio/mp4',
            fileName: options.fileName || 'zenitsu.m4a',
            ptt: false,
          },
          { quoted: ctx.msg },
        );
        trackSent(sent);
        return;
      } catch {}
    }
    const buffer = await fetchBuffer(url);
    const sent = await ctx.sock.sendMessage(
      ctx.chat,
      { audio: buffer, mimetype: options.mimetype || 'audio/mp4', fileName: options.fileName || 'zenitsu.m4a' },
      { quoted: ctx.msg },
    );
    trackSent(sent);
    return;
  }

  if (kind === 'video') {
    if (!mustBuffer) {
      try {
        await ctx.send({ video: { url }, caption, mimetype: 'video/mp4' });
        return;
      } catch {}
    }
    const buffer = await fetchBuffer(url);
    await ctx.send({ video: buffer, caption, mimetype: 'video/mp4' });
    return;
  }

  if (kind === 'image') {
    try {
      await ctx.send({ image: { url }, caption });
      return;
    } catch {}
    const buffer = await fetchBuffer(url);
    await ctx.send({ image: buffer, caption });
    return;
  }

  // Desconocido: intenta imagen y si falla lo manda como documento.
  try {
    await ctx.send({ image: { url }, caption });
    return;
  } catch {}
  try {
    const buffer = await fetchBuffer(url);
    await ctx.send({
      document: buffer,
      mimetype: 'application/octet-stream',
      fileName: `zenitsu-${Date.now()}.bin`,
      caption,
    });
  } catch (err) {
    throw new Error(`No se pudo enviar el archivo: ${err.message}`);
  }
}

async function sendMany(ctx, urls, caption, options = {}) {
  const list = [...new Set(urls)].slice(0, 6);
  if (!list.length) throw new Error('No se encontraron archivos para enviar');
  let sent = 0;
  for (const url of list) {
    try {
      await sendMediaUrl(ctx, url, sent === 0 ? caption : '', options);
      sent++;
    } catch (err) {
      if (sent === 0) throw err;
    }
  }
  if (!sent) throw new Error('No se pudo enviar ningún archivo');
}

function getUrlOrText(ctx) {
  return extractUrl(ctx.text) || (isUrl(ctx.args[0]) ? ctx.args[0] : '');
}

// ─── Búsquedas con lista seleccionable (.ytsearch / .ttsearch) ────────────
// Igual que el buscador +18: ".ytsearch gato" da una lista numerada y
// ".ytsearch 3" descarga el resultado 3. Se recuerda por chat 15 minutos.
const SEARCH_TTL = 15 * 60 * 1000;
const chatSearches = new Map(); // chat → { kind, query, results, at }

function rememberSearch(chat, kind, query, results) {
  const now = Date.now();
  for (const [key, value] of chatSearches) {
    if (now - value.at > SEARCH_TTL) chatSearches.delete(key);
  }
  if (chatSearches.size > 60) chatSearches.delete(chatSearches.keys().next().value);
  chatSearches.set(chat, { kind, query, results, at: now });
}

function getLastSearch(chat, kind) {
  const last = chatSearches.get(chat);
  if (!last || last.kind !== kind) return null;
  if (Date.now() - last.at > SEARCH_TTL) return null;
  return last;
}

export default [
  {
    name: 'play',
    aliases: ['song', 'musica', 'música'],
    category: 'downloads',
    desc: 'Busca y descarga el audio de una canción de YouTube.',
    usage: 'play <nombre o enlace>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}play* nombre de la canción`);
        return;
      }
      let url = extractUrl(query);
      let title = '';
      let author = '';
      if (!url) {
        const results = await searchYouTube(query, 1);
        url = results[0].url;
        title = results[0].title;
        author = results[0].author;
      }
      await ctx.reply(`🔎 *Buscando:* ${title || url}\n\n_Espera un momento..._`);
      const r = await youtubeDownload(url, 'audio');
      title = title || r.title || 'Audio de YouTube';
      await sendMediaUrl(
        ctx,
        r.urls[0],
        `🎵 *${truncate(title, 200)}*\n${author ? `👤 ${author}\n` : ''}${r.duration ? `⏱️ ${r.duration}\n` : ''}🔗 ${url}`,
        { kind: 'audio', fileName: 'zenitsu.m4a' },
      );
    },
  },
  {
    name: 'ytmp3',
    aliases: ['ytaudio', 'yta'],
    category: 'downloads',
    desc: 'Descarga el audio de un video de YouTube.',
    usage: 'ytmp3 <enlace>',
    async execute(ctx) {
      const url = getUrlOrText(ctx);
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}ytmp3* https://youtu.be/...`);
        return;
      }
      await ctx.reply('🎧 *Descargando audio...*');
      const r = await youtubeDownload(url, 'audio');
      await sendMediaUrl(
        ctx,
        r.urls[0],
        `🎵 *${truncate(r.title || 'Audio de YouTube', 200)}*\n${r.author ? `👤 ${r.author}\n` : ''}${r.duration ? `⏱️ ${r.duration}\n` : ''}🔗 ${url}`,
        { kind: 'audio', fileName: 'zenitsu.m4a' },
      );
    },
  },
  {
    name: 'ytmp4',
    aliases: ['ytvideo', 'ytv'],
    category: 'downloads',
    desc: 'Descarga el video de YouTube.',
    usage: 'ytmp4 <enlace>',
    async execute(ctx) {
      const url = getUrlOrText(ctx);
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}ytmp4* https://youtu.be/...`);
        return;
      }
      await ctx.reply('🎬 *Descargando video...*');
      const r = await youtubeDownload(url, 'video');
      await sendMediaUrl(
        ctx,
        r.urls[0],
        `🎬 *${truncate(r.title || 'Video de YouTube', 200)}*\n${r.author ? `👤 ${r.author}\n` : ''}${r.duration ? `⏱️ ${r.duration}\n` : ''}🔗 ${url}`,
        { kind: 'video' },
      );
    },
  },
  {
    name: 'ytsearch',
    aliases: ['yts', 'buscarvideo', 'ytbuscar'],
    category: 'downloads',
    desc: 'Busca en YouTube: lista numerada, elige con .ytsearch <número>.',
    usage: 'ytsearch <búsqueda | número>',
    async execute(ctx) {
      const arg = ctx.text.trim();

      // Selector: .ytsearch 3 → descarga el resultado 3 de la última lista.
      if (/^\d{1,2}$/.test(arg)) {
        const last = getLastSearch(ctx.chat, 'youtube');
        if (!last) {
          await ctx.reply(
            `❌ No hay una lista reciente de YouTube aquí.\n\n_Busca primero:_ *${ctx.prefix}ytsearch <nombre>*`,
          );
          return;
        }
        const index = Number(arg);
        if (index < 1 || index > last.results.length) {
          await ctx.reply(
            `❌ La lista tiene ${last.results.length} resultados (1 a ${last.results.length}).\n\n_Revisa con_ *${ctx.prefix}ytsearch ${last.query}*`,
          );
          return;
        }
        const chosen = last.results[index - 1];
        await ctx.reply(
          `🎬 Descargando el resultado ${index}/${last.results.length}:\n*${truncate(chosen.title, 80)}*\n\n_Espera un momento..._`,
        );
        const r = await youtubeDownload(chosen.url, 'video');
        await sendMediaUrl(
          ctx,
          r.urls[0],
          `🎬 *${truncate(chosen.title, 200)}*\n${chosen.author ? `👤 ${chosen.author}\n` : ''}${chosen.duration ? `⏱️ ${chosen.duration}\n` : ''}🔗 ${chosen.url}`,
          { kind: 'video' },
        );
        return;
      }

      if (!arg) {
        await ctx.reply(
          `🔎 *YouTube Search*\n\n▸ *${ctx.prefix}ytsearch* Demon Slayer op\n_→ lista con 10 resultados_\n▸ *${ctx.prefix}ytsearch 3*\n_→ descarga el resultado 3 de la lista_`,
        );
        return;
      }
      const results = await searchYouTube(arg, 10);
      rememberSearch(ctx.chat, 'youtube', arg, results);
      const list = results
        .map(
          (r, i) =>
            `${i + 1}. *${truncate(r.title, 70)}*\n   👤 ${truncate(r.author || '?', 30)}${r.duration ? ` · ⏱️ ${r.duration}` : ''}`,
        )
        .join('\n');
      await ctx.reply(
        `🔎 *YOUTUBE — "${arg}"*\n\n${list}\n\n` +
          `💡 Descarga uno con *${ctx.prefix}ytsearch <número>*\n_Vale audio: ${ctx.prefix}play <nombre> · la lista expira en 15 min_`,
      );
    },
  },
  {
    name: 'ttsearch',
    aliases: ['tiktoksearch', 'tiktokbuscar', 'ttbuscar', 'buscartiktok'],
    category: 'downloads',
    desc: 'Busca videos de TikTok: lista numerada, elige con .ttsearch <número>.',
    usage: 'ttsearch <búsqueda | número>',
    async execute(ctx) {
      const arg = ctx.text.trim();

      // Selector: .ttsearch 3 → descarga el resultado 3 de la última lista.
      if (/^\d{1,2}$/.test(arg)) {
        const last = getLastSearch(ctx.chat, 'tiktok');
        if (!last) {
          await ctx.reply(
            `❌ No hay una lista reciente de TikTok aquí.\n\n_Busca primero:_ *${ctx.prefix}ttsearch <nombre>*`,
          );
          return;
        }
        const index = Number(arg);
        if (index < 1 || index > last.results.length) {
          await ctx.reply(
            `❌ La lista tiene ${last.results.length} resultados (1 a ${last.results.length}).\n\n_Revisa con_ *${ctx.prefix}ttsearch ${last.query}*`,
          );
          return;
        }
        const chosen = last.results[index - 1];
        await ctx.reply(
          `🎵 Descargando el resultado ${index}/${last.results.length}:\n*${truncate(chosen.title, 80)}*\n\n_Espera un momento..._`,
        );
        const r = await tiktokDownload(chosen.url);
        const caption = `🎵 *${truncate(r.title || chosen.title, 200)}*\n${r.author ? `👤 ${r.author}\n` : ''}🔗 ${chosen.url}`;
        if (r.images?.length) {
          await sendMany(ctx, r.images, `📸 ${caption}`, { kind: 'image' });
        } else {
          await sendMediaUrl(ctx, r.video, caption, { kind: 'video' });
        }
        return;
      }

      if (!arg) {
        await ctx.reply(
          `🔎 *TikTok Search*\n\n▸ *${ctx.prefix}ttsearch* anime edit\n_→ lista con 10 resultados_\n▸ *${ctx.prefix}ttsearch 3*\n_→ descarga el resultado 3 (sin marca de agua)_`,
        );
        return;
      }
      const results = await tiktokSearch(arg, 10);
      rememberSearch(ctx.chat, 'tiktok', arg, results);
      const list = results
        .map((r, i) => `${i + 1}. ${truncate(r.title, 75)}`)
        .join('\n');
      await ctx.reply(
        `🔎 *TIKTOK — "${arg}"*\n\n${list}\n\n` +
          `💡 Descarga uno con *${ctx.prefix}ttsearch <número>* (sin marca de agua)\n_La lista expira en 15 minutos_`,
      );
    },
  },
  {
    name: 'tiktok',
    aliases: ['tt', 'tik'],
    category: 'downloads',
    desc: 'Descarga un video de TikTok sin marca de agua.',
    usage: 'tiktok <enlace>',
    async execute(ctx) {
      const url = getUrlOrText(ctx);
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}tiktok* https://vm.tiktok.com/...`);
        return;
      }
      await ctx.reply('🎵 *Descargando TikTok...*');
      const r = await tiktokDownload(url);
      const caption = `🎵 *${truncate(r.title || 'TikTok', 200)}*\n${r.author ? `👤 ${r.author}\n` : ''}🔗 ${url}`;
      if (r.images?.length) {
        await sendMany(ctx, r.images, `📸 ${caption}`, { kind: 'image' });
        return;
      }
      if (!r.video) throw new Error('No se encontró el video de TikTok');
      await sendMediaUrl(ctx, r.video, caption, { kind: 'video' });
    },
  },
  {
    name: 'instagram',
    aliases: ['ig', 'igdl', 'insta'],
    category: 'downloads',
    desc: 'Descarga fotos o videos de Instagram.',
    usage: 'instagram <enlace>',
    async execute(ctx) {
      const url = getUrlOrText(ctx);
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}instagram* https://www.instagram.com/p/...`);
        return;
      }
      await ctx.reply('📸 *Descargando Instagram...*');
      const r = await instagramDownload(url);
      await sendMany(ctx, r.urls, `📸 *Instagram*\n${r.title ? `📝 ${truncate(r.title, 150)}\n` : ''}🔗 ${url}`);
    },
  },
  {
    name: 'facebook',
    aliases: ['fb', 'fbdl'],
    category: 'downloads',
    desc: 'Descarga videos de Facebook.',
    usage: 'facebook <enlace>',
    async execute(ctx) {
      const url = getUrlOrText(ctx);
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}facebook* https://www.facebook.com/...`);
        return;
      }
      await ctx.reply('📘 *Descargando Facebook...*');
      const r = await facebookDownload(url);
      await sendMany(ctx, r.urls, `📘 *Facebook*\n${r.title ? `📝 ${truncate(r.title, 150)}\n` : ''}🔗 ${url}`, { kind: 'video' });
    },
  },
  {
    name: 'twitter',
    aliases: ['tw', 'x', 'xdl'],
    category: 'downloads',
    desc: 'Descarga videos o imágenes de X/Twitter.',
    usage: 'twitter <enlace>',
    async execute(ctx) {
      const url = getUrlOrText(ctx);
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}twitter* https://x.com/...`);
        return;
      }
      await ctx.reply('🐦 *Descargando de X/Twitter...*');
      const r = await twitterDownload(url);
      await sendMany(ctx, r.urls, `🐦 *X/Twitter*\n${r.title ? `📝 ${truncate(r.title, 150)}\n` : ''}🔗 ${url}`);
    },
  },
  {
    name: 'pinterest',
    aliases: ['pin', 'pinterestdl'],
    category: 'downloads',
    desc: 'Descarga imágenes o videos de Pinterest.',
    usage: 'pinterest <enlace>',
    async execute(ctx) {
      const url = getUrlOrText(ctx);
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}pinterest* https://pin.it/...`);
        return;
      }
      await ctx.reply('📌 *Descargando de Pinterest...*');
      const r = await pinterestDownload(url);
      await sendMany(ctx, r.urls, `📌 *Pinterest*\n🔗 ${url}`);
    },
  },
  {
    name: 'spotify',
    aliases: ['sp', 'spotifydl'],
    category: 'downloads',
    desc: 'Descarga una canción de Spotify.',
    usage: 'spotify <enlace>',
    async execute(ctx) {
      const url = getUrlOrText(ctx);
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}spotify* https://open.spotify.com/track/...`);
        return;
      }
      await ctx.reply('🎧 *Descargando de Spotify...*');
      const r = await spotifyDownload(url);
      await sendMediaUrl(ctx, r.urls[0], `🎧 *Spotify*\n${r.title ? `🎵 ${truncate(r.title, 150)}\n` : ''}🔗 ${url}`, {
        kind: 'audio',
        fileName: 'zenitsu-spotify.mp3',
      });
    },
  },
  {
    name: 'mediafire',
    aliases: ['mf'],
    category: 'downloads',
    desc: 'Descarga archivos de MediaFire.',
    usage: 'mediafire <enlace>',
    async execute(ctx) {
      const url = getUrlOrText(ctx);
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}mediafire* https://www.mediafire.com/file/...`);
        return;
      }
      await ctx.reply('📦 *Descargando de MediaFire...*');
      const r = await mediafireDownload(url);
      const buffer = await fetchBuffer(r.urls[0]);
      if (buffer.length > config.maxFileSize) {
        throw new Error(`El archivo supera el límite (${formatBytes(config.maxFileSize)})`);
      }
      const name = (r.title || 'archivo').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
      await ctx.send({
        document: buffer,
        mimetype: 'application/octet-stream',
        fileName: name.includes('.') ? name : `${name}.bin`,
        caption: `📦 *MediaFire*\n\n▸ Archivo: ${name}\n▸ Tamaño: ${formatBytes(buffer.length)}\n▸ Enlace: ${url}`,
      });
    },
  },
];
