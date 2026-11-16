import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db, save } from './db.js';

// Ajustes que cada subbot puede personalizar sin tocar al bot principal.
// Si un subbot no define una clave, se usa el valor global de la DB.
const DEFAULTS = {
  botName: config.botName,
  prefix: config.prefix,
  banner: null,
  bannerType: 'image',
  menuLink: '',
  menuStyle: 'galactico',
  // Emoji que acompaña a cada comando del menú (el "rayito" ⚡ por defecto).
  // Se cambia con .setemoji.
  menuEmoji: '⚡',
  // Antes estaba en true y TODOS los menús salían navideños. Ahora la
  // Navidad solo se ve si eliges el estilo "navideno" con .setmenu.
  christmas: false,
  theme: '',
  stickerPack: 'ZENITSU BOT',
  stickerAuthor: 'Zenitsu',
  // Reacciones por comando (.setreaccion). Cada bot tiene las suyas.
  reactions: {},
  // Interruptores que antes eran globales: ahora cada bot guarda los suyos
  // y no cambia los de los demás.
  autoRead: true,
  autoReact: false,
  autoStatus: true,
  antiDelete: true,
  antiCall: false,
  autoAdmin: false,
  mode: 'public',
  // API keys propias de este bot (se mezclan con las globales como respaldo).
  apis: {},
};

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

// Devuelve el registro del subbot dueño de este socket. Se calcula desde la
// DB (sin importar lib/subbots.js) para evitar ciclos de importación.
export function subbotForSock(sock) {
  const number = digits(sock?.user?.id);
  if (!number) return null;
  const list = Array.isArray(db().subbots) ? db().subbots : [];
  return list.find((s) => digits(s.number) === number) || null;
}

function settingsOf(subbot) {
  if (!subbot) return {};
  if (!subbot.settings || typeof subbot.settings !== 'object') subbot.settings = {};
  return subbot.settings;
}

// Ajustes efectivos: lo propio del subbot primero y, si falta, lo global.
export function effectiveSettings(subbot) {
  const store = db();
  const own = settingsOf(subbot);
  const has = (key) => own[key] !== undefined && own[key] !== null && own[key] !== '';
  const hasBanner = typeof own.banner === 'string' && own.banner.length > 0;
  const pick = (key, fallback) => {
    if (has(key)) return own[key];
    if (store[key] !== undefined && store[key] !== null) return store[key];
    return fallback;
  };

  return {
    botName: has('botName') ? own.botName : store.botName || DEFAULTS.botName,
    prefix: has('prefix') ? own.prefix : store.prefix || DEFAULTS.prefix,
    banner: hasBanner ? own.banner : store.banner || DEFAULTS.banner,
    bannerType: hasBanner
      ? own.bannerType || store.bannerType || DEFAULTS.bannerType
      : store.bannerType || DEFAULTS.bannerType,
    menuLink:
      own.menuLink !== undefined ? own.menuLink || '' : store.menuLink || DEFAULTS.menuLink,
    menuStyle: has('menuStyle') ? own.menuStyle : store.menuStyle || DEFAULTS.menuStyle,
    menuEmoji: has('menuEmoji') ? own.menuEmoji : store.menuEmoji || DEFAULTS.menuEmoji,
    christmas:
      own.christmas !== undefined
        ? Boolean(own.christmas)
        : store.christmas !== undefined
          ? Boolean(store.christmas)
          : DEFAULTS.christmas,
    theme: own.theme !== undefined ? own.theme : store.theme ?? DEFAULTS.theme,
    stickerPack: has('stickerPack')
      ? own.stickerPack
      : store.stickerPack || DEFAULTS.stickerPack,
    stickerAuthor: has('stickerAuthor')
      ? own.stickerAuthor
      : store.stickerAuthor || DEFAULTS.stickerAuthor,
    // Reacciones: el bot principal usa las globales; cada subbot SOLO las
    // suyas (vacío = ✅), así .setreaccion de un subbot no toca a los demás.
    reactions: subbot ? own.reactions || {} : store.reactions || {},
    // Interruptores aislados por bot (el global sirve de valor por defecto).
    autoRead: Boolean(pick('autoRead', DEFAULTS.autoRead)),
    autoReact: Boolean(pick('autoReact', DEFAULTS.autoReact)),
    autoStatus: Boolean(pick('autoStatus', DEFAULTS.autoStatus)),
    antiDelete: Boolean(pick('antiDelete', DEFAULTS.antiDelete)),
    antiCall: Boolean(pick('antiCall', DEFAULTS.antiCall)),
    autoAdmin: Boolean(pick('autoAdmin', DEFAULTS.autoAdmin)),
    mode: pick('mode', DEFAULTS.mode),
    // API keys: cada subbot puede sobrescribir las suyas sin tocar las
    // globales, que quedan como respaldo.
    apis: subbot ? { ...(store.apis || {}), ...(own.apis || {}) } : store.apis || {},
  };
}

// Interruptor del bot que atiende este socket (main o subbot).
export function botFlag(sock, key) {
  const subbot = subbotForSock(sock);
  return Boolean(effectiveSettings(subbot)[key]);
}

// Owners de este bot: los globales mandan en todos; los del subbot solo en él.
export function ownerNumbersForSock(sock) {
  const store = db();
  const global = (store.owners || []).map((o) => String(o).replace(/\D/g, ''));
  const subbot = subbotForSock(sock);
  const local = Array.isArray(subbot?.owners)
    ? subbot.owners.map((o) => String(o).replace(/\D/g, ''))
    : subbot?.owner
      ? [String(subbot.owner).replace(/\D/g, '')]
      : [];
  return [...new Set([...global, ...local].filter(Boolean))];
}

export function getBotSetting(subbot, key) {
  return effectiveSettings(subbot)[key];
}

// Guarda uno o varios ajustes. Con subbot escribe en su propio bloque; sin
// subbot (bot principal) escribe en la DB global.
export function setBotSettings(subbot, patch = {}) {
  if (subbot) {
    const own = settingsOf(subbot);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete own[key];
      else own[key] = value;
    }
  } else {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete db()[key];
      else db()[key] = value;
    }
  }
  save();
  return effectiveSettings(subbot);
}

export function setBotSetting(subbot, key, value) {
  return setBotSettings(subbot, { [key]: value });
}

// Ruta del banner propio de un subbot. Nunca usa assets/banner.* para no
// pisar el banner del bot principal.
export function subbotBannerPath(number, isVideo) {
  const n = digits(number);
  return path.join(config.assetsDir, `banner-${n}.${isVideo ? 'mp4' : 'jpg'}`);
}

export function clearSubbotBanner(number) {
  for (const video of [false, true]) {
    try {
      fs.rmSync(subbotBannerPath(number, video), { force: true });
    } catch {}
  }
}
