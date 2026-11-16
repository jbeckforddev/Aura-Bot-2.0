import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const TEMP_DIR = path.resolve(process.cwd(), "data", "mp4hd_temp");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

interface VideoProbeInfo {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  bitrateKbps: number;
  codec: string;
}

interface TargetConfig {
  label: string;
  maxLongEdge: number;
  minSourceShortEdge: number;
  minSourceBitrate: number;
  crf: number;
}

const QUALITY_PRESETS: Record<string, TargetConfig> = {
  "720p": {
    label: "720p HD",
    maxLongEdge: 1280,
    minSourceShortEdge: 120,
    minSourceBitrate: 40,
    crf: 20,
  },
  "1080p": {
    label: "1080p Full HD",
    maxLongEdge: 1920,
    minSourceShortEdge: 160,
    minSourceBitrate: 65,
    crf: 19,
  },
  "2k": {
    label: "2K QHD (1440p)",
    maxLongEdge: 2560,
    minSourceShortEdge: 200,
    minSourceBitrate: 95,
    crf: 18,
  },
  "4k": {
    label: "4K Ultra HD (2160p)",
    maxLongEdge: 3840,
    minSourceShortEdge: 240,
    minSourceBitrate: 120,
    crf: 18,
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

async function downloadVideoBuffer(target: { node: any; type: "video" | "document" }): Promise<Buffer> {
  const bMod: any = await import("baileys");
  if (typeof bMod.downloadContentFromMessage !== "function") {
    throw new Error("Función downloadContentFromMessage no disponible en Baileys.");
  }

  const stream = await bMod.downloadContentFromMessage(target.node, target.type);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function probeVideoFile(filePath: string, fileSizeBytes: number): Promise<VideoProbeInfo> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-i", filePath]);
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`No se pudo ejecutar FFmpeg: ${err.message}`));
    });

    proc.on("close", () => {
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

  if (outW % 2 !== 0) outW += 1;
  if (outH % 2 !== 0) outH += 1;

  return { outW: Math.max(2, outW), outH: Math.max(2, outH) };
}

function upscaleAndEnhanceVideo(options: {
  inputPath: string;
  outputPath: string;
  outW: number;
  outH: number;
  targetFps: number;
  crf: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const vfChain = [
      `hqdn3d=1.8:1.8:5:5`,
      `scale=${options.outW}:${options.outH}:flags=lanczos+accurate_rnd+full_chroma_int`,
      `unsharp=5:5:1.15:3:3:0.35`,
      `eq=contrast=1.04:saturation=1.07`,
      `fps=${options.targetFps}`,
    ].join(",");

    const ffArgs = [
      "-y",
      "-hide_banner",
      "-i",
      options.inputPath,
      "-vf",
      vfChain,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      String(options.crf),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      options.outputPath,
    ];

    const proc = spawn("ffmpeg", ffArgs);
    let errLog = "";

    proc.stderr.on("data", (d) => {
      errLog += d.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`Fallo al iniciar FFmpeg: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(options.outputPath) && fs.statSync(options.outputPath).size > 1024) {
        resolve();
      } else {
        const tail = errLog.trim().split("\n").slice(-3).join(" ");
        reject(new Error(`Error en renderizado de video (Código ${code}): ${tail || "Proceso interrumpido"}`));
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
  description: "Restaura videos borrosos o de baja calidad y los reescala hasta 4K con los fotogramas especificados.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    const videoTarget = extractVideoNode(msg);
    const { qualityKey, targetFps, asDoc } = parseQualityAndFps(args);

    if (!videoTarget) {
      return reply(
        `╭〔 🎬 ${fytBold("LuferOS MP4-HD & 4K Upscaler")} 〕⬣\n` +
          `• Responde a un video o adjúntalo especificando *calidad* y *fotogramas*:\n\n` +
          `  \`${prefix}mp4hd 4k 60fps\`\n` +
          `  \`${prefix}mp4hd 2k 60fps\`\n` +
          `  \`${prefix}mp4hd 1080p 60fps\`\n` +
          `  \`${prefix}mp4hd 720p 30fps\`\n\n` +
          `• *Calidades soportadas:* \`720p\`, \`1080p\`, \`2k\`, \`4k\`\n` +
          `• *Fotogramas soportados:* \`24fps\` a \`120fps\`\n` +
          `• *Opcional:* Añade \`doc\` al final para recibirlo como documento sin compresión.\n` +
          `╰━━━━━━━━━━━━⬣`,
      );
    }

    if (!qualityKey || !targetFps) {
      return reply(
        `⚠️ Debes especificar tanto la *calidad* (\`720p\`, \`1080p\`, \`2k\`, \`4k\`) como los *fotogramas* (\`30fps\`, \`60fps\`, \`120fps\`).\n\n` +
          `• *Ejemplo:* \`${prefix}mp4hd 4k 60fps\``,
      );
    }

    const id = randomUUID().replace(/-/g, "").slice(0, 12);
    const inputPath = path.join(TEMP_DIR, `in_${id}.mp4`);
    const outputPath = path.join(TEMP_DIR, `out_${id}_${qualityKey}_${targetFps}fps.mp4`);

    await react("🔍").catch(() => undefined);

    try {
      const inputBuffer = await downloadVideoBuffer(videoTarget);
      if (inputBuffer.length < 4096) {
        throw new Error("El archivo de video está vacío o corrupto.");
      }

      fs.writeFileSync(inputPath, inputBuffer);
      const info = await probeVideoFile(inputPath, inputBuffer.length);
      const preset = QUALITY_PRESETS[qualityKey];

      const shortEdge = Math.min(info.width, info.height);
      const totalFrames = Math.round(info.durationSec * info.fps);

      if (info.width <= 0 || info.height <= 0 || info.durationSec < 0.4 || totalFrames < 8) {
        await react("❌").catch(() => undefined);
        return reply(
          `❌ *Información insuficiente en el video:*\n` +
            `• Dimensiones detectadas: \`${info.width}x${info.height}\`\n` +
            `• Fotogramas totales: \`${totalFrames}\`\n` +
            `• Duración: \`${info.durationSec.toFixed(1)}s\`\n\n` +
            `_El archivo no posee suficientes cuadros ni datos base para reconstruirse._`,
        );
      }

      if (info.durationSec > 95) {
        await react("⚠️").catch(() => undefined);
        return reply(
          `⚠️ El video dura \`${info.durationSec.toFixed(1)}s\`. Para evitar sobrecargar el procesador en reescalado *${preset.label}*, el límite máximo es de *95 segundos*.`,
        );
      }

      if (shortEdge < preset.minSourceShortEdge || info.bitrateKbps < preset.minSourceBitrate) {
        const suggestedQuality =
          shortEdge >= 200 ? "2k" : shortEdge >= 160 ? "1080p" : "720p";

        await react("⚠️").catch(() => undefined);
        return reply(
          `⚠️ *Densidad de información insuficiente para ${preset.label}:*\n` +
            `• Resolución de origen: \`${info.width}x${info.height}\` (Mínimo requerido en lado corto: \`${preset.minSourceShortEdge}px\`)\n` +
            `• Bitrate de origen: \`${info.bitrateKbps} kbps\` (Mínimo requerido: \`${preset.minSourceBitrate} kbps\`)\n` +
            `• FPS de origen: \`${info.fps} fps\`\n\n` +
            `💡 *Recomendación:* Este video tiene información suficiente para procesarse con \`${prefix}mp4hd ${suggestedQuality} ${Math.min(60, targetFps)}fps\`.`,
        );
      }

      if (targetFps > info.fps * 4) {
        const maxSafeFps = Math.min(120, Math.round(info.fps * 3));
        await react("⚠️").catch(() => undefined);
        return reply(
          `⚠️ *Información temporal insuficiente para ${targetFps} FPS:*\n` +
            `• El video original solo tiene \`${info.fps} FPS\`, por lo que estirar a \`${targetFps} FPS\` generaría cuadros duplicados artificiales.\n` +
            `• Usa un máximo de \`${prefix}mp4hd ${qualityKey} ${maxSafeFps}fps\`.`,
        );
      }

      const { outW, outH } = calculateTargetDimensions(info.width, info.height, preset.maxLongEdge);

      await react("⚙️").catch(() => undefined);
      await reply(
        `╭〔 ⚙️ ${fytBold("Procesando Video en " + preset.label)} 〕⬣\n` +
          `• *Origen:* \`${info.width}x${info.height}\` @ \`${info.fps}fps\` (\`${info.bitrateKbps} kbps\`)\n` +
          `• *Salida:* \`${outW}x${outH}\` @ \`${targetFps}fps\`\n` +
          `• *Filtros:* \`Lanczos + Unsharp Mask + Denoise HQDN3D\`\n` +
          `╰━━━━━━━━━━━━⬣`,
      ).catch(() => undefined);

      await upscaleAndEnhanceVideo({
        inputPath,
        outputPath,
        outW,
        outH,
        targetFps,
        crf: preset.crf,
      });

      const outBuffer = fs.readFileSync(outputPath);
      const outSizeMb = (outBuffer.length / (1024 * 1024)).toFixed(2);
      const caption =
        `✅ *${fytBold("LuferOS MP4-HD Completado")}*\n` +
        `• *Calidad:* \`${preset.label}\` (\`${outW}x${outH}\`)\n` +
        `• *Fluidez:* \`${targetFps} FPS\`\n` +
        `• *Peso final:* \`${outSizeMb} MB\``;

      if (asDoc || outBuffer.length > 60 * 1024 * 1024) {
        await sock.sendMessage(
          from,
          {
            document: outBuffer,
            mimetype: "video/mp4",
            fileName: `LuferOS_${qualityKey.toUpperCase()}_${targetFps}FPS.mp4`,
            caption,
          },
          { quoted: msg },
        );
      } else {
        await sock.sendMessage(
          from,
          {
            video: outBuffer,
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
      safeUnlink(inputPath);
      safeUnlink(outputPath);
    }
  },
};
