import {
  fetchJson,
  fetchText,
  fetchBuffer,
  fetchWithTimeout,
  decodeHtml,
  stripHtml,
  collectUrls,
  findTitle,
  extensionForMime,
  execFileAsync,
} from './utils.js';

/* ────────────────────────────────── IA ──────────────────────────────────── */

const AI_MODELS = ['openai', 'mistral', 'deepseek', 'qwen-coder'];

export async function aiText(prompt, options = {}) {
  const {
    system = 'Eres ZENITSU BOT, un asistente de WhatsApp amable, divertido y con temática de Demon Slayer. Responde SIEMPRE en español, de forma clara y útil. No uses markdown excesivo.',
    model = 'openai',
    history = [],
  } = options;

  const messages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...history,
    { role: 'user', content: prompt },
  ];

  const models = [model, ...AI_MODELS.filter((m) => m !== model)];
  let lastError;

  for (const m of models) {
    try {
      const res = await fetchWithTimeout(
        'https://text.pollinations.ai/',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages, model: m, seed: Math.floor(Math.random() * 999999), private: true }),
        },
        60000,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = (await res.text()).trim();
      if (text && !/^\s*<!doctype/i.test(text)) return text;
    } catch (err) {
      lastError = err;
    }

    try {
      const text = await fetchText(
        `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${encodeURIComponent(m)}&seed=${Math.floor(Math.random() * 999999)}`,
        {},
        60000,
      );
      if (text.trim() && !/^\s*<!doctype/i.test(text)) return text.trim();
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`La IA no respondió: ${lastError?.message || 'sin conexión'}`);
}

