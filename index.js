import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import qrcode from 'qrcode-terminal';
import { config, ROOT } from './config.js';
import { db, save, saveNow } from './lib/db.js';
import { cleanTmp, formatDate, jidToNumber, numberToJid, sleep, withWatermark } from './lib/utils.js';
import { commands } from './commands/index.js';
import { handleMessage, handleDeletedMessage, messageCache } from './handlers/message.js';
import { handleGroupParticipants, handleGroupIconChange } from './handlers/group.js';
import { invalidateGroupMeta, trackSent } from './lib/state.js';
import { startSavedSubbots } from './lib/subbots.js';
import { resumeSpamIfEnabled } from './lib/spam.js';
import { resumeReminders } from './lib/reminders.js';
import { buildChannelUpdate, channelAutoUpdates, refreshChannelName, sendToChannel } from './lib/channel.js';
import { BOT_UPDATES, updatesId } from './lib/updates.js';

globalThis.__ZENITSU_START__ = Date.now();
globalThis.__ZENITSU_COMMANDS__ = commands;

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

let sock = null;
let reconnectAttempts = 0;
let pairingRequested = false;
let pairingFailed = false;
let lastPairingAt = 0;
let reconnecting = false;
let loggedOut = false;
let subbotsStarted = false;
// El aviso al owner (comandos nuevos + actualizaciones) se envía UNA sola
// vez por arranque del bot — no en cada reconexión de WhatsApp.
let ownerNotified = false;

// ─── Guardián de logs de PM2 ───────────────────────────────────────────────
// En un teléfono el espacio es limitado: si los logs del bot crecen sin
// control pueden llenar el almacenamiento y tumbar TODO el sistema.
// Cada 30 min se revisan y, si pasan de 5 MB, se conservan solo los últimos
// 64 KB (lo suficiente para diagnosticar) y el resto se descarta.
function guardPm2Logs() {
  const home = process.env.HOME || '/data/data/com.termux/files/home';
  const files = [
    `${home}/.pm2/logs/zenitsu-bot-out.log`,
    `${home}/.pm2/logs/zenitsu-bot-error.log`,
  ];
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      if (stat.size < 5 * 1024 * 1024) continue;
      const keep = 64 * 1024;
      const fd = fs.openSync(file, 'r');
      const start = Math.max(0, stat.size - keep);
      const chunk = Buffer.alloc(stat.size - start);
      fs.readSync(fd, chunk, 0, chunk.length, start);
      fs.closeSync(fd);
      // pm2 abre los logs en modo append: tras truncar, sigue escribiendo al
      // final del archivo nuevo sin corromper nada.
      fs.truncateSync(file, 0);
      fs.appendFileSync(file, chunk);
      console.log(`🧹 Log truncado: ${file} (${Math.round(stat.size / 1024)} KB → 64 KB)`);
    } catch {}
  }
}
setInterval(guardPm2Logs, 30 * 60 * 1000).unref();
guardPm2Logs();

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
  console.log(`  💧 Marca:     ${config.watermark || 'ninguna (solo banner del canal)'}`);
  console.log(`  🕒 Fecha:     ${formatDate(new Date())}`);
  console.log('────────────────────────────────────────────────\n');
}

async function requestPairingCode(authState) {
  if (pairingRequested || authState.creds.registered) return;
  pairingRequested = true;
  lastPairingAt = Date.now();
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

// ─── Respaldo de sesión ────────────────────────────────────────────────────
// Copia la sesión al conectarse y la restaura si la carpeta "session" se
// pierde, para no tener que pedir código de vinculación otra vez.
const SESSION_BACKUP_DIR = path.join(ROOT, 'session-backup');

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(from, to);
    else fs.copyFileSync(from, to);
  }
}

function backupSession() {
  try {
    if (!fs.existsSync(path.join(config.sessionDir, 'creds.json'))) return;
    fs.rmSync(SESSION_BACKUP_DIR, { recursive: true, force: true });
    copyDirSync(config.sessionDir, SESSION_BACKUP_DIR);
    console.log('💾 Sesión respaldada en "session-backup".');
  } catch (err) {
    console.error('[RESPALDO]', err?.message || err);
  }
}

