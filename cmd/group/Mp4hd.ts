import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const TEMP_DIR = path.resolve(process.cwd(), "data", "mp4hd_temp");
const CPU_CORES = 2;
const STAGE_TIMEOUT_MS = 110000;

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

let activeRenderJobs = 0;

interface VideoProbeInfo {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  bitrateKbps: number;
  codec: string;
}

interface TargetConfig {
  key: string;
  label: string;
  maxLongEdge: number;
  minSourceShortEdge: number;
  minSourceBitrate: number;
  crf: number;
  maxrate: string;
  bufsize: string;
}

const QUALITY_PRESETS: Record<string, TargetConfig> = {
  "720p": {
    key: "720p",
    label: "720p HD",
    maxLongEdge: 1280,
    minSourceShortEdge: 120,
    minSourceBitrate: 40,
    crf: 21,
    maxrate: "4500k",
    bufsize: "9000k",
  },
  "1080p": {
    key: "1080p",
    label: "1080p Full HD",
    maxLongEdge: 1920,
    minSourceShortEdge: 160,
    minSourceBitrate: 65,
    crf: 20,
    maxrate: "8500k",
    bufsize: "17000k",
  },
  "2k": {
    key: "2k",
    label: "2K QHD (1440p)",
    maxLongEdge: 2560,
    minSourceShortEdge: 200,
    minSourceBitrate: 95,
    crf: 20,
    maxrate: "14000k",
    bufsize: "24000k",
  },
  "4k": {
    key: "4k",
    label: "4K Ultra HD (2160p)",
    maxLongEdge: 3840,
    minSourceShortEdge: 240,
    minSourceBitrate: 120,
    crf: 21,
    maxrate: "22000k",
    bufsize: "36000k",
  },
};

function unwrapMessage(message: any): any {
  if (!message || typeof message !== "object") return null;
  if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) return unwrapMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
  if (message.editedMessage?.message) return unwrapMessage(message.editedMessage.message);
  return message;
}

function extractVideoNode(msg: any): { node: any; type: "video" | "document" } | null {
  const root = unwrapMessage(msg?.message);
  if (!root) return null;

  if (root.videoMessage) {
    return { node: root.videoMessage, type: "video" };
  }
  if (root.documentMessage && String(root.documentMessage.mimetype || "").startsWith("video/")) {
    return { node: root.documentMessage, type: "document" };
  }

  let ctxInfo: any = null;
  for (const k of Object.keys(root)) {
    if (root[k] && typeof root[k] === "object" && root[k].contextInfo?.quotedMessage) {
      ctxInfo = root[k].contextInfo;
      break;
    }
  }

  const quoted = unwrapMessage(ctxInfo?.quotedMessage);
  if (!quoted) return null;

  if (quoted.videoMessage) {
    return { node: quoted.videoMessage, type: "video" };
  }
  if (quoted.documentMessage && String(quoted.documentMessage.mimetype || "").startsWith("video/")) {
    return { node: quoted.documentMessage, type: "document" };
  }

  return null;
}

async function downloadVideoToFile(
  target: { node: any; type: "video" | "document" },
  destPath: string,
): Promise<number> {
  const bMod: any = await import("baileys");
  if (typeof bMod.downloadContentFromMessage !== "function") {
    throw new Error("Función downloadContentFromMessage no disponible.");
  }

  const stream = await bMod.downloadContentFromMessage(target.node, target.type);
  const writeStream = fs.createWriteStream(destPath);
  let totalBytes = 0;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (!writeStream.write(buf)) {
      await new Promise<void>((res) => writeStream.once("drain", () => res()));
    }
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end();
    writeStream.on("finish", () => resolve());
    writeStream.on("error", (err) => reject(err));
  });

  return totalBytes;
}

