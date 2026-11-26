import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { request } from "undici";
import { downloadToCache } from "../core/downloadUtils.ts";

interface AuraHardwareProfile {
  cpuThreads: number;
  cuda: boolean;
  h264Nvenc: boolean;
  hevcNvenc: boolean;
  maxGpuJobs: number;
  maxCpuJobs: number;
  runWithGpuSlot: <T>(task: () => Promise<T>) => Promise<T>;
  runWithCpuSlot: <T>(task: () => Promise<T>) => Promise<T>;
}

const execFileAsync = promisify(execFile);
const FFMPEG_MAX_BUFFER = 512 * 1024 * 1024;
const CPU_FFMPEG_BIN = ffmpegPath || "ffmpeg";
const GPU_FFMPEG_BIN = "ffmpeg";

const CACHE_DIR =
  process.env.GLOBAL_CUSTOM_TMP || process.env.TMPDIR || path.resolve("./cache");
let cacheDirReady: Promise<string | undefined> | null = null;

function ensureCacheDir() {
  if (!cacheDirReady) {
    cacheDirReady = mkdir(CACHE_DIR, { recursive: true }).catch((err) => {
      cacheDirReady = null;
      throw err;
    });
  }
  return cacheDirReady;
}

function createLocalSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const cap = Math.max(1, limit);

  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= cap) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await task();
    } finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  };
}

const fallbackCpuThreads =
  typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length || 4;
const fallbackCpuSlot = createLocalSemaphore(Math.max(2, fallbackCpuThreads - 2));
const fallbackGpuSlot = createLocalSemaphore(3);

function getHwProfile(): AuraHardwareProfile {
  const hw = (globalThis as any).__AURA_HW__ as Partial<AuraHardwareProfile> | undefined;
  return {
    cpuThreads: hw?.cpuThreads ?? fallbackCpuThreads,
    cuda: Boolean(hw?.cuda),
    h264Nvenc: Boolean(hw?.h264Nvenc),
    hevcNvenc: Boolean(hw?.hevcNvenc),
    maxGpuJobs: hw?.maxGpuJobs ?? 3,
    maxCpuJobs: hw?.maxCpuJobs ?? Math.max(2, fallbackCpuThreads - 2),
    runWithGpuSlot: hw?.runWithGpuSlot ?? fallbackGpuSlot,
    runWithCpuSlot: hw?.runWithCpuSlot ?? fallbackCpuSlot,
  };
}

interface MediaProbe {
  vCodec: string;
  isYuv420p: boolean;
  hasEvenDimensions: boolean;
  hasAudio: boolean;
  isAacAudio: boolean;
}

