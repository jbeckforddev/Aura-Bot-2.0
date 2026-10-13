import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";
export default {
  name: ["self", "setself"],
  description: t("socketDescriptionSelf"),
  category: "socket",
  groupOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.isMod && !ctx.isBotUser) {
      return ctx.reply(t("socketSelfPermission"));
    }

    const value = String(ctx.args?.[0] ?? "").toLowerCase();
    if (!["on", "off", "true", "false", "1", "0"].includes(value)) {
      return ctx.reply(t("socketSelfUsage", { prefix: ctx.usedPrefix ?? "." }));
    }

    const enabled = ["on", "true", "1"].includes(value);
    ctx.db.setGroup(ctx.from, {
      self: enabled ? 1 : 0,
      selfConfigured: true,
    });
    return ctx.reply(t(enabled ? "socketSelfEnabled" : "socketSelfDisabled"));
  },
};
