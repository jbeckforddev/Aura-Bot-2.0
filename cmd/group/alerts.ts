import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const ON = ["on", "1", "true", "activar", "enable"];
const OFF = ["off", "0", "false", "desactivar", "disable"];

export default {
  name: ["alerts", "alertas", "adminalerts"],
  category: "group",
  description: t("cmd_activa_o_desactiva_las_notific_29f9753f"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] || "").toLowerCase();
    const group = ctx.db.getGroup(ctx.from);
    if (!ON.includes(value) && !OFF.includes(value)) {
      return ctx.reply({
        text: t("cmd_value0_value1_estado_actual_va_e29bdac4", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sistema_de_alertas_83a4f8be")), value2: group.alerts ? "✅ Activado" : "❌ Desactivado", value3: ctx.usedPrefix || ".", value4: ctx.usedPrefix || ".", value5: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    }
    const enabled = ON.includes(value);
    ctx.db.setGroup(ctx.from, { alerts: enabled ? 1 : 0 });
    return ctx.reply({
      text: t("cmd_value0_value1_value2_las_notif_c1a0de8c", { value0: enabled ? "✅" : "❌", value1: fytBold(t("cmd_aura_reed_95dcfb15")), value2: fytBold(t("cmd_alertas_de_admin_61442fe6")), value3: enabled ? "activadas" : "desactivadas", value4: fytBold(enabled ? "SYSTEM INFO" : "SYSTEM ACTIVE") }),
    });
  },
};
