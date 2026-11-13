// ─── Botones interactivos (compatibles con WhatsApp) ───────────────────────
// Usa "native flow" (interactiveMessage) que es lo que WhatsApp acepta hoy.
// Si el cliente/servidor rechaza el mensaje, cae a texto numerado para que
// nunca se quede sin respuesta.
import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

// Convierte la lista simple del bot en los botones que espera WhatsApp.
function toNativeButtons(buttons = []) {
  const out = [];
  for (const b of buttons) {
    if (!b) continue;
    const text = String(b.text || b.title || '').trim();
    if (!text) continue;

    if (b.url) {
      out.push({
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: text,
          url: String(b.url),
          merchant_url: String(b.url),
        }),
      });
    } else if (b.phone) {
      out.push({
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({
          display_text: text,
          phone_number: String(b.phone),
        }),
      });
    } else if (b.copy) {
      out.push({
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: text,
          copy_code: String(b.copy),
        }),
      });
    } else {
      out.push({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: text,
          id: String(b.id || text),
        }),
      });
    }
    // WhatsApp muestra como máximo 3 botones nativos.
    if (out.length >= 3) break;
  }
  return out;
}

// Envía un mensaje con botones. Devuelve el mensaje enviado (o el de texto).
//   { text, title, footer, buttons: [{ id, text } | { text, url }], quoted }
export async function sendButtons(sock, jid, options = {}) {
  const { text = '', title = '', footer = '', buttons = [], quoted = null } = options;
  const native = toNativeButtons(buttons);
  if (!native.length) {
    return sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
  }

  try {
    const interactiveMessage = {
      ...(title ? { header: { title: String(title), hasMediaAttachment: false } } : {}),
      body: { text: String(text || ' ') },
      ...(footer ? { footer: { text: String(footer) } } : {}),
      nativeFlowMessage: {
        buttons: native,
        messageParamsJson: '',
        messageVersion: 1,
      },
    };

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage,
          },
        },
      },
      { userJid: sock?.user?.id || '', ...(quoted ? { quoted } : {}) },
    );

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch (err) {
    console.error('[BUTTONS] fallo el mensaje interactivo:', err?.message || err);
    // Respaldo: texto con las opciones numeradas (el usuario puede escribir).
    const lines = [text];
    lines.push('');
    buttons.forEach((b, i) => {
      const extra = b.url ? ` → ${b.url}` : b.phone ? ` → ${b.phone}` : '';
      lines.push(`${i + 1}. ${b.text || b.title}${extra}`);
    });
    if (footer) {
      lines.push('');
      lines.push(String(footer));
    }
    return sock.sendMessage(jid, { text: lines.join('\n') }, quoted ? { quoted } : {});
  }
}

// Atajo para un menú desplegable (single_select) con secciones.
export async function sendSelectMenu(
  sock,
  jid,
  { text = '', title = '', footer = '', sections = [], quoted = null } = {},
) {
  const payload = {
    title: title || 'Opciones',
    sections: (sections || []).map((s) => ({
      title: String(s.title || ''),
      ...(s.highlight ? { highlight_label: String(s.highlight) } : {}),
      rows: (s.rows || []).map((r) => ({
        header: String(r.header || ''),
        title: String(r.title || r.text || ''),
        description: String(r.description || ''),
        id: String(r.id || r.title || ''),
      })),
    })),
  };

  try {
    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: {
              ...(title ? { header: { title: String(title), hasMediaAttachment: false } } : {}),
              body: { text: String(text || ' ') },
              ...(footer ? { footer: { text: String(footer) } } : {}),
              nativeFlowMessage: {
                buttons: [
                  {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify(payload),
                  },
                ],
                messageParamsJson: '',
                messageVersion: 1,
              },
            },
          },
        },
      },
      { userJid: sock?.user?.id || '', ...(quoted ? { quoted } : {}) },
    );
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch (err) {
    console.error('[BUTTONS] fallo el menú desplegable:', err?.message || err);
    return sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
  }
}
