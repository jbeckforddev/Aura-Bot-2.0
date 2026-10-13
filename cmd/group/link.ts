import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["link", "linkgroup", "grupo"],
  category: "group",
  description: t("cmd_obtiene_el_enlace_del_grupo_4a9193cf"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    try {
      const code = await ctx.sock.groupInviteCode(ctx.from);
      return ctx.reply({
        text: t("cmd_value0_grupo_value1_enlace_htt_af76f18d", { value0: fytBold(t("cmd_link_del_grupo_29e4247a")), value1: ctx.groupName || "Grupo", value2: code, value3: fytBold(t("cmd_aura_reed_95dcfb15")) }),
      });
    } catch {
      return ctx.reply({
        text: t("cmd_value0_value1_no_pude_obtener__d74f4779", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_error_de_link_4cefc117")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    }
  },
};
