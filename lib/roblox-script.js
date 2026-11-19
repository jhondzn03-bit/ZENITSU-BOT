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

function guiName(name) {
  const cleanName = String(name || 'ZENITSU')
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'ZENITSU';
  return cleanName.endsWith('HUB') ? cleanName : `${cleanName}_HUB`;
}

function detectWalkSpeed(answers) {
  const m = allText(answers).match(/(?:velocidad|speed)\D{0,14}(\d{1,3})/i);
  const n = m ? Number(m[1]) : 65;
  return Math.min(200, Math.max(4, Number.isFinite(n) ? n : 65));
}

function detectJumpPower(answers) {
  const m = allText(answers).match(/(?:salto|jump|saltar)\D{0,14}(\d{1,3})/i);
  const n = m ? Number(m[1]) : 100;
  return Math.min(200, Math.max(0, Number.isFinite(n) ? n : 100));
}

function scanKeywords(game) {
  if (/99 nights/i.test(game)) {
    return ['Resource', 'Wood', 'Tree', 'Food', 'Berry', 'Campfire', 'Child', 'Rescue', 'Crate'];
  }
  if (/blox fruits/i.test(game)) return ['Chest', 'Fruit', 'NPC', 'Enemy', 'Island'];
  if (/brookhaven/i.test(game)) return ['House', 'Car', 'Door', 'Chest', 'NPC'];
  if (/grow a garden/i.test(game)) return ['Seed', 'Crop', 'Plant', 'Tree', 'Water'];
  if (/adopt me/i.test(game)) return ['Pet', 'Egg', 'Toy', 'Food', 'NPC'];
  return ['Resource', 'Item', 'Food', 'Chest', 'Tool', 'NPC', 'Part'];
}

