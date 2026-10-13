import type { CommandContext } from "../../types/index.d.ts";
import { updateProfile } from "../../core/profileConfig.ts";
import { fytBold } from "./../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const VALID_GENDERS = ["hombre", "mujer", "masculino", "femenino"];

export default {
  name: ["setgenre", "genero"],
  description: t("cmd_cambia_tu_genero_7846253e"),
  category: "profile",
  async run(ctx: CommandContext) {
    const genderInput = ctx.text?.toLowerCase().trim();
    
    if (!genderInput) {
      let textInfo = `╭〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣\n`;
      textInfo += `┃ ${fytBold(t("cmd_como_definir_tu_genero_ad1ce2ae"))}\n`;
      textInfo += `╰━━━━━━━━━━━━⬣\n\n`;
      textInfo += `┃ ${fytBold(t("cmd_uso_45f4f199"))} .setgenre <género>\n`;
      textInfo += `┃ ${fytBold(t("cmd_opciones_d6b2a937"))} hombre, mujer\n`;
      textInfo += `┃ ${fytBold(t("cmd_ejemplo_ea39dc79"))} .setgenre hombre\n`;
      textInfo += `\n╰〔 ⚡ ${fytBold(t("cmd_system_info_1a78a0cb"))} 〕⬣`;
      return ctx.reply(textInfo);
    }

    if (!VALID_GENDERS.includes(genderInput)) {
      let textError = `╭〔 ⚠️ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣\n`;
      textError += `┃ ❌ ${fytBold(t("cmd_genero_no_valido_a062b3cd"))}\n`;
      textError += `╰━━━━━━━━━━━━⬣\n\n`;
      textError += `┃ Solo se permiten: *hombre* o *mujer*\n`;
      textError += `┃ Ejemplo: ${ctx.usedPrefix ?? "."}setgenre hombre\n\n`;
      textError += `╰〔 ⚡ ${fytBold(t("cmd_system_info_1a78a0cb"))} 〕⬣`;
      return ctx.reply(textError);
    }

    updateProfile(ctx.sender, { gender: genderInput });

    let text = `╭〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣\n`;
    text += `┃ ✅ ${fytBold(t("cmd_genero_actualizado_60285202"))}\n`;
    text += `╰━━━━━━━━━━━━⬣\n\n`;
    text += `┃ 👋 Tu género es:\n`;
    text += `┃ 📝 *${genderInput}*\n\n`;
    text += `╰〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣`;

    return ctx.reply(text);
  },
};
