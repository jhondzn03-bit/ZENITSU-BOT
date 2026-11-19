#!/usr/bin/env node
/* Utilidad de cifrado del respaldo local de ZENITSU BOT.
 *
 * Formato del archivo .enc:
 *   [magic 12 bytes "ZENBACKUP01"][salt 16][iv 12][authTag 16][ciphertext]
 *   AES-256-GCM, llave derivada con scrypt(password, salt, 32).
 *
 * Uso:
 *   node backup/zenbackup.js encrypt <entrada> <salida.enc> [contraseña]
 *   node backup/zenbackup.js decrypt <entrada.enc> <salida> [contraseña]
 *
 * Si no se pasa la contraseña como argumento, se usa ZEN_BACKUP_PASSWORD o
 * se solicita por consola (sin eco).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline';

const MAGIC = Buffer.from('ZENBACKUP01', 'utf8');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function getPassword(argvPassword) {
  if (argvPassword) return argvPassword;
  if (process.env.ZEN_BACKUP_PASSWORD) return process.env.ZEN_BACKUP_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Contraseña del respaldo: ', (value) => {
      rl.close();
      resolve(value);
    });
  });
}

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function encrypt(inputPath, outputPath, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  const input = fs.readFileSync(inputPath);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([MAGIC, salt, iv, tag, ciphertext]);
  fs.writeFileSync(outputPath, out, { mode: 0o600 });
  console.log(`Cifrado: ${inputPath} -> ${outputPath} (${out.length} bytes)`);
}

function decrypt(inputPath, outputPath, password) {
  const raw = fs.readFileSync(inputPath);
  const magic = raw.subarray(0, MAGIC.length);
  if (!magic.equals(MAGIC)) throw new Error('Archivo inválido: cabecera incorrecta');
  let offset = MAGIC.length;
  const salt = raw.subarray(offset, offset + SALT_LEN); offset += SALT_LEN;
  const iv = raw.subarray(offset, offset + IV_LEN); offset += IV_LEN;
  const tag = raw.subarray(offset, offset + TAG_LEN); offset += TAG_LEN;
  const ciphertext = raw.subarray(offset);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  fs.writeFileSync(outputPath, plain, { mode: 0o600 });
  console.log(`Descifrado: ${inputPath} -> ${outputPath} (${plain.length} bytes)`);
}

const [action, input, output, password] = process.argv.slice(2);
if (!['encrypt', 'decrypt'].includes(action) || !input || !output) {
  console.error('Uso: node zenbackup.js encrypt|decrypt <entrada> <salida> [contraseña]');
  process.exit(1);
}

try {
  const pass = await getPassword(password);
  if (action === 'encrypt') encrypt(input, output, pass);
  else decrypt(input, output, pass);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
