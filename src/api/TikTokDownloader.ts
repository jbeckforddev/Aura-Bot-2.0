import { DL_CONFIG } from "../../config.ts";
import { downloadToCache, pickSearchResult, requestJson } from "../../core/downloadUtils.ts";
import type {
  TikTokDownloadData,
  TikTokSearchItem,
  TikTokSearchResponse,
} from "../../types/index.d.ts";

const ALYA_API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const KEY = DL_CONFIG.alya.API_KEY;
const TIKWM_API = "https://www.tikwm.com/api";
const CACHE_TTL = 300_000;
const METADATA_TIMEOUT = 45_000;
const ALYA_V2_VIDEO_PRIORITY = new Map([
  ["nowatermark_hd", 0],
  ["nowatermark", 1],
  ["watermark", 3],
]);

type TikTokPostDetails = {
  id?: string;
  title?: string;
  author?: {
    nickname?: string;
    fullname?: string;
    unique_id?: string;
  };
};

type TikTokMedia = TikTokPostDetails & {
  type: "image" | "video";
  views?: number | string;
  likes?: number | string;
  comments?: number | string;
  shares?: number | string;
  urls: string[];
  audioUrl?: string;
};

type DownloadMode = "media" | "audio";

type TikWMVideoResponse = {
  code?: number;
  data?: TikTokPostDetails & {
    play?: string;
    wmplay?: string;
    hdplay?: string;
    images?: string[];
    music_info?: {
      play?: string;
    };
    play_count?: number | string;
    digg_count?: number | string;
    comment_count?: number | string;
    share_count?: number | string;
  };
};

type AlyaTikTokResponse = {
  status?: boolean;
  data?: TikTokPostDetails & {
    type?: string;
    dl?: string | string[];
    stats?: {
      plays?: number | string;
      likes?: number | string;
      comments?: number | string;
      shares?: number | string;
    };
  };
};

type CacheEntry<T> = { data: T; exp: number };

const searchCache = new Map<string, CacheEntry<TikTokSearchItem>>();
const metaCache = new Map<string, CacheEntry<TikTokMedia>>();

function pruneCache<T>(cache: Map<string, CacheEntry<T>>) {
  if (cache.size <= 150) return;
  const now = Date.now();
  for (const [key, value] of cache) {
    if (value.exp <= now) cache.delete(key);
  }
}

export async function searchTikTok(query: string): Promise<TikTokSearchItem | null> {
  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.data;

  const params = new URLSearchParams({ query, key: KEY });
  const response = await requestJson<TikTokSearchResponse>(`${ALYA_API}/search/tiktok?${params}`);
  const result = pickSearchResult<TikTokSearchItem>(response?.data, query);
  if (result?.url) {
    pruneCache(searchCache);
    searchCache.set(key, { data: result, exp: Date.now() + CACHE_TTL });
  }
  return result;
}

function isDownloadUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value) && URL.canParse(value);
}

async function fetchTikWM(url: string, signal: AbortSignal): Promise<TikTokMedia> {
  const response = await requestJson<TikWMVideoResponse>(
    `${TIKWM_API}/?url=${encodeURIComponent(url)}&hd=1`,
    METADATA_TIMEOUT,
    {},
    signal,
  );
  const data = response?.data;
  if (!data || (response.code !== undefined && response.code !== 0)) {
    throw new Error("TikWM no devolvió una publicación válida.");
  }

  const images = Array.isArray(data.images) ? data.images.filter(isDownloadUrl) : [];
  const audioUrl = data.music_info?.play;
  return {
    id: data.id,
    title: data.title,
    author: data.author,
    views: data.play_count,
    likes: data.digg_count,
    comments: data.comment_count,
    shares: data.share_count,
    type: images.length ? "image" : "video",
    urls: images.length ? images : [data.hdplay, data.play, data.wmplay].filter(isDownloadUrl),
    audioUrl: isDownloadUrl(audioUrl) ? audioUrl : undefined,
  };
}

