import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["dmsg", "forcedel", "ownerdel", "del"],
  category: "owner",
  description: t("cmd_fuerza_la_eliminacion_de_cualq_3ea5b232"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, botJid } = ctx;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    
    if (!contextInfo || !contextInfo.stanzaId) {
      return reply(t("cmd_value0_value1_responde_al_mens_0a474b8d", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_mensaje_dba5d803")), value2: fytBold(t("cmd_system_29d43743")) }));
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
      await reply(t("cmd_value0_value1_no_se_pudo_borra_5837cd41", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_error_interno_6dc10549")), value2: fytBold(t("cmd_system_29d43743")) })).catch(() => undefined);
    }
  }
};
