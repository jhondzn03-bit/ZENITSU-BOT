import { db, save } from './db.js';
import { withWatermark } from './utils.js';

// ─── Recordatorios programados (.remind) ──────────────────────────────────
// El usuario pide ".remind 30m tomar agua" y el bot le avisa a los 30 min.
// Persisten en la DB: si el bot se reinicia, los recordatorios futuros se
// reprograman solos y los vencidos se envían de inmediato.

const MIN_MS = 10 * 1000; // mínimo: 10 segundos
const MAX_MS = 30 * 24 * 60 * 60 * 1000; // máximo: 30 días

let currentSock = null;
const timers = new Map(); // id → setTimeout

function reminders() {
  const data = db();
  if (!Array.isArray(data.reminders)) data.reminders = [];
  return data.reminders;
}

// Convierte "30m", "2h", "1d", "1h30m" a milisegundos.
export function parseDuration(text) {
  const matches = String(text || '')
    .toLowerCase()
    .match(/(\d+)\s*(seg|segundo|s|min|minuto|m|h|hora|d|dia|días|day)/g);
  if (!matches) return 0;
  let ms = 0;
  for (const part of matches) {
    const n = Number(part.match(/\d+/)[0]);
    const unit = part.replace(/[\d\s]/g, '');
    if (unit === 's' || unit === 'seg' || unit === 'segundo') ms += n * 1000;
    else if (unit === 'm' || unit === 'min' || unit === 'minuto') ms += n * 60 * 1000;
    else if (unit === 'h' || unit === 'hora') ms += n * 60 * 60 * 1000;
    else ms += n * 24 * 60 * 60 * 1000; // d / dia / día / day
  }
  return ms;
}

export function humanDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} segundo(s)`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minuto(s)`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hora(s)`;
  return `${Math.floor(h / 24)} día(s)`;
}

function nextId() {
  return reminders().reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
}

function fire(id) {
  const list = reminders();
  const index = list.findIndex((r) => r.id === id);
  if (index === -1) return;
  const [r] = list.splice(index, 1);
  save();
  timers.delete(id);
  if (currentSock && r.chat) {
    const text = withWatermark(
      `⏰ *RECORDATORIO*\n\n📝 ${r.text}\n\n` +
        `_Te lo pedí recordar hace ${humanDuration(Date.now() - (r.at - r.duration))}._ 🌩️`,
    );
    currentSock.sendMessage(r.chat, { text }).catch(() => {});
    if (r.sender && r.sender !== r.chat) {
      // Si se pidió en un grupo, también se le recuerda al privado.
      currentSock.sendMessage(r.sender, { text }).catch(() => {});
    }
  }
}

function schedule(r, delay) {
  const id = setTimeout(() => fire(r.id), Math.max(delay, 0));
  timers.set(r.id, id);
}

// Crea un recordatorio. Devuelve la entrada creada.
export function addReminder(chat, sender, durationMs, text) {
  if (!Number.isFinite(durationMs) || durationMs < MIN_MS) {
    throw new Error('el tiempo mínimo es 10 segundos');
  }
  if (durationMs > MAX_MS) {
    throw new Error('el tiempo máximo es 30 días');
  }
  const entry = {
    id: nextId(),
    chat,
    sender,
    text: String(text || '').slice(0, 500),
    at: Date.now() + durationMs,
    duration: durationMs,
    createdAt: Date.now(),
  };
  reminders().push(entry);
  save();
  schedule(entry, durationMs);
  return entry;
}

export function listReminders(sender) {
  const now = Date.now();
  return reminders()
    .filter((r) => !sender || r.sender === sender)
    .map((r) => ({ ...r, remaining: r.at - now }));
}

export function removeReminder(id, sender) {
  const list = reminders();
  const index = list.findIndex((r) => r.id === id && (!sender || r.sender === sender));
  if (index === -1) return null;
  const [removed] = list.splice(index, 1);
  save();
  const t = timers.get(removed.id);
  if (t) {
    clearTimeout(t);
    timers.delete(removed.id);
  }
  return removed;
}

// Al arrancar el bot: reprograma los pendientes y dispara los vencidos.
export function resumeReminders(sock) {
  currentSock = sock;
  const list = reminders();
  const now = Date.now();
  let scheduled = 0;
  let fired = 0;
  // Limpia primero los que quedaron huérfanos de ejecuciones anteriores.
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  for (const r of list) {
    const delay = r.at - now;
    if (delay <= -10 * 60 * 1000) {
      // Vencido hace más de 10 minutos: se descarta (ya no tiene sentido).
      fired++;
    } else {
      schedule(r, Math.max(delay, 0));
      scheduled++;
    }
  }
  if (fired) {
    db().reminders = list.filter((r) => r.at - now > -10 * 60 * 1000);
    save();
  }
  return { scheduled, discarded: fired };
}
