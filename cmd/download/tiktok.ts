import { rm } from "node:fs/promises";
import {
  downloadToCache,
  pickSearchResult,
  requestJson,
  safeFileName,
  formatCount,
} from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import type {
  CommandContext,
  TikTokSearchResponse,
} from "../../types/index.d.ts";
import { isTikTokUrl, tiktokUrlFormatter } from "../../utils/formatter.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { CONVERT_TO_AVC } from "../../utils/converter.ts";
import { sendAlbumMessage } from "../../core/mediaSendUtils.ts";
import { t } from "../../src/langs/index.ts";

const ALYA_API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const KEY = DL_CONFIG.alya.API_KEY;
const TIKWM_API = "https://www.tikwm.com/api";
const CACHE_TTL = 300_000;
const METADATA_TIMEOUT = 45_000;

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
  views?: number | string;
  likes?: number | string;
  comments?: number | string;
  shares?: number | string;
  urls: string[];
} & ({ type: "image"; audioUrl?: string } | { type: "video" });

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

const searchCache = new Map<string, { url: string; exp: number }>();
const metaCache = new Map<string, { data: TikTokMedia; exp: number }>();

function pruneCache<T>(cache: Map<string, { exp: number } & T>) {
  if (cache.size <= 150) return;
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.exp <= now) cache.delete(key);
  }
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

  const details = {
    id: data.id,
    title: data.title,
    author: data.author,
    views: data.play_count,
    likes: data.digg_count,
    comments: data.comment_count,
    shares: data.share_count,
  };
  const images = Array.isArray(data.images) ? data.images.filter(isDownloadUrl) : [];
  const audioUrl = data.music_info?.play;
  if (images.length > 0) {
    return {
      ...details,
      type: "image",
      urls: images,
      audioUrl: isDownloadUrl(audioUrl) ? audioUrl : undefined,
    };
  }

  const urls = [data.hdplay, data.play, data.wmplay].filter(isDownloadUrl);
  if (urls.length === 0) throw new Error("TikWM no devolvió enlaces de descarga.");
  return { ...details, type: "video", urls };
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
  if (urls.length === 0) throw new Error("Alya no devolvió enlaces de descarga.");
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

async function fetchTikTokMedia(url: string): Promise<TikTokMedia> {
  const cached = metaCache.get(url);
  if (cached && cached.exp > Date.now()) return cached.data;

  const controller = new AbortController();
  try {
    const media = await Promise.any([
      fetchTikWM(url, controller.signal),
      fetchAlya(url, controller.signal),
    ]);
    pruneCache(metaCache);
    metaCache.set(url, { data: media, exp: Date.now() + CACHE_TTL });
    return media;
  } catch {
    throw new Error("Ninguna API devolvió enlaces de descarga válidos de TikTok.");
  } finally {
    controller.abort();
  }
}

async function downloadTikTokVideo(urls: string[]): Promise<string> {
  for (const url of new Set(urls)) {
    try {
      return await downloadToCache(url, 150000);
    } catch {
      // Intenta el siguiente enlace de la misma respuesta.
    }
  }
  throw new Error("No se pudo descargar el video desde el servidor de origen.");
}

