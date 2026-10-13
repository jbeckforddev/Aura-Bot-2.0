import type { CommandContext } from "../../types/index.d.ts";
import { updateProfile } from "../../core/profileConfig.ts";
import { fytBold } from "./../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


function validateDateFormat(dateStr: string): boolean {
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateStr.match(regex);
  
  if (!match) return false;
  
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;
  
  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1;
}

export default {
  name: ["setbirt", "setbirth", "cumple"],
  description: t("cmd_guarda_tu_cumpleanos_4276c1e0"),
  category: "profile",
  async run(ctx: CommandContext) {
    let textInfo = `╭〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣\n`;
    textInfo += `┃ ${fytBold(t("cmd_como_definir_tu_cumpleanos_5522650c"))}\n`;
    textInfo += `╰━━━━━━━━━━━━⬣\n\n`;
    textInfo += `┃ ${fytBold(t("cmd_uso_45f4f199"))} .setbirt DD/MM/AAAA\n`;
    textInfo += `┃ ${fytBold(t("cmd_ejemplo_ea39dc79"))} .setbirt 07/04/2007\n`;
    textInfo += `\n╰〔 ⚡ ${fytBold(t("cmd_system_info_1a78a0cb"))} 〕⬣`;

    if (!ctx.text) return ctx.reply(textInfo);

    const dateInput = ctx.text.trim();
    
    if (!validateDateFormat(dateInput)) {
      let textError = `╭〔 ⚠️ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣\n`;
      textError += `┃ ❌ ${fytBold(t("cmd_formato_no_valido_c1ce726a"))}\n`;
      textError += `╰━━━━━━━━━━━━⬣\n\n`;
      textError += `┃ Solo se permite el formato: *DD/MM/AAAA*\n`;
      textError += `┃ Ejemplo: ${ctx.usedPrefix ?? "."}setbirt 07/04/2007\n\n`;
      textError += `╰〔 ⚡ ${fytBold(t("cmd_system_info_1a78a0cb"))} 〕⬣`;
      return ctx.reply(textError);
    }

    updateProfile(ctx.sender, { birthDate: dateInput });

    let text = `╭〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣\n`;
    text += `┃ ✅ ${fytBold(t("cmd_cumple_actualizado_87925cf1"))}\n`;
    text += `╰━━━━━━━━━━━━⬣\n\n`;
    text += `┃ 🎂 Tu cumple es el:\n`;
    text += `┃ 📝 *${dateInput}*\n\n`;
    text += `╰〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))}〕⬣`;

    return ctx.reply(text);
  },
};
