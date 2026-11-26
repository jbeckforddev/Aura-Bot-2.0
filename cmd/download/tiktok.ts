import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { LRUCache } from "lru-cache";
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

const execFileAsync = promisify(execFile);

interface AuraHwProfile {
  cpuThreads?: number;
  cuda?: boolean;
  h264Nvenc?: boolean;
  runWithGpuSlot?: <T>(task: () => Promise<T>) => Promise<T>;
  runWithCpuSlot?: <T>(task: () => Promise<T>) => Promise<T>;
}

interface MediaProbe {
  vCodec: string;
  pixFmt: string;
  aCodec: string;
}

const MAX_RAM_VIDEO_BYTES = 25 * 1024 * 1024;
const IMAGE_DOWNLOAD_CONCURRENCY = 6;

const gTk = globalThis as unknown as {
  __AURA_HW__?: AuraHwProfile;
  __auraTkSearchCache?: LRUCache<string, string>;
  __auraTkMetaCache?: LRUCache<string, Awaited<ReturnType<typeof fetchTikTokMedia>>>;
  __auraTkVideoCache?: LRUCache<string, Buffer>;
};

const searchCache = (gTk.__auraTkSearchCache ??= new LRUCache<string, string>({
  max: 500,
  ttl: 10 * 60 * 1000,
}));

const metaCache = (gTk.__auraTkMetaCache ??= new LRUCache<
  string,
  Awaited<ReturnType<typeof fetchTikTokMedia>>
>({
  max: 500,
  ttl: 10 * 60 * 1000,
}));

const videoRamCache = (gTk.__auraTkVideoCache ??= new LRUCache<string, Buffer>({
  max: 35,
  ttl: 10 * 60 * 1000,
}));

function getTempPath(prefix: string, ext: string): string {
  const baseDir = process.env.GLOBAL_CUSTOM_TMP || process.env.TMPDIR || tmpdir();
  return path.join(
    baseDir,
    `${prefix}_${process.pid}_${randomBytes(8).toString("hex")}.${ext}`,
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  const runner = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      try {
        results[idx] = { status: "fulfilled", value: await worker(items[idx], idx) };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  };

  const count = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: count }, () => runner()));
  return results;
}

async function probeMedia(filePath: string): Promise<MediaProbe | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,pix_fmt",
        "-of",
        "json",
        filePath,
      ],
      { timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );

    const parsed = JSON.parse(stdout) as {
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        pix_fmt?: string;
      }>;
    };

    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const video = streams.find((s) => s.codec_type === "video");
    const audio = streams.find((s) => s.codec_type === "audio");

    return {
      vCodec: String(video?.codec_name || "").toLowerCase(),
      pixFmt: String(video?.pix_fmt || "").toLowerCase(),
      aCodec: String(audio?.codec_name || "").toLowerCase(),
    };
  } catch {
    return null;
  }
}

async function isValidFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 1024;
  } catch {
    return false;
  }
}

async function fastRemuxMp4(inputPath: string): Promise<string> {
  const outPath = getTempPath("tk_remux", "mp4");
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        outPath,
      ],
      { timeout: 25_000, windowsHide: true },
    );
    if (await isValidFile(outPath)) return outPath;
  } catch {}
  await rm(outPath, { force: true }).catch(() => undefined);
  return inputPath;
}

async function transcodeWithNvenc(
  inputPath: string,
  probe: MediaProbe | null,
  hw: AuraHwProfile,
): Promise<string | null> {
  const outPath = getTempPath("tk_nvenc", "mp4");
  const audioArgs = !probe?.aCodec
    ? ["-an"]
    : probe.aCodec === "aac"
      ? ["-c:a", "copy"]
      : ["-c:a", "aac", "-b:a", "128k", "-ac", "2"];

  const canCudaDecode =
    Boolean(hw.cuda) &&
    probe?.pixFmt === "yuv420p" &&
    (probe.vCodec === "hevc" || probe.vCodec === "h264");

  const buildArgs = (useCudaDecode: boolean) => {
    const args = ["-y", "-hide_banner", "-loglevel", "error"];
    if (useCudaDecode) {
      args.push("-hwaccel", "cuda");
    } else {
      args.push("-threads", "0");
    }
    args.push(
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
      "-c:v",
      "h264_nvenc",
      "-preset",
      "p4",
      "-tune",
      "hq",
      "-rc",
      "vbr",
      "-cq",
      "24",
      "-b:v",
      "0",
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      ...audioArgs,
      "-movflags",
      "+faststart",
      outPath,
    );
    return args;
  };

  const runGpu = hw.runWithGpuSlot ?? (<T>(fn: () => Promise<T>) => fn());

  return runGpu(async () => {
    if (canCudaDecode) {
      try {
        await execFileAsync("ffmpeg", buildArgs(true), {
          timeout: 60_000,
          windowsHide: true,
        });
        if (await isValidFile(outPath)) return outPath;
      } catch {}
    }

    try {
      await execFileAsync("ffmpeg", buildArgs(false), {
        timeout: 60_000,
        windowsHide: true,
      });
      if (await isValidFile(outPath)) return outPath;
    } catch {}

    await rm(outPath, { force: true }).catch(() => undefined);
    return null;
  });
}

