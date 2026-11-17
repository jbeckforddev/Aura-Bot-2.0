import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["sell","vender"],
  category: "gacha",
  description: "Publica una waifu propia a la venta por monedas.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "sell");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