export default {
  name: ["tk", "tt", "ttv", "tiktok", "tkmp4"],
  category: "download",
  description: t("cmd_busca_y_descarga_videos_de_tik_fd0719dc"),
  async run(ctx: CommandContext) {
    const { args = [], reply, react, sock, from, msg } = ctx;
    const query = Array.isArray(args) ? args.join(" ").trim() : String(args ?? "").trim();
    if (!query) return reply(t("cmd_proporciona_una_busqueda_o_un__4bcc0240"));

    void react("⏳").catch(() => undefined);

    const tempFiles = new Set<string>();

    try {
      const formattedUrl = tiktokUrlFormatter(query);
      let url: string;
      const now = Date.now();

      if (isTikTokUrl(formattedUrl)) {
        url = formattedUrl;
      } else {
        const cachedKey = query.toLowerCase();
        const cachedSearch = searchCache.get(cachedKey);

        if (cachedSearch && cachedSearch.exp > now) {
          url = cachedSearch.url;
        } else {
          const search = await requestJson<TikTokSearchResponse>(
            `${ALYA_API}/search/tiktok?query=${encodeURIComponent(query)}&key=${KEY}`,
          ).catch(() => null);
          const result = pickSearchResult(search?.data, query);
          if (!result?.url) throw new Error("No se encontró ningún video para esa búsqueda.");
          url = result.url;
          pruneCache(searchCache);
          searchCache.set(cachedKey, { url, exp: now + CACHE_TTL });
        }
      }

      const media = await fetchTikTokMedia(url);
      const { id, author: account, views, likes, comments, shares } = media;
      const author =
        account?.nickname || account?.fullname || account?.unique_id || "Desconocido";
      const title = media.title || "TikTok";
      const postPath = media.type === "image" ? "photo" : "video";
      const postUrl = account?.unique_id && id
        ? `https://www.tiktok.com/@${account.unique_id}/${postPath}/${id}`
        : url;

      if (media.type === "image") {
        const { audioUrl } = media;
        const imagePromises = media.urls.slice(0, 20).map(async (imageUrl) => {
          const file = await downloadToCache(imageUrl, 45000);
          tempFiles.add(file);
          const charge = await prepareDownloadCharge(ctx, "image", file);
          return { file, cost: charge.cost };
        });

        const audioPromise = audioUrl
          ? (async () => {
              const file = await downloadToCache(audioUrl, 90000);
              tempFiles.add(file);
              const charge = await prepareDownloadCharge(ctx, "document", file);
              return { file, cost: charge.cost };
            })()
          : Promise.resolve({ file: "", cost: 0 });

        const [downloadedImages, audioResult] = await Promise.all([
          Promise.all(imagePromises),
          audioPromise,
        ]);

        const totalCost =
          downloadedImages.reduce((sum, img) => sum + img.cost, 0) +
          audioResult.cost;
        const formattedCost = formatMoney(totalCost, ctx);

        const caption = DL_TEMPLATE({
          bold: fytBold,
          label: t("cmd_tiktok_images_c263451e"),
          icon: t("cmd_text_91a64201"),
          title,
          author,
          views: formatCount(views),
          likes: formatCount(likes),
          comments: formatCount(comments),
          shares: formatCount(shares),
          cost: formattedCost,
          url: postUrl,
          showAuthor: true,
          showViews: views !== undefined && views !== null,
          showLikes: likes !== undefined && likes !== null,
          showComments: comments !== undefined && comments !== null,
          showShares: shares !== undefined && shares !== null,
          loadingText: t("cmd_album_listo_458c0141"),
        });

        const album = downloadedImages.map((img, index) => ({
          image: { url: img.file },
          caption: index === 0 ? caption : "",
        }));

        const sendTasks: Promise<unknown>[] = [];

        if (audioResult.file) {
          sendTasks.push(
            reply({
              audio: { url: audioResult.file },
              mimetype: "audio/mpeg",
              fileName: `${safeFileName(title, "tiktok")}.mp3`,
            }),
          );
        }

        if (album.length === 1) {
          sendTasks.push(reply(album[0]));
        } else {
          sendTasks.push(sendAlbumMessage(sock, from, album, msg as any));
        }

        await Promise.all(sendTasks);
        confirmDownloadCharge(ctx);
        void react("✅").catch(() => undefined);
        return;
      }

      const file = await downloadTikTokVideo(media.urls);
      tempFiles.add(file);

      const [convertedFile, { cost }] = await Promise.all([
        CONVERT_TO_AVC(file),
        prepareDownloadCharge(ctx, "video", file),
      ]);
      tempFiles.add(convertedFile);

      const formattedCost = formatMoney(cost, ctx);

      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_tiktok_video_78e6c154"),
        icon: t("cmd_text_a2865ecb"),
        title,
        author,
        views: formatCount(views),
        likes: formatCount(likes),
        comments: formatCount(comments),
        shares: formatCount(shares),
        cost: formattedCost,
        url: postUrl,
        showAuthor: true,
        showViews: views !== undefined && views !== null,
        showLikes: likes !== undefined && likes !== null,
        showComments: comments !== undefined && comments !== null,
        showShares: shares !== undefined && shares !== null,
        loadingText: t("cmd_listo_mi_compa_f240d06d"),
      });

      await reply({
        video: { url: convertedFile },
        mimetype: "video/mp4",
        fileName: `${safeFileName(title, "tiktok")}.mp4`,
        caption,
      });

      confirmDownloadCharge(ctx);
      void react("✅").catch(() => undefined);
    } catch (error: unknown) {
      void react("❌").catch(() => undefined);
      const message =
        error instanceof Error ? error.message : "No se pudo descargar el video.";
      await reply({ text: t("cmd_value0_bb624cd4", { value0: message }) }).catch(
        () => undefined,
      );
    } finally {
      if (tempFiles.size > 0) {
        void Promise.allSettled(
          Array.from(tempFiles, (file) => rm(file, { force: true })),
        );
      }
    }
  },
};
