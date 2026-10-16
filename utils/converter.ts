import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { request } from "undici";

const execFileAsync = promisify(execFile);
const FFMPEG_MAX_BUFFER = 512 * 1024 * 1024;

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

const MAX_CONCURRENT_JOBS = 1;
let activeJobs = 0;
const jobQueue: Array<() => void> = [];

async function runWithConcurrencyLimit<T>(task: () => Promise<T>): Promise<T> {
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    await new Promise<void>((resolve) => jobQueue.push(resolve));
  }
  activeJobs++;
  try {
    return await task();
  } finally {
    activeJobs--;
    const next = jobQueue.shift();
    if (next) next();
  }
}

interface MediaProbe {
  hasEvenDimensions: boolean;
  isAacAudio: boolean;
}

async function probeMedia(inputPath: string): Promise<MediaProbe> {
  if (!ffmpegPath) return { hasEvenDimensions: false, isAacAudio: false };

  let stderr = "";
  try {
    await execFileAsync(ffmpegPath, ["-hide_banner", "-i", inputPath], {
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "";
  }

  const resMatch = stderr.match(/Stream #0:\d+.*Video:.*?\b(\d{2,5})x(\d{2,5})\b/i);
  const width = resMatch ? Number(resMatch[1]) : 0;
  const height = resMatch ? Number(resMatch[2]) : 0;
  const hasEvenDimensions =
    width > 0 && height > 0 && width % 2 === 0 && height % 2 === 0;

  const isAacAudio = /Stream #0:\d+.*Audio:\s*aac\b/i.test(stderr);

  return { hasEvenDimensions, isAacAudio };
}

export async function GIF_TO_VIDEO(gifUrl: string): Promise<string> {
  if (!ffmpegPath) throw new Error("FFmpeg no está disponible en este entorno");

  await ensureCacheDir();
  const id = randomUUID();
  const inputPath = path.join(CACHE_DIR, `${id}.gif`);
  const outputPath = path.join(CACHE_DIR, `${id}.mp4`);

  try {
    const mediaResponse = await request(gifUrl, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "AuraReedBot/2.0" },
    });

    if (mediaResponse.statusCode < 200 || mediaResponse.statusCode >= 300) {
      throw new Error(`GIF HTTP ${mediaResponse.statusCode}`);
    }

    await pipeline(mediaResponse.body, createWriteStream(inputPath));

    await runWithConcurrencyLimit(() =>
      execFileAsync(
        ffmpegPath!,
        [
          "-nostats",
          "-loglevel", "error",
          "-threads", "2",
          "-y",
          "-i", inputPath,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "22",
          "-threads", "2",
          "-movflags", "+faststart",
          "-pix_fmt", "yuv420p",
          "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-an",
          outputPath,
        ],
        { timeout: 30000, maxBuffer: FFMPEG_MAX_BUFFER },
      ),
    );
    return outputPath;
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(inputPath, { force: true }).catch(() => undefined);
  }
}

export async function CONVERT_TO_AVC(inputPath: string): Promise<string> {
  if (!ffmpegPath) return inputPath;

  await ensureCacheDir();
  const id = randomUUID();
  const outputPath = path.join(CACHE_DIR, `${id}.mp4`);

  try {
    const { hasEvenDimensions, isAacAudio } = await probeMedia(inputPath);

    const buildArgs = (copyAudio: boolean) => [
      "-nostats",
      "-loglevel", "error",
      "-threads", "2",
      "-thread_type", "frame+slice",
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-map_metadata", "-1",
      "-sn",
      "-dn",
      "-c:v", "libx264",
      "-threads", "2",
      "-profile:v", "high",
      "-level:v", "4.2",
      "-preset", "fast",
      "-crf", "18",
      "-maxrate", "8M",
      "-bufsize", "16M",
      "-x264-params", "rc-lookahead=15:ref=3:keyint=60:min-keyint=60",
      "-pix_fmt", "yuv420p",
      ...(hasEvenDimensions ? [] : ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"]),
      ...(copyAudio
        ? ["-c:a", "copy"]
        : ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"]),
      "-movflags", "+faststart",
      outputPath,
    ];

    await runWithConcurrencyLimit(async () => {
      try {
        await execFileAsync(ffmpegPath!, buildArgs(isAacAudio), {
          timeout: 600000,
          maxBuffer: FFMPEG_MAX_BUFFER,
        });
      } catch (err) {
        if (!isAacAudio) throw err;
        await execFileAsync(ffmpegPath!, buildArgs(false), {
          timeout: 600000,
          maxBuffer: FFMPEG_MAX_BUFFER,
        });
      }
    });

    return outputPath;
  } catch {
    await rm(outputPath, { force: true }).catch(() => undefined);
    return inputPath;
  }
}
