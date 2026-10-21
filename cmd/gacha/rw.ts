import type { CommandContext } from "../../types/index.d.ts";
import { getGachaOwnership, saveGachaDraw } from "../../database/gachaDB.ts";
import { GACHA_COOLDOWNS } from "../../core/gachaRuntime.ts";
import { sendMessageWithRateLimit } from "../../core/mediaSendUtils.ts";
import { fytBold } from "../../core/socketText.ts";
import { t, type TranslationKey } from "../../src/langs/index.ts";
import { drawRandomCharacter, drawRandomImage } from "../../core/gachaRuntime.ts";

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
		let character;
		try {
			character = drawRandomCharacter();
		} catch {
			return ctx.reply(t("gacha_catalog_unavailable"));
		}

		const image = drawRandomImage(character);
		const ownership = getGachaOwnership(ctx.from, character.id, image.id);
		const ownerJid = ownership?.user_id;
		const ownerUser = ownerJid ? ctx.db.getUser(ownerJid) : undefined;
		const ownerLabel = ownerJid
			? ownerUser?.pushName ||
				ownerUser?.username ||
				ownerUser?.name ||
				ownerUser?.phone_number ||
				ownerJid.split("@")[0]
			: "";
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
			`┃ ✦ ${t("gacha_status_label")}: ${ownerJid ? t("gacha_status_claimed_by", { user: ownerLabel }) : t("gacha_status_free")}`,
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
