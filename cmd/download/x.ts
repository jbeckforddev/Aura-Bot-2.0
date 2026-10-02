import { fytBold } from "../../core/socketText.ts";
import { downloadToCache, requestJson } from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import type {
  CommandContext,
  TwitterDownloadResponse,
  TwitterDownloadData,
  TwitterMediaItem,
} from "../../types/index.d.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";

const API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const KEY = DL_CONFIG.alya.API_KEY;
const SOCIAL_URL = /^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\//i;

function getMediaUrl(value: TwitterMediaItem | string | undefined): string {
  if (typeof value === "string") return value;
  return value?.url || "";
}

function getBestVideo(result: TwitterDownloadData["result"]): string {
  if (!Array.isArray(result))
    return getMediaUrl(result as TwitterMediaItem | string | undefined);

  return (
    [...result]
      .filter((item) => getMediaUrl(item as TwitterMediaItem | string))
      .sort((left, right) => {
        const leftItem = left as TwitterMediaItem;
        const rightItem = right as TwitterMediaItem;
        const leftQuality = parseInt(String(leftItem?.quality || ""), 10) || 0;
        const rightQuality =
          parseInt(String(rightItem?.quality || ""), 10) || 0;
        return rightQuality - leftQuality;
      })
      .map((item) => getMediaUrl(item as TwitterMediaItem | string))[0] || ""
  );
}

export default {
  name: ["x", "twitter", "xdl"],
  category: "download",
  description: "Descarga videos o imágenes de Twitter / X.",
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const url = args.join(" ").trim();

    if (!url || !SOCIAL_URL.test(url)) {
      return reply("⚠️ Proporciona un enlace válido de Twitter/X.");
    }

    await react("⏳");

    try {
      const response = await requestJson<TwitterDownloadResponse>(
        `${API}/dl/twitter?url=${encodeURIComponent(url)}&key=${KEY}`,
        60000,
      );
      const data = response?.data;
      const type = String(data?.type || "").toLowerCase();
      const result = data?.result;
      const thumbnail = data?.thumbnail;
      const mediaUrl =
        type === "video"
          ? getBestVideo(result)
          : getMediaUrl(
              Array.isArray(result)
                ? (result[0] as TwitterMediaItem)
                : (result as TwitterMediaItem | string | undefined),
            ) ||
            getMediaUrl(
              typeof thumbnail === "string"
                ? thumbnail
                : (thumbnail as TwitterMediaItem | undefined),
            );

      if (!response?.status || !mediaUrl) {
        throw new Error("La API no devolvió contenido descargable.");
      }

      const file = await downloadToCache(mediaUrl, 180000);
      const isVideo = type === "video" || /\.mp4(?:$|\?)/i.test(mediaUrl);
      const { cost } = await prepareDownloadCharge(
        ctx,
        isVideo ? "video" : "image",
        file,
      );
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "TWITTER DOWNLOAD",
        icon: "𝕏",
        showTitle: false,
        type: isVideo ? "Video MP4" : "Imagen",
        cost: formatMoney(cost, ctx),
        url,
        showType: true,
        showLoading: false,
      });
      if (isVideo) {
        await reply({
          video: { url: file },
          mimetype: "video/mp4",
          fileName: "twitter.mp4",
          caption,
        });
      } else {
        await reply({ image: { url: file }, caption });
      }
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `${error instanceof Error ? error.message : "No se pudo descargar Twitter/X."}`,
      });
    }
  },
};
