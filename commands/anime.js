import {
  extractUrl,
  fetchBuffer,
  isUrl,
  jidToNumber,
  truncate,
} from '../lib/utils.js';
import {
  adultVideoBuffer,
  adultVideoInfo,
  adultVideoSearch,
  getAnimeQuote,
  getAnimeReaction,
  getNekosImage,
  getNsfwImage,
  getWaifuImage,
  isAdultSite,
  isNsfwCategory,
  jikanSearch,
  NSFW_CATEGORIES,
} from '../lib/api.js';
import { gifToMp4 } from '../lib/sticker.js';
import { trackSent } from '../lib/state.js';

function targetMention(ctx) {
  const jid = ctx.mentioned?.[0] || ctx.quoted?.sender || '';
  if (!jid) return { text: '', mentions: [] };
  return { text: `@${jidToNumber(jid)}`, mentions: [jid] };
}

async function sendAnimeMedia(ctx, url, caption, mentions = []) {
  const lower = String(url).toLowerCase().split('?')[0];
  if (lower.endsWith('.gif')) {
    try {
      const gif = await fetchBuffer(url);
      const mp4 = await gifToMp4(gif);
      const sent = await ctx.sock.sendMessage(
        ctx.chat,
        { video: mp4, gifPlayback: true, caption, mentions },
        { quoted: ctx.msg },
      );
      trackSent(sent);
      return;
    } catch {}
  }
  if (lower.endsWith('.mp4') || lower.endsWith('.webm')) {
    try {
      const sent = await ctx.sock.sendMessage(
        ctx.chat,
        { video: { url }, gifPlayback: true, caption, mentions },
        { quoted: ctx.msg },
      );
      trackSent(sent);
      return;
    } catch {}
  }
  try {
    await ctx.send({ image: { url }, caption, mentions });
  } catch {
    const buffer = await fetchBuffer(url);
    await ctx.send({ image: buffer, caption, mentions });
  }
}

function reactionCommand(name, aliases, category, emoji, text) {
  return {
    name,
    aliases,
    category: 'anime',
    desc: `Envía una reacción de ${text}.`,
    usage: `${name} [@usuario]`,
    async execute(ctx) {
      const url = await getAnimeReaction(category);
      const { text: mention, mentions } = targetMention(ctx);
      const caption = mention
        ? `${emoji} *${ctx.pushName || 'Alguien'}* le dio ${text} a ${mention}`
        : `${emoji} *${ctx.pushName || 'Alguien'}* ${text}`;
      await sendAnimeMedia(ctx, url, caption, mentions);
    },
  };
}

// Comandos +18: cada categoría de purrbot tiene su propio comando corto,
// así salen todos en el menú y se usan directo (.anal, .yuri, …).
function nsfwCommand(name, aliases, category, label) {
  return {
    name,
    aliases,
    category: 'nsfw',
    desc: `Contenido +18: ${label}.`,
    usage: name,
    async execute(ctx) {
      const url = await getNsfwImage(category);
      await sendAnimeMedia(ctx, url, `🔥 *+18 · ${label}*`);
    },
  };
}

// Videos +18 de XVideos / XNXX / PornHub. Acepta un enlace directo o el nombre
// a buscar (toma el primer resultado, igual que .play). Envía avances para que
// nunca quede "pensando" sin decir nada.
async function sendAdultVideo(ctx, query, { site = 'xvideos', gay = false, source } = {}) {
  const label = source || site;
  const link = extractUrl(query) || (isUrl(String(query).trim()) ? String(query).trim() : '');

  let info;
  if (link) {
    if (!isAdultSite(link)) throw new Error('solo puedo descargar videos de XVideos, XNXX o PornHub');
    await ctx.reply(`📥 *+18 · ${label}*\n\n_Extractiendo video..._`);
    info = await adultVideoInfo(link);
  } else {
    const term = String(query || '').trim();
    if (!term) throw new Error('escribe el nombre de un video o un enlace');
    const results = await adultVideoSearch(term, { site, gay, limit: 5 });
    await ctx.reply(
      `🔎 *+18 · ${label}*\n\n1º resultado: *${truncate(results[0].title, 90)}*\n\n_Descargando video... ⏳_`,
    );
    info = await adultVideoInfo(results[0].url);
  }

  const buffer = await adultVideoBuffer(info);
  const sent = await ctx.sock.sendMessage(
    ctx.chat,
    {
      video: buffer,
      mimetype: 'video/mp4',
      caption: `🔥 *+18 · ${label}*\n🎬 ${truncate(info.title, 120)}`,
    },
    { quoted: ctx.msg },
  );
  trackSent(sent);
}

