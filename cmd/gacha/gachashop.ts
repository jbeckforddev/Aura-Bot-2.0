import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";
import { box } from "../../core/gachaUI.ts";

export default {
  name: ["gachashop", "shop"],
  category: "gacha",
  description: "Muestra el mercado de personajes del gacha.",
  async run(ctx: CommandContext) {
    const listings = gacha.getShopListings();
    if (!listings.length) {
      return ctx.reply("🛍️ El mercado del gacha está vacío por ahora.");
    }

    const lines = listings.slice(0, 10).map((listing, index) => {
      const char = listing.char;
      if (!char) return `${index + 1}. [sin dato]`;
      return `${index + 1}. ${char.name} · ${listing.price} coins · ${listing.seller.split("@")[0]}`;
    });

    const text = box(
      "🛍️",
      "GACHA SHOP",
      "Marketplace",
      lines,
      "Usa .buy o el índice para comprar.",
    );

    return ctx.reply(text);
  },
};
