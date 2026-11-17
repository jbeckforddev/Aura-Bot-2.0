import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["trade","cambiar"],
  category: "gacha",
  description: "Propone un intercambio entre dos propietarios.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "trade");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
