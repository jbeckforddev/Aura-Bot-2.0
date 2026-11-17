import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["removerventa","removesale"],
  category: "gacha",
  description: "Cancela una venta publicada por el propietario.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "removerventa");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
