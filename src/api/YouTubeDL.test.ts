import { DL_CONFIG } from "../../config.ts";
import { fetch } from "undici";

interface YouTubeMetaData {
    id: string;
    title: string;
    channel: string;
    duration: string;
    views: string;
    likes?: string;
    size?: number;
    url: string;
    thumbnail: string;
    channel_url: string;
    dl_url?: string;
}

interface EndpointCreator{
    creator: "Jeriel B., AlyaApi, DeliriusApi, FaaApi",
    status: boolean,
    message: string,
    data: YouTubeMetaData,
}

interface AudioDownload {
    status?: boolean;
    message?: string;
    size?: number | string;
    data?: { dl?: string; download?: string; [key: string]: unknown, size?: number | string; };
    result?: { mp3?: string; [key: string]: unknown, size?: number | string; };
}

// Formateador de duración de video de YouTube (PT#H#M#S) a un formato legible
function formatDuration(duration?: string): string {
  if (!duration) return "0s";

  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return duration;

  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  const parts: string[] = [];

  if (Number(hours)) parts.push(`${hours}h`);
  if (Number(minutes)) parts.push(`${minutes}m`);
  if (Number(seconds)) parts.push(`${seconds}s`);

  return parts.join(" ") || "0s";
}

// Formateador de vistas y likes de YouTube (1,234,567) a un formato legible (1.2M)
function formatCount(valor: number | string): string {
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

const YT_REGEX: RegExp = /(?:https?:\/\/)?(?:www\.|m\.)?(?:music\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/i

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"

async function getYouTubeMetaData(
    url: string,
    fallback?: Partial<YouTubeMetaData>,
): Promise<EndpointCreator> {
    try {
        const YT_ID = url.match(YT_REGEX)?.[1];
        if (!YT_ID) throw new Error("URL de YouTube no válida.");
        const matchingFallback = fallback?.id === YT_ID ? fallback : undefined;
        const YT_URL = `https://www.youtube.com/watch?v=${YT_ID}`;
        const res = await fetch(YT_URL, {
            headers: {
                "User-Agent": UA,
                "Accept-Language": "es-ES,es;q=0.9",
                Cookie: "CONSENT=YES+1; SOCS=CAI",
            },
        });
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const dataHtml = await res.text();

        const PlayerParameters = [
            /var ytInitialPlayerResponse\s*=\s*(\{.+?\});<\/script>/s,
            /window\["ytInitialPlayerResponse"\]\s*=\s*(\{.+?\});<\/script>/s,
            /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s,
        ]
        let playerResponse: any = null;
        for (const pattern of PlayerParameters) {
            const match = dataHtml.match(pattern);
            if (match?.[1]) {
                try {
                    playerResponse = JSON.parse(match[1]);
                    break;
                } catch {
                    playerResponse = {};
                }
            }
        }
        const details = playerResponse?.videoDetails || {};
        const pageMatchesVideo = !details?.videoId || details.videoId === YT_ID;
        const matchingPlayer = details?.videoId === YT_ID ? details : undefined;

        // Título del Video
        const videoTitle = pageMatchesVideo
            ? dataHtml.match(/<meta property="og:title" content="(.+?)">/)?.[1]
            : undefined;
        const videoTitleAlt = matchingPlayer?.title;

        // ID del video
        const videoId = YT_ID;
        const videoIdAlt = matchingPlayer?.videoId;

        // Nombre del canal
        const channelName = matchingPlayer?.author || matchingPlayer?.ownerChannelName;
        const channelNameAlt = pageMatchesVideo
            ? dataHtml.match(/<link itemprop="name" content="(.+?)">/)?.[1]
            : undefined;

        // Duración del video
        const duration = pageMatchesVideo
            ? formatDuration(dataHtml.match(/<meta itemprop="duration" content="(.+?)">/)?.[1])
            : "";
        const durationAlt = matchingPlayer?.lengthSeconds
            ? formatDuration(`PT${matchingPlayer.lengthSeconds}S`)
            : "";

        // Vistas del video
        const views = matchingPlayer?.viewCount
            || dataHtml.match(/"viewCount":"([^"]+)"/)?.[1]
            || undefined;

        // Likes del video
        const likes = pageMatchesVideo
            ? dataHtml.match(/"likeCount":"([^"]+)"/)?.[1]
            : undefined;

        // Miniatura del video
        const thumbnail = pageMatchesVideo
            ? dataHtml.match(/<link itemprop="thumbnailUrl" href="(.+?)">/)?.[1]
            : undefined;
        const thumbnailAlt = matchingPlayer?.thumbnail?.thumbnails?.at(-1)?.url;

        // URL del canal
        const channelId = matchingPlayer?.channelId;
        const channelUrl = channelId
            ? `https://www.youtube.com/channel/${channelId}`
            : "";
        const channelUrlAlt = pageMatchesVideo
            ? dataHtml.match(/<link itemprop="url" href="(.+?)">/)?.[1]
            : undefined;

        const parsedDuration = duration !== "0s" ? duration : "";
        const isUsable = (value: string | undefined) =>
            Boolean(value && !/^unknown\b/i.test(value.trim()));

        return {
            creator: "Jeriel B., AlyaApi, DeliriusApi, FaaApi",
            status: true,
            message: "YouTube metadata fetched successfully",
            data: {
                id: matchingFallback?.id || videoId || videoIdAlt || "N/A",
                title: (isUsable(matchingFallback?.title) && matchingFallback?.title)
                    || (isUsable(videoTitleAlt) && videoTitleAlt)
                    || (isUsable(videoTitle) && videoTitle)
                    || "N/A",
                channel: (isUsable(matchingFallback?.channel) && matchingFallback?.channel)
                    || (isUsable(channelName) && channelName)
                    || (isUsable(channelNameAlt) && channelNameAlt)
                    || "N/A",
                duration: matchingFallback?.duration && matchingFallback.duration !== "0s"
                    ? matchingFallback.duration
                    : durationAlt || parsedDuration || "--:--",
                views: matchingFallback?.views || (views ? formatCount(views) : "N/A"),
                likes: matchingFallback?.likes || (likes ? formatCount(likes) : "N/A"),
                url: `https://youtu.be/${YT_ID}`,
                thumbnail: (matchingFallback?.thumbnail || thumbnail || thumbnailAlt || `https://i.ytimg.com/vi/${YT_ID}/hqdefault.jpg`).split("?")[0],
                channel_url: matchingFallback?.channel_url || channelUrl || channelUrlAlt || "N/A",
            }
        }
    } catch (error) {
        return {
            creator: "Jeriel B., AlyaApi, DeliriusApi, FaaApi",
            status: false,
            message: `Error fetching YouTube metadata: ${error}`,
            data: {} as YouTubeMetaData,
        };
    }
}

