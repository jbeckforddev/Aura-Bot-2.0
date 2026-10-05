import { LRUCache } from "lru-cache";
import yts from "yt-search";

export type YouTubeSearchVideo = {
  videoId: string;
  title: string;
  url: string;
  author: string;
  duration: string;
  views: number;
  thumbnail: string;
};

const RECENT_VIDEO_LIMIT = 12;
const SEARCH_RESULTS_TTL_MS = 10 * 60 * 1000;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
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

async function searchVideos(query: string) {
  try {
    return (await yts(query)).videos || [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/http status:\s*302\b/i.test(message)) throw error;

    const result = await yts({ query, userAgent: BROWSER_USER_AGENT });
    return result.videos || [];
  }
}

export async function searchYouTubeVideo(
  query: string,
): Promise<YouTubeSearchVideo> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) throw new Error("Escribe qué quieres buscar en YouTube.");

  let availableVideos = searchResultsByQuery.get(normalizedQuery);
  if (!availableVideos) {
    const videos = await searchVideos(query);
    availableVideos = videos
      .filter((video) => video.videoId && video.url && video.title)
      .map((video) => ({
        videoId: video.videoId,
        title: video.title,
        url: video.url,
        author: video.author?.name || "Desconocido",
        duration: video.timestamp || video.duration?.timestamp || "",
        views: Number(video.views) || 0,
        thumbnail: video.thumbnail || "",
      }));

    if (availableVideos.length > 0) {
      searchResultsByQuery.set(normalizedQuery, availableVideos);
    }
  }

  if (availableVideos.length === 0) {
    throw new Error("No se encontraron resultados en YouTube.");
  }

  const recentIds = recentVideosByQuery.get(normalizedQuery) || [];
  const recentIdSet = new Set(recentIds);
  let selected = availableVideos.find(
    (video) => !recentIdSet.has(video.videoId),
  );

  if (!selected) {
    selected =
      availableVideos.find((video) => video.videoId !== recentIds[0]) ||
      availableVideos[0];
  }

  recentVideosByQuery.set(
    normalizedQuery,
    [selected.videoId, ...recentIds.filter((id) => id !== selected.videoId)].slice(
      0,
      RECENT_VIDEO_LIMIT,
    ),
  );

  return selected;
}