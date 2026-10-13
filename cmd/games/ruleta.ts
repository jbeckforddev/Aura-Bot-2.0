import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["ruleta", "rr"],
  category: "games",
  description: t("cmd_juego_de_ruleta_rusa_1_de_6_pr_63648697"),
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;
    
    const sender = msg.key.participant || msg.key.remoteJid;
    const isGroup = from.endsWith("@g.us");

    if (!isGroup || !sender) {
      return reply(t("cmd_value0_value1_abc43fce", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_solo_grupos_89f57a2b")) }));
    }

    const groupMetadata = await sock.groupMetadata(from).catch(() => null);
    if (!groupMetadata) return;

    const botNumber = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
    const botParticipant = groupMetadata.participants.find((p) => p.id === botNumber);
    const senderParticipant = groupMetadata.participants.find((p) => p.id === sender);

    const isBotAdmin = botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin";
    const isSenderAdmin = senderParticipant?.admin === "admin" || senderParticipant?.admin === "superadmin";

    if (!isBotAdmin) {
      return reply(t("cmd_value0_value1_abc43fce", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_necesito_ser_admin_964598c4")) }));
    }

    if (isSenderAdmin) {
      return reply(t("cmd_value0_value1_5f1c8b4a", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_admins_inmunes_1eb5c768")) }));
    }

    await react("🔫").catch(() => undefined);

    const initMsg = await sock.sendMessage(
      from,
      { text: t("cmd_value0_girando_el_tambor_c95ca2bd", { value0: fytBold(t("cmd_ruleta_rusa_81877e42")) }) },
      { quoted: msg as any }
    ).catch(() => null);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const isDead = Math.floor(Math.random() * 6) === 0;

    if (isDead) {
      if (initMsg?.key) {
        await sock.sendMessage(from, { 
          text: t("cmd_value0_bam_te_volaste_la_cabez_4d7d3f17", { value0: fytBold(t("cmd_ruleta_rusa_81877e42")) }),
          edit: initMsg.key 
        }).catch(() => undefined);
      }
      await sock.groupParticipantsUpdate(from, [sender], "remove").catch(() => undefined);
    } else {
      if (initMsg?.key) {
        await sock.sendMessage(from, { 
          text: t("cmd_value0_click_te_salvaste_esta__8397637f", { value0: fytBold(t("cmd_ruleta_rusa_81877e42")) }),
          edit: initMsg.key 
        }).catch(() => undefined);
      }
    }
  }
};
