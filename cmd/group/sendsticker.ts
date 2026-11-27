import {
  downloadContentFromMessage,
  downloadMediaMessage,
  extractMessageContent,
  prepareWAMessageMedia,
  proto,
} from "baileys";
import { LRUCache } from "lru-cache";
import { createHash, randomBytes } from "node:crypto";
import type { WAMessage } from "baileys";
import type { CommandContext, ExtendedWASocket } from "../../types/index.d.ts";
import type { StickerWithAudio } from "../../types/media.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { isAnimatedWebp, isWebp } from "../../core/stickerUtils.ts";
import { CONVERT_AUDIO_TO_OGG } from "../../utils/converter.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import { getActivePremBots } from "../../connection/premBotManager.ts";

const DURACION_MAXIMA = 25;
const COMMAND_NAMES = ["sendsticker", "sendstk"];

interface ChannelTarget {
  type: "invite" | "jid";
  value: string;
}

interface ResolvedChannelAdmin {
  sock: ExtendedWASocket;
  jid: string;
  name: string;
  role: string;
}

interface AckCheckResult {
  accepted: boolean;
  serverId?: string;
  error?: string;
  raw?: Record<string, unknown>;
}

interface RawUploadedMedia {
  url: string;
  directPath: string;
  fileSha256: Buffer;
  fileLength: number;
}

interface CachedStickerEntry {
  key: proto.IMessageKey;
  message: proto.IMessage;
  stickerObj: StickerWithAudio;
  audioObj: proto.Message.IAudioMessage | null;
}

const gStk = globalThis as unknown as {
  __auraSendStkCache?: LRUCache<string, CachedStickerEntry>;
  __auraSendStkHookedSockets?: WeakSet<object>;
  __auraSendStkInterval?: NodeJS.Timeout;
};

const stickerStanzaCache = (gStk.__auraSendStkCache ??= new LRUCache<
  string,
  CachedStickerEntry
>({
  max: 2_000,
  ttl: 30 * 60 * 1000,
}));

const hookedSockets = (gStk.__auraSendStkHookedSockets ??=
  new WeakSet<object>());

function readVarint(buf: Uint8Array, pos: number, end: number): [number, number] {
  let val = 0;
  let shift = 0;
  let p = pos;
  while (p < end) {
    const b = buf[p++];
    val += (b & 0x7f) * 2 ** shift;
    if ((b & 0x80) === 0) return [val, p];
    shift += 7;
    if (shift >= 70) break;
  }
  return [val, p];
}

function scanLengthDelimitedFields(
  buf: Uint8Array,
  start: number,
  end: number,
): Map<number, Buffer> {
  const found = new Map<number, Buffer>();
  let p = start;
  while (p < end) {
    const prev = p;
    const [tag, nextPos] = readVarint(buf, p, end);
    if (nextPos <= prev) break;
    p = nextPos;
    const fieldNumber = Math.floor(tag / 8);
    const wireType = tag & 7;

    if (wireType === 0) {
      const [, afterVarint] = readVarint(buf, p, end);
      if (afterVarint <= p) break;
      p = afterVarint;
    } else if (wireType === 1) {
      p += 8;
    } else if (wireType === 2) {
      const [len, dataStart] = readVarint(buf, p, end);
      if (dataStart < p || len < 0 || dataStart + len > end) break;
      found.set(
        fieldNumber,
        Buffer.from(buf.buffer, buf.byteOffset + dataStart, len),
      );
      p = dataStart + len;
    } else if (wireType === 5) {
      p += 4;
    } else {
      break;
    }
  }
  return found;
}

function snapshotReaderBounds(
  reader: any,
  length?: number,
): { buf: Uint8Array; start: number; end: number } | null {
  if (reader instanceof Uint8Array) {
    const end =
      length !== undefined ? Math.min(reader.length, length) : reader.length;
    return { buf: reader, start: 0, end };
  }
  if (
    reader &&
    reader.buf instanceof Uint8Array &&
    typeof reader.pos === "number"
  ) {
    const start = reader.pos;
    const end =
      length !== undefined
        ? Math.min(reader.len ?? reader.buf.length, start + length)
        : (reader.len ?? reader.buf.length);
    return { buf: reader.buf, start, end };
  }
  return null;
}

