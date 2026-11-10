export const CATEGORIES = {
  general: { title: 'GENERAL', emoji: '⚡' },
  subbots: { title: 'SUBBOTS', emoji: '🤖' },
  owner: { title: 'OWNER', emoji: '👑' },
  admin: { title: 'ADMINISTRACIÓN', emoji: '🛡️' },
  tools: { title: 'HERRAMIENTAS', emoji: '🧰' },
  downloads: { title: 'DESCARGAS', emoji: '📥' },
  ai: { title: 'INTELIGENCIA ARTIFICIAL', emoji: '🤖' },
  anime: { title: 'ANIME', emoji: '🌸' },
  nsfw: { title: 'NSFW +18', emoji: '🔥' },
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
  diamante: { label: 'Diamante', emoji: '💎', desc: 'Lujo y brillo elegante.' },
  sakura: { label: 'Sakura', emoji: '🌸', desc: 'Flores japonesas y primavera.' },
  oceano: { label: 'Océano', emoji: '🌊', desc: 'Profundidad azul marina.' },
  fuego: { label: 'Fuego', emoji: '🔥', desc: 'Llamas y calor del infierno.' },
  cyber: { label: 'Cyber', emoji: '🦾', desc: 'Cyberpunk, tecnología futurista.' },
  hielo: { label: 'Hielo', emoji: '❄️', desc: 'Frío polar y cristal congelado.' },
};

export const DEFAULT_MENU_STYLE = 'galactico';

// Categorías que solo los subbots PREMIUM pueden usar (debe coincidir con
// config.premiumCategories). Se duplica aquí para no crear import circular.
// Vacío = todo desbloqueado para todos los subbots.
export const PREMIUM_CATEGORIES = [];

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

// Rejilla de dos columnas alineadas: el menú queda la mitad de largo y se
// ve moderno. El candado (👑/🛡️) va pegado al nombre que marca.
function commandGrid(list, prefix) {
  const cells = list.map((cmd) => `${prefix}${cmd.name}${cmd.owner ? '👑' : cmd.admin ? '🛡️' : ''}`);
  const width = Math.max(...cells.map((c) => c.length)) + 3;
  const lines = [];
  for (let i = 0; i < cells.length; i += 2) {
    const left = cells[i].padEnd(width);
    const right = i + 1 < cells.length ? `▸ ${cells[i + 1]}` : '';
    lines.push(`│ ▸ ${left}${right}`.trimEnd());
  }
  return lines;
}

// Letras espaciadas para el título ("ZENITSU BOT" → "Z E N I T S U  B O T").
function spacedName(name = '') {
  const clean = String(name).trim();
  if (!clean || clean.length > 16) return clean;
  return clean.split('').join(' ');
}

function buildGalactico(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
    `   ⚡ *${spacedName(botName) || botName}* ⚡`,
    '      ✦ ɢᴀʟᴀxʏ ᴇᴅɪᴛɪᴏɴ ✦',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `  ✨ Bienvenido, *${pushName || 'Cazador Estelar'}* ✨`,
    '',
    '╭─「 🌌 TU NAVE 」',
    `│ 👤 Piloto    ·  *${pushName || 'Desconocido'}*`,
    `│ ⚙️ Prefijo   ·  *${prefix}*`,
    `│ 📡 Modo      ·  *${MODE_NAMES[mode] || mode}*`,
    `│ 📦 Comandos  ·  *${totalCommands}*`,
    `│ ⏱️ En vuelo  ·  *${formatUptime(uptime)}*`,
    '╰───────────────────────────',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`╭─「 ${meta.emoji} ${meta.title} · ${list.length} 」`);
    lines.push(...commandGrid(list, prefix));
    lines.push('╰───────────────────────────');
    lines.push('');
  }
  if (menuLink) {
    lines.push('╭─「 🌠 ENLACES 」');
    lines.push(`│ ▸ 🌐 ${menuLink}`);
    lines.push('╰───────────────────────────');
    lines.push('');
  }
  lines.push('✦ ───── ✦ ───── ✦ ───── ✦');
  lines.push('🌌 _El trueno viaja entre las estrellas._');
  lines.push(`💡 Detalles de un comando: *${prefix}help <comando>*`);
  lines.push(`🎨 Otros diseños: *${prefix}setmenu lista*`);
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
    lines.push(...commandGrid(list, prefix));
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
    lines.push(...commandGrid(list, prefix));
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
    lines.push(...commandGrid(list, prefix).map((l) => l.replace('│', '┃')));
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
    lines.push(...commandGrid(list, prefix).map((l) => l.replace('│', '>')));
    lines.push('[ ─────────────────────── ]');
    lines.push('');
  }
  if (menuLink) lines.push(`> Enlace: ${menuLink}`, '');
  lines.push('> _Sigue al conejo blanco._');
  lines.push(`> _${prefix}help <comando>_`);
  return lines.join('\n');
}

