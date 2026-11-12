import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { config } from '../config.js';
import { db, save } from './db.js';
import { handleMessage, handleDeletedMessage } from '../handlers/message.js';
import { handleGroupParticipants } from '../handlers/group.js';
import { invalidateGroupMeta } from './state.js';
import { applyChannelBanner, sleep, jidToNumber } from './utils.js';

const logger = pino({ level: 'silent' });
const running = new Map(); // number -> entry

// La versión de WhatsApp Web se consulta una sola vez por proceso: evita
// 8 s de espera cada vez que se vincula un subbot.
let cachedVersion;
async function baileysVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const { version } = await Promise.race([
      fetchLatestBaileysVersion(),
      sleep(8000).then(() => {
        throw new Error('timeout');
      }),
    ]);
    if (Array.isArray(version)) cachedVersion = version;
  } catch {}
  return cachedVersion;
}

function digits(number) {
  return String(number || '').replace(/\D/g, '');
}

// Número del BOT PRINCIPAL (el conectado en index.js). Se setea al arrancar.
export function mainBotNumber() {
  try {
    return jidToNumber(globalThis.__ZENITSU_SOCK__?.user?.id) || '';
  } catch {
    return '';
  }
}

// Un número válido de teléfono tiene entre 7 y 15 dígitos. Los LID internos
// de WhatsApp (ej: 120363428998277230) son más largos y NO son teléfonos.
function isValidPhone(n) {
  return n.length >= 7 && n.length <= 15;
}

export function subbotDir(number) {
  return path.join(config.sessionDir, 'subbots', digits(number));
}

export function listSubbots() {
  if (!Array.isArray(db().subbots)) db().subbots = [];
  return db().subbots;
}

export function findSubbot(number) {
  const n = digits(number);
  return listSubbots().find((s) => digits(s.number) === n);
}

export function isSubbotRunning(number) {
  return running.has(digits(number));
}

// "Conectado" = el socket está abierto (connection === 'open'). Un subbot en
// proceso de vinculación está en `running` pero NO conectado todavía.
export function isSubbotConnected(number) {
  return Boolean(running.get(digits(number))?.connected);
}

export function getSubbotEntry(number) {
  return running.get(digits(number)) || null;
}

export function addSubbot(number, name = '') {
  const n = digits(number);
  if (!isValidPhone(n)) throw new Error('Número inválido');
  // El BOT PRINCIPAL nunca puede ser subbot (evita el bug de duplicarse).
  const main = mainBotNumber();
  if (main && n === main) throw new Error('Ese número es el bot principal, no puede ser subbot');
  const existing = findSubbot(n);
  if (existing) {
    if (name) {
      existing.name = name;
      save();
    }
    return existing;
  }
  const record = {
    number: n,
    name: name || `Zenitsu${n.slice(-2)}`,
    createdAt: Date.now(),
    enabled: true,
    jid: '',
    premium: false,
    premiumUntil: 0,
    muted: false,
    primary: false,
  };
  listSubbots().push(record);
  save();
  return record;
}

function isRegistered(number) {
  try {
    const file = path.join(subbotDir(number), 'creds.json');
    const creds = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Boolean(creds.registered);
  } catch {
    return false;
  }
}

export function isSubbotRegistered(number) {
  return isRegistered(number);
}

export async function stopSubbot(number) {
  const n = digits(number);
  const entry = running.get(n);
  if (!entry) return false;
  entry.stopping = true;
  running.delete(n);
  try {
    entry.sock.end?.(new Error('Subbot detenido'));
  } catch {}
  try {
    entry.sock.ws?.close();
  } catch {}
  return true;
}

// Borra los registros que NUNCA se vincularon (no tienen credenciales
// registradas) y que no están conectados. Se usa desde .subbots para dejar
// solo los bots activos. Un subbot a medio vincular está en `running`, así
// que nunca se borra mientras se está emparejando.
export async function pruneUnlinkedSubbots() {
  const removed = [];
  for (const record of [...listSubbots()]) {
    const n = digits(record?.number);
    if (!n) continue;
    if (running.has(n) || isRegistered(n)) continue;
    await removeSubbot(n);
    removed.push(n);
  }
  return removed;
}

export async function removeSubbot(number) {
  const n = digits(number);
  await stopSubbot(n);
  const list = listSubbots();
  const index = list.findIndex((s) => digits(s.number) === n);
  if (index >= 0) list.splice(index, 1);
  save();
  try {
    fs.rmSync(subbotDir(n), { recursive: true, force: true });
  } catch {}
  return index >= 0;
}

