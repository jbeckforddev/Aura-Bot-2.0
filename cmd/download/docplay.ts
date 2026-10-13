import { fytBold } from "../../core/socketText.ts";
import { safeFileName } from "../../core/downloadUtils.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import {
  prepareDownloadChargeBySize,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import type {
  CommandContext,
} from "../../types/index.d.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import {
  searchYouTubeVideo,
  type YouTubeSearchVideo,
} from "../../src/api/YouTubeSearch.ts";
import { downloadYouTube } from "../../src/api/YouTubeDowloader.ts";
import { t } from "../../src/langs/index.ts";


const YT_ID =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

export default {
  name: [
    "ytdmp3",
    "docplay",
    "docplayaudio",
    "dmp3",
    "dyta",
    "docaudio",
    "playdoc",
  ],
  category: "download",
  description: t("cmd_descarga_audio_de_youtube_como_b5e8c5af"),
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query)
      return reply(t("cmd_proporciona_una_busqueda_o_enl_1c143b9d"));
    await react("⏳");
    try {
      let url = query;
      let searchResult: YouTubeSearchVideo | undefined;
      if (!YT_ID.test(query)) {
        searchResult = await searchYouTubeVideo(query);
        url = searchResult.url;
      } else {
        const videoId = query.match(YT_ID)?.[1];
        if (!videoId) throw new Error("URL de YouTube no válida.");
        url = `https://youtu.be/${videoId}`;
      }
      if (!url) throw new Error("No se encontró ningún video.");
      const audio = await downloadYouTube(url, "audio", 320, searchResult);
      const title = audio.title || "Audio de YouTube";
      const { cost } = prepareDownloadChargeBySize(
        ctx,
        "document",
        audio.size,
      );
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_youtube_document_0d20c17e"),
        icon: t("cmd_text_71ceeba5"),
        title,
        channel: audio.author,
        duration: audio.duration,
        quality: audio.quality,
        views: audio.views === undefined ? undefined : String(audio.views),
        likes: audio.likes === undefined ? undefined : String(audio.likes),
        type: t("cmd_documento_mp3_f18c11dc"),
        cost: formatMoney(cost, ctx),
        url,
        showChannel: Boolean(audio.author),
        showDuration: Boolean(audio.duration),
        showQuality: Boolean(audio.quality),
        showViews: audio.views !== undefined,
        showLikes: audio.likes !== undefined,
        showVideoId: Boolean(audio.videoId),
        showSource: true,
        showType: true,
        loadingText: t("cmd_descargando_documento_2572aa2f"),
        loadingIcon: t("cmd_text_7a2ad7a6"),
      });
      const videoId = audio.videoId || url.match(YT_ID)?.[1];
      const thumbnail = videoId
        ? audio.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        : audio.thumbnail;
      const hasPreview = thumbnail
        ? await sendDownloadPreview({
            sock,
            from,
            msg,
            thumbnail,
            caption,
            link: url,
            title,
            author: globalThis.DEFAULT_BOT_AUTHOR,
            sender,
          })
        : false;
      if (!hasPreview) await reply({ text: caption });
      await reply({
        document: { url: audio.dl_url },
        mimetype: "audio/mpeg",
        fileName: `${safeFileName(title, "youtube")}.mp3`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo descargar el audio.";
      return reply({
        text: t("cmd_value0_bb624cd4", { value0: message }),
      });
    }
  },
};
