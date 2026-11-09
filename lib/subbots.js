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
import { sleep } from './utils.js';

const logger = pino({ level: 'silent' });
const running = new Map(); // number -> entry

function digits(number) {
  return String(number || '').replace(/\D/g, '');
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

export function addSubbot(number, name = '') {
  const n = digits(number);
  if (n.length < 7) throw new Error('Número inválido');
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
    name: name || `Subbot ${n.slice(-4)}`,
    createdAt: Date.now(),
    enabled: true,
    jid: '',
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
      codePromise: entry.codePromise,
      readyPromise: entry.readyPromise,
    };
  }

  const record = addSubbot(n);
  const dir = subbotDir(n);
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined;
  }

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
    pairingRequested: false,
    reconnecting: false,
    stopping: false,
    attempts: 0,
    startedAt: Date.now(),
    codePromise,
    readyPromise,
  };
  running.set(n, entry);

  sock.ev.on('creds.update', saveCreds);

  async function requestCode() {
    if (entry.pairingRequested || state.creds.registered || entry.stopping) return;
    entry.pairingRequested = true;
    try {
      const code = await sock.requestPairingCode(n);
      entry.pairingCode = code;
      record.pairingCode = code;
      save();
      codeResolve(code);
      if (typeof options.onCode === 'function') {
        await Promise.resolve(options.onCode(code, n)).catch(() => {});
      }
    } catch (err) {
      codeReject(err);
      if (typeof options.onError === 'function') {
        await Promise.resolve(options.onError(err, n)).catch(() => {});
      }
    }
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting' && !state.creds.registered && !entry.pairingRequested) {
      setTimeout(() => requestCode().catch(() => {}), 2000);
    }

    if (connection === 'open') {
      entry.attempts = 0;
      entry.reconnecting = false;
      entry.registered = true;
      record.jid = sock.user?.id || '';
      record.enabled = true;
      record.connectedAt = Date.now();
      save();
      readyResolve(sock);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (entry.stopping) return;

      if (statusCode === DisconnectReason.loggedOut) {
        entry.stopping = true;
        running.delete(n);
        record.enabled = false;
        record.jid = '';
        save();
        readyReject(new Error('El subbot cerró sesión desde WhatsApp'));
        codeReject(new Error('El subbot cerró sesión desde WhatsApp'));
        return;
      }

      if (entry.reconnecting) return;
      entry.reconnecting = true;
      entry.attempts += 1;
      running.delete(n);
      const delay = Math.min(20000, 1500 * entry.attempts);
      await sleep(delay);
      if (entry.stopping) return;
      startSubbot(n, options).catch((err) => {
        console.error(`[SUBBOT:${n}] no se pudo reconectar:`, err?.message || err);
      });
    }
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
    codePromise,
    readyPromise,
  };
}

export async function startSavedSubbots() {
  if (!Array.isArray(db().subbots)) db().subbots = [];
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
