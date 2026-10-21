import type { WAMessage } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} from "baileys";
import { fytBold } from "../../core/socketText.ts";
import { createLinkPreviewWithoutChannel } from "../../core/LinkPreview.ts";
import { SEARCH_RESULTS_TEMPLATE } from "../../utils/template.ts";
import { searchYouTubeVideos } from "../../src/api/YouTubeSearch.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["ytsearch", "yts", "plays"],
  category: "search",
  description: t("cmd_busca_videos_en_youtube_25e3a1f2"),
  async run({ args, reply, react, sock, from, msg, sender }: CommandContext) {
    const query = args.join(" ").trim();
    if (!query) return reply(t("cmd_debes_especificar_que_buscar_4a8954a4"));
    await react("🔍");
    try {
      const searchResults = await searchYouTubeVideos(query);
      const videos = searchResults.slice(0, 5);
      if (!videos.length) throw new Error("No se encontraron resultados.");
      const text = SEARCH_RESULTS_TEMPLATE({
        bold: fytBold,
        label: "YOUTUBE SEARCH",
        icon: "🎬",
        query,
        engine: videos[0].winner,
        results: videos.map((video) => ({
          title: video.title,
          artist: video.author || "Desconocido",
          duration: video.duration || "N/A",
          likes:
            video.likes === undefined ? "No disponible" : String(video.likes),
          url: video.url,
        })),
      });
      let preparedMedia: { imageMessage?: unknown } = {};
      if (videos[0].thumbnail) {
        try {
          preparedMedia = await prepareWAMessageMedia(
            { image: { url: videos[0].thumbnail } },
            {
              upload: sock.waUploadToServer,
              mediaTypeOverride: "thumbnail-link",
            },
          );
        } catch {
          // Si falla la miniatura, se ignora la imagen en la vista previa
        }
      }
      const preview = createLinkPreviewWithoutChannel({
        textOriginal: text,
        link: videos[0].url,
        author: videos[0].author || "YouTube",
        title: videos[0].title,
        banner: preparedMedia.imageMessage as import("baileys").proto.Message.IImageMessage,
        mentionedJid: sender ? [sender] : [],
        isForwarded: false,
        forwardingScore: 0,
      });
      const previewMessage = generateWAMessageFromContent(from, preview, {
        quoted: msg as unknown as WAMessage,
        userJid: sock.user?.id,
      });
      await sock.relayMessage(from, previewMessage.message, {
        messageId: previewMessage.key.id,
      });
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_error_value0_a4bb764e", { value0: error instanceof Error ? error.message : String(error) || "No se pudo buscar en YouTube." }),
      });
    }
  },
};
