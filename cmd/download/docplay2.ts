import { fytBold } from "../../core/socketText.ts";
import {
  downloadToCache,
  safeFileName,
} from "../../core/downloadUtils.ts";
import {
  prepareDownloadCharge,
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
} from "../../src/api/youtubeSearch.ts";
import { downloadYouTube } from "../../src/api/youtubeDownloader.ts";

const ID =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

export default {
  name: ["dytmp4", "docvideo", "docplayvideo", "docmp4", "dytv", "docplay2"],
  category: "download",
  description: "Descarga videos de YouTube como documento.",
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply("⚠️ Proporciona una búsqueda o enlace de video.");
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
      const title = video.title || "Video de YouTube";
      const file = await downloadToCache(video.dl_url);
      const { cost } = await prepareDownloadCharge(ctx, "document", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "YOUTUBE DOCUMENT",
        icon: "🎬",
        title,
        channel: video.author,
        duration: video.duration,
        views: video.views === undefined ? undefined : String(video.views),
        likes: video.likes === undefined ? undefined : String(video.likes),
        type: "Documento MP4",
        cost: formatMoney(cost, ctx),
        url,
        showChannel: Boolean(video.author),
        showDuration: Boolean(video.duration),
        showViews: video.views !== undefined,
        showLikes: video.likes !== undefined,
        showVideoId: Boolean(video.videoId),
        showSource: true,
        showType: true,
        loadingText: "Descargando documento...",
        loadingIcon: "⏳",
      });
      await reply({ text: caption });
      await reply({
        document: { url: file },
        mimetype: "video/mp4",
        fileName: `${safeFileName(title, "youtube")}.mp4`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `${error instanceof Error ? error.message : "No se pudo descargar el video."}`,
      });
    }
  },
};
