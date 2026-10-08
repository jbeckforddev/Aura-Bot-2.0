import type { CommandContext } from "../../types/index.d.ts";
export default {
  name: ["self", "setself"],
  description: "Activa o desactiva el modo self del grupo.",
  category: "socket",
  groupOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.isMod && !ctx.isBotUser) {
      return ctx.reply("⛔ Solo un moderador o esta instancia del bot puede cambiar este modo.");
    }

    const value = String(ctx.args?.[0] ?? "").toLowerCase();
    if (!["on", "off", "true", "false", "1", "0"].includes(value)) {
      return ctx.reply(`⚠️ Uso: ${ctx.usedPrefix ?? "."}self on|off`);
    }

    const enabled = ["on", "true", "1"].includes(value);
    ctx.db.setGroup(ctx.from, {
      self: enabled ? 1 : 0,
      selfConfigured: true,
    });
    return ctx.reply(`✅ Modo self ${enabled ? "activado" : "desactivado"}.`);
  },
};
