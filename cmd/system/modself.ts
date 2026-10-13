import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["modself", "setmodself"],
  description: t("cmd_activa_o_desactiva_el_modo_sel_438cc9d0"),
  category: "system",
  async run(ctx: CommandContext) {
    if (!ctx.isMod && !ctx.isBotUser) {
      return ctx.reply(t("cmd_solo_un_moderador_o_esta_insta_c771bd22"));
    }

    const value = String(ctx.args?.[0] ?? "").toLowerCase();
    if (!["on", "off", "true", "false", "1", "0"].includes(value)) {
      return ctx.reply(t("cmd_uso_value0_modself_on_off_ce6a6cf7", { value0: ctx.usedPrefix ?? "." }));
    }

    const enabled = ["on", "true", "1"].includes(value);
    ctx.db.setBot(ctx.botJid, { modSelf: enabled ? 1 : 0 });
    return ctx.reply(
      t("cmd_modo_self_de_moderacion_value0_32430407", { value0: enabled ? "activado" : "desactivado" }),
    );
  },
};
