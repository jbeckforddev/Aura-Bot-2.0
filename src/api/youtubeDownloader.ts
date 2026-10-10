import { Worker } from "node:worker_threads";
import { DL_CONFIG } from "../../config.ts";
import { requestJson } from "../../core/downloadUtils.ts";
import type { YouTubeSearchVideo } from "./youtubeSearch.ts";

export type YouTubeDownloadKind = "audio" | "video";

export interface YouTubeDownloadResult {
  title: string;
  author: string;
  duration: string;
  videoId: string;
  dl_url: string;
  views?: number | string;
  likes?: number | string;
  thumbnail: string;
  quality: string;
  winner: string;
}

interface ProviderDownloadResult {
  title?: string;
  author?: string;
  duration?: string;
  videoId?: string;
  dl_url: string;
  views?: number | string;
  likes?: number | string;
  thumbnail?: string;
  quality?: string;
}

interface ScraperMetadata {
  id?: string;
  title?: string;
  channel_title?: string;
  title_author?: string;
  author?: { name?: string };
  timestamp?: string;
  views?: number | string;
  statistics?: {
    like?: number | string;
    view?: number | string;
  };
  image?: string;
  thumbnail?: string;
}

interface ScraperDownloadResponse {
  status?: boolean;
  metadata?: ScraperMetadata;
  download?: {
    status?: boolean;
    quality?: string;
    url?: string;
  };
}

const BASE_URL = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const VIDEO_API_URL = `${DL_CONFIG.deliriusApi.BASE_URL.replace(/\/+$/, "")}/download/ytmp4`;
const LEMPI_API_URL = `${DL_CONFIG.lempi.BASE_URL.replace(/\/+$/, "")}/dl/ytv`;
const YOUTUBE_ID =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(...values: unknown[]): string {
  const value = values.find(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  return value || "";
}

function countValue(value: unknown): number | string | undefined {
  if (typeof value === "number" || typeof value === "string") return value;
  return undefined;
}

function getVideoId(url: string): string {
  return url.match(YOUTUBE_ID)?.[1] || "";
}

function assertDownloadUrl(
  status: unknown,
  downloadUrl: unknown,
  provider: string,
): asserts downloadUrl is string {
  if (status !== true || typeof downloadUrl !== "string" || !/^https?:\/\//i.test(downloadUrl)) {
    throw new Error(`${provider} no devolvió un enlace descargable válido.`);
  }
}

function withProviderTimeout<T>(
  operation: Promise<T>,
  provider: string,
  controller: AbortController,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(
        () => {
          const error = new Error(`${provider} excedió el tiempo de espera.`);
          controller.abort(error);
          reject(error);
        },
        timeoutMs,
      );
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function runScraperWorker<T>(
  workerData: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(
      new URL("../controller/youtubeDownloaderWorker.js", import.meta.url),
      { workerData },
    );
    let stopped = false;
    let completed = false;
    const terminateWorker = () => {
      if (stopped) return Promise.resolve(0);
      stopped = true;
      return worker.terminate();
    };
    const onAbort = () => {
      if (completed) return;
      completed = true;
      void terminateWorker().then(() => {
        reject(signal.reason || new Error("Operación de YouTube cancelada."));
      });
    };
    signal.addEventListener("abort", onAbort, { once: true });
    worker.once("message", async (result: T & { workerError?: string }) => {
      if (completed) return;
      completed = true;
      signal.removeEventListener("abort", onAbort);
      await terminateWorker();
      if (result.workerError) {
        reject(new Error(result.workerError));
      } else {
        resolve(result);
      }
    });
    worker.once("error", (error) => {
      if (completed) return;
      completed = true;
      signal.removeEventListener("abort", onAbort);
      void terminateWorker().then(() => reject(error));
    });
    worker.once("exit", (code) => {
      if (completed) return;
      completed = true;
      signal.removeEventListener("abort", onAbort);
      reject(new Error(`youtube_scraper terminó sin resultado (código ${code}).`));
    });
    if (signal.aborted) onAbort();
  });
}

