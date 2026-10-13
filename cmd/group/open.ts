import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["open", "abrir"],
  category: "group",
  description: t("cmd_abre_el_grupo_85a9ac70"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    await ctx.sock.groupSettingUpdate(ctx.from, "not_announcement");
    return ctx.reply(
      t("cmd_value0_value1_todos_pueden_men_6c019cd2", { value0: fytBold(t("cmd_admin_system_19c2cc22")), value1: fytBold(t("cmd_grupo_abierto_2e298bfd")) }),
    );
  },
};
