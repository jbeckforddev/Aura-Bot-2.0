import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const ON = ["on", "1", "true", "activar", "enable"];
const OFF = ["off", "0", "false", "desactivar", "disable"];

export default {
  name: ["anticalls", "antillamadas", "antillamada", "callblock"],
  category: "group",
  description: t("cmd_bloquea_llamadas_entrantes_en__a5e1facb"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] || "").toLowerCase();
    const group = ctx.db.getGroup(ctx.from);
    if (!ON.includes(value) && !OFF.includes(value)) {
      return ctx.reply({
        text: t("cmd_value0_value1_estado_actual_va_dfec4d93", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_anti_call_dc18e541")), value2: group.antiCalls ? "✅ Activado" : "❌ Desactivado", value3: ctx.usedPrefix || ".", value4: ctx.usedPrefix || ".", value5: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    }
    const enabled = ON.includes(value);
    ctx.db.setGroup(ctx.from, { antiCalls: enabled ? 1 : 0 });
    return ctx.reply({
      text: t("cmd_value0_value1_value2_el_bloque_5740e064", { value0: enabled ? "✅" : "❌", value1: fytBold(t("cmd_aura_reed_95dcfb15")), value2: fytBold(t("cmd_sistema_anti_call_3b0a333b")), value3: enabled ? "activado" : "desactivado", value4: fytBold(t("cmd_system_29d43743")) }),
    });
  },
};
