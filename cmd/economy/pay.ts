import type { CommandContext } from "../../types/index.d.ts";
import {
  amountArg,
  economyTarget,
  economyUser,
  saveEconomy,
  formatMoney,
} from "../../core/economyRuntime.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["transfer", "pagar", "pay"],
  category: "economy",
  description: t("cmd_transfiere_monedas_a_otro_usua_ba5e570f"),
  groupOnly: true,
  async run(ctx: CommandContext) {
    const target = await economyTarget(ctx);
    const amount = amountArg(ctx.args?.[0]);
    const sender = economyUser(ctx);
    if (target === ctx.sender)
      return ctx.reply(t("cmd_no_puedes_transferirte_dinero__2b1e4eac"));
    if (amount <= 0)
      return ctx.reply(t("cmd_cantidad_invalida_ejemplo_pay__81b49938"));
    if (sender.bolsillo < amount)
      return ctx.reply(
        t("cmd_no_tienes_suficientes_monedas__2599d879", { value0: formatMoney(sender.bolsillo, ctx) }),
      );
    const receiver = economyUser(ctx, target);
    sender.bolsillo -= amount;
    receiver.bolsillo += amount;
    saveEconomy(ctx, ctx.sender, sender);
    saveEconomy(ctx, target, receiver);
    let text = t("cmd_text_dcc110c0");
    text += t("cmd_de_value0_para_value1_monto_va_a112e22e", { value0: ctx.sender.split("@")[0], value1: target.split("@")[0], value2: formatMoney(amount, ctx) });
    return ctx.reply({ text, mentions: [ctx.sender, target] });
  },
};
