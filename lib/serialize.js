import { getContentType } from '@whiskeysockets/baileys';
import { jidToNumber } from './utils.js';

const MEDIA_TYPES = new Set([
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'stickerMessage',
  'documentMessage',
  'ptvMessage',
]);

const TEXT_TYPES = new Set([
  'conversation',
  'extendedTextMessage',
  'imageMessage',
  'videoMessage',
  'documentMessage',
  'ptvMessage',
]);

export function unwrapMessage(message) {
  let m = message;
  for (let i = 0; i < 6 && m; i++) {
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    else if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    else if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    else if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
    else if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
    else break;
  }
  return m;
}

export function extractText(message) {
  if (!message) return '';
  const type = getContentType(message);
  const content = type ? message[type] : null;
  if (!content) return '';
  if (type === 'conversation') return String(content);
  if (typeof content.text === 'string') return content.text;
  if (typeof content.caption === 'string') return content.caption;
  if (type === 'buttonsResponseMessage') return content.selectedButtonId || '';
  if (type === 'listResponseMessage') return content.singleSelectReply?.selectedRowId || content.title || '';
  if (type === 'templateButtonReplyMessage') return content.selectedId || '';
  if (type === 'reactionMessage') return content.text || '';
  return '';
}

export function getMediaType(type) {
  const map = {
    imageMessage: 'image',
    videoMessage: 'video',
    ptvMessage: 'video',
    audioMessage: 'audio',
    stickerMessage: 'sticker',
    documentMessage: 'document',
  };
  return map[type] || null;
}

export function serializeMessage(sock, msg) {
  const raw = msg.message;
  if (!raw) return null;

  const message = unwrapMessage(raw);
  const type = getContentType(message);
  const content = type ? message[type] : null;
  if (!type || !content) return null;

  const chat = msg.key.remoteJid;
  const fromMe = Boolean(msg.key.fromMe);
  const botJid = sock?.user?.id || '';
  const isGroup = chat?.endsWith('@g.us') || false;
  const isStatus = chat === 'status@broadcast';

  // WhatsApp puede usar identificadores LID (@lid) en lugar del número real.
  // Los campos *Alt contienen el JID con el número de teléfono (PN).
  const senderAlt = msg.key.participantAlt || msg.key.remoteJidAlt || '';
  let sender;
  if (fromMe) {
    sender = msg.key.participantAlt || msg.key.participant || botJid || chat || '';
  } else {
    sender = senderAlt || msg.key.participant || chat || '';
  }

  const contextInfo =
    content?.contextInfo ||
    message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo ||
    message.videoMessage?.contextInfo ||
    null;

  const mentioned = contextInfo?.mentionedJid || [];
  const body = extractText(message).trim();

  let quoted = null;
  if (contextInfo?.quotedMessage) {
    const quotedMessage = unwrapMessage(contextInfo.quotedMessage);
    const quotedType = getContentType(quotedMessage);
    const quotedContent = quotedType ? quotedMessage[quotedType] : null;
    const quotedSender =
      contextInfo.participant ||
      (isGroup ? '' : contextInfo.remoteJid || chat) ||
      chat ||
      '';
    quoted = {
      message: quotedMessage,
      type: quotedType,
      content: quotedContent,
      text: extractText(quotedMessage),
      sender: quotedSender,
      senderNumber: jidToNumber(quotedSender),
      mentionedJid: contextInfo.mentionedJid || [],
      key: {
        remoteJid: chat,
        fromMe: Boolean(botJid && quotedSender && jidToNumber(quotedSender) === jidToNumber(botJid)),
        id: contextInfo.stanzaId,
        participant: contextInfo.participant,
      },
      mediaType: getMediaType(quotedType),
      hasMedia: MEDIA_TYPES.has(quotedType),
    };
  }

  return {
    raw,
    message,
    type,
    content,
    chat,
    chatNumber: jidToNumber(chat),
    chatAlt: msg.key.remoteJidAlt || '',
    sender,
    senderAlt,
    senderNumber: jidToNumber(sender),
    fromMe,
    isGroup,
    isStatus,
    pushName: msg.pushName || '',
    body,
    text: body,
    mentioned,
    quoted,
    quotedSender: quoted?.sender || '',
    mediaType: getMediaType(type),
    hasMedia: MEDIA_TYPES.has(type),
    isText: TEXT_TYPES.has(type),
    id: msg.key.id,
    timestamp: Number(msg.messageTimestamp || 0) * 1000 || Date.now(),
    contextInfo,
    key: msg.key,
    botJid,
    botNumber: jidToNumber(botJid),
  };
}