// ── 💎 Diamante ────────────────────────────────────────────────────────────
function buildDiamante(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '╔════ ❖ ══════════════ ❖ ════╗',
    `      💎 *${botName}* 💎`,
    '     ᴅɪᴀᴍᴀɴᴛᴇ ᴇᴅɪᴛɪᴏɴ',
    '╚════ ❖ ══════════════ ❖ ════╝',
    '',
    `👑 Un placer servirle, *${pushName || 'estimado'}*`,
    '',
    '╔─「 💠 SUITE VIP 」',
    `║ 👤 Huésped  ·  *${pushName || 'Invitado'}*`,
    `║ ⚙️ Prefijo ·  *${prefix}*`,
    `║ 📡 Modo    ·  *${MODE_NAMES[mode] || mode}*`,
    `║ 📦 Comandos · *${totalCommands}*`,
    `║ ⏱️ Servicio · *${formatUptime(uptime)}*`,
    '╚──────────────────────────',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`╔─「 ${meta.emoji} ${meta.title} · ${list.length} 」`);
    lines.push(...commandGrid(list, prefix));
    lines.push('╚──────────────────────────');
    lines.push('');
  }
  if (menuLink) {
    lines.push(`🔗 ${menuLink}`, '');
  }
  lines.push('❖ ───── ❖ ───── ❖ ───── ❖');
  lines.push('💎 _El lujo también corta como el diamante._');
  lines.push(`💡 *${prefix}help <comando>* para detalles`);
  return lines.join('\n');
}

// ── 🌸 Sakura ─────────────────────────────────────────────────────────────
function buildSakura(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '｡ﾟ✧ ｡ﾟ───────── ｡ﾟ✧ ｡ﾟ',
    `   🌸 *${botName}* 🌸`,
    '    さくら · sakura edition',
    '｡ﾟ✧ ｡ﾟ───────── ｡ﾟ✧ ｡ﾟ',
    '',
    `🌿 Konnichiwa, *${pushName || 'viajero'}*`,
    '',
    '✿─「 🍡 TU JARDÍN 」',
    `✿ 👤 Nombre    ·  *${pushName || 'Anónimo'}*`,
    `✿ ⚙️ Prefijo   ·  *${prefix}*`,
    `✿ 📡 Modo      ·  *${MODE_NAMES[mode] || mode}*`,
    `✿ 📦 Comandos  ·  *${totalCommands}*`,
    `✿ ⏱️ Florecido ·  *${formatUptime(uptime)}*`,
    '✿──────────────────────',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`✿─「 ${meta.emoji} ${meta.title} · ${list.length} 」`);
    lines.push(...commandGrid(list, prefix).map((l) => l.replace(/│|║/g, '✿')));
    lines.push('✿──────────────────────');
    lines.push('');
  }
  if (menuLink) lines.push(`🔗 ${menuLink}`, '');
  lines.push('🌸 _Como pétalos en el viento._');
  lines.push(`💡 *${prefix}help <comando>* para detalles`);
  return lines.join('\n');
}

