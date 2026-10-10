import { fytBold } from "../../core/socketText.ts";
import {
  downloadToCache,
  safeFileName,
} from "../../core/downloadUtils.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import {
  prepareDownloadCharge,
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
} from "../../src/api/youtubeSearch.ts";
import { downloadYouTube } from "../../src/api/youtubeDownloader.ts";

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
  description: "Descarga audio de YouTube como documento.",
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query)
      return reply("⚠️ Proporciona una búsqueda o enlace de YouTube.");
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
      const audio = await downloadYouTube(url, "audio", 128, searchResult);
      const title = audio.title || "Audio de YouTube";
      const file = await downloadToCache(audio.dl_url);
      const { cost } = await prepareDownloadCharge(ctx, "document", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "YOUTUBE DOCUMENT",
        icon: "🎵",
        title,
        channel: audio.author,
        duration: audio.duration,
        quality: audio.quality,
        views: audio.views === undefined ? undefined : String(audio.views),
        likes: audio.likes === undefined ? undefined : String(audio.likes),
        type: "Documento MP3",
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
        loadingText: "Descargando documento...",
        loadingIcon: "⏳",
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
        document: { url: file },
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
        text: `${message}`,
      });
    }
  },
};
