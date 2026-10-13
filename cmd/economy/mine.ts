import { createEconomyActivity } from "../../core/economyActivities.ts";
import { t } from "../../src/langs/index.ts";


export default createEconomyActivity({
  names: ["mine", "minar", "chambear"],
  description: t("cmd_mina_para_conseguir_monedas_y__c588902b"),
  title: "⚒️ 𝐒𝐈𝐒𝐓𝐄𝐌𝐀 𝐃𝐄 𝐌𝐈𝐍𝐄𝐑𝐈́𝐀",
  icon: "⚒️",
  cooldown: 30 * 60 * 1000,
  reward: [5000, 10000],
  xp: [20, 50],
  success: [
    "Encontraste oro en una veta profunda y lo vendiste por",
    "Rompiste una geoda y encontraste gemas por",
    "Descubriste un cofre antiguo con",
  ],
  fail: [
    "Se rompió tu pico y tuviste que volver al campamento.",
    "Un derrumbe bloqueó la veta.",
  ],
});
