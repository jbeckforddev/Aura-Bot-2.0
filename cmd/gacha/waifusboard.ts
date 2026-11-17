import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["waifusboard","topwaifus","waifustop"],
  category: "gacha",
  description: "Ranking global de usuarios con más waifus.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "waifusboard");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
