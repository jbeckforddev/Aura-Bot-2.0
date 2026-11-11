
import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";

const DEFAULT_WELCOME = `╭〔 👋 𝐁𝐈𝐄𝐍𝐕𝐄𝐍𝐈𝐃𝐎/𝐀 〕⬣
┃ ✨ 𝐀 𝐔𝐍 𝐍𝐔𝐄𝐕𝐎 𝐈𝐍𝐓𝐄𝐆𝐑𝐀𝐍𝐓𝐄
╰━━━━━━━━━━━━⬣

┃ 👋 𝐇𝐨𝐥𝐚 @user
┃ ✨ 𝐁𝐢𝐞𝐧𝐯𝐞𝐧𝐢𝐝𝐨/𝐚 𝐚:
┃ 🏰 *@group*

┃ 📜 𝐍𝐨 𝐨𝐥𝐯𝐢𝐝𝐞𝐬 𝐥𝐞𝐞𝐫 𝐥𝐚𝐬 𝐫𝐞𝐠𝐥𝐚𝐬
┃ 𝐲 𝐝𝐢𝐬𝐟𝐫𝐮𝐭𝐚𝐫 𝐭𝐮 𝐞𝐬𝐭𝐚𝐧𝐜𝐢𝐚.

╰━━〔 ⚡ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕━━⬣`;

export default {
  name: ["testwelcome", "testbienvenida"],
  category: "group",
  description: "Muestra una vista previa de la bienvenida configurada.",
  groupOnly: true,
  adminOnly: false,

  async run(ctx: CommandContext) {
    const group = await ctx.db.getGroup(ctx.from);

    const participant = ctx.sender;
    const mentions = participant ? [participant] : [];

    const tags = mentions
      .map((jid) => `@${jid.split("@")[0]}`)
      .join(", ");

    const metadata = ctx.groupMeta;
    const groupName =
      metadata?.subject ||
      ctx.groupName ||
      group?.group_name ||
      ctx.from;

    const groupDescription =
      metadata?.desc?.toString() || "Sin descripción";

    const memberCount =
      metadata?.participants?.length || 0;

    const template = String(
      group?.welcomeMessage || DEFAULT_WELCOME,
    );

    const text = template
      .replaceAll(t("core_group_fe6a00b1"), groupName)
      .replaceAll(t("core_mention_d5b00d52"), tags)
      .replaceAll(t("core_user_0f23d79d"), tags)
      .replaceAll(t("core_group_c77112aa"), groupName)
      .replaceAll(t("core_desc_476f541a"), groupDescription)
      .replaceAll(t("core_count_7886d3a6"), String(memberCount));

    return ctx.reply({
      text,
      mentions,
    });
  },
};
