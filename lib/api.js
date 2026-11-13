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

// Fuentes (restcountries v3.1 fue deprecado en 2026 y v5 ya exige API key):
//   • Datos base: mledoze/countries vía jsDelivr (250 países, estable)
//   • Población: worldbank.org (oficial, sin key)
//   • Zonas horarias: moment-timezone (paquete npm, vía jsDelivr)
//   • Bandera: flagcdn.com (el mismo CDN que usaba restcountries)
// Todo se cachea en memoria: solo la primera búsqueda paga el costo de red.
let countryCache = null;
let timezoneCache = null;
const populationCache = new Map();

async function loadCountryData() {
  if (countryCache) return countryCache;
  countryCache = fetchJson('https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json', {}, 30000)
    .then(async (list) => {
      if (!Array.isArray(list) || !list.length) throw new Error('dataset de países vacío');
      for (const c of list) c._search = [c.name?.common, c.name?.official, c.translations?.spa?.common, c.translations?.spa?.official, c.cca2, c.cca3]
        .filter(Boolean).map((s) => String(s).toLowerCase());
      return list;
    })
    .catch((err) => {
      countryCache = null; // permite reintentar la próxima vez
      throw err;
    });
  return countryCache;
}

async function loadTimezones() {
  if (timezoneCache) return timezoneCache;
  try {
    const data = await fetchJson('https://cdn.jsdelivr.net/npm/moment-timezone/data/meta/latest.json', {}, 20000);
    timezoneCache = data?.countries || {};
  } catch {
    timezoneCache = {};
  }
  return timezoneCache;
}

async function countryPopulation(cca3) {
  if (populationCache.has(cca3)) return populationCache.get(cca3);
  let value = 0;
  try {
    const data = await fetchJson(
      `https://api.worldbank.org/v2/country/${encodeURIComponent(cca3)}/indicator/SP.POP.TOTL?format=json&date=2023&per_page=1`,
      {},
      12000,
    );
    value = Number(data?.[1]?.[0]?.value) || 0;
  } catch {}
  populationCache.set(cca3, value);
  return value;
}

