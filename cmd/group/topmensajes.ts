import { createGroupRanking } from "../../core/groupRankings.ts";
import type { CommandContext } from "../../types/commands.d.ts";

const { run, ...options } = createGroupRanking("topMsgUsers");

const command = {
  ...options,
  name: ["topmensajes", "topmsg", "mensajes"],
  category: "group",
  run(ctx: CommandContext) {
    return run(ctx, command.name[0]);
  },
};

export default command;
