import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["delwarn", "unwarn"],
  category: "group",
  description: t("cmd_quita_una_advertencia_588b1c0d"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const target = context?.mentionedJid?.[0] || context?.participant;
    if (!target)
      return ctx.reply({
        text: t("cmd_value0_value1_etiqueta_o_respo_7097823a", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_usuario_2df40348")), value2: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    const group = ctx.db.getGroup(ctx.from);
    const warns =
      group.warns && typeof group.warns === "object" ? group.warns : {};
    const history = Array.isArray(warns[target]) ? [...warns[target]] : [];
    if (!history.length)
      return ctx.reply({
        text: t("cmd_value0_value1_el_usuario_value_b71515bb", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sin_advertencias_26fdf320")), value2: target.split("@")[0], value3: fytBold(t("cmd_system_info_1a78a0cb")) }),
        mentions: [target],
      });
    history.pop();
    ctx.db.setGroup(ctx.from, { warns: { ...warns, [target]: history } });
    return ctx.reply({
      text: t("cmd_value0_value1_se_le_ha_quitado_c71a274f", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_advertencia_eliminada_930bde6f")), value2: target.split("@")[0], value3: history.length, value4: group.warnLimit || 3, value5: fytBold(t("cmd_system_info_1a78a0cb")) }),
      mentions: [target],
    });
  },
};
