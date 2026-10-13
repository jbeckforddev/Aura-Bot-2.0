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
  name: ["weekly", "semanal", "memanal"],
  category: "economy",
  description: t("cmd_reclama_tu_recompensa_semanal__d04cea35"),
  async run(ctx: CommandContext) {
    const user = getEconomyUser(ctx.from, ctx.sender, {
      lastWeekly: 0,
      weeklyStreak: 0,
    });
    const now = Date.now();
    const cooldown = 7 * 24 * 60 * 60 * 1000;
    const gracePeriod = 11 * 24 * 60 * 60 * 1000;

    if (user.lastWeekly && now - user.lastWeekly < cooldown) {
      return ctx.reply(
        t("cmd_ya_reclamaste_tu_recompensa_se_20e638b7", { value0: cooldownText(cooldown - (now - user.lastWeekly)) }),
      );
    }

    user.weeklyStreak =
      user.lastWeekly && now - user.lastWeekly > gracePeriod
        ? 1
        : (user.weeklyStreak || 0) + 1;

    const baseReward = 100000;
    const streakBonus =
      user.weeklyStreak > 1
        ? 12500 * Math.pow(2, Math.min(user.weeklyStreak - 2, 10))
        : 0;
    const totalReward = baseReward + streakBonus;
    user.bolsillo = Number(user.bolsillo || 0) + totalReward;
    user.lastWeekly = now;
    setEconomyUser(ctx.from, ctx.sender, user);

    let text = t("cmd_value0_e9a09d5c", { value0: fytBold(t("cmd_bono_semanal_e2ab3cbb")) });
    text += t("cmd_value0_value1_semanas_509eca98", { value0: fytBold(t("cmd_racha_68fa2230")), value1: user.weeklyStreak });
    text += t("cmd_text_bdfd7fa0");
    text += t("cmd_hola_value0_a30dbb81", { value0: ctx.sender.split("@")[0] });
    text += t("cmd_base_value0_31949712", { value0: formatMoney(baseReward, ctx) });
    text += t("cmd_bono_racha_value0_452973ed", { value0: formatMoney(streakBonus, ctx) });
    text += t("cmd_total_ganado_value0_f4c8c352", { value0: formatMoney(totalReward, ctx) });
    text += t("cmd_saldo_actual_value0_ffd3e8da", { value0: formatMoney(user.bolsillo, ctx) });
    text += t("cmd_proxima_recompensa_en_7_dias_4f013fa3");
    text += t("cmd_value0_92601e2c", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
