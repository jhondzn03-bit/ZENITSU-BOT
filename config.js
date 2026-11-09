import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));

const OWNER = '50375638328';

export const config = {
  // ─── Identidad ────────────────────────────────────────────────────────────
  botName: 'ZENITSU BOT',
  version: '2.0.0',
  watermark: '> ZENITSU BOT',

  // ─── Dueño ────────────────────────────────────────────────────────────────
  ownerNumber: OWNER,
  owners: [OWNER, '50369635962'],

  // ─── Prefijo ──────────────────────────────────────────────────────────────
  prefix: '.',

  // ─── Vinculación ──────────────────────────────────────────────────────────
  // El bot pide un código de 8 dígitos para este número por defecto.
  // Número que se vinculará como bot (recibe el código en WhatsApp).
  pairingNumber: process.env.PAIRING_NUMBER || '50369635962',
  // Si quieres un código fijo de 8 dígitos, ponlo aquí (ej: '12345678').
  // Déjalo vacío para generar uno aleatorio en cada vinculación.
  pairingCode: process.env.PAIRING_CODE || '',

  // ─── Rutas ────────────────────────────────────────────────────────────────
  sessionDir: path.join(ROOT, 'session'),
  databaseDir: path.join(ROOT, 'database'),
  assetsDir: path.join(ROOT, 'assets'),
  tmpDir: path.join(ROOT, 'tmp'),
  banner: path.join(ROOT, 'assets', 'banner.jpg'),

  // ─── Comportamiento ───────────────────────────────────────────────────────
  timezone: 'America/El_Salvador',
  maxWarns: 3,
  maxMessageCache: 400,
  maxFileSize: 120 * 1024 * 1024,

  // ─── Enlaces ──────────────────────────────────────────────────────────────
  repo: 'https://github.com/jhondzn03-bit/ZENITSU-BOT',
  menuLink: '',
  support: 'https://wa.me/50375638328',
};

export default config;