export async function getCountry(name) {
  const q = String(name || '').toLowerCase().trim();
  if (!q) throw new Error('escribe un país');
  const list = await loadCountryData();

  // Coincidencia exacta (nombre inglés/español/código) y luego parcial.
  let best =
    list.find((c) => c._search.some((s) => s === q)) ||
    list.find((c) => c._search.some((s) => s.includes(q) || q.includes(s)));
  if (!best) throw new Error('No encontré ese país');

  const [population, tzMap] = await Promise.all([countryPopulation(best.cca3), loadTimezones()]);
  return {
    name: {
      common: best.translations?.spa?.common || best.name?.common,
      official: best.translations?.spa?.official || best.name?.official,
    },
    capital: best.capital || [],
    region: best.region || '?',
    subregion: best.subregion || '?',
    population,
    area: best.area || 0,
    currencies: best.currencies || {},
    languages: best.languages || {},
    timezones: tzMap[best.cca2]?.zones || [],
    cca2: best.cca2,
    cca3: best.cca3,
    flags: { png: `https://flagcdn.com/w320/${String(best.cca2).toLowerCase()}.png` },
  };
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
    `https://api.frankfurter.dev/v1/latest?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
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

// AniList GraphQL: reemplazo de jikan (api.jikan.moe dejó de responder).
// Soporta anime, manga y personajes. Sin API key.
export async function anilistSearch(kind, query, limit = 5) {
  const typeMap = {
    anime: 'media(search:$q type:ANIME){ title { romaji } format episodes genres averageScore description(asHtml:false) siteUrl coverImage { large } }',
    manga: 'media(search:$q type:MANGA){ title { romaji } format chapters genres averageScore description(asHtml:false) siteUrl coverImage { large } }',
    character: 'characters(search:$q perPage:$limit){ name { full } siteUrl image { large } description(asHtml:false) favourites media(perPage:3){ title { romaji } } }',
  };
  const media = typeMap[kind] || typeMap.anime;
  const isChar = kind === 'character';
  const queryGql = isChar
    ? `query($q:String!,$limit:Int){ Page(perPage:$limit){ ${media} } }`
    : `query($q:String!,$limit:Int){ Page(perPage:$limit){ ${media.replace('media(search:$q', 'media(search:$q')} } }`;
  const data = await fetchJson(
    'https://graphql.anilist.co',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: queryGql, variables: { q: String(query).slice(0, 100), limit } }),
    },
    25000,
  );
  const page = data?.data?.Page || {};
  if (isChar) {
    const list = page.characters || [];
    if (!list.length) throw new Error('No encontré personajes con ese nombre');
    return list.map((c) => ({
      title: c.name?.full || 'Personaje',
      url: c.siteUrl || '',
      image: c.image?.large || '',
      score: c.favourites,
      genres: (c.media || []).map((m) => m.title?.romaji).filter(Boolean),
      synopsis: (c.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    }));
  }
  const list = page.media || [];
  if (!list.length) throw new Error('No encontré resultados');
  return list.map((m) => ({
    title: m.title?.romaji || 'Sin título',
    url: m.siteUrl || '',
    image: m.coverImage?.large || '',
    type: m.format || '',
    episodes: m.episodes || m.chapters || '',
    score: m.averageScore || 0,
    genres: m.genres || [],
    synopsis: (m.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}

// Compatibilidad: los comandos viejos llaman jikanSearch.
export async function jikanSearch(kind, query, limit = 5) {
  return anilistSearch(kind, query, limit);
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
  // reacciones extra (verificadas contra nekos.best/api/v2/<cat>): todas GIF
  'angry', 'happy', 'bored', 'kick', 'punch', 'stare', 'pout', 'nom', 'sleep',
  'run', 'smile', 'shrug', 'sip', 'yawn', 'facepalm', 'shoot',
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
        `https://api.otakugifs.xyz/api/gif?gif=${encodeURIComponent(reaction)}`,
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

// jokeapi.dev responde en español y con chistes de una o dos partes.
export async function getJoke() {
  const data = await fetchJson('https://v2.jokeapi.dev/joke/Any?lang=es&blacklistFlags=nsfw,religious,political,racist,sexist,explicit', {}, 15000);
  if (data?.error) throw new Error(data?.message || 'la API de chistes falló');
  if (data?.type === 'single') return { setup: data.joke, punchline: '' };
  if (data?.type === 'twopart') return { setup: data.setup, punchline: data.delivery };
  throw new Error('la API de chistes devolvió un formato raro');
}

export async function getQuote() {
  try {
    const data = await fetchJson('https://zenquotes.io/api/random', {}, 20000);
    if (data?.[0]?.q) return { quote: data[0].q, author: data[0].a };
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
    ['https://api.nexoracle.com/downloader/tiktok?apikey=free&url={url}'],
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
    ['https://api.nexoracle.com/downloader/instagram?apikey=free&url={url}'],
    url,
    'any',
    'Instagram',
  );
}

export async function facebookDownload(url) {
  return downloadWithFallback(
    ['https://api.nexoracle.com/downloader/facebook?apikey=free&url={url}'],
    url,
    'video',
    'Facebook',
  );
}

export async function twitterDownload(url) {
  return downloadWithFallback(
    ['https://api.nexoracle.com/downloader/twitter?apikey=free&url={url}'],
    url,
    'any',
    'X (Twitter)',
  );
}

export async function pinterestDownload(url) {
  return downloadWithFallback(
    [] ,
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

// Busca imágenes en Pinterest sin API key. Primero usa una API pública que
// devuelve los pines reales; si falla, Bing (site:www.pinterest.com) y por
// último el HTML de la búsqueda de Pinterest. Devuelve URLs en 736x para que
// el álbum pese poco y se envíe rápido.
export async function pinterestSearch(query, limit = 30) {
  const q = String(query || '').trim();
  if (!q) throw new Error('escribe qué quieres buscar en Pinterest');
  const max = Math.min(Math.max(Number(limit) || 30, 1), 30);
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  const results = [];
  const seen = new Set();
  const push = (url, page = '', title = '') => {
    const full = String(url || '');
    if (!/^https:\/\/i\.pinimg\.com\//i.test(full) || seen.has(full)) return;
    seen.add(full);
    results.push({
      url: full.replace('i.pinimg.com/originals/', 'i.pinimg.com/736x/'),
      full,
      page,
      title: String(title || q).trim() || q,
    });
  };

  // 1) API pública de Pinterest (rápida y con decenas de resultados).
  try {
    const data = await fetchJson(
      `https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(q)}`,
      {},
      30000,
    );
    for (const item of data?.data || []) {
      if (item?.type && item.type !== 'image') continue;
      push(item?.image_url, item?.pin, item?.grid_title || item?.seo_alt_text);
      if (results.length >= max) break;
    }
  } catch {}

  // 2) Respaldo: Bing indexa los pines y entrega el JSON con murl/purl.
  if (results.length < max) {
    try {
      const html = await fetchText(
        `https://www.bing.com/images/search?q=${encodeURIComponent(`site:www.pinterest.com ${q}`)}&form=HDRSC2&first=1&count=35`,
        { headers: { 'user-agent': UA, 'accept-language': 'es-ES,es;q=0.9,en;q=0.8' } },
        30000,
      );
      for (const match of html.matchAll(/m="(\{[^"]*?murl[^"]*?\})"/g)) {
        try {
          const data = JSON.parse(decodeHtml(match[1]));
          push(String(data.murl || ''), String(data.purl || ''), String(data.t || ''));
        } catch {}
        if (results.length >= max) break;
      }
    } catch {}
  }

  // 3) Último recurso: HTML de la búsqueda de Pinterest.
  if (results.length < max) {
    try {
      const page = await fetchText(
        `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`,
        { headers: { 'user-agent': UA } },
        30000,
      );
      for (const m of page.matchAll(
        /https:\/\/i\.pinimg\.com\/(?:originals|736x|564x)\/[^"'\s\\]+?\.(?:jpe?g|png|webp)/gi,
      )) {
        push(m[0]);
        if (results.length >= max) break;
      }
    } catch {}
  }

  if (!results.length) throw new Error('no encontré imágenes de eso en Pinterest');
  return results.slice(0, max);
}

export async function spotifyDownload(url) {
  return downloadWithFallback(
    ['https://api.nexoracle.com/downloader/spotify?apikey=free&url={url}'],
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
    [] ,
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

// Búsqueda web con el HTML público de DuckDuckGo (sin API key ni límites).
// Devuelve [{ title, url, snippet }].
export async function webSearch(query, limit = 6) {  const q = String(query || '').trim();
  if (!q) throw new Error('escribe qué buscar');
  const res = await fetchWithTimeout(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' } },
    20000,
  );
  if (!res.ok) throw new Error(`la búsqueda respondió HTTP ${res.status}`);
  const html = await res.text();

  const results = [];
  const seen = new Set();
  const blocks = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  for (const block of blocks) {
    // DuckDuckGo envuelve las URLs: //duckduckgo.com/l/?uddg=<url real>
    let url = block[1];
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const title = block[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").trim();
    if (!title) continue;
    results.push({ title, url, snippet: '' });
    if (results.length >= limit) break;
  }

  // Snippets (descripción bajo cada resultado).
  const snippets = [...html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim(),
  );
  results.forEach((r, i) => {
    r.snippet = snippets[i] || '';
  });

  if (!results.length) throw new Error('no encontré resultados');
  return results;
}

// Búsqueda de videos de TikTok. Dos vías:
//   1. tikwm /api/feed/search (rápida, con duración y autor)
//   2. respaldo: DuckDuckGo con "site:tiktok.com" (a tikwm a veces lo
//      desafía Cloudflare; DDG siempre responde)
// Devuelve [{ title, url }].
export async function tiktokSearch(query, limit = 10) {
  const q = String(query || '').trim();
  if (!q) throw new Error('escribe qué buscar');

  // 1. tikwm
  try {
    const data = await fetchJson(
      `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(q)}&count=${limit}`,
      { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' } },
      20000,
    );
    const videos = data?.data?.videos || data?.videos || [];
    const seen = new Set();
    const out = [];
    for (const v of videos) {
      const id = v.video_id || v.id || '';
      const user = v.author?.unique_id || v.author?.uniqueId || 'user';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        title: v.title || 'TikTok',
        url: `https://www.tiktok.com/@${user}/video/${id}`,
      });
      if (out.length >= limit) break;
    }
    if (out.length) return out;
  } catch {}

  // 2. Respaldo DuckDuckGo (sin site:, que el endpoint HTML lo ignora).
  // Funciona mejor buscando por creador: "tiktok.com khaby lame".
  let results = [];
  try {
    results = await webSearch(`tiktok.com ${q}`, limit + 5);
  } catch {}
  const out = [];
  const seen = new Set();
  for (const r of results) {
    if (!/tiktok\.com\/@[\w.-]+\/video\/\d+/.test(r.url)) continue;
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push({ title: r.title || 'TikTok', url: r.url });
    if (out.length >= limit) break;
  }
  if (!out.length) {
    throw new Error(
      'la búsqueda de TikTok está caída ahora mismo. Puedes pegar el enlace directo del video con .tiktok <enlace>',
    );
  }
  return out;
}

export async function qrBuffer(text, size = 1000) {
  return fetchBuffer(
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=20&data=${encodeURIComponent(text)}`,
    {},
    30000,
  );
}

// Búsqueda de imágenes con Openverse (imágenes libres, sin API key).
// Devuelve [{ title, url }].
export async function imageSearch(query, limit = 5) {
  const q = String(query || '').trim();
  if (!q) throw new Error('escribe qué imagen buscas');
  const data = await fetchJson(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${Math.min(Math.max(limit, 1), 10)}`,
    {},
    20000,
  );
  const results = (data?.results || [])
    .filter((r) => r?.url && /\.(jpe?g|png|webp)(\?|$)/i.test(r.url))
    .map((r) => ({ title: r.title || q, url: r.url }));
  if (!results.length) throw new Error('no encontré imágenes de eso');
  return results;
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

// Google Translate TTS (sin key, voz natural). Limita el texto a ~200
// caracteres por petición: los textos largos se trocean y se concatenan los
// MP3 (funciona porque son frames MPEG independientes).
const GTTS_LANGS = new Set(['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ru', 'ar', 'zh', 'ko', 'hi', 'nl', 'tr', 'sv', 'pl', 'uk']);

export async function ttsAudio(text, lang = 'es') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('escribe un texto');
  const tl = GTTS_LANGS.has(lang) ? lang : 'es';
  const headers = {
    // Google bloquea UAs genéricos: hace falta uno de navegador.
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    referer: 'https://translate.google.com/',
  };

  // Trocea por palabras sin cortar a la mitad (máx. 190 caracteres).
  const chunks = [];
  let rest = clean;
  while (rest.length > 190) {
    let cut = rest.lastIndexOf(' ', 190);
    if (cut < 80) cut = 190;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  chunks.push(rest);

  const parts = await Promise.all(
    chunks.map((chunk) =>
      fetchBuffer(
        `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(chunk)}`,
        { headers },
        30000,
      ),
    ),
  );
  const total = parts.reduce((n, b) => n + b.length, 0);
  if (!total) throw new Error('Google no devolvió audio');
  return Buffer.concat(parts);
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

/* ─────────────────── APIs de INVESTIGACIÓN (nuevas) ─────────────────────── */

// "Un día como hoy" — Wikipedia en español (REST feed).
export async function onThisDay() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const data = await fetchJson(
    `https://es.wikipedia.org/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`,
    {},
    25000,
  );
  const events = (data?.selected || []).map((e) => {
    const year = e.year;
    const text = e.text;
    return { year, text };
  });
  if (!events.length) throw new Error('No hay eventos para hoy');
  return events;
}

// Búsqueda en StackOverflow (StackExchange API, sin key).
export async function stackSearch(query, limit = 5) {
  const data = await fetchJson(
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=${limit}`,
    {},
    25000,
  );
  const items = data?.items || [];
  if (!items.length) throw new Error('Sin resultados en StackOverflow');
  return items.map((i) => ({
    title: i.title,
    link: i.link,
    score: i.score,
    tags: i.tags || [],
    answered: i.is_answered,
  }));
}

// Respuesta instantánea de DuckDuckGo.
export async function duckInstant(query) {
  const data = await fetchJson(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    {},
    20000,
  );
  if (!data?.AbstractText && !data?.RelatedTopics?.length) {
    throw new Error('No encontré una respuesta instantánea');
  }
  const related = (data.RelatedTopics || [])
    .map((t) => (typeof t === 'string' ? { Text: t } : t))
    .filter((t) => t?.Text)
    .slice(0, 5)
    .map((t) => ({ text: t.Text, url: t.FirstURL || '' }));
  return {
    heading: data.Heading || query,
    text: data.AbstractText || '',
    url: data.AbstractURL || '',
    image: data.Image ? `https://duckduckgo.com${data.Image}` : '',
    related,
  };
}

// Urban Dictionary.
export async function urbanDefine(term) {
  const data = await fetchJson(
    `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
    {},
    25000,
  );
  const list = data?.list || [];
  if (!list.length) throw new Error('Esa palabra no está en Urban Dictionary');
  const top = list[0];
  return {
    word: top.word,
    definition: top.definition,
    example: top.example,
    author: top.author,
    likes: top.thumbs_up,
  };
}

// Libros — Open Library.
export async function bookSearch(query, limit = 5) {
  const data = await fetchJson(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=title,author_name,first_publish_year,language,key,cover_i`,
    {},
    30000,
  );
  const docs = (data?.docs || []).filter((d) => (d.language || []).includes('spa') || true);
  if (!docs.length) throw new Error('No encontré libros con ese nombre');
  return docs.map((d) => ({
    title: d.title,
    authors: d.author_name || [],
    year: d.first_publish_year || '',
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
    url: `https://openlibrary.org${d.key}`,
  }));
}

// Música — iTunes (rápido, sin key, portadas incluidas).
export async function itunesSearch(query, limit = 6) {
  const data = await fetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=${limit}`,
    {},
    25000,
  );
  const results = data?.results || [];
  if (!results.length) throw new Error('No encontré esa canción');
  return results.map((r) => ({
    title: r.trackName || r.collectionName,
    artist: r.artistName,
    album: r.collectionName,
    genre: r.primaryGenreName,
    preview: r.previewUrl || '',
    price: r.trackPrice != null ? `${r.trackPrice} ${r.currency}` : '',
    cover: r.artworkUrl100 || '',
    url: r.trackViewUrl || '',
  }));
}

// Steam — búsqueda en la tienda (en español).
export async function steamSearch(query, limit = 5) {
  const data = await fetchJson(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&cc=us&l=spanish`,
    {},
    25000,
  );
  const items = data?.items || [];
  if (!items.length) throw new Error('Sin resultados en Steam');
  return items.slice(0, limit).map((i) => ({
    name: i.name,
    price: i.price ? `$${(i.price.final / 100).toFixed(2)}` : 'Gratis',
    score: i.metacritic_score || '',
    steamUrl: `https://store.steampowered.com/app/${i.id}`,
    image: i.tiny_image || '',
  }));
}

// Acciones/mercado — Yahoo Finance.
export async function stockQuote(symbol) {
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
    {},
    25000,
  );
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error('No encontré ese símbolo en el mercado');
  const m = r.meta;
  const prev = m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice;
  const change = m.regularMarketPrice - prev;
  return {
    symbol: m.symbol,
    name: m.longName || m.shortName || m.symbol,
    currency: m.currency,
    price: m.regularMarketPrice,
    change,
    percent: prev ? (change / prev) * 100 : 0,
  };
}

// COVID por país — disease.sh.
export async function covidCountry(country) {
  const data = await fetchJson(
    `https://disease.sh/v3/covid-19/countries/${encodeURIComponent(country)}`,
    {},
    25000,
  );
  if (!data?.cases) throw new Error('No encontré ese país');
  return {
    country: data.country,
    cases: data.cases,
    today: data.todayCases,
    deaths: data.deaths,
    recovered: data.recovered,
    active: data.active,
    flag: data.countryInfo?.flag || '',
  };
}

// Edad probable de un nombre — agify.io.
export async function nameAge(name) {
  const data = await fetchJson(`https://api.agify.io/?name=${encodeURIComponent(name)}`, {}, 20000);
  if (!data?.age) throw new Error('No pude adivinar la edad de ese nombre');
  return data;
}

// Pokémon — PokéAPI.
export async function pokemonInfo(name) {
  const clean = String(name).toLowerCase().trim();
  const data = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(clean)}`, {}, 25000);
  const species = await fetchJson(
    `https://pokeapi.co/api/v2/pokemon-species/${data.id}`,
    {},
    20000,
  ).catch(() => null);
  const flavor = (species?.flavor_text_entries || []).find((f) => f.language.name === 'es');
  return {
    id: data.id,
    name: data.name,
    height: data.height / 10,
    weight: data.weight / 10,
    types: data.types.map((t) => t.type.name),
    abilities: data.abilities.map((a) => a.ability.name),
    stats: data.stats.map((s) => ({ name: s.stat.name, value: s.base_stat })),
    sprite: data.sprites?.front_default || '',
    artwork: data.sprites?.other?.['official-artwork']?.front_default || '',
    flavor: flavor?.flavor_text?.replace(/\s+/g, ' ') || '',
  };
}

// xkcd — cómic (actual o por número).
export async function xkcdComic(number) {
  const url = number ? `https://xkcd.com/${number}/info.0.json` : 'https://xkcd.com/info.0.json';
  const data = await fetchJson(url, {}, 20000);
  return {
    num: data.num,
    title: data.safe_title || data.title,
    alt: data.alt,
    img: data.img,
    url: `https://xkcd.com/${data.num}/`,
  };
}

// Epic Games — juegos gratis de la semana (español).
export async function epicFreeGames() {
  const data = await fetchJson(
    'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=es',
    {},
    25000,
  );
  const elements = data?.data?.Catalog?.searchStore?.elements || [];
  const now = Date.now();
  const list = elements
    .filter((e) => e.promotions?.promotionalOffers?.length || e.promotions?.upcomingPromotionalOffers?.length)
    .map((e) => {
      const promo = e.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
      const upcoming = e.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0];
      const current = promo ? new Date(promo.endDate).getTime() > now : false;
      return {
        title: e.title,
        current,
        startDate: (promo || upcoming)?.startDate || '',
        endDate: (promo || upcoming)?.endDate || '',
        url: `https://store.epicgames.com/es-ES/p/${e.productSlug || e.urlSlug || ''}`,
        image: e.keyImages?.find((k) => k.type === 'DieselStorePageWide')?.url || e.keyImages?.[0]?.url || '',
      };
    });
  if (!list.length) throw new Error('No encontré juegos gratis ahora');
  return list;
}

// NASA — foto astronómica del día (DEMO_KEY es lenta: 60s de paciencia).
export async function nasaApod() {
  const data = await fetchJson(
    'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY',
    {},
    60000,
  );
  if (!data?.url) throw new Error('NASA no respondió (llave pública saturada, reintenta)');
  return {
    title: data.title,
    date: data.date,
    explanation: data.explanation,
    url: data.url,
    hd: data.hdurl || data.url,
    mediaType: data.media_type,
    copyright: data.copyright || '',
  };
}

// Recetas — TheMealDB.
export async function recipeSearch(query, limit = 3) {
  const data = await fetchJson(
    `https://themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`,
    {},
    30000,
  );
  const meals = (data?.meals || []).slice(0, limit);
  if (!meals.length) throw new Error('No encontré recetas con ese nombre');
  return meals.map((m) => ({
    name: m.strMeal,
    category: m.strCategory,
    area: m.strArea,
    instructions: (m.strInstructions || '').slice(0, 900),
    image: m.strMealThumb,
    youtube: m.strYoutube,
    ingredients: Array.from({ length: 20 }, (_, i) => m[`strIngredient${i + 1}`])
      .filter(Boolean)
      .map((ing, i) => `${m[`strMeasure${i + 1}`] || ''} ${ing}`.trim()),
  }));
}

// Cócteles — TheCocktailDB.
export async function cocktailSearch(query, limit = 3) {
  const data = await fetchJson(
    `https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`,
    {},
    25000,
  );
  const drinks = (data?.drinks || []).slice(0, limit);
  if (!drinks.length) throw new Error('No encontré ese cóctel');
  return drinks.map((d) => ({
    name: d.strDrink,
    category: d.strCategory,
    alcoholic: d.strAlcoholic,
    glass: d.strGlass,
    instructions: (d.strInstructions || '').slice(0, 600),
    image: d.strDrinkThumb,
    ingredients: Array.from({ length: 15 }, (_, i) => d[`strIngredient${i + 1}`])
      .filter(Boolean)
      .map((ing, i) => `${d[`strMeasure${i + 1}`] || ''} ${ing}`.trim()),
  }));
}

// Fondos de pantalla — wallhaven.cc.
export async function wallpaperSearch(query, limit = 4) {
  const data = await fetchJson(
    `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(query)}&page=1`,
    {},
    25000,
  );
  const list = (data?.data || []).slice(0, limit);
  if (!list.length) throw new Error('No encontré fondos con ese nombre');
  return list.map((w) => ({
    url: w.path,
    thumb: w.thumbs?.large || w.path,
    resolution: w.resolution,
    page: w.url,
  }));
}

// OCR — leer texto de una imagen (ocr.space, llave pública).
export async function ocrImage(buffer, mimetype = 'image/jpeg') {
  const b64 = `data:${mimetype};base64,${buffer.toString('base64')}`;
  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: 'helloworld', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ base64Image: b64, language: 'spa', OCREngine: '2', scale: 'true' }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => null);
  const text = (data?.ParsedResults || []).map((p) => p.ParsedText).join('\n').trim();
  if (!text) {
    const err = data?.ErrorMessage?.[0] || 'No encontré texto legible en la imagen';
    throw new Error(String(err));
  }
  return text;
}

// Leer QR de una imagen (api.qrserver.com, multipart).
export async function qrReadImage(buffer, mimetype = 'image/png') {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mimetype }), 'qr.png');
  const res = await fetch('https://api.qrserver.com/v1/read-qr-code/', {
    method: 'POST',
    body: fd,
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => null);
  const symbol = data?.[0]?.symbol?.[0];
  if (!symbol?.data) throw new Error('No encontré ningún QR en esa imagen');
  return symbol.data;
}