async function ensureAvcOptimal(inputPath: string): Promise<string> {
  const hw = gTk.__AURA_HW__;
  const probe = await probeMedia(inputPath);

  if (
    probe &&
    probe.vCodec === "h264" &&
    probe.pixFmt === "yuv420p" &&
    (!probe.aCodec || probe.aCodec === "aac")
  ) {
    return fastRemuxMp4(inputPath);
  }

  if (hw?.h264Nvenc) {
    const gpuFile = await transcodeWithNvenc(inputPath, probe, hw);
    if (gpuFile) return gpuFile;
  }

  const runCpu = hw?.runWithCpuSlot ?? (<T>(fn: () => Promise<T>) => fn());
  return runCpu(() => CONVERT_TO_AVC(inputPath));
}

export default {
  name: ["tk", "tt", "ttv", "tiktok", "tkmp4"],
  category: "download",
  description: t("cmd_busca_y_descarga_videos_de_tik_fd0719dc"),
  async run(ctx: CommandContext) {
    const { args = [], reply, react, sock, from, msg } = ctx;
    const query = Array.isArray(args)
      ? args.join(" ").trim()
      : String(args ?? "").trim();
    if (!query) return reply(t("cmd_proporciona_una_busqueda_o_un__4bcc0240"));

    void react("⏳").catch(() => undefined);

    const tempFiles = new Set<string>();

    try {
      const formattedUrl = tiktokUrlFormatter(query);
      let url: string | undefined;

      if (isTikTokUrl(formattedUrl)) {
        url = formattedUrl;
      } else {
        const searchKey = query.toLowerCase();
        url = searchCache.get(searchKey);
        if (!url) {
          url = (await searchTikTok(query).catch(() => null))?.url;
          if (url) searchCache.set(searchKey, url);
        }
      }

      if (!url) {
        throw new Error("No se encontró ningún video para esa búsqueda.");
      }

      let media = metaCache.get(url);
      if (!media) {
        media = await fetchTikTokMedia(url);
        metaCache.set(url, media);
      }

      const { id, author: account, views, likes, comments, shares } = media;
      const author =
        account?.nickname ||
        account?.fullname ||
        account?.unique_id ||
        "Desconocido";
      const title = media.title || "TikTok";
      const postPath = media.type === "image" ? "photo" : "video";
      const postUrl =
        account?.unique_id && id
          ? `https://www.tiktok.com/@${account.unique_id}/${postPath}/${id}`
          : url;

      if (media.type === "image") {
        const { audioUrl } = media;
        const targetUrls = media.urls.slice(0, 20);

        const audioPromise = audioUrl
          ? (async () => {
              const file = await downloadToCache(audioUrl, 90_000);
              tempFiles.add(file);
              return file;
            })().catch(() => "")
          : Promise.resolve("");

        const [imageSettled, audioFile] = await Promise.all([
          mapWithConcurrency(
            targetUrls,
            IMAGE_DOWNLOAD_CONCURRENCY,
            async (imageUrl) => {
              const file = await downloadToCache(imageUrl, 45_000);
              tempFiles.add(file);
              return file;
            },
          ),
          audioPromise,
        ]);

        const downloadedFiles = imageSettled
          .filter(
            (res): res is PromiseFulfilledResult<string> =>
              res.status === "fulfilled" && Boolean(res.value),
          )
          .map((res) => res.value);

        if (downloadedFiles.length === 0) {
          throw new Error("No se pudieron descargar las imágenes de TikTok.");
        }

        let totalCost = 0;
        for (const imgFile of downloadedFiles) {
          const charge = await prepareDownloadCharge(ctx, "image", imgFile);
          totalCost += charge.cost;
        }
        if (audioFile) {
          const audioCharge = await prepareDownloadCharge(
            ctx,
            "document",
            audioFile,
          );
          totalCost += audioCharge.cost;
        }

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

        const album = downloadedFiles.map((file, index) => ({
          image: { url: file },
          caption: index === 0 ? caption : "",
        }));

        const sendTasks: Promise<unknown>[] = [];

        if (audioFile) {
          sendTasks.push(
            reply({
              audio: { url: audioFile },
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

      const videoCacheKey = id ? `id:${id}` : postUrl;
      const cachedVideoBuffer = videoRamCache.get(videoCacheKey);

      let finalVideoFile: string;
      let cost: number;

      if (cachedVideoBuffer) {
        finalVideoFile = getTempPath("tk_hit", "mp4");
        await writeFile(finalVideoFile, cachedVideoBuffer);
        tempFiles.add(finalVideoFile);
        const charge = await prepareDownloadCharge(ctx, "video", finalVideoFile);
        cost = charge.cost;
      } else {
        const rawFile = await downloadTikTokFile(
          media.urls,
          150_000,
          "No se pudo descargar el video desde el servidor de origen.",
        );
        tempFiles.add(rawFile);

        const charge = await prepareDownloadCharge(ctx, "video", rawFile);
        cost = charge.cost;

        finalVideoFile = await ensureAvcOptimal(rawFile);
        tempFiles.add(finalVideoFile);

        try {
          const outStat = await stat(finalVideoFile);
          if (outStat.size > 0 && outStat.size <= MAX_RAM_VIDEO_BYTES) {
            const buf = await readFile(finalVideoFile);
            videoRamCache.set(videoCacheKey, buf);
          }
        } catch {}
      }

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
        video: { url: finalVideoFile },
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
