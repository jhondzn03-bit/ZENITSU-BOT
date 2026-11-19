// ─── Generador de scripts Roblox (.crearscript) ────────────────────────────
 // Sesiones interactivas por usuario+chat y generación de proyectos Luau.
 // La IA analiza las 7 respuestas y propone un plan; el código se arma con
 // plantillas que SOLO usan APIs públicas y documentadas de Roblox.
 import { aiText } from './api.js';
 import { sleep } from './utils.js';

const TTL = 2 * 60 * 60 * 1000; // 2 h para pedir nuevas versiones

export const SCRIPT_QUESTIONS = [
  { id: 'game', label: '¿Para qué juego de Roblox quieres crear el script?' },
  { id: 'name', label: '¿Cómo quieres que se llame tu script o proyecto?' },
  { id: 'functions', label: '¿Qué funciones quieres que tenga?' },
  { id: 'colors', label: '¿Qué colores quieres utilizar? (puedes escribir HEX como #00D4FF)' },
  { id: 'design', label: '¿Qué diseño prefieres? (moderno, futurista, minimalista...)' },
  { id: 'gui', label: '¿Quieres una interfaz gráfica (GUI)? (sí / no)' },
  { id: 'mods', label: '¿Qué otras modificaciones quieres realizar?' },
];

const DEFAULT_COLORS = ['#0B0E14', '#00D4FF', '#8A2BE2'];

const NAMED_COLORS = [
  ['negro', '#0B0E14'],
  ['azul neón', '#00D4FF'],
  ['azul neon', '#00D4FF'],
  ['azul', '#2563EB'],
  ['morado', '#8A2BE2'],
  ['púrpura', '#8A2BE2'],
  ['purpura', '#8A2BE2'],
  ['blanco', '#F5F5FF'],
  ['gris', '#9CA3AF'],
  ['rojo', '#EF4444'],
  ['verde', '#22C55E'],
  ['amarillo', '#FACC15'],
  ['dorado', '#F5B301'],
  ['naranja', '#F97316'],
  ['rosado', '#EC4899'],
  ['rosa', '#EC4899'],
  ['cian', '#06B6D4'],
];

const GAME_HINTS = [
  ['99 nights in the forest', '99 Nights in the Forest'],
  ['99 nights', '99 Nights in the Forest'],
  ['blox fruits', 'Blox Fruits'],
  ['adopt me', 'Adopt Me!'],
  ['brookhaven', 'Brookhaven 🏡RP'],
  ['grow a garden', 'Grow a Garden'],
  ['murder mystery 2', 'Murder Mystery 2'],
  ['mm2', 'Murder Mystery 2'],
  ['pet simulator', 'Pet Simulator'],
  ['bedwars', 'BedWars'],
  ['arsenal', 'Arsenal'],
  ['dress to impress', 'Dress to Impress'],
  ['universal', 'Universal (Roblox)'],
  ['genérico', 'Universal (Roblox)'],
  ['generico', 'Universal (Roblox)'],
  ['cualquiera', 'Universal (Roblox)'],
];

const FEATURE_RULES = {
  gui: /gui|interfaz|panel|men[uú]|hub|\bui\b|ventana/i,
  config: /config|configuraci[oó]n|ajuste|settings|panel|opciones/i,
  effects: /efecto|visual|glow|brillo|part[ií]cula|tint|destello|color/i,
  lighting: /iluminaci|iluminar|luz|ambiente|fog|niebla|atardecer|noche|d[ií]a|oscuro/i,
  animations: /animaci|animar|tween|transici|suave|movimiento/i,
  interaction: /interacci|tecla|atajo|keybind|bot[oó]n|clic|teclado|toggle/i,
  mechanics: /mec[aá]nica|sistema|salto|velocidad|teletransport|speed|jump|dash|caminar/i,
  admin: /admin|administrac|herramienta|owner|due[nñ]o|permiso|anunciar|servidor/i,
  objectMods: /objeto|parte|modelo|bloque|material|color de parte|workspace/i,
};

const sessions = new Map();

function sessionKey(ctx) {
  return `${ctx.chat}|${ctx.sender}`;
}

function prune() {
  const now = Date.now();
  for (const [k, s] of sessions) if (now - s.lastAt > TTL) sessions.delete(k);
}

export function getScriptSession(ctx) {
  prune();
  const s = sessions.get(sessionKey(ctx));
  if (s && Date.now() - s.lastAt > TTL) {
    sessions.delete(sessionKey(ctx));
    return null;
  }
  return s || null;
}

export function hasActiveScriptSession(sender, chat) {
  prune();
  return sessions.has(`${chat}|${sender}`);
}

export function startScriptSession(ctx) {
  const s = {
    answers: {},
    step: 0,
    lastAt: Date.now(),
    completed: false,
    version: 0,
    lastProject: null,
  };
  sessions.set(sessionKey(ctx), s);
  return s;
}

export function cancelScriptSession(ctx) {
  const existed = Boolean(sessions.delete(sessionKey(ctx)));
  return existed;
}

function clean(value, max = 160) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

