import { rm, mkdir, readdir } from "node:fs/promises";
import { createWriteStream, existsSync, statSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const execAsync = promisify(exec);
const tmpDir = process.env.AURA_DOWNLOAD_CACHE || join(process.cwd(), "cache");

const findAllMediaFiles = async (dir: string): Promise<string[]> => {
  let results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const subResults = await findAllMediaFiles(fullPath);
        results = results.concat(subResults);
      } else if (/\.(mp4|jpg|jpeg|png)$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    return results;
  }
  return results;
};

const createProgressBar = (percent: number): string => {
  const filled = Math.floor(percent / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "▒".repeat(empty);
};

export default {
  name: ["estadohd", "eshd", "hd"],
  category: "system",
  description: t("cmd_convierte_lote_de_documentos_z_4dbad9c2"),
  async run(ctx: CommandContext) {
    const { reply, react, msg, sock, from } = ctx;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.documentMessage) {
      return reply(t("cmd_value0_value1_responde_a_un_ar_c6cdb101", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_archivo_bb82df11")), value2: fytBold(t("cmd_system_29d43743")) }));
    }

    const docMsg = quoted.documentMessage;
    const mime = docMsg.mimetype || "";
    const fileName = docMsg.fileName?.toLowerCase() || "";
    
    const isVideo = mime.includes("video");
    const isImage = mime.includes("image");
    const isZip = mime.includes("zip") || fileName.endsWith(".zip");

    if (!isVideo && !isImage && !isZip) {
      return reply(t("cmd_value0_value1_el_documento_deb_b72e3462", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_formato_invalido_6deee6ba")), value2: fytBold(t("cmd_system_29d43743")) }));
    }

    await react("⏳").catch(() => undefined);

    const progressMsg = await sock.sendMessage(
      from,
      { text: t("cmd_value0_estado_preparando_entor_0c868d85", { value0: fytBold(t("cmd_estado_hd_fae48c7d")) }) },
      { quoted: msg as any }
    ).catch(() => null);

    const updateStatus = async (status: string) => {
      if (progressMsg?.key) {
        await sock.sendMessage(from, { 
          text: t("cmd_value0_value1_db810e84", { value0: fytBold(t("cmd_estado_hd_fae48c7d")), value1: status }),
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
    
    let mediaFiles: string[] = [];
    const processedFiles: { path: string, type: 'video' | 'image' }[] = [];

    try {
      const stream = await downloadContentFromMessage(docMsg, "document");
      const total = Number(docMsg.fileLength) || 0;
      let downloaded = 0;
      let lastUpdate = Date.now();
      const writer = createWriteStream(inputP);

      for await (const chunk of stream) {
        if (!writer.write(chunk)) {
          await new Promise<void>((resolve) => writer.once("drain", resolve));
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
      await new Promise<void>((resolve) => writer.once("close", resolve));

      if (isZip) {
        await react("📦").catch(() => undefined);
        await updateStatus(`┃ 📦 Estado: Descomprimiendo matriz\n┃ 📊 Progreso: [██████████] 100%`);
        await mkdir(extractDir, { recursive: true }).catch(() => undefined);
        
        try {
          await execAsync(`unzip -o "${inputP}" -d "${extractDir}"`, { timeout: 45000 });
        } catch {
          throw new Error("Fallo de integridad al descomprimir. El archivo podría estar corrupto o cifrado.");
        }
        
        mediaFiles = await findAllMediaFiles(extractDir);
        
        if (mediaFiles.length === 0) {
          throw new Error("El archivo ZIP no contiene formatos multimedia soportados (MP4, JPG, PNG).");
        }
      } else {
        mediaFiles = [inputP];
      }

      await react("🗜️").catch(() => undefined);
      
      const totalFiles = mediaFiles.length;
      let currentIndex = 1;

      for (const file of mediaFiles) {
        const currentExt = file.toLowerCase();
        const fileIsVid = currentExt.endsWith(".mp4");
        const fileIsImg = /\.(jpg|jpeg|png)$/.test(currentExt);
        
        const outFile = join(tmpDir, `hd_${id}_out_${currentIndex}${fileIsVid ? ".mp4" : ".jpg"}`);
        let finalPath = file;

        if (fileIsVid) {
          await updateStatus(`┃ 🗜️ Estado: Procesando video (${currentIndex}/${totalFiles})\n┃ 📊 Progreso: Leyendo códec base...`);
          const sizeMB = statSync(finalPath).size / (1024 * 1024);
          
          try {
            if (sizeMB > 60) {
              await updateStatus(`┃ ⚙️ Estado: Renderizando video (${currentIndex}/${totalFiles})\n┃ 📊 Progreso: Compresión Ultra-rápida...`);
              await execAsync(
                `ffmpeg -y -threads 0 -i "${finalPath}" -c:v libx264 -crf 18 -preset superfast -c:a aac -b:a 128k -movflags +faststart "${outFile}"`,
                { maxBuffer: 1024 * 1024 * 50 }
              );
              finalPath = outFile;
            } else {
              const { stdout: codecInfo } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`);
              const codec = codecInfo.trim().toLowerCase();

              if (codec === "h264") {
                await updateStatus(`┃ ⚙️ Estado: Clonando flujo (${currentIndex}/${totalFiles})\n┃ 📊 Progreso: Bypass directo (0% pérdida)...`);
                await execAsync(
                  `ffmpeg -y -threads 0 -i "${finalPath}" -c copy -movflags +faststart "${outFile}"`,
                  { maxBuffer: 1024 * 1024 * 50 }
                );
              } else {
                await updateStatus(`┃ ⚙️ Estado: Re-codificando formato (${currentIndex}/${totalFiles})\n┃ 📊 Progreso: Adaptando a WhatsApp...`);
                await execAsync(
                  `ffmpeg -y -threads 0 -i "${finalPath}" -c:v libx264 -crf 16 -preset superfast -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${outFile}"`,
                  { maxBuffer: 1024 * 1024 * 50 }
                );
              }
              finalPath = outFile;
            }
          } catch {
            finalPath = file;
          }
          processedFiles.push({ path: finalPath, type: 'video' });
          
        } else if (fileIsImg) {
          await updateStatus(`┃ 🗜️ Estado: Procesando imagen (${currentIndex}/${totalFiles})\n┃ 📊 Progreso: Optimizando...`);
          try {
            await execAsync(`ffmpeg -y -threads 0 -i "${finalPath}" -q:v 2 "${outFile}"`, { maxBuffer: 1024 * 1024 * 50 });
            finalPath = outFile;
          } catch {
            finalPath = file;
          }
          processedFiles.push({ path: finalPath, type: 'image' });
        }
        
        currentIndex++;
      }

      await updateStatus(`┃ 📤 Estado: Transmitiendo lote\n┃ 📦 Cantidad: ${processedFiles.length} archivo(s)`);

      for (let i = 0; i < processedFiles.length; i++) {
        const { path: pFile, type } = processedFiles[i];
        const currentCount = i + 1;
        const total = processedFiles.length;

        if (type === 'video') {
          await sock.sendMessage(from, {
            video: { url: pFile },
            caption: t("cmd_value0_video_optimizado_value1_2df0d884", { value0: fytBold(t("cmd_estado_hd_fae48c7d")), value1: total > 1 ? `(${currentCount}/${total})` : "", value2: fytBold(t("cmd_aura_reed_95dcfb15")) }),
            mimetype: "video/mp4"
          }, { quoted: msg as any });
        } else {
          await sock.sendMessage(from, {
            image: { url: pFile },
            caption: t("cmd_value0_imagen_optimizada_value_42902841", { value0: fytBold(t("cmd_estado_hd_fae48c7d")), value1: total > 1 ? `(${currentCount}/${total})` : "", value2: fytBold(t("cmd_aura_reed_95dcfb15")) }),
            mimetype: "image/jpeg"
          }, { quoted: msg as any });
        }
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
        await reply(t("cmd_value0_value1_value2_value3_569f9d3d", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_error_real_17ee0baf")), value2: errorMsg.slice(0, 500), value3: fytBold(t("cmd_system_29d43743")) })).catch(() => undefined);
      }
    } finally {
      await rm(inputP, { force: true }).catch(() => undefined);
      await rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
      
      for (let i = 1; i <= (mediaFiles.length || 10); i++) {
        await rm(join(tmpDir, `hd_${id}_out_${i}.mp4`), { force: true }).catch(() => undefined);
        await rm(join(tmpDir, `hd_${id}_out_${i}.jpg`), { force: true }).catch(() => undefined);
      }
    }
  }
};
