import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["setfav","wfav","delfav"],
  category: "gacha",
  description: "Marca, consulta o elimina tu personaje favorito.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "setfav");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
