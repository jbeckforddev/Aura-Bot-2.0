import type { GroupParticipant } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["topactivos", "activos"],
  category: "group",
  description: t("cmd_muestra_los_usuarios_mas_activ_5869777f"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    const activity = ctx.db.getGroup(ctx.from).activity || {};
    const participants = ctx.groupMeta?.participants || [];
    const users = participants
      .map((participant: GroupParticipant) => ({
        id: participant.id,
        count: Number(activity[participant.id] || 0),
      }))
      .sort(
        (a: { id: string; count: number }, b: { id: string; count: number }) =>
          b.count - a.count,
      )
      .slice(0, 10);
    return ctx.reply({
      text: t("cmd_usuarios_activos_value0_3bcacf1c", { value0: users.map((user: { id: string; count: number }, index: number) => `${index + 1}. @${user.id.split("@")[0]} › ${user.count}`).join("\n") }),
      mentions: users.map((user: { id: string; count: number }) => user.id),
    });
  },
};
