import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { request } from "undici";

const execFileAsync = promisify(execFile);
const FFMPEG_MAX_BUFFER = 32 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const TARGET_VIDEO_SIZE = 94 * 1024 * 1024;

export async function GIF_TO_VIDEO(gifUrl: string): Promise<string> {
  if (!ffmpegPath) throw new Error("FFmpeg no está disponible en este entorno");

  const cacheDir =
    process.env.GLOBAL_CUSTOM_TMP || process.env.TMPDIR || path.resolve("./cache");
  await mkdir(cacheDir, { recursive: true });
  const id = randomUUID();
  const inputPath = path.join(cacheDir, `${id}.gif`);
  const outputPath = path.join(cacheDir, `${id}.mp4`);

  try {
    const mediaResponse = await request(gifUrl, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "AuraReedBot/2.0" },
    });
    if (mediaResponse.statusCode < 200 || mediaResponse.statusCode >= 300) {
      throw new Error(`GIF HTTP ${mediaResponse.statusCode}`);
    }

    await pipeline(mediaResponse.body, createWriteStream(inputPath));
    await execFileAsync(
      ffmpegPath,
      [
        "-nostats",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-an",
        outputPath,
      ],
      { timeout: 30000, maxBuffer: FFMPEG_MAX_BUFFER },
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
  if (!ffmpegPath) throw new Error("FFmpeg no está disponible en este entorno");

  const cacheDir =
    process.env.GLOBAL_CUSTOM_TMP || process.env.TMPDIR || path.resolve("./cache");
  await mkdir(cacheDir, { recursive: true });
  const id = randomUUID();
  const outputPath = path.join(cacheDir, `${id}.mp4`);

  try {
    const inputSize = (await stat(inputPath)).size;
    let metadata = "";
    try {
      await execFileAsync(ffmpegPath, ["-hide_banner", "-i", inputPath], {
        timeout: 30000,
        maxBuffer: FFMPEG_MAX_BUFFER,
      });
    } catch (error) {
      metadata =
        error && typeof error === "object" && "stderr" in error
          ? String(error.stderr)
          : "";
    }
    const codec = metadata.match(/Video:\s*([a-z0-9_]+)/i)?.[1]?.toLowerCase();
    const durationMatch = metadata.match(
      /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i,
    );
    if (!codec || !durationMatch)
      throw new Error("No se pudo detectar el codec o la duración del video.");

    const duration =
      Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3]);
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("La duración del video no es válida.");

    let shouldLimitSize: boolean;
    if (codec === "hevc" && inputSize <= MAX_VIDEO_SIZE) {
      shouldLimitSize = false;
    } else if (codec === "h264" && inputSize > MAX_VIDEO_SIZE) {
      shouldLimitSize = true;
    } else if (codec === "hevc" && inputSize > MAX_VIDEO_SIZE) {
      shouldLimitSize = true;
    } else if (codec === "h264") {
      try {
        await execFileAsync(
          ffmpegPath,
          [
            "-nostats",
            "-loglevel",
            "error",
            "-y",
            "-i",
            inputPath,
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c",
            "preset",
            "ultrafast",
            "copy",
            "-movflags",
            "+faststart",
            outputPath,
          ],
          { timeout: 600000, maxBuffer: FFMPEG_MAX_BUFFER },
        );
        if ((await stat(outputPath)).size < MAX_VIDEO_SIZE) return outputPath;
      } catch {
        await rm(outputPath, { force: true }).catch(() => undefined);
      }
      shouldLimitSize = false;
    } else {
      shouldLimitSize = inputSize > MAX_VIDEO_SIZE;
    }

    const audioBitrate = 128000;
    const sizeLimitedBitrate = Math.floor(
      (TARGET_VIDEO_SIZE * 8) / duration - audioBitrate,
    );
    const sourceBitrate = Math.floor((inputSize * 8) / duration);
    let videoBitrate = Math.max(
      50000,
      Math.min(sizeLimitedBitrate, sourceBitrate - audioBitrate),
    );

    for (let attempt = 0; attempt < 2; attempt++) {
      const encodeArgs = [
        "-nostats",
        "-loglevel",
        "error",
        "-filter_threads",
        "1",
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-profile:v",
        "high",
        "-level:v",
        "4.0",
        ...(shouldLimitSize
          ? [
              "-b:v",
              String(videoBitrate),
              "-maxrate",
              String(videoBitrate),
              "-bufsize",
              String(videoBitrate * 2),
            ]
          : ["-crf", "18"]),
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:a",
        "aac",
        "-b:a",
        String(audioBitrate),
        "-movflags",
        "+faststart",
        outputPath,
      ];
      await execFileAsync(
        ffmpegPath,
        encodeArgs,
        { timeout: 600000, maxBuffer: FFMPEG_MAX_BUFFER },
      );

      const outputSize = (await stat(outputPath)).size;
      if (outputSize < MAX_VIDEO_SIZE) return outputPath;
      shouldLimitSize = true;
      videoBitrate = Math.max(
        20000,
        Math.floor(videoBitrate * (TARGET_VIDEO_SIZE / outputSize) * 0.9),
      );
    }

    throw new Error("No se pudo comprimir el video por debajo de 100 MB.");
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined);
    throw error;
  }
}