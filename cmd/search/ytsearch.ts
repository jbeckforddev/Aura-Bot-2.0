import type { WAMessage } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import yts from "yt-search";
import { readFile } from "node:fs/promises";
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} from "@whiskeysockets/baileys";
import { fytBold } from "../../core/socketText.ts";
import { downloadToCache, formatCount } from "../../core/downloadUtils.ts";
import { createLinkPreviewWithoutChannel } from "../../core/LinkPreview.ts";
import { SEARCH_RESULTS_TEMPLATE } from "../../utils/template.ts";

export default {
  name: ["ytsearch", "yts", "plays"],
  category: "search",
  description: "Busca videos en YouTube.",
  async run({ args, reply, react, sock, from, msg, sender }: CommandContext) {
    const query = args.join(" ").trim();
    if (!query) return reply("⚠️ Debes especificar qué buscar.");
    await react("🔍");
    try {
      const result = await yts(query);
      const videos = result.videos.slice(0, 5);
      if (!videos.length) throw new Error("No se encontraron resultados.");
      const text = SEARCH_RESULTS_TEMPLATE({
        bold: fytBold,
        label: "YOUTUBE SEARCH",
        icon: "🎬",
        query,
        engine: "yt-search",
        results: videos.map((video) => ({
          title: video.title,
          artist: video.author?.name || "Desconocido",
          duration: video.timestamp || "N/A",
          url: video.url,
        })),
      });
      const thumbnailBuffer = await readFile(
        await downloadToCache(videos[0].thumbnail, 30000),
      );
      const prepared = await prepareWAMessageMedia(
        { image: thumbnailBuffer },
        {
          upload: sock.waUploadToServer,
          mediaTypeOverride: "thumbnail-link",
        },
      );
      const preview = createLinkPreviewWithoutChannel({
        textOriginal: text,
        link: videos[0].url,
        author: videos[0].author?.name || "YouTube",
        title: videos[0].title,
        banner: prepared.imageMessage,
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
        text: `❌ Error: ${error instanceof Error ? error.message : String(error) || "No se pudo buscar en YouTube."}`,
      });
    }
  },
};
