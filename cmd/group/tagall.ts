import type { CommandContext } from "../../types/index.d.ts";
import {
  jidNormalizedUser,
  type GroupParticipant,
} from "baileys";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["all", "todos", "invocar"],
  category: "group",
  description: t("cmd_menciona_a_todos_los_integrant_3f486f5d"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    const participants = Array.isArray(ctx.groupMeta?.participants)
      ? ctx.groupMeta.participants
      : [];
    const memberJids = Array.from(
      new Set<string>(
        participants
          .map((participant: GroupParticipant) => participant?.id)
          .filter(Boolean)
          .map((jid: string) => String(jidNormalizedUser(jid))),
      ),
    );
    if (!memberJids.length)
      return ctx.reply({
        text: t("cmd_value0_value1_no_se_han_encont_35ca2480", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sin_miembros_validos_73d3f94e")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    const quotedMessage =
      ctx.msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText =
      quotedMessage?.conversation ||
      quotedMessage?.extendedTextMessage?.text ||
      "𝐀𝐜𝐭𝐢́𝐯𝐞𝐧𝐬𝐞";
    const customMessage = ctx.args.join(" ") || quotedText;
    let text = t("cmd_value0_value1_1b5f5a78", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_invocando_al_grupo_8c02e6b8")) });
    text += t("cmd_value0_value1_value2_44267d7d", { value0: customMessage, value1: fytBold(t("cmd_n_de_miembros_c29f5eb4")), value2: memberJids.length });
    text += memberJids.map((jid) => t("cmd_value0_424156a2", { value0: jid.split("@")[0] })).join(t("cmd_text_adc83b19"));
    text += t("cmd_value0_d8d6cd6a", { value0: fytBold(t("cmd_system_29d43743")) });
    return ctx.reply({ text, mentions: memberJids });
  },
};
