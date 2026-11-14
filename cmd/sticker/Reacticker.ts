import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const CACHE_DIR = path.resolve(process.cwd(), "data", "reacsticker_cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface StoredStickerData {
  url?: string;
  fileSha256?: string;
  fileEncSha256?: string;
  mediaKey?: string;
  mimetype?: string;
  height?: number;
  width?: number;
  directPath?: string;
  fileLength?: number;
  mediaKeyTimestamp?: number;
  isAnimated?: boolean;
  firstFrameLength?: number;
  firstFrameSidecar?: string;
  isAvatar?: boolean;
  isAiSticker?: boolean;
  isLottie?: boolean;
}

function sanitizeKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function unwrapMessage(message: any): any {
  if (!message || typeof message !== "object") return null;
  if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) return unwrapMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
  if (message.editedMessage?.message) return unwrapMessage(message.editedMessage.message);
  return message;
}

function extractContextInfo(msg: any): any {
  const root = unwrapMessage(msg?.message);
  if (!root) return null;

  for (const key of Object.keys(root)) {
    const content = root[key];
    if (content && typeof content === "object" && content.contextInfo) {
      return content.contextInfo;
    }
  }
  return null;
}

function toBase64IfBinary(val: any): string | undefined {
  if (!val) return undefined;
  if (typeof val === "string") return val;
  if (Buffer.isBuffer(val)) return val.toString("base64");
  if (val instanceof Uint8Array) return Buffer.from(val).toString("base64");
  if (typeof val === "object" && Array.isArray(val.data)) {
    return Buffer.from(val.data).toString("base64");
  }
  if (typeof val === "object") {
    const values = Object.values(val);
    if (values.length > 0 && values.every((n) => typeof n === "number")) {
      return Buffer.from(values as number[]).toString("base64");
    }
  }
  return undefined;
}

function toNumberClean(val: any): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (val && typeof val === "object" && typeof val.low === "number") {
    return val.low >>> 0;
  }
  return undefined;
}

function serializeStickerMessage(raw: any): StoredStickerData {
  const data: StoredStickerData = {
    url: typeof raw.url === "string" ? raw.url : undefined,
    fileSha256: toBase64IfBinary(raw.fileSha256),
    fileEncSha256: toBase64IfBinary(raw.fileEncSha256),
    mediaKey: toBase64IfBinary(raw.mediaKey),
    mimetype: typeof raw.mimetype === "string" ? raw.mimetype : "image/webp",
    height: toNumberClean(raw.height) || 512,
    width: toNumberClean(raw.width) || 512,
    directPath: typeof raw.directPath === "string" ? raw.directPath : undefined,
    fileLength: toNumberClean(raw.fileLength),
    mediaKeyTimestamp: toNumberClean(raw.mediaKeyTimestamp),
    isAnimated: Boolean(raw.isAnimated),
    firstFrameLength: toNumberClean(raw.firstFrameLength),
    firstFrameSidecar: toBase64IfBinary(raw.firstFrameSidecar),
    isAvatar: Boolean(raw.isAvatar),
    isAiSticker: Boolean(raw.isAiSticker),
    isLottie: Boolean(raw.isLottie),
  };

  return data;
}

function hydrateStickerMessage(stored: StoredStickerData): Record<string, any> {
  const hydrated: Record<string, any> = {
    mimetype: stored.mimetype || "image/webp",
    height: stored.height || 512,
    width: stored.width || 512,
    isAnimated: Boolean(stored.isAnimated),
  };

  if (stored.url) hydrated.url = stored.url;
  if (stored.directPath) hydrated.directPath = stored.directPath;
  if (stored.fileSha256) hydrated.fileSha256 = Buffer.from(stored.fileSha256, "base64");
  if (stored.fileEncSha256) hydrated.fileEncSha256 = Buffer.from(stored.fileEncSha256, "base64");
  if (stored.mediaKey) hydrated.mediaKey = Buffer.from(stored.mediaKey, "base64");
  if (typeof stored.fileLength === "number") hydrated.fileLength = stored.fileLength;
  if (typeof stored.mediaKeyTimestamp === "number") hydrated.mediaKeyTimestamp = stored.mediaKeyTimestamp;
  if (typeof stored.firstFrameLength === "number") hydrated.firstFrameLength = stored.firstFrameLength;
  if (stored.firstFrameSidecar) hydrated.firstFrameSidecar = Buffer.from(stored.firstFrameSidecar, "base64");
  if (stored.isAvatar) hydrated.isAvatar = true;
  if (stored.isAiSticker) hydrated.isAiSticker = true;
  if (stored.isLottie) hydrated.isLottie = true;

  return hydrated;
}

