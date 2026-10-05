import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";

export default {
  name: ["sell", "vender"],
  category: "gacha",
  description: "Vende un personaje de tu harem por valor.",
  async run(ctx: CommandContext) {
    const chars = gacha.getUserHarem(ctx.sender);
    if (!chars.length) {
      return ctx.reply("📭 No tienes personajes para vender.");
    }

    const index = Number(ctx.args[0]);
    const target = Number.isFinite(index) ? chars[index] : undefined;
    if (!target) {
      return ctx.reply("⚠️ Usa el número del personaje que quieres vender.");
    }

    try {
      const price = gacha.sellCharacter(ctx.sender, target.id);
      return ctx.reply(`💰 Vendiste ${target.name} por ${price} monedas.`);
    } catch {
      return ctx.reply("⚠️ No pude vender ese personaje.");
    }
  },
};
