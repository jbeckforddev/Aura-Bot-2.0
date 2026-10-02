import type { CommandContext } from "../../types/index.d.ts";
export default {
  name: ["setbotname", "setname", "botname"],
  category: "socket",
  description: "Cambia el nombre del bot en el menú.",
  botUserOnly: true,
  async run(ctx: CommandContext) {
    const name = ctx.args.join(" ").trim();
    if (!name || name.length > 60) {
      return ctx.reply(`⚠️ Uso: ${ctx.usedPrefix ?? "."}setbotname <nombre>`);
    }

    const bot = ctx.db.getBot(ctx.botJid);
    ctx.db.setBot(ctx.botJid, {
      bot_name: name,
      data: { ...(bot.data || {}), customBotName: true },
    });
    return ctx.reply(`✅ Nombre del bot actualizado a: ${name}`);
  },
};
