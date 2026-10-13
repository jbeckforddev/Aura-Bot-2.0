import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_CONFIG } from "../../config.ts";
import {
  toSticker,
  extractEmojis,
  applyStickerMetadata,
} from "../../core/stickerUtils.ts";
import { request } from "undici";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["emojimix", "ekitchen", "emojikitchen"],
  category: "sticker",
  description: t("cmd_combina_dos_emojis_en_un_stick_f3a2502c"),
  async run({ args, db, sender, msg, react, reply }: CommandContext) {
    const emojis = extractEmojis(args.join(" "));
    if (emojis.length < 2)
      return reply(t("cmd_envia_dos_emojis_ejemplo_emoji_dfd36335"));
    await react("⏳");
    try {
      const url = new URL("tools/emojimix", DL_CONFIG.alya.BASE_URL);
      url.searchParams.set("emoji1", emojis[0]);
      url.searchParams.set("emoji2", emojis[1]);
      url.searchParams.set("key", DL_CONFIG.alya.API_KEY);
      const response = await request(url, {
        signal: AbortSignal.timeout(60000),
      });
      if (response.statusCode < 200 || response.statusCode >= 300)
        throw new Error(`HTTP ${response.statusCode}`);
      const output = await toSticker(
        Buffer.from(await response.body.arrayBuffer()),
        false,
      );
      const finalSticker = await applyStickerMetadata(
        output,
        db,
        sender,
        msg.pushName,
      );
      await react("✅");
      return reply({ sticker: finalSticker, mimetype: "image/webp" });
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_value0_error_al_crear_sticker__fc8ff0d0", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: error instanceof Error ? error.message : String(error) || "No se pudo combinar esos emojis." }),
      });
    }
  },
};
