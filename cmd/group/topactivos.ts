import { createGroupRanking } from "../../core/groupRankings.ts";
import type { CommandContext } from "../../types/commands.d.ts";

const { run, ...options } = createGroupRanking("activeMembers");

const command = {
  ...options,
  name: ["topactivos", "activos"],
  category: "group",
  run(ctx: CommandContext) {
    return run(ctx, command.name[0]);
  },
};

export default command;