async function probeMedia(inputPath: string): Promise<MediaProbe> {
  let stderr = "";
  try {
    await execFileAsync(CPU_FFMPEG_BIN, ["-hide_banner", "-i", inputPath], {
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr)
        : "";
  }

  const videoLine = stderr.match(/Stream #0:\d+.*Video:.*/i)?.[0] || "";
  const codecMatch = videoLine.match(/Video:\s*([a-z0-9_]+)/i);
  const vCodec = codecMatch ? codecMatch[1].toLowerCase() : "";
  const isYuv420p = /\byuv420p(?:\(|,|\s|$)/i.test(videoLine);

  const resMatch = videoLine.match(/\b(\d{2,5})x(\d{2,5})\b/);
  const width = resMatch ? Number(resMatch[1]) : 0;
  const height = resMatch ? Number(resMatch[2]) : 0;
  const hasEvenDimensions =
    width > 0 && height > 0 && width % 2 === 0 && height % 2 === 0;

  const hasAudio = /Stream #0:\d+.*Audio:/i.test(stderr);
  const isAacAudio = /Stream #0:\d+.*Audio:\s*aac\b/i.test(stderr);

  return { vCodec, isYuv420p, hasEvenDimensions, hasAudio, isAacAudio };
}

async function hasValidOutput(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile() && Number.isFinite(info.size) && info.size > 0;
  } catch {
    return false;
  }
}

export async function GIF_TO_VIDEO(gifUrl: string): Promise<string> {
  await ensureCacheDir();
  const id = randomUUID();
  const inputPath = path.join(CACHE_DIR, `${id}.gif`);
  const outputPath = path.join(CACHE_DIR, `${id}.mp4`);
  const hw = getHwProfile();

  try {
    const mediaResponse = await request(gifUrl, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "AuraReedBot/2.0" },
    });

    if (mediaResponse.statusCode < 200 || mediaResponse.statusCode >= 300) {
      throw new Error(`GIF HTTP ${mediaResponse.statusCode}`);
    }

    await pipeline(mediaResponse.body, createWriteStream(inputPath));

    let encodedWithGpu = false;
    if (hw.h264Nvenc) {
      encodedWithGpu = await hw.runWithGpuSlot(async () => {
        try {
          await execFileAsync(
            GPU_FFMPEG_BIN,
            [
              "-nostats",
              "-loglevel",
              "error",
              "-threads",
              "0",
              "-y",
              "-i",
              inputPath,
              "-c:v",
              "h264_nvenc",
              "-preset",
              "p4",
              "-rc",
              "vbr",
              "-cq",
              "22",
              "-b:v",
              "0",
              "-movflags",
              "+faststart",
              "-pix_fmt",
              "yuv420p",
              "-vf",
              "scale=trunc(iw/2)*2:trunc(ih/2)*2",
              "-an",
              outputPath,
            ],
            { timeout: 30000, maxBuffer: FFMPEG_MAX_BUFFER, windowsHide: true },
          );
          return await hasValidOutput(outputPath);
        } catch {
          return false;
        }
      });
    }

    if (!encodedWithGpu) {
      await hw.runWithCpuSlot(() =>
        execFileAsync(
          CPU_FFMPEG_BIN,
          [
            "-nostats",
            "-loglevel",
            "error",
            "-threads",
            "0",
            "-y",
            "-i",
            inputPath,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-threads",
            "0",
            "-movflags",
            "+faststart",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-an",
            outputPath,
          ],
          { timeout: 30000, maxBuffer: FFMPEG_MAX_BUFFER, windowsHide: true },
        ),
      );
    }

    return outputPath;
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(inputPath, { force: true }).catch(() => undefined);
  }
}

