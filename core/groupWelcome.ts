import { t, withLocale } from "../src/langs/index.ts";

export type GroupWelcomeAction = "add" | "remove";

interface GroupData {
  welcomeMessage?: string | null;
  goodbyeMessage?: string | null;
  group_name?: string | null;
  groupLang?: string | null;
}

interface GroupMetadata {
  subject?: string | null;
  desc?: unknown;
  participants?: unknown[];
}

interface GroupWelcomeOptions {
  action: GroupWelcomeAction;
  group: GroupData;
  metadata?: GroupMetadata | null;
  participants: string[];
  compact?: boolean;
}

export function buildGroupWelcome({
  action,
  group,
  metadata,
  participants,
  compact = false,
}: GroupWelcomeOptions): { text: string; mentions: string[] } | null {
  const mentions = participants.filter(
    (participant) => typeof participant === "string" && participant.length > 0,
  );
  if (mentions.length === 0) return null;

  return withLocale(group.groupLang, () => {
    const groupName =
      metadata?.subject || group.group_name || t("groupDefaultName");
    const tags = mentions
      .map((participant) => "@" + participant.split("@")[0])
      .join(", ");
    const custom =
      action === "add" ? group.welcomeMessage : group.goodbyeMessage;

    if (!custom) {
      const key =
        action === "add"
          ? compact
            ? "groupWelcomeCompact"
            : "groupWelcomeDefault"
          : compact
            ? "groupGoodbyeCompact"
            : "groupGoodbyeDefault";
      return { text: t(key, { user: tags, group: groupName }), mentions };
    }

    const description = metadata?.desc?.toString() || t("profileNoDescription");
    const count = String(metadata?.participants?.length ?? 0);
    const replacements = {
      "{group}": groupName,
      "{mention}": tags,
      "@user": tags,
      "@group": groupName,
      "@desc": description,
      "@count": count,
      [t("core_group_fe6a00b1")]: groupName,
      [t("core_mention_d5b00d52")]: tags,
      [t("core_user_0f23d79d")]: tags,
      [t("core_group_c77112aa")]: groupName,
      [t("core_desc_476f541a")]: description,
      [t("core_count_7886d3a6")]: count,
    } as Record<string, string>;
    const tokens = Object.keys(replacements)
      .filter(Boolean)
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const text = custom.replace(
      new RegExp(tokens.join("|"), "g"),
      (token) => replacements[token],
    );
    return { text, mentions };
  });
}
