
import type { CommandContext } from "../../types/index.d.ts";
import { buildGroupWelcome } from "../../core/groupWelcome.ts";

export default {
  name: ["testwelcome", "testbienvenida"],
  category: "group",
  description: "Muestra una vista previa de la bienvenida configurada.",
  groupOnly: true,
  adminOnly: false,

  async run(ctx: CommandContext) {
    try {
      const group = await ctx.db.getGroup(ctx.from);

      const metadata =
        ctx.groupMeta ||
        await ctx.sock.groupMetadata(ctx.from);

      const participant =
        ctx.sender ||
        ctx.msg?.key?.participant ||
        ctx.msg?.key?.participantAlt;

      if (!participant) {
        return ctx.reply(
          "✖ No se pudo identificar al participante para generar la vista previa.",
        );
      }

      const result = buildGroupWelcome({
        action: "add",
        group: group || {},
        metadata,
        participants: [participant],
      });

      if (!result) {
        return ctx.reply("✖ No se pudo generar la bienvenida.");
      }

      return ctx.reply({
        text: result.text,
        mentions: result.mentions,
      });
    } catch (error) {
      return ctx.reply(
        `✖ Error al generar la bienvenida: ${String(error)}`,
      );
    }
  },
};
