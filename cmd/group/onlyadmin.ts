import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["onlyadmin", "adminonly"],
  description: t("cmd_permite_comandos_solamente_a_a_9a41b7f8"),
  category: "group",
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] ?? "").toLowerCase();
    if (!["on", "off", "true", "false", "1", "0"].includes(value)) {
      return ctx.reply({
        text: t("cmd_value0_value1_value2_onlyadmin_cf967099", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_uso_incorrecto_096ed1d0")), value2: ctx.usedPrefix ?? ".", value3: ctx.usedPrefix ?? ".", value4: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    }

    const enabled = ["on", "true", "1"].includes(value);
    ctx.db.setGroup(ctx.from, { onlyAdmin: enabled ? 1 : 0 });
    return ctx.reply({
      text: t("cmd_value0_value1_value2_el_modo_s_c3443967", { value0: enabled ? "✅" : "❌", value1: fytBold(t("cmd_aura_reed_95dcfb15")), value2: fytBold(t("cmd_modo_solo_admins_db06a989")), value3: enabled ? "activado" : "desactivado", value4: fytBold(t("cmd_system_29d43743")) }),
    });
  },
};
