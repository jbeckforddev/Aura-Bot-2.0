import type { CommandContext } from "../../types/index.d.ts";
export default {
  name: ["modprefix", "setmodprefix", "delmodprefix", "deletemodprefix"],
  description: "Cambia el prefijo reservado para moderadores.",
  category: "system",
  modOnly: true,
  async run(ctx: CommandContext) {
    if (["delmodprefix", "deletemodprefix"].includes(ctx.cmdName)) {
      ctx.db.setBot(ctx.botJid, { modPrefix: null });
      return ctx.reply(
        "✅ Prefijo de moderación eliminado. Se usarán los prefijos globales.",
      );
    }

    const value = String(ctx.args?.[0] ?? "").trim();
    if (value && (value.length > 3 || /\s/.test(value))) {
      return ctx.reply(
        "❌ El prefijo debe tener entre 1 y 3 caracteres y no puede contener espacios.",
      );
    }

    ctx.db.setBot(ctx.botJid, { modPrefix: value || null });
    return ctx.reply(
      value
        ? `✅ Prefijo de moderación actualizado a: ${value}`
        : "✅ El bot volverá a usar el prefijo global para moderación.",
    );
  },
};
