import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { downloadContentFromMessage } from "baileys";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function unwrapMessage(msgObj: any): any {
  if (!msgObj) return null;
  return (
    msgObj.ephemeralMessage?.message ||
    msgObj.viewOnceMessage?.message ||
    msgObj.viewOnceMessageV2?.message ||
    msgObj.viewOnceMessageV2Extension?.message ||
    msgObj.documentWithCaptionMessage?.message ||
    msgObj
  );
}

function extractTargetMedia(msg: any): { node: any; type: "document" | "video"; fileName: string } | null {
  const root = unwrapMessage(msg?.message);
  if (!root) return null;

  const checkObj = (target: any): { node: any; type: "document" | "video"; fileName: string } | null => {
    const unwrapped = unwrapMessage(target);
    if (!unwrapped) return null;

    if (unwrapped.documentMessage) {
      const doc = unwrapped.documentMessage;
      const mime = String(doc.mimetype || "").toLowerCase();
      const name = String(doc.fileName || "video.mp4").toLowerCase();
      if (
        mime.startsWith("video/") ||
        name.endsWith(".mp4") ||
        name.endsWith(".mkv") ||
        name.endsWith(".mov") ||
        name.endsWith(".avi") ||
        name.endsWith(".webm")
      ) {
        return { node: doc, type: "document", fileName: doc.fileName || "video.mp4" };
      }
    }

    if (unwrapped.videoMessage) {
      return { node: unwrapped.videoMessage, type: "video", fileName: "video.mp4" };
    }

    return null;
  };

  const direct = checkObj(root);
  if (direct) return direct;

  const ctxInfo =
    root.extendedTextMessage?.contextInfo ||
    root.imageMessage?.contextInfo ||
    root.videoMessage?.contextInfo ||
    root.documentMessage?.contextInfo ||
    null;

  if (ctxInfo?.quotedMessage) {
    return checkObj(ctxInfo.quotedMessage);
  }

  return null;
}

export default {
  name: ["compress", "comprimir", "optvideo", "doc2vid"],
  category: "group",
  description: "Comprime archivos .mp4 enviados como documento sin perder calidad visual y los envía como video nativo.",
  groupOnly: false,
  ownerOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, sock, msg, from, args } = ctx;

    const target = extractTargetMedia(msg);
    if (!target) {
      return reply(
        `⚠️ *${fytBold("ARCHIVO NO DETECTADO")}*\n\nResponde a un archivo *.mp4* enviado como documento (o a un video) con el comando *.compress* para limpiarlo, comprimirlo y convertirlo a formato nativo de WhatsApp.`
      );
    }

    await react("🗜️").catch(() => undefined);

    const id = randomBytes(6).toString("hex");
    const tmpIn = path.join(os.tmpdir(), `aura_in_${id}.mp4`);
    const tmpOut = path.join(os.tmpdir(), `aura_out_${id}.mp4`);

    try {
      const stream = await downloadContentFromMessage(target.node, target.type);
      const writeStream = fs.createWriteStream(tmpIn);

      for await (const chunk of stream) {
        writeStream.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end();
        writeStream.on("finish", () => resolve());
        writeStream.on("error", (err) => reject(err));
      });

      const originalStats = fs.statSync(tmpIn);
      const originalBytes = originalStats.size;

      if (originalBytes === 0) {
        await react("❌").catch(() => undefined);
        return reply("❌ El archivo descargado está vacío o corrupto.");
      }

      const modeArg = String(args[0] || "").toLowerCase();
      const crfValue = modeArg === "max" || modeArg === "extremo" ? "27" : "23";

      const ffmpegArgs = [
        "-y",
        "-i",
        tmpIn,
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-vf",
        "scale='min(1280,iw)':-2:flags=lanczos",
        "-c:v",
        "libx264",
        "-preset",
        "faster",
        "-crf",
        crfValue,
        "-profile:v",
        "high",
        "-level",
        "4.1",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        tmpOut,
      ];

      await execFileAsync("ffmpeg", ffmpegArgs, {
        timeout: 180000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (!fs.existsSync(tmpOut)) {
        throw new Error("No se generó el archivo de salida.");
      }

      const compressedStats = fs.statSync(tmpOut);
      const compressedBytes = compressedStats.size;

      const finalPath = compressedBytes < originalBytes ? tmpOut : tmpIn;
      const finalBytes = compressedBytes < originalBytes ? compressedBytes : originalBytes;
      const savedBytes = Math.max(0, originalBytes - finalBytes);
      const savedPercent = originalBytes > 0 ? ((savedBytes / originalBytes) * 100).toFixed(1) : "0.0";

      const videoBuffer = fs.readFileSync(finalPath);

      const caption = [
        `🗜️ *${fytBold("COMPRESIÓN & LIMPIEZA MP4")}*`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `📄 *Origen:* \`${target.fileName}\``,
        `📦 *Peso inicial:* \`${formatBytes(originalBytes)}\``,
        `✨ *Peso final:* \`${formatBytes(finalBytes)}\``,
        `📉 *Espacio ahorrado:* \`${formatBytes(savedBytes)} (${savedPercent}%)\``,
        `🧹 *Metadatos basura:* \`Eliminados\``,
      ].join("\n");

      await sock.sendMessage(
        from,
        {
          video: videoBuffer,
          mimetype: "video/mp4",
          caption,
        },
        { quoted: msg as any }
      );

      await react("✅").catch(() => undefined);
    } catch (err: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ *Error al procesar el video:* ${String(err?.message || err).slice(0, 200)}`);
    } finally {
      try {
        if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
      } catch {}
      try {
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      } catch {}
    }
  },
};