// ── 🌊 Océano ─────────────────────────────────────────────────────────────
function buildOceano(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌',
    `   🌊 *${botName}* 🌊`,
    '     ᴏᴄᴇ́ᴀɴᴏ ᴇᴅɪᴛɪᴏɴ',
    '╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌',
    '',
    `🐚 Bienvenido a bordo, *${pushName || 'marinero'}*`,
    '',
    '╭─「 🧭 CUBIERTA DEL BARCO 」',
    `│ 👤 Marinero  ·  *${pushName || 'Anónimo'}*`,
    `│ ⚙️ Prefijo   ·  *${prefix}*`,
    `│ 📡 Modo      ·  *${MODE_NAMES[mode] || mode}*`,
    `│ 📦 Comandos  ·  *${totalCommands}*`,
    `│ ⏱️ En el mar ·  *${formatUptime(uptime)}*`,
    '╰──────────────────────────',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`╭─「 🌊 ${meta.title} · ${list.length} 」`);
    lines.push(...commandGrid(list, prefix));
    lines.push('╰──────────────────────────');
    lines.push('');
  }
  if (menuLink) lines.push(`🔗 ${menuLink}`, '');
  lines.push('〰〰〰〰〰〰〰〰〰〰〰〰〰〰〰');
  lines.push('🌊 _El trueno también surca los mares._');
  lines.push(`💡 *${prefix}help <comando>* para detalles`);
  return lines.join('\n');
}

// ── 🔥 Fuego ──────────────────────────────────────────────────────────────
function buildFuego(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '█▓█░█▓█░█▓█░█▓█░█▓█░█▓█',
    `   🔥 *${botName}* 🔥`,
    '    ɪɴꜰɪᴇʀɴᴏ ᴇᴅɪᴄɪᴏɴ',
    '█▓█░█▓█░█▓█░█▓█░█▓█░█▓█',
    '',
    `🥵 Bienvenido al infierno, *${pushName || 'condenado'}*`,
    '',
    '▛─「 🌋 CÁMARA INFERNAL 」',
    `▙ 👤 Pecador   ·  *${pushName || 'Anónimo'}*`,
    `▙ ⚙️ Prefijo  ·  *${prefix}*`,
    `▙ 📡 Modo     ·  *${MODE_NAMES[mode] || mode}*`,
    `▙ 📦 Comandos ·  *${totalCommands}*`,
    `▙ ⏱️ Ardiendo ·  *${formatUptime(uptime)}*`,
    '▙─────────────────────────',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`▛─「 🔥 ${meta.title} · ${list.length} 」`);
    lines.push(...commandGrid(list, prefix).map((l) => l.replace(/│|║/g, '▙')));
    lines.push('▙─────────────────────────');
    lines.push('');
  }
  if (menuLink) lines.push(`🔗 ${menuLink}`, '');
  lines.push('🔥 ───── 🔥 ───── 🔥');
  lines.push('🔥 _Primera Forma: Trueno Llameante._');
  lines.push(`💡 *${prefix}help <comando>* para detalles`);
  return lines.join('\n');
}

// ── 🦾 Cyber ──────────────────────────────────────────────────────────────
function buildCyber(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '┏━━━━━━━━━━━━━━━━━━━━━━━┓',
    `  🦾 *${botName}* 🦾`,
    '   ▸ ᴄʏʙᴇʀᴘᴜɴᴋ_ᴠ2.0 ◂',
    '┗━━━━━━━━━━━━━━━━━━━━━━━┛',
    '',
    `> usuario: *${pushName || 'nodo_desconocido'}*`,
    '',
    '┌─「 🖥️ SISTEMA 」',
    `│ ⚙️ cmd      ·  "${prefix}"`,
    `│ 📡 modo     ·  ${MODE_NAMES[mode] || mode}`,
    `│ 📦 módulos  ·  ${totalCommands}`,
    `│ ⏱️ uptime   ·  ${formatUptime(uptime)}`,
    '└─────────────────────────',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`┌─「 ${meta.emoji} ${meta.title} · ${list.length} 」`);
    lines.push(...commandGrid(list, prefix));
    lines.push('└─────────────────────────');
    lines.push('');
  }
  if (menuLink) lines.push(`> link: ${menuLink}`, '');
  lines.push('≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡');
  lines.push('🦾 _Sistema listo. Conexión establecida._');
  lines.push(`> ${prefix}help <comando>_ para detalles`);
  return lines.join('\n');
}

