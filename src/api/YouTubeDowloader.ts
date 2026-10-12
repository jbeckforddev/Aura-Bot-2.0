import { fetch } from "undici";
import { createDecipheriv } from "crypto";
import type { YouTubeSearchVideo } from "./YouTubeSearch.ts";

function getID(url: string): string | null {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
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
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}
function formatCount(valor: unknown): string {
  if (valor === null || valor === undefined) return "0";

  const raw = String(valor).trim();
  if (!raw) return "0";
  if (/^[\d,.]+[kKmMbBtT]$/.test(raw)) {
    return raw.replace(/,/g, "").toUpperCase();
  }
  const normalized = raw.replace(/,/g, "");
  const numericPart = normalized.match(/^\s*\d+(?:\.\d+)?/);
  if (!numericPart) return normalized;
  const numero = Number(numericPart[0]);
  if (!Number.isFinite(numero)) return normalized;
  if (numero >= 1e12) {
    return `${(numero / 1e12).toFixed(1)}T`;
  }
  if (numero >= 1e9) {
    return `${(numero / 1e9).toFixed(1)}B`;
  }
  if (numero >= 1e6) {
    return `${(numero / 1e6).toFixed(1)}M`;
  }
  if (numero >= 1e3) {
    return `${(numero / 1e3).toFixed(1)}K`;
  }
  return numero.toString();
}
const audio_q = [92, 128, 256, 320];
const video_q = [144, 360, 480, 720, 1080];
const CONTENT_QUALITIES = {
  audio: audio_q,
  video: video_q,
} as const;

