import { createGroupRanking } from "../../core/groupRankings.ts";
import type { CommandContext } from "../../types/commands.d.ts";

const { run, ...options } = createGroupRanking("ghosts");

const command = {
  ...options,
  name: ["topfantasmas", "fantasmas"],
  category: "group",
  run(ctx: CommandContext) {
    return run(ctx, command.name[0]);
  },
};

export default command;