function modificarProto(p: typeof proto) {
  const M: typeof proto.Message & {
    __audioStickerPatchedV3?: boolean;
    __audioStickerDecodePatchedV2?: boolean;
  } = p.Message;
  if (!M) return;

  if (!M.__audioStickerPatchedV3) {
    if (M.StickerMessage) {
      const codificarStickerAnterior = M.StickerMessage.encode;

      M.StickerMessage.encode = function (mensaje, writer) {
        const sticker: StickerWithAudio = mensaje;
        const audio = sticker.audioMessage;

        if (
          audio &&
          Object.prototype.hasOwnProperty.call(mensaje, "audioMessage")
        ) {
          delete sticker.audioMessage;
        }

        const w = codificarStickerAnterior.call(this, mensaje, writer);

        if (audio && M.AudioMessage) {
          sticker.audioMessage = audio;
          M.AudioMessage.encode(audio, w.uint32(210).fork()).ldelim();
        }

        return w;
      };

      if (typeof M.StickerMessage.fromObject === "function") {
        const convertirStickerAnterior = M.StickerMessage.fromObject;

        M.StickerMessage.fromObject = function (objeto) {
          const mensaje: StickerWithAudio & proto.Message.StickerMessage =
            convertirStickerAnterior.call(this, objeto);

          if (objeto?.audioMessage) {
            mensaje.audioMessage = M.AudioMessage?.fromObject
              ? M.AudioMessage.fromObject(objeto.audioMessage)
              : objeto.audioMessage;
          }

          return mensaje;
        };
      }
    }

    const codificarMensajeAnterior = M.encode;

    M.encode = function (mensaje, writer) {
      const audioSticker = mensaje?.audioStickerMessage;

      if (audioSticker) {
        if (Object.prototype.hasOwnProperty.call(mensaje, "stickerMessage")) {
          delete mensaje.stickerMessage;
        }
        if (
          Object.prototype.hasOwnProperty.call(mensaje, "audioStickerMessage")
        ) {
          delete mensaje.audioStickerMessage;
        }
      }

      const w = codificarMensajeAnterior.call(this, mensaje, writer);

      if (audioSticker && M.FutureProofMessage) {
        mensaje.audioStickerMessage = audioSticker;
        M.FutureProofMessage.encode(
          audioSticker,
          w.uint32(1074).fork(),
        ).ldelim();
      }

      return w;
    };

    if (typeof M.fromObject === "function") {
      const convertirMensajeAnterior = M.fromObject;

      M.fromObject = function (objeto) {
        const mensaje = convertirMensajeAnterior.call(this, objeto);

        if (objeto?.audioStickerMessage) {
          const interno =
            objeto.audioStickerMessage.message || objeto.audioStickerMessage;

          if (
            interno?.stickerMessage &&
            objeto.audioStickerMessage.message?.stickerMessage?.audioMessage
          ) {
            interno.stickerMessage.audioMessage =
              objeto.audioStickerMessage.message.stickerMessage.audioMessage;
          }

          mensaje.audioStickerMessage = { message: interno };
          delete mensaje.stickerMessage;

          if (interno) {
            Object.setPrototypeOf(mensaje, interno);
          }
        }

        return mensaje;
      };
    }

    M.__audioStickerPatchedV3 = true;
  }

  if (!M.__audioStickerDecodePatchedV2) {
    if (M.StickerMessage && typeof M.StickerMessage.decode === "function") {
      const decodificarStickerAnterior = M.StickerMessage.decode;

      M.StickerMessage.decode = function (reader: any, length?: number) {
        const snap = snapshotReaderBounds(reader, length);
        const decoded: StickerWithAudio &
          proto.Message.StickerMessage & { __rawFieldIds?: number[] } =
          decodificarStickerAnterior.call(this, reader, length);

        if (snap) {
          try {
            const fields = scanLengthDelimitedFields(
              snap.buf,
              snap.start,
              snap.end,
            );
            const audioBytes = fields.get(26);
            if (!decoded.audioMessage && audioBytes && M.AudioMessage?.decode) {
              decoded.audioMessage = M.AudioMessage.decode(audioBytes);
            }
            if (fields.size > 0) {
              decoded.__rawFieldIds = Array.from(fields.keys());
            }
          } catch {}
        }

        return decoded;
      };
    }

    if (typeof M.decode === "function") {
      const decodificarMensajeAnterior = M.decode;

      M.decode = function (reader: any, length?: number) {
        const snap = snapshotReaderBounds(reader, length);
        const decoded: any = decodificarMensajeAnterior.call(
          this,
          reader,
          length,
        );

        if (snap) {
          try {
            const fields = scanLengthDelimitedFields(
              snap.buf,
              snap.start,
              snap.end,
            );
            const audioStickerBytes = fields.get(134);
            if (
              !decoded.audioStickerMessage &&
              audioStickerBytes &&
              M.FutureProofMessage?.decode
            ) {
              decoded.audioStickerMessage =
                M.FutureProofMessage.decode(audioStickerBytes);
            }
            if (fields.has(134) || fields.size > 0) {
              decoded.__rawFieldIds = Array.from(fields.keys());
            }
          } catch {}
        }

        return decoded;
      };
    }

    M.__audioStickerDecodePatchedV2 = true;
  }
}

