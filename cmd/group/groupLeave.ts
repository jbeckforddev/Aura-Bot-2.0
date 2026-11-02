import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["groupleave", "leavegroup", "salirgrupo"],
  category: "group",
  description: t("groupLeaveDescription"),
  groupOnly: true,
  modOnly: true,
  async run({ from, reply, sock }: CommandContext) {
    await reply(t("groupLeaveConfirm"));
    await sock.groupLeave(from);
  },
};