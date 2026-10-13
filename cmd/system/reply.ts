import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import {
  REPORT_GROUP_JID,
  decodeReportData,
  getQuotedText,
  getSocketCandidates,
  replyCaption,
  sendWithAvailableBot,
} from "../../core/reportUtils.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["reply", "replyreport", "responderreport"],
  category: "system",
  description:
    t("cmd_responde_un_reporte_y_devuelve_7e49b62a"),
  groupOnly: true,
  async run(ctx: CommandContext) {
    if (ctx.from !== REPORT_GROUP_JID)
      return ctx.reply(t("cmd_este_comando_solo_funciona_en__d37dc415"));

    const response = ctx.args.join(" ").trim();
    const report = decodeReportData(getQuotedText(ctx.msg));
    if (!report)
      return ctx.reply(
        t("cmd_value0_responde_directamente_a_d39e5ae9", { value0: fytBold(t("cmd_reporte_no_encontrado_c58d2f1e")) }),
      );
    if (!response)
      return ctx.reply(t("cmd_escribe_la_respuesta_despues_d_b838afd6"));

    try {
      await sendWithAvailableBot(
        getSocketCandidates(ctx.sock),
        report.originJid,
        { text: replyCaption(response), mentions: [report.senderJid] },
        report.sourceMessage ? { quoted: report.sourceMessage } : undefined,
      );
      return ctx.reply(t("cmd_value0_value1_59a47a78", { value0: fytBold(t("cmd_respuesta_enviada_3ec9e181")), value1: report.id }));
    } catch (error) {
      console.error("[repli] No se pudo devolver la respuesta:", error);
      return ctx.reply(
        t("cmd_ningun_bot_pudo_enviar_la_resp_5e115d03"),
      );
    }
  },
};
