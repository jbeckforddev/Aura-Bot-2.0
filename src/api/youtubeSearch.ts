import { LRUCache } from "lru-cache";
import { requestJson, requestText } from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";

export type YouTubeSearchVideo = {
  videoId: string;
  title: string;
  url: string;
  author: string;
  duration: string;
  views: number;
  likes?: number | string;
  winner: string;
  thumbnail: string;
};

type YouTubeSearchVideoResult = Omit<YouTubeSearchVideo, "winner">;

interface DeliriusYtItem {
  title?: string;
  videoId?: string;
  url?: string;
  author?: string | { name?: string };
  duration?: string;
  views?: string | number;
  likes?: string | number;
  likeCount?: string | number;
  image?: string;
  thumbnail?: string;
}

interface DeliriusYtResponse {
  status?: boolean;
  creator?: string;
  data?: DeliriusYtItem[];
}

interface FaaYtItem {
  title?: string;
  link?: string;
  channel?: string;
  duration?: string;
  views?: string | number;
  likes?: string | number;
  likeCount?: string | number;
  imageUrl?: string;
}

interface FaaYtResponse {
  status?: boolean;
  creator?: string;
  result?: FaaYtItem[];
}

interface AlyaYtItem {
  title?: string;
  autor?: string;
  duration?: string;
  views?: string | number;
  banner?: string;
  url?: string;
}

interface AlyaYtResponse {
  status?: boolean;
  creator?: string;
  result?: AlyaYtItem[];
}

interface SearchVideoItem {
  title?: string;
  videoId?: string;
  url?: string;
  author?: string;
  duration?: string;
  views?: string | number;
  likes?: string | number;
  thumbnail?: string;
}

interface YouTubeText {
  simpleText?: string;
  runs?: { text?: string }[];
}

interface YouTubeVideoRenderer {
  videoId?: string;
  title?: YouTubeText;
  ownerText?: YouTubeText;
  lengthText?: YouTubeText;
  viewCountText?: YouTubeText;
  publishedTimeText?: YouTubeText;
}

const YOUTUBE_SEARCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
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

function parseLikes(
  likes: string | number | undefined,
): number | string | undefined {
  if (typeof likes === "number" || likes === undefined) return likes;
  const value = likes.trim();
  if (!value) return undefined;
  if (/^\d[\d,]*$/.test(value)) return Number(value.replace(/,/g, ""));
  return value;
}

async function fetchYouTubeLikes(videoId: string): Promise<number | string | undefined> {
  const html = await requestText(
    `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    15000,
    {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  );
  const match = html.match(/"iconName":"LIKE","title":"([^"]+)"/);
  return match ? parseLikes(match[1]) : undefined;
}

async function fillMissingLikes(
  videos: YouTubeSearchVideo[],
): Promise<YouTubeSearchVideo[]> {
  await Promise.all(
    videos.slice(0, 5).map(async (video) => {
      if (video.likes !== undefined || !video.videoId) return;
      try {
        video.likes = await fetchYouTubeLikes(video.videoId);
      } catch (error) {
        console.warn(
          `No se pudieron obtener los likes de YouTube (${video.videoId}):`,
          error,
        );
      }
    }),
  );
  return videos;
}

function mapVideoItems(items: SearchVideoItem[]): YouTubeSearchVideoResult[] {
  return items
    .filter(
      (item): item is SearchVideoItem & { title: string } =>
        Boolean(item.title && (item.url || item.videoId)),
    )
    .map((item) => {
      const videoId = item.videoId || extractVideoId(item.url || "", item.thumbnail);
      return {
        videoId,
        title: item.title,
        url: videoId ? `https://youtu.be/${videoId}` : item.url || "",
        author: item.author || "Desconocido",
        duration: item.duration || "",
        views: parseViews(item.views),
        likes: parseLikes(item.likes),
        thumbnail:
          item.thumbnail ||
          (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ""),
      };
    });
}

function requireResults(
  videos: YouTubeSearchVideoResult[],
): YouTubeSearchVideoResult[] {
  if (videos.length === 0) {
    throw new Error("No se encontraron resultados en YouTube.");
  }
  return videos;
}

function parseYouTubeInitialData(html: string): unknown {
  const marker = /(?:var\s+ytInitialData|ytInitialData)\s*=\s*/g;
  const match = marker.exec(html);
  if (!match) throw new Error("No se pudo leer la página de resultados de YouTube.");

  const start = html.indexOf("{", marker.lastIndex);
  if (start === -1) throw new Error("Los resultados de YouTube no tienen datos válidos.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth++;
    } else if (character === "}") {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1));
    }
  }

  throw new Error("Los datos de resultados de YouTube están incompletos.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getYouTubeText(value: unknown): string {
  if (!isRecord(value)) return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (!Array.isArray(value.runs)) return "";
  return value.runs
    .filter((run): run is Record<string, unknown> => isRecord(run))
    .map((run) => (typeof run.text === "string" ? run.text : ""))
    .join("");
}

function collectYouTubeVideoRenderers(
  value: unknown,
  videos: YouTubeVideoRenderer[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectYouTubeVideoRenderers(item, videos);
    return;
  }
  if (!isRecord(value)) return;

  if (isRecord(value.videoRenderer)) {
    videos.push(value.videoRenderer as YouTubeVideoRenderer);
    return;
  }
  for (const child of Object.values(value)) {
    collectYouTubeVideoRenderers(child, videos);
  }
}

