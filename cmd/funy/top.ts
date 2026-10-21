import type { GroupMetadata, GroupParticipant } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["top"],
  category: "funy",
  description: t("cmd_crea_un_top_10_aleatorio_con_u_6de60749"),
  groupOnly: true,

  async run(ctx: CommandContext) {
    if (!ctx.groupMeta) {
      return ctx.reply(t("cmd_este_comando_solo_funciona_en__9de14eee"));
    }
    const groupMetadata = ctx.groupMeta;
    const participants = Array.isArray(groupMetadata.participants)
      ? groupMetadata.participants.filter((participant: GroupParticipant) =>
          Boolean(participant?.id),
        )
      : [];
    const topic = ctx.args.join(" ") || "los más locos";
    const top10 = [...participants]
      .sort(() => Math.random() - 0.5)
      .slice(0, 10);

    let text = t("cmd_value0_baa82aee", { value0: fytBold(t("cmd_top_10_63d898ea")) });
    text += t("cmd_value0_17cf0eab", { value0: fytBold(topic.toUpperCase()) });
    text += t("cmd_text_bdfd7fa0");

    top10.forEach((participant: GroupParticipant, index: number) => {
      text += t("cmd_value0_value1_f625c3e4", { value0: index + 1, value1: participant.id.split("@")[0] });
    });

    text += t("cmd_value0_d225103c", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });

    return ctx.reply({
      text,
      mentions: top10.map((participant: GroupParticipant) => participant.id),
    });
  },
};
