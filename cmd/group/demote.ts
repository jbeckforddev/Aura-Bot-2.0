import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["demote", "descender", "quitardadmin"],
  category: "group",
  description: t("cmd_quita_el_administrador_a_un_us_53a0e533"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const target = context?.mentionedJid?.[0] || context?.participant;
    if (!target)
      return ctx.reply({
        text: t("cmd_value0_value1_etiqueta_o_respo_faa186f4", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_usuario_2df40348")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    await ctx.sock.groupParticipantsUpdate(ctx.from, [target], "demote");
    return ctx.reply({
      text: t("cmd_value0_el_usuario_value1_ya_no_fe3ae5e3", { value0: fytBold(t("cmd_admin_system_19c2cc22")), value1: target.split("@")[0], value2: fytBold(t("cmd_aura_reed_95dcfb15")) }),
      mentions: [target],
    });
  },
};
