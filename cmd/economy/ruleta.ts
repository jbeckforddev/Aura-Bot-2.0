import type { CommandContext } from "../../types/index.d.ts";
import {
  amountArg,
  economyUser,
  saveEconomy,
  formatMoney,
} from "../../core/economyRuntime.ts";
import { cooldownText } from "../../core/economyConfig.ts";

export default {
  name: ["ruleta", "roulette", "rt"],
  category: "economy",
  description: "Juega a la ruleta.",
  async run(ctx: CommandContext) {
    const user = economyUser(ctx);
    const amount = amountArg(ctx.args?.[0]);
    const color = String(ctx.args?.[1] ?? "").toLowerCase();
    if (amount <= 0 || !["red", "black", "green"].includes(color))
      return ctx.reply("⚠️ Usa: *.ruleta [cantidad] [red|black|green]*");
    if (user.bolsillo < amount)
      return ctx.reply(
        `❌ No tienes suficientes monedas. Tienes *${formatMoney(user.bolsillo, ctx)}*.`,
      );
    const now = Date.now();
    const cooldown = 60 * 1000;
    if (user.lastRoulete && now - user.lastRoulete < cooldown)
      return ctx.reply(
        `⏳ Espera *${cooldownText(cooldown - (now - user.lastRoulete))}* para volver a jugar.`,
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
    let text = `╭〔 🎡 𝐑𝐔𝐋𝐄𝐓𝐀 〕⬣\n┃ 🎰 𝐑𝐄𝐒𝐔𝐋𝐓𝐀𝐃𝐎\n╰━━━━━━━━━━━━⬣\n\n`;
    text += `┃ 🎡 Resultado: ${labels[result]}\n┃ 🎯 Apostaste: ${labels[color]}\n┃ ${winnings ? `✅ Ganancia: ${formatMoney(winnings, ctx)}` : `❌ Pérdida: ${formatMoney(amount, ctx)}`}\n┃ 💵 Cartera: ${formatMoney(user.bolsillo, ctx)}\n\n╰〔 ⚡ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕⬣`;
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
