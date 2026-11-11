import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ocrImage, qrReadImage } from '../lib/api.js';
import { truncate } from '../lib/utils.js';

const TMP = '/data/data/com.termux/files/usr/tmp/opencode';

/* ── Filtros de imagen con ffmpeg ─────────────────────────────────────────── */

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg falló: ${String(stderr || err.message).slice(0, 200)}`));
      else resolve(stdout);
    });
  });
}

async function imageTarget(ctx) {
  const target = ctx.m?.quoted?.hasMedia ? ctx.m.quoted : ctx.m?.hasMedia ? ctx.m : null;
  if (!target) {
    await ctx.reply(`💡 *Responde a una imagen* con este comando, o envíala junto con él.`);
    return null;
  }
  const type = (target.mediaType === 'ptv' ? 'video' : target.mediaType) || 'image';
  if (type !== 'image') {
    await ctx.reply(`🖼️ Ese archivo es *${type}*, necesito una **imagen**.`);
    return null;
  }
  return target;
}

async function applyFilter(ctx, filter, label, caption) {
  const target = await imageTarget(ctx);
  if (!target) return;
  await ctx.reply(`⏳ *Aplicando filtro ${label}...*`);
  const buffer = await ctx.downloadMedia(target);
  const id = `ff-${ctx.chat.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
  const input = path.join(TMP, `${id}.in`);
  const output = path.join(TMP, `${id}.png`);
  try {
    fs.writeFileSync(input, buffer);
    await runFfmpeg(['-i', input, '-vf', filter, output]);
    const out = fs.readFileSync(output);
    await ctx.send({ image: out, caption: `╭─「 🖼️ ${caption} 」\n╰─ ⚡ _Filtro aplicado con éxito_` });
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(output, { force: true });
  }
}

const media = [
  {
    name: 'flip',
    aliases: ['espejo'],
    category: 'media',
    desc: 'Voltea una imagen horizontalmente (efecto espejo).',
    usage: 'flip [responde a una imagen]',
    async execute(ctx) {
      await applyFilter(ctx, 'hflip', 'espejo', 'EFECTO ESPEJO');
    },
  },
  {
    name: 'flop',
    aliases: ['voltear'],
    category: 'media',
    desc: 'Voltea una imagen verticalmente (cabeza abajo).',
    usage: 'flop [responde a una imagen]',
    async execute(ctx) {
      await applyFilter(ctx, 'vflip', 'vertical', 'VUELTA VERTICAL');
    },
  },
  {
    name: 'bw',
    aliases: ['blancoynegro', 'byn'],
    category: 'media',
    desc: 'Convierte una imagen a blanco y negro.',
    usage: 'bw [responde a una imagen]',
    async execute(ctx) {
      await applyFilter(ctx, 'format=gray', 'blanco y negro', 'BLANCO Y NEGRO');
    },
  },
  {
    name: 'sepia',
    category: 'media',
    desc: 'Efecto sepia (foto antigua).',
    usage: 'sepia [responde a una imagen]',
    async execute(ctx) {
      await applyFilter(
        ctx,
        'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
        'sepia',
        'FOTO ANTIGUA',
      );
    },
  },
  {
    name: 'blur',
    aliases: ['desenfoque', 'difuminar'],
    category: 'media',
    desc: 'Desenfoca una imagen.',
    usage: 'blur [responde a una imagen]',
    async execute(ctx) {
      await applyFilter(ctx, 'gblur=sigma=8', 'desenfoque', 'DESENFOCADO');
    },
  },
  {
    name: 'pixel',
    aliases: ['pixelar', 'mosaico'],
    category: 'media',
    desc: 'Pixela una imagen (efecto censura).',
    usage: 'pixel [responde a una imagen]',
    async execute(ctx) {
      await applyFilter(ctx, 'scale=iw/12:ih/12,scale=iw:ih:flags=neighbor', 'pixelado', 'PIXELADO');
    },
  },
  {
    name: 'rotate',
    aliases: ['rotar', 'girar'],
    category: 'media',
    desc: 'Rota una imagen 90 grados.',
    usage: 'rotate [responde a una imagen]',
    async execute(ctx) {
      await applyFilter(ctx, 'transpose=1', 'rotación', 'ROTADA 90°');
    },
  },
  {
    name: 'invert',
    aliases: ['negativo', 'invertir'],
    category: 'media',
    desc: 'Invierte los colores (negativo fotográfico).',
    usage: 'invert [responde a una imagen]',
    async execute(ctx) {
      await applyFilter(ctx, 'negate', 'negativo', 'NEGATIVO');
    },
  },
  {
    name: 'contrast',
    aliases: ['contraste'],
    category: 'media',
    desc: 'Aumenta el contraste de la imagen.',
    usage: 'contrast [responde a una imagen]',
    async execute(ctx) {
      await applyFilter(ctx, 'eq=contrast=2.2:saturation=1.3', 'contraste', 'ALTO CONTRASTE');
    },
  },
  {
    name: 'qrread',
    aliases: ['leerqr', 'scanqr', 'qrscan'],
    category: 'media',
    desc: 'Lee un código QR de una imagen y muestra el contenido.',
    usage: 'qrread [responde a una imagen con QR]',
    async execute(ctx) {
      const target = await imageTarget(ctx);
      if (!target) return;
      await ctx.reply('🔍 *Leyendo el QR...*');
      const buffer = await ctx.downloadMedia(target);
      const data = await qrReadImage(buffer, 'image/png');
      await ctx.reply(
        `╭─「 🔍 QR LEÍDO 」\n│\n${/^https?:\/\//i.test(data) ? `🔗 ${data}` : `📝 ${truncate(data, 1200)}`}\n╰─ ⚡ _ZENITSU BOT_`,
      );
    },
  },
  {
    name: 'ocr',
    aliases: ['leertexto', 'textoimg', 'leerimagen'],
    category: 'media',
    desc: 'Extrae el texto de una imagen (foto de tarea, letrero...).',
    usage: 'ocr [responde a una imagen]',
    async execute(ctx) {
      const target = await imageTarget(ctx);
      if (!target) return;
      await ctx.reply('📖 *Leyendo el texto de la imagen...*');
      const buffer = await ctx.downloadMedia(target);
      const text = await ocrImage(buffer, 'image/jpeg');
      await ctx.reply(`╭─「 📖 TEXTO ENCONTRADO 」\n│\n${truncate(text, 3500)}\n╰─ ⚡ _OCR en español_`);
    },
  },
];

export default media;