// Avisa al chat donde se pidió .code que hay un código nuevo (o que caducó).
// Se envía con el bot principal para que el aviso llegue aunque el subbot
// todavía no esté vinculado.
async function notifyCode(jid, number, code, note = '') {
  const main = globalThis.__ZENITSU_SOCK__;
  if (!main || !jid) return;
  const pretty =
    String(code || '').length === 8
      ? `${code.slice(0, 4)}-${code.slice(4)}`
      : String(code || '');
  const text = code
    ? `🔄 *CÓDIGO NUEVO PARA +${number}*\n\n🔢 Código: *${pretty}*\n\n${note ? `${note}\n\n` : ''}` +
      `1. Abre WhatsApp en el *+${number}*.\n2. Dispositivos vinculados → Vincular dispositivo.\n3. Elige «Vincular con número de teléfono».\n4. Escribe el código.\n\n` +
      `⚠️ Caduca en ~60 segundos.`
    : `⌛ *VINCULACIÓN DE +${number}*\n\n${note || 'El código ya no sirve.'}\n\n` +
      `💡 Usa *.code ${number}* para generar uno nuevo.`;
  try {
    await main.sendMessage(jid, { text });
  } catch {}
}

export async function startSubbot(number, options = {}) {
  const n = digits(number);
  if (n.length < 7) throw new Error('Número inválido');
  if (running.has(n)) {
    const entry = running.get(n);
    return {
      already: true,
      sock: entry.sock,
      record: findSubbot(n) || addSubbot(n),
      registered: entry.registered,
      connected: entry.connected,
      codePromise: entry.codePromise,
      readyPromise: entry.readyPromise,
      requestCode: (force = false) => entry.requestCode?.(force) || null,
    };
  }

  const record = addSubbot(n);
  const dir = subbotDir(n);
  const alreadyRegistered = isRegistered(n);
  // Vinculación nueva: se borran las credenciales a medio terminar. Si no,
  // WhatsApp rechaza el código (causa típica de "el código no conecta").
  if (options.fresh && !alreadyRegistered) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);

  const version = await baileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
  });
  // Todos los mensajes de este subbot también salen "Reenviado desde" el canal.
  applyChannelBanner(sock);

  let codeResolve;
  let codeReject;
  let readyResolve;
  let readyReject;
  const codePromise = new Promise((resolve, reject) => {
    codeResolve = resolve;
    codeReject = reject;
  });
  const readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  // Evita que un rechazo sin escucha tumbe el proceso.
  codePromise.catch(() => {});
  readyPromise.catch(() => {});

  const entry = {
    sock,
    number: n,
    registered: Boolean(state.creds.registered),
    connected: false,
    pairingRequested: false,
    pairingCode: '',
    codeAt: 0,
    reconnecting: false,
    stopping: false,
    attempts: 0,
    startedAt: Date.now(),
    notifyJid: options.notifyJid || '',
    codePromise,
    readyPromise,
  };
  running.set(n, entry);

  sock.ev.on('creds.update', saveCreds);

  // Pide el código de vinculación. `force` genera uno nuevo aunque ya se
  // haya pedido antes (cuando el anterior caducó o la conexión se reinició).
  async function requestCode(force = false) {
    if (entry.stopping || state.creds.registered) return null;
    if (entry.pairingRequested && !force && entry.pairingCode) return entry.pairingCode;
    entry.pairingRequested = true;
    try {
      let code;
      try {
        // Código numérico de 8 dígitos (más fácil de escribir). Si WhatsApp
        // lo rechaza, se usa el código estándar de Baileys.
        code = await sock.requestPairingCode(
          n,
          String(crypto.randomInt(10000000, 100000000)),
        );
      } catch {
        code = await sock.requestPairingCode(n);
      }
      entry.pairingCode = code;
      entry.codeAt = Date.now();
      record.pairingCode = code;
      save();
      codeResolve(code);
      if (typeof options.onCode === 'function') {
        Promise.resolve(options.onCode(code, n)).catch(() => {});
      }
      // Si nadie escribe el código en ~65 s, se avisa que caducó.
      clearTimeout(entry.codeTimer);
      entry.codeTimer = setTimeout(() => {
        if (entry.stopping || entry.connected || state.creds.registered) return;
        notifyCode(entry.notifyJid, n, '', 'El código caducó sin vincularse.').catch(() => {});
      }, 65000);
      entry.codeTimer.unref?.();
      return code;
    } catch (err) {
      entry.pairingRequested = false;
      codeReject(err);
      if (typeof options.onError === 'function') {
        Promise.resolve(options.onError(err, n)).catch(() => {});
      }
      return null;
    }
  }
  entry.requestCode = requestCode;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // El QR llega con el socket ya abierto: es el momento seguro para pedir
    // el código (igual que el bot principal). Antes se pedía en 'connecting'
    // con 2 s de espera y WhatsApp muchas veces lo ignoraba.
    if (qr && !state.creds.registered && !entry.pairingRequested) {
      requestCode().catch(() => {});
    }

    if (connection === 'open') {
      entry.connected = true;
      entry.registered = true;
      entry.attempts = 0;
      entry.reconnecting = false;
      entry.pairingRequested = false;
      clearTimeout(entry.codeTimer);
      record.jid = sock.user?.id || '';
      record.enabled = true;
      record.connectedAt = Date.now();
      save();
      readyResolve(sock);
      return;
    }

    if (connection !== 'close') return;
    entry.connected = false;
    if (entry.stopping) return;

    const statusCode = lastDisconnect?.error?.output?.statusCode;

    // Sesión cerrada desde el teléfono o prohibida: se elimina el subbot
    // para no dejar registros muertos en .subbots.
    if (
      statusCode === DisconnectReason.loggedOut ||
      statusCode === DisconnectReason.forbidden
    ) {
      entry.stopping = true;
      clearTimeout(entry.codeTimer);
      running.delete(n);
      readyReject(new Error('El subbot cerró sesión desde WhatsApp'));
      codeReject(new Error('El subbot cerró sesión desde WhatsApp'));
      await removeSubbot(n).catch(() => {});
      notifyCode(
        entry.notifyJid,
        n,
        '',
        'El subbot cerró sesión desde WhatsApp y fue eliminado.',
      ).catch(() => {});
      return;
    }

    if (entry.reconnecting) return;
    entry.reconnecting = true;
    entry.attempts += 1;
    running.delete(n);
    clearTimeout(entry.codeTimer);

    const pairing = !state.creds.registered;
    // Si no se vincula tras varios intentos, se deja de reintentar.
    if (pairing && entry.attempts > 4) {
      entry.stopping = true;
      record.enabled = false;
      save();
      readyReject(new Error('No se pudo vincular el subbot'));
      codeReject(new Error('No se pudo vincular el subbot'));
      notifyCode(
        entry.notifyJid,
        n,
        '',
        'No se pudo vincular el subbot. Usa .code de nuevo.',
      ).catch(() => {});
      return;
    }

    const delay = pairing
      ? Math.min(5000, 1000 * entry.attempts)
      : Math.min(20000, 1500 * entry.attempts);
    await sleep(delay);
    if (entry.stopping) return;

    startSubbot(n, {
      ...options,
      fresh: false,
      // Si estaba vinculándose, el código anterior murió con la conexión:
      // el nuevo se pide solo (qr) y se avisa al chat donde se usó .code.
      onCode: pairing
        ? (code) =>
            notifyCode(
              entry.notifyJid,
              n,
              code,
              '⚠️ El código anterior caducó porque la conexión se reinició.',
            )
        : options.onCode,
    }).catch((err) => {
      console.error(`[SUBBOT:${n}] no se pudo reconectar:`, err?.message || err);
    });
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      handleMessage(sock, msg).catch((err) => {
        console.error(`[SUBBOT:${n}]`, err?.message || err);
      });
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const item of updates) {
      if (item?.update?.message === null) {
        handleDeletedMessage(sock, item.key).catch(() => {});
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    handleGroupParticipants(sock, update).catch((err) => {
      console.error(`[SUBBOT:${n}] grupo:`, err?.message || err);
    });
  });

  sock.ev.on('groups.update', () => {
    invalidateGroupMeta();
  });

  sock.ev.on('call', async (calls) => {
    if (!db().antiCall) return;
    for (const call of calls) {
      if (call.status === 'offer') {
        try {
          await sock.rejectCall(call.id, call.from);
        } catch {}
      }
    }
  });

  return {
    already: false,
    sock,
    record,
    registered: Boolean(state.creds.registered),
    connected: entry.connected,
    codePromise,
    readyPromise,
    requestCode: (force = false) => entry.requestCode?.(force) || null,
  };
}

