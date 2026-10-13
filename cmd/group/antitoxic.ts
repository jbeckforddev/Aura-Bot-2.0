import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["antitoxic", "antitoxicos", "antitx"],
  category: "group",
  description: t("cmd_activa_el_sistema_anti_toxicid_13d04b8d"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] || "").toLowerCase();
    const group = ctx.db.getGroup(ctx.from);
    const validValues = [
      "on",
      "off",
      "1",
      "0",
      "true",
      "false",
      "activar",
      "desactivar",
      "enable",
      "disable",
    ];
    if (!validValues.includes(value)) {
      return ctx.reply({
        text: t("cmd_value0_value1_estado_actual_va_42652131", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sistema_antitoxic_b0c08817")), value2: group.antiToxic ? "✅ Activado" : "❌ Desactivado", value3: ctx.usedPrefix || ".", value4: ctx.usedPrefix || ".", value5: fytBold(t("cmd_system_29d43743")) }),
      });
    }

    const enabled = ["on", "true", "1", "activar", "enable"].includes(value);
    ctx.db.setGroup(ctx.from, { antiToxic: enabled ? 1 : 0 });
    return ctx.reply({
      text: t("cmd_value0_value1_value2_el_sistem_13ed81a3", { value0: enabled ? "✅" : "❌", value1: fytBold(t("cmd_aura_reed_95dcfb15")), value2: fytBold(t("cmd_sistema_antitoxic_b0c08817")), value3: enabled ? "activado" : "desactivado", value4: fytBold(t("cmd_system_active_e403484a")) }),
    });
  },
};
