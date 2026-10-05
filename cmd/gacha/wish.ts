import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";

export default {
  name: ["wish", "wishlist", "gachawish"],
  category: "gacha",
  description: "Añade o consulta personajes deseados al wishlist.",
  async run(ctx: CommandContext) {
    if (!ctx.args.length) {
      const wishes = gacha.getWishlist(ctx.sender);
      if (!wishes.length) {
        return ctx.reply("📜 Tu wishlist está vacía.");
      }
      return ctx.reply(
        `📜 Wishlist:\n${wishes.map((item, i) => `${i + 1}. ${item.charName} · ${item.series}`).join("\n")}`,
      );
    }

    const [action, ...rest] = ctx.args;
    const query = rest.join(" ");

    if (action === "add" || action === "añadir") {
      const [charName, ...seriesParts] = rest;
      if (!charName || !seriesParts.length) {
        return ctx.reply("⚠️ Usa: .wish add Nombre Serie");
      }
      try {
        gacha.addWish(ctx.sender, charName, seriesParts.join(" "));
        return ctx.reply(`✅ ${charName} quedó agregado a tu wishlist.`);
      } catch {
        return ctx.reply("⚠️ Ese personaje ya está en tu wishlist.");
      }
    }

    if (action === "remove" || action === "rm") {
      const index = Number(query);
      const removed = gacha.removeWish(ctx.sender, Number.isFinite(index) ? index - 1 : 0);
      return ctx.reply(removed ? "✅ Se eliminó de tu wishlist." : "⚠️ Esa posición no existe.");
    }

    return ctx.reply("⚠️ Usa .wish, .wish add Nombre Serie o .wish remove 1.");
  },
};