async function downloadFromApi(
  url: string,
  kind: YouTubeDownloadKind,
  quality: number,
  signal: AbortSignal,
): Promise<ProviderDownloadResult> {
  if (kind === "audio") {
    const endpoint = new URL(`${BASE_URL}/dl/fastytmp3`);
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("key", DL_CONFIG.alya.API_KEY);
    const response = await requestJson<Record<string, unknown>>(
      endpoint.toString(),
      30000,
      { "User-Agent": "AuraReedBot/2.0" },
      signal,
    );
    const data = isRecord(response.data) ? response.data : {};
    assertDownloadUrl(response.status, data.dl, "Alya Fast API");
    return {
      title: stringValue(data.title),
      author: stringValue(data.author),
      duration: stringValue(data.duration),
      videoId: stringValue(data.videoId) || getVideoId(url),
      dl_url: data.dl,
      views: countValue(data.views),
      likes: countValue(data.likes),
      thumbnail: stringValue(data.thumbnail),
      quality: stringValue(data.quality),
    };
  }

  const endpoint = new URL(VIDEO_API_URL);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("format", `${quality}p`);
  const response = await requestJson<Record<string, unknown>>(
    endpoint.toString(),
    25000,
    { "User-Agent": "AuraReedBot/2.0" },
    signal,
  );
  const data = isRecord(response.data) ? response.data : {};
  const downloadUrl = data.download || data.url || data.dl;
  assertDownloadUrl(response.status, downloadUrl, "Delirius API");
  return {
    title: stringValue(data.title, response.titulo),
    author: stringValue(data.author, data.channel, response.canal),
    duration: stringValue(data.duration, response.duration, response.duracion),
    videoId: stringValue(data.videoId) || getVideoId(url),
    dl_url: downloadUrl,
    views: countValue(data.views),
    likes: countValue(data.likes),
    thumbnail: stringValue(data.image, response.thumbnail, response.miniatura),
    quality: stringValue(data.quality, data.format, `${quality}p`),
  };
}

async function downloadFromLempi(
  url: string,
  quality: number,
  signal: AbortSignal,
): Promise<ProviderDownloadResult> {
  const endpoint = new URL(LEMPI_API_URL);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("quality", `${quality}`);
  endpoint.searchParams.set("apikey", DL_CONFIG.lempi.API_KEY);
  const response = await requestJson<Record<string, unknown>>(
    endpoint.toString(),
    30000,
    { "User-Agent": "AuraReedBot/2.0" },
    signal,
  );
  const data = isRecord(response.datos) ? response.datos : {};
  const downloadUrl = data.url || data.download || data.dl;
  assertDownloadUrl(response.status, downloadUrl, "Lempi API");
  return {
    title: stringValue(response.titulo, response.title, data.title),
    author: stringValue(response.canal, response.author, data.author),
    duration: stringValue(response.duracion, response.duration, data.duration),
    videoId: stringValue(data.videoId) || getVideoId(url),
    dl_url: downloadUrl,
    views: countValue(data.views ?? response.views),
    likes: countValue(data.likes ?? response.likes),
    thumbnail: stringValue(response.miniatura, response.thumbnail, data.thumbnail),
    quality: stringValue(data.quality, `${quality}p`),
  };
}

async function downloadFromLibrary(
  url: string,
  kind: YouTubeDownloadKind,
  quality: number,
  signal: AbortSignal,
): Promise<ProviderDownloadResult> {
  const response = await runScraperWorker<ScraperDownloadResponse>(
    { url, kind, quality, action: "download" },
    signal,
  );
  const download = response.download;
  assertDownloadUrl(response.status, download?.status === true ? download.url : undefined, "youtube_scraper");
  const metadata = response.metadata || {};
  return {
    title: stringValue(metadata.title),
    author: stringValue(metadata.author?.name, metadata.channel_title),
    duration: stringValue(metadata.timestamp),
    videoId: stringValue(metadata.id) || getVideoId(url),
    dl_url: download.url,
    views: countValue(metadata.views),
    likes: countValue(metadata.statistics?.like),
    thumbnail: stringValue(metadata.image, metadata.thumbnail),
    quality: stringValue(download.quality, `${quality}${kind === "audio" ? "kbps" : "p"}`),
  };
}

