import { fetch } from "undici";
import { DL_CONFIG } from "../../config.ts";
import type { YouTubeSearchVideo } from "./YouTubeSearch.ts";
import { formatCount } from "../../utils/formatter.ts";

function getID(url: string): string | null {
  const regex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function idValidUrl(input: string): boolean {
  const regex =
    /^(https?:\/\/)?((www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|shorts\/|live\/|embed\/|v\/)?[A-Za-z0-9_-]{11}|(www\.)?youtube\.com\/.+)$/;
  return regex.test(input);
}

function makeId(length: number): string {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}
const audio_q = [92, 128, 256, 320];
const video_q = [144, 360, 480, 720, 1080];
const CONTENT_QUALITIES = {
  audio: audio_q,
  video: video_q,
} as const;
type AlyaCoreData = {
  title?: string;
  author?: string;
  duration?: string;
  thumbnail?: string;
  quality?: string;
  size?: number;
  dl?: string;
  views?: string;
  likes?: string;
  channel_url?: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function firstString(
  records: JsonRecord[],
  keys: string[],
): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
      if (typeof value === "number") return String(value);
    }
  }
}

function normalizeAudioResponse(
  payload: unknown,
): AlyaCoreData & { dl: string } {
  const root = asRecord(payload);
  if (!root || root.status !== true) {
    const message =
      root && typeof root.message === "string" ? root.message : "";
    throw new Error(message || "El proveedor no pudo generar el audio.");
  }

  const data = asRecord(root.data);
  const result = asRecord(root.result);
  const records = [
    data,
    result,
    asRecord(data?.result),
    asRecord(result?.data),
    root,
  ].filter((record): record is JsonRecord => record !== undefined);
  const dl = firstString(records, ["dl", "mp3", "download"]);
  if (!dl) throw new Error("El proveedor no devolvió un enlace de descarga.");

  if (!URL.canParse(dl)) {
    throw new Error("El proveedor devolvió un enlace de descarga inválido.");
  }
  const downloadUrl = new URL(dl);
  if (downloadUrl.protocol !== "http:" && downloadUrl.protocol !== "https:") {
    throw new Error("El proveedor devolvió un enlace de descarga inválido.");
  }

  const rawAuthor = records.find(
    (record) => record.author !== undefined,
  )?.author;
  const author =
    typeof rawAuthor === "string"
      ? rawAuthor
      : (firstString([asRecord(rawAuthor) ?? {}], ["name", "username"]) ??
        firstString(records, ["channel"]));
  const rawSize = records.find(
    (record) => typeof record.size === "number",
  )?.size;

  return {
    title: firstString(records, ["title"]),
    author,
    duration: firstString(records, ["duration"]),
    thumbnail: firstString(records, ["thumbnail", "image"]),
    quality: firstString(records, ["quality"]),
    size: typeof rawSize === "number" ? rawSize : undefined,
    views: firstString(records, ["views"]),
    likes: firstString(records, ["likes"]),
    channel_url: firstString(records, ["channel_url", "channelUrl"]),
    dl,
  };
}

async function getAlyaCoreAudio(
  link: string,
): Promise<AlyaCoreData & { dl: string }> {
  const encodedUrl = encodeURIComponent(link);
  const endpoints = [
    {
      name: "Alya fastytmp3",
      url: `${DL_CONFIG.alya.BASE_URL}dl/fastytmp3?url=${encodedUrl}&key=${DL_CONFIG.alya.API_KEY}`,
    },
    {
      name: "Alya ytmp3converter",
      url: `${DL_CONFIG.alya.BASE_URL}dl/ytmp3converter?url=${encodedUrl}&key=${DL_CONFIG.alya.API_KEY}`,
    },
    {
      name: "Alya youtubeplayv2",
      url: `${DL_CONFIG.alya.BASE_URL}dl/youtubeplayv2?query=${encodedUrl}&type=mp3&quality=auto&key=${DL_CONFIG.alya.API_KEY}`,
    },
    {
      name: "Alya youtubeplay",
      url: `${DL_CONFIG.alya.BASE_URL}dl/youtubeplay?query=${encodedUrl}&key=${DL_CONFIG.alya.API_KEY}`,
    },
    {
      name: "Alya ytmp3downloader",
      url: `${DL_CONFIG.alya.BASE_URL}dl/ytmp3downloader?url=${encodedUrl}&key=${DL_CONFIG.alya.API_KEY}`,
    },
    {
      name: "FaaApi ytmp3",
      url: `${DL_CONFIG.faaApi.BASE_URL}faa/ytmp3?url=${encodedUrl}`,
    },
    {
      name: "Delirius ytmp3",
      url: `${DL_CONFIG.deliriusApi.BASE_URL}download/ytmp3?url=${encodedUrl}`,
    },
  ];
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(60000),
  ]);

  try {
    const winner = await Promise.any(
      endpoints.map(async ({ name, url }) => {
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`${name} respondió HTTP ${response.status}`);
        }

        const payload: unknown = await response.json();
        return normalizeAudioResponse(payload);
      }),
    );
    controller.abort();
    return winner;
  } catch (error) {
    if (error instanceof AggregateError) {
      const reasons = error.errors
        .map((reason) =>
          reason instanceof Error ? reason.message : String(reason),
        )
        .join("; ");
      throw new Error(`Ninguna API pudo generar el audio. ${reasons}`, {
        cause: error,
      });
    }
    throw error;
  }
}

