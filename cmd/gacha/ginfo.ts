import type { CommandContext } from "../../types/index.d.ts";
import {
	getGachaHarem,
	getLastGachaClaimAt,
	getLastGachaDrawAt,
} from "../../database/gachaDB.ts";
import { GACHA_COOLDOWNS } from "../../core/gachaRuntime.ts";
import { cooldownText } from "../../core/economyConfig.ts";
import { getGachaCatalogStats } from "../../core/gachaRuntime.ts";
import { fytBold } from "../../core/socketText.ts";
import { GachaCharacters } from "../../src/GachaCharacters/index.ts";
import { formatDuration } from "../../utils/formatter.ts";
import { t } from "../../src/langs/index.ts";

export default {
	name: ["ginfo", "gachainfo"],
	category: "gacha",
	description: t("gacha_info_intro"),

	async run(ctx: CommandContext) {
		const prefix = ctx.usedPrefix ?? ".";
		const collection = getGachaHarem(ctx.from, ctx.sender);
		const collectionValue = collection.reduce((total, entry) => total + Number(GachaCharacters[entry.character_id]?.value || 0),0,);
		const catalog = getGachaCatalogStats();

		const lastDrawAt = getLastGachaDrawAt(ctx.from, ctx.sender);
		const lastClaimAt = getLastGachaClaimAt(ctx.from, ctx.sender);

		const remaining = lastDrawAt
			? GACHA_COOLDOWNS.rw - (Date.now() - lastDrawAt)
			: 0;

		const claimRemaining = lastClaimAt ? GACHA_COOLDOWNS.claim - (Date.now() - lastClaimAt) : 0;
		const CLAIM_COOLDOWN = claimRemaining > 0 ? `⏳ _${formatDuration(Math.ceil(claimRemaining / 1000)) || cooldownText(claimRemaining)}_` : t("economyAvailable");
		const RW_COOLDOWN = remaining > 0 ? `⏳ _${formatDuration(Math.ceil(remaining / 1000)) || cooldownText(remaining)}_` : t("economyAvailable");

		const text = [
			`╭〔 🎴 ${fytBold(t("gacha_info_system"))} 〕⬣`,
			`┃ ℹ️ ${fytBold(t("gacha_info_section"))}`,
			"╰━━━━━━━━━━━━⬣",
			"",
			`┃ ${t("gacha_info_intro")}`,
			"",
			`┣━━〔 ⏳ ${fytBold(t("gacha_info_cooldown_section"))} 〕━━⬣`,
			`┃ ➪ *${prefix}rw:* ${RW_COOLDOWN}`,
			`┃ ➪ *${prefix}claim:* ${CLAIM_COOLDOWN}`,
			"",
			`┣━━〔 👑 ${fytBold(t("gacha_info_collection_section"))} 〕━━⬣`,
			`┃ ${t("gacha_info_claimed", { count: collection.length.toLocaleString() })}`,
			`┃ ${t("gacha_harem_total", { value: collectionValue.toLocaleString() })}`,
			"",
			`┣━━〔 📚 ${fytBold(t("gacha_info_catalog_section"))} 〕━━⬣`,
			`┃ ${t("gacha_info_characters", { count: catalog.characters.toLocaleString() })}`,
			`┃ ${t("gacha_info_series", { count: catalog.series.toLocaleString() })}`,
			`╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
		].join("\n");

		return ctx.reply({ text });
	},
};
