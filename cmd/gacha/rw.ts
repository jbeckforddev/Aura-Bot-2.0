import type { CommandContext } from "../../types/index.d.ts";
import { gacha, recordUserRoll } from "../../database/gachaDB.ts";
import { box } from "../../core/gachaUI.ts";

export default {
  name: ["rw", "roll", "gacha"],
  category: "gacha",
  description: "Rueda un personaje del gacha y lo añade a tu colección.",
  async run(ctx: CommandContext) {
    const char = gacha.getRandomCharacter();
    if (!char) {
      return ctx.reply("❌ No hay personajes cargados todavía.");
    }

    try {
      gacha.giveCharacter(ctx.sender, char.id);
      recordUserRoll(ctx.sender, char);

      const text = box(
        "🎲",
        "¡PERSONAJE OBTENIDO!",
        `@${ctx.sender.split("@")[0]}`,
        [
          `✨ ${char.name}`,
          `📚 ${char.series}`,
          `⚧ ${char.gender}`,
          `💎 Valor: ${char.value}`,
          `${gacha.getRarityEmoji(char.rarity)} Rango: ${char.rarity.toUpperCase()}`,
        ],
        "Usa .harem para ver tu colección.",
      );

      return ctx.reply({ text, mentions: [ctx.sender] });
    } catch {
      return ctx.reply("⚠️ Ya tienes ese personaje en tu colección.");
    }
  },
};
