import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["tiendawaifus","wshop","haremshop"],
  category: "gacha",
  description: "Consulta las waifus a la venta en el grupo.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "wshop");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
