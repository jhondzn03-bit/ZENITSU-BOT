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

/* ─────────────────────────────── Imágenes NSFW ─────────────────────────── */

// Categorías +18 disponibles. API purrbot v2 (la única viva y verificada):
//   https://api.purrbot.site/v2/img/nsfw/{categoría}/gif
// Todas funcionan con GIFs (las rutas /jpg fueron retiradas de la API).
export const NSFW_CATEGORIES = {
  anal: 'Anal',
  blowjob: 'Blowjob',
  cum: 'Cum',
  fuck: 'Sexo',
  neko: 'Neko +18',
  pussylick: 'Pussylick',
  solo: 'Solo (chica)',
  threesome_ffm: 'Trío (FFM)',
  yaoi: 'Yaoi (chicos)',
  yuri: 'Yuri (chicas)',
};

export function isNsfwCategory(category) {
  return Object.prototype.hasOwnProperty.call(NSFW_CATEGORIES, String(category || '').toLowerCase().trim());
}

// Devuelve el enlace de un GIF +18 de la categoría pedida.
// Reintenta una vez: el CDN de purrbot a veces tarda en responder.
export async function getNsfwImage(category = 'neko') {
  const key = String(category || '').toLowerCase().trim();
  if (!isNsfwCategory(key)) {
    throw new Error(`Categoría no válida. Disponibles: ${Object.keys(NSFW_CATEGORIES).join(', ')}`);
  }
  const errors = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await fetchJson(`https://api.purrbot.site/v2/img/nsfw/${key}/gif`, {}, 20000);
      if (data?.link && !data?.error) return data.link;
      throw new Error(data?.message || 'respuesta sin enlace');
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`No se pudo obtener el contenido +18 (intenta de nuevo). ${errors[errors.length - 1]}`);
}

/* ─────────────────────────── Videos adultos (+18) ───────────────────────── */

// XVideos, XNXX y PornHub no tienen API pública y las APIs de terceros están
// muertas: se scrapea su HTML directamente (verificado nov-2026). Sus CDNs
// exigen la cabecera Referer, por eso los mp4 se bajan como buffer y no por URL.
const ADULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const ADULT_HEADERS = { 'user-agent': ADULT_UA };

const HTML_ENTITIES = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', deg: '°', middot: '·', bull: '•', copy: '©', reg: '®',
};

function decodeEntities(text = '') {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => HTML_ENTITIES[name] || m)
    .replace(/\s+/g, ' ')
    .trim();
}

// Enlaces de estos tres sitios se pueden descargar directo (.xvideo <enlace>).
export function isAdultSite(url) {
  return /xnxx\.com|xvideos\.com|pornhub\.com/i.test(String(url || ''));
}

// Busca videos en XVideos / XNXX / PornHub. Devuelve [{ title, url }] sin
// depender de ninguna API externa.
export async function adultVideoSearch(query, { site = 'xvideos', gay = false, limit = 8 } = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('escribe qué quieres buscar');
  const term = gay ? `${q} gay` : q;

  let origin;
  let searchUrl;
  if (site === 'pornhub') {
    origin = 'https://www.pornhub.com';
    searchUrl = `${origin}/video/search?search=${encodeURIComponent(term)}`;
  } else if (site === 'xnxx') {
    origin = 'https://www.xnxx.com';
    searchUrl = `${origin}/?k=${encodeURIComponent(term)}`;
  } else {
    origin = 'https://www.xvideos.com';
    searchUrl = `${origin}/?k=${encodeURIComponent(term)}`;
  }

  const res = await fetchWithTimeout(searchUrl, { headers: ADULT_HEADERS, redirect: 'follow' }, 25000);
  if (!res.ok) throw new Error(`el sitio respondió HTTP ${res.status}`);
  const html = await res.text();

  const out = [];
  const seen = new Set();
  if (site === 'pornhub') {
    for (const m of html.matchAll(/href="\/view_video\.php\?viewkey=(\w+)"[^>]*title="([^"]{3,120})"/g)) {
      const key = m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title: decodeEntities(m[2]), url: `${origin}/view_video.php?viewkey=${key}` });
    }
  } else {
    for (const m of html.matchAll(/<a\s+href="(\/video[^"]+)"[^>]*title="([^"]{3,120})"/g)) {
      const path = m[1].split('?')[0];
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ title: decodeEntities(m[2]), url: origin + path });
    }
  }
  if (!out.length) throw new Error('no encontré videos con esa búsqueda');
  return out.slice(0, limit);
}

