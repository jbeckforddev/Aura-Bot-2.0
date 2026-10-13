import type { CommandContext, GroupWarnEntry } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["listwarn", "warns", "verwarn", "viewwarn"],
  category: "group",
  description: t("cmd_muestra_las_advertencias_de_un_b2020f8b"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const target =
      context?.mentionedJid?.[0] ||
      context?.participant ||
      (ctx.args?.[0]
        ? `${ctx.args[0].replace(/\D/g, "")}@s.whatsapp.net`
        : null);
    if (!target)
      return ctx.reply({
        text: t("cmd_value0_value1_menciona_o_respo_3eed87f6", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_objetivo_d2546e73")), value2: ctx.usedPrefix || ".", value3: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    const history = ctx.db.getGroup(ctx.from).warns?.[target] || [];
    if (!Array.isArray(history) || history.length === 0)
      return ctx.reply({
        text: t("cmd_value0_value1_el_usuario_value_59f628ea", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sin_advertencias_26fdf320")), value2: target.split("@")[0], value3: fytBold(t("cmd_system_info_1a78a0cb")) }),
        mentions: [target],
      });
    const content = history
      .map(
        (warn: GroupWarnEntry, index: number) =>
          `┃ ${index + 1}. ${warn.reason || "Sin motivo"} • ${warn.date || "Sin fecha"}`,
      )
      .join("\n");
    return ctx.reply({
      text: t("cmd_value0_usuario_value1_total_va_3fa2a26b", { value0: fytBold(t("cmd_advertencias_b679466f")), value1: target.split("@")[0], value2: history.length, value3: content, value4: fytBold(t("cmd_warn_system_820d59db")) }),
      mentions: [target],
    });
  },
};
