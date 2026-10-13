import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["banchat", "banearchat", "mutechat"],
  category: "group",
  description: t("cmd_desactiva_las_funciones_del_bo_547e36ed"),
  groupOnly: true,
  async run(ctx: CommandContext) {
    ctx.db.setGroup(ctx.from, { chatBanned: 1 });
    return ctx.reply({
      text: t("cmd_value0_value1_el_bot_ha_sido_d_8cc25e7a", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_chat_baneado_0c18148c")), value2: ctx.usedPrefix || ".", value3: fytBold(t("cmd_system_29d43743")) }),
    });
  },
};
