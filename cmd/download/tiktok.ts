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

const LEGACY_API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const KEY = DL_CONFIG.alya.API_KEY;
const TIKWM_API = "https://www.tikwm.com/api";
const CACHE_TTL = 300_000;

type TikWMVideoResponse = {
  code?: number;
  msg?: string;
  data?: {
    id?: string;
    title?: string;
    play?: string;
    wmplay?: string;
    hdplay?: string;
    images?: string[];
    music_info?: {
      play?: string;
    };
    author?: {
      nickname?: string;
      fullname?: string;
      unique_id?: string;
    };
    play_count?: number | string;
    digg_count?: number | string;
    comment_count?: number | string;
    share_count?: number | string;
  };
};

const searchCache = new Map<string, { url: string; exp: number }>();
const metaCache = new Map<string, { data: TikWMVideoResponse; exp: number }>();

function pruneCache<T>(cache: Map<string, { exp: number } & T>) {
  if (cache.size <= 150) return;
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.exp <= now) cache.delete(key);
  }
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
            `${LEGACY_API}/search/tiktok?query=${encodeURIComponent(query)}&key=${KEY}`,
          ).catch(() => null);
          const result = pickSearchResult(search?.data, query);
          if (!result?.url) throw new Error("No se encontró ningún video para esa búsqueda.");
          url = result.url;
          pruneCache(searchCache);
          searchCache.set(cachedKey, { url, exp: now + CACHE_TTL });
        }
      }

      let data: TikWMVideoResponse | undefined;
      const cachedMeta = metaCache.get(url);

      if (cachedMeta && cachedMeta.exp > now) {
        data = cachedMeta.data;
      } else {
        data = await requestJson<TikWMVideoResponse>(
          `${TIKWM_API}/?url=${encodeURIComponent(url)}&hd=1`,
          45000,
        );
        if (data?.data) {
          pruneCache(metaCache);
          metaCache.set(url, { data, exp: now + CACHE_TTL });
        }
      }

      if (!data?.data) throw new Error("La API no devolvió datos válidos.");

      const author =
        data.data.author?.nickname ||
        data.data.author?.fullname ||
        data.data.author?.unique_id ||
        "Desconocido";
      const title = data.data.title || "TikTok";
      const views = data.data.play_count;
      const likes = data.data.digg_count;
      const comments = data.data.comment_count;
      const shares = data.data.share_count;

      const imageUrls = Array.isArray(data.data.images)
        ? data.data.images.filter(
            (image): image is string =>
              typeof image === "string" && /^https?:\/\//.test(image),
          )
        : [];

      if (imageUrls.length > 0) {
        const URL_PICTURES = `https://www.tiktok.com/@${data.data.author?.unique_id}/photo/${data.data.id}`;
        const AUDIO_URL = data.data.music_info?.play || "";

        const imagePromises = imageUrls.slice(0, 20).map(async (imageUrl) => {
          const file = await downloadToCache(imageUrl, 45000);
          tempFiles.add(file);
          const charge = await prepareDownloadCharge(ctx, "image", file);
          return { file, cost: charge.cost };
        });

        const audioPromise = AUDIO_URL
          ? (async () => {
              const file = await downloadToCache(AUDIO_URL, 90000);
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
          cost: formatMoney(totalCost, ctx),
          url: URL_PICTURES,
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

      const primaryVideoUrl = data.data.hdplay || data.data.play || data.data.wmplay;
      const fallbackVideoUrl = data.data.play || data.data.wmplay;
      if (!primaryVideoUrl) throw new Error("La API no devolvió un video descargable.");

      const URL_VIDEO = `https://www.tiktok.com/@${data.data.author?.unique_id}/video/${data.data.id}`;

      let file = "";
      try {
        file = await downloadToCache(primaryVideoUrl, 150000);
      } catch {
        if (fallbackVideoUrl && fallbackVideoUrl !== primaryVideoUrl) {
          file = await downloadToCache(fallbackVideoUrl, 150000);
        } else {
          throw new Error("No se pudo descargar el video desde el servidor de origen.");
        }
      }
      tempFiles.add(file);

      const [convertedFile, { cost }] = await Promise.all([
        CONVERT_TO_AVC(file),
        prepareDownloadCharge(ctx, "video", file),
      ]);
      tempFiles.add(convertedFile);

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
        cost: formatMoney(cost, ctx),
        url: URL_VIDEO,
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
