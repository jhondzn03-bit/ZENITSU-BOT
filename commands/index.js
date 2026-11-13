import general from './general.js';
import owner from './owner.js';
import admin from './admin.js';
import tools from './tools.js';
import downloads from './downloads.js';
import ai from './ai.js';
import anime from './anime.js';
import fun from './fun.js';
import economy from './economy.js';
import info from './info.js';
import extra from './extra.js';
import spam from './spam.js';
import newstuff from './newstuff.js';
import channel from './channel.js';
import opencode from './opencode.js';
import customcmd from './customcmd.js';
import search from './search.js';
import media from './media.js';

const modules = [general, owner, admin, tools, downloads, ai, anime, fun, economy, info, extra, spam, newstuff, channel, opencode, customcmd, search, media];

export const commands = modules.flat().filter((c) => c && c.name);

export const commandMap = new Map();

// 1) Primero TODOS los nombres reales: un comando nunca puede quedar tapado
//    por el alias de otro (ej: .repo vs el alias "repo" de .gitclone).
for (const cmd of commands) {
  if (commandMap.has(cmd.name)) {
    console.warn(`[CMD] Comando duplicado: ${cmd.name}`);
  }
  commandMap.set(cmd.name, cmd);
}

// 2) Después los alias, normalizados a minúsculas (el router busca en
//    minúsculas: un alias como "soloAdmin" nunca coincidía).
const aliasOwner = new Map();
for (const cmd of commands) {
  for (const raw of cmd.aliases || []) {
    const alias = String(raw || '').trim().toLowerCase();
    if (!alias) continue;
    if (commandMap.has(alias)) {
      if (commandMap.get(alias) !== cmd) {
        console.warn(`[CMD] Alias "${alias}" de .${cmd.name} choca con .${alias}; se ignora`);
      }
      continue;
    }
    if (aliasOwner.has(alias)) {
      const other = aliasOwner.get(alias);
      if (other !== cmd) {
        console.warn(`[CMD] Alias duplicado "${alias}": .${other.name} y .${cmd.name}; se queda .${other.name}`);
      }
      continue;
    }
    aliasOwner.set(alias, cmd);
    commandMap.set(alias, cmd);
  }
}

export default commands;
