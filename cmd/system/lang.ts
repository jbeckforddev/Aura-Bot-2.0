import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";
import { fytBold } from "../../core/socketText.ts";

const validLanguages = new Set(["es", "en"]);

function getLanguageMeta(language: string | null | undefined) {
  const normalized = validLanguages.has(String(language ?? "")) ? String(language) : "es";
  const label = normalized === "es" ? t("cmd_lang_ui_spanish_7a2d3a8c") : t("cmd_lang_ui_english_1639d4f2");
  const flag = normalized === "es" ? "🇪🇦" : "🇺🇸";
  return { normalized, label, flag };
}

export default {
  name: ["lang", "setlang", "language"],
  description: t("cmd_lang_description_5d2ec411"),
  category: "system",
  groupOnly: false,
  privateOnly: false,
  async run(ctx: CommandContext) {
    const prefix = ctx.usedPrefix ?? ".";
    const args = ctx.args ?? [];
    const firstArg = String(args[0] ?? "").trim().toLowerCase();
    const secondArg = String(args[1] ?? "").trim().toLowerCase();

    const currentUserLanguage = ctx.db.getUser(ctx.sender)?.userLang ?? "es";
    const currentGroupLanguage = ctx.from ? ctx.db.getGroup(ctx.from)?.groupLang ?? "es" : "es";
    const currentUserMeta = getLanguageMeta(currentUserLanguage);
    const currentGroupMeta = getLanguageMeta(currentGroupLanguage);

    const requestedLanguage = validLanguages.has(firstArg) ? firstArg : null;
    const requestedScope = ["group", "g", "grupo"].includes(firstArg)
      ? "group"
      : ["user", "u", "personal", "me"].includes(firstArg)
        ? "user"
        : null;

    if (requestedScope) {
      const language = validLanguages.has(secondArg) ? secondArg : null;
      if (!language) {
        const template = [
          `╭〔 ${fytBold(t("cmd_lang_header_41e3d3fc"))} 〕━⬣`,
          `┃ ${fytBold(t("cmd_lang_available_74d57cfe"))}`,
          "╰━━━━━━━━━━━━⬣",
          "",
          `┃ > ${t("cmd_lang_ui_your_preferred_1b9ec5d6")}: ${currentUserMeta.label} ${currentUserMeta.flag}`,
          `┃ > ${t("cmd_lang_ui_group_language_17e4d963")}: ${currentGroupMeta.label} ${currentGroupMeta.flag}`,
          "",
          `┃ > EN: ${t("cmd_lang_english_8b7d2d1a")} 🇺🇸`,
          `┃ > ES: ${t("cmd_lang_spanish_6d32c120")} 🇪🇦`,
          "",
          `┣〔 ${fytBold(t("cmd_lang_config_5e8da5a7"))} 〕⬣`,
          "",
          `┣━〔 ${fytBold(t("cmd_lang_group_title_03d7a6f8"))} 〕━⬣`,
          `┃ > ${prefix}grouplang <en|es>`,
          "┣━━━━━━━━━━━━⬣",
          "",
          `┣━〔 ${fytBold(t("cmd_lang_user_title_2c7f449b"))} 〕━⬣`,
          `┃ > ${prefix}mylang <es|en>`,
          "╰━━━━━━━━━━━━⬣",
        ].join("\n");
        return ctx.reply({ text: template });
      }

      if (requestedScope === "group") {
        if (!ctx.isAdmin && !ctx.isMod && !ctx.isOwner) {
          return ctx.reply({ text: t("cmd_permiso_denegado_a479cad0") });
        }
        ctx.db.setGroup(ctx.from, { groupLang: language });

        const groupLabel = language === "es" ? t("cmd_lang_ui_spanish_7a2d3a8c") : t("cmd_lang_ui_english_1639d4f2");
        const groupFlag = language === "es" ? "🇪🇦" : "🇺🇸";
        const groupTemplate = [
          `╭〔 ${fytBold(t("cmd_lang_ui_header_6a6277d1"))} 〕━⬣`,
          `┃ ${groupFlag} ${fytBold(t("cmd_lang_ui_updated_88d7a09b"))}`,
          "╰━━━━━━━━━━━━⬣",
          "",
          `┃ > ${t("cmd_lang_ui_group_language_17e4d963")}`,
          `┃ > ${groupLabel} ${groupFlag}`,
          "╰━━━━━━━━━━━━⬣",
        ].join("\n");

        return ctx.reply({ text: groupTemplate });
      }

      ctx.db.setUser(ctx.sender, { userLang: language });

      const userLabel = language === "es" ? t("cmd_lang_ui_spanish_7a2d3a8c") : t("cmd_lang_ui_english_1639d4f2");
      const userFlag = language === "es" ? "🇪🇦" : "🇺🇸";
      const userTemplate = [
        `╭〔 ${fytBold(t("cmd_lang_ui_header_6a6277d1"))} 〕━⬣`,
        `┃ ${userFlag} ${fytBold(t("cmd_lang_ui_updated_88d7a09b"))}`,
        "╰━━━━━━━━━━━━⬣",
        "",
        `┃ > ${t("cmd_lang_ui_your_preferred_1b9ec5d6")}`,
        `┃ > ${userLabel} ${userFlag}`,
        "╰━━━━━━━━━━━━⬣",
      ].join("\n");

      return ctx.reply({ text: userTemplate });
    }

    if (requestedLanguage) {
      ctx.db.setUser(ctx.sender, { userLang: requestedLanguage });

      const preferredLabel = requestedLanguage === "es" ? t("cmd_lang_ui_spanish_7a2d3a8c") : t("cmd_lang_ui_english_1639d4f2");
      const preferredFlag = requestedLanguage === "es" ? "🇪🇦" : "🇺🇸";
      const preferredTemplate = [
        `╭〔 ${fytBold(t("cmd_lang_ui_header_6a6277d1"))} 〕━⬣`,
        `┃ ${preferredFlag} ${fytBold(t("cmd_lang_ui_updated_88d7a09b"))}`,
        "╰━━━━━━━━━━━━⬣",
        "",
        `┃ > ${t("cmd_lang_ui_your_preferred_1b9ec5d6")}`,
        `┃ > ${preferredLabel} ${preferredFlag}`,
        "╰━━━━━━━━━━━━⬣",
      ].join("\n");

      return ctx.reply({ text: preferredTemplate });
    }

    if (firstArg === "group" && validLanguages.has(secondArg)) {
      if (!ctx.isAdmin && !ctx.isMod && !ctx.isOwner) {
        return ctx.reply({ text: t("cmd_permiso_denegado_a479cad0") });
      }
      ctx.db.setGroup(ctx.from, { groupLang: secondArg });

      const groupLabel2 = secondArg === "es" ? t("cmd_lang_ui_spanish_7a2d3a8c") : t("cmd_lang_ui_english_1639d4f2");
      const groupFlag2 = secondArg === "es" ? "🇪🇦" : "🇺🇸";
      const groupTemplate2 = [
        `╭〔 ${fytBold(t("cmd_lang_ui_header_6a6277d1"))} 〕━⬣`,
        `┃ ${groupFlag2} ${fytBold(t("cmd_lang_ui_updated_88d7a09b"))}`,
        "╰━━━━━━━━━━━━⬣",
        "",
        `┃ > ${t("cmd_lang_ui_group_language_17e4d963")}`,
        `┃ > ${groupLabel2} ${groupFlag2}`,
        "╰━━━━━━━━━━━━⬣",
      ].join("\n");

      return ctx.reply({ text: groupTemplate2 });
    }

    const template = [
      `╭〔 ${fytBold(t("cmd_lang_header_41e3d3fc"))} 〕━⬣`,
      `┃ ${fytBold(t("cmd_lang_available_74d57cfe"))}`,
      "╰━━━━━━━━━━━━⬣",
      "",
      `┃ > EN: ${t("cmd_lang_english_8b7d2d1a")} 🇺🇸`,
      `┃ > ES: ${t("cmd_lang_spanish_6d32c120")} 🇪🇦`,
      "",
      `╭〔 ${fytBold(t("core_lang_group_1f3f3fe0f0ab"))} 〕━⬣`,
      `┃ > ${currentGroupMeta.label} ${currentGroupMeta.flag}`,
      `┣〔 ${fytBold(t("core_lang_user_1f1fa1f8"))} 〕━⬣`,
      `┃ > ${currentUserMeta.label} ${currentUserMeta.flag}`,
      "╰━━━━━━━━━━━━⬣",
      "",
      `┣〔 ${fytBold(t("cmd_lang_config_5e8da5a7"))} 〕⬣`,
      "",
      `┣━〔 ${fytBold(t("cmd_lang_group_title_03d7a6f8"))} 〕━⬣`,
      `┃ > ${prefix}grouplang <en|es>`,
      "",
      `┣━〔 ${fytBold(t("cmd_lang_user_title_2c7f449b"))} 〕━⬣`,
      `┃ > ${prefix}mylang <es|en>`,
      "╰━━━━━━━━━━━━⬣",
    ].join("\n");

    return ctx.reply({ text: template });
  },
};