export function questionText(index, session) {
  const q = SCRIPT_QUESTIONS[index];
  if (!q) return '';
  const done = Object.keys(session?.answers || {}).length;
  return [
    `🧩 *CREAR SCRIPT ROBLOX* · ${index + 1}/${SCRIPT_QUESTIONS.length}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    q.label,
    '',
    `_Responde con un mensaje normal. ${done ? 'Ya llevas ' + done + ' respuesta' + (done === 1 ? '' : 's') + '.' : ''}_`,
    `_Escribe *estado* para ver el progreso o *cancelar* para salir._`,
  ].join('\n');
}

export function sessionStatusText(session) {
  if (!session) return 'No tienes un proceso de .crearscript activo.';
  const lines = ['📋 *PROCESO .crearscript*', '━━━━━━━━━━━━━━━━━━━━'];
  SCRIPT_QUESTIONS.forEach((q, i) => {
    const mark = i < session.step ? '✅' : i === session.step ? '➡️' : '⬜';
    const value = session.answers[q.id] ? ` _${clean(session.answers[q.id], 70)}_` : '';
    lines.push(`${mark} ${i + 1}. ${q.label}${value}`);
  });
  lines.push('', session.completed ? `✅ Proyecto generado (versión ${session.version}).` : `➡️ Responde la pregunta ${session.step + 1}.`);
  lines.push('_Comandos: estado · editar N texto · version · cancelar_');
  return lines.join('\n');
}

export function allText(answers) {
  return SCRIPT_QUESTIONS.map((q) => answers[q.id] || '').join(' ');
}

export function detectFeatures(answers) {
  const text = allText(answers);
  const guiAnswer = String(answers.gui || '');
  const noGui = /^(no|n|false|0|sin gui|sin interfaz)\b/i.test(guiAnswer.trim());
  const features = {};
  for (const [key, re] of Object.entries(FEATURE_RULES)) features[key] = re.test(text);
  features.gui = !noGui && (features.gui || features.config || true);
  if (noGui) features.gui = false;
  features.config = features.config || features.gui;
  features.admin = features.admin || /^(s[ií]|yes|ok|admin)\b/i.test(String(answers.mods || '').trim());
  return features;
}

export function detectGame(answers) {
  const raw = clean(answers.game, 120);
  const low = raw.toLowerCase();
  for (const [needle, canonical] of GAME_HINTS) {
    if (low.includes(needle)) return canonical;
  }
  return raw || 'Universal (Roblox)';
}

export function detectColors(answers) {
  const text = allText(answers);
  const found = [];
  for (const m of text.matchAll(/#([0-9a-fA-F]{6})\b/g)) found.push(`#${m[1].toUpperCase()}`);
  // Un solo regex con alternancias ordenadas por longitud: respeta el orden
  // en que el usuario escribió los colores y evita que "azul" gane a "azul neón".
  const byName = new Map(NAMED_COLORS.map(([name, hex]) => [name.toLowerCase(), hex]));
  const alternatives = [...byName.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const namedRe = new RegExp(`\\b(?:${alternatives.join('|')})\\b`, 'gi');
  for (const m of text.matchAll(namedRe)) {
    const hex = byName.get(m[0].toLowerCase());
    if (hex) found.push(hex);
  }
  const uniq = [...new Set(found)];
  const out = uniq.slice(0, 3);
  for (const c of DEFAULT_COLORS) {
    if (out.length >= 3) break;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function detectOwnerId(answers) {
  const text = allText(answers);
  if (!/user\s*id|id\s+de\s+roblox|owner\s*id/i.test(text)) return 0;
  const m = text.match(/\b(\d{4,12})\b/);
  return m ? Number(m[1]) : 0;
}

export function detectToggleKey(answers) {
  const text = allText(answers);
  const m = text.match(/\b(F[1-9]|F1[0-2]|RControl|LControl|RightControl|LeftControl|RightShift|LeftShift|Space|Enter)\b/i);
  return m ? m[1].replace(/^f/i, 'F') : 'F5';
}

/* ────────────────────────── IA + plan ────────────────────────── */

function extractJson(text) {
  const s = String(text || '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

function fallbackPlan(answers) {
  const f = detectFeatures(answers);
  const names = [];
  if (f.config) names.push('Panel de configuración en tiempo real');
  if (f.effects) names.push('Efectos visuales en el personaje y la interfaz');
  if (f.lighting) names.push('Iluminación y ambiente');
  if (f.animations) names.push('Animaciones de interfaz con TweenService');
  if (f.interaction) names.push('Atajo de teclado y botones interactivos');
  if (f.mechanics) names.push('Velocidad y salto (cliente)');
  if (f.admin) names.push('Herramientas de servidor solo para el owner de la experiencia');
  if (!names.length) names.push('Interfaz base con estado y cierre por teclado');
  return {
    resumen: `Proyecto para ${detectGame(answers)} enfocado en ${names.slice(0, 3).join(', ').toLowerCase()}.`,
    funciones: names.slice(0, 6).map((nombre, i) => ({
      nombre,
      que_hace: `Implementación real usando APIs públicas de Roblox (módulo ${i + 1}).`,
      requisito: i >= 5 ? 'servidor' : 'cliente',
    })),
    limitaciones: [
      'Un LocalScript solo afecta al jugador local: no cambia el servidor ni a otros jugadores.',
      'Las herramientas de servidor requieren colocar el Script y configurar AllowedOwnerUserId en Roblox Studio.',
      'No se modifican sistemas internos de juegos de terceros ni se usanRemoteEvents ajenos.',
    ],
    nombre_sugerido: clean(answers.name, 60) || 'ZENITSU SCRIPT',
  };
}

async function analyzeWithAi(answers) {
  const system = [
    'Eres un ingeniero de Roblox especializado en Luau y APIs públicas.',
    'Analizas las respuestas de un usuario y entregas un plan breve para generar un script.',
    'NUNCA propongas exploits, RemoteEvents de juegos de terceros ni funciones inexistentes.',
    'Distingue claramente lo que puede hacer un LocalScript de lo que requiere un Script del servidor o Roblox Studio.',
    'Responde SOLO con JSON válido, en español, sin markdown.',
  ].join(' ');
  const prompt = [
    'Respuestas del usuario (7 campos):',
    JSON.stringify(answers).slice(0, 4000),
    '',
    'Devuelve exactamente este shape:',
    '{"resumen":"...","funciones":[{"nombre":"...","que_hace":"...","requisito":"cliente|servidor|studio"}],"limitaciones":["..."],"nombre_sugerido":"..."}',
    'Máximo 6 funciones y 3 limitaciones. Sé concreto y realista.',
  ].join('\n');

  const raw = await aiText(prompt, { system, history: [] });
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('La IA no devolvió un plan JSON válido');
  const plan = fallbackPlan(answers);
  if (typeof parsed.resumen === 'string' && parsed.resumen.trim()) plan.resumen = clean(parsed.resumen, 600);
  if (typeof parsed.nombre_sugerido === 'string' && parsed.nombre_sugerido.trim()) {
    plan.nombre_sugerido = clean(parsed.nombre_sugerido, 60);
  }
  if (Array.isArray(parsed.funciones) && parsed.funciones.length) {
    plan.funciones = parsed.funciones
      .slice(0, 6)
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        nombre: clean(x.nombre, 90) || 'Función',
        que_hace: clean(x.que_hace, 260) || 'Sin descripción.',
        requisito: ['cliente', 'servidor', 'studio'].includes(String(x.requisito || '').toLowerCase())
          ? String(x.requisito).toLowerCase()
          : 'cliente',
      }));
  }
  if (Array.isArray(parsed.limitaciones) && parsed.limitaciones.length) {
    plan.limitaciones = parsed.limitaciones.slice(0, 3).map((x) => clean(x, 220)).filter(Boolean);
  }
  return plan;
}

/* ────────────────────────── Luau ────────────────────────── */

function q(value) {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`;
}

function rgb(hex, fallback) {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return fallback;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

function colorExpr(hex, fallback) {
  const [r, g, b] = rgb(hex, fallback);
  return `Color3.fromRGB(${r}, ${g}, ${b})`;
}

function bool(v) {
  return v ? 'true' : 'false';
}

function configFile(spec) {
  const [bg, accent, secondary] = spec.colors;
  return [
    '-- 01-Config.luau :: ModuleScript en ReplicatedStorage',
    '-- Generado por ZENITSU BOT. Configuración central del proyecto.',
    '-- Cambia los valores y vuelve a ejecutar; no necesita permisos especiales.',
    'local Config = {}',
    '',
    `Config.ProjectName = ${q(spec.name)}`,
    `Config.Game = ${q(spec.game)}`,
    `Config.Design = ${q(spec.design)}`,
    `Config.GuiEnabled = ${bool(spec.features.gui)}`,
    `Config.AllowedOwnerUserId = ${spec.ownerId} -- 0 = herramientas de servidor desactivadas`,
    `Config.ToggleKey = ${q(spec.toggleKey)} -- Convierte a Enum.KeyCode; si falla, usa F5`,
    `Config.ObjectPartName = "Part" -- Nombre de la parte a modificar con permiso de servidor`,
    '',
    'Config.Colors = {',
    `    Background = ${colorExpr(bg, [11, 14, 20])},`,
    `    Accent = ${colorExpr(accent, [0, 212, 255])},`,
    `    Secondary = ${colorExpr(secondary, [138, 43, 226])},`,
    '    Text = Color3.fromRGB(245, 245, 255),',
    '}',
    '',
    'Config.Features = {',
    `    ConfigPanel = ${bool(spec.features.config)},`,
    `    VisualEffects = ${bool(spec.features.effects)},`,
    `    Lighting = ${bool(spec.features.lighting)},`,
    `    Animations = ${bool(spec.features.animations)},`,
    `    Interaction = ${bool(spec.features.interaction)},`,
    `    Mechanics = ${bool(spec.features.mechanics)},`,
    `    AdminTools = ${bool(spec.features.admin)},`,
    `    ObjectMods = ${bool(spec.features.objectMods)},`,
    '}',
    '',
    'Config.WalkSpeed = 16 -- 4..200. En cliente solo afecta a tu personaje.',
    'Config.Lighting = {',
    `    Ambient = ${colorExpr(spec.colors[1] || accent, [60, 60, 80])},`,
    '    Brightness = 2,',
    '    FogEnd = 400,',
    '}',
    '',
    'return Config',
    '',
  ].join('\n');
}

function uiFile() {
  return [
    '-- 02-UI.luau :: ModuleScript en ReplicatedStorage',
    '-- Construye la interfaz con instancias reales de Roblox (ScreenGui, Frame, TextButton...).',
    'local TweenService = game:GetService("TweenService")',
    'local Config = require(script.Parent:WaitForChild("01-Config"))',
    '',
    'local UI = {}',
    '',
    'local function corner(parent, radius)',
    '    local c = Instance.new("UICorner")',
    '    c.CornerRadius = UDim.new(0, radius)',
    '    c.Parent = parent',
    '    return c',
    'end',
    '',
    '-- Crea la ventana principal y devuelve una API para botones y estado.',
    'function UI.build(player)',
    '    local gui = Instance.new("ScreenGui")',
    '    gui.Name = Config.ProjectName .. "_UI"',
    '    gui.ResetOnSpawn = false',
    '    gui.IgnoreGuiInset = true',
    '    gui.DisplayOrder = 10',
    '    gui.Parent = player:WaitForChild("PlayerGui")',
    '',
    '    local main = Instance.new("Frame")',
    '    main.Name = "Main"',
    '    main.Size = UDim2.new(0, 320, 0, 430)',
    '    main.Position = UDim2.new(0, 24, 0.5, -215)',
    '    main.BackgroundColor3 = Config.Colors.Background',
    '    main.BackgroundTransparency = 0.12',
    '    main.BorderSizePixel = 0',
    '    main.Parent = gui',
    '    corner(main, 12)',
    '',
    '    local title = Instance.new("TextLabel")',
    '    title.Name = "Title"',
    '    title.Size = UDim2.new(1, -24, 0, 34)',
    '    title.Position = UDim2.new(0, 12, 0, 10)',
    '    title.BackgroundTransparency = 1',
    '    title.Text = Config.ProjectName',
    '    title.TextColor3 = Config.Colors.Accent',
    '    title.Font = Enum.Font.SourceSansBold',
    '    title.TextSize = 18',
    '    title.TextXAlignment = Enum.TextXAlignment.Left',
    '    title.Parent = main',
    '',
    '    local subtitle = Instance.new("TextLabel")',
    '    subtitle.Name = "Subtitle"',
    '    subtitle.Size = UDim2.new(1, -24, 0, 20)',
    '    subtitle.Position = UDim2.new(0, 12, 0, 42)',
    '    subtitle.BackgroundTransparency = 1',
    '    subtitle.Text = Config.Game .. "  •  " .. Config.Design',
    '    subtitle.TextColor3 = Config.Colors.Text',
    '    subtitle.Font = Enum.Font.SourceSans',
    '    subtitle.TextSize = 11',
    '    subtitle.TextXAlignment = Enum.TextXAlignment.Left',
    '    subtitle.Parent = main',
    '',
    '    local status = Instance.new("TextLabel")',
    '    status.Name = "Status"',
    '    status.Size = UDim2.new(1, -24, 0, 34)',
    '    status.Position = UDim2.new(0, 12, 1, -42)',
    '    status.BackgroundTransparency = 1',
    '    status.Text = "Listo · " .. Config.ToggleKey .. " para ocultar"',
    '    status.TextColor3 = Config.Colors.Secondary',
    '    status.Font = Enum.Font.SourceSans',
    '    status.TextSize = 12',
    '    status.TextWrapped = true',
    '    status.Parent = main',
    '',
    '    local buttons = {}',
    '    local function addButton(key, text, order, callback)',
    '        local b = Instance.new("TextButton")',
    '        b.Name = key',
    '        b.Size = UDim2.new(1, -24, 0, 34)',
    '        b.Position = UDim2.new(0, 12, 0, 70 + (order - 1) * 40)',
    '        b.BackgroundColor3 = Config.Colors.Secondary',
    '        b.BackgroundTransparency = 0.15',
    '        b.TextColor3 = Config.Colors.Text',
    '        b.Font = Enum.Font.SourceSansBold',
    '        b.TextSize = 13',
    '        b.Text = text',
    '        b.Parent = main',
    '        corner(b, 8)',
    '',
    '        if Config.Features.Animations then',
    '            b.MouseEnter:Connect(function()',
    '                TweenService:Create(b, TweenInfo.new(0.15), { BackgroundTransparency = 0 }):Play()',
    '            end)',
    '            b.MouseLeave:Connect(function()',
    '                TweenService:Create(b, TweenInfo.new(0.15), { BackgroundTransparency = 0.15 }):Play()',
    '            end)',
    '        end',
    '',
    '        b.MouseButton1Click:Connect(function()',
    '            callback(b)',
    '        end)',
    '        buttons[key] = b',
    '        return b',
    '    end',
    '',
    '    local function setButtonText(key, text)',
    '        local b = buttons[key]',
    '        if b then b.Text = text end',
    '    end',
    '',
    '    local function toggle()',
    '        gui.Enabled = not gui.Enabled',
    '    end',
    '',
    '    return { Gui = gui, Main = main, Status = status, Buttons = buttons, AddButton = addButton, SetButtonText = setButtonText, Toggle = toggle }',
    'end',
    '',
    'return UI',
    '',
  ].join('\n');
}

function clientFile(spec) {
  const uiRequire = spec.features.gui
    ? [
        'local UI = require(ReplicatedStorage:WaitForChild("02-UI"))',
        'local guiApi = UI.build(player)',
      ].join('\n')
    : 'local guiApi = nil';

  const panelButtons = spec.features.config && spec.features.gui
    ? [
        '    if Config.Features.VisualEffects then',
        '        guiApi.AddButton("effects", "EFECTOS: OFF", 1, function(b)',
        '            state.effects = not state.effects',
        '            applyTint(state.effects)',
        '            guiApi.SetButtonText("effects", "EFECTOS: " .. (state.effects and "ON" or "OFF"))',
        '        end)',
        '    end',
        '    if Config.Features.Lighting then',
        '        guiApi.AddButton("lighting", "LUZ LOCAL: OFF", 2, function(b)',
        '            state.lighting = not state.lighting',
        '            applyLighting(state.lighting)',
        '            guiApi.SetButtonText("lighting", "LUZ LOCAL: " .. (state.lighting and "ON" or "OFF"))',
        '        end)',
        '    end',
        '    if Config.Features.Mechanics then',
        '        guiApi.AddButton("speed", "VELOCIDAD: OFF", 3, function(b)',
        '            state.speed = not state.speed',
        '            applySpeed(state.speed)',
        '            guiApi.SetButtonText("speed", "VELOCIDAD: " .. (state.speed and "ON" or "OFF"))',
        '        end)',
        '    end',
      ].join('\n')
    : '';

  const serverButtons = spec.features.admin && spec.features.gui && spec.ownerId
    ? [
        '    if actionEvent then',
        '        guiApi.AddButton("announce", "ANUNCIAR (OWNER)", 6, function()',
        '            actionEvent:FireServer("announce", "Mensaje enviado por " .. player.Name)',
        '            setStatus("Anuncio enviado al servidor")',
        '        end)',
        '        if Config.Features.Mechanics then',
        '            guiApi.AddButton("srvSpeed", "SPEED SERVER (OWNER)", 7, function()',
        '                actionEvent:FireServer("setWalkSpeed", player.Name, Config.WalkSpeed)',
        '            end)',
        '        end',
        '        if Config.Features.Lighting then',
        `            guiApi.AddButton("srvLight", "LUZ SERVER (OWNER)", 8, function()`,
        `                actionEvent:FireServer("setLighting", ${q(spec.colors[1])}, Config.Lighting.Brightness)`,
        '            end)',
        '        end',
        '        if Config.Features.ObjectMods then',
        '            guiApi.AddButton("srvPart", "COLOR PARTE (OWNER)", 9, function()',
        '                actionEvent:FireServer("setPartColor", Config.ObjectPartName, ' +
          q(spec.colors[2]) +
          ')',
        '            end)',
        '        end',
        '    else',
        '        guiApi.AddButton("noServer", "SERVIDOR NO INSTALADO", 6, function()',
        '            setStatus("Coloca 04-Server.luau en ServerScriptService")',
        '        end)',
        '    end',
      ].join('\n')
    : '';

  const inputBlock = spec.features.interaction
    ? [
        'if Config.Features.Interaction then',
        '    UserInputService.InputBegan:Connect(function(input, processed)',
        '        if processed then return end',
        '        local wanted = Enum.KeyCode[Config.ToggleKey] or Enum.KeyCode.F5',
        '        if input.KeyCode == wanted then',
        '            if guiApi then',
        '                guiApi.Toggle()',
        '            else',
        '                state.effects = not state.effects',
        '                applyTint(state.effects)',
        '                setStatus("Efectos: " .. (state.effects and "ON" or "OFF"))',
        '            end',
        '        end',
        '    end)',
        'end',
      ].join('\n')
    : '';

  const notifyBlock = [
    'if notifyEvent then',
    '    notifyEvent.OnClientEvent:Connect(function(message)',
    '        setStatus(tostring(message))',
    '    end)',
    'end',
  ].join('\n');

  return [
    '-- 03-Client.luau :: LocalScript en StarterPlayer > StarterPlayerScripts',
    '-- Generado por ZENITSU BOT. Un LocalScript SOLO afecta al jugador local.',
    'local Players = game:GetService("Players")',
    'local TweenService = game:GetService("TweenService")',
    'local UserInputService = game:GetService("UserInputService")',
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    'local Lighting = game:GetService("Lighting")',
    '',
    'local Config = require(ReplicatedStorage:WaitForChild("01-Config"))',
    'local player = Players.LocalPlayer',
    '',
    'local remotes = ReplicatedStorage:FindFirstChild("ZenitsuRemotes") or ReplicatedStorage:WaitForChild("ZenitsuRemotes", 5)',
    'local actionEvent = remotes and remotes:FindFirstChild("Action")',
    'local notifyEvent = remotes and remotes:FindFirstChild("Notify")',
    '',
    uiRequire,
    '',
    'local state = { effects = false, lighting = false, speed = false, savedLighting = nil, savedColors = {} }',
    '',
    '-- Muestra el estado en la GUI y en la consola (útil si la GUI está desactivada).',
    'local function setStatus(text)',
    '    if guiApi and guiApi.Status then guiApi.Status.Text = text end',
    '    print("[ZENITSU] " .. tostring(text))',
    'end',
    '',
    '-- Guarda los valores originales de Lighting para poder restaurarlos.',
    'local function captureLighting()',
    '    if state.savedLighting then return end',
    '    state.savedLighting = {',
    '        Ambient = Lighting.Ambient,',
    '        Brightness = Lighting.Brightness,',
    '        FogEnd = Lighting.FogEnd,',
    '    }',
    'end',
    '',
    '-- Aplica o restaura la iluminación. Es LOCAL: otros jugadores no la ven.',
    'local function applyLighting(on)',
    '    if not Config.Features.Lighting then return end',
    '    if on then',
    '        captureLighting()',
    '        Lighting.Ambient = Config.Lighting.Ambient',
    '        Lighting.Brightness = Config.Lighting.Brightness',
    '        Lighting.FogEnd = Config.Lighting.FogEnd',
    '    elseif state.savedLighting then',
    '        Lighting.Ambient = state.savedLighting.Ambient',
    '        Lighting.Brightness = state.savedLighting.Brightness',
    '        Lighting.FogEnd = state.savedLighting.FogEnd',
    '    end',
    '    setStatus("Iluminación local: " .. (on and "ON" or "OFF"))',
    'end',
    '',
    '-- Colorea las partes del personaje con TweenService. Solo se ve en este cliente.',
    'local function applyTint(on)',
    '    if not Config.Features.VisualEffects then return end',
    '    local character = player.Character',
    '    if not character then return end',
    '    if on then',
    '        for _, part in ipairs(character:GetDescendants()) do',
    '            if part:IsA("BasePart") and state.savedColors[part] == nil then',
    '                state.savedColors[part] = part.Color',
    '                TweenService:Create(part, TweenInfo.new(0.35), { Color = Config.Colors.Accent }):Play()',
    '            end',
    '        end',
    '    else',
    '        for part, color in pairs(state.savedColors) do',
    '            if part.Parent then',
    '                TweenService:Create(part, TweenInfo.new(0.35), { Color = color }):Play()',
    '            end',
    '        end',
    '        state.savedColors = {}',
    '    end',
    '    setStatus("Efectos visuales: " .. (on and "ON" or "OFF"))',
    'end',
    '',
    '-- Cambia la velocidad del Humanoid local. No modifica al servidor.',
    'local function applySpeed(on)',
    '    if not Config.Features.Mechanics then return end',
    '    local character = player.Character',
    '    local humanoid = character and character:FindFirstChild("Humanoid")',
    '    if humanoid then humanoid.WalkSpeed = on and Config.WalkSpeed or 16 end',
    '    setStatus("Velocidad local: " .. (on and tostring(Config.WalkSpeed) or "16"))',
    'end',
    '',
    panelButtons,
    '',
    serverButtons,
    '',
    'player.CharacterAdded:Connect(function(character)',
    '    character:WaitForChild("Humanoid")',
    '    if state.speed then task.wait(0.1); applySpeed(true) end',
    '    if state.effects then task.wait(0.1); applyTint(true) end',
    'end)',
    '',
    inputBlock,
    '',
    notifyBlock,
    '',
    'setStatus("Proyecto cargado · " .. Config.ProjectName)',
    '',
  ].filter((line) => line !== '').join('\n');
}

function serverFile(spec) {
  return [
    '-- 04-Server.luau :: Script en ServerScriptService',
    '-- Generado por ZENITSU BOT. Requiere que la experiencia sea tuya o que tengas permiso en Studio.',
    '-- Todas las acciones están protegidas por AllowedOwnerUserId (0 = desactivado).',
    'local Players = game:GetService("Players")',
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    'local Lighting = game:GetService("Lighting")',
    '',
    'local Config = require(ReplicatedStorage:WaitForChild("01-Config"))',
    '',
    '-- Crea los RemoteEvents con nombres fijos; el cliente los detecta automáticamente.',
    'local remotes = ReplicatedStorage:FindFirstChild("ZenitsuRemotes")',
    'if not remotes then',
    '    remotes = Instance.new("Folder")',
    '    remotes.Name = "ZenitsuRemotes"',
    '    remotes.Parent = ReplicatedStorage',
    'end',
    '',
    'local action = remotes:FindFirstChild("Action")',
    'if not action then',
    '    action = Instance.new("RemoteEvent")',
    '    action.Name = "Action"',
    '    action.Parent = remotes',
    'end',
    '',
    'local notify = remotes:FindFirstChild("Notify")',
    'if not notify then',
    '    notify = Instance.new("RemoteEvent")',
    '    notify.Name = "Notify"',
    '    notify.Parent = remotes',
    'end',
    '',
    '-- Convierte "#RRGGBB" a Color3. Devuelve nil si el formato es inválido.',
    'local function hexColor(hex)',
    '    local s = tostring(hex or ""):gsub("#", "")',
    '    if #s ~= 6 then return nil end',
    '    local r = tonumber(s:sub(1, 2), 16)',
    '    local g = tonumber(s:sub(3, 4), 16)',
    '    local b = tonumber(s:sub(5, 6), 16)',
    '    if not r or not g or not b then return nil end',
    '    return Color3.fromRGB(r, g, b)',
    'end',
    '',
    'local function clamp(value, minValue, maxValue)',
    '    return math.clamp(tonumber(value) or minValue, minValue, maxValue)',
    'end',
    '',
    'local function findPlayer(name)',
    '    local wanted = string.lower(tostring(name or ""))',
    '    for _, p in ipairs(Players:GetPlayers()) do',
    '        if string.lower(p.Name) == wanted or string.lower(p.DisplayName) == wanted then',
    '            return p',
    '        end',
    '    end',
    '    return nil',
    'end',
    '',
    '-- El dueño se define en 01-Config.luau con su UserId de Roblox.',
    'local function authorised(player)',
    '    if Config.AllowedOwnerUserId == 0 then return false end',
    '    return player.UserId == Config.AllowedOwnerUserId',
    'end',
    '',
    '-- Ejecuta una acción autorizada. Nunca confía en permisos del cliente.',
    'action.OnServerEvent:Connect(function(player, actionName, a, b)',
    '    if not authorised(player) then',
    '        notify:FireClient(player, "Sin permiso: configura AllowedOwnerUserId en 01-Config")',
    '        return',
    '    end',
    '',
    '    if actionName == "announce" then',
    '        notify:FireAllClients("[ADMIN] " .. tostring(a))',
    '        return',
    '    end',
    '',
    '    if actionName == "setWalkSpeed" or actionName == "setJumpPower" then',
    '        local target = findPlayer(a)',
    '        local humanoid = target and target.Character and target.Character:FindFirstChild("Humanoid")',
    '        if not humanoid then',
    '            notify:FireClient(player, "No encontré el Humanoid de " .. tostring(a))',
    '            return',
    '        end',
    '        if actionName == "setWalkSpeed" then',
    '            humanoid.WalkSpeed = clamp(b, 4, 200)',
    '            notify:FireClient(player, "WalkSpeed de " .. target.Name .. ": " .. humanoid.WalkSpeed)',
    '        else',
    '            humanoid.JumpPower = clamp(b, 0, 200)',
    '            notify:FireClient(player, "JumpPower de " .. target.Name .. ": " .. humanoid.JumpPower)',
    '        end',
    '        return',
    '    end',
    '',
    '    if actionName == "teleportSpawn" then',
    '        local target = findPlayer(a)',
    '        local hrp = target and target.Character and target.Character:FindFirstChild("HumanoidRootPart")',
    '        local spawn = workspace:FindFirstChild("SpawnLocation")',
    '        if hrp and spawn then',
    '            hrp.CFrame = spawn.CFrame + Vector3.new(0, 4, 0)',
    '            notify:FireClient(player, target.Name .. " enviado al Spawn")',
    '        else',
    '            notify:FireClient(player, "No encontré SpawnLocation o HumanoidRootPart")',
    '        end',
    '        return',
    '    end',
    '',
    '    if actionName == "setLighting" then',
    '        local color = hexColor(a)',
    '        if color then Lighting.Ambient = color end',
    '        Lighting.Brightness = clamp(b, 0, 10)',
    '        notify:FireClient(player, "Iluminación del servidor actualizada")',
    '        return',
    '    end',
    '',
    '    if actionName == "setPartColor" then',
    '        local color = hexColor(b)',
    '        if not color then',
    '            notify:FireClient(player, "Color HEX inválido")',
    '            return',
    '        end',
    '        local found = false',
    '        for _, obj in ipairs(workspace:GetDescendants()) do',
    '            if obj:IsA("BasePart") and obj.Name == tostring(a) then',
    '                obj.Color = color',
    '                found = true',
    '                break',
    '            end',
    '        end',
    '        notify:FireClient(player, found and "Parte actualizada" or "No encontré la parte " .. tostring(a))',
    '        return',
    '    end',
    '',
    '    notify:FireClient(player, "Acción desconocida: " .. tostring(actionName))',
    'end)',
    '',
    'print("[ZENITSU] Servidor listo · " .. Config.ProjectName)',
    '',
  ].join('\n');
}

function readmeFile(spec, aiError) {
  const featureLines = Object.entries(spec.features)
    .map(([k, v]) => `• ${k}: ${v ? 'activado' : 'desactivado'}`)
    .join('\n');
  const fnLines = spec.plan.funciones.length
    ? spec.plan.funciones
        .map((f, i) => `${i + 1}. *${f.nombre}* — ${f.que_hace} _(requisito: ${f.requisito})_`)
        .join('\n')
    : '1. No se detectaron funciones específicas; se generó una base segura y funcional.';
  const limitLines = spec.plan.limitaciones.map((x) => `• ${x}`).join('\n');
  const aiLine = aiError
    ? `⚠️ La IA no estuvo disponible (${aiError}). El plan se generó con análisis local; el código es el mismo.`
    : '✅ Plan analizado por la IA integrada del bot.';
  return [
    `# ${spec.name}`,
    '',
    `**Juego:** ${spec.game}`,
    `**Diseño:** ${spec.design || 'Moderno'}`,
    `**Colores:** ${spec.colors.join(' · ')}`,
    `**Generado por:** ZENITSU BOT`,
    '',
    aiLine,
    '',
    '## Resumen',
    spec.plan.resumen,
    '',
    '## Funciones',
    fnLines,
    '',
    '## Funcionalidades activadas',
    featureLines,
    '',
    '## Instalación en Roblox Studio',
    '1. Abre tu experiencia en Roblox Studio.',
    '2. Inserta un `ModuleScript` en `ReplicatedStorage` con el contenido de `01-Config.luau` y nómbralo exactamente `01-Config`.',
    spec.features.gui
      ? '3. Inserta otro `ModuleScript` en `ReplicatedStorage` con `02-UI.luau` y nómbralo `02-UI`.'
      : '3. No necesitas `02-UI`: desactivaste la GUI.',
    '4. Inserta un `LocalScript` en `StarterPlayer > StarterPlayerScripts` con `03-Client.luau`.',
    '5. Inserta un `Script` en `ServerScriptService` con `04-Server.luau` (solo si quieres herramientas de servidor).',
    `6. En \`01-Config\`, cambia \`AllowedOwnerUserId\` por tu UserId de Roblox para habilitar las herramientas de servidor. Si lo dejas en 0, nadie puede usarlas.`,
    `7. Prueba en Studio: el atajo es **${spec.toggleKey}**. Revisa la pestaña Output si algo no aparece.`,
    '',
    '## Dependencias',
    '• Ninguna dependencia externa. Solo servicios incluidos en Roblox: Players, TweenService, UserInputService, ReplicatedStorage, Lighting y RemoteEvent.',
    '',
    '## Permisos y límites reales',
    limitLines,
    `• Si no eres dueño de la experiencia, no puedes instalar el Script del servidor. En ese caso el cliente sigue funcionando, pero las herramientas de administración no.`,
    '• La persistencia entre sesiones requiere DataStoreService en el servidor; este proyecto usa configuración en memoria. Si quieres guardado permanente, pídele al bot una versión con DataStore.',
    '',
    '## Notas de seguridad',
    '• El servidor valida `AllowedOwnerUserId` en cada RemoteEvent; el cliente no puede otorgarse permisos.',
    '• No se usan exploits, ni RemoteEvents de terceros, ni funciones inexistentes.',
    '',
  ].join('\n');
}

export function buildProject(answers, plan, aiError = '') {
  const features = detectFeatures(answers);
  const spec = {
    name: clean(answers.name, 70) || clean(plan.nombre_sugerido, 70) || 'ZENITSU SCRIPT',
    game: detectGame(answers),
    design: clean(answers.design, 120) || 'Moderno',
    colors: detectColors(answers),
    toggleKey: detectToggleKey(answers),
    ownerId: detectOwnerId(answers),
    features,
    plan: plan || fallbackPlan(answers),
  };

  const files = [{ name: '01-Config.luau', content: configFile(spec) }];
  if (features.gui) files.push({ name: '02-UI.luau', content: uiFile() });
  files.push(
    { name: features.gui ? '03-Client.luau' : '02-Client.luau', content: clientFile(spec) },
    { name: features.gui ? '04-Server.luau' : '03-Server.luau', content: serverFile(spec) },
    { name: 'README-ZENITSU.md', content: readmeFile(spec, aiError) },
  );
  return { spec, files };
}

/* ────────────────────────── Entrega ────────────────────────── */

async function sendProject(ctx, project) {
  const { spec, files } = project;
  const safe = String(spec.name)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'zenitsu-script';

  // Los módulos se require por nombre fijo (01-Config, 02-UI). Si se renombran
  // al subirlos, Roblox Studio no encontraría los módulos. El nombre del
  // proyecto va en el caption y en el README, no en el fileName.
  await ctx.reply(
    [
      '✅ *PROYECTO LUAU GENERADO*',
      '━━━━━━━━━━━━━━━━━━━━',
      `📛 Nombre: *${spec.name}*`,
      `🎮 Juego: *${spec.game}*`,
      `🎨 Colores: ${spec.colors.join(' · ')}`,
      `🖥️ GUI: ${spec.features.gui ? 'sí' : 'no'} · Atajo: ${spec.toggleKey}`,
      `📦 Archivos: ${files.length} (enviados en mensajes separados)`,
      '',
      '_Abre los archivos numerados en orden. El README explica dónde va cada uno._',
    ].join('\n'),
  );

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = file.name.endsWith('.md') ? `README-${safe}.md` : file.name;
    const caption = `📄 ${i + 1}/${files.length} · ${file.name} · ${spec.name}`;
    await ctx.send({
      document: Buffer.from(file.content, 'utf8'),
      mimetype: 'text/plain',
      fileName,
      caption,
    });
  }
}

export async function generateAndDeliver(ctx, session) {
  await ctx.live({ text: '🧠 Analizando tus respuestas...' });
  let plan;
  let aiError = '';
  try {
    plan = await analyzeWithAi(session.answers);
  } catch (err) {
    aiError = err?.message || 'error de IA';
    plan = fallbackPlan(session.answers);
  }
  await ctx.progress('🔎 Validando APIs reales de Roblox...');
  await sleep(250);
  await ctx.progress('⚙️ Generando archivos Luau...');
  const project = buildProject(session.answers, plan, aiError);
  session.completed = true;
  session.version += 1;
  session.lastProject = project;
  session.lastAt = Date.now();
  await ctx.progress(`✅ ${project.spec.name} listo · ${project.files.length} archivos`);
  await sendProject(ctx, project);
  return project;
}

/* ────────────────────────── Captura de respuestas ────────────────────────── */

export async function editScriptAnswer(ctx, session, text) {
  const m = text.match(/^(?:editar|modificar|cambiar)\s+(\d+)\s+([\s\S]+)$/i);
  if (!m) return false;
  const n = Number(m[1]);
  const value = clean(m[2], 300);
  if (!Number.isInteger(n) || n < 1 || n > SCRIPT_QUESTIONS.length || !value) {
    await ctx.reply(`❌ Uso: *editar N nueva respuesta* (N entre 1 y ${SCRIPT_QUESTIONS.length}).`);
    return true;
  }
  const idx = n - 1;
  const q = SCRIPT_QUESTIONS[idx];
  session.answers[q.id] = value;
  if (idx >= session.step) session.step = idx + 1;
  session.lastAt = Date.now();
  if (session.step >= SCRIPT_QUESTIONS.length) {
    await generateAndDeliver(ctx, session);
  } else {
    await ctx.reply(`✏️ Respuesta ${n} actualizada.\n\n${questionText(session.step, session)}`);
  }
  return true;
}

export async function captureScriptReply(ctx, m) {
  if (m.fromMe) return false;
  const session = getScriptSession(ctx);
  if (!session) return false;
  const text = String(m.body || '').trim();
  if (!text) return false;

  if (/^(estado|status|progreso)$/i.test(text)) {
    await ctx.reply(sessionStatusText(session));
    return true;
  }
  if (/^(cancelar|cancel|salir)$/i.test(text)) {
    cancelScriptSession(ctx);
    await ctx.reply('🛑 Proceso de .crearscript cancelado.');
    return true;
  }
  if (/^(version|regenerar|nueva versi[oó]n|otra versi[oó]n)$/i.test(text)) {
    if (!session.completed) {
      await ctx.reply('⏳ Aún no terminaste las 7 preguntas. Responde la pregunta actual.');
      return true;
    }
    await generateAndDeliver(ctx, session);
    return true;
  }
  if (await editScriptAnswer(ctx, session, text)) return true;

  if (session.step >= SCRIPT_QUESTIONS.length) {
    await ctx.reply(
      '✅ El proyecto ya está listo. Escribe *version* para generar otra versión o *.crearscript* para empezar uno nuevo.',
    );
    return true;
  }

  const q = SCRIPT_QUESTIONS[session.step];
  session.answers[q.id] = clean(text, 400);
  session.step += 1;
  session.lastAt = Date.now();

  if (session.step < SCRIPT_QUESTIONS.length) {
    await ctx.reply(questionText(session.step, session));
    return true;
  }

  await generateAndDeliver(ctx, session);
  return true;
}
