import {
  cancelScriptSession,
  editScriptAnswer,
  generateAndDeliver,
  getScriptSession,
  questionText,
  sessionStatusText,
  startScriptSession,
} from '../lib/roblox-script.js';

const HELP = [
  '🧩 *CREAR SCRIPT ROBLOX*',
  '━━━━━━━━━━━━━━━━━━━━',
  '*.crearscript* — iniciar/reiniciar la conversación (7 preguntas).',
  '*.crearscript estado* — ver el progreso y tus respuestas.',
  '*.crearscript editar N texto* — cambiar la respuesta N (1-7).',
  '*.crearscript version* — generar otra versión del último proyecto.',
  '*.crearscript cancelar* o *.cancelar* — cancelar el proceso.',
  '',
  'Durante la conversación también puedes escribir *estado*, *editar N texto*, *version* o *cancelar* como mensaje normal.',
].join('\n');

export default [
  {
    name: 'crearscript',
    aliases: ['crearscripts', 'robloxscript', 'scriptroblox', 'generarscript'],
    category: 'tools',
    desc: 'Genera un proyecto Luau de Roblox a partir de una conversación interactiva.',
    usage: 'crearscript | crearscript estado | crearscript editar 3 ... | crearscript version',
    async execute(ctx) {
      const sub = String(ctx.args[0] || '').toLowerCase();
      const rest = ctx.args.slice(1).join(' ').trim();
      let session = getScriptSession(ctx);

      if (sub === 'cancelar' || sub === 'cancel' || sub === 'salir') {
        await ctx.reply(
          cancelScriptSession(ctx)
            ? '🛑 Proceso de .crearscript cancelado.'
            : 'ℹ️ No tenías un proceso de .crearscript activo.',
        );
        return;
      }

      if (sub === 'estado' || sub === 'status' || sub === 'progreso') {
        await ctx.reply(sessionStatusText(session));
        return;
      }

      if (sub === 'editar' || sub === 'modificar' || sub === 'cambiar') {
        if (!session) {
          await ctx.reply('ℹ️ No tienes un proceso activo. Empieza con *.crearscript*.');
          return;
        }
        await editScriptAnswer(ctx, session, `${sub} ${rest}`.trim());
        return;
      }

      if (sub === 'version' || sub === 'regenerar' || sub === 'regen') {
        if (!session?.completed) {
          await ctx.reply('⏳ Primero termina las 7 preguntas para tener una versión que regenerar.');
          return;
        }
        await generateAndDeliver(ctx, session);
        return;
      }

      if (sub === 'ayuda' || sub === 'help' || sub === '?') {
        await ctx.reply(HELP);
        return;
      }

      if (session && !session.completed) {
        await ctx.reply(
          '⏳ Ya tienes un proceso activo. Continúa respondiendo o usa *.crearscript estado*.\n\n' +
            sessionStatusText(session),
        );
        return;
      }

      // Permite arrancar con datos: ".crearscript 99 Nights in the Forest"
      const initial = sub && !rest && !/^\d+$/.test(sub) ? sub : [sub, rest].filter(Boolean).join(' ').trim();
      session = startScriptSession(ctx);
      if (initial) {
        session.answers.game = initial.slice(0, 400);
        session.step = 1;
        await ctx.reply('✅ Datos iniciales guardados. Continúo con la pregunta 2:');
        await ctx.reply(questionText(1, session));
        return;
      }

      await ctx.reply(
        [
          '🧩 *GENERADOR DE SCRIPTS ROBLOX*',
          '━━━━━━━━━━━━━━━━━━━━',
          'Te haré 7 preguntas. Responde cada una con un mensaje normal de WhatsApp.',
          'Usaré la IA integrada para analizar tus respuestas y entregarte un proyecto Luau completo en archivos numerados.',
          '',
          '_Puedes escribir estado, editar N texto, version o cancelar en cualquier momento._',
        ].join('\n'),
      );
      await ctx.reply(questionText(0, session));
    },
  },
  {
    name: 'cancelar',
    aliases: ['cancelarcrearscript', 'cancelargenerador'],
    category: 'tools',
    desc: 'Cancela tu conversación activa de .crearscript.',
    usage: 'cancelar',
    async execute(ctx) {
      await ctx.reply(
        cancelScriptSession(ctx)
          ? '🛑 Proceso de .crearscript cancelado.'
          : 'ℹ️ No tenías un proceso de .crearscript activo.',
      );
    },
  },
];
