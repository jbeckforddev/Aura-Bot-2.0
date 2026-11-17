import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["gtop","gachatop"],
  category: "gacha",
  description: "Clasificación global de coleccionistas.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "gtop");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