/* ─────────────────── Películas y apps ────────────────────────────────────── */

// IMDb — sugerencias con póster, año y enlace (API pública de búsqueda).
export async function imdbSearch(query, limit = 6) {
  const clean = String(query).trim().toLowerCase().replace(/\s+/g, '_');
  if (!clean) throw new Error('escribe el nombre de una película');
  const letter = clean[0];
  const data = await fetchJson(
    `https://v3.sg.media-imdb.com/suggestion/${letter}/${encodeURIComponent(clean)}.json`,
    {},
    25000,
  );
  const list = (data?.d || []).filter((d) => d.id?.startsWith('tt'));
  if (!list.length) throw new Error('No encontré esa película');
  return list.slice(0, limit).map((d) => ({
    title: d.l,
    year: d.y || '',
    type: d.qid === 'tvSeries' ? 'Serie' : d.qid === 'movie' || d.qid === 'feature' ? 'Película' : d.q || '',
    imdbId: d.id,
    url: `https://www.imdb.com/title/${d.id}/`,
    poster: d.i?.imageUrl || '',
    stars: d.s || '',
  }));
}

// Internet Archive — películas de DOMINIO PÚBLICO (descarga 100% legal).
export async function archiveMovieSearch(query, limit = 8) {
  const clean = String(query).trim();
  if (!clean) throw new Error('escribe el nombre de la película');
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`title:(${clean}) AND mediatype:(movies)`)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=downloads&fl%5B%5D=year&sort%5B%5D=downloads+desc&rows=${limit}&page=1&output=json`;
  const data = await fetchJson(url, {}, 30000);
  const docs = data?.response?.docs || [];
  if (!docs.length) throw new Error('No encontré películas con ese nombre en el archivo público');
  return docs.map((d) => ({
    identifier: d.identifier,
    title: d.title || d.identifier,
    year: d.year || '',
    downloads: d.downloads || 0,
    url: `https://archive.org/details/${d.identifier}`,
  }));
}

