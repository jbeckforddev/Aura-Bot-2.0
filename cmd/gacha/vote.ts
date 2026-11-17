import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["vote","votar"],
  category: "gacha",
  description: "Vota por un personaje e incrementa su valoración.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "vote");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
