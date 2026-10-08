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
  description: "Descarga audio de TikTok como documento.",
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply("⚠️ Proporciona una búsqueda o enlace de TikTok.");
    if (!ffmpegPath) return reply("❌ FFmpeg no está disponible.");
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
        label: "TIKTOK DOCUMENT",
        icon: "🎵",
        title,
        author,
        views: formatCount(views),
        likes: formatCount(likes),
        comments: formatCount(comments),
        type: "Documento MP3",
        cost: formatMoney(cost, ctx),
        url,
        showAuthor: true,
        showViews: views !== undefined && views !== null,
        showLikes: likes !== undefined && likes !== null,
        showComments: comments !== undefined && comments !== null,
        showType: true,
        loadingText: "Descargando documento...",
        loadingIcon: "⏳",
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
        text: `${error instanceof Error ? error.message : "No se pudo convertir el audio."}`,
      });
    } finally {
      await unlink(output).catch(() => undefined);
    }
  },
};
