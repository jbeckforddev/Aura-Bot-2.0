import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["htop","haremtop","topharem"],
  category: "gacha",
  description: "Clasificación de coleccionistas del grupo.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "htop");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
