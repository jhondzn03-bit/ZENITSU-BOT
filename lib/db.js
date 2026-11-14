import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const DB_FILE = path.join(config.databaseDir, 'db.json');

function freshDb() {
  return {
    botName: config.botName,
    prefix: config.prefix,
    owners: [...config.owners],
    banner: fs.existsSync(config.banner) ? config.banner : null,
    bannerType: 'image', // image | video
    menuLink: '',
    menuStyle: 'galactico', // galactico | clasico | zenitsu | neon | minimal | matrix
    mode: 'public', // public | self | group
    autoRead: true,
    autoReact: false,
    autoStatus: true,
    autoAdmin: false, // .autoadmin: bot y owner se hacen admin solos en grupos
    antiDelete: true,
    antiLink: false,
    antiSpam: false,
    antiCall: false,
    welcome: true,
    goodbye: true,
    warnLimit: config.maxWarns,
    stickerPack: 'ZENITSU BOT',
    stickerAuthor: 'Zenitsu',
    apis: {},
    chats: {},
    groups: {},
    users: {},
    tokens: {},
    subbots: [],
    stats: {
      messages: 0,
      commands: 0,
      start: Date.now(),
    },
  };
}

function ensureDirs() {
  for (const dir of [config.databaseDir, config.sessionDir, config.assetsDir, config.tmpDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function load() {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) {
    const db = freshDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const base = freshDb();
    return {
      ...base,
      ...raw,
      stats: { ...base.stats, ...(raw.stats || {}) },
      apis: raw.apis || {},
      chats: raw.chats || {},
      groups: raw.groups || {},
      users: raw.users || {},
      tokens: raw.tokens && typeof raw.tokens === 'object' ? raw.tokens : {},
      subbots: Array.isArray(raw.subbots) ? raw.subbots : [],
      owners: Array.isArray(raw.owners) && raw.owners.length ? raw.owners : base.owners,
    };
  } catch (err) {
    console.error('[DB] Archivo corrupto, creando respaldo y reiniciando:', err.message);
    try {
      fs.copyFileSync(DB_FILE, `${DB_FILE}.corrupt-${Date.now()}`);
    } catch {}
    const db = freshDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
}

const data = load();
let timer = null;

export function saveNow() {
  clearTimeout(timer);
  timer = null;
  try {
    ensureDirs();
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[DB] No se pudo guardar:', err.message);
  }
}

// Guardado con "throttle": si ya hay uno programado no se reinicia el reloj.
// Antes se usaba debounce y, con tráfico constante (un mensaje cada <400 ms),
// el guardado se posponía para siempre y se perdía todo si el bot se caía.
// Así se escribe como máximo una vez por segundo y nunca se queda sin guardar.
export function save() {
  if (timer) return;
  timer = setTimeout(saveNow, 1000);
}

export function db() {
  return data;
}

export function getUser(jid) {
  if (!data.users[jid]) {
    data.users[jid] = {
      coins: 0,
      xp: 0,
      level: 1,
      warns: 0,
      banned: false,
      inventory: {},
      lastDaily: 0,
      lastWork: 0,
      lastCrime: 0,
      lastRob: 0,
      lastMine: 0,
      lastFish: 0,
      lastHunt: 0,
      dailyStreak: 0,
      createdAt: Date.now(),
    };
    save();
  }
  const u = data.users[jid];
  u.inventory ||= {};
  u.coins ||= 0;
  u.xp ||= 0;
  u.level ||= 1;
  u.warns ||= 0;
  return u;
}

export function getGroup(jid) {
  if (!data.groups[jid]) {
    data.groups[jid] = {
      welcome: data.welcome !== false,
      goodbye: data.goodbye !== false,
      welcomeText: '',
      goodbyeText: '',
      // Avisos decorados de admins (promote/demote) y cambios de imagen:
      adminNotice: true,
      antiLink: data.antiLink === true,
      antiSpam: data.antiSpam === true,
      muted: false,
      // Usuarios silenciados con .mute (número real → { at, by }).
      mutedUsers: {},
      warns: {},
      warnLimit: data.warnLimit || config.maxWarns,
      createdAt: Date.now(),
    };
    save();
  }
  const g = data.groups[jid];
  g.warns ||= {};
  g.mutedUsers ||= {};
  g.warnLimit ||= config.maxWarns;
  g.adminNotice ??= true; // avisos de admins y de imagen del grupo
  return g;
}

export function getChat(jid) {
  if (!data.chats[jid]) {
    data.chats[jid] = { aiChat: false, createdAt: Date.now() };
    save();
  }
  return data.chats[jid];
}

export function isOwnerNumber(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return false;
  return data.owners.some((o) => String(o).replace(/\D/g, '') === digits);
}

export function addOwner(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return false;
  if (isOwnerNumber(digits)) return false;
  data.owners.push(digits);
  save();
  return true;
}

export function removeOwner(number) {
  const digits = String(number || '').replace(/\D/g, '');
  const before = data.owners.length;
  data.owners = data.owners.filter((o) => String(o).replace(/\D/g, '') !== digits);
  save();
  return data.owners.length < before;
}

export function setPrimaryOwner(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return false;
  data.owners = [digits, ...data.owners.filter((o) => String(o).replace(/\D/g, '') !== digits)];
  save();
  return true;
}

export function resetDb() {
  Object.assign(data, freshDb());
  saveNow();
}

// Guarda al salir para no perder cambios.
process.on('exit', saveNow);
process.on('SIGINT', () => {
  saveNow();
  process.exit(0);
});
process.on('SIGTERM', () => {
  saveNow();
  process.exit(0);
});

export { DB_FILE };
