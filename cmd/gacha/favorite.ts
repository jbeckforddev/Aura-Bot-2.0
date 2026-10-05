import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";

export default {
  name: ["favorite", "favorito", "fav"],
  category: "gacha",
  description: "Establece un personaje favorito de tu colección.",
  async run(ctx: CommandContext) {
    const args = ctx.args.join(" ").trim();
    const chars = gacha.getUserHarem(ctx.sender);
    if (!chars.length) {
      return ctx.reply("📭 No tienes personajes para marcar como favorito.");
    }

    const index = Number(args);
    const target = Number.isFinite(index) ? chars[index] : chars.find((ch) => ch.name.toLowerCase() === args.toLowerCase());

    if (!target) {
      return ctx.reply("⚠️ Indica el número o nombre del personaje favorito.");
    }

    try {
      gacha.setFavorite(ctx.sender, target.id);
      return ctx.reply(`⭐ ${target.name} quedó marcado como tu favorito.`);
    } catch {
      return ctx.reply("⚠️ Ese personaje no está disponible en tu colección.");
    }
  },
};
