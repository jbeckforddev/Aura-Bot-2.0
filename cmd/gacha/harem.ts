import type { CommandContext } from "../../types/index.d.ts";
import { getGachaHarem } from "../../database/gachaDB.ts";
import { cleanJid, getTargetJids } from "../../core/groupUtils.ts";
import { GachaCharacters } from "../../src/GachaCharacters/index.ts";
import { t } from "../../src/langs/index.ts";

const PAGE_SIZE = 10;

export default {
  name: ["harem", "coleccion", "colección"],
  category: "gacha",
  description: t("gacha_harem_description"),
  groupOnly: true,

  async run(ctx: CommandContext) {
    const pageArgument = ctx.args.find((argument) => /^-?\d+$/.test(argument));
    const requestedPage = pageArgument ? Number(pageArgument) : 1;
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
      return ctx.reply(t("gacha_harem_page_invalid"));
    }

    const rawTarget = cleanJid(getTargetJids(ctx)[0] || ctx.sender);
    const userId = rawTarget.endsWith("@lid")
      ? cleanJid((await ctx.resolveLid(rawTarget).catch(() => rawTarget)) || rawTarget)
      : rawTarget;
    const entries = getGachaHarem(ctx.from, userId);
    if (entries.length === 0) {
      return ctx.reply(t("gacha_harem_empty"));
    }

    const totalPages = Math.ceil(entries.length / PAGE_SIZE);
    if (requestedPage > totalPages) {
      return ctx.reply(
        t("gacha_harem_page_out_of_range", { totalPages }),
      );
    }

    const user = ctx.db.getUser(userId);
    const username =
      user?.pushName ||
      user?.username ||
      user?.name ||
      user?.phone_number ||
      userId.split("@")[0];
    const pageEntries = entries.slice(
      (requestedPage - 1) * PAGE_SIZE,
      requestedPage * PAGE_SIZE,
    );
    const totalValue = entries.reduce(
      (total, entry) => total + Number(GachaCharacters[entry.character_id]?.value || 0),
      0,
    );
    const lines = [
      `╭〔 🎴 ${t("gacha_harem_title", { user: username })} 〕━⬣`,
      `┃ ${t("gacha_harem_page", { page: requestedPage, totalPages })}`,
      `╰━━━━━━━━━━━━⬣`,
      "",
    ];

    pageEntries.forEach((entry, index) => {
      const character = GachaCharacters[entry.character_id];
      const imageLabel =
        entry.image_id === null
          ? ""
          : ` · ${t("gacha_id_label")}: ${entry.image_id}`;
      const value = Number(character?.value || 0);
      lines.push(
        `┃ ${t("gacha_harem_item", {
          number: (requestedPage - 1) * PAGE_SIZE + index + 1,
          name: character?.name || entry.character_id,
          rarity: character?.rarity || "",
          image: imageLabel,
        })}`,
        `┃ ${t("gacha_harem_value", { value: value.toLocaleString() })}`,
        "",
      );
    });

    lines.push(
      `┃ ${t("gacha_harem_total", { value: totalValue.toLocaleString() })}`,
      `╰━━━━━━━━━━━━⬣`,
    );

    return ctx.reply(lines.join("\n"));
  },
};
