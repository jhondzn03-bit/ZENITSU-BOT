import {
  hashToPercent,
  jidToNumber,
  pick,
  randomInt,
  shuffle,
  truncate,
} from '../lib/utils.js';
import {
  getAdvice,
  getFact,
  getJoke,
  getMeme,
  getQuote,
  translateText,
} from '../lib/api.js';

const EIGHT_BALL = [
  '⚡ Definitivamente sí.',
  '🌩️ Sin duda alguna.',
  '✅ Sí, confía en el trueno.',
  '🤔 Probablemente sí.',
  '😐 No cuentes con eso.',
  '❌ No lo veo posible.',
  '🌩️ Mis relámpagos dicen que no.',
  '🔮 Pregunta de nuevo más tarde.',
  '😴 Estoy demasiado dormido para responder eso.',
  '⚡ El destino aún no está escrito.',
  '💛 Sí, pero con cuidado.',
  '🚫 Definitivamente no.',
];

const TRUTHS = [
  '¿Cuál fue la última mentira que dijiste?',
  '¿A quién de este grupo le tienes más confianza?',
  '¿Cuál es tu mayor miedo?',
  '¿Qué es lo más vergonzoso que has hecho en público?',
  '¿Cuál fue tu último mensaje eliminado?',
  '¿Has fingido estar enfermo para no ir a algo?',
  '¿Cuál es tu crush secreto?',
  '¿Qué canción te da vergüenza que te guste?',
  '¿Cuál es el peor regalo que has recibido?',
  '¿Alguna vez has espiado el teléfono de alguien?',
  '¿Cuál es tu hábito más raro?',
  '¿Qué harías si te quedaras solo un día en el mundo?',
  '¿Cuál es la mentira más grande que le has dicho a tus padres?',
  '¿A quién le debes dinero?',
  '¿Cuál es tu mayor inseguridad?',
];

const DARES = [
  'Manda un audio cantando el coro de tu canción favorita.',
  'Escribe un poema de 4 líneas dedicado al último que te escribió.',
  'Cambia tu estado de WhatsApp por una frase de Zenitsu durante 1 hora.',
  'Manda un sticker de tu personaje favorito.',
  'Escribe 5 emojis que describan tu día.',
  'Menciona a alguien del grupo y dile algo bonito.',
  'Manda una foto de tu mano (sin mostrar nada más).',
  'Escribe tu nombre al revés.',
  'Haz una declaración exagerada de amor a tu comida favorita.',
  'Manda un mensaje con los ojos cerrados y sin borrar errores.',
  'Imita a un animal en un audio.',
  'Escribe tres cosas que te gusten de ti.',
  'Manda el último emoji que usaste.',
  'Cuenta un chiste malo.',
  'Dile a alguien del grupo que es tu favorito.',
];

const JOKES = [
  '¿Qué le dice un jaguar a otro jaguar? — Jaguar you? 🐆',
  '¿Por qué los pájaros no usan Facebook? — Porque ya tienen Twitter. 🐦',
  '¿Cómo se despiden los químicos? — Ácido un placer. 🧪',
  '¿Qué hace una abeja en el gimnasio? — Zumba. 🐝',
  '¿Por qué el libro de matemáticas está triste? — Porque tiene muchos problemas. 📘',
  '¿Qué le dijo un semáforo a otro? — No me mires, me estoy cambiando. 🚦',
  '¿Cómo se llama el campeón de buceo más pequeño? — Microbio. 🤿',
  '¿Qué le dice el océano a la playa? — Nada, solo viene a saludar. 🌊',
  '¿Por qué los esqueletos no pelean? — Porque no tienen agallas. 💀',
  '¿Cuál es el colmo de un electricista? — Que su hijo sea un apagado. 💡',
  '¿Qué hace una vaca en un tejado? — Un vaca-techo. 🐄',
  '¿Cómo se llama el primo del pato? — Pato-primo. 🦆',
  '¿Qué le dijo el 0 al 8? — Qué buena faja. 🔢',
  '¿Por qué el tomate se puso rojo? — Porque vio la salsa. 🍅',
  '¿Cuál es el animal más antiguo? — La cebra, porque está en blanco y negro. 🦓',
];

