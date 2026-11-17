import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["setclaim","setclaimmsg","delclaimmsg"],
  category: "gacha",
  description: "Personaliza o restablece el mensaje al reclamar.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "setclaim");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