function probeVideoFile(filePath: string, fileSizeBytes: number): Promise<VideoProbeInfo> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-threads", "1", "-i", filePath]);
    let stderr = "";

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      reject(new Error("Tiempo agotado al analizar el video de entrada."));
    }, 15000);

    proc.stderr.on("data", (chunk) => {
      if (stderr.length < 32768) {
        stderr += chunk.toString();
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`No se pudo ejecutar FFmpeg: ${err.message}`));
    });

    proc.on("close", () => {
      clearTimeout(timer);
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      let durationSec = 0;
      if (durMatch) {
        durationSec =
          parseInt(durMatch[1], 10) * 3600 +
          parseInt(durMatch[2], 10) * 60 +
          parseFloat(durMatch[3]);
      }

      const videoLineMatch = stderr.match(/Stream\s+#\d+:\d+.*Video:\s*([^\n\r]+)/);
      if (!videoLineMatch) {
        return reject(new Error("El archivo no contiene una pista de video válida."));
      }

      const videoLine = videoLineMatch[1];
      const codecMatch = videoLine.match(/^([a-zA-Z0-9_]+)/);
      const codec = codecMatch ? codecMatch[1].toUpperCase() : "UNKNOWN";

      const resMatch = videoLine.match(/,\s*(\d{2,5})x(\d{2,5})(?:[\s,\[])/);
      const width = resMatch ? parseInt(resMatch[1], 10) : 0;
      const height = resMatch ? parseInt(resMatch[2], 10) : 0;

      const fpsMatch =
        videoLine.match(/(\d+(?:\.\d+)?)\s*fps/) ||
        videoLine.match(/(\d+(?:\.\d+)?)\s*tbr/);
      const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 30;

      const brMatch = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/i);
      let bitrateKbps = brMatch ? parseInt(brMatch[1], 10) : 0;
      if (!bitrateKbps && durationSec > 0) {
        bitrateKbps = Math.round((fileSizeBytes * 8) / 1000 / durationSec);
      }

      resolve({
        width,
        height,
        fps,
        durationSec,
        bitrateKbps,
        codec,
      });
    });
  });
}

function parseQualityAndFps(args: string[]): { qualityKey: string | null; targetFps: number | null; asDoc: boolean } {
  let qualityKey: string | null = null;
  let targetFps: number | null = null;
  let asDoc = false;

  for (const raw of args) {
    const token = raw.toLowerCase().trim();

    if (token === "doc" || token === "documento") {
      asDoc = true;
      continue;
    }

    if (["4k", "2160p", "uhd"].includes(token)) {
      qualityKey = "4k";
      continue;
    }
    if (["2k", "1440p", "qhd"].includes(token)) {
      qualityKey = "2k";
      continue;
    }
    if (["1080p", "1080", "fhd", "fullhd"].includes(token)) {
      qualityKey = "1080p";
      continue;
    }
    if (["720p", "720", "hd"].includes(token)) {
      qualityKey = "720p";
      continue;
    }

    const fpsMatch = token.match(/^(\d{2,3})(?:fps)?$/);
    if (fpsMatch) {
      const val = parseInt(fpsMatch[1], 10);
      if (val >= 24 && val <= 120) {
        targetFps = val;
      }
    }
  }

  return { qualityKey, targetFps, asDoc };
}

function calculateTargetDimensions(srcW: number, srcH: number, maxLongEdge: number): { outW: number; outH: number } {
  const isLandscape = srcW >= srcH;
  let outW = 0;
  let outH = 0;

  if (isLandscape) {
    outW = maxLongEdge;
    outH = Math.round((srcH / srcW) * maxLongEdge);
  } else {
    outH = maxLongEdge;
    outW = Math.round((srcW / srcH) * maxLongEdge);
  }

  outW = Math.max(2, outW - (outW % 2));
  outH = Math.max(2, outH - (outH % 2));

  return { outW, outH };
}

