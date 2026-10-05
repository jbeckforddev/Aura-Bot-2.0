import crypto from "node:crypto";
import {
  generateWAMessage,
  generateWAMessageFromContent,
  jidNormalizedUser,
  type proto,
  type AnyMessageContent,
  type MiscMessageGenerationOptions,
  type WAMessage,
} from "@whiskeysockets/baileys";
import type {
  ExtendedWASocket,
  AlbumItem,
  SendMessageContent,
} from "../types/index.d.ts";

export type { AlbumItem, SendMessageContent };

const ALBUM_DELAY = Number(200);
const MAX_ITEMS = Number(10);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendWithRecordingPresence<T>(
  socket: ExtendedWASocket,
  jid: string,
  send: () => Promise<T>,
  onPresenceError?: (state: "recording" | "paused", error: unknown) => void,
): Promise<T> {
  const updatePresence = async (state: "recording" | "paused") => {
    try {
      await socket.sendPresenceUpdate(state, jid);
    } catch (error: unknown) {
      if (onPresenceError) onPresenceError(state, error);
      else console.warn(`[presence] ${state} falló en ${jid}:`, error);
    }
  };

  await updatePresence("recording");
  try {
    return await send();
  } finally {
    await updatePresence("paused");
  }
}

function isRateLimitError(error: unknown): boolean {
  const err = error as Record<string, unknown> | undefined;
  const status =
    err?.status ||
    err?.statusCode ||
    (err?.output as Record<string, unknown> | undefined)?.statusCode;
  if (status === 429) return true;

  const text = String(
    err?.message ||
      (err?.data as Record<string, unknown> | undefined)?.message ||
      "",
  ).toLowerCase();
  return (
    text.includes("429") ||
    text.includes("rate") ||
    text.includes("too many") ||
    text.includes("overlimit")
  );
}

export async function sendMessageWithRateLimit(
  socket: ExtendedWASocket,
  jid: string,
  content: SendMessageContent,
  options?: MiscMessageGenerationOptions,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await socket.sendMessage(
        jid,
        content as AnyMessageContent,
        options,
      );
    } catch (error: unknown) {
      if (attempt === 3 || !isRateLimitError(error)) throw error;

      const err = error as Record<string, unknown> | undefined;
      const resp = err?.response as Record<string, unknown> | undefined;
      const headers = (resp?.headers || err?.headers) as
        Record<string, unknown> | undefined;
      const retryAfter = Number(headers?.["retry-after"] || 0);
      await sleep(Math.max(retryAfter * 1000, 2000 * 2 ** (attempt - 1)));
    }
  }
}

async function relayWithRateLimit(
  socket: ExtendedWASocket,
  jid: string,
  message: proto.IMessage | null | undefined,
  messageId?: string,
) {
  if (!message) return;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await socket.relayMessage(jid, message, { messageId });
    } catch (error: unknown) {
      if (attempt === 3 || !isRateLimitError(error)) throw error;

      const err = error as Record<string, unknown> | undefined;
      const resp = err?.response as Record<string, unknown> | undefined;
      const headers = (resp?.headers || err?.headers) as
        Record<string, unknown> | undefined;
      const retryAfter = Number(headers?.["retry-after"] || 0);
      await sleep(Math.max(retryAfter * 1000, 1500 * 2 ** (attempt - 1)));
    }
  }
}

async function sendAlbumBatch(
  socket: ExtendedWASocket,
  jid: string,
  items: AlbumItem[],
  quoted?: proto.IWebMessageInfo | WAMessage,
) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const userJid = jidNormalizedUser(socket.user?.id || "");
  const expectedImageCount = items.filter((item) => item.image).length;
  const expectedVideoCount = items.filter((item) => item.video).length;

  if (expectedImageCount === 0 && expectedVideoCount === 0) return null;

  const album = await generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: { messageSecret: crypto.randomBytes(32) },
      albumMessage: { expectedImageCount, expectedVideoCount },
    },
    { quoted: quoted as WAMessage | undefined, userJid },
  );

  await relayWithRateLimit(socket, jid, album.message, album.key.id);

  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) await sleep(ALBUM_DELAY);

    try {
      const mediaMessage = await generateWAMessage(
        jid,
        items[index] as AnyMessageContent,
        {
          upload: socket.waUploadToServer,
          userJid,
        },
      );
      mediaMessage.message!.messageContextInfo = {
        messageSecret: crypto.randomBytes(32),
        messageAssociation: {
          associationType: 1,
          parentMessageKey: album.key,
        },
      };
      await relayWithRateLimit(
        socket,
        jid,
        mediaMessage.message,
        mediaMessage.key.id,
      );
    } catch (error: unknown) {
      console.error("[album] No se pudo enviar un elemento:", error);
    }
  }

  return album;
}

export async function sendAlbumMessage(
  socket: ExtendedWASocket,
  jid: string,
  items: AlbumItem[],
  quoted?: proto.IWebMessageInfo | WAMessage,
) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const batches: AlbumItem[][] = [];
  for (let index = 0; index < items.length; index += MAX_ITEMS) {
    batches.push(items.slice(index, index + MAX_ITEMS));
  }

  let lastAlbum: Awaited<ReturnType<typeof sendAlbumBatch>> = null;
  for (const batch of batches) {
    lastAlbum = await sendAlbumBatch(socket, jid, batch, quoted);
    if (batch.length > 0 && batch !== batches[batches.length - 1]) {
      await sleep(ALBUM_DELAY);
    }
  }

  return lastAlbum;
}
