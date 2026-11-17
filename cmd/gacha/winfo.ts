import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["winfo","charinfo","cinfo"],
  category: "gacha",
  description: "Muestra ficha, rareza, valor y propiedad de una waifu.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "winfo");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