export async function startSavedSubbots() {
  if (!Array.isArray(db().subbots)) db().subbots = [];
  // Limpieza al arrancar: una vinculación no sobrevive a un reinicio, así
  // que los registros que nunca se vincularon se borran (registro y carpeta)
  // para que .subbots solo tenga bots reales.
  for (const record of [...db().subbots]) {
    const n = digits(record?.number);
    if (n && isRegistered(n)) continue;
    if (n) {
      await removeSubbot(n).catch(() => {});
    } else {
      const i = db().subbots.indexOf(record);
      if (i >= 0) db().subbots.splice(i, 1);
    }
  }
  save();

  const started = [];
  for (const record of db().subbots) {
    const n = digits(record?.number);
    if (!n || record.enabled === false) continue;
    if (running.has(n)) continue;
    // Solo reconecta sesiones ya vinculadas. Un subbot nuevo debe vincularse
    // con el comando .code para no pedir códigos en cada arranque.
    if (!isRegistered(n)) continue;
    try {
      await startSubbot(n);
      started.push(n);
    } catch (err) {
      console.error(`[SUBBOT:${n}]`, err?.message || err);
    }
  }
  return started;
}

export function runningSubbots() {
  return [...running.keys()];
}

// ─── Subbots premium ────────────────────────────────────────────────────────
// Un subbot normal usa todas las categorías menos las premium (downloads, ia).
// El owner lo asciende con .prem <número> [días] y lo baja con .unprem.

