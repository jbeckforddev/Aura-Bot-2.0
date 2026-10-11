import { rm, mkdir, readdir } from "node:fs/promises";
import { createWriteStream, existsSync, statSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const execAsync = promisify(exec);
const tmpDir = process.env.AURA_DOWNLOAD_CACHE || join(process.cwd(), "cache");

const findMediaFile = async (dir: string): Promise<string | null> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await findMediaFile(fullPath);
        if (found) return found;
      } else if (/\.(mp4|jpg|jpeg|png)$/i.test(entry.name)) {
        return fullPath;
      }
    }
  } catch {
    return null;
  }
  return null;
};

const createProgressBar = (percent: number): string => {
  const filled = Math.floor(percent / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "▒".repeat(empty);
};

export default {
  name: ["estadohd", "eshd", "hd"],
  category: "system",
  description: "Convierte un documento a video HD garantizando calidad original.",
  async run(ctx: CommandContext) {
    const { reply, react, msg, sock, from } = ctx;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.documentMessage) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA ARCHIVO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Responde a un archivo en modo\n┃ > documento (Video, Imagen o ZIP).\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    const docMsg = quoted.documentMessage;
    const mime = docMsg.mimetype || "";
    const fileName = docMsg.fileName?.toLowerCase() || "";
    
    let isVideo = mime.includes("video");
    let isImage = mime.includes("image");
    const isZip = mime.includes("zip") || fileName.endsWith(".zip");

    if (!isVideo && !isImage && !isZip) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FORMATO INVÁLIDO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > El documento debe ser un video,\n┃ > imagen o archivo .zip\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    await react("⏳").catch(() => undefined);

    const progressMsg = await sock.sendMessage(
      from,
      { text: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ⏳ Estado: Analizando heurística...\n╰━━━━━━━━━━━━⬣` },
      { quoted: msg as any }
    ).catch(() => null);

    const updateStatus = async (status: string) => {
      if (progressMsg?.key) {
        await sock.sendMessage(from, { 
          text: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n${status}\n╰━━━━━━━━━━━━⬣`, 
          edit: progressMsg.key 
        }).catch(() => undefined);
      }
    };

    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true }).catch(() => undefined);
    }

    const id = randomBytes(8).toString("hex");
    const ext = isZip ? ".zip" : (isVideo ? ".mp4" : ".jpg");
    const inputP = join(tmpDir, `hd_${id}_in${ext}`);
    const extractDir = join(tmpDir, `hd_${id}_unzip`);
    const outputP = join(tmpDir, `hd_${id}_out${isVideo || isZip ? ".mp4" : ".jpg"}`);
    let finalPath = inputP;

    try {
      const stream = await downloadContentFromMessage(docMsg, "document");
      const total = Number(docMsg.fileLength) || 0;
      let downloaded = 0;
      let lastUpdate = Date.now();
      const writer = createWriteStream(inputP);

      for await (const chunk of stream) {
        if (!writer.write(chunk)) {
          await new Promise((resolve) => writer.once("drain", resolve));
        }
        downloaded += chunk.length;
        const now = Date.now();
        if (total > 0 && now - lastUpdate > 1500) {
          const percent = Math.round((downloaded / total) * 100);
          updateStatus(`┃ 📥 Estado: Descargando origen\n┃ 📊 Progreso: [${createProgressBar(percent)}] ${percent}%`).catch(() => undefined);
          lastUpdate = now;
        }
      }
      
      writer.end();
      await new Promise((resolve) => writer.once("close", resolve));

      if (isZip) {
        await react("📦").catch(() => undefined);
        await updateStatus(`┃ 📦 Estado: Descomprimiendo matriz\n┃ 📊 Progreso: [██████████] 100%`);
        await mkdir(extractDir, { recursive: true }).catch(() => undefined);
        
        try {
          await execAsync(`unzip -o "${inputP}" -d "${extractDir}"`, { timeout: 30000 });
        } catch {
          throw new Error("Fallo de integridad al descomprimir. El archivo podría estar corrupto o cifrado.");
        }
        
        const extractedFile = await findMediaFile(extractDir);
        
        if (!extractedFile) {
          throw new Error("El archivo ZIP no contiene formatos multimedia soportados (MP4, JPG, PNG).");
        }
        
        finalPath = extractedFile;
        const extractedExt = finalPath.toLowerCase();
        
        if (extractedExt.endsWith(".mp4")) {
          isVideo = true;
          isImage = false;
        } else {
          isImage = true;
          isVideo = false;
        }
      }

      await react("🗜️").catch(() => undefined);
      await updateStatus(`┃ 🗜️ Estado: Parcheando metadatos\n┃ 📊 Progreso: Evaluando bitrate...`);

      if (isVideo) {
        const sizeMB = statSync(finalPath).size / (1024 * 1024);
        try {
          if (sizeMB > 60) {
            await execAsync(
              `ffmpeg -y -threads 0 -i "${finalPath}" -c:v libx264 -crf 20 -preset slow -c:a aac -b:a 128k -movflags +faststart "${outputP}"`,
              { maxBuffer: 1024 * 1024 * 50 }
            );
            finalPath = outputP;
          } else {
            const { stdout: codecInfo } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`);
            const codec = codecInfo.trim().toLowerCase();

            if (codec === "h264") {
              await execAsync(
                `ffmpeg -y -threads 0 -i "${finalPath}" -c copy -movflags +faststart "${outputP}"`,
                { maxBuffer: 1024 * 1024 * 50 }
              );
            } else {
              await execAsync(
                `ffmpeg -y -threads 0 -i "${finalPath}" -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${outputP}"`,
                { maxBuffer: 1024 * 1024 * 50 }
              );
            }
            finalPath = outputP;
          }
        } catch {
          finalPath = isZip ? finalPath : inputP;
        }
      } else if (isImage) {
        try {
          await execAsync(`ffmpeg -y -threads 0 -i "${finalPath}" -q:v 2 "${outputP}"`, { maxBuffer: 1024 * 1024 * 50 });
          finalPath = outputP;
        } catch {
          finalPath = isZip ? finalPath : inputP;
        }
      }

      const outSize = statSync(finalPath).size;
      await updateStatus(`┃ 📤 Estado: Transmitiendo datos\n┃ 📦 Tamaño: ${(outSize / (1024 * 1024)).toFixed(2)} MB`);

      if (isVideo) {
        await reply({
          video: { url: finalPath },
          caption: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ➥ Video optimizado (Original)\n╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`,
          mimetype: "video/mp4"
        });
      } else {
        await reply({
          image: { url: finalPath },
          caption: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ➥ Imagen optimizada\n╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`,
          mimetype: "image/jpeg"
        });
      }

      await react("✅").catch(() => undefined);
      
      if (progressMsg?.key) {
        await sock.sendMessage(from, { delete: progressMsg.key }).catch(() => undefined);
      }

    } catch (error: any) {
      await react("❌").catch(() => undefined);
      const errorMsg = error?.message || "Ocurrió un error inesperado de segmentación.";
      
      if (progressMsg?.key) {
        await updateStatus(`┃ ⚠️ Estado: Error de procesamiento\n┃ ❌ Fallo: ${errorMsg.slice(0, 80)}...`);
      } else {
        await reply(`╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("ERROR REAL")}\n╰━━━━━━━━━━━━⬣\n\n┃ > ${errorMsg.slice(0, 500)}\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`).catch(() => undefined);
      }
    } finally {
      await Promise.allSettled([
        rm(inputP, { force: true }),
        rm(outputP, { force: true }),
        rm(extractDir, { recursive: true, force: true })
      ]);
    }
  }
};
