import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";

export default {
  name: ["dump", "gachadump"],
  category: "gacha",
  description: "Muestra el estado del almacenamiento del gacha.",
  async run(ctx: CommandContext) {
    const total = gacha.getCharacterCount();
    const rows = gacha.getAllHaremData();
    const stats = rows.slice(0, 5).map((r, i) => `${i + 1}. ${r.userId} · ${r.count} chars`).join("\n");

    return ctx.reply(
      `🧾 Gacha dump\nPersonajes registrados: ${total}\n\n${stats || "Sin datos todavía."}`,
    );
  },
};
