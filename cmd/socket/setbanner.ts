import type { CommandContext } from "../../types/index.d.ts";
import type { proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { clearMenuMediaCache } from "./menu.ts";

function unwrapMedia(
  message: proto.IMessage | null | undefined,
): proto.IMessage | null {
  if (!message) return null;
  if (message.imageMessage || message.videoMessage || message.documentMessage)
    return message;
  if (message.viewOnceMessageV2?.message)
    return unwrapMedia(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage?.message)
    return unwrapMedia(message.viewOnceMessage.message);
  if (message.documentWithCaptionMessage?.message)
    return unwrapMedia(message.documentWithCaptionMessage.message);
  return null;
}

export default {
  name: ["setbanner", "setmenuimage", "setmenubanner"],
  category: "socket",
  description: "Cambia el banner que usa el menú.",
  botUserOnly: true,
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = context?.quotedMessage;
    const target = unwrapMedia(quotedMessage) || unwrapMedia(ctx.msg?.message);
    if (!target) {
      return ctx.reply(
        "⚠️ Responde a una imagen o video para establecerlo como banner.",
      );
    }

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
        : {
            key: ctx.msg.key,
            message: target,
          };

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
      if (!buffer?.length) throw new Error("No se pudo descargar el banner.");

      const mimetype =
        target.imageMessage?.mimetype ||
        target.videoMessage?.mimetype ||
        target.documentMessage?.mimetype ||
        "image/jpeg";
      const databaseDir = path.resolve(globalThis.DATA_BASE_DIR || "./data");
      await mkdir(databaseDir, { recursive: true });
      const extension = mimetype.includes("gif")
        ? "gif"
        : mimetype.includes("video")
          ? "mp4"
          : mimetype.includes("png")
            ? "png"
            : "jpg";
      const botKey = String(ctx.botJid || "main").replace(/[^a-zA-Z0-9]/g, "_");
      const fileName = `menu-banner-${botKey}.${extension}`;
      const filePath = path.join(databaseDir, fileName);
      await writeFile(filePath, buffer);

      const bot = ctx.db.getBot(ctx.botJid);
      const previousPath = (
        (bot?.data?.customBanner as { path?: string } | undefined)?.path ||
        (bot?.customBanner as { path?: string } | undefined)?.path ||
        (bot?.currentBanner
          ? path.join(databaseDir, path.basename(bot.currentBanner))
          : undefined)
      );
      if (previousPath && previousPath !== filePath) {
        await unlink(previousPath).catch(() => undefined);
      }
      const customBanner = { path: filePath, mimetype };
      ctx.db.setBot(ctx.botJid, {
        currentBanner: fileName,
        customBanner,
        data: {
          ...(bot?.data || {}),
          currentBanner: fileName,
          customBanner,
        },
      });
      clearMenuMediaCache();
      return ctx.reply("✅ Banner del menú actualizado.");
    } catch (error: unknown) {
      return ctx.reply({
        text: `❌ No se pudo guardar el banner: ${error instanceof Error ? error.message : String(error) || "error desconocido"}`,
      });
    }
  },
};
