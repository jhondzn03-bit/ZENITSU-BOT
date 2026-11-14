import fs from 'node:fs';
import webpmux from 'node-webpmux';
import { tmpFile, runFfmpeg } from './utils.js';

const { Image } = webpmux;

function writeTmp(buffer, ext) {
  const file = tmpFile(ext);
  fs.writeFileSync(file, buffer);
  return file;
}

function safeUnlink(...files) {
  for (const f of files) {
    try {
      if (f) fs.rmSync(f, { force: true });
    } catch {}
  }
}

export async function addStickerMetadata(webpBuffer, pack = 'ZENITSU BOT', author = 'Zenitsu') {
  try {
    const img = new Image();
    await img.load(webpBuffer);
    const json = {
      'sticker-pack-id': 'com.zenitsu.bot',
      'sticker-pack-name': pack,
      'sticker-pack-publisher': author,
      emojis: ['⚡', '🌩️'],
      'image-data': [0, 0, 0, 0, 0, 0, 0, 0],
    };
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);
    img.exif = exif;
    const out = await img.save(null);
    return Buffer.isBuffer(out) ? out : webpBuffer;
  } catch {
    return webpBuffer;
  }
}

export async function mediaToSticker(inputBuffer, options = {}) {
  const { isVideo = false, isAnimatedWebp = false, pack = 'ZENITSU BOT', author = 'Zenitsu' } = options;
  let input;
  let output;

  try {
    if (isAnimatedWebp) {
      const withMeta = await addStickerMetadata(inputBuffer, pack, author);
      return withMeta;
    }

    input = writeTmp(inputBuffer, isVideo ? 'mp4' : 'img');
    output = tmpFile('webp');

    const filter =
      'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';

    if (isVideo) {
      const attempts = [
        { t: '6', fps: '15', q: '65' },
        { t: '5', fps: '12', q: '50' },
        { t: '4', fps: '10', q: '35' },
      ];
      let lastErr;
      for (const a of attempts) {
        try {
          await runFfmpeg([
            '-i', input,
            '-t', a.t,
            '-vf', `${filter},fps=${a.fps}`,
            '-c:v', 'libwebp',
            '-lossless', '0',
            '-q:v', a.q,
            '-loop', '0',
            '-an',
            output,
          ]);
          const buf = fs.readFileSync(output);
          if (buf.length <= 1000 * 1024) {
            return await addStickerMetadata(buf, pack, author);
          }
          lastErr = new Error('El sticker animado supera 1 MB');
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('No se pudo convertir el video a sticker');
    }

    await runFfmpeg([
      '-i', input,
      '-vf', filter,
      '-c:v', 'libwebp',
      '-lossless', '1',
      '-q:v', '80',
      '-frames:v', '1',
      output,
    ]);
    const buf = fs.readFileSync(output);
    return await addStickerMetadata(buf, pack, author);
  } finally {
    safeUnlink(input, output);
  }
}

export async function stickerToImage(stickerBuffer) {
  const input = writeTmp(stickerBuffer, 'webp');
  const output = tmpFile('png');
  try {
    await runFfmpeg(['-i', input, '-frames:v', '1', output]);
    return fs.readFileSync(output);
  } finally {
    safeUnlink(input, output);
  }
}

export async function mediaToAudio(inputBuffer, ext = 'mp4') {
  const input = writeTmp(inputBuffer, ext);
  const output = tmpFile('mp3');
  try {
    await runFfmpeg(['-i', input, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', output]);
    return fs.readFileSync(output);
  } finally {
    safeUnlink(input, output);
  }
}

// WhatsApp solo reproduce notas de voz (ptt) en OGG/Opus. Si se envía un MP3
// con ptt:true, el teléfono muestra "Este audio no está disponible...".
export async function audioToVoiceNote(inputBuffer, ext = 'mp3') {
  const input = writeTmp(inputBuffer, ext);
  const output = tmpFile('ogg');
  try {
    await runFfmpeg([
      '-i', input,
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-ar', '48000',
      '-ac', '1',
      '-f', 'ogg',
      output,
    ]);
    return fs.readFileSync(output);
  } finally {
    safeUnlink(input, output);
  }
}

export async function gifToMp4(inputBuffer) {
  const input = writeTmp(inputBuffer, 'gif');
  const output = tmpFile('mp4');
  try {
    await runFfmpeg([
      '-i', input,
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '24',
      '-an',
      output,
    ]);
    return fs.readFileSync(output);
  } finally {
    safeUnlink(input, output);
  }
}
