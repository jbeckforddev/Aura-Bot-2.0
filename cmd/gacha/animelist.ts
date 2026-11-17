import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["animelist","slist","serielist"],
  category: "gacha",
  description: "Lista las series disponibles en el catálogo Gacha.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "animelist");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