export async function CONVERT_TO_AVC(inputPath: string): Promise<string> {
  const isRemoteUrl = /^https?:\/\//i.test(inputPath);
  const sourcePath = isRemoteUrl
    ? await downloadToCache(inputPath, 600000)
    : inputPath;

  await ensureCacheDir();
  const id = randomUUID();
  const outputPath = path.join(CACHE_DIR, `${id}.mp4`);
  const hw = getHwProfile();

  try {
    const probe = await probeMedia(sourcePath);

    if (
      probe.vCodec === "h264" &&
      probe.isYuv420p &&
      probe.hasEvenDimensions &&
      (!probe.hasAudio || probe.isAacAudio)
    ) {
      const remuxed = await hw.runWithCpuSlot(async () => {
        try {
          await execFileAsync(
            CPU_FFMPEG_BIN,
            [
              "-nostats",
              "-loglevel",
              "error",
              "-y",
              "-i",
              sourcePath,
              "-map",
              "0:v:0",
              "-map",
              "0:a?",
              "-map_metadata",
              "-1",
              "-sn",
              "-dn",
              "-c",
              "copy",
              "-movflags",
              "+faststart",
              outputPath,
            ],
            { timeout: 60000, maxBuffer: FFMPEG_MAX_BUFFER, windowsHide: true },
          );
          return await hasValidOutput(outputPath);
        } catch {
          return false;
        }
      });

      if (remuxed) return outputPath;
      await rm(outputPath, { force: true }).catch(() => undefined);
    }

    const audioArgs = (copyAudio: boolean) =>
      !probe.hasAudio
        ? ["-an"]
        : copyAudio
          ? ["-c:a", "copy"]
          : ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"];

    let encodedWithGpu = false;
    if (hw.h264Nvenc) {
      const canCudaDecode =
        hw.cuda &&
        probe.isYuv420p &&
        ["hevc", "h264", "vp9", "av1"].includes(probe.vCodec);

      const buildNvencArgs = (useCudaDecode: boolean, copyAudio: boolean) => [
        "-nostats",
        "-loglevel",
        "error",
        ...(useCudaDecode ? ["-hwaccel", "cuda"] : ["-threads", "0"]),
        "-y",
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-map_metadata",
        "-1",
        "-sn",
        "-dn",
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p4",
        "-tune",
        "hq",
        "-rc",
        "vbr",
        "-cq",
        "20",
        "-b:v",
        "0",
        "-maxrate",
        "8M",
        "-bufsize",
        "16M",
        "-profile:v",
        "high",
        "-level:v",
        "4.2",
        "-pix_fmt",
        "yuv420p",
        ...(probe.hasEvenDimensions
          ? []
          : ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p"]),
        ...audioArgs(copyAudio),
        "-movflags",
        "+faststart",
        outputPath,
      ];

      encodedWithGpu = await hw.runWithGpuSlot(async () => {
        const gpuPlans: Array<[boolean, boolean]> = [];
        if (canCudaDecode) {
          gpuPlans.push([true, probe.isAacAudio]);
        }
        gpuPlans.push([false, probe.isAacAudio]);
        if (probe.isAacAudio) {
          gpuPlans.push([false, false]);
        }

        for (const [useCuda, copyAudio] of gpuPlans) {
          try {
            await execFileAsync(
              GPU_FFMPEG_BIN,
              buildNvencArgs(useCuda, copyAudio),
              { timeout: 600000, maxBuffer: FFMPEG_MAX_BUFFER, windowsHide: true },
            );
            if (await hasValidOutput(outputPath)) return true;
          } catch {}
        }
        return false;
      });
    }

    if (!encodedWithGpu) {
      await rm(outputPath, { force: true }).catch(() => undefined);

      const buildCpuArgs = (copyAudio: boolean) => [
        "-nostats",
        "-loglevel",
        "error",
        "-threads",
        "0",
        "-thread_type",
        "frame+slice",
        "-y",
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-map_metadata",
        "-1",
        "-sn",
        "-dn",
        "-c:v",
        "libx264",
        "-threads",
        "0",
        "-profile:v",
        "high",
        "-level:v",
        "4.2",
        "-preset",
        "ultrafast",
        "-crf",
        "19",
        "-maxrate",
        "8M",
        "-bufsize",
        "16M",
        "-x264-params",
        "rc-lookahead=15:ref=3:keyint=60:min-keyint=60",
        "-pix_fmt",
        "yuv420p",
        ...(probe.hasEvenDimensions
          ? []
          : ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"]),
        ...audioArgs(copyAudio),
        "-movflags",
        "+faststart",
        outputPath,
      ];

      await hw.runWithCpuSlot(async () => {
        try {
          await execFileAsync(CPU_FFMPEG_BIN, buildCpuArgs(probe.isAacAudio), {
            timeout: 600000,
            maxBuffer: FFMPEG_MAX_BUFFER,
            windowsHide: true,
          });
        } catch (err) {
          if (!probe.isAacAudio) throw err;
          await execFileAsync(CPU_FFMPEG_BIN, buildCpuArgs(false), {
            timeout: 600000,
            maxBuffer: FFMPEG_MAX_BUFFER,
            windowsHide: true,
          });
        }
      });
    }

    if (!(await hasValidOutput(outputPath))) {
      throw new Error("La conversión no generó un archivo de salida válido.");
    }

    return outputPath;
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined);
    if (isRemoteUrl) {
      await rm(sourcePath, { force: true }).catch(() => undefined);
    }
    throw error instanceof Error
      ? error
      : new Error("No se pudo convertir el video a un formato compatible.");
  }
}

export async function CONVERT_AUDIO_TO_OGG(
  buffer: Buffer,
  exactDuration?: number,
): Promise<Buffer> {
  await ensureCacheDir();
  const hw = getHwProfile();
  const tempDir = await mkdtemp(path.join(CACHE_DIR, "gstatus-audio-"));
  const inputPath = path.join(tempDir, "input.media");
  const outputPath = path.join(tempDir, "output.ogg");

  try {
    await writeFile(inputPath, buffer);
    await hw.runWithCpuSlot(() =>
      execFileAsync(
        CPU_FFMPEG_BIN,
        [
          "-nostats",
          "-loglevel",
          "error",
          "-threads",
          "0",
          "-y",
          "-i",
          inputPath,
          "-vn",
          ...(exactDuration && exactDuration > 0
            ? ["-t", String(exactDuration)]
            : []),
          "-c:a",
          "libopus",
          "-b:a",
          "96k",
          "-ar",
          "48000",
          "-application",
          "voip",
          "-frame_duration",
          "20",
          "-avoid_negative_ts",
          "make_zero",
          "-map_metadata",
          "-1",
          "-map_chapters",
          "-1",
          "-f",
          "ogg",
          outputPath,
        ],
        { timeout: 120000, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      ),
    );

    const converted = await readFile(outputPath);
    if (!converted.length) throw new Error("FFmpeg generó un audio vacío.");
    return converted;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
