import type { CommandContext } from "../../types/index.d.ts";
import {
  cooldownText,
} from "../../core/economyConfig.ts";
import {
  economyUser,
  saveEconomy,
  formatMoney,
} from "../../core/economyRuntime.ts";
import { t } from "../../src/langs/index.ts";


const options = ["piedra", "papel", "tijera"];
const emojis: Record<string, string> = {
  piedra: "🪨",
  papel: "📄",
  tijera: "✂️",
};

export default {
  name: ["ppt", "juego", "rps", "desafio", "retar"],
  category: "economy",
  description: t("cmd_juega_piedra_papel_o_tijera_co_7b5cfc1c"),
  async run(ctx: CommandContext) {
    const user = economyUser(ctx, ctx.sender);
    const choice = String(ctx.args?.[0] ?? "").toLowerCase();
    const now = Date.now();
    const cooldown = 10 * 60 * 1000;
    if (user.lastPpt && now - user.lastPpt < cooldown)
      return ctx.reply(
        t("cmd_espera_value0_para_jugar_de_nu_82ca334f", { value0: cooldownText(cooldown - (now - user.lastPpt)) }),
      );
    if (!options.includes(choice))
      return ctx.reply(
        t("cmd_usa_value0_ppt_piedra_papel_ti_2ae6868a", { value0: ctx.usedPrefix ?? "." }),
      );
    const bot = options[Math.floor(Math.random() * options.length)];
    const won =
      (choice === "piedra" && bot === "tijera") ||
      (choice === "papel" && bot === "piedra") ||
      (choice === "tijera" && bot === "papel");
    const reward = won ? Math.floor(Math.random() * 1401) + 100 : 0;
    user.lastPpt = now;
    user.bolsillo += reward;
    saveEconomy(ctx, ctx.sender, user);
    const result =
      choice === bot
        ? "🤝 ¡Empate!"
        : won
          ? `🎉 ¡Ganaste! +${formatMoney(reward, ctx)}`
          : "❌ ¡Perdiste!";
    let text = t("cmd_text_31eb83c2");
    text += t("cmd_tu_eleccion_value0_value1_aura_cdf7b24c", { value0: emojis[choice], value1: choice.toUpperCase(), value2: emojis[bot], value3: bot.toUpperCase(), value4: result, value5: formatMoney(user.bolsillo, ctx) });
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
