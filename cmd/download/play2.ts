import { rm } from "node:fs/promises";
import { fytBold } from "../../core/socketText.ts";
import {
  downloadToCache,
  requestJson,
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
  YouTubeVideoData,
} from "../../types/index.d.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { CONVERT_TO_AVC } from "../../utils/converter.ts";
import { searchYouTubeVideo } from "../../core/youtubeSearch.ts";

const API = "https://api.delirius.online/download/ytmp4";
const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const ql = "360p";
const MAX_VIDEO_DURATION_SECONDS = 20 * 60;

function videoId(value: string): string | null {
  return value.match(YOUTUBE_ID)?.[1] || null;
}

function parseDurationToSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) return Number(text);

  const isoMatch = text.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i,
  );
  if (isoMatch && /[hms]/i.test(text)) {
    const days = Number(isoMatch[1] || 0);
    const hours = Number(isoMatch[2] || 0);
    const minutes = Number(isoMatch[3] || 0);
    const seconds = Number(isoMatch[4] || 0);
    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }

  const colonMatch = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const hours = Number(colonMatch[1] || 0);
    const minutes = Number(colonMatch[2]);
    const seconds = Number(colonMatch[3]);
    return hours * 3600 + minutes * 60 + seconds;
  }

  const mmssMatch = text.match(/^(\d{1,2}):(\d{2})$/);
  if (mmssMatch) {
    return Number(mmssMatch[1]) * 60 + Number(mmssMatch[2]);
  }

  return null;
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
      const url = id
        ? `https://youtu.be/${id}`
        : (await searchYouTubeVideo(query)).url;
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
      const durationValue =
        data.duracion || data.duration || (typeof video?.duration === "string" ? video.duration : undefined);
      const duration = String(durationValue || "");
      const durationSeconds = parseDurationToSeconds(duration);

      if (typeof durationSeconds === "number" && durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
        throw new Error(
          `El video excede la duración máxima permitida (20 minutos).`,
        );
      }

      const file = await downloadToCache(downloadUrl, 20 * 60 * 1000);
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
        loadingIcon: "⏳",
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
      const message =
        error instanceof Error ? error.message : "No se pudo descargar el video.";
      return reply({
        text: `${message}\n\nMáximo permitido: 20 minutos de duración para YouTube video normal.`,
      });
    } finally {
      if (convertedFile)
        await rm(convertedFile, { force: true }).catch(() => undefined);
    }
  },
};
