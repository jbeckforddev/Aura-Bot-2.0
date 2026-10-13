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

const LEGACY_API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const KEY = DL_CONFIG.alya.API_KEY;
const TIKWM_API = "https://www.tikwm.com/api";

type TikWMVideoResponse = {
  code?: number;
  msg?: string;
  data?: {
    id?: string;
    title?: string;
    play?: string;
    wmplay?: string;
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

export default {
  name: ["tk", "tt", "ttv", "tiktok", "tkmp4"],
  category: "download",
  description: "Busca y descarga videos de TikTok a máxima velocidad.",
  async run(ctx: CommandContext) {
    const { args = [], reply, react, sock, from, msg } = ctx;
    const query = Array.isArray(args) ? args.join(" ").trim() : String(args ?? "").trim();
    if (!query) return reply("⚠️ Proporciona una búsqueda o un enlace válido de TikTok.");
    
    await react("⏳").catch(() => undefined);
    
    // Rastreador estricto para evitar fugas de almacenamiento
    const tempFiles = new Set<string>();

    try {
      const formattedUrl = tiktokUrlFormatter(query);
      let url: string;
      
      if (isTikTokUrl(formattedUrl)) {
        url = formattedUrl;
      } else {
        const search = await requestJson<TikTokSearchResponse>(
          `${LEGACY_API}/search/tiktok?query=${encodeURIComponent(query)}&key=${KEY}`,
        ).catch(() => null);
        const result = pickSearchResult(search?.data, query);
        if (!result?.url) throw new Error("No se encontró ningún video para esa búsqueda.");
        url = result.url;
      }

      const data = await requestJson<TikWMVideoResponse>(
        `${TIKWM_API}/?url=${encodeURIComponent(url)}`,
        60000,
      );

      if (!data?.data) throw new Error("La API no devolvió datos válidos.");

      const author = data.data.author?.nickname || data.data.author?.fullname || data.data.author?.unique_id || "Desconocido";
      const title = data.data.title || "TikTok";
      const views = data.data.play_count;
      const likes = data.data.digg_count;
      const comments = data.data.comment_count;
      const shares = data.data.share_count;

      const imageUrls = Array.isArray(data.data.images)
        ? data.data.images.filter((image): image is string => typeof image === "string" && /^https?:\/\//.test(image))
        : [];

      // --- MODO: ÁLBUM DE IMÁGENES ---
      if (imageUrls.length > 0) {
        const URL_PICTURES = `https://www.tiktok.com/@${data.data.author?.unique_id}/photo/${data.data.id}`;
        const AUDIO_URL = data.data.music_info?.play || "";

        // Descarga paralela (Imágenes + Audio al mismo tiempo)
        const imagePromises = imageUrls.slice(0, 20).map(async (imageUrl) => {
          const file = await downloadToCache(imageUrl, 60000);
          tempFiles.add(file);
          const charge = await prepareDownloadCharge(ctx, "image", file);
          return { file, cost: charge.cost };
        });

        let audioPromise = Promise.resolve({ file: "", cost: 0 });
        if (AUDIO_URL) {
          audioPromise = (async () => {
            const file = await downloadToCache(AUDIO_URL, 120000);
            tempFiles.add(file);
            const charge = await prepareDownloadCharge(ctx, "document", file);
            return { file, cost: charge.cost };
          })();
        }

        const [downloadedImages, audioResult] = await Promise.all([
          Promise.all(imagePromises),
          audioPromise
        ]);

        const totalCost = downloadedImages.reduce((sum, img) => sum + img.cost, 0) + audioResult.cost;

        const caption = DL_TEMPLATE({
          bold: fytBold,
          label: "TIKTOK IMAGES",
          icon: "🖼️",
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
          loadingText: "📸 Álbum listo",
        });

        const album = downloadedImages.map((img, index) => ({
          image: { url: img.file },
          caption: index === 0 ? caption : "",
        }));

        if (audioResult.file) {
          await reply({
            audio: { url: audioResult.file },
            mimetype: "audio/mpeg",
            fileName: `${safeFileName(title, "tiktok")}.mp3`,
          });
        }

        if (album.length === 1) {
          await reply(album[0]);
        } else {
          await sendAlbumMessage(sock, from, album, msg as any);
        }

        confirmDownloadCharge(ctx);
        await react("✅").catch(() => undefined);
        return;
      }

      // --- MODO: VIDEO ESTÁNDAR ---
      const videoUrl = data.data.play || data.data.wmplay;
      if (!videoUrl) throw new Error("La API no devolvió un video descargable.");

      const URL_VIDEO = `https://www.tiktok.com/@${data.data.author?.unique_id}/video/${data.data.id}`;
      
      const file = await downloadToCache(videoUrl, 180000);
      tempFiles.add(file);

      const convertedFile = await CONVERT_TO_AVC(file);
      tempFiles.add(convertedFile);

      const { cost } = await prepareDownloadCharge(ctx, "video", convertedFile);

      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "TIKTOK VIDEO",
        icon: "🎥",
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
        loadingText: "✅ Listo mi compa",
      });

      await reply({
        video: { url: convertedFile },
        mimetype: "video/mp4",
        fileName: `${safeFileName(title, "tiktok")}.mp4`,
        caption,
      });

      confirmDownloadCharge(ctx);
      await react("✅").catch(() => undefined);

    } catch (error: unknown) {
      await react("❌").catch(() => undefined);
      const message = error instanceof Error ? error.message : "No se pudo descargar el video.";
      await reply({ text: `${message}` }).catch(() => undefined);
    } finally {
      for (const file of tempFiles) {
        await rm(file, { force: true }).catch(() => undefined);
      }
    }
  },
};
