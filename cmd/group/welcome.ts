import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const ON = ["on", "1", "true", "activar", "enable"];
const OFF = ["off", "0", "false", "desactivar", "disable"];

export default {
  name: ["welcome", "bienvenida"],
  category: "group",
  description: t("cmd_activa_o_desactiva_los_mensaje_59f26aef"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] || "").toLowerCase();
    const group = ctx.db.getGroup(ctx.from);
    if (!ON.includes(value) && !OFF.includes(value))
      return ctx.reply({
        text: t("cmd_value0_value1_estado_actual_va_49ea8b7d", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sistema_de_bienvenida_6d917fae")), value2: group.welcome ? "✅ Activado" : "❌ Desactivado", value3: ctx.usedPrefix || ".", value4: ctx.usedPrefix || ".", value5: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    const enabled = ON.includes(value);
    ctx.db.setGroup(ctx.from, { welcome: enabled ? 1 : 0 });
    return ctx.reply({
      text: t("cmd_value0_value1_value2_la_bienve_1dddcb50", { value0: enabled ? "✅" : "❌", value1: fytBold(t("cmd_aura_reed_95dcfb15")), value2: fytBold(t("cmd_sistema_de_bienvenida_6d917fae")), value3: enabled ? "activada" : "desactivada", value4: fytBold(enabled ? "SYSTEM INFO" : "SYSTEM ACTIVE") }),
    });
  },
};
