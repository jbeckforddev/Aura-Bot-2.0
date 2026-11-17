import type { CommandContext } from "../../types/index.d.ts";
import { claimGachaDraw } from "../../database/gachaDB.ts";
import { GACHA_COOLDOWNS } from "../../core/gachaRuntime.ts";
import { getQuotedMessageId } from "../../core/gachaRuntime.ts";
import { t } from "../../src/langs/index.ts";
import { getClaimMessage } from "../../database/gachaMarketDB.ts";
import { getGachaCharacters } from "../../core/gachaRuntime.ts";

export default {
	name: ["claim", "c"],
	category: "gacha",
	cooldown: GACHA_COOLDOWNS.claim,
	description: t("gacha_claim_description"),
	groupOnly: true,

	async run(ctx: CommandContext) {
		const messageId = getQuotedMessageId(ctx.msg);
		if (!messageId) {
			return ctx.reply(
				t("gacha_claim_reply_required", {
					prefix: ctx.usedPrefix || ctx.prefix || ".",
				}),
			);
		}

		const result = claimGachaDraw(ctx.from, messageId, ctx.sender);
		if (result.status === "not_found") {
			return ctx.reply(t("gacha_claim_not_found"));
		}

		if (result.status === "not_drawer") {
			return ctx.reply(t("gacha_claim_only_drawer"));
		}

		if (result.status === "expired") {
			return ctx.reply(t("gacha_claim_expired"));
		}

		if (result.status === "already_owned" && result.owner) {
			const ownerJid = result.owner.user_id;
			return ctx.reply({
				text: t("gacha_claim_already_owned", {
					user: `@${ownerJid.split("@")[0]}`,
				}),
				mentions: [ownerJid],
			});
		}

		if (result.status === "already_resolved") {
			const ownerJid = result.owner?.user_id;
			return ctx.reply(
				ownerJid
					? {
							text: t("gacha_claim_already_resolved_owner", {
								user: `@${ownerJid.split("@")[0]}`,
							}),
							mentions: [ownerJid],
						}
					: t("gacha_claim_already_resolved"),
			);
		}

		const ownerJid = result.owner.user_id;
		const custom = getClaimMessage(ctx.from, ctx.sender);
		const character = getGachaCharacters().find(item => item.id === result.owner.character_id);
		const text = custom
			? custom.replaceAll("{user}", "@" + ownerJid.split("@")[0])
				.replaceAll("{character}", character?.name || result.owner.character_id)
			: t("gacha_claim_success", { user: "@" + ownerJid.split("@")[0] });
		return ctx.reply({ text, mentions: [ownerJid] });
	},
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
