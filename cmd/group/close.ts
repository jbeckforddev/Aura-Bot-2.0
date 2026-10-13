import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["close", "cerrar"],
  category: "group",
  description: t("cmd_cierra_el_grupo_71ec55fa"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    await ctx.sock.groupSettingUpdate(ctx.from, "announcement");
    return ctx.reply(
      t("cmd_value0_value1_solo_administrad_7fca7b9a", { value0: fytBold(t("cmd_admin_system_19c2cc22")), value1: fytBold(t("cmd_grupo_cerrado_f684e504")) }),
    );
  },
};
