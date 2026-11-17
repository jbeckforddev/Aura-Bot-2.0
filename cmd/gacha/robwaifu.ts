import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["robwaifu","robarwaifu"],
  category: "gacha",
  description: "Intento aleatorio de robo con enfriamiento.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "robwaifu");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
