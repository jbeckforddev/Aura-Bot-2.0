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
import { t } from "../../src/langs/index.ts";

const INSTAGRAM_URL =
  /(?:instagram\.com|instagr\.am)\/(?:reels?|p|tv|stories)\//i;

export default {
  name: ["ig", "instagram"],
  category: "download",
  description: t("cmd_descarga_videos_o_imagenes_de__23a7e153"),
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const url = args.join(" ").trim();
    if (!url || !INSTAGRAM_URL.test(url))
      return reply(t("cmd_proporciona_un_enlace_valido_d_6c6eb77e"));
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
          label: t("cmd_instagram_video_50270846"),
          icon: t("cmd_text_c6b09845"),
          title: data?.caption || t("cmd_sin_titulo_fd8beeee"),
          total: t("cmd_1_video_9fa45ef1"),
          type: t("cmd_video_mp4_1275e211"),
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
          label: t("cmd_instagram_post_93a5d9fb"),
          icon: t("cmd_text_c6b09845"),
          title: data?.caption || t("cmd_sin_titulo_fd8beeee"),
          total: t("cmd_value0_imagenes_b7d4804f", { value0: images.length }),
          type: t("cmd_imagenes_072d8942"),
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
        text: t("cmd_value0_bb624cd4", { value0: error instanceof Error ? error.message : "No se pudo descargar Instagram." }),
      });
    }
  },
};
