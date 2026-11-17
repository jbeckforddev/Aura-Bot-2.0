import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["deletechar","delwaifu","delchar"],
  category: "gacha",
  description: "Elimina un personaje propio tras confirmación.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "deletechar");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
