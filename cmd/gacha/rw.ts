import type { CommandContext } from "../../types/index.d.ts";
import { getGachaClaimedCards, saveGachaDraw } from "../../database/gachaDB.ts";
import { GACHA_COOLDOWNS } from "../../core/gachaRuntime.ts";
import { sendMessageWithRateLimit } from "../../core/mediaSendUtils.ts";
import { fytBold } from "../../core/socketText.ts";
import { t, type TranslationKey } from "../../src/langs/index.ts";
import {
	drawRandomCharacter,
	drawRandomImage,
	getGachaCharacters,
} from "../../core/gachaRuntime.ts";

const RARITY_TRANSLATIONS: Record<string, TranslationKey> = {
	Especial: "gacha_rarity_special",
	"Super especial": "gacha_rarity_super_special",
	Épico: "gacha_rarity_epic",
	Mítico: "gacha_rarity_mythic",
	Legendario: "gacha_rarity_legendary",
};

export default {
	name: ["rw", "randomdraw", "random", "gacha", "rollwaifu"],
	category: "gacha",
	cooldown: GACHA_COOLDOWNS.rw,
	description: t("gacha_rw_description"),
	groupOnly: true,

	async run(ctx: CommandContext) {
		const claimedCards = getGachaClaimedCards(ctx.from);
		const claimedImages = new Map<string, Set<number>>();
		const legacyClaimedCharacters = new Set<string>();
		for (const card of claimedCards) {
			if (card.image_id === null) {
				legacyClaimedCharacters.add(card.character_id);
				continue;
			}
			const imageIds = claimedImages.get(card.character_id) ?? new Set<number>();
			imageIds.add(card.image_id);
			claimedImages.set(card.character_id, imageIds);
		}

		const availableCharacters = getGachaCharacters().flatMap((character) => {
			if (legacyClaimedCharacters.has(character.id)) return [];
			const claimed = claimedImages.get(character.id);
			const images = claimed
				? character.images.filter((image) => !claimed.has(image.id))
				: character.images;
			return images.length > 0 ? [{ ...character, images }] : [];
		});
		if (availableCharacters.length === 0) {
			return ctx.reply(t("gacha_no_unclaimed_cards"));
		}

		let character;
		try {
			character = drawRandomCharacter(availableCharacters);
		} catch {
			return ctx.reply(t("gacha_catalog_unavailable"));
		}

		const image = drawRandomImage(character);
		const rarity = t(RARITY_TRANSLATIONS[character.rarity]);
		const characterType =
			character.type.toLowerCase() === "support"
				? t("gacha_type_support")
				: character.type;
	  const ID = image.id;
		const caption = [
			`╭〔 🎴 ${fytBold(character.name.toUpperCase())}〕━⬣`,
      `┃ ✦ ${t("gacha_id_label")}: ${ID}`,
      `╰━━━━━━━━━━━━⬣\n`,
      `╭━━━━━━━━━━━━⬣`,
			`┃ ✦ ${t("gacha_rarity_label")}: ${rarity}`,
			`┃ ✦ ${t("gacha_type_label")}: ${characterType}`,
			...(character.source
				? [`┃ ✦ ${t("gacha_source_label")}: ${character.source}`]
				: []),
			`┃ ✦ ${t("gacha_value_label")}: ${character.value}`,
			`┃ ✦ ${t("gacha_status_label")}: ${t("gacha_status_free")}`,
			`╰━━━━━━━━━━━━⬣`,
		].join("\n");

		const sentMessage = await sendMessageWithRateLimit(
      ctx.sock, ctx.from,
      { image: { url: image.url }, caption },
      { quoted: ctx.msg as import("baileys").WAMessage });

		const messageId = sentMessage?.key?.id;
		if (!messageId) {
			return ctx.reply(t("gacha_rw_save_failed"));
		}

		saveGachaDraw(ctx.from, messageId, ctx.sender, character.id, image.id);
	},
};
