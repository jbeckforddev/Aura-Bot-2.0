import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";
import { box } from "../../core/gachaUI.ts";

export default {
  name: ["fuse", "fusion", "fusionar"],
  category: "gacha",
  description: "Fusiona dos personajes de tu colección en uno nuevo.",
  async run(ctx: CommandContext) {
    const chars = gacha.getUserHarem(ctx.sender);
    if (chars.length < 2) {
      return ctx.reply("❌ Necesitas al menos dos personajes para fusionar.");
    }

    const a = Number(ctx.args[0]);
    const b = Number(ctx.args[1]);
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      return ctx.reply("⚠️ Usa dos índices válidos: .fuse 0 1");
    }

    const first = chars[a];
    const second = chars[b];
    if (!first || !second) {
      return ctx.reply("⚠️ Uno de los índices no existe en tu harem.");
    }

    const result = gacha.fusionCharacters(ctx.sender, first.id, second.id);
    if (!result) {
      return ctx.reply("⚠️ La fusión falló.");
    }

    const text = box(
      "🧬",
      "FUSIÓN COMPLETADA",
      `@${ctx.sender.split("@")[0]}`,
      [
        `✅ ${result.name}`,
        `📚 ${result.series}`,
        `${gacha.getRarityEmoji(result.rarity)} ${result.rarity.toUpperCase()}`,
      ],
      "Tu nuevo personaje quedó agregado a tu colección.",
    );

    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
