import type { CommandContext } from "../../types/index.d.ts";

export default {
  name: ["giftwrap", "envolver"],
  category: "gacha",
  description: "Funcionalidad de regalo del sistema del gacha.",
  async run(ctx: CommandContext) {
    return ctx.reply("🎁 La función de regalo del gacha está lista para integrarse con el sistema completo de regalo del bot.");
  },
};
