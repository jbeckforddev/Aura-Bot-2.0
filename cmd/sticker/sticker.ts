import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import {
  downloadTargetMedia,
  applyStickerMetadata,
  isWebp,
  unwrapMediaMessage,
  toStickerWithEffects,
  parseStickerArguments,
  generateStickerHelp,
} from "../../core/stickerUtils.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["s", "sticker", "stiker"],
  category: "sticker",
  description:
    t("cmd_convierte_imagenes_videos_o_gi_a9b6b829"),
  async run({
    sock,
    msg,
    from,
    sender,
    db,
    usedPrefix,
    react,
    reply,
    args,
    cmdName,
  }: CommandContext) {
    // Ayuda
    if (args[0] === "-list" || args[0] === "-help" || args[0] === "-ayuda") {
      return reply({ text: generateStickerHelp(usedPrefix) });
    }

    const context = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = context?.quotedMessage;
    const target = quoted
      ? unwrapMediaMessage(quoted)
      : unwrapMediaMessage(msg.message);

    if (!target) {
      return reply({
        text: t("cmd_value0_value1_envia_una_imagen_e13e0557", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_medio_206ad831")), value2: usedPrefix, value3: usedPrefix, value4: usedPrefix, value5: cmdName, value6: fytBold(t("cmd_system_29d43743")) }),
      });
    }

    await react("⏳");
    try {
      const input = await downloadTargetMedia(sock, msg, quoted, from);
      const animated = Boolean(target.videoMessage);
      const effects = parseStickerArguments(args);

      const output =
        isWebp(input) && !animated
          ? input
          : await toStickerWithEffects(input, animated, effects);
      const finalSticker = await applyStickerMetadata(
        output,
        db,
        sender,
        msg.pushName || "Aura Reed",
      );

      await react("✅");
      return reply({ sticker: finalSticker, mimetype: "image/webp" });
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_value0_value1_value2_value3_569f9d3d", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_error_al_crear_sticker_39fde6af")), value2: error instanceof Error ? error.message : String(error) || "No se pudo procesar el medio.", value3: fytBold(t("cmd_system_29d43743")) }),
      });
    }
  },
};
