import { rm } from "node:fs/promises";
import {
  downloadToCache,
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
  TikTokDownloadData,
} from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { CONVERT_TO_AVC } from "../../utils/converter.ts";

const API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const KEY = DL_CONFIG.alya.API_KEY;
const TIKTOK_URL = /^(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\//i;

export default {
  name: ["dtk", "dtt", "dttv", "doctiktok", "dtkmp4"],
  category: "download",
  description: "Busca y descarga videos de TikTok como documento.",
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const query = args.join(" ").trim();
    if (!query)
      return reply("⚠️ Proporciona una búsqueda o un enlace válido de TikTok.");
    await react("⏳");
    let convertedFile = "";
    try {
      let url = query;
      if (!TIKTOK_URL.test(query)) {
        const search = await requestJson<TikTokSearchResponse>(
          `${API}/search/tiktok?query=${encodeURIComponent(query)}&key=${KEY}`,
        );
        url = search?.data?.[0]?.url || "";
      }
      if (!url) throw new Error("No se encontró ningún enlace válido.");
      const data = await requestJson<TikTokDownloadData>(
        `${API}/dl/tiktokv2?url=${encodeURIComponent(url)}&key=${KEY}`,
        60000,
      );
      const entries = Array.isArray(data?.data) ? data.data : [];
      const videoUrl = entries.find((item) => item?.url)?.url;
      if (!data?.status || !videoUrl)
        throw new Error("La API no devolvió un video descargable.");
      const author =
        data.author?.nickname || data.author?.fullname || "Desconocido";
      const title = data.title || "Video de TikTok";
      const file = await downloadToCache(videoUrl, 180000);
      convertedFile = await CONVERT_TO_AVC(file);
      const { cost } = await prepareDownloadCharge(
        ctx,
        "document",
        convertedFile,
      );
      const views = data.stats?.views ?? data.play_count;
      const likes = data.stats?.likes ?? data.digg_count;
      const comments = data.stats?.comment ?? data.comment_count;
      const shares = data.stats?.share ?? data.share_count;
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
        url,
        showAuthor: true,
        showViews: views !== undefined && views !== null,
        showLikes: likes !== undefined && likes !== null,
        showComments: comments !== undefined && comments !== null,
        showShares: shares !== undefined && shares !== null,
        loadingText: "Descargando video...",
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
