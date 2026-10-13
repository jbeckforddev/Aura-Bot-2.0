import type { CommandContext } from "../../types/index.d.ts";
import {
  amountArg,
  economyUser,
  saveEconomy,
  formatMoney,
} from "../../core/economyRuntime.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["deposit", "d", "dep", "depositar"],
  category: "economy",
  description: t("cmd_deposita_monedas_en_el_banco_bad7e8ce"),
  async run(ctx: CommandContext) {
    const user = economyUser(ctx);
    const raw = String(ctx.args?.[0] ?? "").toLowerCase();
    const amount =
      raw === "all" || raw === "todo" ? user.bolsillo : amountArg(raw);
    if (amount <= 0)
      return ctx.reply(
        t("cmd_ingresa_una_cantidad_valida_ej_afffba3a"),
      );
    if (user.bolsillo < amount)
      return ctx.reply(
        t("cmd_no_tienes_suficientes_monedas__a48d7762", { value0: formatMoney(user.bolsillo, ctx) }),
      );
    user.bolsillo -= amount;
    user.banco += amount;
    saveEconomy(ctx, ctx.sender, user);
    let text = t("cmd_text_e49a35b9");
    text += t("cmd_depositaste_value0_nuevo_saldo_cf72182a", { value0: formatMoney(amount, ctx), value1: formatMoney(user.banco, ctx), value2: formatMoney(user.bolsillo, ctx) });
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
