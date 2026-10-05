import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";
import { box } from "../../core/gachaUI.ts";

export default {
  name: ["harem", "coleccion", "miharem"],
  category: "gacha",
  description: "Muestra tu colección actual de personajes.",
  async run(ctx: CommandContext) {
    const chars = gacha.getUserHarem(ctx.sender);
    if (!chars.length) {
      return ctx.reply("📭 Aún no tienes personajes en tu harem.");
    }

    const fields = chars.slice(0, 10).map((char, index) => {
      const rarity = gacha.getRarityEmoji(char.rarity);
      return `${index + 1}. ${rarity} ${char.name} · ${char.series}`;
    });

    const text = box(
      "🧺",
      "HAREM",
      `@${ctx.sender.split("@")[0]}`,
      fields,
      `Total: ${chars.length} personajes`,
    );

    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
