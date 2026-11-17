import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["buyc","buycharacter","buychar"],
  category: "gacha",
  description: "Compra una waifu listada pagando monedas.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "buyc");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
