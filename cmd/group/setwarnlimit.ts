import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["setwarnlimit", "warnlimit"],
  category: "group",
  description: t("cmd_define_el_limite_de_advertenci_98abe9b4"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.isAdmin && !ctx.isMod && !ctx.isOwner)
      return ctx.reply({
        text: t("cmd_value0_value1_solo_los_adminis_4d6bb147", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_permiso_denegado_a479cad0")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    const limit = Number.parseInt(ctx.args?.[0] || "", 10);
    if (!Number.isInteger(limit) || limit < 1)
      return ctx.reply({
        text: t("cmd_value0_value1_debes_proporcion_66ad4617", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_uso_incorrecto_096ed1d0")), value2: ctx.usedPrefix || ".", value3: fytBold(t("cmd_system_29d43743")) }),
      });
    ctx.db.setGroup(ctx.from, { warnLimit: limit });
    return ctx.reply({
      text: t("cmd_value0_value1_limite_de_advert_b905afe9", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_configuracion_84529399")), value2: limit, value3: fytBold(t("cmd_system_29d43743")) }),
    });
  },
};
