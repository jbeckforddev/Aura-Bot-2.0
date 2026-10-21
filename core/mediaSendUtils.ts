import crypto from "node:crypto";
import {
  generateWAMessage,
  generateWAMessageFromContent,
  jidNormalizedUser,
  type proto,
  type AnyMessageContent,
  type MiscMessageGenerationOptions,
  type WAMessage,
} from "baileys";
import type {
  ExtendedWASocket,
  AlbumItem,
  SendMessageContent,
} from "../types/index.d.ts";

export type { AlbumItem, SendMessageContent };

const ALBUM_RELAY_DELAY = 60;
const ALBUM_BATCH_DELAY = 150;
const MAX_ITEMS = 10;
const UPLOAD_CONCURRENCY = 4;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

export async function sendWithRecordingPresence<T>(
  socket: ExtendedWASocket,
  jid: string,
  send: () => Promise<T>,
  onPresenceError?: (state: "recording" | "paused", error: unknown) => void,
): Promise<T> {
  const updatePresence = (state: "recording" | "paused") => {
    socket.sendPresenceUpdate(state, jid).catch((error: unknown) => {
      if (onPresenceError) onPresenceError(state, error);
    });
  };

  updatePresence("recording");
  try {
    return await send();
  } finally {
    updatePresence("paused");
  }
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  const status =
    err.status ||
    err.statusCode ||
    (err.output as Record<string, unknown> | undefined)?.statusCode;
  if (status === 429) return true;

  const text = String(
    err.message ||
      (err.data as Record<string, unknown> | undefined)?.message ||
      "",
  ).toLowerCase();

  return (
    text.includes("429") ||
    text.includes("rate") ||
    text.includes("too many") ||
    text.includes("overlimit")
  );
}

function getRetryDelayMs(error: unknown, attempt: number, baseMs: number): number {
  const err = error as Record<string, unknown> | undefined;
  const resp = err?.response as Record<string, unknown> | undefined;
  const headers = (resp?.headers || err?.headers) as
    | Record<string, unknown>
    | undefined;
  const rawRetry = Number(headers?.["retry-after"]);
  const retryAfterMs =
    Number.isFinite(rawRetry) && rawRetry > 0 ? rawRetry * 1000 : 0;
  const jitter = Math.floor(Math.random() * 250);
  return Math.max(retryAfterMs, baseMs * 2 ** (attempt - 1)) + jitter;
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
      await sleep(getRetryDelayMs(error, attempt, 1800));
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
      await sleep(getRetryDelayMs(error, attempt, 1200));
    }
  }
}

async function prepareAlbumMediaConcurrently(
  socket: ExtendedWASocket,
  jid: string,
  items: AlbumItem[],
  userJid: string,
): Promise<Array<{ item: AlbumItem; mediaMessage: WAMessage }>> {
  const results = new Array<{ item: AlbumItem; mediaMessage: WAMessage } | null>(
    items.length,
  ).fill(null);

  let currentIndex = 0;

  const worker = async () => {
    while (true) {
      const idx = currentIndex++;
      if (idx >= items.length) break;
      const item = items[idx];
      if (!item || (!item.image && !item.video)) continue;

      try {
        const mediaMessage = await generateWAMessage(
          jid,
          item as AnyMessageContent,
          {
            upload: socket.waUploadToServer,
            userJid,
          },
        );
        if (mediaMessage?.message) {
          results[idx] = { item, mediaMessage };
        }
      } catch (error: unknown) {
        console.error("[album] No se pudo preparar un elemento:", error);
      }
    }
  };

  const workerCount = Math.min(UPLOAD_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results.filter(
    (entry): entry is { item: AlbumItem; mediaMessage: WAMessage } =>
      entry !== null,
  );
}

async function sendAlbumBatch(
  socket: ExtendedWASocket,
  jid: string,
  items: AlbumItem[],
  quoted?: proto.IWebMessageInfo | WAMessage,
) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const userJid = jidNormalizedUser(socket.user?.id || "");
  const preparedItems = await prepareAlbumMediaConcurrently(
    socket,
    jid,
    items,
    userJid,
  );

  if (preparedItems.length === 0) return null;

  let expectedImageCount = 0;
  let expectedVideoCount = 0;

  for (const { item } of preparedItems) {
    if (item.image) expectedImageCount += 1;
    else if (item.video) expectedVideoCount += 1;
  }

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

  for (let index = 0; index < preparedItems.length; index += 1) {
    if (index > 0) await sleep(ALBUM_RELAY_DELAY);

    const { mediaMessage } = preparedItems[index];
    try {
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
  for (let i = 0; i < batches.length; i += 1) {
    lastAlbum = await sendAlbumBatch(socket, jid, batches[i], quoted);
    if (i < batches.length - 1) {
      await sleep(ALBUM_BATCH_DELAY);
    }
  }

  return lastAlbum;
}