const PIROPOS = [
  '¿Tienes un mapa? Porque me perdí en tus ojos. 🗺️',
  'Si fueras un trueno, serías la primera forma de mi corazón. ⚡',
  'No sé si eres un demonio, pero me has hechizado. 😈',
  '¿Crees en el amor a primera vista o tengo que volver a mirarte? 👀',
  'Eres como el sol: no puedo mirarte directamente sin sonrojarme. ☀️',
  'Si cocinaras tan bien como te ves, serías chef estrella. 👨‍🍳',
  '¿Eres una tormenta? Porque llegaste y me revolviste todo. 🌩️',
  'Tienes algo que me vuelve loco: tu forma de ser. 💛',
  'Si la belleza pagara impuestos, estarías en bancarrota. 💸',
  '¿Eres un imán? Porque me atraes sin remedio. 🧲',
];

const COMPLIMENTS = [
  'Tu energía es de otro nivel. ⚡',
  'Tienes un corazón enorme. 💛',
  'Tu forma de hablar es muy linda. 🌸',
  'Eres más fuerte de lo que crees. 💪',
  'Tienes un humor increíble. 😄',
  'Tu creatividad no tiene límites. 🎨',
  'Eres de esas personas que hacen el día mejor. ☀️',
  'Tu determinación es admirable. 🔥',
];

const INSULTS = [
  'Eres tan lento que un caracol te pide que te apures. 🐌',
  'Tu WiFi tiene más personalidad que tú. 📶',
  'No eres tonto, solo tienes mala suerte pensando. 🤔',
  'Eres la razón por la que las instrucciones traen dibujos. 📋',
  'Tu mejor ángulo es cuando cierras la boca. 🤐',
  'Tienes el carisma de un lunes por la mañana. 😴',
  'Eres como una nube: cuando desapareces, el día mejora. ☁️',
  'Tu código tiene menos comentarios que tu conciencia. 💻',
];

const ROASTS = [
  'No te voy a insultar, bastante tienes con tu historial de búsqueda. 🔍',
  'Eres tan especial que tu sombra pidió el cambio de turno. 🌑',
  'Si el ridículo pagara, serías millonario. 💰',
  'Tu autoestima y tu WiFi tienen algo en común: se caen solas. 📶',
  'No eres feo, eres... una experiencia adquirida. 😅',
  'Tu talento es tan raro que ni tú lo encuentras. 🔎',
  'Eres la prueba viviente de que el universo tiene sentido del humor. 🌌',
];

const WOULD_YOU = [
  '¿Preferirías poder volar o ser invisible?',
  '¿Preferirías tener mucho dinero o mucho tiempo?',
  '¿Preferirías vivir sin música o sin internet?',
  '¿Preferirías hablar todos los idiomas o tocar todos los instrumentos?',
  '¿Preferirías tener un dragón o un unicornio?',
  '¿Preferirías comer solo pizza o solo hamburguesas por un año?',
  '¿Preferirías saber tu futuro o cambiar tu pasado?',
  '¿Preferirías ser famoso o ser el más inteligente del mundo?',
  '¿Preferirías tener memoria perfecta o no recordar nada malo?',
  '¿Preferirías vivir en el mar o en el espacio?',
];