async function searchYouTubeScraper(
  query: string,
): Promise<YouTubeSearchVideoResult[]> {
  const searchUrl = new URL("https://www.youtube.com/results");
  searchUrl.searchParams.set("search_query", query);
  searchUrl.searchParams.set("hl", "es");
  const html = await requestText(searchUrl.toString(), 30000, {
    "User-Agent": YOUTUBE_SEARCH_USER_AGENT,
    "Accept-Language": "es-ES,es;q=0.9",
    Cookie: "CONSENT=YES+1; SOCS=CAI",
  });
  const initialData = parseYouTubeInitialData(html);
  const renderers: YouTubeVideoRenderer[] = [];
  collectYouTubeVideoRenderers(initialData, renderers);

  return requireResults(
    mapVideoItems(
      renderers
        .filter((video) => video.videoId && video.lengthText)
        .map((video) => ({
          videoId: video.videoId,
          title: getYouTubeText(video.title) || "Sin título",
          author: getYouTubeText(video.ownerText) || "Desconocido",
          duration: getYouTubeText(video.lengthText) || "--:--",
          views: getYouTubeText(video.viewCountText),
          thumbnail: video.videoId
            ? `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`
            : undefined,
        })),
    ),
  );
}

async function searchDelirius(query: string): Promise<YouTubeSearchVideoResult[]> {
  const response = await requestJson<DeliriusYtResponse>(
    `https://api.delirius.online/search/ytsearch?q=${encodeURIComponent(query)}`,
    30000,
    { "User-Agent": "AuraReedBot/2.0" },
  );

  if (!response?.status || !Array.isArray(response.data)) {
    throw new Error("Delirius no devolvió resultados de YouTube.");
  }

  return requireResults(
    mapVideoItems(
      response.data.map((item) => ({
        title: item.title,
        videoId: item.videoId,
        url: item.url,
        author:
          typeof item.author === "string" ? item.author : item.author?.name,
        duration: item.duration,
        views: item.views,
        likes: item.likes ?? item.likeCount,
        thumbnail: item.image || item.thumbnail,
      })),
    ),
  );
}

async function searchFaa(query: string): Promise<YouTubeSearchVideoResult[]> {
  const response = await requestJson<FaaYtResponse>(
    `https://api-faa.my.id/faa/youtube?q=${encodeURIComponent(query)}`,
    30000,
    { "User-Agent": "AuraReedBot/2.0" },
  );

  if (!response?.status || !Array.isArray(response.result)) {
    throw new Error("FAA no devolvió resultados de YouTube.");
  }

  return requireResults(
    mapVideoItems(
      response.result.map((item) => ({
        title: item.title,
        url: item.link,
        author: item.channel,
        duration: item.duration,
        views: item.views,
        likes: item.likes ?? item.likeCount,
        thumbnail: item.imageUrl,
      })),
    ),
  );
}

async function searchAlya(query: string): Promise<YouTubeSearchVideoResult[]> {
  const endpoint = new URL(
    "search/yt",
    DL_CONFIG.alya.BASE_URL.endsWith("/")
      ? DL_CONFIG.alya.BASE_URL
      : `${DL_CONFIG.alya.BASE_URL}/`,
  );
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("key", DL_CONFIG.alya.API_KEY);
  const response = await requestJson<AlyaYtResponse>(
    endpoint.toString(),
    30000,
    { "User-Agent": "AuraReedBot/2.0" },
  );

  if (!response?.status || !Array.isArray(response.result)) {
    throw new Error("Alya no devolvió resultados de YouTube.");
  }

  return requireResults(
    mapVideoItems(
      response.result.map((item) => ({
        title: item.title,
        url: item.url,
        author: item.autor,
        duration: item.duration,
        views: item.views,
        thumbnail: item.banner,
      })),
    ),
  );
}

export async function searchYouTubeVideos(
  query: string,
): Promise<YouTubeSearchVideo[]> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) throw new Error("Escribe qué quieres buscar en YouTube.");

  const cached = searchResultsByQuery.get(normalizedQuery);
  if (cached && cached.length > 0) return cached;

  const raceStartedAt = Date.now();
  const providers: {
    source: string;
    search: (query: string) => Promise<YouTubeSearchVideoResult[]>;
  }[] = [
    { source: "Delirius API", search: searchDelirius },
    { source: "FAA API", search: searchFaa },
    { source: "Alya API", search: searchAlya },
    { source: "YouTube scraper", search: searchYouTubeScraper },
  ];
  const videos = await Promise.any(
    providers.map(async ({ source, search }) => {
      const results = await search(query);
      return {
        source: `${source} (${Date.now() - raceStartedAt}ms)`,
        results,
      };
    }),
  );
  const taggedVideos = videos.results.map((video) => ({
    ...video,
    winner: videos.source,
  }));
  await fillMissingLikes(taggedVideos);
  searchResultsByQuery.set(normalizedQuery, taggedVideos);
  return taggedVideos;
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

console.log(searchYouTubeVideos("Hola remix").then((videos) => {
  console.log("Resultados de búsqueda de YouTube:", videos[0]);
}));