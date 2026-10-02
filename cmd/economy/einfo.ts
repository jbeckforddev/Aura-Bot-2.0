import type { CommandContext } from "../../types/index.d.ts";
import {
  cooldownText,
  formatMoney,
  getBotCurrency,
  getEconomyUser,
} from "../../core/economyConfig.ts";
import { fytBold } from "../../core/socketText.ts";
import { formatDuration } from "../../utils/formatter.ts";

export default {
  name: ["einfo", "economia"],
  category: "economy",
  description: "Muestra información sobre cómo funciona la economía del bot.",
  async run(ctx: CommandContext) {
    const user = getEconomyUser(ctx.from, ctx.sender);
    const now = Date.now();
    const getRemaining = (key: string, duration: number) => {
      const remaining = duration - (now - Number(user[key] ?? 0));
      if (remaining <= 0) return "✅ Disponible";

      const time = formatDuration(Math.max(0, Math.floor(remaining / 1000)));
      return `⏳ _${time || cooldownText(remaining)}_`;
    };
    const prefix = ctx.usedPrefix ?? ".";
    const currency = getBotCurrency(ctx);
    let text = `╭〔 ${currency.symbol} ${fytBold("SISTEMA ECONÓMICO")} 〕⬣\n`;
    text += `┃ ℹ️ ${fytBold("INFORMACIÓN")}\n`;
    text += `╰━━━━━━━━━━━━⬣\n\n`;
    text += `┃ Bienvenido al sistema de *${currency.name}* (${currency.symbol}).\n`;
    text += `┃ Gana, ahorra y gestiona tu fortuna.\n\n`;
    text += `┣━━〔 🛠️ ${fytBold("CÓMO GANAR")} 〕━━⬣\n\n`;
    text += `┃ ➪ *${prefix}work:* ${getRemaining("lastWork", 3 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}ppt:* ${getRemaining("lastPpt", 10 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}mine:* ${getRemaining("lastMine", 30 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}hunt:* ${getRemaining("lastHunt", 30 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}crime:* ${getRemaining("lastCrime", 60 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}slut:* ${getRemaining("lastSlut", 60 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}steal:* ${getRemaining("lastSteal", 60 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}adventure:* ${getRemaining("lastAdventure", 2 * 60 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}cf:* ${getRemaining("lastCf", 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}ruleta:* ${getRemaining("lastRoulete", 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}daily:* ${getRemaining("lastDaily", 24 * 60 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}semanal:* ${getRemaining("lastWeekly", 7 * 24 * 60 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}quincenal:* ${getRemaining("lastFortnightly", 15 * 24 * 60 * 60 * 1000)}\n`;
    text += `┃ ➪ *${prefix}mensual:* ${getRemaining("lastMonthly", 30 * 24 * 60 * 60 * 1000)}\n\n`;
    text += `┣━━〔 🏦 ${fytBold("BANCO")} 〕━━⬣\n\n`;
    text += `┃ Protege tus ${currency.symbol} de los ladrones.\n`;
    text += `┃ ➪ *${prefix}dep [monto]:* Guardar en banco.\n`;
    text += `┃ ➪ *${prefix}with [monto]:* Sacar del banco.\n\n`;
    text += `┣━━〔 💳 ${fytBold("GESTIÓN")} 〕━━⬣\n\n`;
    text += `┃ ➪ *${prefix}bal:* Tu balance actual.\n`;
    text += `┃ ➪ *${prefix}pay [monto] @user:* Transferir.\n`;
    text += `┃ ➪ *${prefix}steal @user:* Intentar robar.\n\n`;
    text += `┃ 💵 Saldo en cartera: ${formatMoney(user.bolsillo, ctx)}\n`;
    text += `┃ 🏦 Saldo en banco: ${formatMoney(user.banco, ctx)}\n\n`;
    text += `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`;
    return ctx.reply({ text });
  },
};
