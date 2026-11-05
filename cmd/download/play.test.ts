import yts from "../../src/api/YouTubeSearch.test.ts";
import dl from "../../src/api/YouTubeDL.test.ts";
import type { CommandContext, } from "../../types/index";
import { generateWAMessageFromContent, prepareWAMessageMedia, type WAMessage, } from "baileys";
import { createLinkPreviewWithoutChannel } from "../../core/LinkPreview.ts";
import { t } from "../../src/langs/index.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";

export default {
  name: ["playtest", "ytdltest"],
  description: t("cmd_busca_y_descarga_audio_de_yout_04475ecb"),
  hideCmd: true,

  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply(t("cmd_escribe_el_nombre_de_una_canci_7d229544"));
    await react("🎵")
    try {
      const sendYouTubePreview = async (text: string, metadata: Awaited<ReturnType<typeof dl>>) => {
        const thumbnail = metadata.data?.thumbnail;
        if (!thumbnail || !/^https?:\/\//i.test(thumbnail)) return reply({ text });

        const prepared = await prepareWAMessageMedia(
          { image: { url: thumbnail } },
          { upload: sock.waUploadToServer, mediaTypeOverride: "thumbnail-link", },
        );
        if (!prepared.imageMessage) return reply({ text });

        const preview = createLinkPreviewWithoutChannel({
          textOriginal: text,
          link: metadata.data.url,
          author: metadata.data.channel,
          title: metadata.data.title,
          banner: prepared.imageMessage,
          mentionedJid: [sender],
          isForwarded: false,
          forwardingScore: 0,
        });
        const previewMessage = generateWAMessageFromContent(from, preview, {
          quoted: msg as unknown as WAMessage,
          userJid: sock.user?.id || from,
        });

        if (previewMessage.message) {
          await sock.relayMessage(from, previewMessage.message, {
            messageId: previewMessage.key.id || undefined,
          });
        } else {
          await reply({ text });
        }
      };
      const buildYouTubeText = (metadata: Awaited<ReturnType<typeof dl>>) =>
        DL_TEMPLATE({
          bold: fytBold,
          label: t("cmd_youtube_play_507c8deb"),
          icon: t("cmd_text_71ceeba5"),
          title: metadata.data?.title || t("cmd_desconocido_452c8a12"),
          channel: metadata.data?.channel || t("cmd_desconocido_452c8a12"),
          duration: metadata.data?.duration || t("cmd_n_a_08d2e98e"),
          views: metadata.data?.views || t("cmd_n_a_08d2e98e"),
          likes: metadata.data?.likes || t("cmd_n_a_08d2e98e"),
          url: metadata.data?.url || t("cmd_n_a_08d2e98e"),
          showChannel: true,
          showDuration: true,
          showViews: true,
          showLikes: true,
          showUrl: true,
          showCost: false,
          loadingText: t("cmd_descargando_audio_b1e6524a"),
          loadingIcon: t("cmd_text_7a2ad7a6"),
        });

      if (query.startsWith("https://")) {
        const metadata = await dl(query);
        const audioUrl = metadata.data?.dl_url;

        if (!metadata.status || !audioUrl) {
          throw new Error(metadata.message || t("cmd_error_de_descarga_3b9d228e"));
        }

        await sendYouTubePreview(buildYouTubeText(metadata), metadata);
        await reply({
          audio: { url: audioUrl },
          title: metadata.data?.title || t("cmd_audio_mp3_45a98371"),
          mimetype: "audio/mpeg",
          ptt: false,
        });

      } else {
        const searchResults = await yts(query, 1);
        if (searchResults.status !== "success" || searchResults.results.length === 0) {
          return reply(t("cmd_sin_resultados_aafe1c07"));
        }

        const video = searchResults.results[0];
        const metadata = await dl(video.url);
        const audioUrl = metadata.data?.dl_url;
        if (!metadata.status || !audioUrl) {
          throw new Error(metadata.message || t("cmd_error_de_descarga_3b9d228e"));
        }

        await sendYouTubePreview(buildYouTubeText(metadata), metadata);
        await reply({
          audio: { url: audioUrl },
          title: metadata.data?.title || t("cmd_audio_mp3_45a98371"),
          mimetype: "audio/mpeg",
          ptt: false
        });

      }
      await react("✅");
    } catch (error) {
      return reply(t("commandError", {
        cmdName: "ytatest",
        errorDetails: error instanceof Error ? error.message : String(error),
      }));
    }
  }
}