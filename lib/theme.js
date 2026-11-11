// ─── Temas globales de ZENITSU BOT ────────────────────────────────────────
// .settheme <estilo> cambia el menú Y el marco de todas las respuestas.
// Cada tema tiene:
//   open/close      → marco corto (mensajes de una línea)
//   longOpen/longClose → marco de lujo (mensajes largos, con título)

export const THEMES = {
  galactico: {
    label: 'Galáctico', emoji: '🌌',
    open: '✦ ⋆｡°✩ ━━━━━━━━━ ✩°｡⋆ ✦',
    close: '✦ ⋆｡°✩ ━━━━━━━━━ ✩°｡⋆ ✦',
    longOpen: '╭─「 🌌 ZENITSU BOT 」──────\n✦ ⋆｡°✩ ━━━━━━━━━━━━━━━ ✩°｡⋆ ✦',
    longClose: '✦ ⋆｡°✩ ━━━━━━━━━━━━━━━ ✩°｡⋆ ✦\n╰─「 🌠 GALAXY 」────────────',
  },
  clasico: {
    label: 'Clásico', emoji: '⚡',
    open: '⚡ ━━━━━━━━━━━━ ⚡',
    close: '⚡ ━━━━━━━━━━━━ ⚡',
    longOpen: '╭─「 ⚡ ZENITSU BOT 」─────\n⚡ ━━━━━━━━━━━━━━━━ ⚡',
    longClose: '⚡ ━━━━━━━━━━━━━━━━ ⚡\n╰─「 🌩️ TRUENO 」──────────',
  },
  zenitsu: {
    label: 'Zenitsu', emoji: '🌩️',
    open: '🌩️ ━━ 雷の呼吸 ━━ 壱ノ型 ━━ 🌩️',
    close: '🌩️ ━━ 迅雷 ━━ 六連 ━━ 🌩️',
    longOpen: '╭─「 🌩️ ZENITSU BOT 」──────\n🌩️ ━━ 雷の呼吸 ━━ 壱ノ型 ━━ 🌩️',
    longClose: '🌩️ ━━ 迅雷 ━━ 六連 ━━ 🌩️\n╰─「 ⚡ 雷の呼吸 」───────────',
  },
  neon: {
    label: 'Neón', emoji: '💜',
    open: '💜 ░▒▓█ NEON █▓▒░ 💜',
    close: '💜 ░▒▓█ GLOW █▓▒░ 💜',
    longOpen: '╭─「 💜 ZENITSU NEON 」──────\n💜 ░▒▓█ ▓▒░ ░▒▓ █▓▒░ 💜',
    longClose: '💜 ░▒▓█ ▓▒░ ░▒▓ █▓▒░ 💜\n╰─「 ✨ GLOW 」────────────',
  },
  minimal: {
    label: 'Minimal', emoji: '◾',
    open: '',
    close: '',
  },
  matrix: {
    label: 'Matrix', emoji: '🟩',
    open: '🟩 ⣿ [ SYS ] ⣿ 🟩',
    close: '🟩 ⣿ [ END ] ⣿ 🟩',
    longOpen: '╭─「 🟩 ZENITSU.SYS 」───────\n🟩 ⣿⣿⣿ [ ACCESS GRANTED ] ⣿⣿⣿',
    longClose: '🟩 ⣿⣿⣿ [ END OF LINE ] ⣿⣿⣿\n╰─「 ▓▒░ OK 」────────────',
  },
  diamante: {
    label: 'Diamante', emoji: '💎',
    open: '💎 ◇━━━━━━◆━━━━━━◇ 💎',
    close: '💎 ◇━━━━━━◆━━━━━━◇ 💎',
    longOpen: '╭─「 💎 ZENITSU 」──────────\n💎 ◇━━━━━━◆━━━━━━◇ 💎',
    longClose: '💎 ◇━━━━━━◆━━━━━━◇ 💎\n╰─「 ✦ LUX ✦ 」───────────',
  },
  sakura: {
    label: 'Sakura', emoji: '🌸',
    open: '🌸 ｡ﾟ✿ ──────── ✿ﾟ｡ 🌸',
    close: '🌸 ｡ﾟ✿ ──────── ✿ﾟ｡ 🌸',
    longOpen: '╭─「 🌸 ZENITSU 」──────────\n🌸 ｡ﾟ✿ ─────────── ✿ﾟ｡ 🌸',
    longClose: '🌸 ｡ﾟ✿ ─────────── ✿ﾟ｡ 🌸\n╰─「 🌷 HARU 」───────────',
  },
  oceano: {
    label: 'Océano', emoji: '🌊',
    open: '🌊 ｡ﾟ〜〜〜〜〜〜ﾟ｡ 🌊',
    close: '🌊 ｡ﾟ〜〜〜〜〜〜ﾟ｡ 🌊',
    longOpen: '╭─「 🌊 ZENITSU 」──────────\n🌊 ｡ﾟ〜〜〜〜〜〜〜〜〜ﾟ｡ 🌊',
    longClose: '🌊 ｡ﾟ〜〜〜〜〜〜〜〜〜ﾟ｡ 🌊\n╰─「 🐚 MAR 」───────────',
  },
  fuego: {
    label: 'Fuego', emoji: '🔥',
    open: '🔥 ▓▒░ ━━━━━━━ ░▒▓ 🔥',
    close: '🔥 ▓▒░ ━━━━━━━ ░▒▓ 🔥',
    longOpen: '╭─「 🔥 ZENITSU 」──────────\n🔥 ▓▒░ ━━━━━━━━━━━ ░▒▓ 🔥',
    longClose: '🔥 ▓▒░ ━━━━━━━━━━━ ░▒▓ 🔥\n╰─「 💥 炎 」────────────',
  },
  cyber: {
    label: 'Cyber', emoji: '🦾',
    open: '🦾 ‹‹ ██ SYS.ONLINE ██ ››',
    close: '🦾 ‹‹ ██ END.LINE ██ ››',
    longOpen: '╭─「 🦾 ZENITSU.EXE 」───────\n🦾 ‹‹ ██████ ONLINE ██████ ››',
    longClose: '🦾 ‹‹ ██████ END.LINE ██████ ››\n╰─「 ⚙️ 2099 」───────────',
  },
  hielo: {
    label: 'Hielo', emoji: '❄️',
    open: '❄️ ❆━━━━━━━━❆ ❄️',
    close: '❄️ ❆━━━━━━━━❆ ❄️',
    longOpen: '╭─「 ❄️ ZENITSU 」──────────\n❄️ ❆━━━━━━━━━━━━❆ ❄️',
    longClose: '❄️ ❆━━━━━━━━━━━━❆ ❄️\n╰─「 🧊 GLACIAL 」─────────',
  },
  linea: {
    label: 'Línea Recta', emoji: '📏',
    open: '📏 ────────────',
    close: '────────────────',
    longOpen: '📏 ─────────────────────',
    longClose: '───────────────────────',
  },
};

