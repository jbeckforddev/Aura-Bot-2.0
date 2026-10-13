import type { CommandContext } from "../../types/index.d.ts";
import { updateProfile } from "../../core/profileConfig.ts";
import { fytBold } from "./../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["setdesc", "descripcion", "bio"],
  description: t("cmd_cambia_tu_descripcion_f219203d"),
  category: "profile",
  async run(ctx: CommandContext) {
    if (!ctx.text) return ctx.reply(t("cmd_uso_setdesc_tu_descripcion_9f48e6e6"));
    updateProfile(ctx.sender, { description: ctx.text.slice(0, 120) });

    let text = `╭〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣\n`;
    text += `┃ ✅ ${fytBold(t("cmd_bio_actualizado_a238c02c"))}\n`;
    text += `╰━━━━━━━━━━━━⬣\n\n`;
    text += `┃ 👋 Nueva Biografia:\n`;
    text += `┃ 📝 *${ctx.text.slice(0, 40)}*\n\n`;
    text += `╰〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣`;

    return ctx.reply(text);
  },
};
