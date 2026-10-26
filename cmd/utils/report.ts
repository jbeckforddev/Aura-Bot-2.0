import type { CommandContext } from "../../types/index";
import { fytBold } from "../../core/socketText.ts";
import {
  REPORT_GROUP_JID,
  createReportId,
  getSocketCandidates,
  reportCaption,
  sendWithAvailableBot,
} from "../../core/reportUtils.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["report", "bug", "sugerencia", "sugerir"],
  category: "system",
  description: t("cmd_envia_un_bug_o_sugerencia_al_g_b4673ce4"),
  async run(ctx: CommandContext) {
    const reportText = ctx.args.join(" ").trim();
    if (!reportText) {
      return ctx.reply(
        t("cmd_value0_escribe_tu_reporte_ejem_b67f3090", { value0: fytBold(t("cmd_falta_texto_c2677da2")), value1: ctx.usedPrefix || "." }),
      );
    }

    const data = {
      id: createReportId(),
      originJid: ctx.from,
      originName: ctx.groupName || undefined,
      senderJid: ctx.sender,
      botSession: String(ctx.sock?.sessionName || ctx.sock?.subBotId || "main"),
      sourceMessage:
        ctx.msg?.key && ctx.msg?.message
          ? { key: ctx.msg.key, message: ctx.msg.message }
          : undefined,
    };

    await ctx.react("📨");
    try {
      await sendWithAvailableBot(
        getSocketCandidates(ctx.sock),
        REPORT_GROUP_JID,
        {
          text: reportCaption(data, reportText),
          mentions: [ctx.sender],
        },
      );
      await ctx.react("✅");
      return ctx.reply(
        t("cmd_value0_id_value1_176a1c93", { value0: fytBold(t("cmd_reporte_enviado_51fb20b4")), value1: data.id }),
      );
    } catch (error) {
      console.error("[report] No se pudo enviar el reporte:", error);
      await ctx.react("❌");
      return ctx.reply(t("cmd_no_se_pudo_enviar_el_reporte_i_d3fbafd8"));
    }
  },
};