const DAY_MS = 24 * 60 * 60 * 1000;

function premiumRemaining(record) {
  if (!record?.premium) return 0;
  if (!record.premiumUntil) return Infinity; // permanente
  const ms = record.premiumUntil - Date.now();
  return ms > 0 ? ms : 0;
}

export function isSubbotPremium(number) {
  const record = findSubbot(number);
  return premiumRemaining(record) > 0;
}

export function getSubbotPremium(number) {
  const record = findSubbot(number);
  const ms = premiumRemaining(record);
  return {
    record,
    premium: ms > 0,
    until: record?.premiumUntil || 0,
    remainingMs: ms,
    // Días redondeados hacia arriba; 0 significa "menos de un día".
    days: ms === Infinity ? Infinity : Math.max(1, Math.ceil(ms / DAY_MS)),
  };
}

export function setSubbotPremium(number, days = 0) {
  const n = digits(number);
  if (n.length < 7) throw new Error('Número inválido');
  const record = findSubbot(n) || addSubbot(n);
  record.premium = true;
  // days = 0 → permanente. Si ya era premium permanente, no lo baja.
  record.premiumUntil = days > 0 ? Date.now() + days * DAY_MS : 0;
  save();
  return record;
}

export function unsetSubbotPremium(number) {
  const record = findSubbot(number);
  if (!record) return null;
  record.premium = false;
  record.premiumUntil = 0;
  save();
  return record;
}

// Detecta qué subbot está manejando un socket (el bot principal no está en
// la lista, así que devuelve null cuando el mensaje lo responde el principal).
export function findSubbotBySock(sock) {
  const number = digits(sock?.user?.id);
  if (!number) return null;
  return listSubbots().find((s) => digits(s.number) === number) || null;
}

// ─── Silenciar subbots ───────────────────────────────────────────────────────
// Un subbot silenciado sigue conectado pero ignora TODOS los mensajes
// (ni comandos, ni reacciones, ni nada). El owner lo silencia con
// .silenciarsubbs <número> y lo reactiva con .activarsubbs <número>.

export function isSubbotMuted(number) {
  return Boolean(findSubbot(number)?.muted);
}

export function setSubbotMuted(number, muted = true) {
  const record = findSubbot(number);
  if (!record) return null;
  record.muted = Boolean(muted);
  save();
  return record;
}

// ─── Bot principal (primary) ────────────────────────────────────────────────
// .setprimary <número> marca a un subbot como el BOT PRINCIPAL: tiene TODO
// desbloqueado (sin límites premium) y NO puede silenciarse. Solo puede
// haber un primary a la vez.

export function isSubbotPrimary(number) {
  return Boolean(findSubbot(number)?.primary);
}

export function setSubbotPrimary(number) {
  const n = digits(number);
  if (n.length < 7) throw new Error('Número inválido');
  const record = findSubbot(n) || addSubbot(n);
  for (const s of listSubbots()) {
    if (s !== record) s.primary = false;
  }
  record.primary = true;
  // Un bot principal nunca queda silenciado.
  record.muted = false;
  save();
  return record;
}
