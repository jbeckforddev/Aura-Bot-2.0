import { rm } from "node:fs/promises";
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
import { CONVERT_TO_AVC } from "../../utils/converter.ts";

const API = "https://api.delirius.online/download/ytmp4";
const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const ql = "480p";
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
    let convertedFile = "";
    try {
      const id = videoId(query);
      const url = id ? `https://youtu.be/${id}` : await searchVideo(query);
      const data = await requestJson<YouTubeVideoData>(
        `${API}?url=${encodeURIComponent(url)}&format=${ql}`,
        60000,
      );
      const video = data?.data;
      const downloadUrl = video?.download || video?.url;
      if (!data?.status || !downloadUrl)
        throw new Error("La API no pudo procesar el video.");
      const title = video.title || data.titulo || "Video de YouTube";
      const channel = video.author || video.channel || data.canal || "YouTube";
      const thumbnail = video.image || data.miniatura;
      const size = video.size || video.tamaño;
      const duration = data.duracion;
      const file = await downloadToCache(downloadUrl);
      convertedFile = await CONVERT_TO_AVC(file);
      const { cost } = await prepareDownloadCharge(ctx, "video", convertedFile);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "YOUTUBE VIDEO",
        icon: "🎬",
        title,
        channel,
        duration,
        size,
        type: `Video MP4${video.format ? ` (${video.format})` : ""}`,
        cost: formatMoney(cost, ctx),
        url,
        showChannel: Boolean(channel),
        showDuration: Boolean(duration),
        showSize: Boolean(size),
        showType: true,
        loadingText: "Enviando video...",
      });
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
        video: { url: convertedFile },
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
    } finally {
      if (convertedFile)
        await rm(convertedFile, { force: true }).catch(() => undefined);
    }
  },
};
