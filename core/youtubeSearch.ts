import { LRUCache } from "lru-cache";
import { DL_CONFIG } from "../config.ts";
import { requestJson } from "./downloadUtils.ts";

export type YouTubeSearchVideo = {
  videoId: string;
  title: string;
  url: string;
  author: string;
  duration: string;
  views: number;
  thumbnail: string;
};

interface AlyacoreYtItem {
  title: string;
  autor?: string;
  author?: string;
  duration?: string;
  views?: string | number;
  uploaded?: string;
  banner?: string;
  thumbnail?: string;
  url: string;
}

interface AlyacoreYtResponse {
  status: boolean;
  creator?: string;
  result?: AlyacoreYtItem[];
}

const API_KEY = DL_CONFIG.alya.API_KEY;
const BASE_URL = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");

const RECENT_VIDEO_LIMIT = 12;
const SEARCH_RESULTS_TTL_MS = 10 * 60 * 1000;
const recentVideosByQuery = new LRUCache<string, string[]>({
  max: 500,
  ttl: 24 * 60 * 60 * 1000,
});
const searchResultsByQuery = new LRUCache<string, YouTubeSearchVideo[]>({
  max: 500,
  ttl: SEARCH_RESULTS_TTL_MS,
});

function normalizeQuery(query: string): string {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractVideoId(url: string, banner = ""): string {
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const bannerMatch = banner.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
  if (bannerMatch) return bannerMatch[1];
  return "";
}

function parseViews(views: string | number | undefined): number {
  if (typeof views === "number") return views;
  if (!views) return 0;
  const cleaned = String(views).replace(/[^\d]/g, "");
  return parseInt(cleaned, 10) || 0;
}

export async function searchYouTubeVideos(
  query: string,
): Promise<YouTubeSearchVideo[]> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) throw new Error("Escribe qué quieres buscar en YouTube.");

  const cached = searchResultsByQuery.get(normalizedQuery);
  if (cached && cached.length > 0) return cached;

  const searchUrl = `${BASE_URL}/search/yt?query=${encodeURIComponent(query)}&key=${API_KEY}`;
  const response = await requestJson<AlyacoreYtResponse>(searchUrl, 30000, {
    "User-Agent": "AuraReedBot/2.0",
  });

  if (!response?.status || !Array.isArray(response.result) || response.result.length === 0) {
    throw new Error("No se encontraron resultados en YouTube.");
  }

  const videos: YouTubeSearchVideo[] = response.result
    .filter((item) => item.url && item.title)
    .map((item) => {
      const banner = item.banner || item.thumbnail || "";
      const videoId = extractVideoId(item.url, banner);
      return {
        videoId,
        title: item.title,
        url: item.url,
        author: item.autor || item.author || "Desconocido",
        duration: item.duration || "",
        views: parseViews(item.views),
        thumbnail: banner || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ""),
      };
    });

  if (videos.length > 0) {
    searchResultsByQuery.set(normalizedQuery, videos);
  }

  return videos;
}

export async function searchYouTubeVideo(
  query: string,
): Promise<YouTubeSearchVideo> {
  const normalizedQuery = normalizeQuery(query);
  const availableVideos = await searchYouTubeVideos(query);

  if (availableVideos.length === 0) {
    throw new Error("No se encontraron resultados en YouTube.");
  }

  const recentIds = recentVideosByQuery.get(normalizedQuery) || [];
  const recentIdSet = new Set(recentIds);
  let selected = availableVideos.find(
    (video) => video.videoId && !recentIdSet.has(video.videoId),
  );

  if (!selected) {
    selected =
      availableVideos.find((video) => video.videoId && video.videoId !== recentIds[0]) ||
      availableVideos[0];
  }

  if (selected.videoId) {
    recentVideosByQuery.set(
      normalizedQuery,
      [selected.videoId, ...recentIds.filter((id) => id !== selected.videoId)].slice(
        0,
        RECENT_VIDEO_LIMIT,
      ),
    );
  }

  return selected;
}