function findStickerOnDisk(query: string): { name: string; stickerMessage: Record<string, any> } | null {
  const clean = sanitizeKey(query);
  if (!clean || !fs.existsSync(CACHE_DIR)) return null;

  const exactPath = path.join(CACHE_DIR, `${clean}.json`);
  if (fs.existsSync(exactPath)) {
    const rawJson = JSON.parse(fs.readFileSync(exactPath, "utf8")) as StoredStickerData;
    return { name: clean, stickerMessage: hydrateStickerMessage(rawJson) };
  }

  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const base = file.replace(/\.json$/i, "");
    if (base.includes(clean) || clean.includes(base)) {
      const fullPath = path.join(CACHE_DIR, file);
      const rawJson = JSON.parse(fs.readFileSync(fullPath, "utf8")) as StoredStickerData;
      return { name: base, stickerMessage: hydrateStickerMessage(rawJson) };
    }
  }

  return null;
}

function findDuplicateByHash(sha256B64?: string): string | null {
  if (!sha256B64 || !fs.existsSync(CACHE_DIR)) return null;
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), "utf8")) as StoredStickerData;
      if (content.fileSha256 && content.fileSha256 === sha256B64) {
        return file.replace(/\.json$/i, "");
      }
    } catch {}
  }
  return null;
}

function buildTargetParentKey(sock: any, from: string, msg: any, ctxInfo: any) {
  if (!ctxInfo?.stanzaId) {
    return msg.key;
  }

  const isGroup = from.endsWith("@g.us");
  const rawBotId = sock?.user?.id ? String(sock.user.id).split(":")[0] + "@s.whatsapp.net" : "";
  const rawBotLid = sock?.user?.lid ? String(sock.user.lid).split(":")[0] + "@lid" : "";
  const participant = String(ctxInfo.participant || "");
  const cleanParticipant = participant.includes(":")
    ? participant.split(":")[0] + "@" + participant.split("@")[1]
    : participant;

  const isFromMe = Boolean(
    (rawBotId && (participant === rawBotId || cleanParticipant === rawBotId)) ||
      (rawBotLid && (participant === rawBotLid || cleanParticipant === rawBotLid)),
  );

  const key: Record<string, any> = {
    remoteJid: from,
    fromMe: isFromMe,
    id: String(ctxInfo.stanzaId),
  };

  if (isGroup && participant) {
    key.participant = participant;
  }

  return key;
}

