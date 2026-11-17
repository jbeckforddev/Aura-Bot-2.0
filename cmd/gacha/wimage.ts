import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["wimage","charimage","cimage"],
  category: "gacha",
  description: "Muestra la imagen de un personaje o variante.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "wimage");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
