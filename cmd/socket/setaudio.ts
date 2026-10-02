import type { CommandContext } from "../../types/index.d.ts";
import type { proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

function unwrapAudio(
  message: proto.IMessage | null | undefined,
): proto.IMessage | null {
  if (!message) return null;
  if (message.audioMessage || message.documentMessage) return message;
  if (message.viewOnceMessageV2?.message)
    return unwrapAudio(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage?.message)
    return unwrapAudio(message.viewOnceMessage.message);
  if (message.documentWithCaptionMessage?.message)
    return unwrapAudio(message.documentWithCaptionMessage.message);
  return null;
}

export default {
  name: ["setaudio", "setmenuaudio", "menuaudio"],
  category: "socket",
  description: "Cambia el audio que se envía al abrir el menú.",
  botUserOnly: true,
  async run(ctx: CommandContext) {
    if (!ffmpegPath) return ctx.reply("❌ FFmpeg no está disponible.");

    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = context?.quotedMessage;
    const target = unwrapAudio(quotedMessage) || unwrapAudio(ctx.msg?.message);
    if (!target)
      return ctx.reply("⚠️ Responde a un audio para establecerlo en el menú.");
    let input = "";
    let output = "";
    let outputStored = false;
    try {
      const downloadTarget = quotedMessage
        ? {
            key: {
              remoteJid: context?.remoteJid || ctx.from,
              id: context?.stanzaId,
              participant: context?.participant,
            },
            message: target,
          }
        : { key: ctx.msg.key, message: target };
      const buffer = await downloadMediaMessage(
        downloadTarget as import("@whiskeysockets/baileys").WAMessage,
        "buffer",
        {},
        {
          logger: console as unknown as Parameters<
            typeof downloadMediaMessage
          >[3]["logger"],
          reuploadRequest: ctx.sock.updateMediaMessage as (
            msg: Parameters<typeof downloadMediaMessage>[0],
          ) => Promise<Parameters<typeof downloadMediaMessage>[0]>,
        },
      );
      if (!buffer?.length) throw new Error("No se pudo descargar el audio.");

      await ctx.react("⏳");
      const dir = path.resolve(globalThis.DATA_BASE_DIR || "./data");
      await mkdir(dir, { recursive: true });
      const id = randomUUID();
      const botKey = String(ctx.botJid || "main").replace(/[^a-zA-Z0-9]/g, "_");
      input = path.join(dir, `menu-audio-${botKey}-${id}.input`);
      output = path.join(dir, `menu-audio-${botKey}-${id}.ogg`);
      await writeFile(input, buffer);
      await execFileAsync(
        ffmpegPath,
        [
          "-y",
          "-i",
          input,
          "-vn",
          "-c:a",
          "libopus",
          "-b:a",
          "96k",
          "-ar",
          "48000",
          output,
        ],
        { timeout: 120000 },
      );

      const bot = ctx.db.getBot(ctx.botJid);
      const previousPath = (
        bot?.data?.customAudio as { path?: string } | undefined
      )?.path || (bot?.currentAudio
        ? path.join(dir, path.basename(bot.currentAudio))
        : undefined);
      if (previousPath && previousPath !== output)
        await unlink(previousPath).catch(() => undefined);
      const fileName = path.basename(output);
      const customAudio = {
        path: output,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        seconds: 99999,
      };
      ctx.db.setBot(ctx.botJid, {
        currentAudio: fileName,
        customAudio,
        data: {
          ...(bot?.data || {}),
          currentAudio: fileName,
          customAudio,
        },
      });
      outputStored = true;
      await ctx.react("✅");
      return ctx.reply(
        "✅ Audio del menú actualizado como nota de voz OGG/Opus.",
      );
    } catch (error: unknown) {
      return ctx.reply({
        text: `❌ No se pudo guardar el audio: ${error instanceof Error ? error.message : String(error) || "error desconocido"}`,
      });
    } finally {
      if (input) await unlink(input).catch(() => undefined);
      if (output && !outputStored) await unlink(output).catch(() => undefined);
    }
  },
};
