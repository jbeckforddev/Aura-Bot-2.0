import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["modprefix", "setmodprefix", "delmodprefix", "deletemodprefix"],
  description: t("cmd_cambia_el_prefijo_reservado_pa_235bb64a"),
  category: "system",
  modOnly: true,
  async run(ctx: CommandContext) {
    if (["delmodprefix", "deletemodprefix"].includes(ctx.cmdName)) {
      ctx.db.setBot(ctx.botJid, { modPrefix: null });
      return ctx.reply(
        t("cmd_prefijo_de_moderacion_eliminad_d337eb96"),
      );
    }

    const value = String(ctx.args?.[0] ?? "").trim();
    if (value && (value.length > 3 || /\s/.test(value))) {
      return ctx.reply(
        t("cmd_el_prefijo_debe_tener_entre_1__3e08ed04"),
      );
    }

    ctx.db.setBot(ctx.botJid, { modPrefix: value || null });
    return ctx.reply(
      value
        ? t("cmd_prefijo_de_moderacion_actualiz_2135eeb6", { value0: value })
        : t("cmd_el_bot_volvera_a_usar_el_prefi_3b966b60"),
    );
  },
};
