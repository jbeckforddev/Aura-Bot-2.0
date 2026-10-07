import { rm, mkdir } from "node:fs/promises";
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

export default {
  name: ["estadohd", "eshd", "hd"],
  category: "system",
  description: "Convierte un documento (o zip) a video/imagen HD para estados con progreso.",
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

    await react("⏳");

    const progressMsg = await sock.sendMessage(from, { 
      text: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ⏳ Estado: Iniciando proceso...\n╰━━━━━━━━━━━━⬣` 
    }, { quoted: msg }).catch(() => null);

    const updateStatus = async (status: string) => {
      if (progressMsg?.key) {
        await sock.sendMessage(from, { 
          text: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n${status}\n╰━━━━━━━━━━━━⬣`, 
          edit: progressMsg.key 
        }).catch(() => {});
      }
    };

    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true }).catch(() => undefined);
    }

    const id = randomBytes(8).toString("hex");
    const ext = isZip ? ".zip" : (isVideo ? ".mp4" : ".jpg");
    const inputP = join(tmpDir, `hd_${id}_in${ext}`);
    let outputP = join(tmpDir, `hd_${id}_out${isVideo || isZip ? ".mp4" : ".jpg"}`);
    const extractDir = join(tmpDir, `hd_${id}_unzip`);

    try {
      const stream = await downloadContentFromMessage(docMsg, "document");
      const total = Number(docMsg.fileLength) || 0;
      let downloaded = 0;
      let lastUpdate = Date.now();

      const writer = createWriteStream(inputP);
      for await (const chunk of stream) {
        writer.write(chunk);
        downloaded += chunk.length;
        const now = Date.now();
        if (total > 0 && now - lastUpdate > 1500) {
          const percent = Math.round((downloaded / total) * 100);
          await updateStatus(`┃ 📥 Estado: Descargando archivo...\n┃ 📊 Progreso: ${percent}%`);
          lastUpdate = now;
        }
      }
      writer.end();

      let finalPath = inputP;

      if (isZip) {
        await react("📦");
        await updateStatus(`┃ 📦 Estado: Descomprimiendo ZIP...\n┃ 📊 Progreso: Extrayendo archivos...`);
        await mkdir(extractDir, { recursive: true }).catch(() => undefined);
        
        try {
          await execAsync(`unzip -o "${inputP}" -d "${extractDir}"`, { timeout: 20000 });
        } catch (e: any) {
          throw new Error("Fallo al descomprimir. Asegúrate de que no tenga contraseña o que 'unzip' esté instalado en tu host.");
        }
        
        const { stdout } = await execAsync(`find "${extractDir}" -type f \\( -iname "*.mp4" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \\) | head -n 1`);
        const extractedFile = stdout.trim();
        
        if (!extractedFile) {
          throw new Error("No se encontró ningún archivo de video o imagen dentro del ZIP.");
        }
        
        finalPath = extractedFile;
        const extractedExt = finalPath.toLowerCase();
        
        if (extractedExt.endsWith(".mp4")) {
          isVideo = true;
          isImage = false;
          outputP = join(tmpDir, `hd_${id}_out.mp4`);
        } else {
          isImage = true;
          isVideo = false;
          outputP = join(tmpDir, `hd_${id}_out.jpg`);
        }
      }

      await react("🗜️");
      await updateStatus(`┃ 🗜️ Estado: Optimizando calidad...\n┃ 📊 Progreso: Procesando (FFmpeg)...`);

      if (isVideo) {
        const sizeMB = statSync(finalPath).size / (1024 * 1024);
        try {
          if (sizeMB > 60) {
            await execAsync(`ffmpeg -y -i "${finalPath}" -c:v libx264 -crf 26 -preset fast -c:a aac -b:a 128k -movflags +faststart -threads 0 "${outputP}"`, { maxBuffer: 1024 * 1024 * 50 });
            finalPath = outputP;
          } else {
            const { stdout: codecInfo } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`);
            const codec = codecInfo.trim().toLowerCase();

            if (codec === "h264") {
              await execAsync(`ffmpeg -y -i "${finalPath}" -c copy -movflags +faststart -threads 0 "${outputP}"`, { maxBuffer: 1024 * 1024 * 50 });
            } else {
              await execAsync(`ffmpeg -y -i "${finalPath}" -c:v libx264 -preset fast -c:a aac -b:a 128k -movflags +faststart -threads 0 "${outputP}"`, { maxBuffer: 1024 * 1024 * 50 });
            }
            finalPath = outputP;
          }
        } catch (e) {
          finalPath = isZip ? finalPath : inputP;
        }
      } else if (isImage) {
        try {
          await execAsync(`ffmpeg -y -i "${finalPath}" -q:v 2 "${outputP}"`);
          finalPath = outputP;
        } catch (e) {
          finalPath = isZip ? finalPath : inputP;
        }
      }

      await updateStatus(`┃ 📤 Estado: Enviando archivo...\n┃ 📊 Progreso: Subiendo a WhatsApp...`);

      if (isVideo) {
        await sock.sendMessage(from, {
          video: { url: finalPath },
          caption: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ➥ Video optimizado\n╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`,
          mimetype: "video/mp4"
        }, { quoted: msg });
      } else {
        await sock.sendMessage(from, {
          image: { url: finalPath },
          caption: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ➥ Imagen optimizada\n╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`,
          mimetype: "image/jpeg"
        }, { quoted: msg });
      }

      await react("✅");
      
      if (progressMsg?.key) {
        await sock.sendMessage(from, { delete: progressMsg.key }).catch(() => {});
      }

    } catch (error: any) {
      await react("❌").catch(() => undefined);
      const errorMsg = error?.message || "Ocurrió un error inesperado.";
      
      if (progressMsg?.key) {
        await updateStatus(`┃ ⚠️ Estado: Error crítico\n┃ ❌ Fallo: ${errorMsg.slice(0, 80)}...`);
      } else {
        await reply(`╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("ERROR REAL")}\n╰━━━━━━━━━━━━⬣\n\n┃ > ${errorMsg.slice(0, 500)}\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`).catch(() => undefined);
      }
    } finally {
      await rm(inputP, { force: true }).catch(() => undefined);
      await rm(outputP, { force: true }).catch(() => undefined);
      await rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
};