// Abre la página del video y extrae el mp4 directo (mejor calidad primero).
// Devuelve { urls, title, thumb, referer }.
export async function adultVideoInfo(url) {
  const target = String(url || '');
  const isPH = /pornhub\.com/i.test(target);
  const referer = isPH
    ? 'https://www.pornhub.com/'
    : target.includes('xnxx.com')
      ? 'https://www.xnxx.com/'
      : 'https://www.xvideos.com/';

  const res = await fetchWithTimeout(target, { headers: ADULT_HEADERS, redirect: 'follow' }, 25000);
  if (!res.ok) throw new Error(`la página del video respondió HTTP ${res.status}`);
  const html = await res.text();

  // mp4 directos embebidos en el HTML (excluye rutas escapadas y previews).
  const urls = [...new Set([...html.matchAll(/https?:\/\/[^\s"'\\]+?\.mp4[^\s"'\\]*/g)].map((m) => m[0]))];
  const videos = isPH
    ? urls.filter((u) => /phncdn\.com\/[^/]+\/videos\//.test(u)) // las rutas /pics/ son previews
    : urls;
  videos.sort((a, b) => quality(b) - quality(a));
  if (!videos.length) throw new Error('no encontré el mp4 del video');

  const title = decodeEntities(
    (html.match(/<title>([^<]+)<\/title>/)?.[1] || 'Video +18')
      .replace(/\s*-\s*(?:XVIDEOS|XNXX|Pornhub(?: Gay)?)(?:\.COM)?\s*$/i, ''),
  );
  const thumb = html.match(/property="og:image" content="([^"]+)"/)?.[1] || '';
  return { urls: videos.slice(0, 4), title, thumb, referer };
}

const quality = (u) => Number(String(u).match(/(\d{3})[Pp]/)?.[1] || 0);

// Baja el mp4 con las cabeceras que exige el CDN. Prueba calidades de mejor a
// peor y evita videos gigantes que WhatsApp rechazaría (>~55MB).
export async function adultVideoBuffer(info, maxBytes = 55 * 1024 * 1024) {
  const skipped = [];
  for (const url of info.urls) {
    try {
      const res = await fetchWithTimeout(
        url,
        { method: 'HEAD', headers: { ...ADULT_HEADERS, referer: info.referer }, redirect: 'follow' },
        15000,
      );
      const size = Number(res.headers.get('content-length') || 0);
      if (size && size > maxBytes) {
        skipped.push(`${quality(url)}p pesa ${Math.round(size / 1048576)}MB`);
        continue;
      }    } catch {}
    return fetchBuffer(url, { headers: { ...ADULT_HEADERS, referer: info.referer } }, 240000);
  }
  throw new Error(
    skipped.length
      ? `el video es muy pesado para WhatsApp (${skipped.join(', ')}). Prueba con uno más corto.`
      : 'no se pudo descargar el video',
  );
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

// Lanza TODAS las APIs a la vez y se queda con la primera que responda bien.
// Antes iban una por una con 45s cada una: si 3 estaban muertas el usuario
// esperaba más de 2 minutos sin respuesta. Ahora: máximo ~15s en total.
async function downloadFromApis(endpoints, url, kind = 'any') {
  const attempts = endpoints.map(async (endpoint) => {
    const target = endpoint.replace('{url}', encodeURIComponent(url)).replace('{raw}', url);
    const data = await fetchJson(target, {}, 15000);
    const urls = mediaFilter(collectUrls(data), kind);
    if (!urls.length) throw new Error('respuesta sin enlaces');
    return { urls, title: findTitle(data), raw: data, endpoint: target };
  });

  try {
    return await Promise.any(attempts);
  } catch (err) {
    const errors = (err?.errors || [err]).map((e) => e?.message || 'sin datos');
    throw new Error(`Ninguna API respondió. ${errors.slice(0, 2).join(' | ')}`);
  }
}

// yt-dlp como respaldo universal: soporta Instagram, Facebook, X/Twitter,
// Pinterest, TikTok y más. Devuelve el enlace directo del archivo.
async function ytdlpDirectUrl(url, kind = 'any', timeout = 90000) {
  const formatArgs =
    kind === 'audio'
      ? ['-f', 'ba[ext=m4a]/ba/best', '-g']
      : ['-f', '18/best[ext=mp4]/best', '-g'];
  const out = await ytdlp([...formatArgs, '--no-warnings', '--no-playlist', url], timeout);
  const direct = out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line))[0];
  if (!direct) throw new Error('yt-dlp no devolvió un enlace directo');
  return direct;
}

export async function tiktokDownload(url) {
  // tikwm es la única API de TikTok viva (verificada): va primero y directo.
  try {
    const data = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {}, 20000);
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
  // Respaldo en paralelo. OJO: yt-dlp CUELGA con TikTok, nunca usarlo aquí.
  const r = await downloadFromApis(
    [
      'https://api.tiklydown.eu.org/api/download?url={url}',
      'https://api.vreden.my.id/api/tiktok?url={url}',
      'https://api.zenkey.my.id/download/tiktok?url={url}',
      'https://api.nexoracle.com/downloader/tiktok?apikey=free&url={url}',
    ],
    url,
    'video',
  );
  return { title: r.title || 'TikTok', video: r.urls[0], images: [], audio: '' };
}

// Descarga con red de seguridad doble:
//   1. APIs en paralelo (la primera que responda gana, ~15s máximo)
//   2. extraFallback (opcional: scrape del HTML o truco específico)
//   3. yt-dlp directo (respaldo universal)
// Nunca se queda "pensando": responde o da error claro en <2 min.
async function downloadWithFallback(endpoints, url, kind, source, extraFallback) {
  let apiError = '';
  try {
    return await downloadFromApis(endpoints, url, kind);
  } catch (err) {
    apiError = err.message;
  }
  if (extraFallback) {
    try {
      const result = await extraFallback();
      if (result) return result;
    } catch (err) {
      apiError += ` · ${err.message}`;
    }
  }
  try {
    const direct = await ytdlpDirectUrl(url, kind, 60000);
    return { urls: [direct], title: source, raw: {}, endpoint: 'yt-dlp' };
  } catch (err) {
    throw new Error(`No se pudo descargar. ${apiError} · yt-dlp: ${err.message}`);
  }
}

export async function instagramDownload(url) {
  return downloadWithFallback(
    [
      'https://api.tiklydown.eu.org/api/download?url={url}',
      'https://api.vreden.my.id/api/igdl?url={url}',
      'https://api.zenkey.my.id/download/igdl?url={url}',
      'https://api.nexoracle.com/downloader/instagram?apikey=free&url={url}',
    ],
    url,
    'any',
    'Instagram',
  );
}

export async function facebookDownload(url) {
  return downloadWithFallback(
    [
      'https://api.vreden.my.id/api/fbdl?url={url}',
      'https://api.zenkey.my.id/download/fbdl?url={url}',
      'https://api.nexoracle.com/downloader/facebook?apikey=free&url={url}',
    ],
    url,
    'video',
    'Facebook',
  );
}

export async function twitterDownload(url) {
  return downloadWithFallback(
    [
      'https://api.vreden.my.id/api/twitter?url={url}',
      'https://api.zenkey.my.id/download/twitter?url={url}',
      'https://api.nexoracle.com/downloader/twitter?apikey=free&url={url}',
    ],
    url,
    'any',
    'X (Twitter)',
  );
}

export async function pinterestDownload(url) {
  return downloadWithFallback(
    ['https://api.vreden.my.id/api/pinterest?url={url}', 'https://api.zenkey.my.id/download/pinterest?url={url}'],
    url,
    'any',
    'Pinterest',
    async () => {
      // Respaldo: extraer las imágenes del HTML del pin (sin API).
      const html = await fetchText(url, {}, 20000);
      const urls = [...html.matchAll(/https:\/\/i\.pinimg\.com\/[^"'\s]+?\.(?:jpg|jpeg|png|gif|mp4)/gi)].map((m) => m[0]);
      if (!urls.length) throw new Error('el pin no tiene medios');
      return { urls: [...new Set(urls)].slice(0, 5), title: 'Pinterest', raw: {}, endpoint: 'scrape' };
    },
  );
}

export async function spotifyDownload(url) {
  return downloadWithFallback(
    [
      'https://api.vreden.my.id/api/spotify?url={url}',
      'https://api.zenkey.my.id/download/spotify?url={url}',
      'https://api.nexoracle.com/downloader/spotify?apikey=free&url={url}',
    ],
    url,
    'audio',
    'Spotify',
    async () => {
      // Respaldo inteligente: lee el nombre de la canción con el oEmbed de
      // Spotify y la descarga desde YouTube. Prácticamente infalible.
      const meta = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {}, 15000);
      const title = String(meta?.title || '').trim();
      if (!title) throw new Error('no se pudo leer la canción de Spotify');
      const out = await ytdlp(
        ['-f', 'ba[ext=m4a]/ba/best', '-g', '--no-warnings', '--no-playlist', `ytsearch1:${title} audio`],
        90000,
      );
      const direct = out.split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l))[0];
      if (!direct) throw new Error('no se encontró la canción en YouTube');
      return { urls: [direct], title, raw: { via: 'YouTube' }, endpoint: 'ytsearch' };
    },
  );
}

export async function mediafireDownload(url) {
  return downloadWithFallback(
    ['https://api.vreden.my.id/api/mediafire?url={url}', 'https://api.zenkey.my.id/download/mediafire?url={url}'],
    url,
    'any',
    'MediaFire',
    async () => {
      // Respaldo: el enlace directo está en el botón de descarga del HTML.
      const html = await fetchText(url, {}, 20000);
      const match = html.match(/href="(https?:\/\/download[^"]+)"/i);
      if (!match) throw new Error('no se encontró el enlace directo');
      return { urls: [match[1].replace(/&amp;/g, '&')], title: 'MediaFire', raw: {}, endpoint: 'scrape' };
    },
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
