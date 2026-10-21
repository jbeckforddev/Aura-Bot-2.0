import type { CommandContext } from "../../types/index.d.ts";
import type { WAMessage } from "baileys";
import undici from "undici";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { formatCount, formatDuration } from "../../utils/formatter.ts";
import {
  confirmDownloadCharge,
  formatMoney,
  prepareDownloadChargeBySize,
} from "../../core/economyConfig.ts";
import { t } from "../../src/langs/index.ts";

const FRAME_ORIGIN = "https://frame.y2meta-uk.com";
const API_BASE = "https://cnv.cx/v2";
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const YOUTUBE_ID = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/i;

interface YouTubeVideoRenderer {
  videoId?: string;
  title?: { runs?: Array<{ text?: string }> };
  ownerText?: { runs?: Array<{ text?: string }> };
  lengthText?: { simpleText?: string };
  viewCountText?: { simpleText?: string };
}

interface YouTubeInitialData {
  contents?: {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: {
        sectionListRenderer?: {
          contents?: Array<{
            itemSectionRenderer?: {
              contents?: Array<{ videoRenderer?: YouTubeVideoRenderer }>;
            };
          }>;
        };
      };
    };
  };
}

interface VideoInfo {
  id: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  likes?: string;
  url: string;
  thumbnail: string;
}

interface ConverterResponse {
  key?: unknown;
  url?: unknown;
  filename?: unknown;
}

function formatYouTubeCount(value: string | undefined): string {
  if (!value) return "";

  const match = value.match(
    /([\d.,]+)\s*(mil|mill(?:ón|ones)?|[KMBT])?/i,
  );
  if (!match) return value;

  const rawCount = match[1];
  const suffix = match[2]?.toLowerCase();
  if (!suffix) return formatCount(rawCount.replace(/[,.]/g, ""));

  const count = Number(
    rawCount.includes(".")
      ? rawCount.replace(/,/g, "")
      : rawCount.replace(",", "."),
  );
  if (!Number.isFinite(count)) return value;

  const multiplier =
    suffix === "mil" || suffix === "k"
      ? 1e3
      : suffix.startsWith("mill") || suffix === "m"
        ? 1e6
        : suffix === "b"
          ? 1e9
          : 1e12;
  return formatCount(count * multiplier);
}