async function loadMetadata(
  url: string,
  fallback?: YouTubeSearchVideo,
): Promise<Partial<ProviderDownloadResult>> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Tiempo agotado al obtener metadatos")),
    10000,
  );
  try {
    const metadata = await runScraperWorker<ScraperMetadata>(
      { url, action: "metadata" },
      controller.signal,
    );
    return {
      title: metadata.title,
      author: metadata.author?.name || metadata.channel_title,
      duration: metadata.timestamp,
      videoId: metadata.id,
      views: metadata.statistics?.view ?? metadata.views,
      likes: metadata.statistics?.like,
      thumbnail: metadata.image || metadata.thumbnail,
    };
  } catch (error) {
    console.warn(`No se pudieron completar los metadatos de YouTube:`, error);
    return fallback
      ? {
          title: fallback.title,
          author: fallback.author,
          duration: fallback.duration,
          videoId: fallback.videoId,
          views: fallback.views,
          likes: fallback.likes,
          thumbnail: fallback.thumbnail,
        }
      : {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadYouTube(
  url: string,
  kind: YouTubeDownloadKind,
  quality = kind === "audio" ? 128 : 360,
  fallback?: YouTubeSearchVideo,
): Promise<YouTubeDownloadResult> {
  const videoId = getVideoId(url);
  if (!videoId) throw new Error("URL de YouTube no válida.");
  const canonicalUrl = `https://youtu.be/${videoId}`;
  const raceStartedAt = Date.now();
  const providers: {
    name: string;
    download: (signal: AbortSignal) => Promise<ProviderDownloadResult>;
  }[] = [
    {
      name: "youtube_scraper",
      download: (signal) =>
        downloadFromLibrary(canonicalUrl, kind, quality, signal),
    },
  ];
  if (kind === "audio") {
    providers.push({
      name: "Alya Fast API",
      download: (signal) =>
        downloadFromApi(canonicalUrl, kind, quality, signal),
    });
  } else {
    providers.push(
      {
        name: "Lempi API",
        download: (signal) =>
          downloadFromLempi(canonicalUrl, quality, signal),
      },
      {
        name: "Delirius API",
        download: (signal) =>
          downloadFromApi(canonicalUrl, kind, quality, signal),
      },
    );
  }
  const providerControllers = providers.map(() => new AbortController());
  const providerTimeoutMs = kind === "video" ? 180000 : 60000;
  const providerPromises = providers.map(
    async ({ name, download }, index) => {
      const controller = providerControllers[index];
      try {
        const result = await withProviderTimeout(
          download(controller.signal),
          name,
          controller,
          providerTimeoutMs,
        );
        return {
          result,
          source: `${name} (${Date.now() - raceStartedAt}ms)`,
          providerIndex: index,
        };
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn(`Falló el descargador ${name}:`, error);
        }
        throw error;
      }
    },
  );
  const winner = await Promise.any(
    providerPromises,
  );
  providerControllers.forEach((controller, index) => {
    if (index !== winner.providerIndex) controller.abort();
  });
  await Promise.allSettled(providerPromises);
  const metadata = await loadMetadata(canonicalUrl, fallback);
  const result = winner.result;
  return {
    title: stringValue(result.title, metadata.title, fallback?.title, "Video de YouTube"),
    author: stringValue(result.author, metadata.author, fallback?.author, "Desconocido"),
    duration: stringValue(result.duration, metadata.duration, fallback?.duration),
    videoId: stringValue(result.videoId, metadata.videoId, fallback?.videoId, videoId),
    dl_url: result.dl_url,
    views: result.views ?? metadata.views ?? fallback?.views,
    likes: result.likes ?? metadata.likes ?? fallback?.likes,
    thumbnail: stringValue(result.thumbnail, metadata.thumbnail, fallback?.thumbnail),
    quality: stringValue(result.quality, `${quality}${kind === "audio" ? "k" : "p"}`),
    winner: winner.source,
  };
}