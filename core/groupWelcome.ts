
import { t } from "../src/langs/index.ts";

export type GroupWelcomeAction = "add" | "remove";

interface GroupData {
  welcomeMessage?: string | null;
  goodbyeMessage?: string | null;
  group_name?: string | null;
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
}

const DEFAULT_WELCOME = `╭〔 👋 𝐁𝐈𝐄𝐍𝐕𝐄𝐍𝐈𝐃𝐎/𝐀 〕⬣
┃ ✨ 𝐀 𝐔𝐍 𝐍𝐔𝐄𝐕𝐎 𝐈𝐍𝐓𝐄𝐆𝐑𝐀𝐍𝐓𝐄
╰━━━━━━━━━━━━⬣

┃ 👋 𝐇𝐨𝐥𝐚 @user
┃ ✨ 𝐁𝐢𝐞𝐧𝐯𝐞𝐧𝐢𝐝𝐨/𝐚 𝐚:
┃ 🏰 *@group*

┃ 📜 𝐍𝐨 𝐨𝐥𝐯𝐢𝐝𝐞𝐬 𝐥𝐞𝐞𝐫 𝐥𝐚𝐬 𝐫𝐞𝐠𝐥𝐚𝐬
┃ 𝐲 𝐝𝐢𝐬𝐟𝐫𝐮𝐭𝐚𝐫 𝐭𝐮 𝐞𝐬𝐭𝐚𝐧𝐜𝐢𝐚.

╰━━〔 ⚡ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕━━⬣`;

const DEFAULT_GOODBYE = `╭〔 😔 𝐒𝐄 𝐍𝐎𝐒 𝐅𝐔𝐄 〕⬣
┃ ✨ 𝐇𝐀𝐒𝐓𝐀 𝐏𝐑𝐎𝐍𝐓𝐎
╰━━━━━━━━━━━━⬣

┃ 👋 𝐀𝐝𝐢ó𝐬 @user
┃ > 𝐄𝐬 𝐮𝐧𝐚 𝐩𝐞𝐧𝐚 𝐪𝐮𝐞 𝐭𝐞 𝐯𝐚𝐲𝐚𝐬 𝐝𝐞:
┃ > *@group*

┃ > 𝐍𝐮𝐧𝐜𝐚 𝐭𝐞 𝐨𝐥𝐯𝐢𝐝𝐚𝐫𝐞𝐦𝐨𝐬

╰━━〔 ⚡ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕━━⬣`;

export function buildGroupWelcome({
  action,
  group,
  metadata,
  participants,
}: GroupWelcomeOptions): { text: string; mentions: string[] } | null {
  const participantJids = participants.filter(
    (participant) => typeof participant === "string" && participant.length > 0,
  );

  if (participantJids.length === 0) return null;

  const groupName =
    metadata?.subject || group.group_name || "Grupo";

  const template = String(
    action === "add"
      ? group.welcomeMessage || DEFAULT_WELCOME
      : group.goodbyeMessage || DEFAULT_GOODBYE,
  );

  const tags = participantJids
    .map((participant) => `@${participant.split("@")[0]}`)
    .join(", ");

  const groupDescription =
    metadata?.desc?.toString() || "Sin descripción";

  const memberCount = metadata?.participants?.length || 0;

  const text = template
    .replaceAll(t("core_group_fe6a00b1"), groupName)
    .replaceAll(t("core_mention_d5b00d52"), tags)
    .replaceAll(t("core_user_0f23d79d"), tags)
    .replaceAll(t("core_group_c77112aa"), groupName)
    .replaceAll(t("core_desc_476f541a"), groupDescription)
    .replaceAll(t("core_count_7886d3a6"), String(memberCount));

  return {
    text,
    mentions: participantJids,
  };
}
