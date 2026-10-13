import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["setprefix", "prefix", "delprefix", "deleteprefix"],
  description: t("cmd_cambia_el_prefijo_de_este_grup_7a070657"),
  category: "group",
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    if (["delprefix", "deleteprefix"].includes(ctx.cmdName)) {
      ctx.db.setGroup(ctx.from, { prefix: "" });
      return ctx.reply({
        text: t("cmd_value0_value1_se_usaran_los_pr_cedf98bf", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_prefijo_eliminado_63f2a10a")), value2: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    }

    const value = String(ctx.args?.[0] ?? "").trim();
    if (value && (value.length > 1 || /\s/.test(value))) {
      return ctx.reply({
        text: t("cmd_value0_value1_por_favor_propor_8c4d16b2", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_prefijo_invalido_b76bc94b")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    }

    ctx.db.setGroup(ctx.from, { prefix: value || "" });
    return ctx.reply(
      value
        ? t("cmd_prefijo_del_grupo_actualizado__49bbffac", { value0: value })
        : t("cmd_el_grupo_volvera_a_usar_los_pr_c121a556"),
    );
  },
};
