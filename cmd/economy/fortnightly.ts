import type { CommandContext } from "../../types/index.d.ts";
import {
  cooldownText,
  getEconomyUser,
  setEconomyUser,
  formatMoney,
} from "../../core/economyConfig.ts";
import { fytBold } from "./../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["fortnightly", "quincenal", "quinsenal", "quincena"],
  category: "economy",
  description: t("cmd_reclama_tu_recompensa_quincena_eca39130"),
  async run(ctx: CommandContext) {
    const user = getEconomyUser(ctx.from, ctx.sender, {
      lastFortnightly: 0,
      fortnightlyStreak: 0,
    });
    const now = Date.now();
    const cooldown = 15 * 24 * 60 * 60 * 1000;
    const gracePeriod = 22 * 24 * 60 * 60 * 1000;

    if (user.lastFortnightly && now - user.lastFortnightly < cooldown) {
      return ctx.reply(
        t("cmd_ya_reclamaste_tu_recompensa_qu_d9fbc962", { value0: cooldownText(cooldown - (now - user.lastFortnightly)) }),
      );
    }

    user.fortnightlyStreak =
      user.lastFortnightly && now - user.lastFortnightly > gracePeriod
        ? 1
        : (user.fortnightlyStreak || 0) + 1;

    const baseReward = 200000;
    const streakBonus =
      user.fortnightlyStreak > 1
        ? 25000 * Math.pow(2, Math.min(user.fortnightlyStreak - 2, 10))
        : 0;
    const totalReward = baseReward + streakBonus;
    user.bolsillo = Number(user.bolsillo || 0) + totalReward;
    user.lastFortnightly = now;
    setEconomyUser(ctx.from, ctx.sender, user);

    let text = t("cmd_value0_e9a09d5c", { value0: fytBold(t("cmd_bono_quincenal_9b10efa5")) });
    text += t("cmd_value0_quincenas_1ba456c0", { value0: user.fortnightlyStreak });
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
