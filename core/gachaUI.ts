import { fytBold } from "./socketText.ts";

export function box(
  emoji: string,
  title: string,
  subtitle?: string,
  fields: string[] = [],
  tip?: string,
) {
  let text = `╭〔 ${emoji} ${fytBold("GACHA")} 〕⬣\n`;
  text += `┃ ${fytBold(String(title || "").toUpperCase())}\n`;
  text += `╰━━━━━━━━━━━━⬣\n\n`;

  if (subtitle) {
    text += `┃ ${subtitle}\n\n`;
  }

  if (fields.length) {
    for (const line of fields) {
      text += line === "" ? `┃\n` : `┃ ${line}\n`;
    }
    text += `\n`;
  }

  if (tip) {
    text += `> ${tip}\n\n`;
  }

  text += `╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`;
  return text;
}
