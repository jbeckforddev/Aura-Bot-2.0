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
  YouTubeVideoData,
  YouTubeSearchResponse,
} from "../../types/index.d.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";

const API = "https://api.lempi.lat";
const KEY = "OBOE-AERETHIX";
const YOUTUBE_ID =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

function videoId(value: string): string | null {
  return value.match(YOUTUBE_ID)?.[1] || null;
}

async function searchVideo(query: string): Promise<string> {
  const data = await requestJson<YouTubeSearchResponse>(
    `${DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "")}/search/yt?query=${encodeURIComponent(query)}&key=${DL_CONFIG.alya.API_KEY}`,
  );
  if (!data?.status || !data.result?.[0]?.url)
    throw new Error("No se encontró ningún video.");
  return data.result[0].url as string;
}

export default {
  name: ["ytmp4", "video", "playvideo", "mp4", "ytv", "play2"],
  category: "download",
  description: "Busca y descarga video de YouTube.",
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply("⚠️ Proporciona el nombre o enlace de un video.");
    await react("⏳");
    try {
      const id = videoId(query);
      const url = id ? `https://youtu.be/${id}` : await searchVideo(query);
      const data = await requestJson<YouTubeVideoData>(
        `${API}/dl/ytv?url=${encodeURIComponent(url)}&quality=1080&apikey=${KEY}`,
        60000,
      );
      if (!data?.status || !data?.datos?.url)
        throw new Error("La API no pudo procesar el video.");
      const title = data.titulo || "Video de YouTube";
      const file = await downloadToCache(data.datos.url);
      const { cost } = await prepareDownloadCharge(ctx, "video", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "YOUTUBE VIDEO",
        icon: "🎬",
        title,
        channel: data.canal || "YouTube",
        duration: data.duracion,
        size: data.datos.tamaño,
        type: "Video MP4",
        cost: formatMoney(cost, ctx),
        url,
        showChannel: Boolean(data.canal),
        showDuration: Boolean(data.duracion),
        showSize: Boolean(data.datos.tamaño),
        showType: true,
        loadingText: "Enviando video...",
      });
      const hasPreview = data.miniatura
        ? await sendDownloadPreview({
            sock,
            from,
            msg,
            thumbnail: data.miniatura,
            caption,
            link: url,
            title,
            author: globalThis.DEFAULT_BOT_AUTHOR,
            sender,
          })
        : false;
      if (!hasPreview) await reply({ text: caption });
      await reply({
        video: { url: file },
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
