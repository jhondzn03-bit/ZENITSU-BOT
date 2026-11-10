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

const modules = [general, owner, admin, tools, downloads, ai, anime, fun, economy, info, extra, spam, newstuff, channel, opencode];

export const commands = modules.flat().filter((c) => c && c.name);

export const commandMap = new Map();

for (const cmd of commands) {
  if (commandMap.has(cmd.name)) {
    console.warn(`[CMD] Comando duplicado: ${cmd.name}`);
  }
  commandMap.set(cmd.name, cmd);
  for (const alias of cmd.aliases || []) {
    if (!commandMap.has(alias)) commandMap.set(alias, cmd);
  }
}

export default commands;
