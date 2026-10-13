import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["unbanchat", "desbanearchat", "unmutechat"],
  category: "group",
  description: t("cmd_reactiva_las_funciones_del_bot_e6ee7940"),
  groupOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.isAdmin && !ctx.isMod && !ctx.isOwner)
      return ctx.reply({
        text: t("cmd_value0_value1_solo_los_adminis_ec4d33e6", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_permiso_denegado_a479cad0")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    ctx.db.setGroup(ctx.from, { chatBanned: 0 });
    return ctx.reply({
      text: t("cmd_value0_value1_el_bot_ha_sido_r_0ead4daa", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_chat_desbaneado_abdc20bd")), value2: fytBold(t("cmd_system_29d43743")) }),
    });
  },
};
