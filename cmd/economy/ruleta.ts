import type { CommandContext } from "../../types/index.d.ts";
import {
  amountArg,
  economyUser,
  saveEconomy,
  formatMoney,
} from "../../core/economyRuntime.ts";
import { cooldownText } from "../../core/economyConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["ruleta", "roulette", "rt"],
  category: "economy",
  description: t("cmd_juega_a_la_ruleta_9b276548"),
  async run(ctx: CommandContext) {
    const user = economyUser(ctx);
    const amount = amountArg(ctx.args?.[0]);
    const color = String(ctx.args?.[1] ?? "").toLowerCase();
    if (amount <= 0 || !["red", "black", "green"].includes(color))
      return ctx.reply(t("cmd_usa_ruleta_cantidad_red_black__e4ca4c27"));
    if (user.bolsillo < amount)
      return ctx.reply(
        t("cmd_no_tienes_suficientes_monedas__2599d879", { value0: formatMoney(user.bolsillo, ctx) }),
      );
    const now = Date.now();
    const cooldown = 60 * 1000;
    if (user.lastRoulete && now - user.lastRoulete < cooldown)
      return ctx.reply(
        t("cmd_espera_value0_para_volver_a_ju_6c3501cc", { value0: cooldownText(cooldown - (now - user.lastRoulete)) }),
      );
    const roll = Math.random() * 100;
    const result = roll < 40 ? "red" : roll < 80 ? "black" : "green";
    const winnings =
      result === color ? amount * (color === "green" ? 20 : 2) : 0;
    user.lastRoulete = now;
    user.bolsillo += winnings - amount;
    saveEconomy(ctx, ctx.sender, user);
    const labels: Record<string, string> = {
      red: "🔴 RED",
      black: "⚫ BLACK",
      green: "🟢 GREEN",
    };
    let text = t("cmd_text_e236e341");
    text += t("cmd_resultado_value0_apostaste_val_7853ceac", { value0: labels[result], value1: labels[color], value2: winnings ? `✅ Ganancia: ${formatMoney(winnings, ctx)}` : `❌ Pérdida: ${formatMoney(amount, ctx)}`, value3: formatMoney(user.bolsillo, ctx) });
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