let protoReadyPromise: Promise<void> | null = null;

function asegurarModificado(): Promise<void> {
  if (protoReadyPromise) return protoReadyPromise;

  protoReadyPromise = (async () => {
    modificarProto(proto);
    await Promise.all(
      ["kage-baileys", "@whiskeysockets/baileys", "baileys"].map(
        async (pkg) => {
          try {
            const mod = await import(pkg);
            if (mod?.proto) modificarProto(mod.proto);
            if (mod?.default?.proto) modificarProto(mod.default.proto);
          } catch {}
        },
      ),
    );
  })();

  return protoReadyPromise;
}

void asegurarModificado();

function unwrapMessage(raw: proto.IMessage | null | undefined): proto.IMessage {
  if (!raw) return {};
  let current: proto.IMessage = raw;

  for (let i = 0; i < 8 && current; i++) {
    const next =
      current.deviceSentMessage?.message ||
      current.ephemeralMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.viewOnceMessage?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message;

    if (!next) break;
    current = next;
  }

  if (typeof extractMessageContent === "function") {
    const extracted = extractMessageContent(current);
    if (
      extracted &&
      (extracted.stickerMessage ||
        (extracted as any).audioStickerMessage ||
        extracted.audioMessage)
    ) {
      return extracted;
    }
  }

  return current || {};
}

function extractStickerAndAudio(rawMsg: proto.IMessage | null | undefined) {
  const unwrapped = unwrapMessage(rawMsg);
  const rawAudioSticker =
    (unwrapped as any).audioStickerMessage ||
    (rawMsg as any)?.audioStickerMessage ||
    (rawMsg as any)?.deviceSentMessage?.message?.audioStickerMessage;

  const audioStickerInner = rawAudioSticker
    ? unwrapMessage(rawAudioSticker.message || rawAudioSticker)
    : undefined;

  const stickerObj =
    (audioStickerInner?.stickerMessage as StickerWithAudio | undefined) ||
    (unwrapped.stickerMessage as StickerWithAudio | undefined) ||
    ((rawMsg as any)?.stickerMessage as StickerWithAudio | undefined) ||
    null;

  const audioObj =
    (stickerObj?.audioMessage as proto.Message.IAudioMessage | undefined) ||
    (audioStickerInner?.audioMessage as
      | proto.Message.IAudioMessage
      | undefined) ||
    (unwrapped.audioMessage as proto.Message.IAudioMessage | undefined) ||
    ((rawMsg as any)?.audioMessage as proto.Message.IAudioMessage | undefined) ||
    null;

  return { stickerObj, audioObj, unwrapped };
}

function collectCandidateSockets(
  currentSock?: ExtendedWASocket,
): ExtendedWASocket[] {
  const gAny = globalThis as Record<string, any>;
  const rawList: any[] = [
    currentSock,
    gAny.mainSocket,
    gAny.mainSock,
    gAny.sock,
    gAny.__auraWebPanel?.mainSock,
  ];

  try {
    rawList.push(...(getActivePremBots?.() || []));
  } catch {}
  try {
    rawList.push(...(getActiveSubBots?.() || []));
  } catch {}

  const unique: ExtendedWASocket[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    const s = (item?.sock ?? item) as ExtendedWASocket | undefined;
    if (!s || (s as any).isClosed || !s.user?.id) continue;
    const key = String(s.user.id).split(":")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }

  return unique;
}

function cacheStickerFromIncoming(msg: WAMessage) {
  const id = msg?.key?.id;
  if (!id || !msg?.message) return;

  const { stickerObj, audioObj } = extractStickerAndAudio(msg.message);
  if (!stickerObj) return;

  const prev = stickerStanzaCache.get(id);
  if (prev?.audioObj && !audioObj) return;

  stickerStanzaCache.set(id, {
    key: msg.key,
    message: msg.message,
    stickerObj,
    audioObj,
  });
}

function attachStickerSniffers(currentSock?: ExtendedWASocket) {
  const sockets = collectCandidateSockets(currentSock);
  for (const s of sockets) {
    if (!s || typeof s !== "object" || hookedSockets.has(s)) continue;
    hookedSockets.add(s);

    s.ev?.on?.("messages.upsert", ({ messages }: { messages?: WAMessage[] }) => {
      if (!Array.isArray(messages)) return;
      for (const m of messages) {
        try {
          cacheStickerFromIncoming(m);
        } catch {}
      }
    });
  }
}

attachStickerSniffers();
if (!gStk.__auraSendStkInterval) {
  gStk.__auraSendStkInterval = setInterval(() => {
    try {
      attachStickerSniffers();
    } catch {}
  }, 4000);
  gStk.__auraSendStkInterval.unref?.();
}

