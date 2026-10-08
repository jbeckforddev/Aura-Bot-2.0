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
  TikTokSearchResponse,} from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { CONVERT_TO_AVC } from "../../utils/converter.ts";
import { sendAlbumMessage } from "../../core/mediaSendUtils.ts";
import { isTikTokUrl, tiktokUrlFormatter } from "../../utils/formatter.ts";

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
  name: ["dtk", "dtt", "dttv", "doctiktok", "dtkmp4", "tt2"],
  category: "download",
  description: "Busca y descarga videos de TikTok como documento.",
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg } = ctx;
    const query = args.join(" ").trim();
    if (!query)
      return reply("⚠️ Proporciona una búsqueda o un enlace válido de TikTok.");
    await react("⏳");
    let convertedFile = "";
    try {
      const formattedUrl = tiktokUrlFormatter(query);
      let url = formattedUrl;
      if (!isTikTokUrl(formattedUrl)) {
        const search = await requestJson<TikTokSearchResponse>(
          `${LEGACY_API}/search/tiktok?query=${encodeURIComponent(query)}&key=${KEY}`,
        ).catch(() => null);
        url = pickSearchResult(search?.data, query)?.url || "";
      }
      if (!url) throw new Error("No se encontró ningún enlace válido.");
      const data = await requestJson<TikWMVideoResponse>(
        `${TIKWM_API}/?url=${encodeURIComponent(url)}`,
        60000,
      );
      const imageUrls = Array.isArray(data?.data?.images)
        ? data.data.images.filter(
            (image): image is string =>
              typeof image === "string" && /^https?:\/\//.test(image),
          )
        : [];
      if (imageUrls.length > 0) {
        const files: string[] = [];
        let totalCost = 0;
        for (const imageUrl of imageUrls.slice(0, 20)) {
          const file = await downloadToCache(imageUrl, 60000);
          const charge = await prepareDownloadCharge(ctx, "image", file);
          totalCost += charge.cost;
          files.push(file);
        }
        const author =
          data.data?.author?.nickname ||
          data.data?.author?.fullname ||
          data.data?.author?.unique_id ||
          "Desconocido";
        const title = data.data?.title || "TikTok image";
        const views = data.data?.play_count;
        const likes = data.data?.digg_count;
        const comments = data.data?.comment_count;
        const shares = data.data?.share_count;
        const URL_PICTURES = `https://www.tiktok.com/@${data.data.author.unique_id}/photo/${data.data.id}`
        const AUDIO = data.data.music_info.play;
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
        const album = files.map((file, index) => ({
          image: { url: file },
          caption: index === 0 ? caption : "",
        }));
        reply({
          audio: AUDIO ? { url: AUDIO } : undefined,
          mimetype: AUDIO ? "audio/mpeg" : undefined,
          fileName: AUDIO ? `${safeFileName(title, "tiktok")}.mp3` : undefined,
        })
        if (album.length === 1) await reply(album[0]);
        else await sendAlbumMessage(sock, from, album, msg);
        confirmDownloadCharge(ctx);
        await react("✅");
        return;
      }
      const videoUrl = data?.data?.play || data?.data?.wmplay || "";
      if (!data?.data || !videoUrl)
        throw new Error("La API no devolvió un video descargable.");
      const author =
        data.data.author?.nickname ||
        data.data.author?.fullname ||
        data.data.author?.unique_id ||
        "Desconocido";
      const title = data.data.title || "Video de TikTok";
      const file = await downloadToCache(videoUrl, 180000);
      convertedFile = await CONVERT_TO_AVC(file);
      const { cost } = await prepareDownloadCharge(
        ctx,
        "document",
        convertedFile,
      );
      const views = data.data.play_count;
      const likes = data.data.digg_count;
      const comments = data.data.comment_count;
      const shares = data.data.share_count;
      const URL_VIDEO = `https://www.tiktok.com/@${data.data.author.unique_id}/video/${data.data.id}`
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "TIKTOK DOCUMENT",
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
        loadingText: "Descargando video...",
        loadingIcon: "⏳",
      });
      await reply({
        document: { url: convertedFile },
        mimetype: "video/mp4",
        fileName: `${safeFileName(title, "tiktok")}.mp4`,
        caption,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo descargar el video.";
      return reply({
        text: `${message}`,
      });
    } finally {
      if (convertedFile)
        await rm(convertedFile, { force: true }).catch(() => undefined);
    }
  },
};
