import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";
import { box } from "../../core/gachaUI.ts";

export default {
  name: ["gachainfo", "infogacha"],
  category: "gacha",
  description: "Muestra estadísticas del sistema del gacha.",
  async run(ctx: CommandContext) {
    const totalCharacters = gacha.getCharacterCount();
    const userHarem = gacha.getUserHarem(ctx.sender);
    const favorite = gacha.getFavorite(ctx.sender);

    const text = box(
      "ℹ️",
      "INFO GACHA",
      `@${ctx.sender.split("@")[0]}`,
      [
        `👥 Personajes totales: ${totalCharacters}`,
        `🧺 Tu harem: ${userHarem.length}`,
        `⭐ Favorito: ${favorite ? favorite.name : "Ninguno"}`,
      ],
      "Este sistema está migrado y listo para usarse.",
    );

    return ctx.reply({ text, mentions: [ctx.sender] });
  },
};