function extractChannelTarget(text: string): ChannelTarget | null {
  const jidMatch = text.match(/\b(\d+@newsletter)\b/i);
  if (jidMatch?.[1]) {
    return { type: "jid", value: jidMatch[1].toLowerCase() };
  }

  const linkMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,})/i,
  );
  if (linkMatch?.[1]) {
    return { type: "invite", value: linkMatch[1] };
  }

  return null;
}

function extractContextInfo(message: proto.IMessage | null | undefined) {
  if (!message) return undefined;
  const unwrapped = unwrapMessage(message);
  return (
    unwrapped.extendedTextMessage?.contextInfo ||
    unwrapped.imageMessage?.contextInfo ||
    unwrapped.videoMessage?.contextInfo ||
    unwrapped.stickerMessage?.contextInfo ||
    unwrapped.audioMessage?.contextInfo ||
    unwrapped.documentMessage?.contextInfo ||
    message.extendedTextMessage?.contextInfo ||
    undefined
  );
}

function isValidOgg(buf: Buffer | null | undefined): buf is Buffer {
  return Boolean(
    buf &&
      buf.length >= 64 &&
      buf[0] === 0x4f &&
      buf[1] === 0x67 &&
      buf[2] === 0x67 &&
      buf[3] === 0x53,
  );
}

function generarFormaDeOnda(bufferBase: Buffer, longitud = 64): Buffer {
  const forma = Buffer.allocUnsafe(longitud);
  const len = bufferBase?.length || 0;
  for (let i = 0; i < longitud; i++) {
    const byte = len ? bufferBase[(i * 19 + 7) % len] : i * 11;
    forma[i] = 18 + (byte % 76);
  }
  return forma;
}

async function downloadMediaObject(
  sock: ExtendedWASocket,
  mediaObj: Record<string, any>,
  dlType: "sticker" | "audio",
  fallbackKey: proto.IMessageKey,
): Promise<Buffer> {
  if (mediaObj.mediaKey || mediaObj.directPath || mediaObj.url) {
    try {
      const stream = await downloadContentFromMessage(mediaObj as any, dlType);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const out = Buffer.concat(chunks);
      if (out.length > 0) return out;
    } catch {}
  }

  const synthetic = {
    key: fallbackKey,
    message: {
      [`${dlType}Message`]: mediaObj,
    },
  } as unknown as WAMessage;

  const buf = await downloadMediaMessage(
    synthetic,
    "buffer",
    {},
    {
      logger: sock.logger,
      reuploadRequest: (m) => sock.updateMediaMessage(m),
    },
  );

  if (!buf || !buf.length) {
    throw new Error(`No se pudo descargar el archivo (${dlType}).`);
  }

  return Buffer.from(buf);
}

async function queryChannelMeta(
  sock: ExtendedWASocket,
  target: ChannelTarget,
): Promise<{ jid: string; name: string; role: string } | null> {
  const sAny = sock as any;
  if (typeof sAny.newsletterMetadata !== "function") return null;

  try {
    const meta = await sAny.newsletterMetadata(target.type, target.value);
    if (!meta) return null;

    const jid = String(
      meta.id || meta.jid || (target.type === "jid" ? target.value : ""),
    ).trim();
    if (!jid) return null;

    let role = String(
      meta.viewer_metadata?.role ||
        meta.thread_metadata?.viewer_metadata?.role ||
        meta.role ||
        "",
    ).toUpperCase();

    if (!role && target.type === "invite") {
      try {
        const byJid = await sAny.newsletterMetadata("jid", jid);
        role = String(
          byJid?.viewer_metadata?.role ||
            byJid?.thread_metadata?.viewer_metadata?.role ||
            byJid?.role ||
            "",
        ).toUpperCase();
      } catch {}
    }

    const name = String(
      meta.name || meta.thread_metadata?.name?.text || jid,
    ).trim();
    return { jid, name, role };
  } catch {
    return null;
  }
}

async function resolveAdminChannelSocket(
  currentSock: ExtendedWASocket,
  target: ChannelTarget,
): Promise<{
  admin: ResolvedChannelAdmin | null;
  channelName: string;
  detectedRole: string;
}> {
  const candidates = collectCandidateSockets(currentSock);
  let channelName = target.value;
  let detectedRole = "DESCONOCIDO";

  for (const candidate of candidates) {
    const info = await queryChannelMeta(candidate, target);
    if (!info) continue;
    if (info.name) channelName = info.name;
    if (info.role) detectedRole = info.role;

    if (info.role === "OWNER" || info.role === "ADMIN") {
      return {
        admin: {
          sock: candidate,
          jid: info.jid,
          name: info.name,
          role: info.role,
        },
        channelName: info.name,
        detectedRole: info.role,
      };
    }
  }

  return { admin: null, channelName, detectedRole };
}

