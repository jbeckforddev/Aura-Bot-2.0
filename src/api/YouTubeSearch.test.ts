import { fetch } from "undici";

const HEADER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 10000;
const CONCURRENCY = 5;

const REQ_HEADERS = {
  "User-Agent": HEADER,
  "Accept-Language": "es-ES,es;q=0.9",
  Cookie: "CONSENT=YES+1; SOCS=CAI",
};

type YouTubeVideo = {
  id: string;
  title: string;
  description: string;
  channel: string;
  channel_id: string;
  channel_url: string;
  channel_avatar: string;
  verified: boolean;
  subscribers: string;
  duration: string;
  duration_seconds: number;
  views: string;
  views_count: number;
  likes: string;
  likes_count: number;
  published: string;
  upload_date: string;
  category: string;
  keywords: string[];
  is_live: boolean;
  url: string;
  thumbnail: string;
};

type YouTubeSearchResponse =
  | {
      status: "success";
      statusCode: number;
      creator: string;
      ping: string;
      results: YouTubeVideo[];
    }
  | {
      status: "failed";
      statusCode: number;
      creator: string;
      ping?: string;
      results: [];
      error: string;
    };

/* ---------- helpers ---------- */

const text = (o: any): string =>
  o?.simpleText ?? o?.runs?.map((r: any) => r.text).join("") ?? "";

// Quita puntos/comas de miles: "1.234.567 visualizaciones" -> 1234567
function parseCount(value: unknown): number {
  const raw = String(value ?? "");
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function durationToSeconds(d: string): number {
  const p = d.split(":").map(Number);
  if (p.some((x) => !Number.isInteger(x) || x < 0)) return 0;
  return p.reduce((acc, x) => acc * 60 + x, 0);
}

function formatTime(duration: string): string {
  const parts = duration.split(":").map(Number);
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    parts.some((x) => !Number.isInteger(x) || x < 0)
  ) {
    return duration;
  }
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return (
    [h ? `${h}h` : "", m ? `${m}m` : "", s ? `${s}s` : ""]
      .filter(Boolean)
      .join(" ") || "0s"
  );
}

// Extrae un JSON balanceado (respeta strings) después de un marcador
function extractJson(html: string, marker: string): any | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf("{", idx);
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Busca recursivamente la primera clave que cumpla
function findKey(obj: any, key: string, depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 25) return undefined;
  if (key in obj) return obj[key];
  for (const k in obj) {
    const found = findKey(obj[k], key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: REQ_HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`YouTube respondió con HTTP ${res.status}`);
  }
  return res.text();
}

/* ---------- datos extra de la página del video ---------- */

type Extra = Partial<
  Pick<
    YouTubeVideo,
    | "likes_count"
    | "views_count"
    | "description"
    | "upload_date"
    | "category"
    | "keywords"
    | "subscribers"
    | "is_live"
  >
>;

async function getVideoExtra(videoId: string): Promise<Extra> {
  const html = await get(`https://www.youtube.com/watch?v=${videoId}&hl=es`);
  const initial = extractJson(html, "var ytInitialData");
  const player = extractJson(html, "var ytInitialPlayerResponse");

  const details = player?.videoDetails;
  const micro = player?.microformat?.playerMicroformatRenderer;

  // --- likes (varios métodos, del más fiable al menos) ---
  let likes = 0;
  const m = html.match(/"likeCount":"(\d+)"/);
  if (m) likes = Number(m[1]);

  if (!likes && initial) {
    // viewModel nuevo
    const a11y = findKey(initial, "likeButtonViewModel");
    const label: string | undefined =
      a11y?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel
        ?.defaultButtonViewModel?.buttonViewModel?.accessibilityText ??
      a11y?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel
        ?.buttonViewModel?.accessibilityText;
    if (label) likes = parseCount(label);
  }
  if (!likes && initial) {
    const content = findKey(initial, "likeCountIfIndifferent")?.content;
    if (content) likes = parseCount(content);
  }

  // --- suscriptores ---
  const owner = findKey(initial, "videoOwnerRenderer");
  const subscribers = text(owner?.subscriberCountText);

  return {
    likes_count: likes,
    views_count: parseCount(details?.viewCount),
    description: details?.shortDescription ?? "",
    upload_date: micro?.uploadDate ?? micro?.publishDate ?? "",
    category: micro?.category ?? "",
    keywords: details?.keywords ?? [],
    subscribers,
    is_live: Boolean(details?.isLiveContent && details?.isLive),
  };
}

