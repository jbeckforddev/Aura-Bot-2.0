import type { CommandContext } from "../../types/index.d.ts";
import {
  amountArg,
  economyUser,
  saveEconomy,
  formatMoney,
} from "../../core/economyRuntime.ts";

export default {
  name: ["deposit", "d", "dep", "depositar"],
  category: "economy",
  description: "Deposita monedas en el banco.",
  async run(ctx: CommandContext) {
    const user = economyUser(ctx);
    const raw = String(ctx.args?.[0] ?? "").toLowerCase();
    const amount =
      raw === "all" || raw === "todo" ? user.bolsillo : amountArg(raw);
    if (amount <= 0)
      return ctx.reply(
        "⚠️ Ingresa una cantidad válida. Ejemplo: *.dep 100* o *.dep all*",
      );
    if (user.bolsillo < amount)
      return ctx.reply(
        `❌ No tienes suficientes monedas. Tu saldo es de *${formatMoney(user.bolsillo, ctx)}*.`,
      );
    user.bolsillo -= amount;
    user.banco += amount;
    saveEconomy(ctx, ctx.sender, user);
    let text = `╭〔 🏦 𝐁𝐀𝐍𝐂𝐎 〕⬣\n┃ 📥 𝐃𝐄𝐏𝐎́𝐒𝐈𝐓𝐎 𝐄𝐗𝐈𝐓𝐎𝐒𝐎\n╰━━━━━━━━━━━━⬣\n\n`;
    text += `┃ 📥 Depositaste: ${formatMoney(amount, ctx)}\n┃ 🏦 Nuevo saldo banco: ${formatMoney(user.banco, ctx)}\n┃ 💵 Monedas restantes: ${formatMoney(user.bolsillo, ctx)}\n\n╰〔 ⚡ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕⬣`;
    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
