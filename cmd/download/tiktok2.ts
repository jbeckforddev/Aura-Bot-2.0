import { rm } from "node:fs/promises";
import {
  downloadToCache,
  safeFileName,
  formatCount,
} from "../../core/downloadUtils.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { CONVERT_TO_AVC } from "../../utils/converter.ts";
import { sendAlbumMessage } from "../../core/mediaSendUtils.ts";
import { isTikTokUrl, tiktokUrlFormatter } from "../../utils/formatter.ts";
import { t } from "../../src/langs/index.ts";
import {
  downloadTikTokFile,
  fetchTikTokMedia,
  searchTikTok,
} from "../../src/api/TikTokDownloader.ts";

export default {
  name: ["dtk", "dtt", "dttv", "doctiktok", "dtkmp4", "tt2"],
  category: "download",
  description: t("cmd_busca_y_descarga_videos_de_tik_ba512c51"),
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg } = ctx;
    const query = args.join(" ").trim();
    if (!query)
      return reply(t("cmd_proporciona_una_busqueda_o_un__4bcc0240"));
    await react("⏳");
    const tempFiles = new Set<string>();
    try {
      const formattedUrl = tiktokUrlFormatter(query);
      const url = isTikTokUrl(formattedUrl)
        ? formattedUrl
        : (await searchTikTok(query).catch(() => null))?.url;
      if (!url) throw new Error("No se encontró ningún enlace válido.");

      const media = await fetchTikTokMedia(url);
      const { id, author: account, views, likes, comments, shares } = media;
      const postPath = media.type === "image" ? "photo" : "video";
      const postUrl = account?.unique_id && id
        ? `https://www.tiktok.com/@${account.unique_id}/${postPath}/${id}`
        : url;
      const captionDetails = {
        bold: fytBold,
        author: account?.nickname || account?.fullname || account?.unique_id || "Desconocido",
        views: formatCount(views),
        likes: formatCount(likes),
        comments: formatCount(comments),
        shares: formatCount(shares),
        url: postUrl,
        showAuthor: true,
        showViews: views !== undefined && views !== null,
        showLikes: likes !== undefined && likes !== null,
        showComments: comments !== undefined && comments !== null,
        showShares: shares !== undefined && shares !== null,
      };

      if (media.type === "image") {
        const title = media.title || "TikTok image";
        const files: string[] = [];
        let totalCost = 0;
        for (const imageUrl of media.urls.slice(0, 20)) {
          const file = await downloadToCache(imageUrl, 60000);
          tempFiles.add(file);
          const charge = await prepareDownloadCharge(ctx, "image", file);
          totalCost += charge.cost;
          files.push(file);
        }
        const caption = DL_TEMPLATE({
          ...captionDetails,
          label: t("cmd_tiktok_images_c263451e"),
          icon: t("cmd_text_91a64201"),
          title,
          cost: formatMoney(totalCost, ctx),
          loadingText: t("cmd_album_listo_458c0141"),
        });
        const album = files.map((file, index) => ({
          image: { url: file },
          caption: index === 0 ? caption : "",
        }));
        if (media.audioUrl) {
          await reply({
            audio: { url: media.audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${safeFileName(title, "tiktok")}.mp3`,
          });
        }
        if (album.length === 1) await reply(album[0]);
        else await sendAlbumMessage(sock, from, album, msg);
        confirmDownloadCharge(ctx);
        await react("✅");
        return;
      }
      const title = media.title || "Video de TikTok";
      const file = await downloadTikTokFile(
        media.urls,
        180000,
        "No se pudo descargar el video desde el servidor de origen.",
      );
      tempFiles.add(file);
      const convertedFile = await CONVERT_TO_AVC(file);
      tempFiles.add(convertedFile);
      const { cost } = await prepareDownloadCharge(ctx, "document", convertedFile);
      const caption = DL_TEMPLATE({
        ...captionDetails,
        label: t("cmd_tiktok_document_82fb2560"),
        icon: t("cmd_text_a2865ecb"),
        title,
        cost: formatMoney(cost, ctx),
        loadingText: t("cmd_descargando_video_e3c0869f"),
        loadingIcon: t("cmd_text_7a2ad7a6"),
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
        text: t("cmd_value0_bb624cd4", { value0: message }),
      });
    } finally {
      await Promise.allSettled(Array.from(tempFiles, (file) => rm(file, { force: true })));
    }
  },
};
