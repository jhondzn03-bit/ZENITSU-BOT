export const CATEGORIES = {
  general: { title: 'GENERAL', emoji: '🌙' },
  subbots: { title: 'SUBBOTS', emoji: '☁️' },
  owner: { title: 'OWNER', emoji: '👑' },
  admin: { title: 'ADMINISTRACIÓN', emoji: '🛡️' },
  tools: { title: 'HERRAMIENTAS', emoji: '🧰' },
  media: { title: 'IMÁGENES Y EFECTOS', emoji: '🖼️' },
  search: { title: 'INVESTIGACIÓN', emoji: '🔎' },
  ventas: { title: 'VENTAS Y COMANDOS PERSONALIZADOS', emoji: '🛒' },
  downloads: { title: 'DESCARGAS', emoji: '📥' },
  ai: { title: 'INTELIGENCIA ARTIFICIAL', emoji: '🤖' },
  anime: { title: 'ANIME', emoji: '🌸' },
  fun: { title: 'DIVERSIÓN', emoji: '🎲' },
  economy: { title: 'ECONOMÍA', emoji: '💰' },
  info: { title: 'INFORMACIÓN', emoji: '🌐' },
};

export const MENU_STYLES = {
  luna: { label: 'Luna Edition', emoji: '🌙', desc: 'Noche estrellada: el menú principal renovado.' },
  navideno: { label: 'Navideño', emoji: '🎄', desc: 'Edición de Navidad: Santa, nieve y regalos, con descripciones.' },
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
  linea: { label: 'Línea Recta', emoji: '📏', desc: 'Un comando por línea, largo y bien separado.' },
  arcade: { label: 'Arcade', emoji: '👾', desc: 'Retro gaming: inserta la moneda.' },
  gotico: { label: 'Gótico', emoji: '🦇', desc: 'Oscuro, elegante y misterioso.' },
  real: { label: 'Real', emoji: '👑', desc: 'Realeza y lujo de corte.' },
  dulce: { label: 'Dulce', emoji: '🍬', desc: 'Candy: color y ternura.' },
  dragon: { label: 'Dragón', emoji: '🐉', desc: 'Fuego de dragón legendario.' },
};

export const DEFAULT_MENU_STYLE = 'luna';

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
    // Los comandos +18 fueron retirados: no aparecen en ningún menú.
    if (cmd.category === 'nsfw') continue;
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
// ve moderno. Sin emojis pegados a los comandos (el nombre queda limpio).
function commandGrid(list, prefix, accent = '✦') {
  const cells = list.map((cmd) => `${prefix}${cmd.name}`);
  const width = Math.max(...cells.map((c) => c.length)) + 4;
  const lines = [`│ ${accent} ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`];
  for (let i = 0; i < cells.length; i += 2) {
    const left = `▸ ${cells[i]}`.padEnd(width);
    const right = i + 1 < cells.length ? `▸ ${cells[i + 1]}` : '';
    lines.push(`│ ${left}${right}`.trimEnd());
  }
  return lines;
}

// Letras espaciadas para el título ("ZENITSU BOT" → "Z E N I T S U  B O T").
function spacedName(name = '') {
  const clean = String(name).trim();
  if (!clean || clean.length > 16) return clean;
  return clean.split('').join(' ');
}

// ── 🌙 Luna Edition — el menú principal de ZENITSU BOT ─────────────────────
// Rediseño completo: noche con luna, rayos, estrellas y nubes. Un comando por
// línea, datos reales del bot y cada categoría en su propio bloque, con
// adornos distintos pero consistentes entre bloques.
const LUNA_TOP = '╭┈ࠢ͜┅ࠦ͜͜╾݊͜─ؕ͜─ׄ͜─֬͜─֟͜─֫͜─ׄ͜─ؕ͜─݊͜┈ࠦ͜╮';
const LUNA_TOP_CLOSE = '╰┈ࠢ͜┅ࠦ͜͜╾݊͜─ؕ͜─ׄ͜─֬͜─֟͜─֫͜─ׄ͜─ؕ͜─݊͜┈ࠦ͜╯';
const LUNA_BOTTOM = '╰━━━━━━━━━━━━━━━━━━━━━━╯';
const LUNA_DIVIDERS = [
  '☁️ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ ☁️',
  '✨ ──────────────────── ✨',
  '💜 ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ 💜',
  '⭐ ──────────────────── ⭐',
];