export default {
  name: ["reacsticker", "reacticker", "reactsticker", "rsticker"],
  category: "group",
  description: "Guarda stickers y reacciona con ellos a cualquier mensaje usando asociación nativa.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";
    const sub = String(args[0] || "").toLowerCase();

    try {
      if (sub === "list" || sub === "lista") {
        const files = fs
          .readdirSync(CACHE_DIR)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/i, ""));

        if (!files.length) {
          return reply(
            `📂 No hay stickers guardados.\n• Responde a un sticker con \`${prefix}reacsticker save <nombre>\` para guardarlo.`,
          );
        }

        const listFormatted = files.map((name, idx) => `${idx + 1}. \`${name}\``).join("\n");
        return reply(
          `╭〔 🎯 ${fytBold("Stickers de Reacción")} 〕⬣\n` +
            `${listFormatted}\n` +
            `╰━━━━━━━━━━━━⬣\n` +
            `• Para reaccionar, responde a un mensaje con:\n  \`${prefix}reacticker <nombre>\``,
        );
      }

      if (sub === "del" || sub === "delete" || sub === "rm") {
        const targetName = sanitizeKey(args.slice(1).join(""));
        if (!targetName) {
          return reply(`⚠️ Indica el nombre del sticker a eliminar: \`${prefix}reacsticker del <nombre>\``);
        }
        const targetPath = path.join(CACHE_DIR, `${targetName}.json`);
        if (!fs.existsSync(targetPath)) {
          return reply(`❌ No existe ningún sticker guardado con el nombre \`${targetName}\`.`);
        }
        fs.unlinkSync(targetPath);
        await react("🗑️").catch(() => undefined);
        return reply(`🗑️ Sticker \`${targetName}\` eliminado correctamente.`);
      }

      const ctxInfo = extractContextInfo(msg);
      const quotedRoot = unwrapMessage(ctxInfo?.quotedMessage);

      if (sub === "save" || sub === "guardar") {
        const rawName = args.slice(1).join("");
        const cleanName = sanitizeKey(rawName);

        if (!cleanName) {
          return reply(
            `⚠️ Escribe un nombre para guardar el sticker.\nEjemplo: \`${prefix}reacsticker save gatoxd\``,
          );
        }

        const quotedSticker = quotedRoot?.stickerMessage;
        if (!quotedSticker) {
          return reply(
            `⚠️ Debes responder a un *sticker* con \`${prefix}reacsticker save ${cleanName}\` para guardarlo.`,
          );
        }

        const serialized = serializeStickerMessage(quotedSticker);
        if (!serialized.mediaKey || (!serialized.directPath && !serialized.url)) {
          return reply(`❌ El sticker seleccionado no contiene metadatos válidos de WhatsApp.`);
        }

        const existingDup = findDuplicateByHash(serialized.fileSha256);
        if (existingDup && existingDup !== cleanName) {
          await react("⚠️").catch(() => undefined);
          return reply(
            `⚠️ Ese sticker ya está guardado bajo el nombre \`${existingDup}\`.\nÚsalo respondiendo a un mensaje con: \`${prefix}reacticker ${existingDup}\``,
          );
        }

        const savePath = path.join(CACHE_DIR, `${cleanName}.json`);
        fs.writeFileSync(savePath, JSON.stringify(serialized), "utf8");

        await react("💾").catch(() => undefined);
        return reply(
          `✅ Sticker guardado como \`${cleanName}\`.\n• Responde a cualquier mensaje con \`${prefix}reacticker ${cleanName}\` para reaccionar.`,
        );
      }

      const requestedStickerName = sanitizeKey(args.join(""));

      if (requestedStickerName) {
        if (!ctxInfo?.stanzaId) {
          return reply(
            `⚠️ Responde al mensaje al que quieres reaccionar y escribe:\n\`${prefix}reacticker ${requestedStickerName}\``,
          );
        }

        const found = findStickerOnDisk(requestedStickerName);
        if (!found) {
          return reply(
            `❌ No se encontró el sticker \`${requestedStickerName}\`.\n• Usa \`${prefix}reacsticker list\` para ver los disponibles o guárdalo con \`${prefix}reacsticker save ${requestedStickerName}\`.`,
          );
        }

        const parentMessageKey = buildTargetParentKey(sock, from, msg, ctxInfo);
        const msgId =
          typeof (sock as any).generateMessageTag === "function"
            ? await (sock as any).generateMessageTag()
            : randomUUID();

        await sock.relayMessage(
          from,
          {
            messageContextInfo: {
              messageAssociation: {
                associationType: 11,
                parentMessageKey,
              },
            },
            stickerMessage: found.stickerMessage,
          } as any,
          { messageId: msgId },
        );

        await react("✅").catch(() => undefined);
        return;
      }

      if (quotedRoot?.stickerMessage) {
        const directSticker = hydrateStickerMessage(serializeStickerMessage(quotedRoot.stickerMessage));
        const parentMessageKey = buildTargetParentKey(sock, from, msg, ctxInfo);
        const msgId =
          typeof (sock as any).generateMessageTag === "function"
            ? await (sock as any).generateMessageTag()
            : randomUUID();

        await sock.relayMessage(
          from,
          {
            messageContextInfo: {
              messageAssociation: {
                associationType: 11,
                parentMessageKey,
              },
            },
            stickerMessage: directSticker,
          } as any,
          { messageId: msgId },
        );

        await react("✅").catch(() => undefined);
        return;
      }

      return reply(
        `╭〔 🎯 ${fytBold("Uso de ReacSticker")} 〕⬣\n` +
          `• *Guardar sticker:*\n  Responde a un sticker con \`${prefix}reacsticker save gatoxd\`\n` +
          `• *Reaccionar a un mensaje:*\n  Responde al mensaje con \`${prefix}reacticker gatoxd\`\n` +
          `• *Ver lista:*\n  \`${prefix}reacsticker list\`\n` +
          `• *Eliminar:*\n  \`${prefix}reacsticker del gatoxd\`\n` +
          `╰━━━━━━━━━━━━⬣`,
      );
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ ${fytBold("ReacSticker:")} ${e?.message || String(e)}`).catch(() => undefined);
    }
  },
};
