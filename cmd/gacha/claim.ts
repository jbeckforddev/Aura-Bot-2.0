import type { CommandContext } from "../../types/index.d.ts";
import { gacha, recordUserRoll } from "../../database/gachaDB.ts";
import { box } from "../../core/gachaUI.ts";

export default {
  name: ["claim", "claimgacha"],
  category: "gacha",
  description: "Reclama un personaje gratis si aún no lo has usado hoy.",
  async run(ctx: CommandContext) {
    const userId = ctx.sender;

    if (gacha.hasUsedDailyRoll(userId)) {
      return ctx.reply("⏳ Ya reclamaste tu tirada diaria de hoy.");
    }

    const char = gacha.getRandomCharacter();
    if (!char) {
      return ctx.reply("❌ Todavía no hay personajes disponibles.");
    }

    try {
      gacha.giveCharacter(userId, char.id);
      gacha.setDailyRollUsed(userId);
      recordUserRoll(userId, char);

      const text = box(
        "🎁",
        "CLAIM DIARIO",
        `@${userId.split("@")[0]}`,
        [
          `✨ ${char.name}`,
          `📚 ${char.series}`,
          `💎 Valor: ${char.value}`,
          `${gacha.getRarityEmoji(char.rarity)} ${char.rarity.toUpperCase()}`,
        ],
        "Tu tirada diaria ya quedó registrada.",
      );

      if (char.image_url) {
        return ctx.reply({
          image: char.image_url,
          caption: text,
          mentions: [userId],
          limitSharing: false,
        });
      }

      return ctx.reply({ text, mentions: [userId] });
    } catch {
      return ctx.reply("⚠️ No se pudo reclamar la tirada diaria.");
    }
  },
};
