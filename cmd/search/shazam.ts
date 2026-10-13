import type { CommandContext } from "../../types/index.d.ts";
import { downloadMediaMessage, type proto } from "@whiskeysockets/baileys";
import { identifySong } from "../../src/api/shazamScraper.js";
import { fytBold } from "../../core/socketText.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import { t } from "../../src/langs/index.ts";


function unwrap(
  message: proto.IMessage | null | undefined,
): proto.IMessage | null {
  if (!message) return null;
  if (message.audioMessage || message.videoMessage || message.documentMessage)
    return message;
  if (message.viewOnceMessageV2?.message)
    return unwrap(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage?.message)
    return unwrap(message.viewOnceMessage.message);
  return null;
}

export default {
  name: ["shazam", "whatsong", "findsong", "find"],
  category: "search",
  description: t("cmd_identifica_una_cancion_desde_u_3a6a4a38"),
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const quoted = context?.quotedMessage;
    const target = unwrap(quoted) ?? unwrap(ctx.msg?.message);
    if (!target)
      return ctx.reply(
        t("cmd_responde_a_un_audio_video_con__ae487fb8", { value0: ctx.usedPrefix ?? "." }),
      );
    await ctx.react("⏳");
    try {
      const mediaKey =
        (quoted && (context?.stanzaId || ctx.msg?.key?.id)
          ? { ...ctx.msg.key, id: context.stanzaId || ctx.msg.key.id }
          : ctx.msg.key) || ctx.msg.key;
      const buffer = await downloadMediaMessage(
        {
          key: mediaKey,
          message: target,
        } as import("@whiskeysockets/baileys").WAMessage,
        "buffer",
        {},
        {
          logger: console as unknown as Parameters<
            typeof downloadMediaMessage
          >[3]["logger"],
          reuploadRequest: ctx.sock.updateMediaMessage,
        },
      );
      const track = await identifySong(buffer);
      let text = t("cmd_value0_value1_value2_value3_va_3cf13772", { value0: fytBold(t("cmd_shazam_result_bc8b9ab8")), value1: track.title || "Desconocido", value2: fytBold(t("cmd_artista_745d1fb2")), value3: track.artist || "Desconocido", value4: fytBold(t("cmd_album_2c64db89")), value5: track.album || "Desconocido", value6: fytBold(t("cmd_genero_71354153")), value7: track.genre || "Desconocido", value8: fytBold(t("cmd_fecha_bcc47609")), value9: track.releaseDate || "Desconocida", value10: fytBold(t("cmd_sello_27991800")), value11: track.label || "Desconocida", value12: fytBold(t("cmd_system_active_e403484a")) });
      const title = track.title || "Canción identificada";
      const link = `https://www.google.com/search?q=${encodeURIComponent(`${title} ${track.artist || ""}`)}`;
      const hasPreview = track.coverArt
        ? await sendDownloadPreview({
            sock: ctx.sock,
            from: ctx.from,
            msg: ctx.msg,
            thumbnail: track.coverArt,
            caption: text,
            link,
            title,
            author: track.artist || "Shazam",
            sender: ctx.sender,
          })
        : false;
      if (!hasPreview) await ctx.reply({ text });
      await ctx.react("✅");
    } catch (error: unknown) {
      await ctx.react("❌");
      return ctx.reply({
        text: t("cmd_error_al_identificar_value0_c42a943c", { value0: error instanceof Error ? error.message : String(error) || "Sin coincidencias." }),
      });
    }
  },
};
