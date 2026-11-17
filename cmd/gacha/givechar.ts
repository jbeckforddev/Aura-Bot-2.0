import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["givechar","regalar","givewaifu"],
  category: "gacha",
  description: "Regala un personaje concreto a otro usuario del grupo.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "givechar");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