export default [
  {
    name: 'waifu',
    aliases: ['animegirl'],
    category: 'anime',
    desc: 'Envía una imagen de waifu.',
    usage: 'waifu',
    async execute(ctx) {
      const url = await getWaifuImage('waifu');
      await sendAnimeMedia(ctx, url, '🌸 *Waifu aleatoria*');
    },
  },
  {
    name: 'neko',
    aliases: ['catgirl'],
    category: 'anime',
    desc: 'Envía una imagen de neko.',
    usage: 'neko',
    async execute(ctx) {
      const url = await getNekosImage('neko');
      await sendAnimeMedia(ctx, url, '🐱 *Neko aleatoria*');
    },
  },
  {
    name: 'husbando',
    aliases: ['animeboy'],
    category: 'anime',
    desc: 'Envía una imagen de husbando.',
    usage: 'husbando',
    async execute(ctx) {
      const url = await getWaifuImage('husbando');
      await sendAnimeMedia(ctx, url, '⚔️ *Husbando aleatorio*');
    },
  },
  {
    name: 'megumin',
    aliases: ['meguminimg'],
    category: 'anime',
    desc: 'Envía una imagen de Megumin.',
    usage: 'megumin',
    async execute(ctx) {
      const url = await getWaifuImage('megumin');
      await sendAnimeMedia(ctx, url, '💥 *Megumin*');
    },
  },
  {
    name: 'anime',
    aliases: ['animesearch', 'buscanime'],
    category: 'anime',
    desc: 'Busca un anime en MyAnimeList.',
    usage: 'anime <nombre>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}anime* Demon Slayer`);
        return;
      }
      const results = await jikanSearch('anime', query, 5);
      if (!results.length) {
        await ctx.reply('❌ No encontré ese anime.');
        return;
      }
      const list = results
        .map(
          (a, i) =>
            `${i + 1}. *${a.title}*${a.title_japanese ? ` (${a.title_japanese})` : ''}\n` +
            `   ⭐ ${a.score ?? '?'} | 📺 ${a.episodes ?? '?'} eps | ${a.status || '?'}\n` +
            `   🔗 ${a.url}`,
        )
        .join('\n\n');
      const first = results[0];
      const caption = `🌸 *RESULTADOS DE ANIME*\n\n${list}\n\n📝 *Sinopsis:* ${truncate(first.synopsis || 'Sin sinopsis.', 700)}`;
      if (first.images?.jpg?.image_url) {
        try {
          await ctx.send({ image: { url: first.images.jpg.image_url }, caption });
          return;
        } catch {}
      }
      await ctx.reply(caption);
    },
  },
  {
    name: 'manga',
    aliases: ['mangasearch', 'buscmanga'],
    category: 'anime',
    desc: 'Busca un manga en MyAnimeList.',
    usage: 'manga <nombre>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}manga* One Piece`);
        return;
      }
      const results = await jikanSearch('manga', query, 5);
      if (!results.length) {
        await ctx.reply('❌ No encontré ese manga.');
        return;
      }
      const list = results
        .map(
          (a, i) =>
            `${i + 1}. *${a.title}*\n   ⭐ ${a.score ?? '?'} | 📚 ${a.chapters ?? '?'} caps | ${a.status || '?'}\n   🔗 ${a.url}`,
        )
        .join('\n\n');
      const first = results[0];
      const caption = `📚 *RESULTADOS DE MANGA*\n\n${list}\n\n📝 *Sinopsis:* ${truncate(first.synopsis || 'Sin sinopsis.', 700)}`;
      if (first.images?.jpg?.image_url) {
        try {
          await ctx.send({ image: { url: first.images.jpg.image_url }, caption });
          return;
        } catch {}
      }
      await ctx.reply(caption);
    },
  },
  {
    name: 'character',
    aliases: ['personaje', 'charsearch'],
    category: 'anime',
    desc: 'Busca un personaje de anime.',
    usage: 'character <nombre>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}character* Zenitsu`);
        return;
      }
      const results = await jikanSearch('character', query, 3);
      if (!results.length) {
        await ctx.reply('❌ No encontré ese personaje.');
        return;
      }
      const list = results
        .map(
          (c, i) =>
            `${i + 1}. *${c.name}*${c.name_kanji ? ` (${c.name_kanji})` : ''}\n   ⭐ Favoritos: ${c.favorites ?? 0}\n   🔗 ${c.url}`,
        )
        .join('\n\n');
      const first = results[0];
      const caption = `👤 *PERSONAJES*\n\n${list}\n\n📝 *Sobre ${first.name}:* ${truncate(first.about || 'Sin información.', 700)}`;
      if (first.images?.jpg?.image_url) {
        try {
          await ctx.send({ image: { url: first.images.jpg.image_url }, caption });
          return;
        } catch {}
      }
      await ctx.reply(caption);
    },
  },
  {
    name: 'animequote',
    aliases: ['fraseanime', 'aniquote'],
    category: 'anime',
    desc: 'Muestra una frase de anime.',
    usage: 'animequote',
    async execute(ctx) {
      const q = await getAnimeQuote();
      await ctx.reply(`🌸 *FRASE DE ANIME*\n\n"${q.quote}"\n\n— *${q.character}* (${q.anime})`);
    },
  },
  reactionCommand('hug', ['abrazo', 'abrazar'], 'hug', '🤗', 'un abrazo'),
  reactionCommand('kiss', ['beso', 'besar'], 'kiss', '😘', 'un beso'),
  reactionCommand('pat', ['acariciar', 'mimo'], 'pat', '🤚', 'una caricia'),
  reactionCommand('slap', ['cachetada', 'bofetada'], 'slap', '👋', 'una cachetada'),
  reactionCommand('cuddle', ['acurrucar'], 'cuddle', '🫂', 'un acurrucamiento'),
  reactionCommand('bite', ['morder', 'mordida'], 'bite', '😼', 'una mordida'),
  reactionCommand('poke', ['picar', 'toque'], 'poke', '👉', 'un toque'),
  reactionCommand('tickle', ['cosquillas'], 'tickle', '🤣', 'cosquillas'),
  reactionCommand('wave', ['saludar', 'hola'], 'wave', '👋', 'un saludo'),
  reactionCommand('wink', ['guiño'], 'wink', '😉', 'un guiño'),
  reactionCommand('highfive', ['choca', 'chocala'], 'highfive', '🙌', 'un choca esos cinco'),
  reactionCommand('handhold', ['mano'], 'handhold', '🤝', 'tomó de la mano'),
  reactionCommand('feed', ['alimentar'], 'feed', '🍙', 'le dio de comer'),
  reactionCommand('smug', ['presumir'], 'smug', '😏', 'una mirada presumida'),
  reactionCommand('blush', ['sonrojar'], 'blush', '😳', 'un sonrojo'),
  reactionCommand('dance', ['bailar'], 'dance', '💃', 'un baile'),
  reactionCommand('cry', ['llorar'], 'cry', '😭', 'está llorando'),
  reactionCommand('laugh', ['reir', 'risa'], 'laugh', '😂', 'se está riendo'),
  reactionCommand('bonk', ['golpe'], 'bonk', '🔨', 'un bonk'),
  reactionCommand('yeet', ['lanzar'], 'yeet', '🚀', 'un yeet'),
  /* ───────────────────────── Comandos NSFW (+18) ───────────────────────── */
  {
    name: 'nsfw',
    aliases: ['nsfwimg', 'xxx', '+18'],
    category: 'nsfw',
    desc: 'Contenido +18 por categoría (ver la lista con nsfwmenu).',
    usage: 'nsfw <categoría>',
    async execute(ctx) {
      const category = String(ctx.args[0] || '').toLowerCase().trim();
      if (!category) {
        const cats = Object.entries(NSFW_CATEGORIES)
          .map(([k, v]) => `• *${k}* — ${v}`)
          .join('\n');
        await ctx.reply(
          `🔥 *CONTENIDO +18*\n\nCategorías:\n${cats}\n\n` +
            `Uso: *${ctx.prefix}nsfw yuri*\nLista de comandos: *${ctx.prefix}nsfwmenu*`,
        );
        return;
      }
      if (!isNsfwCategory(category)) {
        await ctx.reply(
          `❌ Categoría no válida: *${category}*\n\nUsa *${ctx.prefix}nsfwmenu* para ver la lista completa.`,
        );
        return;
      }
      const url = await getNsfwImage(category);
      await sendAnimeMedia(ctx, url, `🔥 *+18 · ${NSFW_CATEGORIES[category]}*`);
    },
  },
  {
    name: 'nsfwmenu',
    aliases: ['menunsfw', 'nsfwlista', 'nsfwlist'],
    category: 'nsfw',
    desc: 'Muestra todas las categorías NSFW (+18).',
    usage: 'nsfwmenu',
    async execute(ctx) {
      const list = Object.entries(NSFW_CATEGORIES)
        .map(([k, v]) => `🔥 *${ctx.prefix}${k}* — ${v}`)
        .join('\n');
      await ctx.reply(
        `🔥 *MENÚ NSFW (+18)* 🔥\n\n*IMÁGENES Y GIFS*\n${list}\n\n` +
          `*VIDEOS 🎬*\n` +
          `📥 *${ctx.prefix}xvideo* <nombre> — busca en XVideos\n` +
          `📥 *${ctx.prefix}xnxx* <nombre> — busca en XNXX\n` +
          `📥 *${ctx.prefix}gayvideo* <nombre> — videos gays\n` +
          `📥 *${ctx.prefix}pornhub* <nombre> — busca en PornHub\n\n` +
          `💡 Todos aceptan también el *enlace directo* del video.\n` +
          `💡 También: *${ctx.prefix}nsfw <categoría>*\n⚠️ Solo para mayores de edad.`,
      );
    },
  },
  nsfwCommand('anal', [], 'anal', 'Anal'),
  nsfwCommand('blowjob', ['bj'], 'blowjob', 'Blowjob'),
  nsfwCommand('cum', [], 'cum', 'Cum'),
  nsfwCommand('fuck', ['sexo'], 'fuck', 'Sexo'),
  nsfwCommand('nsfwneko', ['nekonsfw', 'neko18'], 'neko', 'Neko +18'),
  nsfwCommand('pussylick', ['pussy'], 'pussylick', 'Pussylick'),
  nsfwCommand('solonsfw', ['chicasola'], 'solo', 'Solo (chica)'),
  nsfwCommand('threesome', ['trio'], 'threesome_ffm', 'Trío'),
  nsfwCommand('yaoi', [], 'yaoi', 'Yaoi'),
  nsfwCommand('yuri', ['lesbiana', 'lesbi'], 'yuri', 'Yuri'),
  /* ─────────────────────── Videos +18 (XVideos/XNXX/PornHub) ─────────────── */
  {
    name: 'xvideo',
    aliases: ['xvideos', 'xv'],
    category: 'nsfw',
    desc: 'Descarga un video +18 de XVideos: por nombre o enlace.',
    usage: 'xvideo <nombre o enlace>',
    async execute(ctx) {
      await sendAdultVideo(ctx, ctx.text, { site: 'xvideos', source: 'XVideos' });
    },
  },
  {
    name: 'gayvideo',
    aliases: ['gayvid', 'videogay', 'gay'],
    category: 'nsfw',
    desc: 'Descarga un video gay +18: por nombre o enlace.',
    usage: 'gayvideo <nombre o enlace>',
    async execute(ctx) {
      const term = String(ctx.text || '').trim();
      await sendAdultVideo(ctx, term || 'gay', { site: 'xvideos', gay: true, source: 'Gay +18' });
    },
  },
  {
    name: 'xnxx',
    aliases: ['xnxxvideo'],
    category: 'nsfw',
    desc: 'Descarga un video +18 de XNXX: por nombre o enlace.',
    usage: 'xnxx <nombre o enlace>',
    async execute(ctx) {
      await sendAdultVideo(ctx, ctx.text, { site: 'xnxx', source: 'XNXX' });
    },
  },
  {
    name: 'pornhub',
    aliases: ['ph', 'phvideo'],
    category: 'nsfw',
    desc: 'Descarga un video +18 de PornHub: por nombre o enlace.',
    usage: 'pornhub <nombre o enlace>',
    async execute(ctx) {
      await sendAdultVideo(ctx, ctx.text, { site: 'pornhub', source: 'PornHub' });
    },
  },
];
