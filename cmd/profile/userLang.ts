import type { CommandContext } from "../../types/index.d.ts";
import { getLanguageMetadata, t, SUPPORTED_LANGUAGES } from "../../src/langs/index.ts";

const validLanguages = new Set<string>(SUPPORTED_LANGUAGES);

export default {
  name: ["userlang", "setuserlang", "mylang", "idioma"],
  description: t("cmd_lang_description_5d2ec411"),
  category: "profile",
  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] ?? "").trim().toLowerCase();

    if (!validLanguages.has(value)) {
      return ctx.reply({ text: t("cmd_lang_usage_7c5f1d5a") });
    }

    ctx.db.setUser(ctx.sender, { userLang: value });

    const { label, flag } = getLanguageMetadata(value);
    const template = [
      `╭〔 ${t("cmd_lang_ui_header_6a6277d1")} 〕━⬣`,
      `┃ ${flag} ${t("cmd_lang_ui_updated_88d7a09b")}`,
      "╰━━━━━━━━━━━━⬣",
      "",
      `┃ > ${t("cmd_lang_ui_your_preferred_1b9ec5d6")}`,
      `┃ > ${label} ${flag}`,
      "╰━━━━━━━━━━━━⬣",
    ].join("\n");

    return ctx.reply({ text: template });
  },
};
