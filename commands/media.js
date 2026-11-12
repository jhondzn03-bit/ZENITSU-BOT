import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { ocrImage, qrReadImage, removeBackground } from '../lib/api.js';
import { stickerToImage } from '../lib/sticker.js';
import { fetchBuffer, isUrl, tmpFile, truncate } from '../lib/utils.js';

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
  const input = tmpFile('in');
  const output = tmpFile('png');
  try {
    fs.writeFileSync(input, buffer);
    await runFfmpeg(['-i', input, '-frames:v', '1', '-vf', filter, output]);
    const out = fs.readFileSync(output);
    await ctx.send({ image: out, caption: `╭─「 🖼️ ${caption} 」\n╰─ ⚡ _Filtro aplicado con éxito_` });
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(output, { force: true });
  }
}

/* ── Utilidades para .removebg / .hd ─────────────────────────────────────── */

// Detecta el formato real por los primeros bytes (no por el mimetype que dice
// WhatsApp, que a veces viene vacío o equivocado).
function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (buffer.toString('ascii', 0, 3) === 'GIF') return { mime: 'image/gif', ext: 'gif' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}

// Acepta imagen respondida, imagen enviada con el comando, sticker o enlace.
// Así .removebg y .hd funcionan "con cualquier cosa".
async function resolveImageBuffer(ctx) {
  const target = ctx.m?.quoted?.hasMedia ? ctx.m.quoted : ctx.m?.hasMedia ? ctx.m : null;
  if (target) {
    if (target.mediaType === 'image') {
      const buffer = await ctx.downloadMedia(target);
      return { buffer, ...sniffImage(buffer) };
    }
    if (target.mediaType === 'sticker') {
      const webp = await ctx.downloadMedia(target);
      const buffer = await stickerToImage(webp);
      return { buffer, mime: 'image/png', ext: 'png' };
    }
    await ctx.reply(`🖼️ Necesito una *imagen* o un *sticker*, no un archivo *${target.mediaType}*.`);
    return null;
  }
  const url = (ctx.args || []).find((a) => isUrl(a));
  if (url) {
    const buffer = await fetchBuffer(url);
    return { buffer, ...sniffImage(buffer) };
  }
  await ctx.reply(
    `💡 *Responde a una imagen o sticker* con este comando, envíala junto a él, o pásame un enlace.`,
  );
  return null;
}

function probeSize(file) {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file],
      { timeout: 20000 },
      (err, stdout) => {
        if (err) return resolve({ width: 0, height: 0 });
        const [width, height] = String(stdout).trim().split('x').map(Number);
        resolve({ width: width || 0, height: height || 0 });
      },
    );
  });
}

// Si el PNG transparente sale muy pesado para WhatsApp, se reduce a 1600 px.
async function capPng(buffer, maxBytes = 6 * 1024 * 1024) {
  if (buffer.length <= maxBytes) return buffer;
  const input = tmpFile('png');
  const output = tmpFile('png');
  try {
    fs.writeFileSync(input, buffer);
    await runFfmpeg(['-i', input, '-frames:v', '1', '-vf', 'scale=1600:-2:flags=lanczos', output]);
    return fs.readFileSync(output);
  } catch {
    return buffer;
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
    name: 'removebg',
    aliases: ['rmbg', 'quitarfondo', 'sinfondo', 'nofondo', 'borrarfondo'],
    category: 'media',
    desc: 'Quita el fondo de una imagen con IA y devuelve un PNG transparente.',
    usage: 'removebg (responde a una imagen/sticker o pasa un enlace)',
    async execute(ctx) {
      const image = await resolveImageBuffer(ctx);
      if (!image) return;
      await ctx.reply('⏳ *Quitando el fondo con IA...* (puede tardar unos segundos)');
      const png = await capPng(
        await removeBackground(image.buffer, image.mime, `zenitsu.${image.ext}`),
      );
      await ctx.send({
        image: png,
        mimetype: 'image/png',
        caption: '╭─「 🪄 FONDO ELIMINADO 」\n│ 📦 PNG con transparencia\n╰─ ⚡ _ZENITSU BOT_',
      });
    },
  },
  {
    name: 'hd',
    aliases: ['upscale', 'remini', 'enhance', 'mejorar', 'calidad', 'hd2'],
    category: 'media',
    desc: 'Mejora y agranda una imagen (hasta 2x) con alta calidad.',
    usage: 'hd (responde a una imagen/sticker o pasa un enlace)',
    async execute(ctx) {
      const image = await resolveImageBuffer(ctx);
      if (!image) return;
      await ctx.reply('⏳ *Mejorando la imagen...*');
      const input = tmpFile(image.ext);
      const output = tmpFile('jpg');
      try {
        fs.writeFileSync(input, image.buffer);
        const { width, height } = await probeSize(input);
        const maxSide = Math.max(width, height) || 0;
        // 2x si la imagen cabe en 4096 px; si ya es enorme, solo se realza.
        const factor = maxSide && maxSide < 2048 ? 2 : 1;
        const scale =
          width && height
            ? `scale=${Math.round((width * factor) / 2) * 2}:${Math.round((height * factor) / 2) * 2}:flags=lanczos`
            : 'scale=iw*2:ih*2:flags=lanczos';
        const filter = `${scale},unsharp=5:5:0.9:3:3:0.4,eq=contrast=1.04:saturation=1.06`;
        await runFfmpeg(['-i', input, '-frames:v', '1', '-vf', filter, '-q:v', '2', output]);
        const out = fs.readFileSync(output);
        const size = width && height ? `${width * factor}×${height * factor}` : 'alta calidad';
        await ctx.send({
          image: out,
          caption: `╭─「 ✨ IMAGEN EN HD 」\n│ 📐 ${size}\n╰─ ⚡ _Calidad mejorada_`,
        });
      } finally {
        fs.rmSync(input, { force: true });
        fs.rmSync(output, { force: true });
      }
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
