import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import {
  fetchBuffer,
  formatBytes,
  formatDate,
  formatNumber,
  isUrl,
  jidToNumber,
  truncate,
  withWatermark,
} from '../lib/utils.js';
import {
  carbonBuffer,
  catboxUpload,
  convertCurrency,
  defineWord,
  fetchAny,
  getCountry,
  getCrypto,
  getDns,
  getGithubUser,
  getIpInfo,
  getNpmPackage,
  getWeather,
  getWhois,
  getWiki,
  httpCheck,
  qrBuffer,
  screenshotBuffer,
  mailTmCreate,
  mailTmMessages,
  shortenUrl,
  translateText,
  ttsAudio,
  webSearch,
  imageSearch,
} from '../lib/api.js';
import { sendButtons } from '../lib/buttons.js';
import { audioToVoiceNote, mediaToAudio, mediaToSticker, stickerToImage } from '../lib/sticker.js';
import { sendStickerBatch } from '../lib/stickers.js';
import { collectStickerlyStickers } from '../lib/stickerly.js';
import { trackSent } from '../lib/state.js';

const LANG_NAMES = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
  fr: 'Francés',
  de: 'Alemán',
  it: 'Italiano',
  ja: 'Japonés',
  ko: 'Coreano',
  zh: 'Chino',
  ru: 'Ruso',
  ar: 'Árabe',
  hi: 'Hindi',
  id: 'Indonesio',
  tr: 'Turco',
  nl: 'Neerlandés',
  pl: 'Polaco',
  sv: 'Sueco',
  th: 'Tailandés',
  vi: 'Vietnamita',
};

function isLang(value) {
  return /^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(String(value || ''));
}

async function sendAudio(ctx, buffer, ptt = false, fileName = 'zenitsu.mp3') {
  let data = buffer;
  let mimetype = 'audio/mpeg';
  let name = fileName;
  let seconds = 0;
  if (ptt) {
    // Las notas de voz de WhatsApp deben ser OGG/Opus; un MP3 con ptt:true
    // se oye como "Este audio no está disponible...".
    const voice = await audioToVoiceNote(buffer, 'mp3');
    data = voice.buffer;
    seconds = voice.seconds;
    mimetype = 'audio/ogg; codecs=opus';
    name = 'zenitsu-voz.ogg';
  }
  const sent = await ctx.sock.sendMessage(
    ctx.chat,
    { audio: data, mimetype, fileName: name, ptt, ...(seconds ? { seconds } : {}) },
    { quoted: ctx.msg },
  );
  trackSent(sent);
  return sent;
}

async function sendImage(ctx, buffer, caption) {
  return ctx.send({ image: buffer, caption });
}

