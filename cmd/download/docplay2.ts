import { fytBold } from "../../core/socketText.ts";
import { safeFileName } from "../../core/downloadUtils.ts";
import {
  prepareDownloadChargeBySize,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import type {
  CommandContext,
} from "../../types/index";
import { DL_TEMPLATE } from "../../utils/template.ts";
import {
  searchYouTubeVideo,
  type YouTubeSearchVideo,
} from "../../src/api/YouTubeSearch.ts";
import { downloadYouTube } from "../../src/api/YouTubeDowloader.ts";
import { t } from "../../src/langs/index.ts";
import { CONVERT_TO_AVC } from "../../utils/converter.ts";


const ID =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

export default {
  name: ["dytmp4", "docvideo", "docplayvideo", "docmp4", "dytv", "docplay2"],
  category: "download",
  description: t("cmd_descarga_videos_de_youtube_com_6943316c"),
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply(t("cmd_proporciona_una_busqueda_o_enl_08141711"));
    await react("⏳");
    try {
      let url = query;
      let searchResult: YouTubeSearchVideo | undefined;
      if (!ID.test(query)) {
        searchResult = await searchYouTubeVideo(query);
        url = searchResult.url;
      } else url = `https://youtu.be/${query.match(ID)?.[1]}`;
      if (!url) throw new Error("No se encontró ningún video.");
      const video = await downloadYouTube(url, "video", 1080, searchResult);
      const VIDEO_READY = await CONVERT_TO_AVC(video.dl_url);
      const title = video.title || "Video de YouTube";
      const { cost } = prepareDownloadChargeBySize(
        ctx,
        "document",
        video.size,
      );
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_youtube_document_0d20c17e"),
        icon: t("cmd_text_2b02d8d7"),
        title,
        channel: video.author,
        duration: video.duration,
        views: video.views === undefined ? undefined : String(video.views),
        likes: video.likes === undefined ? undefined : String(video.likes),
        type: t("cmd_documento_mp4_2386c56a"),
        cost: formatMoney(cost, ctx),
        url,
        showChannel: Boolean(video.author),
        showDuration: Boolean(video.duration),
        showViews: video.views !== undefined,
        showLikes: video.likes !== undefined,
        showVideoId: Boolean(video.videoId),
        showSource: true,
        showType: true,
        loadingText: t("cmd_descargando_documento_2572aa2f"),
        loadingIcon: t("cmd_text_7a2ad7a6"),
      });
      await reply({ text: caption });
      await reply({
        document: { url: VIDEO_READY },
        mimetype: "video/mp4",
        fileName: `${safeFileName(title, "youtube")}.mp4`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_value0_bb624cd4", { value0: error instanceof Error ? error.message : "No se pudo descargar el video." }),
      });
    }
  },
};
