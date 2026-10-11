import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["del", "delete", "borrar"],
  category: "group",
  description: "Elimina un mensaje respondiendo a él.",
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, isAdmin, isBotAdmin, isGroup, botJid } = ctx;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    
    if (!contextInfo || !contextInfo.stanzaId) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("SINTAXIS INCORRECTA")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Responde al mensaje que\n┃ > deseas eliminar.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    const quotedId = contextInfo.stanzaId;
    const quotedParticipant = contextInfo.participant || from;
    
    const cleanBotJid = botJid.split(":")[0] + "@s.whatsapp.net";
    const cleanQuotedPart = quotedParticipant.split(":")[0] + "@s.whatsapp.net";
    const isFromMe = cleanQuotedPart === cleanBotJid;

    if (!isFromMe) {
      if (isGroup && !isBotAdmin) {
        return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("NECESITO SER ADMIN")}\n╰━━━━━━━━━━━━⬣\n\n┃ > No tengo permisos para borrar\n┃ > mensajes de otras personas.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
      }
      if (isGroup && !isAdmin) {
        return reply(`╭〔 🛑 ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("ACCESO DENEGADO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Solo los administradores pueden\n┃ > borrar mensajes de otros usuarios.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
      }
    }

    const key = {
      remoteJid: from,
      fromMe: isFromMe,
      id: quotedId,
      participant: quotedParticipant
    };

    try {
      await sock.sendMessage(from, { delete: key });
      await react("✅").catch(() => undefined);
    } catch {
      await react("❌").catch(() => undefined);
      await reply(`╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("ERROR INTERNO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > No se pudo borrar el mensaje.\n┃ > Puede que sea muy antiguo.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`).catch(() => undefined);
    }
  }
};