export async function geminiText(prompt, key, system = '') {
  if (!key) throw new Error('Falta la API key de Gemini. Usa: .setapi gemini TU_API_KEY');
  const body = {
    contents: [{ role: 'user', parts: [{ text: system ? `${system}\n\n${prompt}` : prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
  };
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  let lastError;
  for (const model of models) {
    try {
      const data = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        60000,
      );
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      if (text.trim()) return text.trim();
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(lastError?.message || 'Gemini no respondió');
}

export function pollinationsImageUrl(prompt, options = {}) {
  const { width = 1024, height = 1024, model = 'flux', seed = Math.floor(Math.random() * 999999) } = options;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true&private=true`;
}

export async function aiImage(prompt, options = {}) {
  const url = pollinationsImageUrl(prompt, options);
  const buffer = await fetchBuffer(url, {}, 120000);
  if (!buffer.length) throw new Error('La imagen llegó vacía');
  return { buffer, url };
}

/* ─────────────────────────────── Traducción ──────────────────────────────── */

export async function translateText(text, to = 'es', from = 'auto') {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const data = await fetchJson(url, {}, 25000);
    const out = (data?.[0] || []).map((x) => x?.[0] || '').join('');
    if (out.trim()) return out.trim();
  } catch {}

  try {
    const data = await fetchJson(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=${encodeURIComponent(from === 'auto' ? 'es' : from)}|${encodeURIComponent(to)}`,
      {},
      25000,
    );
    const out = data?.responseData?.translatedText;
    if (out) return decodeHtml(out);
  } catch {}

  throw new Error('No se pudo traducir el texto');
}

/* ──────────────────────────────── Clima ─────────────────────────────────── */

const WEATHER_CODES = {
  0: '☀️ Despejado',
  1: '🌤️ Mayormente despejado',
  2: '⛅ Parcialmente nublado',
  3: '☁️ Nublado',
  45: '🌫️ Niebla',
  48: '🌫️ Niebla con escarcha',
  51: '🌦️ Llovizna ligera',
  53: '🌦️ Llovizna moderada',
  55: '🌧️ Llovizna intensa',
  56: '🌧️ Llovizna helada',
  57: '🌧️ Llovizna helada intensa',
  61: '🌧️ Lluvia ligera',
  63: '🌧️ Lluvia moderada',
  65: '🌧️ Lluvia fuerte',
  66: '🌧️ Lluvia helada',
  67: '🌧️ Lluvia helada fuerte',
  71: '🌨️ Nieve ligera',
  73: '🌨️ Nieve moderada',
  75: '❄️ Nieve fuerte',
  77: '❄️ Granos de nieve',
  80: '🌦️ Chubascos ligeros',
  81: '🌧️ Chubascos moderados',
  82: '⛈️ Chubascos violentos',
  85: '🌨️ Chubascos de nieve',
  86: '❄️ Chubascos de nieve fuertes',
  95: '⛈️ Tormenta',
  96: '⛈️ Tormenta con granizo',
  99: '⛈️ Tormenta fuerte con granizo',
};

export async function getWeather(city) {
  const geo = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es&format=json`,
    {},
    20000,
  );
  const place = geo?.results?.[0];
  if (!place) throw new Error(`No encontré la ciudad "${city}"`);

  const data = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
      '&timezone=auto&forecast_days=3',
    {},
    25000,
  );

  return {
    place: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
    current: {
      temp: data.current?.temperature_2m,
      feels: data.current?.apparent_temperature,
      humidity: data.current?.relative_humidity_2m,
      wind: data.current?.wind_speed_10m,
      rain: data.current?.precipitation,
      code: data.current?.weather_code,
      desc: WEATHER_CODES[data.current?.weather_code] || '🌡️ Clima variable',
    },
    daily: (data.daily?.time || []).slice(0, 3).map((date, i) => ({
      date,
      max: data.daily.temperature_2m_max?.[i],
      min: data.daily.temperature_2m_min?.[i],
      rain: data.daily.precipitation_probability_max?.[i],
      code: data.daily.weather_code?.[i],
      desc: WEATHER_CODES[data.daily.weather_code?.[i]] || '🌡️ Variable',
    })),
  };
}

/* ─────────────────────────────── Wikipedia ──────────────────────────────── */

export async function getWiki(query, lang = 'es') {
  const data = await fetchJson(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}?redirect=true`,
    {},
    25000,
  );
  if (!data?.extract) throw new Error('No encontré información sobre eso');
  return {
    title: data.title,
    extract: data.extract,
    description: data.description,
    thumbnail: data.thumbnail?.source || '',
    url: data.content_urls?.desktop?.page || '',
  };
}

export async function defineWord(word) {
  const data = await fetchJson(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    {},
    20000,
  );
  if (!Array.isArray(data) || !data[0]) throw new Error('No encontré esa palabra en inglés');
  const entry = data[0];
  return {
    word: entry.word,
    phonetic: entry.phonetic || '',
    meanings: (entry.meanings || []).slice(0, 3).map((m) => ({
      partOfSpeech: m.partOfSpeech,
      definitions: (m.definitions || []).slice(0, 2).map((d) => d.definition),
      example: (m.definitions || []).find((d) => d.example)?.example || '',
    })),
  };
}

/* ──────────────────────────────── Países ────────────────────────────────── */

export async function getCountry(name) {
  const data = await fetchJson(
    `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fields=name,capital,region,subregion,population,area,flags,currencies,languages,timezones,cca2,cca3`,
    {},
    25000,
  );
  if (!Array.isArray(data) || !data.length) throw new Error('No encontré ese país');
  return data[0];
}

/* ──────────────────────────────── IP / Red ─────────────────────────────── */

export async function getIpInfo(ip) {
  const target = ip || '';
  const data = await fetchJson(`https://ipwho.is/${encodeURIComponent(target)}`, {}, 20000);
  if (data?.success === false) throw new Error(data.message || 'IP no válida');
  return data;
}

export async function getDns(domain, type = 'A') {
  const data = await fetchJson(
    `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`,
    {},
    20000,
  );
  return data;
}

export async function getWhois(domain) {
  const data = await fetchJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {}, 25000);
  return data;
}

export async function httpCheck(url) {
  const started = Date.now();
  const res = await fetchWithTimeout(url, { redirect: 'follow' }, 20000);
  const ms = Date.now() - started;
  return {
    status: res.status,
    statusText: res.statusText,
    ms,
    contentType: res.headers.get('content-type') || '',
    finalUrl: res.url,
  };
}

/* ──────────────────────────────── GitHub / NPM ──────────────────────────── */

export async function getGithubUser(user) {
  const data = await fetchJson(`https://api.github.com/users/${encodeURIComponent(user)}`, {}, 20000);
  if (data?.message === 'Not Found') throw new Error('Usuario de GitHub no encontrado');
  return data;
}

export async function getGithubRepo(repo) {
  const data = await fetchJson(`https://api.github.com/repos/${repo}`, {}, 20000);
  if (data?.message === 'Not Found') throw new Error('Repositorio no encontrado');
  return data;
}

export async function getNpmPackage(name) {
  const data = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {}, 20000);
  if (data?.error) throw new Error('Paquete de NPM no encontrado');
  let downloads = null;
  try {
    const d = await fetchJson(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`, {}, 15000);
    downloads = d?.downloads ?? null;
  } catch {}
  return { ...data, downloads };
}

/* ──────────────────────────────── Finanzas ─────────────────────────────── */

const COIN_IDS = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  bnb: 'binancecoin',
  sol: 'solana',
  solana: 'solana',
  xrp: 'ripple',
  ada: 'cardano',
  cardano: 'cardano',
  doge: 'dogecoin',
  dogecoin: 'dogecoin',
  dot: 'polkadot',
  polkadot: 'polkadot',
  ltc: 'litecoin',
  litecoin: 'litecoin',
  trx: 'tron',
  tron: 'tron',
  shib: 'shiba-inu',
  avax: 'avalanche-2',
  matic: 'matic-network',
  link: 'chainlink',
  xlm: 'stellar',
  ton: 'the-open-network',
  usdt: 'tether',
  usdc: 'usd-coin',
};

export async function getCrypto(query) {
  const q = String(query || '').toLowerCase().trim();
  let id = COIN_IDS[q] || q;
  if (!COIN_IDS[q]) {
    try {
      const search = await fetchJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, {}, 20000);
      if (search?.coins?.[0]?.id) id = search.coins[0].id;
    } catch {}
  }
  const data = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,eur&include_24hr_change=true&include_market_cap=true`,
    {},
    25000,
  );
  const info = data?.[id];
  if (!info) throw new Error('No encontré esa criptomoneda');
  return { id, ...info };
}

export async function convertCurrency(amount, from, to) {
  const data = await fetchJson(
    `https://api.frankfurter.app/latest?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    {},
    20000,
  );
  if (!data?.rates?.[to]) throw new Error('No se pudo convertir esa moneda');
  return { amount: Number(amount), from, to, result: data.rates[to], date: data.date };
}

/* ──────────────────────────────── Noticias ─────────────────────────────── */

function parseRss(xml, limit = 8) {
  const items = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, limit);
  return items
    .map((m) => {
      const block = m[1];
      const get = (tag) => {
        const r = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
        return r ? r[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
      };
      return {
        title: stripHtml(decodeHtml(get('title'))),
        link: decodeHtml(get('link')),
        date: stripHtml(get('pubDate')),
        source: stripHtml(get('source')),
      };
    })
    .filter((x) => x.title);
}

export async function getNews(topic = 'noticias de hoy') {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=es-419&gl=US&ceid=US:es-419`;
  const xml = await fetchText(url, {}, 25000);
  const items = parseRss(xml, 8);
  if (!items.length) throw new Error('No encontré noticias');
  return items;
}

export async function getTrending(geo = 'US') {
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
  const xml = await fetchText(url, {}, 25000);
  const items = parseRss(xml, 10);
  if (!items.length) throw new Error('No encontré tendencias');
  return items;
}

/* ──────────────────────────────── Música ───────────────────────────────── */

export async function getLyrics(artist, title) {
  const data = await fetchJson(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    {},
    25000,
  );
  if (!data?.lyrics) throw new Error('No encontré la letra de esa canción');
  return data.lyrics.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/* ──────────────────────────────── Anime ────────────────────────────────── */

export async function jikanSearch(kind, query, limit = 5) {
  const endpoint = kind === 'manga' ? 'manga' : kind === 'character' ? 'characters' : 'anime';
  const data = await fetchJson(
    `https://api.jikan.moe/v4/${endpoint}?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`,
    {},
    25000,
  );
  return data?.data || [];
}

const ANIME_QUOTES = [
  { quote: 'El poder de la respiración del trueno no es nada comparado con el valor de proteger a quienes quieres.', anime: 'Demon Slayer', character: 'Zenitsu Agatsuma' },
  { quote: 'No importa cuántas veces caigas, siempre puedes levantarte una vez más.', anime: 'Demon Slayer', character: 'Tanjiro Kamado' },
  { quote: 'Si no puedes hacer algo, entonces hazlo con todas tus fuerzas.', anime: 'Demon Slayer', character: 'Kyojuro Rengoku' },
  { quote: 'La verdadera fuerza no está en no tener miedo, sino en seguir adelante a pesar de él.', anime: 'Demon Slayer', character: 'Zenitsu Agatsuma' },
  { quote: 'No permitas que tus miedos decidan tu futuro.', anime: 'Naruto', character: 'Naruto Uzumaki' },
  { quote: 'El trabajo duro es inútil para quien no cree en sí mismo.', anime: 'My Hero Academia', character: 'All Might' },
];

export async function getAnimeQuote() {
  try {
    const data = await fetchJson('https://api.animechan.io/v1/quotes/random', {}, 20000);
    const q = data?.data || data;
    if (q?.content) {
      return {
        quote: q.content,
        anime: q.anime?.name || q.anime || 'Anime',
        character: q.character?.name || q.character || 'Personaje',
      };
    }
  } catch {}
  return ANIME_QUOTES[Math.floor(Math.random() * ANIME_QUOTES.length)];
}

/* ────────────────────────────── Imágenes anime ─────────────────────────── */

const ANIME_IMAGE_TYPES = new Set(['waifu', 'husbando', 'neko', 'kitsune']);

export async function getWaifuImage(type = 'waifu') {
  const category = ANIME_IMAGE_TYPES.has(type) ? type : 'waifu';
  const errors = [];
  try {
    const data = await fetchJson(`https://nekos.best/api/v2/${category}?amount=1`, {}, 20000);
    const url = data?.results?.[0]?.url;
    if (url) return url;
  } catch (err) {
    errors.push(`nekos.best: ${err.message}`);
  }
  try {
    const data = await fetchJson(`https://nekos.life/api/v2/img/${category}`, {}, 20000);
    if (data?.url) return data.url;
  } catch (err) {
    errors.push(`nekos.life: ${err.message}`);
  }
  throw new Error(`No se pudo obtener la imagen. ${errors.join(' | ')}`);
}

export async function getNekosImage(category = 'neko') {
  if (!ANIME_IMAGE_TYPES.has(category)) return getAnimeReaction(category);
  return getWaifuImage(category);
}

// nekos.best soporta casi todas las reacciones; otakugifs.xyz es el respaldo
// que sí responde cuando nekos.best limita o tarda (por ejemplo en "poke").
const NEKOS_REACTIONS = new Set([
  'pat', 'poke', 'hug', 'kiss', 'slap', 'cuddle', 'bite', 'tickle', 'wave',
  'wink', 'highfive', 'handhold', 'feed', 'smug', 'blush', 'dance', 'cry',
  'laugh', 'bonk', 'yeet',
]);
const OTAKUGIFS_REACTIONS = new Set([
  'pat', 'poke', 'hug', 'kiss', 'slap', 'cuddle', 'bite', 'tickle', 'wave',
  'wink', 'handhold', 'smug', 'blush', 'dance', 'cry', 'laugh',
]);

export async function getAnimeReaction(type = 'pat') {
  const reaction = String(type).toLowerCase();
  const errors = [];

  if (NEKOS_REACTIONS.has(reaction)) {
    try {
      const data = await fetchJson(
        `https://nekos.best/api/v2/${encodeURIComponent(reaction)}?amount=1`,
        {},
        15000,
      );
      const url = data?.results?.[0]?.url;
      if (url) return url;
    } catch (err) {
      errors.push(`nekos.best: ${err.message}`);
    }
  }

  if (OTAKUGIFS_REACTIONS.has(reaction)) {
    try {
      const data = await fetchJson(
        `https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(reaction)}`,
        {},
        15000,
      );
      if (data?.url) return data.url;
    } catch (err) {
      errors.push(`otakugifs: ${err.message}`);
    }
  }

  // Último recurso: una imagen de neko para que el comando nunca quede vacío.
  try {
    return await getWaifuImage('neko');
  } catch {}
  throw new Error(`No se pudo obtener la reacción "${reaction}". ${errors.slice(0, 2).join(' | ')}`);
}

/* ──────────────────────────────── Memes / Fun ──────────────────────────── */

export async function getMeme() {
  const data = await fetchJson('https://meme-api.com/gimme', {}, 20000);
  if (!data?.url) throw new Error('No se pudo obtener el meme');
  return data;
}

export async function getJoke() {
  const data = await fetchJson('https://official-joke-api.appspot.com/random_joke', {}, 20000);
  return { setup: data.setup, punchline: data.punchline };
}

export async function getQuote() {
  try {
    const data = await fetchJson('https://zenquotes.io/api/random', {}, 20000);
    if (data?.[0]?.q) return { quote: data[0].q, author: data[0].a };
  } catch {}
  try {
    const data = await fetchJson('https://api.quotable.io/random', {}, 20000);
    if (data?.content) return { quote: data.content, author: data.author };
  } catch {}
  return { quote: 'El trueno solo asusta a quienes no confían en su corazón.', author: 'Zenitsu Agatsuma' };
}

export async function getFact() {
  const data = await fetchJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', {}, 20000);
  if (!data?.text) throw new Error('No se pudo obtener el dato');
  return data.text;
}

export async function getAdvice() {
  const data = await fetchJson('https://api.adviceslip.com/advice', {}, 20000);
  if (!data?.slip?.advice) throw new Error('No se pudo obtener el consejo');
  return data.slip.advice;
}

/* ──────────────────────────────── Descargas ────────────────────────────── */

function mediaFilter(urls, kind = 'any') {
  const clean = [...new Set(urls)].filter((u) => !/\.(jpe?g|png|webp|gif|ico|svg)(\?|$)/i.test(u));
  if (kind === 'audio') {
    const audio = clean.filter((u) => /\.(mp3|m4a|aac|ogg|opus|wav)(\?|$)/i.test(u) || /audio|mp3|m4a/i.test(u));
    return audio.length ? audio : clean;
  }
  if (kind === 'video') {
    const video = clean.filter((u) => /\.(mp4|webm|mov|mkv)(\?|$)/i.test(u) || /video|mp4|play/i.test(u));
    return video.length ? video : clean;
  }
  return clean;
}

async function downloadFromApis(endpoints, url, kind = 'any') {
  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const target = endpoint.replace('{url}', encodeURIComponent(url)).replace('{raw}', url);
      const data = await fetchJson(target, {}, 45000);
      const urls = mediaFilter(collectUrls(data), kind);
      if (urls.length) {
        return {
          urls,
          title: findTitle(data),
          raw: data,
          endpoint: target,
        };
      }
      errors.push('respuesta sin enlaces');
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`No se pudo descargar. ${errors.slice(0, 3).join(' | ')}`);
}

export async function tiktokDownload(url) {
  try {
    const data = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {}, 30000);
    if (data?.code === 0 && data?.data) {
      const d = data.data;
      return {
        title: d.title || 'TikTok',
        author: d.author?.nickname || d.author?.unique_id || '',
        video: d.play || d.wmplay || '',
        audio: d.music || '',
        images: Array.isArray(d.images) ? d.images : [],
        duration: d.duration || 0,
        cover: d.cover || '',
      };
    }
  } catch {}
  const r = await downloadFromApis(
    [
      'https://api.tiklydown.eu.org/api/download?url={url}',
      'https://api.vreden.my.id/api/tiktok?url={url}',
      'https://api.zenkey.my.id/download/tiktok?url={url}',
    ],
    url,
    'video',
  );
  return { title: r.title || 'TikTok', video: r.urls[0], images: [], audio: '' };
}

export async function instagramDownload(url) {
  return downloadFromApis(
    [
      'https://api.tiklydown.eu.org/api/download?url={url}',
      'https://api.vreden.my.id/api/igdl?url={url}',
      'https://api.zenkey.my.id/download/igdl?url={url}',
      'https://api.nexoracle.com/downloader/instagram?apikey=free&url={url}',
    ],
    url,
    'any',
  );
}

export async function facebookDownload(url) {
  return downloadFromApis(
    [
      'https://api.vreden.my.id/api/fbdl?url={url}',
      'https://api.zenkey.my.id/download/fbdl?url={url}',
      'https://api.nexoracle.com/downloader/facebook?apikey=free&url={url}',
    ],
    url,
    'video',
  );
}

export async function twitterDownload(url) {
  return downloadFromApis(
    [
      'https://api.vreden.my.id/api/twitter?url={url}',
      'https://api.zenkey.my.id/download/twitter?url={url}',
      'https://api.nexoracle.com/downloader/twitter?apikey=free&url={url}',
    ],
    url,
    'any',
  );
}

export async function pinterestDownload(url) {
  try {
    const r = await downloadFromApis(
      ['https://api.vreden.my.id/api/pinterest?url={url}', 'https://api.zenkey.my.id/download/pinterest?url={url}'],
      url,
      'any',
    );
    if (r.urls.length) return r;
  } catch {}
  const html = await fetchText(url, {}, 30000);
  const urls = [...html.matchAll(/https:\/\/i\.pinimg\.com\/[^"'\s]+?\.(?:jpg|jpeg|png|gif|mp4)/gi)].map((m) => m[0]);
  if (!urls.length) throw new Error('No se pudo descargar el pin');
  return { urls: [...new Set(urls)].slice(0, 5), title: 'Pinterest' };
}

export async function spotifyDownload(url) {
  return downloadFromApis(
    [
      'https://api.vreden.my.id/api/spotify?url={url}',
      'https://api.zenkey.my.id/download/spotify?url={url}',
      'https://api.nexoracle.com/downloader/spotify?apikey=free&url={url}',
    ],
    url,
    'audio',
  );
}

export async function mediafireDownload(url) {
  return downloadFromApis(
    ['https://api.vreden.my.id/api/mediafire?url={url}', 'https://api.zenkey.my.id/download/mediafire?url={url}'],
    url,
    'any',
  );
}

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';

async function ytdlp(args, timeout = 120000) {
  try {
    const { stdout } = await execFileAsync(YTDLP, args, {
      timeout,
      maxBuffer: 24 * 1024 * 1024,
    });
    return String(stdout || '').trim();
  } catch (err) {
    const raw = String(err.stderr || err.message || '');
    if (/ENOENT|not found/i.test(raw)) {
      throw new Error('yt-dlp no está instalado. Ejecuta: pkg install yt-dlp');
    }
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    throw new Error(lines[lines.length - 1] || 'Error de yt-dlp');
  }
}

function parseYtJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('YouTube devolvió una respuesta inválida');
  }
}

export async function searchYouTube(query, limit = 5) {
  const count = Math.max(1, Math.min(10, Number(limit) || 5));
  const target = /^https?:\/\//i.test(query) ? query : `ytsearch${count}:${query}`;
  const raw = await ytdlp(
    ['--dump-single-json', '--skip-download', '--no-warnings', '--flat-playlist', target],
    90000,
  );
  const data = parseYtJson(raw);
  const entries = (data.entries || [data]).filter(Boolean).slice(0, count);
  if (!entries.length) throw new Error('No encontré resultados en YouTube');

  return entries.map((e) => {
    const id = e.id || '';
    const thumbs = Array.isArray(e.thumbnails) ? e.thumbnails : [];
    return {
      id,
      title: e.title || 'Video de YouTube',
      author: e.uploader || e.channel || '',
      thumbnail:
        thumbs[thumbs.length - 1]?.url ||
        (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''),
      url:
        e.webpage_url ||
        (String(e.url || '').startsWith('http') ? e.url : '') ||
        (id ? `https://www.youtube.com/watch?v=${id}` : ''),
      duration: e.duration_string || (e.duration ? String(e.duration) : ''),
    };
  });
}

export async function youtubeDownload(url, kind = 'audio') {
  const raw = await ytdlp(
    ['--dump-single-json', '--skip-download', '--no-warnings', url],
    120000,
  );
  const info = parseYtJson(raw);

  // Audio: m4a para que WhatsApp lo reproduzca bien.
  // Video: formato 18 (MP4 360p con audio) o el mejor MP4 de una sola pista.
  const formatArgs =
    kind === 'audio'
      ? ['-f', 'ba[ext=m4a]/ba/best', '-g']
      : ['-f', '18/best[ext=mp4]/best', '-g'];
  const out = await ytdlp([...formatArgs, '--no-warnings', url], 120000);
  const direct = out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line))[0];
  if (!direct) throw new Error('YouTube no devolvió un enlace de descarga');

  return {
    urls: [direct],
    title: info.title || '',
    author: info.uploader || info.channel || '',
    duration: info.duration_string || '',
    thumbnail: info.thumbnail || '',
    raw: info,
  };
}