export default [
  {
    name: 'sticker',
    aliases: ['s', 'figu', 'figurita'],
    category: 'tools',
    desc: 'Convierte una imagen, video o GIF en sticker.',
    usage: 'sticker (responde a un archivo o pasa URL)',
    async execute(ctx) {
      const target = ctx.m.hasMedia ? ctx.m : ctx.quoted;
      const url = ctx.args.find((a) => isUrl(a));
      let buffer;
      let isVideo = false;
      let isAnimatedWebp = false;

      if (target?.hasMedia) {
        if (!['image', 'video', 'sticker'].includes(target.mediaType)) {
          await ctx.reply('⚠️ Solo acepto imágenes, videos, GIFs o stickers.');
          return;
        }
        buffer = await ctx.downloadMedia(target);
        isVideo = target.mediaType === 'video';
        isAnimatedWebp = target.mediaType === 'sticker';
      } else if (url) {
        buffer = await fetchBuffer(url);
        isVideo = /\.(gif|mp4|webm|mov)(\?|$)/i.test(url);
      } else {
        await ctx.reply(`💡 Responde a una imagen/video/GIF o usa *${ctx.prefix}sticker* <url>`);
        return;
      }

      const webp = await mediaToSticker(buffer, {
        isVideo,
        isAnimatedWebp,
        pack: db().stickerPack,
        author: db().stickerAuthor,
      });
      const sent = await ctx.sock.sendMessage(ctx.chat, { sticker: webp }, { quoted: ctx.msg });
      trackSent(sent);
    },
  },
  {
    name: 'botones',
    aliases: ['buttons', 'probarBotones', 'menubotones', 'botonera'],
    category: 'tools',
    desc: 'Envía un mensaje con botones interactivos (prueba de compatibilidad con WhatsApp).',
    usage: 'botones',
    async execute(ctx) {
      await sendButtons(ctx.sock, ctx.chat, {
        title: '⚡ ZENITSU BOT',
        text:
          '*BOTONES INTERACTIVOS*\n\n' +
          'Toca uno y el bot ejecutará ese comando, igual que si lo escribieras.',
        footer: '⚡ Respiración del Trueno',
        buttons: [
          { id: `${ctx.prefix}menu`, text: '⚡ Menú' },
          { id: `${ctx.prefix}stickerly 8`, text: '🎨 Stickers' },
          { id: `${ctx.prefix}canal`, text: '📢 Canal' },
        ],
      });
    },
  },
  {
    name: 'stickerly',
    aliases: ['stickersly', 'stickly', 'sticklypack'],
    category: 'tools',
    desc: 'Manda stickers buenos y transparentes desde Sticker.ly (nada de fotos rectangulares).',
    usage: 'stickerly [cantidad] [búsqueda]',
    async execute(ctx) {
      const args = (ctx.args || []).map((a) => String(a).trim()).filter(Boolean);
      const raw = Number.parseInt(args.find((a) => /^\d+$/.test(a)) || '', 10);
      const count = Math.min(30, Math.max(1, Number.isFinite(raw) ? raw : 10));
      const keyword = args.filter((a) => !/^\d+$/.test(a)).join(' ').trim();

      await ctx.reply(
        `🎨 *Buscando stickers en Sticker.ly...*` +
          (keyword ? `\n▸ 🔎 ${keyword}` : '\n▸ 🎲 Búsqueda aleatoria'),
      );

      let found;
      try {
        found = await collectStickerlyStickers(Math.min(90, count * 3), keyword);
      } catch (err) {
        await ctx.reply(`❌ Sticker.ly no respondió: ${err?.message || err}`);
        return;
      }
      if (!found.urls.length) {
        await ctx.reply(
          `❌ No encontré stickers de *${keyword || found.query}*.\n\n💡 Prueba con otra palabra: gatos, memes, amor, anime...`,
        );
        return;
      }

      const r = await sendStickerBatch(ctx.sock, ctx.chat, count, {
        candidates: found.urls,
      });
      if (!r.sent) {
        await ctx.reply(
          `⚠️ No pude enviar stickers.\n\n` +
            (r.failed ? `❌ Fallidos: *${r.failed}*\n` : '') +
            (r.skipped ? `🔁 Repetidos omitidos: *${r.skipped}*\n` : '') +
            (r.errors?.length ? `📝 Motivo: ${r.errors.slice(0, 3).join(' · ')}` : ''),
        );
        return;
      }

      const summary =
        `✅ *STICKERS DE STICKER.LY*\n\n` +
        `▸ 🔎 ${found.query}\n` +
        `📤 Enviados: *${r.sent}*\n` +
        (r.skipped ? `🔁 Repetidos omitidos: *${r.skipped}*\n` : '') +
        (r.failed ? `⚠️ Fallidos: *${r.failed}*` : '');

      await sendButtons(ctx.sock, ctx.chat, {
        text: summary,
        footer: '⚡ Respiración del Trueno',
        buttons: [
          {
            id: `${ctx.prefix}stickerly ${count}${keyword ? ` ${keyword}` : ''}`,
            text: '🔁 Más stickers',
          },
          { id: `${ctx.prefix}stickerly 10 gatos`, text: '🐱 Gatos' },
          { id: `${ctx.prefix}menu`, text: '⚡ Menú' },
        ],
      });
    },
  },
  {
    name: 'toimg',
    aliases: ['toimage', 'tofoto'],
    category: 'tools',
    desc: 'Convierte un sticker en imagen PNG.',
    usage: 'toimg (responde a un sticker)',
    async execute(ctx) {
      if (!ctx.quoted || !['sticker', 'image'].includes(ctx.quoted.mediaType)) {
        await ctx.reply('💡 Responde a un sticker o imagen.');
        return;
      }
      const buffer = await ctx.downloadQuoted();
      if (ctx.quoted.mediaType === 'image') {
        await ctx.send({ image: buffer, caption: '🖼️ Imagen lista.' });
        return;
      }
      const png = await stickerToImage(buffer);
      await ctx.send({ image: png, caption: '🖼️ Sticker convertido a imagen.' });
    },
  },
  {
    name: 'tomp3',
    aliases: ['toaudio', 'tomp3audio'],
    category: 'tools',
    desc: 'Convierte un audio o video en MP3.',
    usage: 'tomp3 (responde a audio/video)',
    async execute(ctx) {
      if (!ctx.quoted || !['audio', 'video'].includes(ctx.quoted.mediaType)) {
        await ctx.reply('💡 Responde a un audio o video.');
        return;
      }
      const buffer = await ctx.downloadQuoted();
      const ext = ctx.quoted.mediaType === 'video' ? 'mp4' : 'ogg';
      const mp3 = await mediaToAudio(buffer, ext);
      await sendAudio(ctx, mp3, false, 'zenitsu.mp3');
    },
  },
  {
    name: 'tts',
    aliases: ['decir'],
    category: 'tools',
    desc: 'Convierte texto en una nota de voz.',
    usage: 'tts [idioma] <texto>',
    async execute(ctx) {
      let lang = 'es';
      let text = ctx.text;
      if (ctx.args[0] && isLang(ctx.args[0]) && ctx.args.length > 1) {
        lang = ctx.args[0].toLowerCase();
        text = ctx.args.slice(1).join(' ');
      }
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}tts* [es|en|pt...] <texto>`);
        return;
      }
      if (text.length > 400) {
        await ctx.reply('⚠️ El texto es muy largo (máximo 400 caracteres).');
        return;
      }
      const audio = await ttsAudio(text, lang);
      await sendAudio(ctx, audio, true, 'zenitsu-tts.mp3');
    },
  },
  {
    name: 'translate',
    aliases: ['tr', 'traducir'],
    category: 'tools',
    desc: 'Traduce un texto a otro idioma.',
    usage: 'translate <idioma> <texto | responde>',
    async execute(ctx) {
      let to = 'es';
      let text = ctx.text;
      if (ctx.args[0] && isLang(ctx.args[0]) && ctx.args.length > 1) {
        to = ctx.args[0].toLowerCase();
        text = ctx.args.slice(1).join(' ');
      } else if (ctx.quoted?.text) {
        text = ctx.quoted.text;
      }
      if (!text) {
        await ctx.reply(
          `💡 Uso: *${ctx.prefix}translate* en Hola mundo\n▸ Idiomas: es, en, pt, fr, de, it, ja, ru...`,
        );
        return;
      }
      const result = await translateText(text, to);
      await ctx.reply(
        `🌐 *Traducción a ${LANG_NAMES[to] || to}*\n\n${truncate(result, 3000)}`,
      );
    },
  },
  {
    name: 'weather',
    aliases: ['clima', 'tiempo'],
    category: 'tools',
    desc: 'Muestra el clima actual y el pronóstico de una ciudad.',
    usage: 'weather <ciudad>',
    async execute(ctx) {
      const city = ctx.text.trim();
      if (!city) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}weather* San Salvador`);
        return;
      }
      const w = await getWeather(city);
      const daily = w.daily
        .map(
          (d) =>
            `📅 *${d.date}*\n▸ ${d.desc}\n▸ 🌡️ ${d.min}°C — ${d.max}°C\n▸ 🌧️ Lluvia: ${d.rain ?? 0}%`,
        )
        .join('\n\n');
      await ctx.reply(
        [
          `🌤️ *CLIMA EN ${w.place.toUpperCase()}*`,
          '',
          `▸ ${w.current.desc}`,
          `🌡️ Temperatura: *${w.current.temp}°C*`,
          `🤔 Sensación: *${w.current.feels}°C*`,
          `💧 Humedad: *${w.current.humidity}%*`,
          `💨 Viento: *${w.current.wind} km/h*`,
          `🌧️ Lluvia: *${w.current.rain} mm*`,
          '',
          '📆 *PRONÓSTICO*',
          daily,
        ].join('\n'),
      );
    },
  },
  {
    name: 'wiki',
    aliases: ['wikipedia', 'buscar'],
    category: 'tools',
    desc: 'Busca información en Wikipedia.',
    usage: 'wiki <término>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}wiki* Demon Slayer`);
        return;
      }
      const w = await getWiki(query);
      const text = `📚 *${w.title}*\n\n${truncate(w.extract, 2500)}\n\n🔗 ${w.url}`;
      if (w.thumbnail) {
        try {
          await ctx.send({ image: { url: w.thumbnail }, caption: text });
          return;
        } catch {}
      }
      await ctx.reply(text);
    },
  },
  {
    name: 'google',
    aliases: ['buscarweb', 'websearch', 'buscador'],
    category: 'tools',
    desc: 'Busca en la web y muestra los mejores resultados.',
    usage: 'google <búsqueda>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}google* mejores animes 2026`);
        return;
      }
      const results = await webSearch(query, 6);
      const list = results
        .map(
          (r, i) =>
            `${i + 1}. *${truncate(r.title, 90)}*\n` +
            (r.snippet ? `   _${truncate(r.snippet, 130)}_\n` : '') +
            `   🔗 ${r.url}`,
        )
        .join('\n\n');
      await ctx.reply(`🔎 *Resultados para:* ${truncate(query, 120)}\n\n${list}`);
    },
  },
  {
    name: 'img',
    aliases: ['imagen', 'imagine-search', 'searchimg', 'foto'],
    category: 'tools',
    desc: 'Busca y envía una imagen real de lo que pidas.',
    usage: 'img <búsqueda>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}img* paisaje de montaña`);
        return;
      }
      await ctx.react('🖼️');
      const results = await imageSearch(query, 4);
      const sent = await ctx.sock.sendMessage(
        ctx.chat,
        { image: { url: results[0].url }, caption: `🖼️ *${truncate(query, 100)}*` },
        { quoted: ctx.msg },
      );
      trackSent(sent);
    },
  },
  {
    name: 'define',
    aliases: ['definir', 'meaning', 'significado'],
    category: 'tools',
    desc: 'Busca el significado de una palabra en inglés.',
    usage: 'define <palabra en inglés>',
    async execute(ctx) {
      const word = ctx.args[0];
      if (!word) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}define* thunder`);
        return;
      }
      const d = await defineWord(word);
      const meanings = d.meanings
        .map(
          (m) =>
            `📌 *${m.partOfSpeech}*\n${m.definitions.map((x) => `▸ ${x}`).join('\n')}${m.example ? `\n💬 _${m.example}_` : ''}`,
        )
        .join('\n\n');
      await ctx.reply(`📖 *${d.word}* ${d.phonetic}\n\n${meanings}`);
    },
  },
  {
    name: 'qr',
    aliases: ['qrcode', 'codigoqr'],
    category: 'tools',
    desc: 'Genera un código QR a partir de un texto o enlace.',
    usage: 'qr <texto o enlace>',
    async execute(ctx) {
      const text = ctx.text.trim();
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}qr* https://wa.me/50375638328`);
        return;
      }
      const buffer = await qrBuffer(text);
      await sendImage(ctx, buffer, `🔳 *Código QR generado*\n\n${truncate(text, 300)}`);
    },
  },
  {
    name: 'short',
    aliases: ['acortar', 'tinyurl'],
    category: 'tools',
    desc: 'Acorta un enlace.',
    usage: 'short <url>',
    async execute(ctx) {
      const url = ctx.args.find((a) => isUrl(a)) || ctx.text.trim();
      if (!isUrl(url)) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}short* https://ejemplo.com/enlace-largo`);
        return;
      }
      const short = await shortenUrl(url);
      await ctx.reply(`🔗 *Enlace acortado*\n\n▸ Original: ${url}\n▸ Corto: ${short}`);
    },
  },
  {
    name: 'calc',
    aliases: ['calculadora', 'math'],
    category: 'tools',
    desc: 'Resuelve una operación matemática.',
    usage: 'calc <operación>',
    async execute(ctx) {
      const expression = ctx.text.trim();
      if (!expression) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}calc* (2+2)*10`);
        return;
      }
      const safe = expression.replace(/[^0-9+\-*/().%^ ]/g, '').replace(/\^/g, '**');
      if (!safe.trim()) {
        await ctx.reply('❌ Expresión inválida.');
        return;
      }
      let result;
      try {
        result = Function(`"use strict"; return (${safe});`)();
      } catch {
        await ctx.reply('❌ No pude resolver esa operación.');
        return;
      }
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        await ctx.reply('❌ El resultado no es un número válido.');
        return;
      }
      await ctx.reply(`🧮 *Calculadora*\n\n▸ Operación: \`${safe}\`\n▸ Resultado: *${result}*`);
    },
  },
  {
    name: 'base64',
    aliases: ['b64'],
    category: 'tools',
    desc: 'Codifica un texto en Base64.',
    usage: 'base64 <texto>',
    async execute(ctx) {
      if (!ctx.text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}base64* Hola mundo`);
        return;
      }
      const encoded = Buffer.from(ctx.text, 'utf8').toString('base64');
      await ctx.reply(`🔐 *Base64*\n\n\`\`\`\n${encoded}\n\`\`\``);
    },
  },
  {
    name: 'unbase64',
    aliases: ['deb64'],
    category: 'tools',
    desc: 'Decodifica un texto en Base64.',
    usage: 'unbase64 <texto>',
    async execute(ctx) {
      if (!ctx.text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}unbase64* SG9sYSBtdW5kbw==`);
        return;
      }
      try {
        const decoded = Buffer.from(ctx.text, 'base64').toString('utf8');
        if (!decoded || /[^\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]/.test(decoded)) throw new Error('inválido');
        await ctx.reply(`🔓 *Base64 decodificado*\n\n\`\`\`\n${truncate(decoded, 3000)}\n\`\`\``);
      } catch {
        await ctx.reply('❌ El texto no es Base64 válido.');
      }
    },
  },
  {
    name: 'hash',
    aliases: ['md5', 'sha256'],
    category: 'tools',
    desc: 'Genera un hash de un texto.',
    usage: 'hash <md5|sha1|sha256|sha512> <texto>',
    async execute(ctx) {
      const algorithms = ['md5', 'sha1', 'sha256', 'sha512'];
      let algo = 'sha256';
      let text = ctx.text;
      if (algorithms.includes(String(ctx.args[0] || '').toLowerCase())) {
        algo = ctx.args[0].toLowerCase();
        text = ctx.args.slice(1).join(' ');
      }
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}hash* md5 Hola mundo`);
        return;
      }
      const hash = crypto.createHash(algo).update(text).digest('hex');
      await ctx.reply(`🔒 *Hash ${algo.toUpperCase()}*\n\n\`\`\`\n${hash}\n\`\`\``);
    },
  },
  {
    name: 'password',
    aliases: ['pass', 'generar'],
    category: 'tools',
    desc: 'Genera una contraseña segura.',
    usage: 'password [longitud]',
    async execute(ctx) {
      const length = Math.min(64, Math.max(8, Number(ctx.args[0]) || 16));
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
      let pass = '';
      for (let i = 0; i < length; i++) pass += chars[crypto.randomInt(0, chars.length)];
      await ctx.reply(`🔑 *Contraseña generada*\n\n\`${pass}\`\n\n🔒 Longitud: *${length}*`);
    },
  },
  {
    name: 'uuid',
    aliases: ['idrandom'],
    category: 'tools',
    desc: 'Genera un UUID aleatorio.',
    usage: 'uuid',
    async execute(ctx) {
      await ctx.reply(`🆔 *UUID*\n\n\`${crypto.randomUUID()}\``);
    },
  },
  {
    name: 'ip',
    aliases: ['ipinfo', 'miip'],
    category: 'tools',
    desc: 'Muestra información de una IP o de la tuya.',
    usage: 'ip [dirección IP]',
    async execute(ctx) {
      const ip = ctx.args[0] || '';
      const data = await getIpInfo(ip);
      const text = [
        `🌐 *INFORMACIÓN DE IP*`,
        '',
        `▸ IP: *${data.ip}*`,
        `▸ Tipo: ${data.type || 'Desconocido'}`,
        `▸ País: ${data.country || '?'} ${data.flag?.emoji || ''}`,
        `▸ Región: ${data.region || '?'}`,
        `▸ Ciudad: ${data.city || '?'}`,
        `▸ ISP: ${data.connection?.isp || '?'}`,
        `▸ Organización: ${data.connection?.org || '?'}`,
        `▸ ASN: ${data.connection?.asn || '?'}`,
        `▸ Zona horaria: ${data.timezone?.id || '?'}`,
        `▸ Latitud/Longitud: ${data.latitude}, ${data.longitude}`,
      ].join('\n');
      await ctx.reply(text);
    },
  },
  {
    name: 'country',
    aliases: ['pais', 'país'],
    category: 'tools',
    desc: 'Muestra información de un país.',
    usage: 'country <nombre>',
    async execute(ctx) {
      const query = ctx.text.trim();
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}country* El Salvador`);
        return;
      }
      const c = await getCountry(query);
      const currencies = Object.values(c.currencies || {})
        .map((x) => `${x.name} (${x.symbol})`)
        .join(', ');
      const languages = Object.values(c.languages || {}).join(', ');
      const text = [
        `🌎 *${c.name?.common?.toUpperCase()}*`,
        '',
        `▸ Nombre oficial: ${c.name?.official || '?'}`,
        `▸ Capital: ${c.capital?.join(', ') || '?'}`,
        `▸ Región: ${c.region || '?'} — ${c.subregion || '?'}`,
        `▸ Población: *${formatNumber(c.population)}*`,
        `▸ Área: *${formatNumber(c.area)} km²*`,
        `▸ Moneda: ${currencies || '?'}`,
        `▸ Idiomas: ${languages || '?'}`,
        `▸ Zonas horarias: ${c.timezones?.join(', ') || '?'}`,
        `▸ Código: ${c.cca2 || '?'} / ${c.cca3 || '?'}`,
      ].join('\n');
      if (c.flags?.png) {
        try {
          await ctx.send({ image: { url: c.flags.png }, caption: text });
          return;
        } catch {}
      }
      await ctx.reply(text);
    },
  },
  {
    name: 'currency',
    aliases: ['convertir'],
    category: 'tools',
    desc: 'Convierte entre monedas.',
    usage: 'currency <cantidad> <de> <a>',
    async execute(ctx) {
      let amount = Number(ctx.args[0]);
      let from;
      let to;
      if (Number.isFinite(amount) && ctx.args.length >= 3) {
        from = ctx.args[1].toUpperCase();
        to = ctx.args[2].toUpperCase();
      } else {
        amount = 1;
        from = String(ctx.args[0] || '').toUpperCase();
        to = String(ctx.args[1] || '').toUpperCase();
      }
      if (!from || !to) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}currency* 100 USD EUR`);
        return;
      }
      const r = await convertCurrency(amount, from, to);
      await ctx.reply(
        `💱 *Conversión de moneda*\n\n▸ ${formatNumber(r.amount)} ${r.from} = *${formatNumber(r.result)} ${r.to}*\n▸ Fecha: ${r.date}`,
      );
    },
  },
  {
    name: 'crypto',
    aliases: ['cripto', 'coin', 'precio'],
    category: 'tools',
    desc: 'Muestra el precio de una criptomoneda.',
    usage: 'crypto <btc|eth|nombre>',
    async execute(ctx) {
      const query = ctx.args[0];
      if (!query) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}crypto* bitcoin`);
        return;
      }
      const c = await getCrypto(query);
      const change = Number(c.usd_24h_change || 0);
      const emoji = change >= 0 ? '📈' : '📉';
      await ctx.reply(
        [
          `💰 *${c.id.toUpperCase()}*`,
          '',
          `▸ USD: *$${formatNumber(c.usd)}*`,
          `▸ EUR: *€${formatNumber(c.eur)}*`,
          `▸ Cambio 24h: ${emoji} *${change.toFixed(2)}%*`,
          `▸ Market cap: *$${formatNumber(c.usd_market_cap)}*`,
        ].join('\n'),
      );
    },
  },
  {
    name: 'screenshot',
    aliases: ['ss', 'webss', 'captura'],
    category: 'tools',
    desc: 'Toma una captura de pantalla de una página web.',
    usage: 'screenshot <url>',
    async execute(ctx) {
      const url = ctx.args.find((a) => isUrl(a));
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}screenshot* https://google.com`);
        return;
      }
      const buffer = await screenshotBuffer(url);
      await sendImage(ctx, buffer, `📸 *Captura de* ${url}`);
    },
  },
  {
    name: 'npm',
    aliases: ['npminfo'],
    category: 'tools',
    desc: 'Muestra información de un paquete de NPM.',
    usage: 'npm <paquete>',
    async execute(ctx) {
      const name = ctx.args[0];
      if (!name) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}npm* baileys`);
        return;
      }
      const p = await getNpmPackage(name);
      const latest = p['dist-tags']?.latest || '?';
      await ctx.reply(
        [
          `📦 *${p.name}*`,
          '',
          `▸ Versión: *${latest}*`,
          `▸ Descripción: ${p.description || 'Sin descripción'}`,
          `▸ Autor: ${typeof p.author === 'object' ? p.author?.name : p.author || '?'}`,
          `▸ Licencia: ${p.license || '?'}`,
          `▸ Descargas semanales: *${formatNumber(p.downloads)}*`,
          `▸ Repositorio: ${p.repository?.url || '?'}`,
          `▸ NPM: https://www.npmjs.com/package/${p.name}`,
        ].join('\n'),
      );
    },
  },
  {
    name: 'github',
    aliases: ['gh', 'gituser'],
    category: 'tools',
    desc: 'Muestra información de un usuario de GitHub.',
    usage: 'github <usuario>',
    async execute(ctx) {
      const user = ctx.args[0];
      if (!user) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}github* torvalds`);
        return;
      }
      const u = await getGithubUser(user);
      const text = [
        `🐙 *GITHUB: ${u.login}*`,
        '',
        `▸ Nombre: ${u.name || '?'}`,
        `▸ Bio: ${u.bio || 'Sin bio'}`,
        `▸ Repos: *${formatNumber(u.public_repos)}*`,
        `▸ Seguidores: *${formatNumber(u.followers)}*`,
        `▸ Siguiendo: *${formatNumber(u.following)}*`,
        `▸ Ubicación: ${u.location || '?'}`,
        `▸ Empresa: ${u.company || '?'}`,
        `▸ Creado: ${u.created_at ? new Date(u.created_at).toLocaleDateString('es-ES') : '?'}`,
        `▸ Perfil: ${u.html_url}`,
      ].join('\n');
      if (u.avatar_url) {
        try {
          await ctx.send({ image: { url: u.avatar_url }, caption: text });
          return;
        } catch {}
      }
      await ctx.reply(text);
    },
  },
  {
    name: 'get',
    aliases: ['fetch', 'http'],
    category: 'tools',
    desc: 'Obtiene el contenido de una URL.',
    usage: 'get <url>',
    async execute(ctx) {
      const url = ctx.args.find((a) => isUrl(a));
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}get* https://api.github.com`);
        return;
      }
      const r = await fetchAny(url);
      if (r.type === 'image') {
        await sendImage(ctx, r.data, `🖼️ Imagen de ${url}`);
        return;
      }
      if (r.type === 'json') {
        const text = JSON.stringify(r.data, null, 2);
        await ctx.reply(`🌐 *JSON de ${url}*\n\n\`\`\`json\n${truncate(text, 3500)}\n\`\`\``);
        return;
      }
      await ctx.reply(`🌐 *Contenido de ${url}*\n\n\`\`\`\n${truncate(String(r.data), 3500)}\n\`\`\``);
    },
  },
  {
    name: 'tourl',
    aliases: ['upload', 'subir'],
    category: 'tools',
    desc: 'Sube un archivo o enlace a Catbox y devuelve la URL.',
    usage: 'tourl (responde a un archivo o pasa URL)',
    async execute(ctx) {
      let buffer;
      let filename = `zenitsu-${Date.now()}.bin`;
      const target = ctx.m.hasMedia ? ctx.m : ctx.quoted;
      const url = ctx.args.find((a) => isUrl(a));
      if (target?.hasMedia) {
        buffer = await ctx.downloadMedia(target);
        const ext = target.mediaType === 'image' ? 'jpg' : target.mediaType === 'video' ? 'mp4' : target.mediaType === 'audio' ? 'mp3' : 'bin';
        filename = `zenitsu-${Date.now()}.${ext}`;
      } else if (url) {
        buffer = await fetchBuffer(url);
        filename = url.split('/').pop()?.split('?')[0] || filename;
      } else {
        await ctx.reply(`💡 Responde a un archivo o usa *${ctx.prefix}tourl* <url>`);
        return;
      }
      const link = await catboxUpload(buffer, filename);
      await ctx.reply(`☁️ *Archivo subido*\n\n▸ Tamaño: *${formatBytes(buffer.length)}*\n▸ URL: ${link}`);
    },
  },
  {
    name: 'carbon',
    aliases: ['codeimg', 'carboncode'],
    category: 'tools',
    desc: 'Convierte código en una imagen bonita.',
    usage: 'carbon <código>',
    async execute(ctx) {
      const code = ctx.text.trim();
      if (!code) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}carbon* console.log("Hola")`);
        return;
      }
      const buffer = await carbonBuffer(code);
      await sendImage(ctx, buffer, '💻 *Código convertido en imagen*');
    },
  },
  {
    name: 'dns',
    aliases: ['dnslookup'],
    category: 'tools',
    desc: 'Consulta los registros DNS de un dominio.',
    usage: 'dns <dominio> [tipo]',
    async execute(ctx) {
      const domain = ctx.args[0];
      const type = (ctx.args[1] || 'A').toUpperCase();
      if (!domain) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}dns* google.com MX`);
        return;
      }
      const data = await getDns(domain, type);
      const answers = (data.Answer || [])
        .map((a) => `▸ ${a.name} → ${a.data} (T${a.TTL})`)
        .join('\n');
      await ctx.reply(
        `🌐 *DNS ${type} de ${domain}*\n\n${answers || 'Sin respuestas.'}\n\n▸ Estado: ${data.Status}`,
      );
    },
  },
  {
    name: 'whois',
    aliases: ['dominio'],
    category: 'tools',
    desc: 'Muestra información WHOIS/RDAP de un dominio.',
    usage: 'whois <dominio>',
    async execute(ctx) {
      const domain = ctx.args[0];
      if (!domain) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}whois* google.com`);
        return;
      }
      const d = await getWhois(domain);
      const events = (d.events || [])
        .map((e) => `▸ ${e.eventAction}: ${new Date(e.eventDate).toLocaleDateString('es-ES')}`)
        .join('\n');
      const nameservers = (d.nameservers || []).map((n) => n.ldhName).join(', ');
      await ctx.reply(
        [
          `🌐 *WHOIS: ${d.ldhName || domain}*`,
          '',
          `▸ Estado: ${(d.status || []).join(', ') || '?'}`,
          `▸ Registrador: ${d.entities?.[0]?.vcardArray?.[1]?.find((x) => x[0] === 'fn')?.[3] || '?'}`,
          `▸ Nameservers: ${nameservers || '?'}`,
          '',
          '📅 *Eventos*',
          events || 'Sin datos.',
        ].join('\n'),
      );
    },
  },
  {
    name: 'httpstatus',
    aliases: ['statusweb', 'httpcheck'],
    category: 'tools',
    desc: 'Comprueba el estado HTTP de una URL.',
    usage: 'httpstatus <url>',
    async execute(ctx) {
      const url = ctx.args.find((a) => isUrl(a));
      if (!url) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}httpstatus* https://google.com`);
        return;
      }
      const r = await httpCheck(url);
      const emoji = r.status >= 200 && r.status < 400 ? '✅' : '⚠️';
      await ctx.reply(
        `${emoji} *Estado HTTP*\n\n▸ URL: ${url}\n▸ Código: *${r.status} ${r.statusText}*\n▸ Tiempo: *${r.ms} ms*\n▸ Tipo: ${r.contentType || '?'}\n▸ Final: ${r.finalUrl}`,
      );
    },
  },
  {
    name: 'time',
    aliases: ['hora', 'fecha'],
    category: 'tools',
    desc: 'Muestra la hora actual en una zona horaria.',
    usage: 'time [zona horaria]',
    async execute(ctx) {
      const zone = ctx.args[0] || 'America/El_Salvador';
      let text;
      try {
        text = new Intl.DateTimeFormat('es-ES', {
          dateStyle: 'full',
          timeStyle: 'medium',
          timeZone: zone,
        }).format(new Date());
      } catch {
        await ctx.reply(`❌ Zona horaria inválida.\n\n💡 Ejemplo: ${ctx.prefix}time America/El_Salvador`);
        return;
      }
      await ctx.reply(`🕒 *Hora en ${zone}*\n\n${text}\n\n⏱️ Unix: *${Math.floor(Date.now() / 1000)}*`);
    },
  },
  {
    name: 'timestamp',
    aliases: ['unix', 'ts'],
    category: 'tools',
    desc: 'Muestra la marca de tiempo actual.',
    usage: 'timestamp',
    async execute(ctx) {
      await ctx.reply(`⏱️ *Timestamp*\n\n▸ Milisegundos: \`${Date.now()}\`\n▸ Segundos: \`${Math.floor(Date.now() / 1000)}\`\n▸ Fecha: ${formatDate(new Date())}`);
    },
  },
  {
    name: 'isgd',
    aliases: ['isgdurl', 'acortar2'],
    category: 'tools',
    desc: 'Acorta un enlace con is.gd (alternativa corta).',
    usage: 'isgd <url>',
    async execute(ctx) {
      const url = ctx.args.find((a) => isUrl(a)) || ctx.text.trim();
      if (!isUrl(url)) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}isgd* https://ejemplo.com/pagina/muy/larga`);
        return;
      }
      const res = await fetchAny(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
      const data = res.type === 'json' ? res.data : JSON.parse(String(res.data).trim());
      if (!data?.shorturl) throw new Error('No se pudo acortar el enlace');
      await ctx.reply(`🔗 *Enlace corto (is.gd)*\n\n▸ Original: ${truncate(url, 120)}\n▸ Corto: ${data.shorturl}`);
    },
  },
  {
    name: 'tempmail',
    aliases: ['correotemporal', 'mailtemp', 'fakemail'],
    category: 'tools',
    desc: 'Crea un correo temporal para registrar cuentas sin exponer el tuyo.',
    usage: 'tempmail',
    async execute(ctx) {
      await ctx.reply('📬 *Creando tu correo temporal...*');
      const { address, password } = await mailTmCreate();
      db().tempMails ||= {};
      db().tempMails[ctx.senderNumber] = { address, password, at: Date.now() };
      await ctx.reply(
        `╭─「 📬 CORREO TEMPORAL 」\n│\n▸ 📧 *${address}*\n│\n▸ ⏳ Los correos que lleguen los ves con *${ctx.prefix}mails*\n▸ 💾 Tu bandeja se guarda 1 día\n╰─ ⚡ _No lo compartas si esperas códigos privados_`,
      );
    },
  },
  {
    name: 'mails',
    aliases: ['bandeja', 'inbox', 'vermails'],
    category: 'tools',
    desc: 'Revisa los correos de tu tempmail.',
    usage: 'mails',
    async execute(ctx) {
      const mine = db().tempMails?.[ctx.senderNumber];
      if (!mine) {
        await ctx.reply(`📭 No tienes un correo temporal.\n\n_Crea uno con_ *${ctx.prefix}tempmail*`);
        return;
      }
      await ctx.reply('📬 *Revisando tu bandeja...*');
      const messages = await mailTmMessages(mine.address, mine.password);
      if (!messages.length) {
        await ctx.reply(`📭 *${mine.address}*\n\n_Tu bandeja está vacía. Espera un momento y revisa de nuevo._`);
        return;
      }
      const list = messages
        .slice(0, 10)
        .map(
          (m, n) =>
            `${n + 1}. ✉️ *${truncate(m.subject || '(sin asunto)', 60)}*\n   👤 ${m.from}\n   💬 ${truncate(m.intro || '', 90)}`,
        )
        .join('\n\n');
      await ctx.reply(`╭─「 📬 TU BANDEJA 」\n│\n▸ 📧 ${mine.address}\n│\n${list}\n╰─ ⚡ *${messages.length}* correo(s)`);
    },
  },
];
