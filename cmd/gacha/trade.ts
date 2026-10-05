import type { CommandContext } from "../../types/index.d.ts";
import { gacha } from "../../database/gachaDB.ts";

export default {
  name: ["trade", "intercambiar"],
  category: "gacha",
  description: "Inicia un intercambio de personajes entre usuarios.",
  async run(ctx: CommandContext) {
    const [targetText, indexText] = ctx.args;
    if (!targetText || !indexText) {
      return ctx.reply("⚠️ Usa: .trade @usuario 0");
    }

    const charIndex = Number(indexText);
    const chars = gacha.getUserHarem(ctx.sender);
    const target = chars[charIndex];
    if (!target) {
      return ctx.reply("⚠️ Ese índice no existe en tu harem.");
    }

    return ctx.reply(
      `🔄 ${target.name} está listo para intercambio con ${targetText}. Ejecuta la transferencia manualmente en la versión completa del sistema.`,
    );
  },
};