// Archivos descargables de un item de Internet Archive (el más liviano primero).
export async function archiveMovieFiles(identifier) {
  const data = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {}, 30000);
  if (!data?.files) throw new Error('No pude leer los archivos de esa película');
  if (data.is_dark) throw new Error('Esa película fue retirada del archivo, elige otra');
  const playable = data.files
    .filter((f) => /\.(mp4|m4v|ogv|webm)$/i.test(f.name || ''))
    .map((f) => ({
      name: f.name,
      url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(f.name)}`,
      size: Number(f.size || 0),
      format: f.format || '',
    }))
    .sort((a, b) => a.size - b.size);
  if (!playable.length) throw new Error('Esa película no tiene video descargable, elige otra');
  return { server: data.server, files: playable, title: data.metadata?.title || identifier };
}

// App Store — alternativa a "Play Store" (iTunes apps, gratis y sin key).
export async function itunesApps(query, limit = 6) {
  const data = await fetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=software&limit=${limit}&country=es`,
    {},
    25000,
  );
  const results = data?.results || [];
  if (!results.length) throw new Error('No encontré esa app');
  return results.map((a) => ({
    name: a.trackName,
    developer: a.artistName,
    genre: a.primaryGenreName,
    price: a.price === 0 ? 'Gratis' : `${a.price} ${a.currency}`,
    rating: a.averageUserRating || 0,
    ratings: a.userRatingCount || 0,
    icon: a.artworkUrl100 || '',
    url: a.trackViewUrl || '',
    description: (a.description || '').slice(0, 300),
  }));
}

