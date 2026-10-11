import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["dmsg", "forcedel", "ownerdel"],
  category: "owner",
  description: "Fuerza la eliminación de cualquier mensaje (Bypass de permisos).",
  groupOnly: true,
  ownerOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, botJid } = ctx;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    
    if (!contextInfo || !contextInfo.stanzaId) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA MENSAJE")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Responde al mensaje que\n┃ > deseas eliminar forzosamente.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    const quotedId = contextInfo.stanzaId;
    const quotedParticipant = contextInfo.participant || from;
    
    const cleanBotJid = botJid.split(":")[0] + "@s.whatsapp.net";
    const cleanQuotedPart = quotedParticipant.split(":")[0] + "@s.whatsapp.net";
    
    const key = {
      remoteJid: from,
      fromMe: cleanQuotedPart === cleanBotJid,
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
