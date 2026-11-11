import { createCustom, creatorHelp, customMenuText, deleteCustom } from '../lib/customcmd.js';

// ─── Comandos personalizados por grupo ────────────────────────────────────
// .crearcmd stock → crea .addstock .setstock .stock .delstock
// .delcmd stock   → borra la familia completa
// .menucmd        → lista los comandos del grupo
// Los .addX/.setX/.delX/.X se resuelven dinámicamente en el handler.

export default [
  {
    name: 'crearcmd',
    aliases: ['crearcomando', 'nuevocomando', 'addcmd'],
    category: 'admin',
    desc: 'Crea un comando personalizado del grupo (texto e imágenes).',
    usage: 'crearcmd <nombre>',
    group: true,
    async execute(ctx) {
      const name = String(ctx.args[0] || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');

      if (!name) {
        await ctx.reply(creatorHelp(ctx.prefix, 'stock'));
        return;
      }

      if (!ctx.isAdmin) {
        await ctx.reply('🛡️ Solo los *administradores* pueden crear comandos.');
        return;
      }

      try {
        createCustom(ctx.chat, name, ctx.sender);
        await ctx.reply(
          `✅ *COMANDO CREADO*\n\n` +
            `▸ Nombre: *${name}*\n` +
            `▸ Agrega contenido: *${ctx.prefix}add${name} tu texto*\n` +
            `▸ Usar: *${ctx.prefix}${name}*\n\n` +
            `_Te dejo la guía completa abajo._`,
        );
        await ctx.reply(creatorHelp(ctx.prefix, name));
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`);
      }
    },
  },
  {
    name: 'delcmd',
    aliases: ['borrarcomando', 'delcomando'],
    category: 'admin',
    desc: 'Borra un comando personalizado completo del grupo.',
    usage: 'delcmd <nombre>',
    group: true,
    async execute(ctx) {
      if (!ctx.isAdmin) {
        await ctx.reply('🛡️ Solo los *administradores* pueden borrar comandos.');
        return;
      }
      const name = String(ctx.args[0] || '').toLowerCase();
      if (!name) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}delcmd stock*`);
        return;
      }
      const ok = deleteCustom(ctx.chat, name);
      await ctx.reply(
        ok
          ? `🗑️ *COMANDO ELIMINADO:* ${name}\n\nYa no existe *${ctx.prefix}${name}*.`
          : `❌ El comando *${name}* no existe en este grupo.\n\n▸ Mira la lista: *${ctx.prefix}menucmd*`,
      );
    },
  },
  {
    name: 'menucmd',
    aliases: ['comandosgrupo', 'listacmd', 'customcmds'],
    category: 'admin',
    desc: 'Muestra los comandos personalizados del grupo.',
    usage: 'menucmd',
    group: true,
    async execute(ctx) {
      await ctx.reply(customMenuText(ctx.prefix, ctx.chat));
    },
  },
];
