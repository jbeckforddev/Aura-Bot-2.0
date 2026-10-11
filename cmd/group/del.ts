import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["del", "delete", "borrar"],
  category: "admin",
  description: "Elimina un mensaje respondido o múltiples mensajes recientes (ej. .del 5).",
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, args, botJid } = ctx;

    let countArg = 0;
    if (args.length > 0) {
      const parsed = parseInt(args[0], 10);
      if (!isNaN(parsed) && parsed > 0) {
        countArg = Math.min(parsed, 50);
      }
    }

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const repliedParticipant = contextInfo?.participant || null;
    const repliedMsgId = contextInfo?.stanzaId || null;
    const mentioned = contextInfo?.mentionedJid?.[0] || null;

    if (countArg === 0 && repliedParticipant) {
      countArg = 1;
    } else if (countArg === 0 && !repliedParticipant && !mentioned) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("SINTAXIS INCORRECTA")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Especifica la cantidad o responde\n┃ > a un mensaje.\n┃ > Ej: .del 5 | .del 3 @user\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    } else if (countArg === 0 && mentioned) {
      countArg = 1;
    }

    const targetUser = repliedParticipant || mentioned || null;
    const deleteGroupMessages = !targetUser;

    if (countArg === 1 && repliedMsgId && repliedParticipant) {
      const cleanBotJid = botJid.split(":")[0] + "@s.whatsapp.net";
      const cleanQuotedPart = repliedParticipant.split(":")[0] + "@s.whatsapp.net";
      const isFromMe = cleanQuotedPart === cleanBotJid;

      try {
        await sock.sendMessage(from, {
          delete: {
            remoteJid: from,
            fromMe: isFromMe,
            id: repliedMsgId,
            participant: repliedParticipant
          }
        });
        await react("✅").catch(() => undefined);
        return;
      } catch {
        await react("❌").catch(() => undefined);
        return reply(`╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("ERROR INTERNO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > No se pudo borrar el mensaje.\n┃ > Puede que sea muy antiguo.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
      }
    }

    const store = (sock as any).store;
    const chatMessages = store?.messages?.[from]?.array || [];

    if (chatMessages.length === 0) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("CACHE VACÍA")}\n╰━━━━━━━━━━━━⬣\n\n┃ > No hay registro de mensajes recientes\n┃ > en la memoria RAM del bot.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    const toDelete: any[] = [];
    const seenIds = new Set<string>();

    for (let i = chatMessages.length - 1; i >= 0 && toDelete.length < countArg; i--) {
      const m = chatMessages[i];
      const mParticipant = m.key.participant || m.key.remoteJid;

      if (!seenIds.has(m.key.id) && !m.message?.protocolMessage && m.key.id !== msg.key.id && !m.key.fromMe) {
        if (deleteGroupMessages || mParticipant === targetUser) {
          toDelete.push(m);
          seenIds.add(m.key.id);
        }
      }
    }

    if (toDelete.length === 0) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("SIN RESULTADOS")}\n╰━━━━━━━━━━━━⬣\n\n┃ > No se encontraron mensajes recientes\n┃ > que coincidan con la búsqueda.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    await react("⏳").catch(() => undefined);

    let deletedCount = 0;
    for (const m of toDelete) {
      try {
        const msgParticipant = deleteGroupMessages ? (m.key.participant || m.key.remoteJid) : (m.key.participant || targetUser);
        await sock.sendMessage(from, {
          delete: {
            remoteJid: from,
            fromMe: false,
            id: m.key.id,
            participant: msgParticipant
          }
        });
        deletedCount++;
        await new Promise(r => setTimeout(r, 350));
      } catch {}
    }

    await reply(`╭〔 ✅ ${fytBold("LIMPIEZA EXITOSA")} 〕━⬣\n┃ 🗑️ Mensajes borrados: ${deletedCount}\n╰━━━━━━━━━━━━⬣`);
    await react("✅").catch(() => undefined);
  }
};
