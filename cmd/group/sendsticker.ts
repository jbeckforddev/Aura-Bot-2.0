import {
  downloadContentFromMessage,
  downloadMediaMessage,
  extractMessageContent,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
} from "baileys";
import { randomBytes } from "node:crypto";
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
  error?: string;
  raw?: Record<string, unknown>;
}

function modificarProto(p: typeof proto) {
  const M: typeof proto.Message & { __audioStickerPatchedV3?: boolean } = p.Message;
  if (!M || M.__audioStickerPatchedV3) return;

  if (M.StickerMessage) {
    const codificarStickerAnterior = M.StickerMessage.encode;

    M.StickerMessage.encode = function (mensaje, writer) {
      const sticker: StickerWithAudio = mensaje;
      const audio = sticker.audioMessage;

      if (audio && Object.prototype.hasOwnProperty.call(mensaje, "audioMessage")) {
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
      if (Object.prototype.hasOwnProperty.call(mensaje, "audioStickerMessage")) {
        delete mensaje.audioStickerMessage;
      }
    }

    const w = codificarMensajeAnterior.call(this, mensaje, writer);

    if (audioSticker && M.FutureProofMessage) {
      mensaje.audioStickerMessage = audioSticker;
      M.FutureProofMessage.encode(audioSticker, w.uint32(1074).fork()).ldelim();
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

let protoReadyPromise: Promise<void> | null = null;

function asegurarModificado(): Promise<void> {
  if (protoReadyPromise) return protoReadyPromise;

  protoReadyPromise = (async () => {
    modificarProto(proto);
    await Promise.all(
      ["kage-baileys", "@whiskeysockets/baileys", "baileys"].map(async (pkg) => {
        try {
          const mod = await import(pkg);
          if (mod?.proto) modificarProto(mod.proto);
          if (mod?.default?.proto) modificarProto(mod.default.proto);
        } catch {}
      }),
    );
  })();

  return protoReadyPromise;
}

void asegurarModificado();

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
  return (
    message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo ||
    message.videoMessage?.contextInfo ||
    message.stickerMessage?.contextInfo ||
    message.audioMessage?.contextInfo ||
    message.documentMessage?.contextInfo ||
    undefined
  );
}

function unwrapMessage(raw: proto.IMessage | null | undefined): proto.IMessage {
  if (!raw) return {};
  let current =
    typeof extractMessageContent === "function"
      ? extractMessageContent(raw) || raw
      : raw;

  for (let i = 0; i < 6 && current; i++) {
    const next =
      current.ephemeralMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.viewOnceMessage?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message;

    if (!next) break;
    current = next;
  }

  return current || {};
}

function extractStickerAndAudio(quotedRaw: proto.IMessage | null | undefined) {
  const unwrapped = unwrapMessage(quotedRaw);
  const rawAudioSticker = unwrapped.audioStickerMessage as
    | { message?: proto.IMessage }
    | proto.IMessage
    | undefined;
  const audioStickerInner = rawAudioSticker
    ? unwrapMessage(
        (rawAudioSticker as { message?: proto.IMessage }).message ||
          (rawAudioSticker as proto.IMessage),
      )
    : undefined;

  const stickerObj =
    (audioStickerInner?.stickerMessage as StickerWithAudio | undefined) ||
    (unwrapped.stickerMessage as StickerWithAudio | undefined) ||
    null;

  const audioObj =
    (stickerObj?.audioMessage as proto.Message.IAudioMessage | undefined) ||
    (audioStickerInner?.audioMessage as proto.Message.IAudioMessage | undefined) ||
    (unwrapped.audioMessage as proto.Message.IAudioMessage | undefined) ||
    null;

  return { stickerObj, audioObj };
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

function collectCandidateSockets(currentSock: ExtendedWASocket): ExtendedWASocket[] {
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

async function queryChannelMeta(
  sock: ExtendedWASocket,
  target: ChannelTarget,
): Promise<{ jid: string; name: string; role: string } | null> {
  const sAny = sock as any;
  if (typeof sAny.newsletterMetadata !== "function") return null;

  try {
    const meta = await sAny.newsletterMetadata(target.type, target.value);
    if (!meta) return null;

    const jid = String(meta.id || meta.jid || (target.type === "jid" ? target.value : "")).trim();
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

function waitForStanzaAck(
  sock: ExtendedWASocket,
  messageId: string,
  timeoutMs = 5000,
): Promise<AckCheckResult> {
  return new Promise((resolve) => {
    const wsAny = (sock as any).ws;
    if (!wsAny || typeof wsAny.on !== "function") {
      resolve({ accepted: true });
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
        resolve({ accepted: true, raw: attrs });
      }
    };

    const timer = setTimeout(() => {
      wsAny.off("CB:ack", onAck);
      resolve({ accepted: true });
    }, timeoutMs);
    timer.unref?.();

    wsAny.on("CB:ack", onAck);
  });
}

async function sendForcedAudioStickerToChannel(
  sock: ExtendedWASocket,
  channelJid: string,
  stickerBuffer: Buffer,
  isAnimated: boolean,
  oggBuffer: Buffer,
  audioSeconds: number,
): Promise<{ ok: boolean; mode?: string; error?: string }> {
  await asegurarModificado();

  const [stickerPrep, audioPrep] = await Promise.all([
    prepareWAMessageMedia(
      {
        sticker: stickerBuffer,
        isAnimated,
      },
      {
        upload: sock.waUploadToServer,
      },
    ),
    prepareWAMessageMedia(
      {
        audio: oggBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
      },
      {
        upload: sock.waUploadToServer,
      },
    ),
  ]);

  const audioMessage = audioPrep.audioMessage;
  const stickerMessage = stickerPrep.stickerMessage as StickerWithAudio | undefined;
  if (!stickerMessage || !audioMessage) {
    throw new Error("No se pudieron preparar los medios del sticker con audio.");
  }

  audioMessage.seconds = Math.max(
    1,
    Math.min(DURACION_MAXIMA, Math.round(audioSeconds > 0 ? audioSeconds : 5)),
  );
  audioMessage.ptt = true;
  audioMessage.mimetype = "audio/ogg; codecs=opus";
  if (!audioMessage.waveform?.length) {
    audioMessage.waveform = generarFormaDeOnda(oggBuffer);
  }

  stickerMessage.isAnimated = isAnimated;
  stickerMessage.audioMessage = audioMessage;

  let lastError = "El servidor rechazó el paquete";

  try {
    const wrappedPayload = {
      __proto__: stickerPrep,
      audioStickerMessage: {
        message: stickerPrep,
      },
      messageContextInfo: {
        messageSecret: randomBytes(32),
      },
    };

    const waMsg1 = generateWAMessageFromContent(
      channelJid,
      wrappedPayload as any,
      { userJid: sock.user?.id || channelJid },
    );

    if (waMsg1.message && waMsg1.key.id) {
      const ackPromise = waitForStanzaAck(sock, waMsg1.key.id, 5000);
      await sock.relayMessage(channelJid, waMsg1.message, {
        messageId: waMsg1.key.id,
      });
      const ack = await ackPromise;
      if (ack.accepted) {
        return { ok: true, mode: "audioStickerMessage (1074+210)" };
      }
      lastError = `ACK error ${ack.error || "desconocido"}`;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  try {
    const waMsg2 = generateWAMessageFromContent(
      channelJid,
      {
        stickerMessage,
      } as any,
      { userJid: sock.user?.id || channelJid },
    );

    if (waMsg2.message && waMsg2.key.id) {
      const ackPromise = waitForStanzaAck(sock, waMsg2.key.id, 5000);
      await sock.relayMessage(channelJid, waMsg2.message, {
        messageId: waMsg2.key.id,
      });
      const ack = await ackPromise;
      if (ack.accepted) {
        return { ok: true, mode: "stickerMessage + audio embebido (210)" };
      }
      lastError = `ACK error ${ack.error || "desconocido"}`;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

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

    const prefix = usedPrefix || ".";

    if (!isOwner && !isCoOwner && !isMod && !isBotUser) {
      void react("⛔").catch(() => undefined);
      return reply(
        `⛔ Solo el dueño, moderadores o la cuenta del bot/subbot pueden enviar stickers a canales.`,
      );
    }

    const fullInput = String(text || args.join(" ") || "").trim();
    const allowSplitFallback = /(?:^|\s)(?:--split|--fallback)(?:\s|$)/i.test(
      fullInput,
    );
    const channelTarget = extractChannelTarget(fullInput);

    const quotedCtx = extractContextInfo(msg.message);
    const quotedRaw = quotedCtx?.quotedMessage;

    if (!quotedRaw || !channelTarget) {
      return reply(
        `╭〔 📢 ${fytBold("ENVIAR STICKER A CANAL")} 〕⬣\n` +
          `┃ Responde a un *sticker* (normal, animado o con audio) y pega el enlace del canal.\n` +
          `┃\n` +
          `┃ • *Uso:* \`${prefix}sendsticker https://whatsapp.com/channel/0029Va...\`\n` +
          `┃ • *Alias:* \`${prefix}sendstk <enlace o @newsletter>\`\n` +
          `┃ • *Respaldo separado:* agrega \`--split\` si deseas enviar sticker + nota de voz aparte en caso de bloqueo del canal.\n` +
          `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
      );
    }

    const { stickerObj, audioObj } = extractStickerAndAudio(quotedRaw);
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

      const quotedKey: proto.IMessageKey = {
        remoteJid: quotedCtx?.remoteJid || from,
        id: quotedCtx?.stanzaId || msg.key.id || "0",
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
        await admin.sock.sendMessage(admin.jid, {
          sticker: stickerBuffer,
        });

        void react("✅").catch(() => undefined);
        return reply(
          `╭〔 ✅ ${fytBold("STICKER PUBLICADO")} 〕⬣\n` +
            `┃ • *Canal:* ${admin.name}\n` +
            `┃ • *Tipo:* ${isAnimated ? "Animado" : "Estático"}\n` +
            `┃ • *Rol:* ${admin.role}\n` +
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

      const forcedResult = await sendForcedAudioStickerToChannel(
        admin.sock,
        admin.jid,
        stickerBuffer,
        isAnimated,
        oggBuffer,
        audioSeconds,
      );

      if (forcedResult.ok) {
        void react("✅").catch(() => undefined);
        return reply(
          `╭〔 ✅ ${fytBold("AUDIO STICKER PUBLICADO")} 〕⬣\n` +
            `┃ • *Canal:* ${admin.name}\n` +
            `┃ • *Modo:* \`${forcedResult.mode}\`\n` +
            `┃ • *Tipo:* ${isAnimated ? "Animado + Audio" : "Estático + Audio"}\n` +
            `┃ • *Rol:* ${admin.role}\n` +
            `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
        );
      }

      if (allowSplitFallback) {
        await admin.sock.sendMessage(admin.jid, {
          sticker: stickerBuffer,
        });
        await admin.sock.sendMessage(admin.jid, {
          audio: oggBuffer,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        });

        void react("⚠️").catch(() => undefined);
        return reply(
          `╭〔 ⚠️ ${fytBold("PUBLICADO EN MODO SEPARADO")} 〕⬣\n` +
            `┃ • *Canal:* ${admin.name}\n` +
            `┃ • *Motivo:* El servidor del canal rechazó el formato forzado (\`${forcedResult.error}\`).\n` +
            `┃ • Se envió el sticker y la nota de voz por separado.\n` +
            `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
        );
      }

      void react("❌").catch(() => undefined);
      return reply(
        `╭〔 ❌ ${fytBold("CANAL RECHAZÓ AUDIO STICKER")} 〕⬣\n` +
          `┃ • *Canal:* ${admin.name}\n` +
          `┃ • *Respuesta del servidor:* \`${forcedResult.error}\`\n` +
          `┃\n` +
          `┃ WhatsApp valida los canales en texto plano y puede bloquear stickers con audio embebido.\n` +
          `┃ Si quieres publicarlo dividido (sticker + audio aparte), vuelve a ejecutarlo añadiendo \`--split\`.\n` +
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
