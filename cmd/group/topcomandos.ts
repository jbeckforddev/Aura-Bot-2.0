import { createGroupRanking } from "../../core/groupRankings.ts";
import type { CommandContext } from "../../types/commands.d.ts";

const { run, ...options } = createGroupRanking("topCmdUsers");

const command = {
  ...options,
  name: ["topcomandos", "topcmd", "rankingcomandos", "ranking"],
  category: "group",
  run(ctx: CommandContext) {
    return run(ctx, command.name[0]);
  },
};

export default command;
