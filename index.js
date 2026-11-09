import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import qrcode from 'qrcode-terminal';
import { config } from './config.js';
import { db, saveNow } from './lib/db.js';
import { cleanTmp, formatDate, jidToNumber, numberToJid, sleep, withWatermark } from './lib/utils.js';
import { commands } from './commands/index.js';
import { handleMessage, handleDeletedMessage, messageCache } from './handlers/message.js';
import { handleGroupParticipants } from './handlers/group.js';
import { invalidateGroupMeta, trackSent } from './lib/state.js';
import { startSavedSubbots } from './lib/subbots.js';

globalThis.__ZENITSU_START__ = Date.now();
globalThis.__ZENITSU_COMMANDS__ = commands;

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

let sock = null;
let reconnectAttempts = 0;
let pairingRequested = false;
let pairingFailed = false;
let reconnecting = false;
let loggedOut = false;
let subbotsStarted = false;

function banner() {
  const store = db();
  console.log('\n');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        ⚡  Z E N I T S U   B O T  ⚡          ║');
  console.log('║        Respiración del Trueno v2.0           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  🤖 Bot:       ${store.botName || config.botName}`);
  console.log(`  👑 Owner:     +${store.owners?.[0] || config.ownerNumber}`);
  console.log(`  ⚙️  Prefijo:   ${store.prefix || config.prefix}`);
  console.log(`  📦 Comandos:  ${commands.length}`);
  console.log(`  💧 Marca:     ${config.watermark}`);
  console.log(`  🕒 Fecha:     ${formatDate(new Date())}`);
  console.log('────────────────────────────────────────────────\n');
}

async function requestPairingCode(authState) {
  if (pairingRequested || authState.creds.registered) return;
  pairingRequested = true;
  const phone = String(config.pairingNumber || config.ownerNumber || '').replace(/\D/g, '');
  if (!phone) {
    console.log('⚠️ No hay número para vincular. Usa PAIRING_NUMBER=503XXXXXXXX npm start');
    pairingFailed = true;
    return;
  }

  const useStandard = process.env.PAIRING_STANDARD === '1';
  const custom =
    config.pairingCode && /^[A-Za-z0-9]{8}$/.test(String(config.pairingCode))
      ? String(config.pairingCode).toUpperCase()
      : String(crypto.randomInt(10000000, 100000000));

  let code;
  try {
    // Código numérico de 8 dígitos (por defecto). Con PAIRING_STANDARD=1
    // se usa el código estándar de Baileys (letras y números).
    code = useStandard
      ? await sock.requestPairingCode(phone)
      : await sock.requestPairingCode(phone, custom);
  } catch (err) {
    console.log(`⚠️ No se pudo usar el código numérico (${err.message}). Intentando código estándar...`);
    try {
      code = await sock.requestPairingCode(phone);
    } catch (err2) {
      pairingFailed = true;
      console.log(`❌ No se pudo generar el código: ${err2.message}`);
      console.log('📷 Esperando QR de respaldo...');
      return;
    }
  }

  const pretty = `${code.slice(0, 4)}-${code.slice(4)}`;
  // Guarda el código para poder abrirlo rápido y, si Termux:API está
  // instalado, lo copia al portapapeles automáticamente.
  try {
    fs.writeFileSync('ultimo-codigo.txt', `${code}\n`);
  } catch {}
  try {
    spawnSync('termux-clipboard-set', [code], { stdio: 'ignore' });
  } catch {}
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║        🔗 VINCULA TU WHATSAPP 🔗             ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  📱 Número:  +${phone}`);
  console.log(`  🔢 Código:  ${code}   (${pretty})`);
  console.log('');
  console.log('  1. Abre WhatsApp en tu teléfono.');
  console.log('  2. Ve a Dispositivos vinculados > Vincular dispositivo.');
  console.log('  3. Elige "Vincular con número de teléfono".');
  console.log(`  4. Escribe el código de 8 dígitos: ${code}`);
  console.log('');
  console.log('  ⚠️  No compartas este código con nadie.');
  console.log('────────────────────────────────────────────────\n');
}

async function start() {
  if (loggedOut) return;
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined;
  }

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      const cached = messageCache.get(key?.id);
      if (cached?.body) return { conversation: cached.body };
      return undefined;
    },
  });

  globalThis.__ZENITSU_SOCK__ = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === 'connecting' && !state.creds.registered && !pairingRequested) {
      // Pequeña espera para que el socket esté listo.
      setTimeout(() => requestPairingCode(state).catch((e) => console.error('Pairing:', e.message)), 1800);
    }

    if (qr && !state.creds.registered) {
      if (pairingFailed || process.env.USE_QR === '1' || !config.pairingNumber) {
        console.log('\n📷 Escanea este código QR desde WhatsApp > Dispositivos vinculados:\n');
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      reconnecting = false;
      pairingFailed = false;
      console.log('\n╔══════════════════════════════════════════════╗');
      console.log('║       ✅ ZENITSU BOT CONECTADO ✅            ║');
      console.log('╚══════════════════════════════════════════════╝');
      console.log(`  🤖 ${db().botName || config.botName} está en línea.`);
      console.log(`  ⚡ Escribe ${db().prefix || config.prefix}menu en WhatsApp.`);
      console.log(`  🕒 ${formatDate(new Date())}\n`);

      try {
        await sock.sendPresenceUpdate('available');
      } catch {}

      // Reconecta los subbots ya vinculados (no pide códigos nuevos).
      if (!subbotsStarted) {
        subbotsStarted = true;
        setTimeout(() => {
          startSavedSubbots().catch((err) => {
            console.error('[SUBBOTS]', err?.message || err);
          });
        }, 2500);
      }

      try {
        const ownerNumber = jidToNumber(db().owners?.[0] || config.ownerNumber);
        const botNumber = jidToNumber(sock.user?.id);
        if (ownerNumber && ownerNumber !== botNumber) {
          const sent = await sock.sendMessage(numberToJid(ownerNumber), {
            text: withWatermark(
              `⚡ *ZENITSU BOT CONECTADO*\n\n🤖 Bot: ${db().botName || config.botName}\n⚙️ Prefijo: ${db().prefix || config.prefix}\n📦 Comandos: ${commands.length}\n\n_El trueno ha despertado._`,
            ),
          });
          trackSent(sent);
        }
      } catch {}
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'desconocido';
      console.log(`\n⚠️ Conexión cerrada (${statusCode || '?'}): ${reason}`);

      if (statusCode === DisconnectReason.loggedOut) {
        loggedOut = true;
        console.log('🚪 La sesión fue cerrada desde WhatsApp.');
        console.log('   Borra la carpeta "session" y vuelve a iniciar para vincular de nuevo.');
        console.log('   Ejemplo: rm -rf session && npm start\n');
        return;
      }

      if (reconnecting) return;
      reconnecting = true;
      reconnectAttempts++;
      const delay = Math.min(20000, 1200 * reconnectAttempts);
      console.log(`🔄 Reconectando en ${Math.round(delay / 1000)}s... (intento ${reconnectAttempts})\n`);
      await sleep(delay);
      start().catch((err) => {
        console.error('Error al reconectar:', err.message);
        reconnecting = false;
      });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      handleMessage(sock, msg).catch((err) => {
        console.error('[MSG]', err?.message || err);
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
      console.error('[GROUP]', err?.message || err);
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

  return sock;
}

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT]', err?.stack || err?.message || err);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED]', err?.stack || err?.message || err);
});

process.on('SIGINT', () => {
  console.log('\n⚡ Cerrando ZENITSU BOT...');
  saveNow();
  process.exit(0);
});
process.on('SIGTERM', () => {
  saveNow();
  process.exit(0);
});

banner();
cleanTmp(0);
setInterval(() => cleanTmp(30 * 60 * 1000), 30 * 60 * 1000).unref?.();

fs.mkdirSync(config.sessionDir, { recursive: true });
fs.mkdirSync(config.tmpDir, { recursive: true });

start().catch((err) => {
  console.error('❌ No se pudo iniciar ZENITSU BOT:', err?.message || err);
  process.exitCode = 1;
});
