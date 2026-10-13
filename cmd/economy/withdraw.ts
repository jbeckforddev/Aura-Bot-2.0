import type { CommandContext } from "../../types/index.d.ts";
import {
  amountArg,
  economyUser,
  saveEconomy,
  formatMoney,
} from "../../core/economyRuntime.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["withdraw", "retirar", "with"],
  category: "economy",
  description: t("cmd_retira_monedas_de_tu_cuenta_de_75795884"),
  async run(ctx: CommandContext) {
    const user = economyUser(ctx);
    const raw = String(ctx.args?.[0] ?? "").toLowerCase();
    const amount =
      raw === "all" || raw === "todo" ? user.banco : amountArg(raw);
    if (amount <= 0)
      return ctx.reply(
        t("cmd_ingresa_una_cantidad_valida_ej_38301c25"),
      );
    if (user.banco < amount)
      return ctx.reply(
        t("cmd_no_tienes_suficientes_fondos_t_0706f4e2", { value0: formatMoney(user.banco, ctx) }),
      );
    user.banco -= amount;
    user.bolsillo += amount;
    saveEconomy(ctx, ctx.sender, user);
    let text = t("cmd_text_d4f5beda");
    text += t("cmd_retiraste_value0_cartera_value_10c5c52a", { value0: formatMoney(amount, ctx), value1: formatMoney(user.bolsillo, ctx), value2: formatMoney(user.banco, ctx) });
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
