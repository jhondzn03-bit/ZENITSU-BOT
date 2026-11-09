export const CATEGORIES = {
  general: { title: 'GENERAL', emoji: '⚡' },
  owner: { title: 'OWNER', emoji: '👑' },
  admin: { title: 'ADMINISTRACIÓN', emoji: '🛡️' },
  tools: { title: 'HERRAMIENTAS', emoji: '🧰' },
  downloads: { title: 'DESCARGAS', emoji: '📥' },
  ai: { title: 'INTELIGENCIA ARTIFICIAL', emoji: '🤖' },
  anime: { title: 'ANIME', emoji: '🌸' },
  fun: { title: 'DIVERSIÓN', emoji: '🎲' },
  economy: { title: 'ECONOMÍA', emoji: '💰' },
  info: { title: 'INFORMACIÓN', emoji: '🌐' },
};

export const MENU_STYLES = {
  galactico: { label: 'Galáctico', emoji: '🌌', desc: 'Estrellas, planetas y estilo espacial.' },
  clasico: { label: 'Clásico', emoji: '⚡', desc: 'El estilo original de ZENITSU BOT.' },
  zenitsu: { label: 'Zenitsu', emoji: '🌩️', desc: 'Respiración del Trueno.' },
  neon: { label: 'Neón', emoji: '💜', desc: 'Brillos y colores intensos.' },
  minimal: { label: 'Minimal', emoji: '◾', desc: 'Limpio, corto y sin adornos.' },
  matrix: { label: 'Matrix', emoji: '🟩', desc: 'Verde digital estilo hacker.' },
};

export const DEFAULT_MENU_STYLE = 'galactico';

const MODE_NAMES = {
  public: 'Público',
  self: 'Privado (solo owner)',
  group: 'Solo grupos',
};

function formatUptime(ms = 0) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

function groupCommands(commands, isOwner) {
  const byCategory = new Map();
  for (const cmd of commands) {
    if (cmd.hidden) continue;
    if (cmd.category === 'owner' && !isOwner) continue;
    if (!byCategory.has(cmd.category)) byCategory.set(cmd.category, []);
    byCategory.get(cmd.category).push(cmd);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return byCategory;
}

function commandLines(list, prefix) {
  return list.map((cmd) => {
    const lock = cmd.owner ? ' 👑' : cmd.admin ? ' 🛡️' : '';
    return `│ ▸ ${prefix}${cmd.name}${lock}`;
  });
}

function buildGalactico(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '╭━━━━━━━━━━━━━━━━━━━━━╮',
    `   🌌 *${botName}* 🌌`,
    '   「 ɢᴀʟᴀxʏ ᴇᴅɪᴛɪᴏɴ 」',
    '╰━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `✨ Hola, *${pushName || 'Cazador Estelar'}*`,
    '┌─────── ✦ ───────┐',
    `│ ⚙️ Prefijo   ·  *${prefix}*`,
    `│ 📡 Modo      ·  *${MODE_NAMES[mode] || mode}*`,
    `│ 📦 Comandos  ·  *${totalCommands}*`,
    `│ ⏱️ Activo    ·  *${formatUptime(uptime)}*`,
    '└─────── ✦ ───────┘',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`✦ ───「 ${meta.emoji} ${meta.title} · ${list.length} 」─── ✦`);
    lines.push(...commandLines(list, prefix));
    lines.push('✦ ───────────────────────── ✦');
    lines.push('');
  }
  if (menuLink) {
    lines.push('🌠 *ENLACES*');
    lines.push(`▸ 🌐 ${menuLink}`);
    lines.push('');
  }
  lines.push('🌌 _El trueno viaja entre las estrellas._');
  lines.push(`_Usa ${prefix}help <comando> para más detalles._`);
  return lines.join('\n');
}

function buildClasico(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '╭━━━━━━━━━━━━━━━━━━━━━╮',
    `   ⚡ *${botName}* ⚡`,
    '   ʀᴇsᴘɪʀᴀᴄɪóɴ ᴅᴇʟ ᴛʀᴜᴇɴᴏ',
    '╰━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `👋 Hola, *${pushName || 'Cazador'}*`,
    '╭─「 ℹ️ INFO 」',
    `│ ⚙️ Prefijo   ·  *${prefix}*`,
    `│ 📡 Modo      ·  *${MODE_NAMES[mode] || mode}*`,
    `│ 📦 Comandos  ·  *${totalCommands}*`,
    `│ ⏱️ Activo    ·  *${formatUptime(uptime)}*`,
    '╰──────────────────────',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`╭─「 ${meta.emoji} ${meta.title} · ${list.length} 」`);
    lines.push(...commandLines(list, prefix));
    lines.push('╰──────────────────────');
    lines.push('');
  }
  if (menuLink) {
    lines.push('╭─「 🔗 ENLACES 」');
    lines.push(`│ 🌐 ${menuLink}`);
    lines.push('╰──────────────────────');
    lines.push('');
  }
  lines.push('⚡ *1ª Forma: Trueno y Relámpago*');
  lines.push(`_Escribe ${prefix}help <comando> para más detalles._`);
  return lines.join('\n');
}

