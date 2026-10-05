import type { CommandContext } from "../../types/index.d.ts";
import { gacha, recordUserRoll } from "../../database/gachaDB.ts";
import { box } from "../../core/gachaUI.ts";

export default {
  name: ["dailyrw", "dailyroll", "dailygacha"],
  category: "gacha",
  description: "Reclama la tirada diaria del gacha.",
  async run(ctx: CommandContext) {
    const userId = ctx.sender;
    if (gacha.hasUsedDailyRoll(userId)) {
      return ctx.reply("⏳ Ya usaste tu tirada diaria hoy.");
    }

    const char = gacha.getRandomCharacter();
    if (!char) {
      return ctx.reply("❌ El gacha está vacío por ahora.");
    }

    try {
      gacha.giveCharacter(userId, char.id);
      gacha.setDailyRollUsed(userId);
      recordUserRoll(userId, char);

      const text = box(
        "🎉",
        "TIRADA DIARIA",
        `@${userId.split("@")[0]}`,
        [
          `✨ ${char.name}`,
          `📚 ${char.series}`,
          `💎 ${char.value} valor`,
          `${gacha.getRarityEmoji(char.rarity)} ${char.rarity.toUpperCase()}`,
        ],
        "Tu recompensa fue agregada a tu harem.",
      );

      return ctx.reply({ text, mentions: [userId] });
    } catch {
      return ctx.reply("⚠️ Hubo un error al reclamar la tirada diaria.");
    }
  },
};
