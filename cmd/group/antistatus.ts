import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const ON = ["on", "1", "true", "activar", "enable"];
const OFF = ["off", "0", "false", "desactivar", "disable"];

export default {
  name: ["antistatus", "antiestado", "statusblock", "antistat"],
  category: "group",
  description: t("cmd_bloquea_estados_que_mencionen__d4c1e8eb"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] || "").toLowerCase();
    const group = ctx.db.getGroup(ctx.from);
    if (!ON.includes(value) && !OFF.includes(value)) {
      return ctx.reply({
        text: t("cmd_value0_value1_estado_actual_va_646ccd4a", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_anti_estado_2f7e2da3")), value2: group.antiStatus ? "✅ Activado" : "❌ Desactivado", value3: ctx.usedPrefix || ".", value4: ctx.usedPrefix || ".", value5: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    }
    const enabled = ON.includes(value);
    ctx.db.setGroup(ctx.from, { antiStatus: enabled ? 1 : 0 });
    return ctx.reply({
      text: t("cmd_value0_value1_value2_el_bloque_be5371e0", { value0: enabled ? "✅" : "❌", value1: fytBold(t("cmd_aura_reed_95dcfb15")), value2: fytBold(t("cmd_sistema_anti_estado_ee95a056")), value3: enabled ? "activado" : "desactivado", value4: fytBold(t("cmd_system_29d43743")) }),
    });
  },
};