function runFfmpegStage(options: {
  inputPath: string;
  outputPath: string;
  outW: number;
  outH: number;
  targetFps: number;
  presetCfg: TargetConfig;
  mode: "primary" | "turbo_fallback";
  durationSec: number;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const vfChain =
      options.mode === "primary"
        ? [
            `hqdn3d=1.5:1.5:3:3`,
            `eq=contrast=1.04:saturation=1.06`,
            `scale=${options.outW}:${options.outH}:flags=lanczos`,
            `unsharp=3:3:0.75:3:3:0.0`,
            `fps=${options.targetFps}`,
          ].join(",")
        : [
            `eq=contrast=1.03:saturation=1.05`,
            `scale=${options.outW}:${options.outH}:flags=bicubic`,
            `unsharp=3:3:0.5:3:3:0.0`,
            `fps=${options.targetFps}`,
          ].join(",");

    const x264Params = [
      `threads=${CPU_CORES}`,
      `lookahead_threads=1`,
      `rc_lookahead=8`,
      `ref=1`,
      `subme=2`,
      `me=dia`,
      `trellis=0`,
      `slices=${CPU_CORES}`,
    ].join(":");

    const ffArgs = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-progress",
      "pipe:1",
      "-threads",
      String(CPU_CORES),
      "-filter_threads",
      String(CPU_CORES),
      "-filter_complex_threads",
      String(CPU_CORES),
      "-i",
      options.inputPath,
      "-vf",
      vfChain,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      String(options.presetCfg.crf),
      "-maxrate",
      options.presetCfg.maxrate,
      "-bufsize",
      options.presetCfg.bufsize,
      "-x264-params",
      x264Params,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      options.outputPath,
    ];

    const proc = spawn("ffmpeg", ffArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let errLog = "";
    let lastReportedPct = 0;

    const watchdog = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      reject(new Error("TIMEOUT_EXCEEDED"));
    }, STAGE_TIMEOUT_MS);

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/out_time_ms=(\d+)/);
      if (match && options.durationSec > 0 && options.onProgress) {
        const currentSec = parseInt(match[1], 10) / 1000000;
        const pct = Math.min(99, Math.max(1, Math.round((currentSec / options.durationSec) * 100)));
        if (pct >= lastReportedPct + 25) {
          lastReportedPct = pct;
          options.onProgress(pct);
        }
      }
    });

    proc.stderr.on("data", (d) => {
      if (errLog.length < 8192) {
        errLog += d.toString();
      }
    });

    proc.on("error", (err) => {
      clearTimeout(watchdog);
      reject(err);
    });

    proc.on("close", (code, signal) => {
      clearTimeout(watchdog);
      if (code === 0 && fs.existsSync(options.outputPath) && fs.statSync(options.outputPath).size > 2048) {
        resolve();
      } else {
        const reason =
          signal === "SIGKILL"
            ? "OOM_OR_KILLED"
            : errLog.trim().split("\n").slice(-2).join(" ") || `Exit code ${code}`;
        reject(new Error(reason));
      }
    });
  });
}

function safeUnlink(filePath: string) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

