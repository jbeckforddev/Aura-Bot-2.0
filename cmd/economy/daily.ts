import type { CommandContext } from "../../types/index.d.ts";
import {
  cooldownText,
  getEconomyUser,
  setEconomyUser,
  formatMoney,
} from "../../core/economyConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["daily", "diario"],
  category: "economy",
  description: t("cmd_reclama_tu_recompensa_diaria_a7b8907e"),
  async run(ctx: CommandContext) {
    const user = getEconomyUser(ctx.from, ctx.sender, {
      lastDaily: 0,
      dailyStreak: 0,
    });
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const gracePeriod = 48 * 60 * 60 * 1000;

    if (user.lastDaily && now - user.lastDaily < cooldown) {
      return ctx.reply(
        t("cmd_ya_reclamaste_tu_recompensa_di_488f828d", { value0: cooldownText(cooldown - (now - user.lastDaily)) }),
      );
    }

    user.dailyStreak =
      user.lastDaily && now - user.lastDaily > gracePeriod
        ? 1
        : (user.dailyStreak || 0) + 1;

    const baseReward = 12000;
    const streakBonus =
      user.dailyStreak > 1
        ? 12500 * Math.pow(2, Math.min(user.dailyStreak - 2, 10))
        : 0;
    const totalReward = baseReward + streakBonus;
    user.bolsillo = Number(user.bolsillo || 0) + totalReward;
    user.lastDaily = now;
    setEconomyUser(ctx.from, ctx.sender, user);

    let text = t("cmd_text_1bb88c91");
    text += t("cmd_value0_dias_58f878d6", { value0: user.dailyStreak });
    text += t("cmd_text_bdfd7fa0");
    text += t("cmd_hola_value0_a30dbb81", { value0: ctx.sender.split("@")[0] });
    text += t("cmd_base_value0_31949712", { value0: formatMoney(baseReward, ctx) });
    text += t("cmd_bono_racha_value0_452973ed", { value0: formatMoney(streakBonus, ctx) });
    text += t("cmd_total_ganado_value0_f4c8c352", { value0: formatMoney(totalReward, ctx) });
    text += t("cmd_saldo_actual_value0_ffd3e8da", { value0: formatMoney(user.bolsillo, ctx) });
    text += t("cmd_text_f1df3aed");
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
