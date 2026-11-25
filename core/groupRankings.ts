import { GROUP_RANKING_PAGE_SIZE } from "../database/groupActivity.ts";
import { t } from "../src/langs/index.ts";
import type { CommandPlugin, GroupRanking } from "../types/index.d.ts";
import { formatRankingPage } from "./rankingText.ts";
import { fytBold } from "./socketText.ts";

export function groupRankingCommand(
  name: string[],
  ranking: GroupRanking,
): CommandPlugin {
  const messages = ranking === "topMsgUsers";

  return {
    name,
    category: "group",
    groupOnly: true,
    description: t(
      messages
        ? "group_message_ranking_description"
        : "group_command_ranking_description",
    ),
    async run(ctx) {
      const requestedPage = ctx.args[0] ?? "1";
      const page = Number(requestedPage);
      if (
        !/^\d+$/.test(requestedPage) ||
        !Number.isSafeInteger(page) ||
        page < 1
      ) {
        return ctx.reply(
          t("group_ranking_invalid_page", {
            example: `${ctx.usedPrefix ?? "."}${ctx.cmdName || name[0]} 1`,
          }),
        );
      }

      const { entries, totalPages } = ctx.db.getGroupWeeklyRankingPage(
        ctx.from,
        ranking,
        page,
      );
      if (totalPages === 0) return ctx.reply(t("group_ranking_empty"));
      if (page > totalPages) {
        return ctx.reply(
          t("cmd_esa_pagina_no_existe_hay_value_26d57c06", {
            value0: totalPages,
            value1: totalPages === 1 ? "" : "s",
          }),
        );
      }

      const heading = t(
        messages
          ? "group_message_ranking_heading"
          : "group_command_ranking_heading",
      );
      const title = t(
        messages
          ? "group_message_ranking_title"
          : "group_command_ranking_title",
      );
      const icon = messages ? "💬" : "⚡";
      const countLabel = messages
        ? "group_message_ranking_count"
        : "group_command_ranking_count";

      return ctx.reply({
        text: formatRankingPage({
          heading: `${icon} ${fytBold(heading.toUpperCase())} ${icon}`,
          title: fytBold(title.toUpperCase()),
          pagination: t("group_ranking_page", { page, totalPages }),
          footer: fytBold("AURA GROUP"),
          offset: (page - 1) * GROUP_RANKING_PAGE_SIZE,
          rows: entries.map(({ jid, count, username }) => ({
            name: (
              username?.trim() ||
              (jid === ctx.sender ? ctx.msg.pushName?.trim() : "") ||
              `@${jid.split("@")[0]}`
            ).replace(/\s+/g, " "),
            value: `${icon} ${t(countLabel, { count })}`,
          })),
        }),
        mentions: entries.map(({ jid }) => jid),
      });
    },
  };
}
