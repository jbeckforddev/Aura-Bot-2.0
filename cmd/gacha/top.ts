import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";
import { box } from "../../core/gachaUI.ts";

export default {
  name: ["gachatop", "topgacha"],
  category: "gacha",
  description: "Muestra el ranking de usuarios con más personajes.",
  async run(ctx: CommandContext) {
    const rows = gacha.getAllHaremData()
      .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
      .slice(0, 10);

    if (!rows.length) {
      return ctx.reply("📭 Todavía no hay usuarios con personajes en el gacha.");
    }

    const fields = rows.map((row, index) => {
      return `${index + 1}. @${row.userId.split("@")[0]} · ${row.count} chars · ${row.totalValue} valor`;
    });

    const text = box(
      "🏆",
      "TOP GACHA",
      "Ranking global",
      fields,
      "¡Sigue tirando para subir de posición!",
    );

    return ctx.reply({ text, mentions: rows.map((row) => row.userId) });
  },
};
