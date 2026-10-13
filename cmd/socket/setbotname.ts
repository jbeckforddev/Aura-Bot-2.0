import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";
export default {
  name: ["setbotname", "setname", "botname"],
  category: "socket",
  description: t("socketDescriptionSetBotName"),
  botUserOnly: true,
  async run(ctx: CommandContext) {
    const name = ctx.args.join(" ").trim();
    if (!name || name.length > 60) {
      return ctx.reply(
        t("socketSetBotNameUsage", { prefix: ctx.usedPrefix ?? "." }),
      );
    }

    const bot = ctx.db.getBot(ctx.botJid);
    ctx.db.setBot(ctx.botJid, {
      bot_name: name,
      data: { ...(bot.data || {}), customBotName: true },
    });
    return ctx.reply(t("socketSetBotNameUpdated", { name }));
  },
};