async function getDirectLinkMetadata(
  downloadUrl: string,
  requestedQuality: number,
  mediaType: "audio" | "video",
): Promise<{
  url: string;
  type: "audio" | "video";
  quality: string;
  size: number;
}> {
  const res = await fetch(downloadUrl, { redirect: "follow" });
  const finalUrl = res.url;
  const contentType = res.headers.get("content-type") || "";
  const type = contentType.includes("audio") ? "audio" : mediaType;
  const contentLength = Number(res.headers.get("content-length") || "0");
  const size =
    Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;
  const quality =
    type === "audio" ? `${requestedQuality}kbps` : `${requestedQuality}p`;

  return {
    url: finalUrl,
    type,
    quality,
    size,
  };
}

async function getYouTubeVideoMetadata(videoId: string): Promise<{
  title: string;
  channel: string;
  channel_url: string;
  views: string;
  likes: string;
  thumbnail: string;
  duration: string;
}> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9",
    Cookie: "CONSENT=YES+1; SOCS=CAI",
  };
  const response = await fetch(
    `https://www.youtube.com/watch?v=${videoId}&hl=es`,
    { headers, signal: AbortSignal.timeout(10000), redirect: "follow" },
  );
  if (!response.ok) {
    throw new Error(
      `No se pudo obtener la metadata del video: ${response.status}`,
    );
  }

  const html = await response.text();
  const playerMatch =
    html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});<\/script>/s) ||
    html.match(
      /window\["ytInitialPlayerResponse"\]\s*=\s*(\{.+?\});<\/script>/s,
    ) ||
    html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  let player: JsonRecord = {};
  if (playerMatch?.[1]) {
    try {
      player = asRecord(JSON.parse(playerMatch[1])) ?? {};
    } catch {
      player = {};
    }
  }

  const videoDetails = asRecord(player.videoDetails) ?? {};
  const likeCount =
    html.match(/"likeCount":"(\d+)"/)?.[1] ||
    html.match(/"likeCount":(\d+)/)?.[1] ||
    "0";
  const lengthSeconds =
    videoDetails.lengthSeconds ||
    html.match(/"lengthSeconds":"?(\d+)"?/)?.[1] ||
    "0";
  const seconds = Number(lengthSeconds);
  const channelId =
    typeof videoDetails.channelId === "string" ? videoDetails.channelId : "";
  const channelUrl =
    (typeof videoDetails.ownerProfileUrl === "string" &&
      videoDetails.ownerProfileUrl) ||
    (channelId
      ? `https://www.youtube.com/channel/${channelId}`
      : "https://www.youtube.com/");

  return {
    title:
      (typeof videoDetails.title === "string" && videoDetails.title) ||
      html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
      "Sin título",
    channel:
      (typeof videoDetails.author === "string" && videoDetails.author) ||
      (typeof videoDetails.ownerChannelName === "string" &&
        videoDetails.ownerChannelName) ||
      html.match(/"author":"([^"]+)"/)?.[1] ||
      "Desconocido",
    channel_url: channelUrl,
    views: String(
      videoDetails.viewCount || html.match(/"viewCount":"(\d+)"/)?.[1] || "0",
    ),
    likes: likeCount,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration:
      Number.isFinite(seconds) && seconds > 0
        ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        : "0s",
  };
}

async function downloadFromProviders(
  link: string,
  quality: number,
  value: "audio" | "video",
  searchResult?: YouTubeSearchVideo,
): Promise<
  | {
      creator: string;
      status: "success";
      statusCode: number;
      type: "audio" | "video";
      ping: string;
      data: Array<{
        id: string;
        title: string;
        channel: string;
        duration: string;
        views: string;
        likes: string;
        url: string;
        channel_url: string;
        thumbnail: string;
        dl_url: string;
        size: number;
        quality?: string;
      }>;
    }
  | {
      creator: string;
      status: "failed";
      statusCode: number;
      type?: "audio" | "video";
      ping?: string;
      data: [];
      error: string;
    }
