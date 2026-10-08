import type { CommandContext } from "../../types/index.d.ts";
export default {
  name: ["modself", "setmodself"],
  description: "Activa o desactiva el modo self de moderación.",
  category: "system",
  async run(ctx: CommandContext) {
    if (!ctx.isMod && !ctx.isBotUser) {
      return ctx.reply("⛔ Solo un moderador o esta instancia del bot puede cambiar este modo.");
    }

    const value = String(ctx.args?.[0] ?? "").toLowerCase();
    if (!["on", "off", "true", "false", "1", "0"].includes(value)) {
      return ctx.reply(`⚠️ Uso: ${ctx.usedPrefix ?? "."}modself on|off`);
    }

    const enabled = ["on", "true", "1"].includes(value);
    ctx.db.setBot(ctx.botJid, { modSelf: enabled ? 1 : 0 });
    return ctx.reply(
      `✅ Modo self de moderación ${enabled ? "activado" : "desactivado"}.`,
    );
  },
};
