import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import { fytBold } from "../../core/socketText.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { formatCount, safeFileName } from "../../core/downloadUtils.ts";
import type { CommandContext } from "../../types/index.d.ts";
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
  name: ["dtta", "dtka", "docttaudio", "dtkmusic", "doctiktokaudio"],
  category: "download",
  description: t("cmd_descarga_audio_de_tiktok_como__65062d27"),
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
      const searchResult = isDirectLink ? null : await searchTikTok(query).catch(() => null);
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
      const { cost } = await prepareDownloadCharge(ctx, "document", output);
      const views = media.views ?? searchResult?.stats?.views ?? searchResult?.views;
      const likes = media.likes ?? searchResult?.stats?.likes ?? searchResult?.likes;
      const comments = media.comments ?? searchResult?.stats?.comment ?? searchResult?.comments;
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_tiktok_document_82fb2560"),
        icon: t("cmd_text_71ceeba5"),
        title,
        author,
        views: formatCount(views),
        likes: formatCount(likes),
        comments: formatCount(comments),
        type: t("cmd_documento_mp3_f18c11dc"),
        cost: formatMoney(cost, ctx),
        url,
        showAuthor: true,
        showViews: views !== undefined && views !== null,
        showLikes: likes !== undefined && likes !== null,
        showComments: comments !== undefined && comments !== null,
        showType: true,
        loadingText: t("cmd_descargando_documento_2572aa2f"),
        loadingIcon: t("cmd_text_7a2ad7a6"),
      });
      await reply({ text: caption });
      await reply({
        document: await readFile(output),
        mimetype: "audio/mpeg",
        fileName: `${safeFileName(title, "tiktok")}.mp3`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_value0_bb624cd4", { value0: error instanceof Error ? error.message : "No se pudo convertir el audio." }),
      });
    } finally {
      await Promise.allSettled([unlink(output), ...(input ? [unlink(input)] : [])]);
    }
  },
};