/* ───────────────────────────── Herramientas web ────────────────────────── */

export async function shortenUrl(url) {
  const short = await fetchText(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, {}, 20000);
  if (!/^https?:\/\//i.test(short.trim())) throw new Error('No se pudo acortar el enlace');
  return short.trim();
}

export async function qrBuffer(text, size = 1000) {
  return fetchBuffer(
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=20&data=${encodeURIComponent(text)}`,
    {},
    30000,
  );
}

export async function screenshotBuffer(url) {
  return fetchBuffer(`https://image.thum.io/get/width/1200/crop/900/noanimate/${url}`, {}, 90000);
}

export async function carbonBuffer(code, language = 'auto') {
  const res = await fetchWithTimeout(
    'https://carbonara.solopov.dev/api/capture',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, language }),
    },
    60000,
  );
  if (!res.ok) throw new Error(`No se pudo generar la imagen (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function ttsAudio(text, lang = 'es') {
  const voices = {
    es: 'Enrique',
    en: 'Brian',
    pt: 'Vitoria',
    fr: 'Celine',
    de: 'Hans',
    it: 'Giorgio',
    ja: 'Takumi',
    ru: 'Maxim',
    ar: 'Zeina',
  };
  const voice = voices[lang] || 'Enrique';
  return fetchBuffer(
    `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`,
    {},
    45000,
  );
}

export async function catboxUpload(buffer, filename = 'archivo.bin') {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([buffer]), filename);
  const res = await fetchWithTimeout('https://catbox.moe/user/api.php', { method: 'POST', body: form }, 90000);
  if (!res.ok) throw new Error(`Catbox respondió HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (!/^https?:\/\//i.test(text)) throw new Error(text || 'No se pudo subir el archivo');
  return text;
}

export async function fetchAny(url) {
  const res = await fetchWithTimeout(url, { redirect: 'follow' }, 30000);
  const contentType = res.headers.get('content-type') || '';
  if (/json/i.test(contentType)) {
    return { type: 'json', data: await res.json() };
  }
  if (/^image\//i.test(contentType)) {
    return { type: 'image', data: Buffer.from(await res.arrayBuffer()), contentType };
  }
  const text = await res.text();
  return { type: 'text', data: text, contentType };
}

export function guessMimeFromUrl(url) {
  const clean = String(url).split('?')[0].toLowerCase();
  if (/\.(mp3|m4a|aac|ogg|opus|wav)$/.test(clean)) return 'audio/mpeg';
  if (/\.(mp4|webm|mov|mkv)$/.test(clean)) return 'video/mp4';
  if (/\.(jpg|jpeg)$/.test(clean)) return 'image/jpeg';
  if (/\.png$/.test(clean)) return 'image/png';
  if (/\.webp$/.test(clean)) return 'image/webp';
  if (/\.gif$/.test(clean)) return 'image/gif';
  if (/\.pdf$/.test(clean)) return 'application/pdf';
  return 'application/octet-stream';
}

export { extensionForMime };
