import type {
  CommandContext,
  FacebookDownloadResponse,
  FacebookMediaItem,
} from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { downloadToCache, requestJson } from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
const API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");

export default {
  name: ["fb", "facebook", "fbdl", "facebookdl", "fbvideo", "fbv", "fbreels"],
  category: "download",
  description: "Descarga videos de Facebook y Reels.",
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const url = args.join(" ").trim();
    if (!url)
      return reply("⚠️ Proporciona un enlace de Facebook o Facebook Reels.");
    await react("⏳");
    try {
      const data = await requestJson<FacebookDownloadResponse>(
        `${API}/dl/facebook?url=${encodeURIComponent(url)}&key=${DL_CONFIG.alya.API_KEY}`,
        60000,
      );
      const items = Array.isArray(data?.resultados)
        ? data.resultados
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.result)
            ? data.result
            : [data?.data || data?.result];
      const item = (items as (string | FacebookMediaItem)[])
        .filter((entry): entry is string | FacebookMediaItem => Boolean(entry))
        .sort((left, right) => {
          const leftQuality =
            typeof left === "object"
              ? parseInt(String(left?.quality || ""), 10) || 0
              : 0;
          const rightQuality =
            typeof right === "object"
              ? parseInt(String(right?.quality || ""), 10) || 0
              : 0;
          return rightQuality - leftQuality;
        })[0];
      const videoUrl =
        typeof item === "string" ? item : item?.url || item?.hd || item?.sd;
      if (!data?.status || !videoUrl)
        throw new Error("La API no devolvió un video descargable.");
      const quality = (typeof item === "object" ? item?.quality : null) || "HD";
      const file = await downloadToCache(videoUrl, 180000, {
        Accept: "video/*,*/*;q=0.8",
        Origin: "https://www.facebook.com",
        Referer: "https://www.facebook.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      });
      const { cost } = await prepareDownloadCharge(ctx, "video", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "FACEBOOK VIDEO",
        icon: "🎥",
        showTitle: false,
        quality,
        type: "Video MP4",
        cost: formatMoney(cost, ctx),
        url,
        showQuality: true,
        showType: true,
        loadingText: "Descargando video...",
        loadingIcon: "⏳",
      });
      await reply({
        video: { url: file },
        mimetype: "video/mp4",
        fileName: "facebook.mp4",
        caption,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `${error instanceof Error ? error.message : String(error) || "No se pudo descargar el video."}`,
      });
    }
  },
};
