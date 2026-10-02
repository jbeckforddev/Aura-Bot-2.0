import { fytBold } from "../../core/socketText.ts";
import { downloadToCache, requestJson } from "../../core/downloadUtils.ts";
import type {
  CommandContext,
  InstagramDownloadResponse,
  InstagramMediaItem,
} from "../../types/index.d.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
const INSTAGRAM_URL =
  /(?:instagram\.com|instagr\.am)\/(?:reels?|p|tv|stories)\//i;

export default {
  name: ["ig", "instagram"],
  category: "download",
  description: "Descarga videos o imágenes de Instagram.",
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const url = args.join(" ").trim();
    if (!url || !INSTAGRAM_URL.test(url))
      return reply("⚠️ Proporciona un enlace válido de Instagram.");
    await react("⏳");
    try {
      const response = await requestJson<InstagramDownloadResponse>(
        `https://api.delirius.online/download/instagramv2?url=${encodeURIComponent(url)}`,
        60000,
      );
      const data = response?.data;
      const items: InstagramMediaItem[] = Array.isArray(data?.download)
        ? data.download
        : [];
      const video = items.find(
        (item: InstagramMediaItem) => item.type === "video" && item.url,
      );
      const images = items.filter(
        (item: InstagramMediaItem) => item.type === "image" && item.url,
      );
      const mediaType = video ? "video" : "image";
      if (video) {
        const file = await downloadToCache(video.url, 180000);
        const { cost } = await prepareDownloadCharge(ctx, mediaType, file);
        const caption = DL_TEMPLATE({
          bold: fytBold,
          label: "INSTAGRAM VIDEO",
          icon: "📸",
          title: data?.caption || "Sin título",
          total: "1 video",
          type: "Video MP4",
          cost: formatMoney(cost, ctx),
          url,
          showTotal: true,
          showType: true,
          showLoading: false,
        });
        await reply({
          video: { url: file },
          mimetype: "video/mp4",
          fileName: "instagram.mp4",
          caption,
        });
      } else if (images.length) {
        const files: string[] = [];
        let cost = 0;
        for (const item of images) {
          const file = await downloadToCache(item.url, 180000);
          cost = (await prepareDownloadCharge(ctx, mediaType, file)).cost;
          files.push(file);
        }
        const caption = DL_TEMPLATE({
          bold: fytBold,
          label: "INSTAGRAM POST",
          icon: "📸",
          title: data?.caption || "Sin título",
          total: `${images.length} imágenes`,
          type: "Imágenes",
          cost: formatMoney(cost, ctx),
          url,
          showTotal: true,
          showType: true,
          showLoading: false,
        });
        for (const [index, file] of files.entries()) {
          await reply({
            image: { url: file },
            caption: index === 0 ? caption : undefined,
          });
        }
      } else throw new Error("No se encontró contenido multimedia.");
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `${error instanceof Error ? error.message : "No se pudo descargar Instagram."}`,
      });
    }
  },
};
