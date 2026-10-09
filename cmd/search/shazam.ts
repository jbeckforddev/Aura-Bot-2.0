import type { CommandContext } from "../../types/index.d.ts";
import { downloadMediaMessage, type proto } from "@whiskeysockets/baileys";
import { identifySong } from "../../utils/shazamScraper.js";
import { fytBold } from "../../core/socketText.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";

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
  description: "Identifica una canción desde un audio o video citado.",
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const quoted = context?.quotedMessage;
    const target = unwrap(quoted) ?? unwrap(ctx.msg?.message);
    if (!target)
      return ctx.reply(
        `❗ Responde a un audio/video con ${ctx.usedPrefix ?? "."}shazam.`,
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
      let text = `╭〔 🔍 ${fytBold("SHAZAM RESULT")} 〕━⬣\n\n┃ ➥ ${track.title || "Desconocido"}\n\n┣━━━━━━━━━━━━⬣\n┃ > ${fytBold("Artista")} › ${track.artist || "Desconocido"}\n┃ > ${fytBold("Álbum")} › ${track.album || "Desconocido"}\n┃ > ${fytBold("Género")} › ${track.genre || "Desconocido"}\n┃ > ${fytBold("Fecha")} › ${track.releaseDate || "Desconocida"}\n┃ > ${fytBold("Sello")} › ${track.label || "Desconocida"}\n\n╰━━〔 ⚡ ${fytBold("SYSTEM ACTIVE")} 〕━━⬣`;
      const title = track.title || "Canción identificada";
      const link =
        track.url ||
        `https://www.google.com/search?q=${encodeURIComponent(`${title} ${track.artist || ""}`)}`;
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
        text: `❌ Error al identificar: ${error instanceof Error ? error.message : String(error) || "Sin coincidencias."}`,
      });
    }
  },
};
