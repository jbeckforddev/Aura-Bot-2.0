import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const ON = ["on", "activar", "enable", "1", "true"];
const OFF = ["off", "desactivar", "disable", "0", "false"];

export default {
  name: ["bot"],
  category: "group",
  description: t("cmd_enciende_o_apaga_el_bot_en_el__c804077d"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] || "").toLowerCase();
    const group = ctx.db.getGroup(ctx.from);
    if (!value) {
      const state = group.botOn === 0 ? "Desactivado" : "Activado";
      return ctx.reply({
        text: t("cmd_value0_value1_el_bot_esta_actu_0b6464d6", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_estado_del_bot_bb6b3ad3")), value2: state, value3: ctx.usedPrefix || ".", value4: ctx.usedPrefix || ".", value5: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    }
    if (!ON.includes(value) && !OFF.includes(value))
      return ctx.reply({
        text: t("cmd_value0_value1_usa_value2_bot_o_326aa23a", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_parametro_invalido_2719b85d")), value2: ctx.usedPrefix || ".", value3: ctx.usedPrefix || ".", value4: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    const enabled = ON.includes(value);
    ctx.db.setGroup(ctx.from, { botOn: enabled ? 1 : 0 });
    return ctx.reply({
      text: t("cmd_value0_value1_value2_el_bot_ha_bdfe5f4f", { value0: enabled ? "✅" : "💤", value1: fytBold(t("cmd_aura_reed_95dcfb15")), value2: fytBold(enabled ? "BOT ACTIVADO" : "BOT DESACTIVADO"), value3: enabled ? "reactivado para este grupo" : "apagado para este grupo", value4: enabled ? "Ya pueden usar mis comandos." : "Solo responderé para reactivarse.", value5: fytBold(enabled ? "SYSTEM ACTIVE" : "SYSTEM SLEEP") }),
    });
  },
};