function buildLuna(ctx, byCategory) {
  const {
    prefix,
    botName,
    pushName,
    mode,
    uptime,
    totalCommands,
    menuLink,
    version,
    ownerName,
    platform,
    senderNumber,
  } = ctx;
  const ver = String(version || '2.0').split('.').slice(0, 2).join('.');
  const lines = [
    LUNA_TOP,
    `『🌙』 *${spacedName(botName) || botName}*`,
    '『⚡』 Respiración del Trueno',
    '『✨』 Luna Edition',
    LUNA_TOP_CLOSE,
    '',
  ];
  // Saludo personalizado: menciona de verdad al usuario que pidió el menú.
  if (senderNumber) {
    lines.push(`🌙 ¡Hola! @${senderNumber}, soy 🌙 *${botName}* ⚡.`);
  } else {
    lines.push(`🌙 ¡Hola! *${pushName || 'Cazador de Demonios'}*, soy 🌙 *${botName}* ⚡.`);
  }
  lines.push('✨ Aquí tienes mi lista de comandos.', '');
  lines.push(
    LUNA_TOP,
    '『🌙』 DATOS DEL BOT',
    LUNA_TOP_CLOSE,
    `│ 🌙 Nombre: ${botName}`,
    `│ ⚡ Versión: ${ver}`,
    `│ 👤 Owner: ${ownerName || 'Jhonathan'}`,
    `│ ⚙️ Prefijo: ${prefix}`,
    `│ 🔒 Modo: ${MODE_NAMES[mode] || mode}`,
    `│ 📦 Comandos: ${totalCommands}`,
    `│ ⏱️ Activo: ${formatUptime(uptime)}`,
    `│ 📱 Sistema: ${platform || 'Android · Linux'}`,
    LUNA_BOTTOM,
    '',
  );
  const cats = Object.keys(CATEGORIES).filter((k) => byCategory.get(k)?.length);
  cats.forEach((key, idx) => {
    const list = byCategory.get(key);
    const meta = CATEGORIES[key];
    // Cada categoría es un bloque independiente con sus comandos, uno por
    // línea, sin columnas ni rejillas.
    lines.push(LUNA_TOP);
    lines.push(`«${meta.emoji} Categoría: ${meta.title}»`);
    for (const cmd of list) {
      lines.push(`＃ ${prefix}${cmd.name}`);
    }
    lines.push(LUNA_BOTTOM);
    if (idx < cats.length - 1) {
      lines.push('', LUNA_DIVIDERS[idx % LUNA_DIVIDERS.length], '');
    } else {
      lines.push('');
    }
  });
  if (menuLink) {
    lines.push(`🔗 ${menuLink}`, '');
  }
  lines.push(
    '╭━━━━━━━━━━━━━━━━━━━━━━╮',
    `│ 🌙 ${botName}`,
    '│ ⚡ Respiración del Trueno',
    '│ ✨ Luna Edition',
    '╰━━━━━━━━━━━━━━━━━━━━━━╯',
    '«🌙 La noche también tiene su propia luz.»',
    `💡 Usa ${prefix}help comando para obtener información.`,
    `⚡ Usa ${prefix}menu para volver al menú.`,
  );
  return lines.join('\n');
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
    lines.push(`╭━━「 ${meta.emoji} ${meta.title} 」━━━╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '✦'));
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
    lines.push(`╭━━「 ${meta.emoji} ${meta.title} 」━━━╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '⚡'));
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
    lines.push(`⚡━━「 ${meta.emoji} ${meta.title} 」━━╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '🌩️'));
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
    lines.push(...commandGrid(list, prefix, '💜').map((l) => l.replace('│', '┃')));
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
    lines.push(`[━━ ${meta.emoji} ${meta.title} ━━]╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '🟩').map((l) => l.replace('│', '>')));
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
    lines.push(`╔━━「 ${meta.emoji} ${meta.title} 」━━╗╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '💎'));
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
    lines.push(`✿━━「 ${meta.emoji} ${meta.title} 」━━╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '✿').map((l) => l.replace(/│|║/g, '✿')));
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
    lines.push(`╭━━「 🌊 ${meta.title} 」━━╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '🌊'));
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
    lines.push(`▛━━「 🔥 ${meta.title} 」━━╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '🔥').map((l) => l.replace(/│|║/g, '▙')));
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
    lines.push(`┌━━「 ${meta.emoji} ${meta.title} 」━━╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '🦾'));
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
    lines.push(`❄━━「 ${meta.emoji} ${meta.title} 」━━╢ ${list.length}`);
    lines.push(...commandGrid(list, prefix, '❆').map((l) => l.replace(/│|║/g, '❆')));
    lines.push('❄────────────────────────');
    lines.push('');
  }
  if (menuLink) lines.push(`🔗 ${menuLink}`, '');
  lines.push('❄︎ ───── ❄︎ ───── ❄︎');
  lines.push('❄️ _El trueno congela al tocar._');
  lines.push(`💡 *${prefix}help <comando>* para detalles`);
  return lines.join('\n');
}

// ── 📏 Línea Recta ────────────────────────────────────────────────────────
// Un comando por renglón, alineado y con aire entre cada uno: se lee como
// una lista recta de arriba a abajo, sin rejilla.
// ── 📏 Línea Recta ────────────────────────────────────────────────────────
// Une los comandos en UNA fila horizontal separada por " · " y la parte en
// renglones cuando ya no cabe en el ancho de WhatsApp. Es una línea recta
// que fluye de izquierda a derecha.
function flowLine(cells, gutter = '', width = 36) {
  const lines = [];
  let current = '';
  for (const cell of cells) {
    const candidate = current ? `${current} · ${cell}` : cell;
    if (current && candidate.length > width) {
      lines.push(`${gutter}${current}`);
      current = cell;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(`${gutter}${current}`);
  return lines;
}

function buildLinea(ctx, byCategory) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const lines = [
    '┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓',
    `┃  📏 *${botName}*`,
    '┃  ʟɪ́ɴᴇᴀ ʀᴇᴄᴛᴀ',
    '┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
    '',
    `👋 Hola, *${pushName || 'Cazador'}*`,
    '',
    `┃ 👤 Usuario  ·  *${pushName || 'Anónimo'}*`,
    `┃ ⚙️ Prefijo  ·  *${prefix}*`,
    `┃ 📡 Modo     ·  *${MODE_NAMES[mode] || mode}*`,
    `┃ 📦 Comandos ·  *${totalCommands}*`,
    `┃ ⏱️ Activo   ·  *${formatUptime(uptime)}*`,
    '┗━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    // Los comandos van EN FILA: una sola línea recta que se va partiendo
    // sola cuando ya no cabe, separados por " · ".
    const cells = list.map((cmd) => `${prefix}${cmd.name}`);
    lines.push(`┏━━「 ${meta.emoji} ${meta.title} 」━━╢ ${list.length}`);
    lines.push(...flowLine(cells, '┃ ', 36));
    lines.push('┗━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }
  if (menuLink) lines.push(`🔗 ${menuLink}`, '');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('📏 _Cada trueno, en su propia línea._');
  lines.push(`💡 *${prefix}help <comando>* para detalles`);
  lines.push(`🎨 Otros diseños: *${prefix}setmenu lista*`);
  return lines.join('\n');
}

// ── ✨ Temas "fancy" (paramétricos) ────────────────────────────────────────
// Un solo constructor dibuja el menú con los caracteres de cada tema:
// esquinas, barras, acento, subtítulo y frase final.
const FANCY_SPECS = {
  arcade: {
    label: 'Arcade', emoji: '👾', subtitle: 'ᴀʀᴄᴀᴅᴇ ᴇᴅɪᴛɪᴏɴ', tag: 'JUGADOR',
    o: '┏', ot: '┓', c: '┗', ct: '┛', v: '┃', h: '━', accent: '👾',
    footer: '👾 _Inserta un comando y presiona START._',
  },
  gotico: {
    label: 'Gótico', emoji: '🦇', subtitle: 'ɢᴏᴛʜɪᴄ ᴇᴅɪᴛɪᴏɴ', tag: 'ALMA OSCURA',
    o: '╔', ot: '╗', c: '╚', ct: '╝', v: '║', h: '═', accent: '🦇',
    footer: '🦇 _La noche susurra comandos._',
  },
  real: {
    label: 'Real', emoji: '👑', subtitle: 'ʀᴏʏᴀʟ ᴇᴅɪᴛɪᴏɴ', tag: 'CORTE REAL',
    o: '╭', ot: '╮', c: '╰', ct: '╯', v: '│', h: '─', accent: '👑',
    footer: '👑 _Al servicio del rey de los comandos._',
  },
  dulce: {
    label: 'Dulce', emoji: '🍬', subtitle: 'ᴄᴀɴᴅʏ ᴇᴅɪᴛɪᴏɴ', tag: 'DULZURA',
    o: '╭', ot: '╮', c: '╰', ct: '╯', v: '❥', h: '─', accent: '🍬',
    footer: '🍬 _Endulza tu chat con un comando._',
  },
  dragon: {
    label: 'Dragón', emoji: '🐉', subtitle: 'ᴅʀᴀɢᴏɴ ᴇᴅɪᴛɪᴏɴ', tag: 'GUERRERO',
    o: '╔', ot: '╗', c: '╚', ct: '╝', v: '║', h: '═', accent: '🐉',
    footer: '🐉 _El dragón despierta con cada comando._',
  },
};

function buildFancy(ctx, byCategory, s) {
  const { prefix, botName, pushName, mode, uptime, totalCommands, menuLink } = ctx;
  const bar = s.h.repeat(26);
  const lines = [
    `${s.o}${bar}${s.ot}`,
    `${s.v}  ${s.emoji} *${spacedName(botName) || botName}*`,
    `${s.v}  ${s.subtitle}`,
    `${s.c}${bar}${s.ct}`,
    '',
    `${s.emoji} Hola, *${pushName || 'Cazador'}*`,
    '',
    `${s.o}${s.h}「 ${s.emoji} ${s.tag} 」${s.h.repeat(3)}`,
    `${s.v} 👤 Nombre    ·  *${pushName || 'Anónimo'}*`,
    `${s.v} ⚙️ Prefijo   ·  *${prefix}*`,
    `${s.v} 📡 Modo      ·  *${MODE_NAMES[mode] || mode}*`,
    `${s.v} 📦 Comandos  ·  *${totalCommands}*`,
    `${s.v} ⏱️ Activo    ·  *${formatUptime(uptime)}*`,
    `${s.c}${s.h.repeat(26)}`,
    '',
  ];
  for (const key of Object.keys(CATEGORIES)) {
    const list = byCategory.get(key);
    if (!list?.length) continue;
    const meta = CATEGORIES[key];
    lines.push(`${s.o}${s.h}「 ${meta.emoji} ${meta.title} 」${s.h.repeat(2)} ${list.length}`);
    lines.push(
      ...commandGrid(list, prefix, s.accent).map((l) => l.replace(/│/g, s.v)),
    );
    lines.push(`${s.c}${s.h.repeat(26)}`);
    lines.push('');
  }
  if (menuLink) lines.push(`${s.emoji} ${menuLink}`, '');
  lines.push(s.h.repeat(28));
  lines.push(s.footer);
  lines.push(`💡 *${prefix}help <comando>* para detalles`);
  lines.push(`🎨 Otros diseños: *${prefix}settheme lista*`);
  return lines.join('\n');
}

// ── 🎄 Navideño — edición de Navidad ────────────────────────────────────────
// Menú estilo "taller de Santa": título con árboles y nieve, saludo de Santa,
// datos con "Clave › valor" y categorías con letras exóticas. Cada comando
// muestra sus ALIAS en la misma línea y su DESCRIPCIÓN debajo (formato cita,
// que WhatsApp renderiza con la barrita vertical).
const XMAS_RIBBON = '🎁🎄 ━━━ ❄️ ━━━ 🎁 ━━━ ❄️ ━━━ 🎄';
const XMAS_LINE = '─ׄ─ׅ─ׄ─⭒─ׄ─ׅ─ׄ─⭒─ׄ─ׅ─ׄ─⭒─ׄ─ׅ─ׄ─';
const XMAS_STAR = '१⭐ 〪᳘ᩧᩡ᎒ ꯭';
const XMAS_BULLET = 'いᰱໍ࣭☆ׂ';
const XMAS_HEAD = 'ֹ ⠼𔘓᳹➜❝❪  ؕ';
const XMAS_HEAD_END = '❫ 𐒻𐑼';
const XMAS_EMOJIS = ['🎄', '🎁', '❄️', '⛄', '🦌', '🎅', '⭐', '🔔', '🕯️', '🧦'];

// Letras exóticas para el nombre de la categoría (gᧉ𝗇ᧉꭇα𝗅, αd𝗆ꪱ𝗇...).
const XMAS_FONT = {
  a: 'α', b: 'b', c: 'c', d: 'd', e: 'ᧉ', f: '𝖿', g: 'g', h: 'h',
  i: 'ꪱ', j: 'ȷ', k: 'k', l: '𝗅', m: '𝗆', n: '𝗇', o: 'ᦅ', p: '𝗉',
  q: '𝗊', r: 'ꭇ', s: '𝗌', t: 'ƚ', u: '𝗎', v: '𝗏', w: 'w', x: 'x',
  y: '᥆', z: 'z',
};
function xmasFont(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('')
    .map((ch) => XMAS_FONT[ch] || ch)
    .join('');
}

function buildNavideno(ctx, byCategory) {
  const {
    prefix,
    botName,
    pushName,
    mode,
    uptime,
    totalCommands,
    menuLink,
    version,
    ownerName,
    platform,
    senderNumber,
  } = ctx;
  const ver = String(version || '2.0').split('.').slice(0, 2).join('.');
  const lines = [
    `🎄❄️🎁 *${spacedName('MENÚ NAVIDEÑO')}* 🎁❄️🎄`,
    `🎅 ¡Ho, ho, ho! Soy 🌙 *${botName}* ⚡`,
    '⛄ ¡Bienvenido al taller navideño del Trueno!',
    XMAS_RIBBON,
    '',
  ];
  // Saludo personalizado: menciona de verdad a quien pidió el menú.
  if (senderNumber) {
    lines.push(`🎁 Parece que *@${senderNumber}* se portó bien este año ❄️`, '');
  } else {
    lines.push(`🎁 Parece que *${pushName || 'alguien'}* se portó bien este año ❄️`, '');
  }
  lines.push(
    `${XMAS_STAR} *Nombre › ${botName}*`,
    `${XMAS_STAR} *Versión › ${ver}*`,
    `${XMAS_STAR} *Owner › ${ownerName || 'Jhonathan'}*`,
    `${XMAS_STAR} *Prefijo › ${prefix}*`,
    `${XMAS_STAR} *Modo › ${MODE_NAMES[mode] || mode}*`,
    `${XMAS_STAR} *Comandos › ${totalCommands}*`,
    `${XMAS_STAR} *Activo › ${formatUptime(uptime)}*`,
    `${XMAS_STAR} *Sistema › ${platform || 'Android · Linux'}*`,
  );
  if (menuLink) lines.push(`${XMAS_STAR} *Repo › ${menuLink}*`);
  lines.push(XMAS_LINE, '');
  const cats = Object.keys(CATEGORIES).filter((k) => byCategory.get(k)?.length);
  cats.forEach((key, idx) => {
    const list = byCategory.get(key);
    const emoji = XMAS_EMOJIS[idx % XMAS_EMOJIS.length];
    lines.push(`*${XMAS_HEAD}${emoji} ${xmasFont(CATEGORIES[key].title)}   ${XMAS_HEAD_END}*`, '');
    for (const cmd of list) {
      // El comando y todos sus alias van en la misma línea.
      const names = [prefix + cmd.name, ...(cmd.aliases || []).map((a) => prefix + a)];
      lines.push(`${XMAS_BULLET} ${names.join(' ')}`);
      if (cmd.desc) lines.push(`> *${cmd.desc}*`);
    }
    lines.push('');
    if (idx < cats.length - 1) lines.push(XMAS_LINE, '');
  });
  lines.push(
    XMAS_LINE,
    '',
    `🎄❄️ *${botName}* ❄️🎄`,
    '⚡ Respiración del Trueno · Edición Navideña 🎁',
    '',
    '«🎁 ¡Que la magia de la Navidad acompañe tus comandos! ⛄»',
    '',
    `💡 Usa ${prefix}help comando para obtener información.`,
    `⚡ Usa ${prefix}menu para volver al menú.`,
  );
  return lines.join('\n');
}

const STYLE_BUILDERS = {
  luna: buildLuna,
  navideno: buildNavideno,
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
  linea: buildLinea,
};
for (const [key, spec] of Object.entries(FANCY_SPECS)) {
  STYLE_BUILDERS[key] = (ctx, byCategory) => buildFancy(ctx, byCategory, spec);
}

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
  version,
  ownerName,
  platform,
  senderNumber,
}) {
  const byCategory = groupCommands(commands, isOwner);
  const render = STYLE_BUILDERS[style] || STYLE_BUILDERS[DEFAULT_MENU_STYLE];
  return render(
    {
      prefix,
      botName,
      pushName,
      mode,
      uptime,
      totalCommands,
      menuLink,
      version,
      ownerName,
      platform,
      senderNumber,
    },
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