const TRIVIA = [
  { q: '¿Quién es el protagonista de Demon Slayer?', o: ['Zenitsu Agatsuma', 'Tanjiro Kamado', 'Inosuke Hashibira', 'Giyu Tomioka'], a: 1 },
  { q: '¿Qué respiración usa Zenitsu?', o: ['Respiración del Agua', 'Respiración del Trueno', 'Respiración del Fuego', 'Respiración del Viento'], a: 1 },
  { q: '¿Cuál es el nombre del demonio principal de Demon Slayer?', o: ['Muzan Kibutsuji', 'Akaza', 'Doma', 'Kokushibo'], a: 0 },
  { q: '¿En qué anime aparece Naruto Uzumaki?', o: ['One Piece', 'Naruto', 'Bleach', 'Dragon Ball'], a: 1 },
  { q: '¿Quién es el capitán de los Piratas del Sombrero de Paja?', o: ['Zoro', 'Luffy', 'Sanji', 'Ace'], a: 1 },
  { q: '¿Qué fruta le dio sus poderes a Luffy?', o: ['Gomu Gomu no Mi', 'Mera Mera no Mi', 'Hito Hito no Mi', 'Bara Bara no Mi'], a: 0 },
  { q: '¿Cómo se llama el mundo de Attack on Titan?', o: ['Paradis', 'Namek', 'Soul Society', 'Konoha'], a: 0 },
  { q: '¿Cuál es el nombre del protagonista de My Hero Academia?', o: ['Bakugo', 'Todoroki', 'Izuku Midoriya', 'All Might'], a: 2 },
  { q: '¿Qué anime trata sobre un chico que se convierte en demonio?', o: ['Demon Slayer', 'Jujutsu Kaisen', 'Tokyo Ghoul', 'Chainsaw Man'], a: 0 },
  { q: '¿Quién es el maestro de Goku?', o: ['Piccolo', 'Maestro Roshi', 'Vegeta', 'Krillin'], a: 1 },
  { q: '¿Cuál es el nombre del espadachín más fuerte de Demon Slayer?', o: ['Yoriichi Tsugikuni', 'Muzan', 'Kokushibo', 'Gyomei'], a: 0 },
  { q: '¿Qué anime tiene como protagonista a Saitama?', o: ['One Punch Man', 'Mob Psycho 100', 'Baki', 'Kengan Ashura'], a: 0 },
  { q: '¿Quién es el rival de Naruto?', o: ['Sasuke', 'Kakashi', 'Sakura', 'Shikamaru'], a: 0 },
  { q: '¿Cuántas formas tiene la Respiración del Trueno?', o: ['5', '6', '7', '9'], a: 2 },
  { q: '¿Cómo se llama la hermana de Tanjiro?', o: ['Nezuko', 'Shinobu', 'Mitsuri', 'Kanao'], a: 0 },
];

const triviaSessions = new Map();

function namesForShip(ctx) {
  const text = ctx.text.trim();
  if (text) {
    const parts = text.split(/\s*(?:&|\+| y | vs | x )\s*/i).filter(Boolean);
    if (parts.length >= 2) return [parts[0], parts[1]];
    if (ctx.mentioned?.length) return [ctx.pushName || 'Tú', `+${jidToNumber(ctx.mentioned[0])}`];
    return [ctx.pushName || 'Tú', text];
  }
  if (ctx.mentioned?.length) return [ctx.pushName || 'Tú', `+${jidToNumber(ctx.mentioned[0])}`];
  return [ctx.pushName || 'Tú', 'Zenitsu'];
}

