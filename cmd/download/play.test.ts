import yts from "../../src/api/YouTubeSearch.test.ts";
import dl from "../../src/api/YouTubeDL.test.ts";
import type { CommandContext } from "../../types/index";
import { generateWAMessageFromContent, prepareWAMessageMedia, type WAMessage } from "baileys";
import { createLinkPreviewWithoutChannel } from "../../core/LinkPreview.ts";
import { t } from "../../src/langs/index.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";

const MAX_TEXT = 60000; // límite seguro de WhatsApp por mensaje

export default {
  name: ["playtest", "ytdltest"],
  description: t("cmd_busca_y_descarga_audio_de_yout_04475ecb"),
  hideCmd: true,

  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;

    // Detecta --json en cualquier posición y lo quita de la búsqueda
    const jsonMode = args.some((a) => a.toLowerCase() === "--json");
    const query = args
      .filter((a) => a.toLowerCase() !== "--json")
      .join(" ")
      .trim();

    if (!query) return reply(t("cmd_escribe_el_nombre_de_una_canci_7d229544"));
    await react("🎵");

    try {
      /* ---------- MODO JSON ---------- */
      if (jsonMode) {
        let searchJson: unknown = null;
        let videoUrl = query;

        // Si es link, no hay búsqueda; solo se prueba la API de descarga
        if (!query.startsWith("https://")) {
          const searchResults = await yts(query, 1);
          searchJson = searchResults;
          if (searchResults.status !== "success" || !searchResults.results.length) {
            await reply(
              "```json\n" + JSON.stringify({ yts: searchJson }, null, 2) + "\n```",
            );
            return react("❌");
          }
          videoUrl = searchResults.results[0].url;
        }

        const dlJson = await dl(videoUrl);

        const output = JSON.stringify(
          { yts: searchJson, dl: dlJson },
          null,
          2,
        );

        // Si es muy largo, se manda como archivo .json
        if (output.length > MAX_TEXT) {
          await sock.sendMessage(
            from,
            {
              document: Buffer.from(output),
              mimetype: "application/json",
              fileName: "playtest.json",
            },
            { quoted: msg as unknown as WAMessage },
          );
        } else {
          await reply("```json\n" + output + "\n```");
        }
        return react("✅");
      }

      /* ---------- MODO NORMAL ---------- */
      const sendYouTubePreview = async (text: string, metadata: Awaited<ReturnType<typeof dl>>) => {
        const thumbnail = metadata.data?.thumbnail;
        if (!thumbnail || !/^https?:\/\//i.test(thumbnail)) return reply({ text });

        const prepared = await prepareWAMessageMedia(
          { image: { url: thumbnail } },
          { upload: sock.waUploadToServer, mediaTypeOverride: "thumbnail-link" },
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

      // Unifica link directo y búsqueda: solo cambia de dónde sale la URL
      let videoUrl = query;
      if (!query.startsWith("https://")) {
        const searchResults = await yts(query, 1);
        if (searchResults.status !== "success") {
          if (searchResults.statusCode === 404) return reply(t("cmd_sin_resultados_aafe1c07"));
          throw new Error(searchResults.error);
        }
        if (searchResults.results.length === 0) {
          return reply(t("cmd_sin_resultados_aafe1c07"));
        }
        videoUrl = searchResults.results[0].url;
      }

      const metadata = await dl(videoUrl);
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

      await react("✅");
    } catch (error) {
      await react("❌");
      return reply(
        t("commandError", {
          cmdName: "playtest",
          errorDetails: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  },
};