export const DEFAULT_THEME = 'off';

// ¿El texto ya viene con un marco (menú, avisos ya decorados)?
const FRAMED_RE = /[╭┏╔╗╮]/;

export function themeMeta(key) {
  return THEMES[key] || null;
}

// Envuelve un texto con el marco del tema activo.
//   - tema apagado o inexistente → texto tal cual
//   - texto vacío / enorme / ya enmarcado → sin tocar
//   - textos cortos usan el marco simple; los largos, el marco de lujo
export function decorateText(text, themeKey) {
  const meta = THEMES[themeKey];
  if (!meta || !meta.open) return text;
  const body = String(text ?? '');
  if (!body.trim()) return body;
  if (body.length > 1800) return body; // listas enormes: no duplicar tamaño
  if (FRAMED_RE.test(body)) return body;

  const isShort = body.length <= 90 && !body.includes('\n');
  const open = isShort ? meta.open : meta.longOpen || meta.open;
  const close = isShort ? meta.close : meta.longClose || meta.close;
  if (body.startsWith(open) || body.startsWith(meta.open)) return body;
  return `${open}\n${body}\n${close}`;
}

// Muestra pequeña de cada tema para el comando .settheme.
export function themeList(current) {
  return Object.entries(THEMES)
    .map(([key, meta]) => {
      const mark = key === current ? '✅' : '▸';
      const sample = meta.open ? `\n   ${meta.open}` : '';
      return `${mark} ${meta.emoji} *${key}* — ${meta.label}${sample}`;
    })
    .join('\n');
}
