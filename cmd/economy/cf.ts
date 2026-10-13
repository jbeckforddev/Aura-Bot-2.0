import type { CommandContext } from "../../types/index.d.ts";
import {
  cooldownText,
  getEconomyUser,
  setEconomyUser,
  formatMoney,
} from "../../core/economyConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["cf", "caraocruz", "coinflip"],
  category: "economy",
  description: t("cmd_apuesta_monedas_a_cara_o_cruz_c2663392"),
  async run(ctx: CommandContext) {
    const user = getEconomyUser(ctx.from, ctx.sender, { lastCf: 0 });
    const amount = Number.parseInt(ctx.args?.[0] ?? "", 10);
    const choice = String(ctx.args?.[1] ?? "").toLowerCase();
    const now = Date.now();
    const cooldown = 60 * 1000;

    if (
      !Number.isInteger(amount) ||
      amount <= 0 ||
      !["cara", "cruz"].includes(choice)
    ) {
      return ctx.reply(
        t("cmd_usa_value0_cf_cantidad_cara_cr_a4e4e4d6", { value0: ctx.usedPrefix ?? "." }),
      );
    }
    if (user.bolsillo < amount)
      return ctx.reply(
        t("cmd_no_tienes_suficientes_monedas__2599d879", { value0: formatMoney(user.bolsillo, ctx) }),
      );
    if (user.lastCf && now - user.lastCf < cooldown) {
      return ctx.reply(
        t("cmd_espera_value0_para_volver_a_ju_6c3501cc", { value0: cooldownText(cooldown - (now - user.lastCf)) }),
      );
    }

    user.lastCf = now;
    const result = Math.random() < 0.5 ? "cara" : "cruz";
    user.bolsillo -= amount;
    const won = result === choice;
    if (won) user.bolsillo += amount * 2;
    setEconomyUser(ctx.from, ctx.sender, user);

    let text = t("cmd_text_1dca84b5");
    text += t("cmd_resultado_value0_a11c536c", { value0: result.toUpperCase() });
    text += t("cmd_elegiste_value0_db5461b6", { value0: choice.toUpperCase() });
    text += t("cmd_value0_17cf0eab", { value0: won ? `✅ Ganaste ${formatMoney(amount, ctx)}` : `❌ Perdiste ${formatMoney(amount, ctx)}` });
    text += t("cmd_cartera_value0_5aafe461", { value0: formatMoney(user.bolsillo, ctx) });
    text += t("cmd_text_f1df3aed");
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
