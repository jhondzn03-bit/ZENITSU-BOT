import { db, getChat, save } from '../lib/db.js';
import { truncate } from '../lib/utils.js';
import { aiImage, aiText, geminiText, ttsAudio } from '../lib/api.js';
import { audioToVoiceNote } from '../lib/sticker.js';

const historyMap = new Map();

const SYSTEM_PROMPT =
  'Eres ZENITSU BOT, un asistente de WhatsApp con personalidad inspirada en Zenitsu Agatsuma de Demon Slayer. ' +
  'Eres amable, gracioso, un poco miedoso pero valiente, y muy útil. Responde SIEMPRE en español. ' +
  'Sé claro, directo y no inventes datos. Si no sabes algo, dilo. Usa emojis con moderación.';

async function sendLong(ctx, text) {
  const clean = String(text || '').trim();
  if (!clean) {
    await ctx.reply('🤖 La IA no devolvió texto.');
    return;
  }
  const chunks = [];
  let rest = clean;
  while (rest.length > 0) {
    if (rest.length <= 3500) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf('\n', 3500);
    if (cut < 1500) cut = rest.lastIndexOf(' ', 3500);
    if (cut < 1000) cut = 3500;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

async function askAI(ctx, prompt, options = {}) {
  const chatId = ctx.chat;
  const history = options.history === false ? [] : historyMap.get(chatId) || [];
  const answer = await aiText(prompt, { system: options.system || SYSTEM_PROMPT, history });
  if (options.history !== false) {
    history.push({ role: 'user', content: prompt });
    history.push({ role: 'assistant', content: answer });
    while (history.length > 16) history.shift();
    historyMap.set(chatId, history);
  }
  return answer;
}

export default [
  {
    name: 'ai',
    aliases: ['gpt', 'chat', 'ask', 'ia', 'preguntar'],
    category: 'ai',
    desc: 'Pregúntale algo a la inteligencia artificial.',
    usage: 'ai <pregunta>',
    async execute(ctx) {
      let prompt = ctx.text.trim();
      if (!prompt && ctx.quoted?.text) prompt = ctx.quoted.text;
      if (!prompt) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}ai* ¿Qué es la respiración del trueno?`);
        return;
      }
      await ctx.react('🤖');
      const answer = await askAI(ctx, prompt);
      await sendLong(ctx, `🤖 *ZENITSU AI*\n\n${answer}`);
    },
  },
  {
    name: 'voz',
    aliases: ['voiceai', 'iavoice', 'vozia'],
    category: 'ai',
    desc: 'Le preguntas a la IA y te responde con una nota de voz.',
    usage: 'voz <pregunta>',
    async execute(ctx) {
      let prompt = ctx.text.trim();
      if (!prompt && ctx.quoted?.text) prompt = ctx.quoted.text;
      if (!prompt) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}voz* ¿Qué es la respiración del trueno?`);
        return;
      }
      await ctx.react('🎙️');
      const answer = await askAI(ctx, prompt, {
        system:
          SYSTEM_PROMPT +
          ' Responde para ser leído EN VOZ ALTA: máximo 500 caracteres, sin markdown, ' +
          'sin emojis, sin listas y sin enlaces. Usa frases cortas y naturales.',
      });
      const clean = String(answer || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_`#>~|]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600);
      if (!clean) {
        await ctx.reply('🤖 La IA no devolvió texto.');
        return;
      }
      try {
        const mp3 = await ttsAudio(clean, 'es');
        // WhatsApp solo reproduce notas de voz en OGG/Opus. El MP3 con
        // ptt:true provoca "Este audio no está disponible...".
        const ogg = await audioToVoiceNote(mp3, 'mp3');
        await ctx.send({ audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true });
      } catch (err) {
        await ctx.reply(
          `🎙️ *Respuesta de ZENITSU AI*\n\n${answer}\n\n_⚠️ No pude generar el audio: ${err.message}_`,
        );
      }
    },
  },
  {
    name: 'gemini',
    aliases: ['googleai'],
    category: 'ai',
    desc: 'Consulta a Google Gemini (requiere API key).',
    usage: 'gemini <pregunta>',
    async execute(ctx) {
      let prompt = ctx.text.trim();
      if (!prompt && ctx.quoted?.text) prompt = ctx.quoted.text;
      if (!prompt) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}gemini* <pregunta>`);
        return;
      }
      const key = db().apis?.gemini;
      if (!key) {
        await ctx.reply(
          `🔑 No hay API key de Gemini configurada.\n\n💡 Usa *${ctx.prefix}setapi gemini TU_API_KEY*\n\n_Mientras tanto, responderé con la IA gratuita._`,
        );
        const answer = await askAI(ctx, prompt);
        await sendLong(ctx, `🤖 *ZENITSU AI*\n\n${answer}`);
        return;
      }
      await ctx.react('✨');
      const answer = await geminiText(prompt, key, SYSTEM_PROMPT);
      await sendLong(ctx, `✨ *GEMINI*\n\n${answer}`);
    },
  },
  {
    name: 'imagine',
    aliases: ['draw', 'dibujar', 'flux', 'imaginar', 'iagen'],
    category: 'ai',
    desc: 'Genera una imagen con inteligencia artificial.',
    usage: 'imagine <descripción>',
    async execute(ctx) {
      const prompt = ctx.text.trim();
      if (!prompt) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}imagine* un samurái bajo la lluvia con relámpagos`);
        return;
      }
      await ctx.reply(`🎨 *Generando imagen...*\n\n📝 ${truncate(prompt, 300)}\n\n_Esto puede tardar unos segundos._`);
      const { buffer } = await aiImage(prompt);
      await ctx.send({ image: buffer, caption: `🎨 *Imagen generada por IA*\n\n📝 ${truncate(prompt, 500)}` });
    },
  },
  {
    name: 'aichat',
    aliases: ['autochat', 'chatia'],
    category: 'ai',
    desc: 'Activa o desactiva las respuestas automáticas de IA en este chat.',
    usage: 'aichat on|off',
    admin: true,
    async execute(ctx) {
      const chat = getChat(ctx.chat);
      const value = String(ctx.args[0] || '').toLowerCase();
      if (!value) {
        await ctx.reply(
          `🤖 *Chat IA automático:* ${chat.aiChat ? '✅ ON' : '❌ OFF'}\n\n💡 Uso: ${ctx.prefix}aichat on|off\n\n_Con esto activado, respondo a los mensajes que no sean comandos._`,
        );
        return;
      }
      if (['on', 'si', 'sí', '1', 'true'].includes(value)) chat.aiChat = true;
      else if (['off', 'no', '0', 'false'].includes(value)) chat.aiChat = false;
      else {
        await ctx.reply('❌ Usa *on* u *off*.');
        return;
      }
      save();
      await ctx.reply(`🤖 *Chat IA automático:* ${chat.aiChat ? '✅ ON' : '❌ OFF'}`);
    },
  },
  {
    name: 'clearchat',
    aliases: ['resetai', 'limpiarmemoria'],
    category: 'ai',
    desc: 'Borra la memoria de la conversación con la IA.',
    usage: 'clearchat',
    async execute(ctx) {
      historyMap.delete(ctx.chat);
      await ctx.reply('🧠 Memoria de la IA borrada para este chat.');
    },
  },
  {
    name: 'summarize',
    aliases: ['resumir', 'resumen'],
    category: 'ai',
    desc: 'Resume un texto o un mensaje citado.',
    usage: 'summarize <texto | responde>',
    async execute(ctx) {
      let text = ctx.text.trim();
      if (!text && ctx.quoted?.text) text = ctx.quoted.text;
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}summarize* <texto> o responde a un mensaje.`);
        return;
      }
      if (text.length < 40) {
        await ctx.reply('⚠️ El texto es muy corto para resumir.');
        return;
      }
      const answer = await askAI(
        ctx,
        `Resume el siguiente texto en español, con puntos clave y sin inventar nada:\n\n${truncate(text, 6000)}`,
        { history: false },
      );
      await sendLong(ctx, `📝 *RESUMEN*\n\n${answer}`);
    },
  },
  {
    name: 'traduciria',
    aliases: ['aitranslate'],
    category: 'ai',
    desc: 'Traduce un texto usando IA (más natural).',
    usage: 'traduciria <idioma> <texto>',
    async execute(ctx) {
      let to = 'en';
      let text = ctx.text;
      if (ctx.args[0] && /^[a-z]{2}$/i.test(ctx.args[0]) && ctx.args.length > 1) {
        to = ctx.args[0].toLowerCase();
        text = ctx.args.slice(1).join(' ');
      }
      if (!text && ctx.quoted?.text) text = ctx.quoted.text;
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}traduciria* en Hola mundo`);
        return;
      }
      const answer = await askAI(
        ctx,
        `Traduce el siguiente texto al idioma con código "${to}". Devuelve solo la traducción:\n\n${text}`,
        { history: false },
      );
      await sendLong(ctx, `🌐 *Traducción IA (${to})*\n\n${answer}`);
    },
  },
  {
    name: 'codeai',
    aliases: ['programar', 'devai'],
    category: 'ai',
    desc: 'Pide ayuda a la IA para programar.',
    usage: 'codeai <lenguaje> <petición>',
    async execute(ctx) {
      const prompt = ctx.text.trim();
      if (!prompt) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}codeai* JavaScript crea una función que sume dos números`);
        return;
      }
      const answer = await askAI(
        ctx,
        `Actúa como un programador experto. Responde con código limpio, comentado y explicado en español. Petición: ${prompt}`,
        { history: false },
      );
      await sendLong(ctx, `💻 *CÓDIGO IA*\n\n${answer}`);
    },
  },
];
