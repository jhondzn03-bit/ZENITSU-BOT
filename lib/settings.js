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
  };
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