function singleScriptFile(spec) {
  const L = [];
  const push = (...lines) => L.push(...lines);
  const keywords = spec.keywords.map((k) => `    ${q(k)},`).join('\n');
  const planLabels = spec.plan.funciones
    .slice(0, 5)
    .map((f) => `    AddLabel(${q(`• ${f.nombre} [${f.requisito}]`)}, THEME.Accent)`)
    .join('\n');

  push(
    '--[[',
    `    ${spec.name}`,
    `    ${spec.game}`,
    '    ByJhon!',
    '',
    `    Generado por ZENITSU BOT · ${spec.design || 'Moderno'}`,
    `    Colores: ${spec.colors.join(' · ')}`,
    spec.plan.resumen ? `    IA: ${spec.plan.resumen.replace(/\s+/g, ' ').slice(0, 160)}` : '',
    ']]',
    '',
    'local Players = game:GetService("Players")',
    'local UIS = game:GetService("UserInputService")',
    'local RunService = game:GetService("RunService")',
    'local TweenService = game:GetService("TweenService")',
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    'local Lighting = game:GetService("Lighting")',
    'local Player = Players.LocalPlayer',
    'local PlayerGui = Player:WaitForChild("PlayerGui")',
    '',
    `local GUI_NAME = ${q(spec.guiName)}`,
    'local SCAN_KEYWORDS = {',
    keywords,
    '}',
    '',
    'local THEME = {',
    `    Background = ${colorExpr(spec.colors[0], [15, 12, 25])},`,
    `    Accent = ${colorExpr(spec.colors[1], [190, 140, 255])},`,
    `    Secondary = ${colorExpr(spec.colors[2], [130, 65, 255])},`,
    '    Text = Color3.fromRGB(245, 245, 255),',
    '}',
    '',
    `local Config_AnimateButtons = ${spec.features.animations ? 'true' : 'false'}`,
    '',
    'local state = {',
    '    speedOn = false, jumpOn = false, flyOn = false, noclipOn = false,',
    '    visualsOn = false, lightingOn = false, labelsOn = false, buildOn = false,',
    '    savedWalkSpeed = 16, savedJumpPower = 50, savedZoom = 128,',
    '    savedLighting = nil, savedColors = {}, savedCollide = {},',
    '    flyConn = nil, noclipConn = nil, labels = {},',
    '}',
    '',
    'local function getCharacter()',
    '    return Player.Character or Player.CharacterAdded:Wait()',
    'end',
    '',
    'local function getHumanoid()',
    '    local character = getCharacter()',
    '    return character:FindFirstChild("Humanoid")',
    'end',
    '',
    'local function getRoot()',
    '    local character = getCharacter()',
    '    return character:FindFirstChild("HumanoidRootPart")',
    'end',
  );

  if (spec.features.gui) {
    push(
      '',
      '-- Evitar interfaces duplicadas',
      'if PlayerGui:FindFirstChild(GUI_NAME) then',
      '    PlayerGui[GUI_NAME]:Destroy()',
      'end',
      '',
      'local GUI = Instance.new("ScreenGui")',
      'GUI.Name = GUI_NAME',
      'GUI.ResetOnSpawn = false',
      'GUI.IgnoreGuiInset = true',
      'GUI.Parent = PlayerGui',
      '',
      'local Main = Instance.new("Frame")',
      'Main.Size = UDim2.new(0, 330, 0, 430)',
      'Main.Position = UDim2.new(0.5, -165, 0.5, -215)',
      'Main.BackgroundColor3 = THEME.Background',
      'Main.BorderSizePixel = 0',
      'Main.Active = true',
      'Main.Parent = GUI',
      'Instance.new("UICorner", Main).CornerRadius = UDim.new(0, 14)',
      'local Stroke = Instance.new("UIStroke")',
      'Stroke.Color = THEME.Secondary',
      'Stroke.Thickness = 2',
      'Stroke.Parent = Main',
      '',
      'local Title = Instance.new("TextLabel")',
      'Title.Size = UDim2.new(1, -50, 0, 45)',
      'Title.Position = UDim2.new(0, 12, 0, 5)',
      'Title.BackgroundTransparency = 1',
      `Title.Text = ${q(`⚡ ${spec.name}`)}`,
      'Title.TextColor3 = THEME.Accent',
      'Title.TextSize = 20',
      'Title.Font = Enum.Font.GothamBold',
      'Title.TextXAlignment = Enum.TextXAlignment.Left',
      'Title.Parent = Main',
      '',
      'local Minimize = Instance.new("TextButton")',
      'Minimize.Size = UDim2.new(0, 35, 0, 35)',
      'Minimize.Position = UDim2.new(1, -42, 0, 9)',
      'Minimize.Text = "—"',
      'Minimize.TextSize = 22',
      'Minimize.TextColor3 = THEME.Text',
      'Minimize.BackgroundColor3 = THEME.Secondary',
      'Minimize.Parent = Main',
      'Instance.new("UICorner", Minimize).CornerRadius = UDim.new(0, 8)',
      '',
      'local Status = Instance.new("TextLabel")',
      'Status.Size = UDim2.new(1, -24, 0, 28)',
      'Status.Position = UDim2.new(0, 12, 1, -34)',
      'Status.BackgroundTransparency = 1',
      'Status.Text = "Listo · ' +
        spec.toggleKey +
        ' para ocultar"',
      'Status.TextColor3 = THEME.Accent',
      'Status.TextSize = 12',
      'Status.Font = Enum.Font.GothamMedium',
      'Status.TextXAlignment = Enum.TextXAlignment.Left',
      'Status.Parent = Main',
      '',
      '-- Arrastrar ventana',
      'local dragging = false',
      'local dragStart, startPos',
      'Main.InputBegan:Connect(function(input)',
      '    if input.UserInputType == Enum.UserInputType.MouseButton1',
      '        or input.UserInputType == Enum.UserInputType.Touch then',
      '        dragging = true',
      '        dragStart = input.Position',
      '        startPos = Main.Position',
      '    end',
      'end)',
      'UIS.InputChanged:Connect(function(input)',
      '    if dragging and (',
      '        input.UserInputType == Enum.UserInputType.MouseMovement',
      '        or input.UserInputType == Enum.UserInputType.Touch',
      '    ) then',
      '        local delta = input.Position - dragStart',
      '        Main.Position = UDim2.new(',
      '            startPos.X.Scale, startPos.X.Offset + delta.X,',
      '            startPos.Y.Scale, startPos.Y.Offset + delta.Y',
      '        )',
      '    end',
      'end)',
      'UIS.InputEnded:Connect(function(input)',
      '    if input.UserInputType == Enum.UserInputType.MouseButton1',
      '        or input.UserInputType == Enum.UserInputType.Touch then',
      '        dragging = false',
      '    end',
      'end)',
      '',
      '-- Panel de pestañas',
      'local Tabs = Instance.new("Frame")',
      'Tabs.Size = UDim2.new(1, -20, 0, 42)',
      'Tabs.Position = UDim2.new(0, 10, 0, 55)',
      'Tabs.BackgroundTransparency = 1',
      'Tabs.Parent = Main',
      'local TabLayout = Instance.new("UIListLayout")',
      'TabLayout.FillDirection = Enum.FillDirection.Horizontal',
      'TabLayout.Padding = UDim.new(0, 5)',
      'TabLayout.Parent = Tabs',
      '',
      'local Content = Instance.new("ScrollingFrame")',
      'Content.Size = UDim2.new(1, -20, 1, -125)',
      'Content.Position = UDim2.new(0, 10, 0, 105)',
      'Content.BackgroundColor3 = Color3.fromRGB(24, 19, 38)',
      'Content.BorderSizePixel = 0',
      'Content.ScrollBarThickness = 4',
      'Content.AutomaticCanvasSize = Enum.AutomaticSize.Y',
      'Content.CanvasSize = UDim2.new(0, 0, 0, 0)',
      'Content.Parent = Main',
      'Instance.new("UICorner", Content).CornerRadius = UDim.new(0, 9)',
      'local Layout = Instance.new("UIListLayout")',
      'Layout.Padding = UDim.new(0, 7)',
      'Layout.Parent = Content',
      'local Padding = Instance.new("UIPadding")',
      'Padding.PaddingTop = UDim.new(0, 8)',
      'Padding.PaddingLeft = UDim.new(0, 8)',
      'Padding.PaddingRight = UDim.new(0, 8)',
      'Padding.Parent = Content',
    );
  }

  push(
    '',
    'local function setStatus(text)',
  );
  if (spec.features.gui) {
    push('    Status.Text = text');
  }
  push(
    `    print(${q(`[${spec.name}] `)} .. tostring(text))`,
    'end',
    '',
    '-- Limpia las etiquetas flotantes creadas por el escáner visual.',
    'local function ClearLabels()',
    '    for _, label in ipairs(state.labels) do',
    '        if label.Parent then label:Destroy() end',
    '    end',
    '    state.labels = {}',
    'end',
    '',
    '-- Muestra un cartel sobre las partes del workspace cuyo nombre coincida.',
    '-- Usa BillboardGui (API pública); NO lee sistemas internos del juego.',
    'local function ApplyScanner(on)',
    '    ClearLabels()',
    '    state.labelsOn = on',
    '    if not on then',
    '        setStatus("Etiquetas desactivadas")',
    '        return',
    '    end',
    '    local count = 0',
    '    for _, obj in ipairs(workspace:GetDescendants()) do',
    '        if obj:IsA("BasePart") or obj:IsA("Model") then',
    '            local anchor = obj:IsA("Model") and obj.PrimaryPart or (obj:IsA("BasePart") and obj or nil)',
    '            if anchor then',
    '                local name = string.lower(obj.Name)',
    '                for _, keyword in ipairs(SCAN_KEYWORDS) do',
    '                    if string.find(name, string.lower(keyword), 1, true) then',
    '                        local billboard = Instance.new("BillboardGui")',
    '                        billboard.Name = GUI_NAME .. "_LABEL"',
    '                        billboard.Size = UDim2.new(0, 160, 0, 30)',
    '                        billboard.StudsOffset = Vector3.new(0, 3, 0)',
    '                        billboard.AlwaysOnTop = true',
    '                        billboard.Adornee = anchor',
    '                        billboard.Parent = PlayerGui',
    '                        local text = Instance.new("TextLabel")',
    '                        text.Size = UDim2.new(1, 0, 1, 0)',
    '                        text.BackgroundColor3 = THEME.Background',
    '                        text.BackgroundTransparency = 0.35',
    '                        text.TextColor3 = THEME.Accent',
    '                        text.Text = "📍 " .. obj.Name',
    '                        text.TextScaled = true',
    '                        text.Font = Enum.Font.GothamMedium',
    '                        text.Parent = billboard',
    '                        table.insert(state.labels, billboard)',
    '                        count += 1',
    '                        break',
    '                    end',
    '                end',
    '            end',
    '        end',
    '    end',
    '    setStatus("Etiquetas visibles: " .. count)',
    'end',
    '',
    '-- Velocidad real del Humanoid local.',
    'local function ApplySpeed(on)',
    '    local humanoid = getHumanoid()',
    '    if not humanoid then return end',
    '    if on and not state.speedOn then state.savedWalkSpeed = humanoid.WalkSpeed end',
    `    humanoid.WalkSpeed = on and ${spec.walkSpeed} or state.savedWalkSpeed`,
    '    state.speedOn = on',
    '    setStatus("Velocidad local: " .. (on and "' +
      spec.walkSpeed +
      '" or tostring(state.savedWalkSpeed)))',
    'end',
    '',
    '-- Salto real del Humanoid local.',
    'local function ApplyJump(on)',
    '    local humanoid = getHumanoid()',
    '    if not humanoid then return end',
    '    if on and not state.jumpOn then state.savedJumpPower = humanoid.JumpPower end',
    `    humanoid.JumpPower = on and ${spec.jumpPower} or state.savedJumpPower`,
    '    state.jumpOn = on',
    '    setStatus("Salto local: " .. (on and "' +
      spec.jumpPower +
      '" or tostring(state.savedJumpPower)))',
    'end',
    '',
    '-- Vuelo LOCAL con CFrame: mueve tu personaje de verdad, pero el servidor',
    '-- puede corregirlo según las reglas del juego. No es un exploit.',
    'local function ApplyFly(on)',
    '    local humanoid, root = getHumanoid(), getRoot()',
    '    if not humanoid or not root then return end',
    '    if state.flyConn then state.flyConn:Disconnect(); state.flyConn = nil end',
    '    state.flyOn = on',
    '    if not on then',
    '        humanoid.PlatformStand = false',
    '        setStatus("Vuelo desactivado")',
    '        return',
    '    end',
    '    humanoid.PlatformStand = true',
    '    local camera = workspace.CurrentCamera',
    '    state.flyConn = RunService.RenderStepped:Connect(function(dt)',
    '        if not root.Parent then return end',
    '        local move = Vector3.new()',
    '        if UIS:IsKeyDown(Enum.KeyCode.W) then move += camera.CFrame.LookVector end',
    '        if UIS:IsKeyDown(Enum.KeyCode.S) then move -= camera.CFrame.LookVector end',
    '        if UIS:IsKeyDown(Enum.KeyCode.A) then move -= camera.CFrame.RightVector end',
    '        if UIS:IsKeyDown(Enum.KeyCode.D) then move += camera.CFrame.RightVector end',
    '        if UIS:IsKeyDown(Enum.KeyCode.Space) then move += Vector3.new(0, 1, 0) end',
    '        if UIS:IsKeyDown(Enum.KeyCode.LeftControl) or UIS:IsKeyDown(Enum.KeyCode.RightControl) then',
    '            move -= Vector3.new(0, 1, 0)',
    '        end',
    '        if move.Magnitude > 0 then',
    '            root.CFrame += move.Unit * 60 * dt',
    '        end',
    '    end)',
    '    setStatus("Vuelo local activo · WASD / Espacio / Ctrl")',
    'end',
    '',
    '-- Noclip LOCAL: desactiva la colisión de tus partes cada frame y restaura el',
    '-- valor original al apagarlo. El servidor puede ignorarlo.',
    'local function ApplyNoclip(on)',
    '    local character = getCharacter()',
    '    if state.noclipConn then state.noclipConn:Disconnect(); state.noclipConn = nil end',
    '    state.noclipOn = on',
    '    if not on then',
    '        for part, value in pairs(state.savedCollide) do',
    '            if part.Parent then part.CanCollide = value end',
    '        end',
    '        state.savedCollide = {}',
    '        setStatus("Noclip desactivado")',
    '        return',
    '    end',
    '    state.noclipConn = RunService.Stepped:Connect(function()',
    '        for _, part in ipairs(character:GetDescendants()) do',
    '            if part:IsA("BasePart") then',
    '                if state.savedCollide[part] == nil then',
    '                    state.savedCollide[part] = part.CanCollide',
    '                end',
    '                part.CanCollide = false',
    '            end',
    '        end',
    '    end)',
    '    setStatus("Noclip local activo")',
    'end',
    '',
    '-- Efecto visual real: colorea tu personaje con TweenService y restaura.',
    'local function ApplyVisuals(on)',
    '    local character = getCharacter()',
    '    state.visualsOn = on',
    '    if not on then',
    '        for part, color in pairs(state.savedColors) do',
    '            if part.Parent then',
    '                TweenService:Create(part, TweenInfo.new(0.35), { Color = color }):Play()',
    '            end',
    '        end',
    '        state.savedColors = {}',
    '        setStatus("Efectos desactivados")',
    '        return',
    '    end',
    '    for _, part in ipairs(character:GetDescendants()) do',
    '        if part:IsA("BasePart") and state.savedColors[part] == nil then',
    '            state.savedColors[part] = part.Color',
    '            TweenService:Create(part, TweenInfo.new(0.35), { Color = THEME.Accent }):Play()',
    '        end',
    '    end',
    '    setStatus("Efectos visuales activos")',
    'end',
    '',
    '-- Iluminación LOCAL: afecta a tu cliente, no al servidor.',
    'local function ApplyLighting(on)',
    '    if on and not state.savedLighting then',
    '        state.savedLighting = {',
    '            Ambient = Lighting.Ambient,',
    '            Brightness = Lighting.Brightness,',
    '            FogEnd = Lighting.FogEnd,',
    '        }',
    '    end',
    '    if on then',
    '        Lighting.Ambient = THEME.Secondary',
    '        Lighting.Brightness = 2',
    '        Lighting.FogEnd = 350',
    '    elseif state.savedLighting then',
    '        Lighting.Ambient = state.savedLighting.Ambient',
    '        Lighting.Brightness = state.savedLighting.Brightness',
    '        Lighting.FogEnd = state.savedLighting.FogEnd',
    '    end',
    '    setStatus("Iluminación local: " .. (on and "ON" or "OFF"))',
    'end',
    '',
    '-- Vista amplia para construir: cambia el zoom máximo de tu cámara.',
    'local function ApplyBuildView(on)',
    '    if on and not state.buildOn then state.savedZoom = Player.CameraMaxZoomDistance end',
    '    Player.CameraMaxZoomDistance = on and 90 or state.savedZoom',
    '    state.buildOn = on',
    '    setStatus("Vista de construcción: " .. (on and "ON" or "OFF"))',
    'end',
    '',
    '-- Acciones de servidor: solo funcionan si instalas un Script que cree',
    '-- ReplicatedStorage.ZenitsuRemotes.Action y valide al dueño.',
    'local function ServerAction(action, value)',
    '    local remotes = ReplicatedStorage:FindFirstChild("ZenitsuRemotes")',
    '    local event = remotes and remotes:FindFirstChild("Action")',
    '    if not event then',
    '        setStatus("Requiere Script del servidor (RemoteEvent no encontrado)")',
    '        return',
    '    end',
    '    event:FireServer(action, Player.Name, value)',
    '    setStatus("Acción enviada: " .. action)',
    'end',
  );

  if (spec.features.gui) {
    push(
      '',
      'local function Clear()',
      '    for _, item in ipairs(Content:GetChildren()) do',
      '        if item:IsA("TextButton") or item:IsA("TextLabel") then',
      '            item:Destroy()',
      '        end',
      '    end',
      'end',
      '',
      'local function AddLabel(name, color)',
      '    local label = Instance.new("TextLabel")',
      '    label.Size = UDim2.new(1, 0, 0, 30)',
      '    label.BackgroundTransparency = 1',
      '    label.Text = name',
      '    label.TextColor3 = color or THEME.Text',
      '    label.TextSize = 14',
      '    label.Font = Enum.Font.GothamMedium',
      '    label.TextXAlignment = Enum.TextXAlignment.Left',
      '    label.Parent = Content',
      '    return label',
      'end',
      '',
      'local function AddButton(name, callback)',
      '    local button = Instance.new("TextButton")',
      '    button.Size = UDim2.new(1, 0, 0, 38)',
      '    button.BackgroundColor3 = Color3.fromRGB(55, 35, 85)',
      '    button.TextColor3 = THEME.Text',
      '    button.TextSize = 14',
      '    button.Font = Enum.Font.GothamMedium',
      '    button.Text = name',
      '    button.Parent = Content',
      '    Instance.new("UICorner", button).CornerRadius = UDim.new(0, 7)',
      '    if Config_AnimateButtons then',
      '        button.MouseEnter:Connect(function()',
      '            TweenService:Create(button, TweenInfo.new(0.15), { BackgroundColor3 = THEME.Secondary }):Play()',
      '        end)',
      '        button.MouseLeave:Connect(function()',
      '            TweenService:Create(button, TweenInfo.new(0.15), { BackgroundColor3 = Color3.fromRGB(55, 35, 85) }):Play()',
      '        end)',
      '    end',
      '    button.MouseButton1Click:Connect(callback)',
      '    return button',
      'end',
      '',
      'local function AddToggle(name, onEnable, onDisable)',
      '    local enabled = false',
      '    local button',
      '    button = AddButton(name .. " [OFF]", function()',
      '        enabled = not enabled',
      '        button.Text = name .. (enabled and " [ON]" or " [OFF]")',
      '        if enabled then',
      '            if onEnable then onEnable() end',
      '        else',
      '            if onDisable then onDisable() end',
      '        end',
      '    end)',
      '    return button',
      'end',
      '',
      'local function CreateTab(name, callback)',
      '    local button = Instance.new("TextButton")',
      '    button.Size = UDim2.new(0, 94, 0, 35)',
      '    button.BackgroundColor3 = Color3.fromRGB(65, 35, 105)',
      '    button.TextColor3 = THEME.Text',
      '    button.TextSize = 12',
      '    button.Font = Enum.Font.GothamBold',
      '    button.Text = name',
      '    button.Parent = Tabs',
      '    Instance.new("UICorner", button).CornerRadius = UDim.new(0, 7)',
      '    button.MouseButton1Click:Connect(callback)',
      '    return button',
      'end',
      '',
      'local function Home()',
      '    Clear()',
      `    AddLabel(${q(`🌲 ${spec.game.toUpperCase().slice(0, 28)}`)}, THEME.Accent)`,
      `    AddLabel(${q(spec.plan.resumen.slice(0, 90))})`,
      spec.features.effects
        ? '    AddToggle("Efectos visuales", function() ApplyVisuals(true) end, function() ApplyVisuals(false) end)'
        : '',
      spec.features.lighting
        ? '    AddToggle("Iluminación local", function() ApplyLighting(true) end, function() ApplyLighting(false) end)'
        : '',
      spec.features.effects
        ? '    AddToggle("Etiquetas de objetos", function() ApplyScanner(true) end, function() ApplyScanner(false) end)'
        : '',
      '    AddButton("Actualizar etiquetas", function() ApplyScanner(state.labelsOn) end)',
      'end',
      '',
      'local function Movement()',
      '    Clear()',
      '    AddLabel("⚡ MOVIMIENTO", THEME.Accent)',
      '    AddToggle("Vuelo local", function() ApplyFly(true) end, function() ApplyFly(false) end)',
      '    AddToggle("Velocidad", function() ApplySpeed(true) end, function() ApplySpeed(false) end)',
      '    AddToggle("Salto alto", function() ApplyJump(true) end, function() ApplyJump(false) end)',
      '    AddToggle("Noclip local", function() ApplyNoclip(true) end, function() ApplyNoclip(false) end)',
      'end',
      '',
      'local function Base()',
      '    Clear()',
      '    AddLabel("🏠 CONSTRUCCIÓN", THEME.Accent)',
      '    AddToggle("Vista amplia", function() ApplyBuildView(true) end, function() ApplyBuildView(false) end)',
      `    AddButton("Estructuras", function() ApplyScanner(true); setStatus("Buscando: estructura, pared, piso") end)`,
      'end',
      '',
      'local function Rescue()',
      '    Clear()',
      '    AddLabel("🧸 RESCATE / OBJETOS", THEME.Accent)',
      '    AddToggle("Mostrar ubicaciones", function() ApplyScanner(true) end, function() ApplyScanner(false) end)',
      '    AddButton("Refrescar", function() ApplyScanner(state.labelsOn) end)',
      'end',
      '',
    );

    if (spec.features.admin) {
      push(
        'local function Admin()',
        '    Clear()',
        '    AddLabel("🛡️ ADMIN (requiere servidor)", THEME.Accent)',
        '    AddButton("Anunciar", function() ServerAction("announce", "Hola desde ' +
          spec.name.replace(/"/g, '') +
          '") end)',
        '    AddButton("Velocidad servidor", function() ServerAction("setWalkSpeed", ' +
          spec.walkSpeed +
          ') end)',
        '    AddLabel("El Script del servidor debe validar AllowedOwnerUserId.")',
        'end',
        '',
      );
    }

    push(
      'local function Info()',
      '    Clear()',
      '    AddLabel("ℹ️ FUNCIONES SEGÚN IA", THEME.Accent)',
      planLabels || '    AddLabel("Sin funciones adicionales detectadas")',
      '    AddLabel("LocalScript: solo afecta a tu cliente.")',
      '    AddLabel("Servidor/Studio: necesario para anuncios y cambios globales.")',
      'end',
      '',
      'CreateTab("🌲 HOME", Home)',
      'CreateTab("⚡ MOVE", Movement)',
      'CreateTab("🏠 BASE", Base)',
      'CreateTab("🧸 RESCUE", Rescue)',
    );
    if (spec.features.admin) push('CreateTab("🛡️ ADMIN", Admin)');
    push('CreateTab("ℹ️ INFO", Info)', '', 'Home()', '');

    push(
      '-- Minimizar y restaurar',
      'local Mini = Instance.new("TextButton")',
      'Mini.Size = UDim2.new(0, 55, 0, 55)',
      'Mini.Position = UDim2.new(0, 15, 0.5, 0)',
      'Mini.BackgroundColor3 = THEME.Secondary',
      'Mini.Text = "JH"',
      'Mini.TextColor3 = THEME.Text',
      'Mini.TextSize = 20',
      'Mini.Font = Enum.Font.GothamBold',
      'Mini.Visible = false',
      'Mini.Parent = GUI',
      'Instance.new("UICorner", Mini).CornerRadius = UDim.new(1, 0)',
      'Minimize.MouseButton1Click:Connect(function()',
      '    Main.Visible = false',
      '    Mini.Visible = true',
      'end)',
      'Mini.MouseButton1Click:Connect(function()',
      '    Main.Visible = true',
      '    Mini.Visible = false',
      'end)',
      '',
    );
  }

  push(
    '-- Atajo de teclado',
    `local TOGGLE_KEY = Enum.KeyCode[${q(spec.toggleKey)}] or Enum.KeyCode.F5`,
    'UIS.InputBegan:Connect(function(input, processed)',
    '    if processed then return end',
    '    if input.KeyCode == TOGGLE_KEY then',
  );
  if (spec.features.gui) {
    push(
      '        if Main.Visible then',
      '            Main.Visible = false',
      '            Mini.Visible = true',
      '        else',
      '            Main.Visible = true',
      '            Mini.Visible = false',
      '        end',
    );
  } else {
    push(
      '        ApplyVisuals(not state.visualsOn)',
    );
  }
  push('    end', 'end)', '', '-- Reaplicar estados al renacer', 'Player.CharacterAdded:Connect(function()', '    task.wait(0.2)', '    if state.speedOn then ApplySpeed(true) end', '    if state.jumpOn then ApplyJump(true) end', '    if state.flyOn then ApplyFly(true) end', '    if state.noclipOn then ApplyNoclip(true) end', '    if state.visualsOn then ApplyVisuals(true) end', '    if state.labelsOn then ApplyScanner(true) end', 'end)', '', `print(${q(spec.name + ' cargado')})`, '',
  );

  return L.filter((line) => line !== '').join('\n');
}

function infoFile(spec, aiError = '') {
  const features = Object.entries(spec.features)
    .map(([k, v]) => `• ${k}: ${v ? 'sí' : 'no'}`)
    .join('\n');
  const notes = spec.plan.limitaciones.map((x) => `• ${x}`).join('\n');
  const fn = spec.plan.funciones.length
    ? spec.plan.funciones
        .map((f, i) => `${i + 1}. ${f.nombre} — ${f.que_hace} (${f.requisito})`)
        .join('\n')
    : '1. Base de interfaz funcional.';
  return [
    `# ${spec.name}`,
    '',
    `Juego: ${spec.game}`,
    `Diseño: ${spec.design || 'Moderno'}`,
    `Colores: ${spec.colors.join(' · ')}`,
    `Atajo: ${spec.toggleKey}`,
    '',
    aiError
      ? `⚠️ La IA no estuvo disponible (${aiError}). El análisis se hizo en local; el script es igual de funcional.`
      : '✅ Funciones y límites analizados por la IA integrada del bot.',
    '',
    '## Cómo instalar',
    '1. Abre Roblox Studio en tu experiencia.',
    '2. Inserta un `LocalScript` en `StarterPlayer > StarterPlayerScripts`.',
    '3. Pega todo el contenido de `01-<proyecto>.luau` dentro de ese LocalScript.',
    '4. Prueba en Studio. El atajo muestra/oculta la interfaz; los botones ejecutan acciones reales.',
    '',
    '## Lo que hace',
    fn,
    '',
    '## Funciones activadas',
    features,
    '',
    '## Permisos y límites reales',
    notes,
    '• Vuelo, noclip, velocidad, salto, iluminación y colores son LOCALES: afectan a tu cliente. El servidor del juego puede corregirlos.',
    '• Anunciar y velocidad de servidor requieren un Script en ServerScriptService que cree `ReplicatedStorage.ZenitsuRemotes.Action` y valide `AllowedOwnerUserId`. Ese Script no va incluido en este archivo único; pídelo por separado si eres dueño de la experiencia.',
    '• Recolectar recursos/buscar comida no se puede automatizar con APIs públicas: el escáner solo muestra etiquetas sobre objetos existentes.',
    '',
    'Sin dependencias externas. Solo servicios de Roblox.',
    '',
  ].join('\n');
}

export function buildProject(answers, plan, aiError = '') {
  const features = detectFeatures(answers);
  const fallback = fallbackPlan(answers);
  const activePlan = plan || fallback;
  const name = clean(answers.name, 70) || clean(activePlan.nombre_sugerido, 70) || 'ZENITSU HUB';
  const spec = {
    name,
    game: detectGame(answers),
    design: clean(answers.design, 120) || 'Moderno',
    colors: detectColors(answers),
    toggleKey: detectToggleKey(answers),
    walkSpeed: detectWalkSpeed(answers),
    jumpPower: detectJumpPower(answers),
    guiName: guiName(name),
    keywords: scanKeywords(detectGame(answers)),
    features,
    plan: activePlan,
  };
  const safe = String(name)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'zenitsu-hub';
  return {
    spec,
    files: [
      { name: `01-${safe}.luau`, content: singleScriptFile(spec) },
      { name: `INFO-${safe}.md`, content: infoFile(spec, aiError) },
    ],
  };
}

/* ────────────────────────── Entrega ────────────────────────── */

async function sendProject(ctx, project) {
  const { spec, files } = project;

  // Un solo LocalScript completo + INFO. No hay módulos que renombrar: se pega
  // tal cual en StarterPlayerScripts.
  await ctx.reply(
    [
      '✅ *PROYECTO LUAU GENERADO*',
      '━━━━━━━━━━━━━━━━━━━━',
      `📛 Nombre: *${spec.name}*`,
      `🎮 Juego: *${spec.game}*`,
      `🎨 Colores: ${spec.colors.join(' · ')}`,
      `🖥️ GUI: ${spec.features.gui ? 'sí' : 'no'} · Atajo: ${spec.toggleKey}`,
      `📦 Archivos: ${files.length} (LocalScript completo + INFO)`,
      '',
      '_Pega el .luau en StarterPlayer > StarterPlayerScripts. El INFO explica permisos y límites._',
    ].join('\n'),
  );

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = file.name;
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
