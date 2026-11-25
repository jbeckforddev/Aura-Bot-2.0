import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import { fytBold } from "../../core/socketText.ts";
import { formatCount, safeFileName } from "../../core/downloadUtils.ts";
import type { CommandContext } from "../../types/index.d.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { isTikTokUrl, tiktokUrlFormatter } from "../../utils/formatter.ts";
import { t } from "../../src/langs/index.ts";
import {
  downloadTikTokFile,
  fetchTikTokMedia,
  searchTikTok,
} from "../../src/api/TikTokDownloader.ts";

const execFileAsync = promisify(execFile);

export default {
  name: ["tta", "tka", "ttaudio", "tkmusic", "tiktokaudio"],
  category: "download",
  description: t("cmd_descarga_audio_de_tiktok_como__87218bf5"),
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply(t("cmd_proporciona_una_busqueda_o_enl_273f67d2"));
    if (!ffmpegPath) return reply(t("cmd_ffmpeg_no_esta_disponible_d527d549"));
    const dir = process.env.TMPDIR || "./cache";
    const id = randomUUID();
    let input = "";
    const output = `${dir}/tta-${id}.mp3`;
    await react("⏳");
    try {
      await mkdir(dir, { recursive: true });
      const formattedUrl = tiktokUrlFormatter(query);
      const isDirectLink = isTikTokUrl(formattedUrl);
      const searchResult = isDirectLink ? null : await searchTikTok(query);
      const url = isDirectLink ? formattedUrl : searchResult?.url;
      if (!url)
        throw new Error("No se encontró ningún resultado para tu búsqueda.");

      const media = await fetchTikTokMedia(url, "audio");
      input = await downloadTikTokFile(
        media.urls,
        180000,
        "No se pudo descargar el audio de TikTok.",
      );
      await execFileAsync(
        ffmpegPath,
        [
          "-y",
          "-i",
          input,
          "-vn",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "320k",
          output,
        ],
        { timeout: 120000 },
      );
      const title = media.title || "Audio de TikTok";
      const author =
        media.author?.nickname ||
        media.author?.fullname ||
        media.author?.unique_id ||
        searchResult?.author?.nickname ||
        "Desconocido";
      const { cost } = await prepareDownloadCharge(ctx, "audio", output);
      const views = media.views ?? searchResult?.stats?.views ?? searchResult?.views;
      const likes = media.likes ?? searchResult?.stats?.likes ?? searchResult?.likes;
      const comments = media.comments ?? searchResult?.stats?.comment ?? searchResult?.comments;
      const shares = media.shares ?? searchResult?.stats?.share;
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_tiktok_audio_6218e8b8"),
        icon: t("cmd_text_71ceeba5"),
        title,
        author,
        views: formatCount(views),
        likes: formatCount(likes),
        comments: formatCount(comments),
        shares: formatCount(shares),
        type: t("cmd_audio_mp3_80f1520d"),
        cost: formatMoney(cost, ctx),
        url,
        showAuthor: true,
        showViews: views !== undefined && views !== null,
        showLikes: likes !== undefined && likes !== null,
        showComments: comments !== undefined && comments !== null,
        showShares: shares !== undefined && shares !== null,
        showType: true,
        loadingText: t("cmd_descargando_audio_b1e6524a"),
        loadingIcon: t("cmd_text_7a2ad7a6"),
      });
      await reply({ text: caption });
      await reply({
        audio: await readFile(output),
        mimetype: "audio/mpeg",
        fileName: `${safeFileName(title, "tiktok")}.mp3`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo convertir el audio.";
      return reply({
        text: t("cmd_value0_bb624cd4", { value0: message }),
      });
    } finally {
      await Promise.allSettled([unlink(output), ...(input ? [unlink(input)] : [])]);
    }
  },
};
