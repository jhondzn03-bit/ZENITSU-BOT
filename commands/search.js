import {
  onThisDay,
  stackSearch,
  duckInstant,
  urbanDefine,
  bookSearch,
  itunesSearch,
  steamSearch,
  stockQuote,
  covidCountry,
  nameAge,
  pokemonInfo,
  xkcdComic,
  epicFreeGames,
  nasaApod,
  recipeSearch,
  cocktailSearch,
  imdbSearch,
  archiveMovieSearch,
  archiveMovieFiles,
  itunesApps,
} from '../lib/api.js';
import { truncate, formatNumber, fetchBuffer } from '../lib/utils.js';

// ─── Selector para .peliculasgratis (igual que .ytsearch) ──────────────────
const SEARCH_TTL = 15 * 60 * 1000;
const chatSearches = new Map();

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

const search = [
  {
    name: 'hoy',
    aliases: ['undiacomohoy', 'onthisday', 'efemerides'],
    category: 'search',
    desc: 'Qué pasó un día como hoy en la historia.',
    usage: 'hoy',
    async execute(ctx) {
      await ctx.reply('📖 *Buscando en la historia...*');
      const events = await onThisDay();
      const list = events
        .slice(0, 12)
        .map((e) => `▸ *${e.year}* — ${truncate(e.text, 130)}`)
        .join('\n');
      await ctx.reply(
        `╭─「 📅 UN DÍA COMO HOY 」\n│\n${list}\n│\n╰─ 📜 _Fuente: Wikipedia ES_`,
      );
    },
  },
  {
    name: 'stack',
    aliases: ['stackoverflow', 'programacion'],
    category: 'search',
    desc: 'Busca preguntas en StackOverflow.',
    usage: 'stack <duda de programación>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) return ctx.reply(`💡 Uso: *${ctx.prefix}stack* cómo leer un archivo en python`);
      await ctx.reply('🔎 *Buscando en StackOverflow...*');
      const items = await stackSearch(query, 5);
      const list = items
        .map(
          (i, n) =>
            `${n + 1}. ${truncate(i.title, 90)}\n   👍 ${i.score} · ${i.answered ? '✅ respondida' : '⏳ sin respuesta'}\n   ${i.link}`,
        )
        .join('\n\n');
      await ctx.reply(`╭─「 💻 STACKOVERFLOW 」\n│\n${list}\n╰─ ⚡ _ZENITSU BOT_`);
    },
  },
  {
    name: 'duck',
    aliases: ['duckduckgo', 'instantanea'],
    category: 'search',
    desc: 'Respuesta instantánea de DuckDuckGo.',
    usage: 'duck <tema>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) return ctx.reply(`💡 Uso: *${ctx.prefix}duck* que es la fotosíntesis`);
      await ctx.reply('🦆 *Buscando...*');
      const r = await duckInstant(query);
      let out = `╭─「 🦆 ${truncate(r.heading, 40)} 」\n│\n`;
      if (r.text) out += `${truncate(r.text, 700)}\n│\n`;
      if (r.related.length) {
        out += `📚 _También mira:_\n`;
        for (const rel of r.related.slice(0, 4)) out += `▸ ${truncate(rel.text, 80)}\n`;
        out += '│\n';
      }
      if (r.url) out += `🔗 ${r.url}\n`;
      out += `╰─ 🦆 DuckDuckGo`;
      await ctx.reply(out);
    },
  },
  {
    name: 'urban',
    aliases: ['urbandictionary', 'jerga', 'slang'],
    category: 'search',
    desc: 'Significado en Urban Dictionary (inglés callejero).',
    usage: 'urban <palabra>',
    async execute(ctx) {
      const term = ctx.text.trim();
      if (!term) return ctx.reply(`💡 Uso: *${ctx.prefix}urban* no cap`);
      await ctx.reply('📚 *Buscando en Urban Dictionary...*');
      const d = await urbanDefine(term);
      const clean = (s) => String(s).replace(/\[|\]/g, '').replace(/\r/g, ' ');
      await ctx.reply(
        `╭─「 📖 URBAN DICTIONARY 」\n│\n▸ *Palabra:* ${d.word}\n▸ *Definición:* ${truncate(clean(d.definition), 600)}\n▸ *Ejemplo:* ${truncate(clean(d.example), 300)}\n▸ 👍 ${d.likes} · por ${d.author}\n╰─ 🇬🇧 _Contenido en inglés_`,
      );
    },
  },
  {
    name: 'libro',
    aliases: ['books', 'libros', 'openlibrary'],
    category: 'search',
    desc: 'Busca libros por título.',
    usage: 'libro <título>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) return ctx.reply(`💡 Uso: *${ctx.prefix}libro* cien años de soledad`);
      await ctx.reply('📚 *Buscando libros...*');
      const books = await bookSearch(query, 5);
      const list = books
        .map(
          (b, n) =>
            `${n + 1}. *${truncate(b.title, 70)}*\n   ✍️ ${(b.authors.slice(0, 2).join(', ') || 'Autor desconocido')}${b.year ? ` · 📅 ${b.year}` : ''}\n   ${b.url}`,
        )
        .join('\n\n');
      await ctx.reply(`╭─「 📚 LIBROS 」\n│\n${list}\n╰─ 📖 _Open Library_`);
    },
  },
  {
    name: 'itunes',
    aliases: ['songsearch', 'cancion', 'musicainfo'],
    category: 'search',
    desc: 'Busca canciones con portada y preview.',
    usage: 'musica <canción o artista>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) return ctx.reply(`💡 Uso: *${ctx.prefix}musica* believer imagine dragons`);
      await ctx.reply('🎵 *Buscando música...*');
      const songs = await itunesSearch(query, 6);
      const first = songs[0];
      const lines = songs
        .map(
          (s, n) =>
            `${n + 1}. *${truncate(s.title, 50)}* — ${truncate(s.artist, 30)}${s.price ? ` (${s.price})` : ''}`,
        )
        .join('\n');
      await ctx.send({
        image: { url: first.cover },
        caption: `╭─「 🎵 MÚSICA 」\n│\n${lines}\n│\n▸ 🔗 ${first.url}${first.preview ? `\n▸ ▶️ Preview: ${first.preview}` : ''}\n╰─ 🎵 _iTunes_`,
      });
    },
  },
  {
    name: 'acciones',
    aliases: ['stock', 'bolsa', 'mercado'],
    category: 'search',
    desc: 'Precio de acciones y mercados (AAPL, TSLA...).',
    usage: 'acciones <símbolo>',
    async execute(ctx) {
      const sym = ctx.text.trim().toUpperCase().replace(/\s+/g, '');
      if (!sym) return ctx.reply(`💡 Uso: *${ctx.prefix}acciones* AAPL\n_Símbolos: AAPL, TSLA, MSFT, AMZN, NVDA, GOOGL..._`);
      await ctx.reply('📈 *Consultando el mercado...*');
      const q = await stockQuote(sym);
      const arrow = q.change >= 0 ? '🟢' : '🔴';
      await ctx.reply(
        `╭─「 📈 ${q.symbol} 」\n│\n▸ *${truncate(q.name, 40)}*\n▸ 💰 Precio: *${q.price} ${q.currency}*\n▸ ${arrow} Cambio: ${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)} (${q.percent.toFixed(2)}%)\n╰─ 📊 _Yahoo Finance_`,
      );
    },
  },
  {
    name: 'covid',
    aliases: ['covid19', 'coronavirus'],
    category: 'search',
    desc: 'Estadísticas de COVID por país.',
    usage: 'covid <país>',
    async execute(ctx) {
      const country = ctx.text.trim() || 'El Salvador';
      await ctx.reply(`🦠 *Consultando ${country}...*`);
      const c = await covidCountry(country);
      await ctx.reply(
        `╭─「 🦠 COVID-19 · ${c.country} 」\n│\n▸ 😷 Casos: *${formatNumber(c.cases)}*\n▸ 📊 Hoy: ${formatNumber(c.today)}\n▸ ✅ Recuperados: ${formatNumber(c.recovered)}\n▸ ⚰️ Fallecidos: ${formatNumber(c.deaths)}\n▸ 🟠 Activos: ${formatNumber(c.active)}\n╰─ 🦠 _disease.sh_`,
      );
    },
  },
  {
    name: 'edad',
    aliases: ['agify', 'adivinaedad'],
    category: 'search',
    desc: 'Adivina la edad de alguien por su nombre.',
    usage: 'edad <nombre>',
    async execute(ctx) {
      const name = ctx.text.trim().replace(/\s+/g, '');
      if (!name) return ctx.reply(`💡 Uso: *${ctx.prefix}edad* María`);
      const r = await nameAge(name);
      await ctx.reply(
        `🔮 *El nombre "${r.name}"*\n\n▸ Edad estimada: *${r.age} años*\n▸ Personas registradas: ${formatNumber(r.count)}\n\n_Más común entre los ${Math.max(r.age - 5, 1)} y ${r.age + 5}._`,
      );
    },
  },
  {
    name: 'pokemon',
    aliases: ['pokedex'],
    category: 'search',
    desc: 'Ficha completa de un Pokémon.',
    usage: 'pokemon <nombre o número>',
    async execute(ctx) {
      const query = ctx.text.trim().toLowerCase();
      if (!query) return ctx.reply(`💡 Uso: *${ctx.prefix}pokemon* pikachu`);
      await ctx.reply('🔴 *Consultando la Pokédex...*');
      const p = await pokemonInfo(query);
      const stats = p.stats.map((s) => `   ${s.name.padEnd(14)} ${s.value}`).join('\n');
      await ctx.send({
        image: { url: p.artwork || p.sprite },
        caption: `╭─「 🔴 Pokédex #${String(p.id).padStart(3, '0')} 」\n│\n▸ *${p.name.toUpperCase()}* ${p.types.map((t) => `⌈${t}⌋`).join(' ')}\n▸ 📏 ${p.height} m · ⚖️ ${p.weight} kg\n▸ ✨ ${p.abilities.join(', ')}\n│\n📊 *Estadísticas base:*\n${stats}\n│\n${truncate(p.flavor, 300) || '_Pokémon misterioso._'}\n╰─ 🎮 _PokéAPI_`,
      });
    },
  },
  {
    name: 'xkcd',
    aliases: ['comic', 'comicxkcd'],
    category: 'search',
    desc: 'Cómic geek de xkcd (actual o por número).',
    usage: 'xkcd [número]',
    async execute(ctx) {
      const num = /^\d+$/.test(ctx.text.trim()) ? ctx.text.trim() : '';
      const c = await xkcdComic(num);
      await ctx.send({
        image: { url: c.img },
        caption: `╭─「 💬 xkcd #${c.num} 」\n│\n▸ *${c.title}*\n▸ ${truncate(c.alt, 300)}\n╰─ 🔗 ${c.url}`,
      });
    },
  },
  {
    name: 'epic',
    aliases: ['epicgames', 'juegosgratis'],
    category: 'search',
    desc: 'Juegos GRATIS en Epic Games esta semana.',
    usage: 'epic',
    async execute(ctx) {
      await ctx.reply('🎮 *Buscando juegos gratis...*');
      const games = await epicFreeGames();
      const list = games
        .map(
          (g) =>
            `▸ *${truncate(g.title, 45)}* ${g.current ? '🟢 AHORA' : '⏳ PRÓXIMO'}\n  🔗 ${g.url}`,
        )
        .join('\n');
      await ctx.reply(`╭─「 🎮 EPIC GAMES GRATIS 」\n│\n${list}\n╰─ 🎁 _Cada semana rotan_`);
    },
  },
  {
    name: 'nasa',
    aliases: ['apod', 'espacio'],
    category: 'search',
    desc: 'Foto astronómica del día de la NASA.',
    usage: 'nasa',
    async execute(ctx) {
      await ctx.reply('🚀 *Consultando a la NASA... (puede tardar)_');
      const a = await nasaApod();
      if (a.mediaType === 'image') {
        await ctx.send({
          image: { url: a.url },
          caption: `╭─「 🚀 NASA · FOTO DEL DÍA 」\n│\n▸ *${a.title}*\n▸ 📅 ${a.date}\n│\n${truncate(a.explanation, 900)}\n╰─ ${a.copyright ? `© ${a.copyright}` : 'nasa.gov'}`,
        });
      } else {
        await ctx.reply(`🚀 *${a.title}*\n\n${truncate(a.explanation, 700)}\n\n🎬 ${a.url}`);
      }
    },
  },
  {
    name: 'receta',
    aliases: ['cocina', 'recipes', 'comida'],
    category: 'search',
    desc: 'Busca recetas de cocina con ingredientes.',
    usage: 'receta <plato>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) return ctx.reply(`💡 Uso: *${ctx.prefix}receta* pasta`);
      await ctx.reply('👩‍🍳 *Buscando recetas...*');
      const meals = await recipeSearch(query, 2);
      for (const m of meals) {
        const ings = m.ingredients.slice(0, 12).map((i) => `▸ ${i}`).join('\n');
        await ctx.send({
          image: { url: m.image },
          caption: `╭─「 🍽️ ${truncate(m.name, 35).toUpperCase()} 」\n│\n▸ 🍴 ${m.category} · 🌍 ${m.area}\n│\n🧺 *Ingredientes:*\n${ings}\n│\n👨‍🍳 *Preparación:*\n${truncate(m.instructions, 700)}\n${m.youtube ? `\n▶️ ${m.youtube}\n` : ''}╰─ 🍳 _TheMealDB_`,
        });
      }
    },
  },
  {
    name: 'coctel',
    aliases: ['cocktail', 'bebida', 'trago'],
    category: 'search',
    desc: 'Cómo preparar cócteles.',
    usage: 'coctel <nombre>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) return ctx.reply(`💡 Uso: *${ctx.prefix}coctel* margarita`);
      await ctx.reply('🍹 *Buscando el trago...*');
      const drinks = await cocktailSearch(query, 1);
      const d = drinks[0];
      const ings = d.ingredients.map((i) => `▸ ${i}`).join('\n');
      await ctx.send({
        image: { url: d.image },
        caption: `╭─「 🍹 ${d.name.toUpperCase()} 」\n│\n▸ 🍸 Vaso: ${d.glass}\n▸ ${d.alcoholic === 'Alcoholic' ? '🍺 Con alcohol' : '🥤 Sin alcohol'} · ${d.category}\n│\n🧺 *Ingredientes:*\n${ings}\n│\n👨‍🍳 ${truncate(d.instructions, 500)}\n╰─ 🍸 _TheCocktailDB_`,
      });
    },
  },
  {
    name: 'pelicula',
    aliases: ['movie', 'peliculas', 'imdb', 'cine'],
    category: 'search',
    desc: 'Busca una película: póster, año y ficha de IMDb.',
    usage: 'pelicula <nombre>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) return ctx.reply(`💡 Uso: *${ctx.prefix}pelicula* interstellar`);
      await ctx.reply('🎬 *Buscando en el cine...*');
      const movies = await imdbSearch(query, 1);
      const m = movies[0];
      await ctx.send({
        image: { url: m.poster },
        caption: `╭─「 🎬 ${truncate(m.title, 40).toUpperCase()} 」\n│\n▸ 🎞️ *${m.type}* · 📅 ${m.year || '?'}\n▸ 👥 ${truncate(m.stars, 150)}\n▸ ⭐ Ficha completa: ${m.url}\n│\n_Para *descargar* clásicos gratis:_\n▸ *${ctx.prefix}peliculasgratis <nombre>*\n╰─ 🎥 _IMDb_`,
      });
    },
  },
  {
    name: 'peliculasgratis',
    aliases: ['peliculagrat', 'moviefree', 'cinelibre', 'clasicos'],
    category: 'search',
    desc: 'Descarga películas clásicas de dominio público como VIDEO (100% legal).',
    usage: 'peliculasgratis <nombre | número>',
    async execute(ctx) {
      const arg = ctx.text.trim();

      // Selector: .peliculasgratis 3 → descarga el resultado 3.
      if (/^\d{1,2}$/.test(arg)) {
        const last = getLastSearch(ctx.chat, 'archive');
        if (!last) {
          await ctx.reply(`❌ No hay una lista reciente de películas aquí.\n\n_Busca primero:_ *${ctx.prefix}peliculasgratis <nombre>*`);
          return;
        }
        const pick = last.results[Number(arg) - 1];
        if (!pick) {
          await ctx.reply(`❌ Ese número no está en la lista (hay ${last.results.length}).`);
          return;
        }
        await ctx.reply(`⏬ *Preparando "${truncate(pick.title, 40)}"...*`);
        const { files, title } = await archiveMovieFiles(pick.identifier);
        // WhatsApp solo reproduce como VIDEO los archivos MP4/M4V. Si la
        // película solo existe en .ogv/.webm, se dan los enlaces en su lugar.
        const video = files.find((f) => /\.(mp4|m4v)$/i.test(f.name));
        if (!video) {
          const alt = files[0]; // el más liviano
          const ext = (alt.name.split('.').pop() || 'video').toLowerCase();
          await ctx.reply(
            `🎬 *${truncate(title, 50)}* solo tiene formato de archivo (\`.${ext}\`), que WhatsApp no reproduce.\n\n▸ 🎥 Mírala online: ${pick.url}\n▸ ⏬ Descárgala aquí:\n${alt.url}`,
          );
          return;
        }
        const mb = video.size / (1024 * 1024);
        if (mb > 65) {
          // Demasiado pesado para WhatsApp: mando el enlace directo.
          await ctx.reply(
            `🎬 *${truncate(title, 50)}* pesa *${mb.toFixed(1)} MB* (muy pesado para subirlo).\n\n▸ ⏬ Descárgala aquí:\n${video.url}\n▸ 🎥 Ver online: ${pick.url}`,
          );
          return;
        }
        await ctx.reply(`📥 *Descargando ${mb.toFixed(1)} MB y subiendo... (paciencia)*`);
        const buffer = await fetchBuffer(video.url);
        // Se envía como VIDEO para que se reproduzca directo en el chat:
        // los documentos no tienen reproductor y pueden verse sospechosos.
        await ctx.send({
          video: buffer,
          mimetype: 'video/mp4',
          caption: `🎬 *${truncate(title, 50)}*\n\n▸ 📅 ${pick.year || 'Clásico'} · ${formatNumber(pick.downloads)} descargas\n▸ 100% legal: dominio público\n▸ 🔗 ${pick.url}`,
        });
        return;
      }

      if (!arg) {
        await ctx.reply(
          `💡 Uso: *${ctx.prefix}peliculasgratis* sherlock holmes\n\n_Se envían como video 🎬 · Elige: buscar → número → descarga._\n_Son películas clásicas de dominio público (Chaplin, terror retro, noir...)_`,
        );
        return;
      }
      await ctx.reply('🔎 *Buscando en el archivo público...*');
      const movies = await archiveMovieSearch(arg, 8);
      rememberSearch(ctx.chat, 'archive', arg, movies);
      const list = movies
        .map((m, n) => `${n + 1}. 🎬 *${truncate(m.title, 45)}*${m.year ? ` (${m.year})` : ''}\n   ▸ ${m.url}`)
        .join('\n');
      await ctx.reply(
        `╭─「 🎬 PELÍCULAS GRATIS 」\n│\n${list}\n│\n📥 _Elige con_ *${ctx.prefix}peliculasgratis <número>*\n╰─ 🎞️ Dominio público · Internet Archive`,
      );
    },
  },
  {
    name: 'appstore',
    aliases: ['apps', 'aplicaciones', 'buscarapp'],
    category: 'search',
    desc: 'Busca apps (estilo Play Store) con precio y valoración.',
    usage: 'appstore <app>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) return ctx.reply(`💡 Uso: *${ctx.prefix}appstore* whatsapp`);
      await ctx.reply('📱 *Buscando apps...*');
      const apps = await itunesApps(query, 5);
      const first = apps[0];
      const lines = apps
        .map(
          (a, n) =>
            `${n + 1}. *${truncate(a.name, 35)}* — ${a.price}\n   👨‍💻 ${truncate(a.developer, 30)} · ⭐ ${a.rating.toFixed(1)} (${formatNumber(a.ratings)})`,
        )
        .join('\n');
      await ctx.send({
        image: { url: first.icon },
        caption: `╭─「 📱 APPS 」\n│\n${lines}\n│\n▸ 🔗 ${first.url}\n╰─ 📲 _${truncate(first.description, 200)}_`,
      });
    },
  },
];

export default search;
