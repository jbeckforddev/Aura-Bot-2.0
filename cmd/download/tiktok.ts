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
import { isTikTokUrl, tiktokUrlFormatter } from "../../utils/formatter.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { CONVERT_TO_AVC } from "../../utils/converter.ts";
import { sendAlbumMessage } from "../../core/mediaSendUtils.ts";
import { t } from "../../src/langs/index.ts";
import {
  downloadTikTokFile,
  fetchTikTokMedia,
  searchTikTok,
} from "../../src/api/TikTokDownloader.ts";

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
      const url = isTikTokUrl(formattedUrl)
        ? formattedUrl
        : (await searchTikTok(query).catch(() => null))?.url;
      if (!url) throw new Error("No se encontró ningún video para esa búsqueda.");

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

      const file = await downloadTikTokFile(
        media.urls,
        150000,
        "No se pudo descargar el video desde el servidor de origen.",
      );
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
