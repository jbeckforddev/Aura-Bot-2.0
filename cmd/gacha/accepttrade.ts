import type { CommandContext } from "../../types/index.d.ts";
import { runGachaAction } from "../../core/gachaActions.ts";

export default {
  name: ["accepttrade","aceptarintercambio"],
  category: "gacha",
  description: "Acepta una solicitud de intercambio vigente.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    return runGachaAction(ctx, "accepttrade");
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