export default {
  name: ["mp4hd", "video4k", "hdvideo", "upscalevideo"],
  category: "group",
  description: "Reescala y mejora videos hasta 4K usando 2 núcleos dedicados con sistema de fallbacks automáticos.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    const videoTarget = extractVideoNode(msg);
    const { qualityKey, targetFps, asDoc } = parseQualityAndFps(args);

    if (!videoTarget) {
      return reply(
        `╭〔 🎬 ${fytBold("LuferOS MP4-HD & 4K (2-Core Engine)")} 〕⬣\n` +
          `• Responde a un video especificando *calidad* y *fotogramas*:\n\n` +
          `  \`${prefix}mp4hd 4k 60fps\`\n` +
          `  \`${prefix}mp4hd 2k 60fps\`\n` +
          `  \`${prefix}mp4hd 1080p 60fps\`\n` +
          `  \`${prefix}mp4hd 720p 30fps\`\n\n` +
          `• *Calidades:* \`720p\`, \`1080p\`, \`2k\`, \`4k\`\n` +
          `• *Fotogramas:* \`24fps\` a \`120fps\`\n` +
          `• *Opcional:* Añade \`doc\` para recibirlo como archivo documento.\n` +
          `╰━━━━━━━━━━━━⬣`,
      );
    }

    if (!qualityKey || !targetFps) {
      return reply(
        `⚠️ Especifica la *calidad* (\`720p\`, \`1080p\`, \`2k\`, \`4k\`) y los *fotogramas* (\`30fps\`, \`60fps\`, \`120fps\`).\n` +
          `• *Ejemplo:* \`${prefix}mp4hd 4k 60fps\``,
      );
    }

    if (activeRenderJobs >= 1) {
      return reply(`⏳ Ya hay un renderizado de video en curso en los 2 núcleos. Espera unos segundos a que finalice.`);
    }

    const id = randomUUID().replace(/-/g, "").slice(0, 10);
    const inputPath = path.join(TEMP_DIR, `in_${id}.mp4`);
    const outputPath = path.join(TEMP_DIR, `out_${id}.mp4`);

    activeRenderJobs++;
    await react("🔍").catch(() => undefined);

    try {
      const fileSizeBytes = await downloadVideoToFile(videoTarget, inputPath);
      if (fileSizeBytes < 4096) {
        throw new Error("El archivo de video descargado está vacío o corrupto.");
      }

      const info = await probeVideoFile(inputPath, fileSizeBytes);
      let activePreset = QUALITY_PRESETS[qualityKey];
      let finalFps = targetFps;

      const shortEdge = Math.min(info.width, info.height);
      const totalFrames = Math.round(info.durationSec * info.fps);

      if (info.width <= 0 || info.height <= 0 || info.durationSec < 0.4 || totalFrames < 6) {
        await react("❌").catch(() => undefined);
        return reply(
          `❌ *Información insuficiente en el video:*\n` +
            `• Resolución: \`${info.width}x${info.height}\` | Cuadros: \`${totalFrames}\``,
        );
      }

      if (info.durationSec > 60) {
        await react("⚠️").catch(() => undefined);
        return reply(
          `⚠️ El video dura \`${info.durationSec.toFixed(1)}s\`. El límite máximo para renderizado con 2 núcleos es de *60 segundos*.`,
        );
      }

      if (shortEdge < activePreset.minSourceShortEdge || info.bitrateKbps < activePreset.minSourceBitrate) {
        const autoFallbackKey = shortEdge >= 200 ? "2k" : shortEdge >= 160 ? "1080p" : "720p";
        activePreset = QUALITY_PRESETS[autoFallbackKey];
      }

      if (finalFps > info.fps * 3) {
        finalFps = Math.min(120, Math.round(info.fps * 2));
      }

      let { outW, outH } = calculateTargetDimensions(info.width, info.height, activePreset.maxLongEdge);
      let engineUsed = `Lanczos + Unsharp 3x3 + HQDN3D (${CPU_CORES} Cores)`;

      await react("⚙️").catch(() => undefined);
      const statusMsg = await sock.sendMessage(
        from,
        {
          text:
            `╭〔 ⚙️ ${fytBold("Procesando en " + activePreset.label)} 〕⬣\n` +
            `• *Origen:* \`${info.width}x${info.height}\` @ \`${info.fps}fps\` (\`${info.bitrateKbps} kbps\`)\n` +
            `• *Salida:* \`${outW}x${outH}\` @ \`${finalFps}fps\`\n` +
            `• *CPU:* \`${CPU_CORES} Núcleos dedicados\`\n` +
            `• *Estado:* \`Renderizando (0%)...\`\n` +
            `╰━━━━━━━━━━━━⬣`,
        },
        { quoted: msg },
      );

      const updateStatusText = async (stageText: string) => {
        if (!statusMsg?.key) return;
        await sock
          .sendMessage(from, {
            edit: statusMsg.key,
            text:
              `╭〔 ⚙️ ${fytBold("Procesando en " + activePreset.label)} 〕⬣\n` +
              `• *Origen:* \`${info.width}x${info.height}\` @ \`${info.fps}fps\`\n` +
              `• *Salida:* \`${outW}x${outH}\` @ \`${finalFps}fps\`\n` +
              `• *CPU:* \`${CPU_CORES} Núcleos dedicados\`\n` +
              `• *Estado:* \`${stageText}\`\n` +
              `╰━━━━━━━━━━━━⬣`,
          })
          .catch(() => undefined);
      };

      try {
        await runFfmpegStage({
          inputPath,
          outputPath,
          outW,
          outH,
          targetFps: finalFps,
          presetCfg: activePreset,
          mode: "primary",
          durationSec: info.durationSec,
          onProgress: (pct) => {
            updateStatusText(`Renderizando motor principal (${pct}%)...`);
          },
        });
      } catch {
        safeUnlink(outputPath);
        engineUsed = `Turbo Bicubic + Unsharp (${CPU_CORES} Cores Fallback 1)`;
        await updateStatusText(`Aplicando Fallback 1 (Turbo Bicubic 2-Cores)...`);

        try {
          await runFfmpegStage({
            inputPath,
            outputPath,
            outW,
            outH,
            targetFps: finalFps,
            presetCfg: activePreset,
            mode: "turbo_fallback",
            durationSec: info.durationSec,
          });
        } catch {
          safeUnlink(outputPath);
          const safeStepDownKey =
            activePreset.key === "4k" ? "2k" : activePreset.key === "2k" ? "1080p" : "720p";
          activePreset = QUALITY_PRESETS[safeStepDownKey];
          const steppedDims = calculateTargetDimensions(info.width, info.height, activePreset.maxLongEdge);
          outW = steppedDims.outW;
          outH = steppedDims.outH;
          engineUsed = `Safe ${activePreset.label} Engine (${CPU_CORES} Cores Fallback 2)`;

          await updateStatusText(`Aplicando Fallback 2 (${activePreset.label} seguro)...`);

          await runFfmpegStage({
            inputPath,
            outputPath,
            outW,
            outH,
            targetFps: finalFps,
            presetCfg: activePreset,
            mode: "turbo_fallback",
            durationSec: info.durationSec,
          });
        }
      }

      const finalStat = fs.statSync(outputPath);
      const outSizeMb = (finalStat.size / (1024 * 1024)).toFixed(2);
      const caption =
        `✅ *${fytBold("LuferOS MP4-HD Completado")}*\n` +
        `• *Calidad:* \`${activePreset.label}\` (\`${outW}x${outH}\`)\n` +
        `• *Fluidez:* \`${finalFps} FPS\`\n` +
        `• *Motor:* \`${engineUsed}\`\n` +
        `• *Peso:* \`${outSizeMb} MB\``;

      await updateStatusText(`Subiendo video procesado (${outSizeMb} MB)...`);

      if (asDoc || finalStat.size > 45 * 1024 * 1024 || outW >= 2560) {
        await sock.sendMessage(
          from,
          {
            document: { url: outputPath },
            mimetype: "video/mp4",
            fileName: `LuferOS_${activePreset.key.toUpperCase()}_${outW}x${outH}_${finalFps}FPS.mp4`,
            caption,
          },
          { quoted: msg },
        );
      } else {
        await sock.sendMessage(
          from,
          {
            video: { url: outputPath },
            mimetype: "video/mp4",
            caption,
          },
          { quoted: msg },
        );
      }

      await react("✅").catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ ${fytBold("MP4-HD:")} ${e?.message || String(e)}`).catch(() => undefined);
    } finally {
      activeRenderJobs = Math.max(0, activeRenderJobs - 1);
      safeUnlink(inputPath);
      safeUnlink(outputPath);
    }
  },
};
