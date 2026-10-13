import type { CommandContext } from "../../types/index.d.ts";
import { updateProfile } from "../../core/profileConfig.ts";
import { fytBold } from "./../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["setmyname", "minombre"],
  description: t("cmd_cambia_tu_nombre_de_perfil_e6a4eedc"),
  category: "profile",
  async run(ctx: CommandContext) {
    if (!ctx.text) return ctx.reply(t("cmd_uso_setname_tu_nombre_a76ee4af"));
    updateProfile(ctx.sender, { name: ctx.text.slice(0, 40) });

    let text = `╭〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣\n`;
    text += `┃ ✅ ${fytBold(t("cmd_nombre_actualizado_7b7ef2b0"))}\n`;
    text += `╰━━━━━━━━━━━━⬣\n\n`;
    text += `┃ 👋 Ahora te llamaran:\n`;
    text += `┃ 📝 *${ctx.text.slice(0, 40)}*\n\n`;
    text += `╰〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣`;

    return ctx.reply(text);
  },
};
