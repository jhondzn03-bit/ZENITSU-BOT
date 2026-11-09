import {
  fetchBuffer,
  jidToNumber,
  truncate,
} from '../lib/utils.js';
import {
  getAnimeQuote,
  getAnimeReaction,
  getNekosImage,
  getWaifuImage,
  jikanSearch,
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
];