async function getAudio(url: string): Promise<AudioDownload> {
    const RaceDLAudioApis = [
        `${DL_CONFIG.alya.BASE_URL}dl/ytdlmp3?url=${encodeURIComponent(url)}&apikey=${DL_CONFIG.alya.API_KEY}`,
        `${DL_CONFIG.alya.BASE_URL}dl/ytmp3?url=${encodeURIComponent(url)}&apikey=${DL_CONFIG.alya.API_KEY}`,
        `${DL_CONFIG.alya.BASE_URL}dl/fastytmp3?url=${encodeURIComponent(url)}&apikey=${DL_CONFIG.alya.API_KEY}`,
        `${DL_CONFIG.alya.BASE_URL}dl/ytmp3v2?url=${encodeURIComponent(url)}&apikey=${DL_CONFIG.alya.API_KEY}`,
        `${DL_CONFIG.deliriusApi.BASE_URL}download/ytmp3?url=${encodeURIComponent(url)}`,
        `${DL_CONFIG.faaApi.BASE_URL}faa/ytmp3?url=${encodeURIComponent(url)}`,
        `${DL_CONFIG.faaApi.BASE_URL}faa/ytplay?query=${encodeURIComponent(url)}`,
    ]

    const fetchAudio = async (apiUrl: string) => {
        try {
            const res = await fetch(apiUrl, {
                headers: {
                    "User-Agent": UA,
                    "Accept-Language": "es-ES,es;q=0.9",
                },
            });
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const data = (await res.json()) as AudioDownload;
            const audioUrl = data.data?.dl || data.data?.download || data.result?.mp3;
            if (!data.status || typeof audioUrl !== "string") {
                throw new Error(`API error: ${data.message || "No audio URL in response"}`);
            }
            return {
                ...data,
                data: {
                    ...data.data,
                    ...data.result,
                    dl: audioUrl,
                    size: data.data?.size ?? data.result?.size ?? data.size,
                },
            };
        } catch (error) {
            throw new Error(`Error fetching audio from ${new URL(apiUrl).pathname}: ${error}`, { cause: error });
        }
    }

    return Promise.any(RaceDLAudioApis.map(fetchAudio));
}

async function getAudioSizeFromUrl(url: string): Promise<number | undefined> {
    const response = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return undefined;

    const size = Number(response.headers.get("content-length"));
    return Number.isFinite(size) && size > 0 ? size : undefined;
}

export default async function YoutubeAudioDownload(
    url: string,
    fallback?: Partial<YouTubeMetaData>,
): Promise<EndpointCreator> {
    const metadata = await getYouTubeMetaData(url, fallback);
    if (!metadata.status) {
        return metadata;
    }

    try {
        const audio = await getAudio(url);
        const audioUrl = audio.data?.dl;
        if (!audioUrl) {
            throw new Error("Audio API returned no download URL");
        }
        const rawSize = audio.data?.size;
        const parsedSize = typeof rawSize === "number" ? rawSize : Number(rawSize);
        const apiSize =
            Number.isFinite(parsedSize) && parsedSize > 0
                ? parsedSize
                : undefined;
        
        let size = apiSize;
        
        if (size === undefined) {
            try {
                size = await getAudioSizeFromUrl(audioUrl);
            } catch (error) {
                console.warn(
                    "[YouTubeDL] No se pudo determinar el tamaño:",
                    error
                );
            }
        }
        // No cancelar la descarga si el tamaño es desconocido
        size ??= 0;


        const audioTitle = audio.data?.title;
        const audioTitleFallback =
            typeof audioTitle === "string" &&
            audioTitle.trim() &&
            !/^(unknown title|sin título|audio)$/i.test(audioTitle.trim())
                ? audioTitle.trim()
                : undefined;

        const currentTitle = metadata.data.title;
        const titleIsMissing =
            !currentTitle?.trim() ||
            /^(unknown title|sin título|audio)$/i.test(currentTitle.trim());

        const title = titleIsMissing
            ? audioTitleFallback || currentTitle
            : currentTitle;

        return {
            ...metadata,
            data: { ...metadata.data, size, dl_url: audioUrl, title },
            message: "YouTube metadata and audio fetched successfully",
        };
    } catch (error) {
        return {
            ...metadata,
            status: false,
            message: `Metadata fetched, but audio download failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}