import { GROUP_RANKING_PAGE_SIZE } from "../database/groupActivity.ts";
import { t, type TranslationKey } from "../src/langs/index.ts";
import type {
  CommandContext,
  GroupMemberRankingOrder,
  GroupRanking,
  GroupRankingPage,
} from "../types/index.d.ts";
import { formatRankingPage } from "./rankingText.ts";
import { fytBold } from "./socketText.ts";

const MEMBER_RANKINGS = {
  activeMembers: {
    order: "desc",
    icon: "🔥",
    heading: "group_active_ranking_heading",
    description: "cmd_muestra_los_usuarios_mas_activ_5869777f",
  },
  ghosts: {
    order: "asc",
    icon: "👻",
    heading: "group_ghost_ranking_heading",
    description: "group_ghost_ranking_description",
  },
} satisfies Record<
  string,
  {
    order: GroupMemberRankingOrder;
    icon: string;
    heading: TranslationKey;
    description: TranslationKey;
  }
>;

export function createGroupRanking(ranking: GroupRanking | keyof typeof MEMBER_RANKINGS) {
  const commands = ranking === "topCmdUsers";
  const memberRanking =
    ranking === "activeMembers" || ranking === "ghosts"
      ? MEMBER_RANKINGS[ranking]
      : undefined;
  const countIcon = commands ? "⚡" : "💬";
  const icon = memberRanking?.icon ?? countIcon;

  return {
    groupOnly: true,
    adminOnly: Boolean(memberRanking),
    description: t(
      memberRanking?.description ??
        (commands
          ? "group_command_ranking_description"
          : "group_message_ranking_description"),
    ),
    async run(ctx: CommandContext, primaryAlias: string) {
      const requestedPage = ctx.args[0] ?? "1";
      const page = Number(requestedPage);
      if (
        !/^\d+$/.test(requestedPage) ||
        !Number.isSafeInteger(page) ||
        page < 1
      ) {
        return ctx.reply(
          t("group_ranking_invalid_page", {
            example: `${ctx.usedPrefix ?? "."}${ctx.cmdName || primaryAlias} 1`,
          }),
        );
      }

      let result: GroupRankingPage;
      if (ranking === "activeMembers" || ranking === "ghosts") {
        const participants = ctx.groupMeta?.participants;
        if (!participants?.length) {
          return ctx.reply(t("cmd_no_se_pudo_obtener_la_informac_3121a681"));
        }
        result = ctx.db.getGroupWeeklyMemberRankingPage(
          ctx.from,
          participants,
          MEMBER_RANKINGS[ranking].order,
          page,
        );
      } else {
        result = ctx.db.getGroupWeeklyRankingPage(ctx.from, ranking, page);
      }

      const { entries, totalPages } = result;
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
        memberRanking?.heading ??
          (commands
            ? "group_command_ranking_heading"
            : "group_message_ranking_heading"),
      );
      const title = t(
        commands
          ? "group_command_ranking_title"
          : "group_message_ranking_title",
      );
      const countLabel = commands
        ? "group_command_ranking_count"
        : "group_message_ranking_count";

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
            value: `${countIcon} ${t(countLabel, { count })}`,
          })),
        }),
        mentions: entries.map(({ jid }) => jid),
      });
    },
  };
}
