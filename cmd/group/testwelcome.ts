import type { CommandContext } from "../../types/index.d.ts";
import { buildGroupWelcome } from "../../core/groupWelcome.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["testwelcome", "testbienvenida"],
  category: "group",
  description: t("groupWelcomePreviewDescription"),
  groupOnly: true,
  adminOnly: false,

  async run(ctx: CommandContext) {
    try {
      // La base se consulta mediante RPC usando el mismo ctx.db del socket.
      const group = await ctx.db.getGroup(ctx.from);
      const raw = group as unknown as Record<string, unknown>;
      const nested = raw?.data && typeof raw.data === "object"
        ? raw.data as Record<string, unknown>
        : {};

      const custom = typeof raw?.welcomeMessage === "string" && raw.welcomeMessage.trim()
        ? raw.welcomeMessage
        : typeof nested.welcomeMessage === "string" && nested.welcomeMessage.trim()
          ? nested.welcomeMessage
          : null;

      const participant = ctx.sender || ctx.msg?.key?.participant;
      if (!participant) {
        return ctx.reply(t("groupWelcomeNoParticipant"));
      }

      const result = buildGroupWelcome({
        action: "add",
        group: { ...group, welcomeMessage: custom },
        metadata: ctx.groupMeta || { subject: ctx.groupName },
        participants: [participant],
      });
      if (!result) return ctx.reply(t("groupWelcomePreviewError"));

      if (ctx.args?.includes("diag")) {
        return ctx.reply({
          text: "🔎 Diagnóstico de bienvenida\n" +
            "Grupo: " + ctx.from + "\n" +
            "Personalizada: " + (custom ? "sí" : "no") + "\n" +
            "Automática: " + (raw.welcome ? "activada" : "desactivada") + "\n\n" +
            result.text,
          mentions: result.mentions,
        });
      }

      return ctx.reply({
        text: result.text,
        mentions: result.mentions,
      });
    } catch (error) {
      return ctx.reply(t("groupWelcomeRenderError", {
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  },
};
