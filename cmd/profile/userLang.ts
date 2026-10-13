import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";

const validLanguages = new Set(["es", "en"]);

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

    const label = value === "es" ? t("cmd_lang_ui_spanish_7a2d3a8c") : t("cmd_lang_ui_english_1639d4f2");
    const flag = value === "es" ? "🇪🇦" : "🇺🇸";
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
