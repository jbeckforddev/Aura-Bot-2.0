import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["animeinfo","ainfo","serieinfo"],
  category: "gacha",
  description: "Muestra información y personajes de una serie del catálogo.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "animeinfo");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