async function fetchMediaConn(
  sock: ExtendedWASocket,
): Promise<{ auth: string; hosts: string[] }> {
  const res = await sock.query({
    tag: "iq",
    attrs: {
      to: "s.whatsapp.net",
      type: "set",
      xmlns: "w:m",
    },
    content: [{ tag: "media_conn", attrs: {} }],
  });

  const children = Array.isArray(res?.content) ? res.content : [];
  const mediaConn = children.find((c: any) => c?.tag === "media_conn");
  const auth = String(mediaConn?.attrs?.auth || "");
  const hostNodes = Array.isArray(mediaConn?.content) ? mediaConn.content : [];
  const hosts = hostNodes
    .filter((n: any) => n?.tag === "host" && n?.attrs?.hostname)
    .map((n: any) => String(n.attrs.hostname));

  if (!auth || hosts.length === 0) {
    throw new Error("No se pudo obtener media_conn desde WhatsApp.");
  }

  return { auth, hosts };
}

async function uploadNewsletterRawMedia(
  sock: ExtendedWASocket,
  buffer: Buffer,
  kind: "sticker" | "audio",
): Promise<RawUploadedMedia> {
  const fileSha256 = createHash("sha256").update(buffer).digest();
  const token = fileSha256.toString("base64url");
  const mediaPath =
    kind === "sticker"
      ? "/newsletter/newsletter-image"
      : "/newsletter/newsletter-audio";
  const { auth, hosts } = await fetchMediaConn(sock);

  let lastErr = "Sin respuesta del CDN de canales";

  for (const hostname of hosts) {
    const uploadUrl = `https://${hostname}${mediaPath}/${token}?auth=${encodeURIComponent(auth)}&token=${token}`;
    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          Origin: "https://web.whatsapp.com",
        },
        body: new Uint8Array(buffer),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        lastErr = `CDN HTTP ${response.status}`;
        continue;
      }

      const data = (await response.json()) as {
        url?: string;
        direct_path?: string;
      };
      const directPath = String(data.direct_path || "").trim();
      const url = String(
        data.url || (directPath ? `https://mmg.whatsapp.net${directPath}` : ""),
      ).trim();

      if (directPath && url) {
        return {
          url,
          directPath,
          fileSha256,
          fileLength: buffer.length,
        };
      }
      lastErr = "El CDN no devolvió direct_path";
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Fallo subiendo ${kind} al canal: ${lastErr}`);
}

function waitForStanzaAck(
  sock: ExtendedWASocket,
  messageId: string,
  timeoutMs = 7000,
): Promise<AckCheckResult> {
  return new Promise((resolve) => {
    const wsAny = (sock as any).ws;
    if (!wsAny || typeof wsAny.on !== "function") {
      resolve({ accepted: false, error: "socket ws sin listener de ACK" });
      return;
    }

    const onAck = (node: any) => {
      if (node?.attrs?.id !== messageId) return;
      clearTimeout(timer);
      wsAny.off("CB:ack", onAck);
      const attrs = (node?.attrs || {}) as Record<string, unknown>;
      if (attrs.error) {
        resolve({ accepted: false, error: String(attrs.error), raw: attrs });
      } else {
        resolve({
          accepted: true,
          serverId: attrs.server_id ? String(attrs.server_id) : undefined,
          raw: attrs,
        });
      }
    };

    const timer = setTimeout(() => {
      wsAny.off("CB:ack", onAck);
      resolve({ accepted: false, error: "timeout esperando ACK del canal" });
    }, timeoutMs);
    timer.unref?.();

    wsAny.on("CB:ack", onAck);
  });
}

async function sendNewsletterPlaintextMedia(
  sock: ExtendedWASocket,
  channelJid: string,
  mediaType: "sticker" | "ptt" | "audio",
  protoPayload: Record<string, any>,
): Promise<AckCheckResult> {
  await asegurarModificado();
  const encoded = proto.Message.encode(
    proto.Message.fromObject(protoPayload),
  ).finish();
  const messageId = `3EB0${randomBytes(9).toString("hex").toUpperCase()}`;
  const ackPromise = waitForStanzaAck(sock, messageId, 7000);

  await (sock as any).sendNode({
    tag: "message",
    attrs: {
      id: messageId,
      to: channelJid,
      type: "media",
    },
    content: [
      {
        tag: "plaintext",
        attrs: { mediatype: mediaType },
        content: Buffer.from(encoded),
      },
    ],
  });

  return ackPromise;
}

async function publishStickerToChannel(
  sock: ExtendedWASocket,
  channelJid: string,
  stickerBuffer: Buffer,
  isAnimated: boolean,
): Promise<AckCheckResult> {
  const uploadedSticker = await uploadNewsletterRawMedia(
    sock,
    stickerBuffer,
    "sticker",
  );

  const stickerMessage: proto.Message.IStickerMessage = {
    url: uploadedSticker.url,
    directPath: uploadedSticker.directPath,
    fileSha256: uploadedSticker.fileSha256,
    fileLength: uploadedSticker.fileLength,
    mimetype: "image/webp",
    isAnimated,
    width: 512,
    height: 512,
  };

  return sendNewsletterPlaintextMedia(sock, channelJid, "sticker", {
    stickerMessage,
  });
}

async function publishForcedAudioStickerToChannel(
  sock: ExtendedWASocket,
  channelJid: string,
  stickerBuffer: Buffer,
  isAnimated: boolean,
  oggBuffer: Buffer,
  audioSeconds: number,
  useEncryptedAudio: boolean,
): Promise<{ ok: boolean; mode?: string; serverId?: string; error?: string }> {
  await asegurarModificado();

  const secondsFinal = Math.max(
    1,
    Math.min(DURACION_MAXIMA, Math.round(audioSeconds > 0 ? audioSeconds : 5)),
  );
  const waveform = generarFormaDeOnda(oggBuffer);

  const uploadedSticker = await uploadNewsletterRawMedia(
    sock,
    stickerBuffer,
    "sticker",
  );

  let audioMessage: proto.Message.IAudioMessage;

  if (useEncryptedAudio) {
    const audioPrep = await prepareWAMessageMedia(
      {
        audio: oggBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
      },
      { upload: sock.waUploadToServer },
    );
    if (!audioPrep.audioMessage) {
      throw new Error("No se pudo preparar el audio cifrado.");
    }
    audioMessage = audioPrep.audioMessage;
    audioMessage.seconds = secondsFinal;
    audioMessage.ptt = true;
    audioMessage.mimetype = "audio/ogg; codecs=opus";
    if (!audioMessage.waveform?.length) {
      audioMessage.waveform = waveform;
    }
  } else {
    const uploadedAudio = await uploadNewsletterRawMedia(
      sock,
      oggBuffer,
      "audio",
    );
    audioMessage = {
      url: uploadedAudio.url,
      directPath: uploadedAudio.directPath,
      fileSha256: uploadedAudio.fileSha256,
      fileLength: uploadedAudio.fileLength,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true,
      seconds: secondsFinal,
      waveform,
    };
  }

  const stickerMessage: StickerWithAudio = {
    url: uploadedSticker.url,
    directPath: uploadedSticker.directPath,
    fileSha256: uploadedSticker.fileSha256,
    fileLength: uploadedSticker.fileLength,
    mimetype: "image/webp",
    isAnimated,
    width: 512,
    height: 512,
    audioMessage,
  };

  let lastError = "Rechazado por el servidor del canal";

  const ack1 = await sendNewsletterPlaintextMedia(sock, channelJid, "sticker", {
    audioStickerMessage: {
      message: {
        stickerMessage,
      },
    },
  });

  if (ack1.accepted) {
    return {
      ok: true,
      mode: useEncryptedAudio
        ? "plaintext 1074+210 (audio cifrado)"
        : "plaintext 1074+210 (canal raw)",
      serverId: ack1.serverId,
    };
  }
  lastError = `1074+210 -> ${ack1.error || "rechazado"}`;

  const ack2 = await sendNewsletterPlaintextMedia(sock, channelJid, "sticker", {
    stickerMessage,
  });

  if (ack2.accepted) {
    return {
      ok: true,
      mode: useEncryptedAudio
        ? "plaintext 210 directo (audio cifrado)"
        : "plaintext 210 directo (canal raw)",
      serverId: ack2.serverId,
    };
  }
  lastError = `${lastError} | 210 -> ${ack2.error || "rechazado"}`;

  return { ok: false, error: lastError };
}

export default {
  name: COMMAND_NAMES,
  command: COMMAND_NAMES,
  alias: COMMAND_NAMES,
  aliases: COMMAND_NAMES,
  category: "sticker",
  description:
    "Envía un sticker (estático, animado o con audio forzado) a un canal donde el bot o subbot sea admin.",
  cooldown: 0,

  async run(ctx: CommandContext) {
    const {
      sock,
      from,
      msg,
      text,
      args = [],
      usedPrefix,
      reply,
      react,
      isOwner,
      isCoOwner,
      isMod,
      isBotUser,
    } = ctx;

    attachStickerSniffers(sock);
    const prefix = usedPrefix || ".";

    if (!isOwner && !isCoOwner && !isMod && !isBotUser) {
      void react("⛔").catch(() => undefined);
      return reply(
        `⛔ Solo el dueño, moderadores o la cuenta del bot/subbot pueden enviar stickers a canales.`,
      );
    }

    const fullInput = String(text || args.join(" ") || "").trim();
    const isDebug = /(?:^|\s)--debug(?:\s|$)/i.test(fullInput);
    const allowSplitFallback = /(?:^|\s)(?:--split|--fallback)(?:\s|$)/i.test(
      fullInput,
    );
    const useEncryptedAudio = /(?:^|\s)--encaudio(?:\s|$)/i.test(fullInput);
    const channelTarget = extractChannelTarget(fullInput);

    const quotedCtx = extractContextInfo(msg.message);
    const quotedRaw = quotedCtx?.quotedMessage;
    const quotedStanzaId = quotedCtx?.stanzaId || "";

    if (isDebug && quotedRaw) {
      const cached = quotedStanzaId
        ? stickerStanzaCache.get(quotedStanzaId)
        : undefined;
      const fromQuote = extractStickerAndAudio(quotedRaw);
      const dump = {
        stanzaId: quotedStanzaId || null,
        cacheHit: Boolean(cached),
        cacheSize: stickerStanzaCache.size,
        cachedHasAudio: Boolean(cached?.audioObj),
        cachedMsgKeys: cached ? Object.keys(cached.message || {}) : [],
        cachedMsgRawFields: (cached?.message as any)?.__rawFieldIds || [],
        cachedStickerRawFields: (cached?.stickerObj as any)?.__rawFieldIds || [],
        quotedKeys: Object.keys(quotedRaw || {}),
        quotedMsgRawFields: (quotedRaw as any)?.__rawFieldIds || [],
        quotedHasAudio: Boolean(fromQuote.audioObj),
        quotedStickerKeys: fromQuote.stickerObj
          ? Object.keys(fromQuote.stickerObj)
          : [],
        quotedStickerRawFields:
          (fromQuote.stickerObj as any)?.__rawFieldIds || [],
      };
      return reply(`\`\`\`${JSON.stringify(dump, null, 2)}\`\`\``);
    }

    if (!quotedRaw || !channelTarget) {
      return reply(
        `╭〔 📢 ${fytBold("ENVIAR STICKER A CANAL")} 〕⬣\n` +
          `┃ Responde a un *sticker* (normal, animado o con audio) y pega el enlace del canal.\n` +
          `┃\n` +
          `┃ • *Uso:* \`${prefix}sendsticker https://whatsapp.com/channel/0029Va...\`\n` +
          `┃ • *Alias:* \`${prefix}sendstk <enlace o @newsletter>\`\n` +
          `┃ • *Audio cifrado (opcional):* agrega \`--encaudio\` si el audio sale mudo.\n` +
          `┃ • *Respaldo separado:* agrega \`--split\` para publicar sticker + nota de voz aparte.\n` +
          `┃ • *Diagnóstico:* agrega \`--debug\` al responder al sticker.\n` +
          `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
      );
    }

    const cachedOriginal = quotedStanzaId
      ? stickerStanzaCache.get(quotedStanzaId)
      : undefined;
    const quotedExtracted = extractStickerAndAudio(quotedRaw);

    const stickerObj = cachedOriginal?.stickerObj || quotedExtracted.stickerObj;
    const audioObj = cachedOriginal?.audioObj || quotedExtracted.audioObj;

    if (!stickerObj) {
      void react("❌").catch(() => undefined);
      return reply(
        `⚠️ El mensaje citado no contiene un sticker válido. Responde directamente a un sticker o sticker con audio.`,
      );
    }

    void react("⏳").catch(() => undefined);

    try {
      const { admin, channelName, detectedRole } =
        await resolveAdminChannelSocket(sock, channelTarget);

      if (!admin) {
        void react("❌").catch(() => undefined);
        return reply(
          `╭〔 ⛔ ${fytBold("SIN PERMISOS EN EL CANAL")} 〕⬣\n` +
            `┃ • *Canal:* ${channelName}\n` +
            `┃ • *Rol detectado:* \`${detectedRole}\`\n` +
            `┃\n` +
            `┃ El bot o alguno de los subbots activos debe ser *Administrador* o *Propietario* del canal para publicar.\n` +
            `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
        );
      }

      const quotedKey: proto.IMessageKey = cachedOriginal?.key || {
        remoteJid: quotedCtx?.remoteJid || from,
        id: quotedStanzaId || msg.key.id || "0",
        participant: quotedCtx?.participant || undefined,
      };

      const stickerBuffer = await downloadMediaObject(
        sock,
        stickerObj,
        "sticker",
        quotedKey,
      );

      if (!isWebp(stickerBuffer)) {
        throw new Error("El archivo descargado no es un WebP válido.");
      }

      const isAnimated = Boolean(
        stickerObj.isAnimated || isAnimatedWebp(stickerBuffer),
      );

      if (!audioObj) {
        const ack = await publishStickerToChannel(
          admin.sock,
          admin.jid,
          stickerBuffer,
          isAnimated,
        );

        if (!ack.accepted) {
          void react("❌").catch(() => undefined);
          return reply(
            `╭〔 ❌ ${fytBold("EL CANAL RECHAZÓ EL STICKER")} 〕⬣\n` +
              `┃ • *Canal:* ${admin.name}\n` +
              `┃ • *Error ACK:* \`${ack.error || "desconocido"}\`\n` +
              `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
          );
        }

        const cacheHint = !cachedOriginal
          ? `\n┃ ℹ️ *Tip:* WhatsApp recorta el audio al citar stickers viejos. Si tenía sonido, reenvía el sticker una vez ahora y cita ese nuevo mensaje.`
          : "";

        void react("✅").catch(() => undefined);
        return reply(
          `╭〔 ✅ ${fytBold("STICKER PUBLICADO")} 〕⬣\n` +
            `┃ • *Canal:* ${admin.name}\n` +
            `┃ • *Tipo:* ${isAnimated ? "Animado" : "Estático"} (sin audio detectado)\n` +
            `┃ • *Post ID:* \`${ack.serverId || "OK"}\`\n` +
            `┃ • *Rol:* ${admin.role}${cacheHint}\n` +
            `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
        );
      }

      const rawAudioBuffer = await downloadMediaObject(
        sock,
        audioObj,
        "audio",
        quotedKey,
      );

      const audioSeconds = Number(audioObj.seconds || 0);
      const oggBuffer = isValidOgg(rawAudioBuffer)
        ? rawAudioBuffer
        : await CONVERT_AUDIO_TO_OGG(
            rawAudioBuffer,
            audioSeconds > 0
              ? Math.min(DURACION_MAXIMA, audioSeconds)
              : DURACION_MAXIMA,
          );

      const forcedResult = await publishForcedAudioStickerToChannel(
        admin.sock,
        admin.jid,
        stickerBuffer,
        isAnimated,
        oggBuffer,
        audioSeconds,
        useEncryptedAudio,
      );

      if (forcedResult.ok) {
        void react("✅").catch(() => undefined);
        return reply(
          `╭〔 ✅ ${fytBold("AUDIO STICKER PUBLICADO")} 〕⬣\n` +
            `┃ • *Canal:* ${admin.name}\n` +
            `┃ • *Modo:* \`${forcedResult.mode}\`\n` +
            `┃ • *Tipo:* ${isAnimated ? "Animado + Audio" : "Estático + Audio"}\n` +
            `┃ • *Post ID:* \`${forcedResult.serverId || "OK"}\`\n` +
            `┃ • *Rol:* ${admin.role}\n` +
            `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
        );
      }

      if (allowSplitFallback) {
        const stkAck = await publishStickerToChannel(
          admin.sock,
          admin.jid,
          stickerBuffer,
          isAnimated,
        );
        const uploadedAudio = await uploadNewsletterRawMedia(
          admin.sock,
          oggBuffer,
          "audio",
        );
        await sendNewsletterPlaintextMedia(admin.sock, admin.jid, "ptt", {
          audioMessage: {
            url: uploadedAudio.url,
            directPath: uploadedAudio.directPath,
            fileSha256: uploadedAudio.fileSha256,
            fileLength: uploadedAudio.fileLength,
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
            seconds: Math.max(
              1,
              Math.min(
                DURACION_MAXIMA,
                Math.round(audioSeconds > 0 ? audioSeconds : 5),
              ),
            ),
            waveform: generarFormaDeOnda(oggBuffer),
          },
        });

        void react("⚠️").catch(() => undefined);
        return reply(
          `╭〔 ⚠️ ${fytBold("PUBLICADO EN MODO SEPARADO")} 〕⬣\n` +
            `┃ • *Canal:* ${admin.name}\n` +
            `┃ • *Post ID Sticker:* \`${stkAck.serverId || "OK"}\`\n` +
            `┃ • *Motivo:* \`${forcedResult.error}\`\n` +
            `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
        );
      }

      void react("❌").catch(() => undefined);
      return reply(
        `╭〔 ❌ ${fytBold("CANAL RECHAZÓ AUDIO STICKER")} 〕⬣\n` +
          `┃ • *Canal:* ${admin.name}\n` +
          `┃ • *Respuesta del servidor:* \`${forcedResult.error}\`\n` +
          `┃\n` +
          `┃ Prueba añadiendo \`--encaudio\` o \`--split\` al final del comando.\n` +
          `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
      );
    } catch (error: unknown) {
      void react("❌").catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      return reply(
        `╭〔 ❌ ${fytBold("ERROR AL ENVIAR AL CANAL")} 〕⬣\n` +
          `┃ \`${message}\`\n` +
          `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
      );
    }
  },
};
