import type { CommandContext } from "../../types/index.d.ts";
import {
  cooldownText,
  formatMoney,
  getBotCurrency,
  getEconomyUser,
} from "../../core/economyConfig.ts";
import { fytBold } from "../../core/socketText.ts";
import { formatDuration } from "../../utils/formatter.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["einfo", "economia"],
  category: "economy",
  description: t("cmd_muestra_informacion_sobre_como_30a7beac"),
  async run(ctx: CommandContext) {
    const user = getEconomyUser(ctx.from, ctx.sender);
    const now = Date.now();
    const getRemaining = (key: string, duration: number) => {
      const remaining = duration - (now - Number(user[key] ?? 0));
      if (remaining <= 0) return "✅ Disponible";

      const time = formatDuration(Math.max(0, Math.floor(remaining / 1000)));
      return `⏳ _${time || cooldownText(remaining)}_`;
    };
    const prefix = ctx.usedPrefix ?? ".";
    const currency = getBotCurrency(ctx);
    let text = t("cmd_value0_value1_7e990ec0", { value0: currency.symbol, value1: fytBold(t("cmd_sistema_economico_8b48da06")) });
    text += t("cmd_value0_c450bd91", { value0: fytBold(t("cmd_informacion_a853a589")) });
    text += t("cmd_text_bdfd7fa0");
    text += t("cmd_bienvenido_al_sistema_de_value_2041a3d8", { value0: currency.name, value1: currency.symbol });
    text += t("cmd_gana_ahorra_y_gestiona_tu_fort_a636f5a2");
    text += t("cmd_value0_1a3f5f2b", { value0: fytBold(t("cmd_como_ganar_4592bb98")) });
    text += t("cmd_value0_work_value1_167ce263", { value0: prefix, value1: getRemaining("lastWork", 3 * 60 * 1000) });
    text += t("cmd_value0_ppt_value1_804f3c3f", { value0: prefix, value1: getRemaining("lastPpt", 10 * 60 * 1000) });
    text += t("cmd_value0_mine_value1_680a477c", { value0: prefix, value1: getRemaining("lastMine", 30 * 60 * 1000) });
    text += t("cmd_value0_hunt_value1_b2bd2d29", { value0: prefix, value1: getRemaining("lastHunt", 30 * 60 * 1000) });
    text += t("cmd_value0_crime_value1_5dadd242", { value0: prefix, value1: getRemaining("lastCrime", 60 * 60 * 1000) });
    text += t("cmd_value0_slut_value1_d0d6e1fd", { value0: prefix, value1: getRemaining("lastSlut", 60 * 60 * 1000) });
    text += t("cmd_value0_steal_value1_00a268bd", { value0: prefix, value1: getRemaining("lastSteal", 60 * 60 * 1000) });
    text += t("cmd_value0_adventure_value1_f159aa0f", { value0: prefix, value1: getRemaining("lastAdventure", 2 * 60 * 60 * 1000) });
    text += t("cmd_value0_cf_value1_1bfbb3d2", { value0: prefix, value1: getRemaining("lastCf", 60 * 1000) });
    text += t("cmd_value0_ruleta_value1_7887802b", { value0: prefix, value1: getRemaining("lastRoulete", 60 * 1000) });
    text += t("cmd_value0_daily_value1_1be39719", { value0: prefix, value1: getRemaining("lastDaily", 24 * 60 * 60 * 1000) });
    text += t("cmd_value0_semanal_value1_66ca1aa6", { value0: prefix, value1: getRemaining("lastWeekly", 7 * 24 * 60 * 60 * 1000) });
    text += t("cmd_value0_quincenal_value1_009f3e1e", { value0: prefix, value1: getRemaining("lastFortnightly", 15 * 24 * 60 * 60 * 1000) });
    text += t("cmd_value0_mensual_value1_bdc05727", { value0: prefix, value1: getRemaining("lastMonthly", 30 * 24 * 60 * 60 * 1000) });
    text += t("cmd_value0_295f7d98", { value0: fytBold(t("cmd_banco_8777304e")) });
    text += t("cmd_protege_tus_value0_de_los_ladr_0883eb7c", { value0: currency.symbol });
    text += t("cmd_value0_dep_monto_guardar_en_ba_935da137", { value0: prefix });
    text += t("cmd_value0_with_monto_sacar_del_ba_bb4803ec", { value0: prefix });
    text += t("cmd_value0_49f08a48", { value0: fytBold(t("cmd_gestion_90fcad25")) });
    text += t("cmd_value0_bal_tu_balance_actual_4be1eeb6", { value0: prefix });
    text += t("cmd_value0_pay_monto_user_transfer_3a73a6f1", { value0: prefix });
    text += t("cmd_value0_steal_user_intentar_rob_a65d048c", { value0: prefix });
    text += t("cmd_saldo_en_cartera_value0_b828c654", { value0: formatMoney(user.bolsillo, ctx) });
    text += t("cmd_saldo_en_banco_value0_f3b1949e", { value0: formatMoney(user.banco, ctx) });
    text += t("cmd_value0_c515da8e", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
    return ctx.reply({ text });
  },
};