function restoreSessionIfPossible() {
  if (process.env.ZENITSU_FRESH === '1') return false;
  const backupCreds = path.join(SESSION_BACKUP_DIR, 'creds.json');
  const sessionCreds = path.join(config.sessionDir, 'creds.json');
  try {
    if (!fs.existsSync(backupCreds)) return false;
    const backup = JSON.parse(fs.readFileSync(backupCreds, 'utf8'));
    if (!backup.registered) return false;
    if (fs.existsSync(sessionCreds)) {
      const current = JSON.parse(fs.readFileSync(sessionCreds, 'utf8'));
      if (current.registered) return false;
    }
    fs.rmSync(config.sessionDir, { recursive: true, force: true });
    copyDirSync(SESSION_BACKUP_DIR, config.sessionDir);
    console.log('🔄 La sesión se había perdido: restaurada desde "session-backup".');
    return true;
  } catch (err) {
    console.error('[RESTAURAR]', err?.message || err);
    return false;
  }
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

    if (qr && !state.creds.registered) {
      // El QR solo llega cuando el socket ya está listo: es el momento
      // seguro para pedir el código de vinculación (si no, WhatsApp
      // cierra la conexión con 401 Connection Failure).
      if (!pairingRequested && !pairingFailed && config.pairingNumber && process.env.USE_QR !== '1') {
        requestPairingCode(state).catch((e) => console.error('Pairing:', e.message));
      } else if (
        !pairingFailed &&
        config.pairingNumber &&
        process.env.USE_QR !== '1' &&
        pairingRequested &&
        Date.now() - lastPairingAt > 55000
      ) {
        // El código caduca (~60s): pide uno nuevo automáticamente.
        pairingRequested = false;
        requestPairingCode(state).catch((e) => console.error('Pairing:', e.message));
      } else if (pairingFailed || process.env.USE_QR === '1' || !config.pairingNumber) {
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

      backupSession();

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

      // Reanuda el spam programado si el owner lo dejó activo.
      try {
        if (resumeSpamIfEnabled(sock)) {
          console.log('📣 Spam programado reanudado.');
        }
      } catch {}

      // Reanuda los recordatorios pendientes de los usuarios.
      try {
        const r = resumeReminders(sock);
        if (r.scheduled || r.discarded) {
          console.log(`⏰ Recordatorios: ${r.scheduled} activos, ${r.discarded} descartados.`);
        }
      } catch {}

      try {
        if (!ownerNotified) {
          ownerNotified = true; // no repetir en las reconexiones
          // Nombre del canal (para el banner "Reenviado desde..." de los mensajes).
          refreshChannelName(sock).catch(() => {});
          const prefix = db().prefix || config.prefix;
          // Actualizaciones vigentes: {prefix} se reemplaza por el prefijo real.
          // El id se calcula sobre la lista CRUDA (sin reemplazar) para que sea
          // estable aunque cambie el prefijo del bot.
          const updates = BOT_UPDATES.map((u) => u.replace(/\{prefix\}/g, prefix));
          const updateId = updatesId(BOT_UPDATES);
          const isNew = db().lastUpdateNotice?.id !== updateId;

          // ── Aviso al owner: siempre avisa que está conectado.
          //    Las actualizaciones solo van si son NUEVAS (nunca repite viejas).
          const ownerNumber = jidToNumber(db().owners?.[0] || config.ownerNumber);
          const botNumber = jidToNumber(sock.user?.id);
          if (ownerNumber && ownerNumber !== botNumber) {
            const header =
              `⚡ *ZENITSU BOT CONECTADO*\n\n` +
              `🤖 Bot: ${db().botName || config.botName}\n` +
              `⚙️ Prefijo: ${prefix}\n` +
              `📦 Comandos: ${commands.length}\n`;
            const body = isNew
              ? `\n🆕 *NUEVAS ACTUALIZACIONES:*\n` +
                updates.map((u) => `▸ ${u}`).join('\n') +
                `\n\n_${prefix}menu para verlo todo ⚡_`
              : `\n✅ _Todo en orden, sin novedades._ ⚡`;
            const sent = await sock.sendMessage(numberToJid(ownerNumber), {
              text: withWatermark(header + body),
            });
            trackSent(sent);
          }

          // ── Canal: solo publica si hay actualizaciones NUEVAS.
          //    Sin novedades no spamea el canal.
          const channelNew = db().lastChannelNotice?.id !== updateId;
          if (channelNew && channelAutoUpdates()) {
            const posted = await sendToChannel(
              sock,
              buildChannelUpdate({ prefix, totalCommands: commands.length, updates }),
            );
            if (posted) {
              console.log('📢 Actualización publicada en el canal.');
              db().lastChannelNotice = { id: updateId, at: Date.now() };
              save();
            }
          }

          // Marca las novedades como avisadas al owner (aunque el canal esté
          // apagado, no se repiten en el próximo reinicio).
          if (isNew) {
            db().lastUpdateNotice = { id: updateId, at: Date.now() };
            save();
          }
        }
      } catch {}
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'desconocido';
      console.log(`\n⚠️ Conexión cerrada (${statusCode || '?'}): ${reason}`);

      // Si aún no está vinculado (código caducado o corte), permite pedir
      // un código nuevo al reconectar en vez de quedarse esperando.
      if (!state.creds.registered) {
        pairingRequested = false;
        pairingFailed = false;
      }

      if (statusCode === DisconnectReason.loggedOut && state.creds.registered) {
        console.log('🚪 La sesión fue cerrada desde WhatsApp.');
        console.log('   Vincula de nuevo con:  RESET=1 bash pair.sh');
        console.log('   No se reinicia solo, para no gastar códigos en bucle.');
        process.exit(78); // 78 = PM2 y start.sh NO reinician el bot.
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
      // Aviso de cambio de imagen del grupo (stub GROUP_CHANGE_ICON).
      try {
        if (msg?.messageStubType === 22) await handleGroupIconChange(sock, msg);
      } catch {}
      handleMessage(sock, msg).catch((err) => {
        console.error('[MSG]', err?.message || err);
      });
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const item of updates) {
      if (item?.update?.message === null) {
        // handleDeletedMessage puede devolver undefined (sin anti-delete o sin
        // caché): Promise.resolve evita el TypeError "reading 'catch'".
        Promise.resolve(handleDeletedMessage(sock, item.key)).catch(() => {});
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

let bootAttempts = 0;
function boot() {
  restoreSessionIfPossible();
  start().catch((err) => {
    bootAttempts += 1;
    console.error(`❌ No se pudo iniciar ZENITSU BOT: ${err?.message || err}`);
    if (bootAttempts >= 5) {
      console.error('   Demasiados intentos seguidos. Revisa tu conexión a internet.');
      process.exit(1);
    }
    console.log(`⏳ Reintentando en 10s (intento ${bootAttempts + 1} de 5)...`);
    setTimeout(boot, 10000);
  });
}
boot();
