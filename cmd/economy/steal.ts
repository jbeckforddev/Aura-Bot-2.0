import type { CommandContext } from "../../types/index.d.ts";
import { cooldownText, formatMoney } from "../../core/economyConfig.ts";
import {
  economyTarget,
  economyUser,
  saveEconomy,
} from "../../core/economyRuntime.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["steal", "robar"],
  category: "economy",
  description: t("cmd_intenta_robarle_monedas_a_otro_d228f677"),
  groupOnly: true,
  async run(ctx: CommandContext) {
    const target = await economyTarget(ctx);
    if (target === ctx.sender)
      return ctx.reply(t("cmd_no_puedes_robarte_a_ti_mismo_9a16f0d2"));
    const thief = economyUser(ctx);
    const victim = economyUser(ctx, target);
    const now = Date.now();
    const cooldown = 60 * 60 * 1000;
    if (thief.lastSteal && now - thief.lastSteal < cooldown)
      return ctx.reply(
        t("cmd_espera_value0_para_volver_a_in_26061d24", { value0: cooldownText(cooldown - (now - thief.lastSteal)) }),
      );
    if (victim.bolsillo < 500)
      return ctx.reply(
        t("cmd_la_cartera_de_este_usuario_est_d1c728c7", { value0: formatMoney(500, ctx) }),
      );
    thief.lastSteal = now;
    const success = Math.random() <= 0.4;
    let text = t("cmd_text_32d9f2a3");
    if (success) {
      const stolen = Math.floor(victim.bolsillo * (Math.random() * 0.25 + 0.1));
      victim.bolsillo -= stolen;
      thief.bolsillo += stolen;
      text += t("cmd_asalto_exitoso_botin_conseguid_811a52ad", { value0: formatMoney(stolen, ctx) });
    } else {
      const fine = Math.floor(Math.random() * 3001) + 2000;
      thief.bolsillo = Math.max(0, thief.bolsillo - fine);
      text += t("cmd_el_plan_fallo_fianza_de_escape_aa98e7d2", { value0: formatMoney(fine, ctx) });
    }
    saveEconomy(ctx, ctx.sender, thief);
    saveEconomy(ctx, target, victim);
    text += t("cmd_tu_cartera_value0_3639e952", { value0: formatMoney(thief.bolsillo, ctx) });
    return ctx.reply({ text, mentions: [ctx.sender, target] });
  },
};
