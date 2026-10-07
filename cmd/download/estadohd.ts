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
  description: "Convierte un documento a video/imagen HD para estados.",
  async run(ctx: CommandContext) {
    const { reply, react, msg } = ctx;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.documentMessage) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA ARCHIVO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Responde a un archivo en modo\n┃ > documento (Video o Imagen).\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    const docMsg = quoted.documentMessage;
    const mime = docMsg.mimetype || "";
    const isVideo = mime.includes("video");
    const isImage = mime.includes("image");

    if (!isVideo && !isImage) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FORMATO INVÁLIDO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > El documento debe ser un video\n┃ > o una imagen.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    await react("⏳");

    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true }).catch(() => undefined);
    }

    const id = randomBytes(8).toString("hex");
    const ext = isVideo ? ".mp4" : ".jpg";
    const inputP = join(tmpDir, `hd_${id}_in${ext}`);
    const outputP = join(tmpDir, `hd_${id}_out${ext}`);

    try {
      const stream = await downloadContentFromMessage(docMsg, "document");
      const writer = createWriteStream(inputP);
      for await (const chunk of stream) {
        writer.write(chunk);
      }
      writer.end();

      let finalPath = inputP;

      if (isVideo) {
        const sizeMB = statSync(inputP).size / (1024 * 1024);
        try {
          if (sizeMB > 60) {
            await react("🗜️");
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
          finalPath = inputP;
        }
      } else if (isImage) {
        try {
          await execAsync(`ffmpeg -y -i "${finalPath}" -q:v 2 "${outputP}"`);
          finalPath = outputP;
        } catch (e) {
          finalPath = inputP;
        }
      }

      if (isVideo) {
        await reply({
          video: { url: finalPath },
          caption: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ➥ Video optimizado\n╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`,
          mimetype: "video/mp4"
        });
      } else {
        await reply({
          image: { url: finalPath },
          caption: `╭〔 📱 ${fytBold("ESTADO HD")} 〕━⬣\n┃ ➥ Imagen optimizada\n╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`,
          mimetype: "image/jpeg"
        });
      }

      await react("✅");

    } catch (error: unknown) {
      await react("❌");
      const errorMsg = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
      await reply(`╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("ERROR REAL")}\n╰━━━━━━━━━━━━⬣\n\n┃ > ${errorMsg}\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    } finally {
      await rm(inputP, { force: true }).catch(() => undefined);
      await rm(outputP, { force: true }).catch(() => undefined);
    }
  }
};
