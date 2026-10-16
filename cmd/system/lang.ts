import type { CommandContext } from "../../types/index.d.ts";
import { getLanguageMetadata, SUPPORTED_LANGUAGES, t } from "../../src/langs/index.ts";
import { fytBold } from "../../core/socketText.ts";

const validLanguages = new Set<string>(SUPPORTED_LANGUAGES);

function getLanguageMeta(language: string | null | undefined) {
  return getLanguageMetadata(language);
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
    const languageOptions = SUPPORTED_LANGUAGES.map((language) => {
      const { label, flag } = getLanguageMetadata(language);
      return `┃ > ${language.toUpperCase()}: ${label} ${flag}`;
    });

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
          ...languageOptions,
          "",
          `┣〔 ${fytBold(t("cmd_lang_config_5e8da5a7"))} 〕⬣`,
          "",
          `┣━〔 ${fytBold(t("cmd_lang_group_title_03d7a6f8"))} 〕━⬣`,
          `┃ > ${prefix}grouplang <código>`,
          "┣━━━━━━━━━━━━⬣",
          "",
          `┣━〔 ${fytBold(t("cmd_lang_user_title_2c7f449b"))} 〕━⬣`,
          `┃ > ${prefix}mylang <código>`,
          "╰━━━━━━━━━━━━⬣",
        ].join("\n");
        return ctx.reply({ text: template });
      }

      if (requestedScope === "group") {
        if (!ctx.isAdmin && !ctx.isMod && !ctx.isOwner) {
          return ctx.reply({ text: t("cmd_permiso_denegado_a479cad0") });
        }
        ctx.db.setGroup(ctx.from, { groupLang: language });

        const { label: groupLabel, flag: groupFlag } = getLanguageMeta(language);
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

      const { label: userLabel, flag: userFlag } = getLanguageMeta(language);
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

      const { label: preferredLabel, flag: preferredFlag } = getLanguageMeta(requestedLanguage);
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

      const { label: groupLabel2, flag: groupFlag2 } = getLanguageMeta(secondArg);
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
      ...languageOptions,
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
      `┃ > ${prefix}grouplang <código>`,
      "",
      `┣━〔 ${fytBold(t("cmd_lang_user_title_2c7f449b"))} 〕━⬣`,
      `┃ > ${prefix}mylang <código>`,
      "╰━━━━━━━━━━━━⬣",
    ].join("\n");

    return ctx.reply({ text: template });
  },
};