async function fetchAlya(url: string, signal: AbortSignal): Promise<TikTokMedia> {
  const params = new URLSearchParams({ url, key: KEY });
  const response = await requestJson<AlyaTikTokResponse>(
    `${ALYA_API}/dl/tiktok?${params}`,
    METADATA_TIMEOUT,
    {},
    signal,
  );
  const data = response?.data;
  if (response?.status !== true || (data?.type !== "image" && data?.type !== "video")) {
    throw new Error("Alya no devolvió una publicación válida.");
  }

  const urls = (Array.isArray(data.dl) ? data.dl : [data.dl]).filter(isDownloadUrl);
  return {
    id: data.id,
    title: data.title,
    author: data.author,
    views: data.stats?.plays,
    likes: data.stats?.likes,
    comments: data.stats?.comments,
    shares: data.stats?.shares,
    type: data.type,
    urls,
  };
}

async function fetchAlyaV2(url: string, signal: AbortSignal): Promise<TikTokMedia> {
  const params = new URLSearchParams({ url, key: KEY });
  const response = await requestJson<TikTokDownloadData>(
    `${ALYA_API}/dl/tiktokv2?${params}`,
    METADATA_TIMEOUT,
    {},
    signal,
  );
  if (response?.status !== true || !Array.isArray(response.data)) {
    throw new Error("Alya v2 no devolvió una publicación válida.");
  }

  const images: string[] = [];
  const videos: { url: string; priority: number }[] = [];
  let audioItemUrl: string | undefined;
  for (const item of response.data) {
    const mediaUrl = item?.url;
    if (!isDownloadUrl(mediaUrl)) continue;

    const type = typeof item.type === "string" ? item.type.toLowerCase() : "";
    if (type === "photo" || type === "image") {
      images.push(mediaUrl);
      continue;
    }

    const pathname = new URL(mediaUrl).pathname;
    if (type === "thumbnail" || type === "cover" || /\.(?:jpe?g|png|webp|gif|avif)$/i.test(pathname)) {
      continue;
    }
    if (type === "audio" || type === "music" || /\.(?:mp3|m4a|ogg|wav)$/i.test(pathname)) {
      audioItemUrl ??= mediaUrl;
      continue;
    }

    videos.push({ url: mediaUrl, priority: ALYA_V2_VIDEO_PRIORITY.get(type) ?? 2 });
  }

  const audioUrl = response.music_info?.url;
  return {
    id: response.id,
    type: images.length ? "image" : "video",
    urls: images.length
      ? images
      : videos.sort((first, second) => first.priority - second.priority).map((item) => item.url),
    audioUrl: isDownloadUrl(audioUrl) ? audioUrl : audioItemUrl,
    title: response.title,
    author: response.author,
    views: response.stats?.views ?? response.play_count,
    likes: response.stats?.likes ?? response.digg_count,
    comments: response.stats?.comment ?? response.comment_count,
    shares: response.stats?.share ?? response.share_count,
  };
}

export async function fetchTikTokMedia(
  url: string,
  mode: DownloadMode = "media",
): Promise<TikTokMedia> {
  const key = `${mode}:${url}`;
  const cached = metaCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.data;

  const providers = [fetchTikWM, fetchAlya, fetchAlyaV2];
  const isAudio = mode !== "media";
  const errorMessage = isAudio
    ? "Ninguna API devolvió audio descargable de TikTok."
    : "Ninguna API devolvió enlaces de descarga válidos de TikTok.";
  const controller = new AbortController();
  try {
    const media = await Promise.any(
      providers.map(async (fetchMedia) => {
        const result = await fetchMedia(url, controller.signal);
        const urls = isAudio && result.type === "image" ? [] : [...result.urls];
        if (isAudio && result.audioUrl) {
          if (fetchMedia === fetchAlyaV2) urls.unshift(result.audioUrl);
          else urls.push(result.audioUrl);
        }
        if (!urls.length) throw new Error(errorMessage);
        return { ...result, urls };
      }),
    );
    pruneCache(metaCache);
    metaCache.set(key, { data: media, exp: Date.now() + CACHE_TTL });
    return media;
  } catch {
    throw new Error(errorMessage);
  } finally {
    controller.abort();
  }
}

export async function downloadTikTokFile(
  urls: string[],
  timeout: number,
  errorMessage: string,
): Promise<string> {
  for (const url of new Set(urls)) {
    try {
      return await downloadToCache(url, timeout);
    } catch {
      // Intenta el siguiente enlace de la misma respuesta.
    }
  }
  throw new Error(errorMessage);
}