// ── ❄️ Hielo ──────────────────────────────────────────────────────────────
function buildHielo(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '❄︎ ──────────────────── ❄︎',
    `   ❄️ *${botName}* ❄️`,
    '     ɢʟᴀᴄɪᴀʀ ᴇᴅɪᴄɪᴏɴ',
    '❄︎ ──────────────────── ❄︎',
    '',
    `⛄ Bienvenido al glaciar, *${pushName || 'explorador'}*`,
    '',
    '⟦─「 🏔️ ESTACIÓN POLAR 」',
    `⟧ 👤 Explorador ·  *${pushName || 'Anónimo'}*`,
    `⟧ ⚙️ Prefijo    ·  *${prefix}*`,
    `⟧ 📡 Modo       ·  *${MODE_NAMES[mode] || mode}*`,
    `⟧ 📦 Comandos   ·  *${totalCommands}*`,
    `⟧ ⏱️ Congelado  ·  *${formatUptime(uptime)}*`,
    '⟧────────────────────────',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`❄─「 ${meta.emoji} ${meta.title} · ${list.length} 」`);
    lines.push(...commandGrid(list, prefix).map((l) => l.replace(/│|║/g, '❆')));
    lines.push('❄────────────────────────');
    lines.push('');
  }
  if (menuLink) lines.push(`🔗 ${menuLink}`, '');
  lines.push('❄︎ ───── ❄︎ ───── ❄︎');
  lines.push('❄️ _El trueno congela al tocar._');
  lines.push(`💡 *${prefix}help <comando>* para detalles`);
  return lines.join('\n');
}

const STYLE_BUILDERS = {
  galactico: buildGalactico,
  clasico: buildClasico,
  zenitsu: buildZenitsu,
  neon: buildNeon,
  minimal: buildMinimal,
  matrix: buildMatrix,
  diamante: buildDiamante,
  sakura: buildSakura,
  oceano: buildOceano,
  fuego: buildFuego,
  cyber: buildCyber,
  hielo: buildHielo,
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

export function buildCommandHelp(cmd, prefix, opts = {}) {
  const meta = CATEGORIES[cmd.category] || CATEGORIES.general;
  const esPremium = Boolean(cmd.premium || (PREMIUM_CATEGORIES || []).includes(cmd.category));
  const lines = [
    `${meta.emoji} *${prefix}${cmd.name}*`,
    '',
    `📝 ${cmd.desc || 'Sin descripción.'}`,
    `📂 Categoría: ${meta.title}`,
  ];
  if (cmd.usage) lines.push(`💡 Uso: ${prefix}${cmd.usage.replace(/^\S+/, cmd.name)}`);
  if (cmd.aliases?.length) lines.push(`🔁 Alias: ${cmd.aliases.map((a) => prefix + a).join(', ')}`);
  if (cmd.owner) lines.push('👑 Solo el owner.');
  if (esPremium && opts.subbot) {
    lines.push(opts.subbotPremium
      ? '💎 Comando premium — tu subbot lo tiene activado.'
      : '💎 Requiere subbot PREMIUM (descargas e IA).');
  }
  if (cmd.admin) lines.push('🛡️ Solo administradores del grupo.');
  if (cmd.group) lines.push('👥 Solo funciona en grupos.');
  if (cmd.botAdmin) lines.push('🤖 El bot debe ser administrador.');
  return lines.join('\n');
}
