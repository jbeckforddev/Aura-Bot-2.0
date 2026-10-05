import { fytBold } from "../../core/socketText.ts";
import {
  downloadToCache,
  requestJson,
  safeFileName,
} from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import type {
  CommandContext,
  YouTubeMp3Response,
} from "../../types/index.d.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { searchYouTubeVideo } from "../../core/youtubeSearch.ts";

const API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
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
      if (!YT_ID.test(query)) {
        url = (await searchYouTubeVideo(query)).url;
      } else {
        const videoId = query.match(YT_ID)?.[1];
        if (!videoId) throw new Error("URL de YouTube no válida.");
        url = `https://youtu.be/${videoId}`;
      }
      if (!url) throw new Error("No se encontró ningún video.");
      const data = await requestJson<YouTubeMp3Response>(
        `${API}/dl/ytmp3v2?url=${encodeURIComponent(url)}&key=${DL_CONFIG.alya.API_KEY}`,
      );
      const info = data?.data;
      const downloadUrl = info?.dl;
      if (!data?.status || !info || !downloadUrl)
        throw new Error("No se pudo obtener el audio.");
      const title = info.title || "Audio de YouTube";
      const file = await downloadToCache(downloadUrl);
      const { cost } = await prepareDownloadCharge(ctx, "document", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "YOUTUBE DOCUMENT",
        icon: "🎵",
        title,
        channel: info.author,
        duration: info.duration,
        quality: info.quality,
        type: "Documento MP3",
        cost: formatMoney(cost, ctx),
        url,
        showChannel: Boolean(info.author),
        showDuration: Boolean(info.duration),
        showQuality: Boolean(info.quality),
        showType: true,
        loadingText: "Descargando documento...",
        loadingIcon: "⏳",
      });
      const videoId = url.match(YT_ID)?.[1];
      const thumbnail = videoId
        ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        : "";
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