const decode = (enc: string) => {
  try {
    const secret_key = "C5D58EF67A7584E4A29F6C35BBC4EB12";
    const data = Buffer.from(enc, "base64");
    const iv = data.slice(0, 16);
    const content = data.slice(16);
    const key = Buffer.from(secret_key, "hex");

    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    const decrypted = Buffer.concat([
      decipher.update(content),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error("Error al decodificar la información: " + message);
  }
};

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
  const size = Number(res.headers.get("content-length") || "0");
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
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=es`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      "Accept-Language": "es-ES,es;q=0.9",
      Cookie: "CONSENT=YES+1; SOCS=CAI",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`No se pudo obtener la metadata del video: ${response.status}`);
  }

  const html = await response.text();

  const playerPatterns = [
    /var ytInitialPlayerResponse\s*=\s*(\{.+?\});<\/script>/s,
    /window\["ytInitialPlayerResponse"\]\s*=\s*(\{.+?\});<\/script>/s,
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s,
  ];

  let player: any = {};
  for (const pattern of playerPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        player = JSON.parse(match[1]);
        break;
      } catch {
        player = {};
      }
    }
  }

  const videoDetails = player?.videoDetails || {};
  const channel =
    videoDetails?.author ||
    videoDetails?.ownerChannelName ||
    html.match(/"author":"([^"]+)"/)?.[1] ||
    "Desconocido";

  const channel_url =
    videoDetails?.ownerProfileUrl ||
    html.match(/"ownerProfileUrl":"([^"]+)"/)?.[1] ||
    `https://www.youtube.com/channel/${videoDetails?.channelId || ""}`;

  const viewCount = videoDetails?.viewCount ||
    html.match(/"viewCount":"(\d+)"/)?.[1] ||
    "0";
  const views = formatCount(viewCount);

  const likeCount =
    html.match(/"likeCount":"(\d+)"/)?.[1] ||
    html.match(/"likeCount":(\d+)/)?.[1] ||
    "0";
  const likes = formatCount(likeCount);

  const title =
    videoDetails?.title ||
    html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
    "Sin título";

  const thumbnail =
    videoDetails?.thumbnail?.thumbnails?.at(-1)?.url ||
    html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const lengthSeconds =
    videoDetails?.lengthSeconds ||
    html.match(/"lengthSeconds":"?(\d+)"?/)?.[1] ||
    "0";
  const duration =
    Number(lengthSeconds) > 0
      ? `${Math.floor(Number(lengthSeconds) / 60)}m ${Number(lengthSeconds) % 60}s`
      : "0s";

  return {
    title,
    channel,
    channel_url,
    views,
    likes,
    thumbnail,
    duration,
  };
}

async function savetube(
  link: string,
  quality: number,
  value: "audio" | "video",
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

  try {
    const cdnResponse = await fetch("https://media.savetube.vip/api/random-cdn");
    const cdnData = (await cdnResponse.json()) as { cdn?: string };
    if (!cdnData.cdn) {
      throw new Error("No se obtuvo un CDN disponible");
    }

    const cdn = cdnData.cdn;
    const infoResponse = await fetch(`https://${cdn}/v2/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36",
        Referer: "https://save-tube.com/",
      },
      body: JSON.stringify({ url: link }),
    });

    if (!infoResponse.ok) {
      throw new Error(`No se pudo obtener la información del video: ${infoResponse.status}`);
    }

    const infoget = (await infoResponse.json()) as { data?: string };
    if (!infoget.data) {
      throw new Error("No se recibió la información cifrada del video");
    }

    const info = decode(infoget.data);
    const downloadResponse = await fetch(`https://${cdn}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36",
        Referer: "https://save-tube.com/",
      },
      body: JSON.stringify({
        downloadType: value,
        quality: String(quality),
        key: info.key,
      }),
    });

    const response = (await downloadResponse.json()) as {
      data?: { downloadUrl?: string } | null;
      message?: string;
      status?: boolean;
    };
    const finalUrl = response.data?.downloadUrl;
    if (
      !downloadResponse.ok ||
      response.status === false ||
      typeof finalUrl !== "string" ||
      !finalUrl.trim()
    ) {
      throw new Error(
        response.message ||
          `No se pudo generar el enlace de descarga: ${downloadResponse.status}`,
      );
    }
    try {
      const parsedUrl = new URL(finalUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error();
      }
    } catch {
      throw new Error("El proveedor devolvió un enlace de descarga inválido");
    }

    const directMeta = await getDirectLinkMetadata(finalUrl, quality, value);
    const videoId = getID(link) || makeId(11);
    const youtubeMeta = await getYouTubeVideoMetadata(videoId).catch(() => null);

    const channelId =
      info?.channelId ||
      info?.channel?.id ||
      info?.authorId ||
      info?.owner?.channelId ||
      "";
    const channelUrl =
      youtubeMeta?.channel_url ||
      (channelId ? `https://www.youtube.com/channel/${channelId}` : "https://www.youtube.com/");

    const result = {
      id: videoId,
      title: youtubeMeta?.title || info.title || "Sin título",
      channel: youtubeMeta?.channel || info.author || info.channel || "Desconocido",
      duration: youtubeMeta?.duration || info.duration || "0s",
      views:
        youtubeMeta?.views ||
        (typeof info.views === "number"
          ? info.views.toString()
          : typeof info.viewCount === "number"
            ? info.viewCount.toString()
            : typeof info.views === "string"
              ? info.views
              : "0"),
      likes:
        youtubeMeta?.likes ||
        (typeof info.likes === "number"
          ? info.likes.toString()
          : typeof info.likeCount === "number"
            ? info.likeCount.toString()
            : typeof info.likes === "string"
              ? info.likes
              : "0"),
      url: `https://youtu.be/${videoId}`,
      channel_url: channelUrl,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      dl_url: directMeta.url,
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
  const response = await savetube(url, quality, mediaType);
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
    quality: response.type === "audio" ? `${quality}kbps` : `${quality}p`,
    views: video.views || searchResult?.views || "0",
    likes: video.likes || searchResult?.likes,
    thumbnail: video.thumbnail || searchResult?.thumbnail,
    dl_url: video.dl_url,
  };
}
