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
const FFMPEG_MAX_BUFFER = 64 * 1024 * 1024; 
const UMBRAL_60MB = 60 * 1024 * 1024;

export async function GIF_TO_VIDEO(gifUrl: string): Promise<string> {
  if (!ffmpegPath) throw new Error("FFmpeg no está disponible en este entorno");

  const cacheDir = process.env.GLOBAL_CUSTOM_TMP || process.env.TMPDIR || path.resolve("./cache");
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
        "-loglevel", "error",
        "-y",
        "-i", inputPath,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-threads", "2", 
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
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
  if (!ffmpegPath) return inputPath;

  const cacheDir = process.env.GLOBAL_CUSTOM_TMP || process.env.TMPDIR || path.resolve("./cache");
  await mkdir(cacheDir, { recursive: true });
  const id = randomUUID();
  const outputPath = path.join(cacheDir, `${id}.mp4`);

  try {
    const fileStats = await stat(inputPath);
    const isLargeFile = fileStats.size > UMBRAL_60MB;

    // Base de argumentos para garantizar compatibilidad con Estados y Reenvíos de WhatsApp
    const baseArgs = [
      "-nostats",
      "-loglevel", "error",
      "-y",
      "-i", inputPath,
      "-map_metadata", "-1", 
      "-map", "0:v:0",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-threads", "2",
      "-profile:v", "main",
      "-level:v", "4.0",
      "-pix_fmt", "yuv420p",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-movflags", "+faststart"
    ];

    let qualityArgs: string[];

    if (isLargeFile) {
      // > 60MB: Presets rápidos pero forzando bitrate alto para evitar pixelación
      qualityArgs = [
        "-preset", "ultrafast",
        "-crf", "18",
        "-maxrate", "8M",
        "-bufsize", "16M",
        outputPath
      ];
    } else {
      // < 60MB: Calidad visual sin pérdida (Transparente al ojo humano)
      qualityArgs = [
        "-preset", "fast",
        "-crf", "17",
        outputPath
      ];
    }

    const encodeArgs = [...baseArgs, ...qualityArgs];
    
    await execFileAsync(ffmpegPath, encodeArgs, { timeout: 180000, maxBuffer: FFMPEG_MAX_BUFFER });

    return outputPath;

  } catch (error) {
    console.error("[converter] Error fatal en FFmpeg:", error);
    await rm(outputPath, { force: true }).catch(() => undefined);
    return inputPath; 
  }
}