// Ejecuta tareas con límite de concurrencia
async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/* ---------- principal ---------- */

export default async function searchYouTube(
  query: string,
  limit = 10,
): Promise<YouTubeSearchResponse> {
  const creator = "Jeriel B.";
  try {
    const t0 = Date.now();
    const html = await get(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es`,
    );
    const ping = `${Date.now() - t0}ms`;

    const data = extractJson(html, "var ytInitialData");
    if (!data) throw new Error("No se pudo leer la página de YouTube");

    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents ?? [];

    const base: YouTubeVideo[] = [];
    for (const section of sections) {
      for (const item of section?.itemSectionRenderer?.contents ?? []) {
        const v = item.videoRenderer;
        if (!v?.videoId) continue;

        const isLive = (v.badges ?? []).some((b: any) =>
          /LIVE/i.test(b?.metadataBadgeRenderer?.style ?? ""),
        );
        const durationText = text(v.lengthText);
        if (!durationText && !isLive) continue;

        const run = v.ownerText?.runs?.[0];
        const channelId = run?.navigationEndpoint?.browseEndpoint?.browseId ?? "";
        const canonical =
          run?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ?? "";
        const thumbs = v.thumbnail?.thumbnails ?? [];
        const avatar =
          v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer
            ?.thumbnail?.thumbnails?.[0]?.url ?? "";
        const viewsCount = parseCount(text(v.viewCountText));

        base.push({
          id: v.videoId,
          title: text(v.title) || "Sin título",
          description: (v.detailedMetadataSnippets?.[0]?.snippetText?.runs ?? v.descriptionSnippet?.runs ?? [])
            .map((r: any) => r.text)
            .join(""),
          channel: run?.text || "Desconocido",
          channel_id: channelId,
          channel_url: canonical
            ? `https://www.youtube.com${canonical}`
            : channelId
              ? `https://www.youtube.com/channel/${channelId}`
              : "",
          channel_avatar: avatar.startsWith("//") ? `https:${avatar}` : avatar,
          verified: (v.ownerBadges ?? []).length > 0,
          subscribers: "",
          duration: durationText ? formatTime(durationText) : "LIVE",
          duration_seconds: durationToSeconds(durationText),
          views: formatCount(viewsCount),
          views_count: viewsCount,
          likes: "0",
          likes_count: 0,
          published: text(v.publishedTimeText),
          upload_date: "",
          category: "",
          keywords: [],
          is_live: isLive,
          url: `https://youtu.be/${v.videoId}`,
          thumbnail:
            thumbs[thumbs.length - 1]?.url?.split("?")[0] ||
            `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        });
        if (base.length >= limit) break;
      }
      if (base.length >= limit) break;
    }

    if (base.length === 0) {
      return {
        creator,
        status: "failed",
        statusCode: 404,
        results: [],
        error: "No se encontraron resultados",
      };
    }

    const results = await pool(base, CONCURRENCY, async (video) => {
      try {
        const e = await getVideoExtra(video.id);
        const views = e.views_count || video.views_count;
        return {
          ...video,
          description: e.description || video.description,
          subscribers: e.subscribers || video.subscribers,
          upload_date: e.upload_date || video.upload_date,
          category: e.category || video.category,
          keywords: e.keywords?.length ? e.keywords : video.keywords,
          is_live: e.is_live ?? video.is_live,
          views_count: views,
          views: formatCount(views),
          likes_count: e.likes_count ?? 0,
          likes: formatCount(e.likes_count ?? 0),
        };
      } catch {
        return video; // si falla la página del video, conserva los datos de la búsqueda
      }
    });

    return { creator, status: "success", statusCode: 200, ping, results };
  } catch (error: unknown) {
    return {
      creator,
      status: "failed",
      statusCode: 500,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}