import { LRUCache } from "lru-cache";
import yts, { type VideoSearchResult } from "yt-search";
import { requestText } from "./downloadUtils.ts";

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

async function searchVideos(
  query: string,
): Promise<VideoSearchResult[]> {
  try {
    return (await yts(query)).videos || [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/http status:\s*302\b/i.test(message)) throw error;

    const url = `https://m.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=US`;
    const html = await requestText(url, 30000, {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html",
    });

    return new Promise<VideoSearchResult[]>((resolve, reject) => {
      yts._parseSearchResultInitialData(html, (parseError, results) => {
        if (parseError) {
          reject(
            parseError instanceof Error
              ? parseError
              : new Error(String(parseError)),
          );
          return;
        }
        resolve(results.filter((result) => result.type === "video"));
      });
    });
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

console.log(searchYouTubeVideo("Never Gonna Give You Up").then((video) => {
  console.log("Video encontrado:", video);
}).catch((error) => {
  console.error("Error al buscar video:", error);
}));