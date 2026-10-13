import type { CommandContext } from "../../types/index.d.ts";
import {
  cooldownText,
  getEconomyUser,
  setEconomyUser,
  formatMoney,
} from "../../core/economyConfig.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["monthly", "mensual"],
  category: "economy",
  description: t("cmd_reclama_tu_recompensa_mensual__01591820"),
  async run(ctx: CommandContext) {
    const user = getEconomyUser(ctx.from, ctx.sender, {
      lastMonthly: 0,
      monthlyStreak: 0,
    });
    const now = Date.now();
    const cooldown = 30 * 24 * 60 * 60 * 1000;
    const gracePeriod = 45 * 24 * 60 * 60 * 1000;

    if (user.lastMonthly && now - user.lastMonthly < cooldown) {
      return ctx.reply(
        t("cmd_ya_reclamaste_tu_sueldo_mensua_b77c6c9a", { value0: cooldownText(cooldown - (now - user.lastMonthly)) }),
      );
    }

    user.monthlyStreak =
      user.lastMonthly && now - user.lastMonthly > gracePeriod
        ? 1
        : (user.monthlyStreak || 0) + 1;

    const baseReward = 400000;
    const streakBonus =
      user.monthlyStreak > 1
        ? 50000 * Math.pow(2, Math.min(user.monthlyStreak - 2, 10))
        : 0;
    const totalReward = baseReward + streakBonus;
    user.bolsillo = Number(user.bolsillo || 0) + totalReward;
    user.lastMonthly = now;
    setEconomyUser(ctx.from, ctx.sender, user);

    let text = t("cmd_value0_e9a09d5c", { value0: fytBold(t("cmd_sueldo_mensual_1225e257")) });
    text += t("cmd_value0_value1_meses_db30afe1", { value0: fytBold(t("cmd_racha_68fa2230")), value1: user.monthlyStreak });
    text += t("cmd_text_bdfd7fa0");
    text += t("cmd_hola_value0_a30dbb81", { value0: ctx.sender.split("@")[0] });
    text += t("cmd_base_value0_31949712", { value0: formatMoney(baseReward, ctx) });
    text += t("cmd_bono_racha_value0_452973ed", { value0: formatMoney(streakBonus, ctx) });
    text += t("cmd_total_ganado_value0_f4c8c352", { value0: formatMoney(totalReward, ctx) });
    text += t("cmd_saldo_actual_value0_ffd3e8da", { value0: formatMoney(user.bolsillo, ctx) });
    text += t("cmd_proxima_recompensa_en_30_dias_cac2681f");
    text += t("cmd_value0_92601e2c", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
