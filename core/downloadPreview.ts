import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { createLinkPreviewWithoutChannel } from "./LinkPreview.ts";
import type { DownloadPreviewOptions } from "../types/index.d.ts";

export type { DownloadPreviewOptions };

export async function sendDownloadPreview({
  sock,
  from,
  msg,
  thumbnail,
  caption,
  link,
  title,
  author = "",
  sender,
  mentions = [],
}: DownloadPreviewOptions): Promise<boolean> {
  try {
    const prepared = await prepareWAMessageMedia(
      { image: { url: thumbnail } },
      {
        upload: sock.waUploadToServer,
        mediaTypeOverride: "thumbnail-link",
      },
    );

    const allMentions = Array.from(
      new Set([...(sender ? [sender] : []), ...mentions]),
    );

    const preview = createLinkPreviewWithoutChannel({
      textOriginal: caption,
      link,
      author,
      title,
      banner: prepared.imageMessage,
      mentionedJid: allMentions,
      isForwarded: false,
      forwardingScore: 0,
    });
    const previewMessage = generateWAMessageFromContent(from, preview, {
      quoted: msg as unknown as WAMessage,
      userJid: sock.user?.id,
    });
    await sock.relayMessage(from, previewMessage.message, {
      messageId: previewMessage.key.id,
    });
    return true;
  } catch (error) {
    console.error("[download-preview] No se pudo preparar el preview:", error);
    return false;
  }
}
