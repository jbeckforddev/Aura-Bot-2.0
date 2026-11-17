import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["giveallharem"],
  category: "gacha",
  description: "Regala toda tu colección del grupo a otro usuario.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "giveallharem");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