/* ─────────────────── Correo temporal (mail.tm) ─────────────────────────── */

// Citas de Kanye West (api.kanye.rest).
export async function getKanyeQuote() {
  const data = await fetchJson('https://api.kanye.rest/', {}, 15000);
  if (!data?.quote) throw new Error('Kanye no quiere hablar ahora');
  return data.quote;
}

// Perros — dog.ceo (con razas opcionales).
export async function getDogImage(breed = '') {
  const clean = String(breed || '').trim().toLowerCase();
  const url = clean
    ? `https://dog.ceo/api/breed/${encodeURIComponent(clean)}/images/random`
    : 'https://dog.ceo/api/breeds/image/random';
  const data = await fetchJson(url, {}, 20000);
  if (!data?.message) throw new Error(clean ? 'No encontré esa raza de perro' : 'No pude conseguir el perrito');
  return data.message;
}

// Gatos — cataas.com.
export async function getCatImage() {
  const res = await fetchWithTimeout('https://cataas.com/cat', {}, 25000);
  if (!res.ok) throw new Error('Los gatos están descansando, prueba otra vez');
  return res.url || 'https://cataas.com/cat';
}

/* ─────────────────────── Quitar fondo (BiRefNet) ────────────────────────── */
// Espacios públicos de Hugging Face con el modelo BiRefNet (sin API key).
// Se prueban en cadena: si uno está dormido o sin cuota de GPU, sigue el
// siguiente. Flujo Gradio: subir la imagen → POST /call/image → leer el evento
// SSE → descargar el PNG con transparencia. Devuelve un Buffer (PNG/WEBP).
const REMBG_SPACES = [
  'https://merve-background-removal.hf.space',
  'https://cheesetalk-background-removal.hf.space',
  'https://ysharma-background-removal-copy.hf.space',
  'https://not-lain-background-removal.hf.space',
  'https://upsampler-birefnet-background-removal.hf.space',
  'https://hf-applications-background-removal.hf.space',
];

