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
import {
  downloadToCache,
  formatCount,
  pickSearchResult,
  requestJson,
  safeFileName,
} from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import type {
  CommandContext,
  TikTokSearchItem,
  TikTokSearchResponse,
} from "../../types/index.d.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { isTikTokUrl, tiktokUrlFormatter } from "../../utils/formatter.ts";
import { t } from "../../src/langs/index.ts";


const execFileAsync = promisify(execFile);
const LEGACY_API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const TIKWM_API = "https://www.tikwm.com/api";

type TikWMVideoResponse = {
  code?: number;
  msg?: string;
  data?: {
    title?: string;
    play?: string;
    wmplay?: string;
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
      let url = formattedUrl;
      let searchResult: TikTokSearchItem | null = null;
      if (!isTikTokUrl(formattedUrl)) {
        const search = await requestJson<TikTokSearchResponse>(
          `${LEGACY_API}/search/tiktok?query=${encodeURIComponent(query)}&key=${DL_CONFIG.alya.API_KEY}`,
        ).catch(() => null);
        searchResult = pickSearchResult<TikTokSearchItem>(search?.data, query);
        url = searchResult?.url || "";
      }
      if (!url)
        throw new Error("No se encontró ningún resultado para tu búsqueda.");
      const data = await requestJson<TikWMVideoResponse>(
        `${TIKWM_API}/?url=${encodeURIComponent(url)}`,
        60000,
      );
      const video = data?.data?.play || data?.data?.wmplay || "";
      if (!data?.data || !video)
        throw new Error("No se encontró audio descargable.");
      input = await downloadToCache(video, 180000);
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
      const title = data.data.title || "Audio de TikTok";
      const author =
        data.data.author?.nickname ||
        data.data.author?.fullname ||
        data.data.author?.unique_id ||
        searchResult?.author?.nickname ||
        "Desconocido";
      const { cost } = await prepareDownloadCharge(ctx, "document", output);
      const views = data.data.play_count ?? searchResult?.views;
      const likes = data.data.digg_count ?? searchResult?.likes;
      const comments =
        data.data.comment_count ?? searchResult?.comments;
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
      await unlink(output).catch(() => undefined);
    }
  },
};
