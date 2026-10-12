import undici from "undici";

const HEADER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 10000;
type YouTubeVideo = {
  id: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  likes: string;
  url: string;
  thumbnail: string;
  channel_url: string;
};

type YouTubeSearchResponse =
  | {
      status: "success";
      statusCode?: number;
      creator: string;
      ping?: string;
      results: YouTubeVideo[];
    }
  | {
      status: "failed";
      statusCode: number;
      creator: string;
      ping?: number;
      results: [];
      error: string;
    };

export type YouTubeSearchVideo = {
  videoId: string;
  title: string;
  url: string;
  author: string;
  duration: string;
  views: number | string;
  likes?: number | string;
  winner: string;
  thumbnail: string;
};

function formatTime(duration: string): string {
  const parts = duration.split(":").map(Number);
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    parts.some((part) => !Number.isInteger(part) || part < 0) ||
    parts[parts.length - 1] >= 60 ||
    (parts.length === 3 && parts[1] >= 60)
  ) {
    return duration;
  }

  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0], parts[1]];
  const formatted = [
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    seconds ? `${seconds}s` : "",
  ].filter(Boolean);

  return formatted.join(" ") || "0s";
}

async function getVideoLikes(videoId: string): Promise<string> {
  const response = await undici.fetch(
    `https://www.youtube.com/watch?v=${videoId}&hl=es`,
    {
      headers: {
        "User-Agent": HEADER,
        "Accept-Language": "es-ES,es;q=0.9",
        Cookie: "CONSENT=YES+1; SOCS=CAI",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(
      `YouTube respondió con HTTP ${response.status} al obtener los likes`,
    );
  }

  const html = await response.text();
  const match = html.match(/"likeCount":"(\d+)"/);
  if (!match)
    throw new Error(
      `No se pudo obtener el contador de likes del video ${videoId}`,
    );

  return Number(match[1]).toLocaleString("es-MX");
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

export async function searchYouTube(
  query: string,
  limit = 10,
): Promise<YouTubeSearchResponse> {
  try {
    const SEARCH_URL = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es`;
    const lat = Date.now();
    const res = await undici.fetch(SEARCH_URL, {
      headers: {
        "User-Agent": HEADER,
        "Accept-Language": "es-ES,es;q=0.9",
        Cookie: "CONSENT=YES+1; SOCS=CAI",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const ping = Date.now() - lat;

    if (!res.ok) {
      throw new Error(`YouTube respondió con HTTP ${res.status}`);
    }

    const html = await res.text();
    const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
    if (!match) throw new Error("No se pudo leer la página de YouTube");

    const data = JSON.parse(match[1]);
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || [];

    const results: YouTubeVideo[] = [];
    for (const section of sections) {
      for (const item of section?.itemSectionRenderer?.contents || []) {
        const video = item.videoRenderer;
        if (!video?.videoId || !video.lengthText) continue;
        results.push({
          id: video.videoId,
          title: video.title?.runs?.[0]?.text || "Sin título",
          channel: video.ownerText?.runs?.[0]?.text || "Desconocido",
          duration: formatTime(video.lengthText?.simpleText || "--:--"),
          views: formatCount(video.viewCountText?.simpleText || ""),
          likes: "",
          url: `https://youtu.be/${video.videoId}`,
          channel_url: `https://www.youtube.com/channel/${video.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || ""}`,
          thumbnail: `https://i.ytimg.com/vi/${video.videoId}/maxresdefault.jpg`,
        });
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }
    if (results.length === 0) {
      return {
        creator: "Jeriel B.",
        status: "failed",
        ping: undefined,
        statusCode: 404,
        results: [],
        error: "No se encontraron resultados",
      };
    }

    const resultsWithLikes = await Promise.all(
      results.map(async (video) => {
        let likes = "0";
        try {
          likes = formatCount(await getVideoLikes(video.id));
        } catch {
          throw new Error(`No se pudo obtener el contador de likes del video ${video.id}`);
        }
        return { ...video, likes };
      }),
    );
    return {
      creator: "Jeriel B.",
      status: "success",
      statusCode: 200,
      ping: `${ping}ms`,
      results: resultsWithLikes,
    };
  } catch (error: unknown) {
    return {
      creator: "Jeriel B.",
      status: "failed",
      statusCode: 500,
      ping: undefined,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function searchYouTubeVideos(
  query: string,
  limit = 5,
): Promise<YouTubeSearchVideo[]> {
  const response = await searchYouTube(query, limit);
  if (response.status !== "success") throw new Error(response.error);

  return response.results.map((video) => ({
    videoId: video.id,
    title: video.title,
    url: video.url,
    author: video.channel,
    duration: video.duration,
    views: video.views,
    likes: video.likes || undefined,
    winner: "YouTube",
    thumbnail: video.thumbnail,
  }));
}

export async function searchYouTubeVideo(
  query: string,
): Promise<YouTubeSearchVideo> {
  const [video] = await searchYouTubeVideos(query, 1);
  if (!video) throw new Error("No se encontraron resultados en YouTube.");
  return video;
}