// Reparte las peticiones entre los espacios para no agotar la cuota de uno.
let rembgCursor = 0;

function collectGradioFiles(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectGradioFiles(item, out);
    return out;
  }
  if (typeof value === 'object' && (value.url || value.path)) out.push(value);
  return out;
}

// ¿La imagen descargada tiene canal alfa? (PNG color type 6/4 o WEBP).
function hasAlphaChannel(buffer) {
  if (!buffer || buffer.length < 30) return false;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return buffer[25] === 6 || buffer[25] === 4;
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return true; // el resultado de los espacios de rembg suele ser WEBP con alfa
  }
  return false;
}

async function gradioUpload(base, buffer, mimetype, filename) {
  const form = new FormData();
  form.append('files', new Blob([buffer], { type: mimetype }), filename);
  const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const res = await fetchWithTimeout(
    `${base}/gradio_api/upload?upload_id=${uploadId}`,
    { method: 'POST', body: form },
    90000,
  );
  if (!res.ok) throw new Error(`No pude subir la imagen (HTTP ${res.status})`);
  const paths = await res.json().catch(() => null);
  if (!Array.isArray(paths) || !paths[0]) throw new Error('La IA no aceptó la imagen');
  return paths[0];
}

async function gradioRun(base, endpoint, data, timeout = 180000) {
  const call = await fetchWithTimeout(
    `${base}/gradio_api/call/${endpoint}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    },
    30000,
  );
  if (!call.ok) throw new Error(`La IA respondió HTTP ${call.status}`);
  const info = await call.json().catch(() => null);
  if (!info?.event_id) throw new Error('La IA no inició el trabajo');
  const res = await fetchWithTimeout(
    `${base}/gradio_api/call/${endpoint}/${info.event_id}`,
    {},
    timeout,
  );
  if (!res.ok) throw new Error(`La IA cortó la respuesta (HTTP ${res.status})`);
  const body = await res.text();
  if (/event:\s*error/i.test(body)) throw new Error('La IA no pudo procesar la imagen');

  // El stream SSE trae varias líneas "data:"; la última con un arreglo es el
  // resultado final. Los latidos/progreso se ignoran.
  let result = null;
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === 'null') continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) result = parsed;
    } catch {}
  }
  if (!result) throw new Error('La IA no devolvió ninguna imagen');
  return result;
}

async function downloadResult(file) {
  if (!file?.url) return null;
  const res = await fetchWithTimeout(file.url, {}, 60000);
  if (!res.ok) return null;
  const out = Buffer.from(await res.arrayBuffer());
  return out.length ? out : null;
}

// Quita el fondo de una imagen y devuelve un PNG/WEBP con transparencia.
export async function removeBackground(buffer, mimetype = 'image/png', filename = 'zenitsu.png') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Imagen vacía');
  const start = rembgCursor++ % REMBG_SPACES.length;
  const order = [...REMBG_SPACES.slice(start), ...REMBG_SPACES.slice(0, start)];
  let lastError = null;
  let fallback = null;

  for (const base of order) {
    try {
      const path = await gradioUpload(base, buffer, mimetype, filename);
      const result = await gradioRun(base, 'image', [
        { path, meta: { _type: 'gradio.FileData' } },
      ]);
      // Los espacios devuelven [original, imagen_con_transparencia]: se revisa
      // primero la última y se acepta la primera que traiga canal alfa.
      const files = collectGradioFiles(result).reverse();
      for (const file of files) {
        const out = await downloadResult(file).catch(() => null);
        if (!out) continue;
        if (!fallback) fallback = out;
        if (hasAlphaChannel(out)) return out;
      }
      // Este espacio no devolvió transparencia: se prueba el siguiente.
      lastError = new Error('La IA no devolvió una imagen con transparencia');
    } catch (err) {
      lastError = err;
    }
  }
  // Último recurso: si algún espacio respondió algo, se devuelve tal cual.
  if (fallback) return fallback;
  throw new Error(lastError?.message || 'No pude quitar el fondo');
}

const MAIL_TM = 'https://api.mail.tm';

export async function mailTmCreate() {
  const domainsRes = await fetchJson(`${MAIL_TM}/domains`, {}, 20000);
  const domain = domainsRes['hydra:member']?.[0]?.domain;
  if (!domain) throw new Error('No hay dominios de correo disponibles');
  const address = `zenitsu${Math.floor(Math.random() * 1e9).toString(36)}@${domain}`;
  const password = `Zt${Math.floor(Math.random() * 1e12).toString(36)}!`;
  const res = await fetch(`${MAIL_TM}/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, password }),
    signal: AbortSignal.timeout(25000),
  });
  if (res.status !== 201) throw new Error('No se pudo crear el correo (intenta de nuevo)');
  return { address, password };
}

export async function mailTmMessages(address, password) {
  const tokRes = await fetch(`${MAIL_TM}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, password }),
    signal: AbortSignal.timeout(25000),
  });
  const token = (await tokRes.json().catch(() => null))?.token;
  if (!token) throw new Error('La sesión del correo expiró');
  const res = await fetch(`${MAIL_TM}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => null);
  const list = data?.['hydra:member'] || [];
  return list.map((m) => ({
    from: m.from?.address || '',
    subject: m.subject,
    intro: m.intro,
    seen: m.seen,
    at: m.createdAt,
    id: m.id,
  }));
}
