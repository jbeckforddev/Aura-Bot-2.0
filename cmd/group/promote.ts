import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["promote", "ascender", "haceradmin"],
  category: "group",
  description: t("cmd_da_administrador_a_un_usuario_e3400496"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const target = context?.mentionedJid?.[0] || context?.participant;
    if (!target)
      return ctx.reply({
        text: t("cmd_value0_value1_etiqueta_o_respo_77435892", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_usuario_2df40348")), value2: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    await ctx.sock.groupParticipantsUpdate(ctx.from, [target], "promote");
    return ctx.reply({
      text: t("cmd_value0_el_usuario_value1_ahora_20112386", { value0: fytBold(t("cmd_admin_system_19c2cc22")), value1: target.split("@")[0], value2: fytBold(t("cmd_aura_reed_95dcfb15")) }),
      mentions: [target],
    });
  },
};