async function obtenerKey(videoId: string): Promise<string> {
  const response = await undici.fetch(
    `${API_BASE}/sanity/key?id=${encodeURIComponent(videoId)}`,
    {
      headers: {
        Origin: FRAME_ORIGIN,
        Referer: `${FRAME_ORIGIN}/`,
        Accept: "*/*",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`sanity/key respondió ${response.status}`);
  }

  const data = (await response.json()) as ConverterResponse;
  if (typeof data.key !== "string" || !data.key) {
    throw new Error("sanity/key no devolvió key");
  }
  return data.key;
}

async function obtenerAudio(
  videoId: string,
): Promise<{ url: string; filename: string }> {
  const key = await obtenerKey(videoId);
  const body = new URLSearchParams({
    link: `https://youtu.be/${videoId}`,
    format: "mp3",
    audioBitrate: "256",
    videoQuality: "720",
    filenameStyle: "pretty",
    vCodec: "h264",
  });
  const response = await undici.fetch(`${API_BASE}/converter`, {
    method: "POST",
    headers: {
      Origin: FRAME_ORIGIN,
      Referer: `${FRAME_ORIGIN}/`,
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      key,
      "User-Agent": USER_AGENT,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`converter respondió ${response.status}`);
  }

  const data = (await response.json()) as ConverterResponse;
  if (typeof data.url !== "string" || !data.url) {
    throw new Error("converter no devolvió url");
  }
  return {
    url: data.url,
    filename:
      typeof data.filename === "string" && data.filename
        ? data.filename
        : `${videoId}.mp3`,
  };
}

async function descargarBuffer(url: string): Promise<Buffer> {
  const downloadUrl = new URL(url);
  if (downloadUrl.protocol !== "https:") {
    throw new Error("El enlace de descarga no es seguro.");
  }

  const response = await undici.fetch(downloadUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Origin: FRAME_ORIGIN,
      Referer: `${FRAME_ORIGIN}/`,
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok) {
    throw new Error(`La descarga respondió ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function buscarYouTube(
  query: string,
  limit = 5,
): Promise<VideoInfo[]> {
  const response = await undici.fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "es-ES,es;q=0.9",
        Cookie: "CONSENT=YES+1; SOCS=CAI",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`YouTube respondió ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
  if (!match) throw new Error("No se pudo leer la página de YouTube");

  const data = JSON.parse(match[1]) as YouTubeInitialData;
  const sections =
    data.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents ?? [];
  const results: VideoInfo[] = [];

  for (const section of sections) {
    for (const item of section.itemSectionRenderer?.contents ?? []) {
      const video = item.videoRenderer;
      if (!video?.videoId || !video.lengthText) continue;

      results.push({
        id: video.videoId,
        title: video.title?.runs?.[0]?.text || t("template_no_title_44ba2cb7"),
        channel: video.ownerText?.runs?.[0]?.text || "YouTube",
        duration: formatDuration(video.lengthText.simpleText || "--:--"),
        views: formatYouTubeCount(video.viewCountText?.simpleText),
        url: `https://youtu.be/${video.videoId}`,
        thumbnail: `https://i.ytimg.com/vi/${video.videoId}/maxresdefault.jpg`,
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

async function getVideoLikes(videoId: string): Promise<string | undefined> {
  try {
    const response = await undici.fetch(
      `https://www.youtube.com/watch?v=${videoId}&hl=es`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "es-ES,es;q=0.9",
          Cookie: "CONSENT=YES+1; SOCS=CAI",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) return undefined;

    const html = await response.text();
    const match = html.match(/"likeCount":"(\d+)"/);
    return match ? formatCount(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function cleanFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "audio"
  );
}

export default {
  name: ["docplay", "dytmp3", "dytaudio", "playdocaudio", "playmp3", "ytmusic", "dyta"],
  description: t("cmd_escribe_el_nombre_de_una_canci_7d229544"),
  category: "download",
  ownerOnly: false,
  hideCmd: true,
  async run(ctx: CommandContext) {
    const { sock, from, msg, react, reply, text, args, sender } = ctx;
    const query = (text || args.join(" ")).trim();
    if (!query) {
      return reply(t("cmd_escribe_el_nombre_de_una_canci_7d229544"));
    }

    await react("🎵");
    try {
      const directVideoId = query.match(YOUTUBE_ID)?.[1];
      let audioPromise = directVideoId
        ? obtenerAudio(directVideoId)
        : undefined;
      audioPromise?.catch(() => {});

      const results = await buscarYouTube(directVideoId || query);
      const info = directVideoId
        ? results.find((video) => video.id === directVideoId)
        : results[0];

      if (!info && !directVideoId) {
        await react("❌");
        return reply(t("cmd_sin_resultados_aafe1c07"));
      }

      const videoId = directVideoId || info?.id;
      if (!videoId) throw new Error("No se pudo obtener el ID del video.");
      const url = info?.url || `https://youtu.be/${videoId}`;
      const title = info?.title || t("template_no_title_44ba2cb7");
      audioPromise ??= obtenerAudio(videoId);
      const likes = await getVideoLikes(videoId);
      const audio = await audioPromise;
      const buffer = await descargarBuffer(audio.url);
      const { cost } = prepareDownloadChargeBySize(
        ctx,
        "document",
        buffer.length,
      );
      const fileName = `${cleanFileName(
        title !== t("template_no_title_44ba2cb7")
          ? title
          : audio.filename.replace(/\.mp3$/i, ""),
      )}.mp3`;

      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_youtube_document_0d20c17e"),
        icon: t("cmd_text_71ceeba5"),
        title,
        channel: info?.channel || "YouTube",
        duration: info?.duration,
        views: info?.views,
        likes,
        url,
        showChannel: Boolean(info?.channel),
        showDuration: Boolean(info?.duration),
        showViews: Boolean(info?.views),
        showLikes: Boolean(likes),
        showSource: true,
        showType: true,
        type: t("cmd_documento_mp3_f18c11dc"),
        cost: formatMoney(cost, ctx),
        showCost: true,
        loadingText: t("cmd_descargando_documento_2572aa2f"),
      });

      const hasPreview = info
        ? await sendDownloadPreview({
            sock,
            from,
            msg: msg as unknown as WAMessage,
            thumbnail: info.thumbnail,
            caption,
            link: url,
            title,
            author: globalThis.DEFAULT_BOT_AUTHOR,
            sender,
          })
        : false;
      if (!hasPreview) await reply({ text: caption });

      await sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype: "audio/mpeg",
          fileName,
        },
        { quoted: msg as unknown as WAMessage },
      );
      confirmDownloadCharge(ctx);

      await react("✅");
    } catch (error: unknown) {
      console.error(
        "[dl:y2mate]",
        error instanceof Error ? error.message : error,
      );
      await react("❌");
      return reply({
        text: t("cmd_value0_bb624cd4", {
          value0:
            error instanceof Error
              ? error.message
              : "No se pudo descargar el audio.",
        }),
      });
    }
  },
};