function buildZenitsu(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '⚡🌩️━━━━━━━━━━━━━━━━━━🌩️⚡',
    `      *${botName}*`,
    '   「 雷の呼吸 · RESPIRACIÓN DEL TRUENO 」',
    '⚡🌩️━━━━━━━━━━━━━━━━━━🌩️⚡',
    '',
    `👺 Hola, *${pushName || 'Cazador'}*`,
    `⚡ Prefijo: *${prefix}*  |  📡 Modo: *${MODE_NAMES[mode] || mode}*`,
    `📦 Comandos: *${totalCommands}*  |  ⏱️ Activo: *${formatUptime(uptime)}*`,
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`⚡ ─「 ${meta.emoji} ${meta.title} · ${list.length} 」`);
    lines.push(...commandLines(list, prefix));
    lines.push('⚡ ─────────────────────');
    lines.push('');
  }
  if (menuLink) {
    lines.push(`🔗 ${menuLink}`);
    lines.push('');
  }
  lines.push('🌩️ *1ª Forma: Trueno y Relámpago*');
  lines.push(`_${prefix}help <comando> · Séptima Forma: Fuego de Trueno._`);
  return lines.join('\n');
}

function buildNeon(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '╔══════════════════════╗',
    `║  💜 *${botName}* 💜  ║`,
    '║    ＮＥＯＮ ＭＯＤＥ    ║',
    '╚══════════════════════╝',
    '',
    `🟣 *${pushName || 'Usuario'}*`,
    `⚙️ \`${prefix}\`  ·  📡 ${MODE_NAMES[mode] || mode}`,
    `📦 ${totalCommands} comandos  ·  ⏱️ ${formatUptime(uptime)}`,
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`▣ ${meta.emoji} *${meta.title}* (${list.length})`);
    lines.push(...commandLines(list, prefix).map((l) => l.replace('│', '┃')));
    lines.push('▣━━━━━━━━━━━━━━━━━━▣');
    lines.push('');
  }
  if (menuLink) lines.push(`🔗 ${menuLink}`, '');
  lines.push('💜 _El neón nunca duerme._');
  lines.push(`_${prefix}help <comando> para más detalles._`);
  return lines.join('\n');
}

function buildMinimal(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    `⚡ *${botName}*`,
    '',
    `Hola, ${pushName || 'Cazador'}`,
    `Prefijo ${prefix} · ${MODE_NAMES[mode] || mode} · ${totalCommands} comandos · ${formatUptime(uptime)}`,
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`*${meta.title}* (${list.length})`);
    lines.push(list.map((c) => `${prefix}${c.name}${c.owner ? '👑' : c.admin ? '🛡️' : ''}`).join(' · '));
    lines.push('');
  }
  if (menuLink) lines.push(`🔗 ${menuLink}`, '');
  lines.push(`_${prefix}help <comando>_`);
  return lines.join('\n');
}

function buildMatrix(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '🟩▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓🟩',
    `   🟩 *${botName}* 🟩`,
    '   「 M A T R I X 」',
    '🟩▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓🟩',
    '',
    `> Hola, *${pushName || 'Neo'}*`,
    `> Prefijo: ${prefix}`,
    `> Modo: ${MODE_NAMES[mode] || mode}`,
    `> Comandos: ${totalCommands}`,
    `> Activo: ${formatUptime(uptime)}`,
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`[ ${meta.emoji} ${meta.title} · ${list.length} ]`);
    lines.push(...commandLines(list, prefix).map((l) => l.replace('│', '>')));
    lines.push('[ ─────────────────────── ]');
    lines.push('');
  }
  if (menuLink) lines.push(`> Enlace: ${menuLink}`, '');
  lines.push('> _Sigue al conejo blanco._');
  lines.push(`> _${prefix}help <comando>_`);
  return lines.join('\n');
}

const STYLE_BUILDERS = {
  galactico: buildGalactico,
  clasico: buildClasico,
  zenitsu: buildZenitsu,
  neon: buildNeon,
  minimal: buildMinimal,
  matrix: buildMatrix,
};

export function buildMenu({
  commands,
  prefix,
  botName,
  pushName,
  isOwner,
  mode,
  uptime,
  totalCommands,
  menuLink,
  style = DEFAULT_MENU_STYLE,
}) {
  const byCategory = groupCommands(commands, isOwner);
  const render = STYLE_BUILDERS[style] || STYLE_BUILDERS[DEFAULT_MENU_STYLE];
  return render(
    { prefix, botName, pushName, mode, uptime, totalCommands, menuLink },
    byCategory,
  );
}

export function buildCommandHelp(cmd, prefix) {
  const meta = CATEGORIES[cmd.category] || CATEGORIES.general;
  const lines = [
    `${meta.emoji} *${prefix}${cmd.name}*`,
    '',
    `📝 ${cmd.desc || 'Sin descripción.'}`,
    `📂 Categoría: ${meta.title}`,
  ];
  if (cmd.usage) lines.push(`💡 Uso: ${prefix}${cmd.usage.replace(/^\S+/, cmd.name)}`);
  if (cmd.aliases?.length) lines.push(`🔁 Alias: ${cmd.aliases.map((a) => prefix + a).join(', ')}`);
  if (cmd.owner) lines.push('👑 Solo el owner.');
  if (cmd.admin) lines.push('🛡️ Solo administradores del grupo.');
  if (cmd.group) lines.push('👥 Solo funciona en grupos.');
  if (cmd.botAdmin) lines.push('🤖 El bot debe ser administrador.');
  return lines.join('\n');
}