function bar(pct) {
  const filled = Math.round(pct / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

export default [
  {
    name: '8ball',
    aliases: ['bola', '8b', 'oraculo'],
    category: 'fun',
    desc: 'Hazle una pregunta a la bola mágica.',
    usage: '8ball <pregunta>',
    async execute(ctx) {
      if (!ctx.text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}8ball* ¿Me irá bien hoy?`);
        return;
      }
      await ctx.reply(`🎱 *LA BOLA MÁGICA DICE...*\n\n${pick(EIGHT_BALL)}`);
    },
  },
  {
    name: 'dice',
    aliases: ['dado', 'dados'],
    category: 'fun',
    desc: 'Lanza un dado.',
    usage: 'dice [caras]',
    async execute(ctx) {
      const faces = Math.min(1000, Math.max(2, Number(ctx.args[0]) || 6));
      await ctx.reply(`🎲 *Dado de ${faces} caras*\n\n▸ Resultado: *${randomInt(1, faces)}*`);
    },
  },
  {
    name: 'coinflip',
    aliases: ['moneda', 'cf', 'caraocruz'],
    category: 'fun',
    desc: 'Lanza una moneda al aire.',
    usage: 'coinflip',
    async execute(ctx) {
      const result = Math.random() < 0.5 ? '🪙 Cara' : '🪙 Cruz';
      await ctx.reply(`🪙 *Lanzando la moneda...*\n\n▸ Resultado: *${result}*`);
    },
  },
  {
    name: 'rps',
    aliases: ['ppt', 'piedrapapel', 'tijera'],
    category: 'fun',
    desc: 'Juega piedra, papel o tijera contra el bot.',
    usage: 'rps <piedra|papel|tijera>',
    async execute(ctx) {
      const user = String(ctx.args[0] || '').toLowerCase();
      const options = ['piedra', 'papel', 'tijera'];
      if (!options.includes(user)) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}rps* piedra | papel | tijera`);
        return;
      }
      const bot = pick(options);
      const emoji = { piedra: '🪨', papel: '📄', tijera: '✂️' };
      let result = '🤝 ¡Empate!';
      if (
        (user === 'piedra' && bot === 'tijera') ||
        (user === 'papel' && bot === 'piedra') ||
        (user === 'tijera' && bot === 'papel')
      ) {
        result = '🎉 ¡Ganaste!';
      } else if (user !== bot) {
        result = '💀 ¡Perdiste!';
      }
      await ctx.reply(
        `✊ *Piedra, papel o tijera*\n\n▸ Tú: ${emoji[user]} ${user}\n▸ Bot: ${emoji[bot]} ${bot}\n\n${result}`,
      );
    },
  },
  {
    name: 'truth',
    aliases: ['verdad'],
    category: 'fun',
    desc: 'Te hace una pregunta de verdad.',
    usage: 'truth',
    async execute(ctx) {
      await ctx.reply(`😳 *VERDAD*\n\n${pick(TRUTHS)}`);
    },
  },
  {
    name: 'dare',
    aliases: ['reto'],
    category: 'fun',
    desc: 'Te pone un reto.',
    usage: 'dare',
    async execute(ctx) {
      await ctx.reply(`🔥 *RETO*\n\n${pick(DARES)}`);
    },
  },
  {
    name: 'joke',
    aliases: ['chiste', 'broma'],
    category: 'fun',
    desc: 'Cuenta un chiste.',
    usage: 'joke',
    async execute(ctx) {
      let text;
      try {
        const j = await getJoke();
        text = `${j.setup}\n\n${j.punchline}`;
      } catch {
        text = pick(JOKES);
      }
      await ctx.reply(`😂 *CHISTE*\n\n${text}`);
    },
  },
  {
    name: 'meme',
    aliases: ['memes'],
    category: 'fun',
    desc: 'Envía un meme aleatorio.',
    usage: 'meme',
    async execute(ctx) {
      const m = await getMeme();
      const caption = `😂 *${truncate(m.title || 'Meme', 200)}*\n\n▸ r/${m.subreddit || 'memes'}\n▸ u/${m.author || '?'}`;
      try {
        await ctx.send({ image: { url: m.url }, caption });
      } catch {
        await ctx.reply(`${caption}\n\n🔗 ${m.url}`);
      }
    },
  },
  {
    name: 'quote',
    aliases: ['cita', 'motivacion'],
    category: 'fun',
    desc: 'Muestra una frase motivadora.',
    usage: 'quote',
    async execute(ctx) {
      const q = await getQuote();
      let text = q.quote;
      try {
        if (!/[áéíóúñ¿¡]/i.test(text)) text = await translateText(text, 'es');
      } catch {}
      await ctx.reply(`💬 *FRASE*\n\n"${text}"\n\n— *${q.author}*`);
    },
  },
  {
    name: 'fact',
    aliases: ['dato', 'curiosidad'],
    category: 'fun',
    desc: 'Muestra un dato curioso.',
    usage: 'fact',
    async execute(ctx) {
      let text = await getFact();
      try {
        if (!/[áéíóúñ¿¡]/i.test(text)) text = await translateText(text, 'es');
      } catch {}
      await ctx.reply(`🧠 *DATO CURIOSO*\n\n${truncate(text, 1500)}`);
    },
  },
  {
    name: 'advice',
    aliases: ['consejo'],
    category: 'fun',
    desc: 'Muestra un consejo aleatorio.',
    usage: 'advice',
    async execute(ctx) {
      let text = await getAdvice();
      try {
        if (!/[áéíóúñ¿¡]/i.test(text)) text = await translateText(text, 'es');
      } catch {}
      await ctx.reply(`💡 *CONSEJO*\n\n${text}`);
    },
  },
  {
    name: 'pickup',
    aliases: ['piropo', 'flirt'],
    category: 'fun',
    desc: 'Muestra un piropo.',
    usage: 'pickup',
    async execute(ctx) {
      await ctx.reply(`😏 *PIROPO*\n\n${pick(PIROPOS)}`);
    },
  },
  {
    name: 'compliment',
    aliases: ['cumplido', 'halago'],
    category: 'fun',
    desc: 'Te dice algo bonito.',
    usage: 'compliment [@usuario]',
    async execute(ctx) {
      const jid = ctx.mentioned?.[0] || ctx.quoted?.sender;
      const mention = jid ? `@${jidToNumber(jid)} ` : '';
      await ctx.send({
        text: `💛 *CUMPLIDO*\n\n${mention}${pick(COMPLIMENTS)}`,
        mentions: jid ? [jid] : [],
      });
    },
  },
  {
    name: 'insult',
    aliases: ['insulto'],
    category: 'fun',
    desc: 'Lanza un insulto ligero y divertido.',
    usage: 'insult [@usuario]',
    async execute(ctx) {
      const jid = ctx.mentioned?.[0] || ctx.quoted?.sender;
      const mention = jid ? `@${jidToNumber(jid)} ` : '';
      await ctx.send({
        text: `😈 *INSULTO LIGERO*\n\n${mention}${pick(INSULTS)}`,
        mentions: jid ? [jid] : [],
      });
    },
  },
  {
    name: 'roast',
    aliases: ['burn', 'tostar'],
    category: 'fun',
    desc: 'Tuesta a alguien con humor.',
    usage: 'roast [@usuario]',
    async execute(ctx) {
      const jid = ctx.mentioned?.[0] || ctx.quoted?.sender;
      const mention = jid ? `@${jidToNumber(jid)} ` : '';
      await ctx.send({
        text: `🔥 *ROAST*\n\n${mention}${pick(ROASTS)}`,
        mentions: jid ? [jid] : [],
      });
    },
  },
  {
    name: 'ship',
    aliases: ['amor', 'pareja'],
    category: 'fun',
    desc: 'Calcula la compatibilidad entre dos personas.',
    usage: 'ship <nombre1> y <nombre2>',
    async execute(ctx) {
      const [a, b] = namesForShip(ctx);
      const pct = hashToPercent(`${a}-${b}`);
      let verdict = '💔 Mejor amigos...';
      if (pct >= 80) verdict = '💞 ¡Pareja perfecta!';
      else if (pct >= 60) verdict = '💛 Muy buena compatibilidad.';
      else if (pct >= 40) verdict = '🤝 Podría funcionar.';
      else if (pct >= 20) verdict = '😬 Mejor pensarlo dos veces.';
      await ctx.reply(
        `💘 *SHIP*\n\n▸ ${a} + ${b}\n\n${bar(pct)} *${pct}%*\n\n${verdict}`,
      );
    },
  },
  {
    name: 'rate',
    aliases: ['calificar', 'nivel'],
    category: 'fun',
    desc: 'Califica a alguien o algo del 1 al 100.',
    usage: 'rate <texto | @usuario>',
    async execute(ctx) {
      const jid = ctx.mentioned?.[0] || ctx.quoted?.sender;
      const subject = jid ? `+${jidToNumber(jid)}` : ctx.text || ctx.pushName || 'tú';
      const pct = hashToPercent(String(subject).toLowerCase());
      await ctx.reply(`📊 *CALIFICACIÓN*\n\n▸ ${subject}\n\n${bar(pct)} *${pct}/100*`);
    },
  },
  {
    name: 'power',
    aliases: ['poder', 'nivelpoder'],
    category: 'fun',
    desc: 'Mide tu nivel de poder estilo Demon Slayer.',
    usage: 'power [@usuario]',
    async execute(ctx) {
      const jid = ctx.mentioned?.[0] || ctx.quoted?.sender || ctx.sender;
      const pct = hashToPercent(`power-${jidToNumber(jid)}`);
      let rank = 'Novato';
      if (pct >= 90) rank = 'Pilar 🌩️';
      else if (pct >= 70) rank = 'Cazador de élite ⚔️';
      else if (pct >= 50) rank = 'Cazador experimentado 🗡️';
      else if (pct >= 30) rank = 'Cazador en entrenamiento 🎋';
      await ctx.send({
        text: `⚡ *NIVEL DE PODER*\n\n▸ @${jidToNumber(jid)}\n▸ ${bar(pct)} *${pct}/100*\n▸ Rango: *${rank}*`,
        mentions: [jid],
      });
    },
  },
  {
    name: 'would',
    aliases: ['wouldyou', 'preferirias'],
    category: 'fun',
    desc: 'Te lanza un dilema "¿preferirías...?".',
    usage: 'would',
    async execute(ctx) {
      await ctx.reply(`🤔 *¿PREFERIRÍAS...?*\n\n${pick(WOULD_YOU)}`);
    },
  },
  {
    name: 'trivia',
    aliases: ['quiz', 'pregunta'],
    category: 'fun',
    desc: 'Inicia una trivia de anime con opciones.',
    usage: 'trivia',
    async execute(ctx) {
      const item = pick(TRIVIA);
      const options = shuffle(item.o.map((text, i) => ({ text, correct: i === item.a })));
      const letters = ['A', 'B', 'C', 'D'];
      const correctIndex = options.findIndex((o) => o.correct);
      triviaSessions.set(ctx.chat, {
        answer: letters[correctIndex],
        question: item.q,
        expires: Date.now() + 120000,
      });
      const list = options.map((o, i) => `${letters[i]}. ${o.text}`).join('\n');
      await ctx.reply(
        `🧠 *TRIVIA DE ANIME*\n\n${item.q}\n\n${list}\n\n⏱️ Responde con *${ctx.prefix}answer A/B/C/D*\n_Tienes 2 minutos._`,
      );
    },
  },
  {
    name: 'answer',
    aliases: ['respuesta', 'ans'],
    category: 'fun',
    desc: 'Responde la trivia activa.',
    usage: 'answer <A|B|C|D>',
    async execute(ctx) {
      const session = triviaSessions.get(ctx.chat);
      if (!session) {
        await ctx.reply('❌ No hay una trivia activa. Usa *.trivia* para empezar.');
        return;
      }
      if (Date.now() > session.expires) {
        triviaSessions.delete(ctx.chat);
        await ctx.reply('⌛ La trivia expiró. Usa *.trivia* para empezar otra.');
        return;
      }
      const answer = String(ctx.args[0] || '').toUpperCase().replace(/[^A-D]/g, '');
      if (!answer) {
        await ctx.reply('💡 Responde con A, B, C o D.');
        return;
      }
      triviaSessions.delete(ctx.chat);
      if (answer === session.answer) {
        await ctx.reply(`✅ *¡Correcto!*\n\nLa respuesta era *${session.answer}*.\n\n⚡ ¡Bien hecho, cazador!`);
      } else {
        await ctx.reply(`❌ *Incorrecto.*\n\nLa respuesta correcta era *${session.answer}*.\n\n🌩️ ¡Sigue entrenando!`);
      }
    },
  },
];