> {
  const startedAt = Date.now();

  if (!idValidUrl(link)) {
    return {
      creator: "Jeriel B.",
      status: "failed",
      statusCode: 400,
      data: [],
      error: "URL inválida. Debe ser un enlace de YouTube válido.",
    };
  }

  const availableQualities = CONTENT_QUALITIES[value];
  if (!availableQualities.includes(quality)) {
    return {
      creator: "Jeriel B.",
      status: "failed",
      statusCode: 400,
      data: [],
      error: `Calidad no disponible para ${value}. Opciones válidas: ${availableQualities.join(", ")}`,
    };
  }

  if (value !== "audio") {
    return {
      creator: "Jeriel B.",
      status: "failed",
      statusCode: 400,
      type: value,
      data: [],
      error:
        "Las APIs configuradas actualmente solo permiten descargar audio MP3.",
    };
  }

  try {
    const providerData = await getAlyaCoreAudio(link);
    const videoId = getID(link) || searchResult?.videoId || makeId(11);
    const [directMeta, youtubeMeta] = await Promise.all([
      getDirectLinkMetadata(providerData.dl, quality, "audio").catch(
        (error: unknown) => {
          console.warn(
            "No se pudieron obtener los metadatos del archivo descargable:",
            error,
          );
          return {
            url: providerData.dl,
            type: "audio" as const,
            quality: `${quality}kbps`,
            size: 0,
          };
        },
      ),
      getYouTubeVideoMetadata(videoId).catch((error: unknown) => {
        console.warn("No se pudieron obtener los metadatos de YouTube:", error);
        return null;
      }),
    ]);
    const result = {
      id: videoId,
      title:
        providerData.title ||
        youtubeMeta?.title ||
        searchResult?.title ||
        "Sin título",
      channel:
        providerData.author ||
        youtubeMeta?.channel ||
        searchResult?.author ||
        "Desconocido",
      duration:
        providerData.duration ||
        (youtubeMeta?.duration !== "0s" && youtubeMeta?.duration) ||
        searchResult?.duration ||
        "0s",
      views:
        providerData.views ||
        (youtubeMeta?.views !== "0" && youtubeMeta?.views) ||
        searchResult?.views ||
        "0",
      likes:
        providerData.likes ||
        (youtubeMeta?.likes !== "0" && youtubeMeta?.likes) ||
        searchResult?.likes ||
        "0",
      url: `https://youtu.be/${videoId}`,
      channel_url:
        providerData.channel_url ||
        youtubeMeta?.channel_url ||
        "https://www.youtube.com/",
      thumbnail:
        providerData.thumbnail ||
        youtubeMeta?.thumbnail ||
        searchResult?.thumbnail ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      dl_url: directMeta.url,
      size: providerData.size || directMeta.size || 0,
      quality: providerData.quality || directMeta.quality,
    };

    return {
      creator: "Jeriel B.",
      status: "success",
      statusCode: 200,
      type: directMeta.type,
      ping: `${Date.now() - startedAt}ms`,
      data: [result],
    };
  } catch (error: unknown) {
    console.error("Converting error:", error);
    return {
      creator: "Jeriel B.",
      status: "failed",
      statusCode: 500,
      ping: `${Date.now() - startedAt}ms`,
      data: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function downloadYouTube(
  url: string,
  mediaType: "audio" | "video",
  quality: number,
  searchResult?: YouTubeSearchVideo,
) {
  const response = await downloadFromProviders(
    url,
    quality,
    mediaType,
    searchResult,
  );
  if (response.status !== "success") throw new Error(response.error);

  const video = response.data[0];
  if (!video?.dl_url) {
    throw new Error("El proveedor no devolvió un enlace de descarga.");
  }

  return {
    videoId: video.id || searchResult?.videoId,
    title: video.title || searchResult?.title || "Sin título",
    author: video.channel || searchResult?.author || "Desconocido",
    duration: video.duration || searchResult?.duration || "0s",
    quality:
      response.type === "audio"
        ? video.quality || `${quality}kbps`
        : `${quality}p`,
    views: formatCount(video.views || searchResult?.views || "0"),
    likes: formatCount(video.likes || searchResult?.likes || "0"),
    thumbnail: video.thumbnail || searchResult?.thumbnail,
    dl_url: video.dl_url,
    size: video.size || 0,
  };
}
