import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const ON = ["on", "1", "true", "activar", "enable"];
const OFF = ["off", "0", "false", "desactivar", "disable"];

export default {
  name: ["antilink", "antienlace", "antigp"],
  category: "group",
  description: t("cmd_bloquea_enlaces_de_otros_grupo_69ec1bd4"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] || "").toLowerCase();
    const group = ctx.db.getGroup(ctx.from);
    if (!ON.includes(value) && !OFF.includes(value)) {
      return ctx.reply({
        text: t("cmd_value0_value1_estado_actual_va_a8905cb4", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sistema_antilink_d9ff93f0")), value2: group.antilink ? "✅ Activado" : "❌ Desactivado", value3: ctx.usedPrefix || ".", value4: ctx.usedPrefix || ".", value5: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    }
    const enabled = ON.includes(value);
    ctx.db.setGroup(ctx.from, { antilink: enabled ? 1 : 0 });
    return ctx.reply({
      text: t("cmd_value0_value1_value2_el_sistem_6c73100b", { value0: enabled ? "✅" : "❌", value1: fytBold(t("cmd_aura_reed_95dcfb15")), value2: fytBold(t("cmd_sistema_antilink_d9ff93f0")), value3: enabled ? "activado" : "desactivado", value4: fytBold(t("cmd_system_29d43743")) }),
    });
  },
};
