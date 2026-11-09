import {
  fetchJson,
  stripHtml,
  truncate,
} from '../lib/utils.js';
import {
  getLyrics,
  getNews,
  getTrending,
} from '../lib/api.js';

async function sendLong(ctx, header, text) {
  const full = `${header}\n\n${text}`;
  let rest = full;
  while (rest.length) {
    const chunk = rest.slice(0, 3500);
    rest = rest.slice(3500);
    await ctx.reply(chunk);
    if (rest) rest = rest.trimStart();
  }
}

async function findLyrics(query) {
  if (query.includes(' - ')) {
    const [artist, ...title] = query.split(' - ');
    return { artist: artist.trim(), title: title.join(' - ').trim() };
  }
  const data = await fetchJson(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`, {}, 25000);
  const first = data?.data?.[0];
  if (!first) throw new Error('No encontré esa canción');
  return { artist: first.artist?.name, title: first.title };
}

export default [
  {
    name: 'news',
    aliases: ['noticias', 'noticiero'],
    category: 'info',
    desc: 'Muestra noticias recientes sobre un tema.',
    usage: 'news [tema]',
    async execute(ctx) {
      const topic = ctx.text.trim() || 'noticias de hoy';
      const items = await getNews(topic);
      const list = items
        .map(
          (n, i) =>
            `${i + 1}. *${truncate(n.title, 140)}*\n   ${n.source ? `📰 ${n.source}\n   ` : ''}🔗 ${n.link}`,
        )
        .join('\n\n');
      await ctx.reply(`📰 *NOTICIAS: ${truncate(topic, 80)}*\n\n${list}`);
    },
  },
  {
    name: 'trending',
    aliases: ['tendencias', 'trends'],
    category: 'info',
    desc: 'Muestra las tendencias de Google de un país.',
    usage: 'trending [código de país]',
    async execute(ctx) {
      const geo = (ctx.args[0] || 'US').toUpperCase();
      const items = await getTrending(geo);
      const list = items
        .map((t, i) => `${i + 1}. *${truncate(t.title, 140)}*${t.link ? `\n   🔗 ${t.link}` : ''}`)
        .join('\n\n');
      await ctx.reply(`📈 *TENDENCIAS EN ${geo}*\n\n${list}`);
    },
  },
  {
    name: 'lyrics',
    aliases: ['letra', 'letras'],
    category: 'info',
    desc: 'Busca la letra de una canción.',
    usage: 'lyrics <artista - canción>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}lyrics* Artista - Canción`);
        return;
      }
      await ctx.react('🎵');
      const { artist, title } = await findLyrics(query);
      const lyrics = await getLyrics(artist, title);
      await sendLong(ctx, `🎵 *${title}* — ${artist}\n\n`, truncate(lyrics, 7000));
    },
  },
  {
    name: 'series',
    aliases: ['tv', 'serie', 'tvmaze'],
    category: 'info',
    desc: 'Busca una serie de televisión.',
    usage: 'series <nombre>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}series* Breaking Bad`);
        return;
      }
      const data = await fetchJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`, {}, 25000);
      const results = (data || []).slice(0, 5);
      if (!results.length) {
        await ctx.reply('❌ No encontré esa serie.');
        return;
      }
      const list = results
        .map(({ show }, i) => {
          const genres = (show.genres || []).join(', ') || '?';
          const rating = show.rating?.average ?? '?';
          return `${i + 1}. *${show.name}* (${show.premiered?.slice(0, 4) || '?'})\n   🎭 ${genres}\n   ⭐ ${rating}\n   🔗 ${show.url}`;
        })
        .join('\n\n');
      const first = results[0].show;
      const caption = `📺 *RESULTADOS DE SERIES*\n\n${list}\n\n📝 *${first.name}:* ${truncate(stripHtml(first.summary || 'Sin sinopsis.'), 700)}`;
      if (first.image?.medium) {
        try {
          await ctx.send({ image: { url: first.image.medium }, caption });
          return;
        } catch {}
      }
      await ctx.reply(caption);
    },
  },
];
