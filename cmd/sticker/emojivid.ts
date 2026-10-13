import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_CONFIG } from "../../config.ts";
import { readFile } from "node:fs/promises";
import { downloadToCache } from "../../core/downloadUtils.ts";
import {
  extractEmojis,
  isWebp,
  toSticker,
  applyStickerMetadata,
} from "../../core/stickerUtils.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["emojivid", "emoji", "emoji-video", "emojivideo"],
  category: "sticker",
  description: t("cmd_genera_un_sticker_animado_a_pa_85cea90e"),
  async run({
    args,
    db,
    sender,
    msg,
    usedPrefix,
    react,
    reply,
  }: CommandContext) {
    const emoji = extractEmojis(args.join(" ").trim())[0];
    if (!emoji)
      return reply(t("cmd_envia_un_emoji_ejemplo_value0__8f6b4dcf", { value0: usedPrefix }));
    await react("⏳");
    try {
      const url = `${DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "")}/whatsapp/emoji?emoji=${encodeURIComponent(emoji)}&key=${DL_CONFIG.alya.API_KEY}`;
      const raw = await readFile(await downloadToCache(url));
      const output = isWebp(raw) ? raw : await toSticker(raw, true, 10);
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
        text: t("cmd_value0_error_al_crear_sticker__fc8ff0d0", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: error instanceof Error ? error.message : String(error) || "Intenta nuevamente." }),
      });
    }
  },
};
