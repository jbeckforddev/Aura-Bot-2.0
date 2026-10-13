import type { CommandContext } from "../../types/index.d.ts";
import {
  economyTarget,
  economyUser,
  formatMoney,
} from "../../core/economyRuntime.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["bank", "bal", "balance", "coins"],
  category: "economy",
  description: t("cmd_muestra_tu_saldo_actual_o_el_d_4404e4c7"),
  async run(ctx: CommandContext) {
    const target = await economyTarget(ctx);
    const user = economyUser(ctx, target);
    const total = Number(user.bolsillo) + Number(user.banco);
    let text = t("cmd_text_23195b0f");
    text += t("cmd_text_bf054867");
    text += t("cmd_text_bdfd7fa0");
    text += t("cmd_value0_a62a528f", { value0: target.split("@")[0] });
    text += t("cmd_value0_2dc0be30", { value0: formatMoney(user.bolsillo, ctx) });
    text += t("cmd_value0_5d21e4e5", { value0: formatMoney(user.banco, ctx) });
    text += t("cmd_value0_abe3057f", { value0: formatMoney(total, ctx) });
    text += t("cmd_text_f1df3aed");
    return ctx.reply({ text, mentions: [target] });
  },
};
