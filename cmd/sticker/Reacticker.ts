import fs from "node:fs";
import path from "node:path";
import { BufferJSON, areJidsSameUser, jidNormalizedUser } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const CACHE_DIR = path.resolve(process.cwd(), "data", "reacsticker_cache");
const DEFAULT_BOOM_COUNT = 15;
const MAX_BOOM_LIMIT = 50;
const BURST_DELAY_MS = 110;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const preferredOrder = [
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "stickerMessage",
    "documentMessage",
    "audioMessage",
  ];

  for (const key of preferredOrder) {
    if (root[key]?.contextInfo?.stanzaId) {
      return root[key].contextInfo;
    }
  }

  for (const key of Object.keys(root)) {
    if (key === "messageContextInfo") continue;
    const content = root[key];
    if (content && typeof content === "object" && content.contextInfo?.stanzaId) {
      return content.contextInfo;
    }
  }

  return null;
}

function cleanStickerPayload(quotedSticker: any): Record<string, any> {
  const cloned = JSON.parse(
    JSON.stringify(quotedSticker, BufferJSON.replacer),
    BufferJSON.reviver,
  );

  delete cloned.contextInfo;

  if (!cloned.url && typeof cloned.directPath === "string" && cloned.directPath.startsWith("/")) {
    cloned.url = `https://mmg.whatsapp.net${cloned.directPath}`;
  }

  return cloned;
}

function saveStickerToDisk(name: string, stickerObj: Record<string, any>): void {
  const filePath = path.join(CACHE_DIR, `${name}.json`);
  const serialized = JSON.stringify(stickerObj, BufferJSON.replacer);
  fs.writeFileSync(filePath, serialized, "utf8");
}

function parseStickerFile(fullPath: string): Record<string, any> | null {
  try {
    const raw = fs.readFileSync(fullPath, "utf8");
    const parsed = JSON.parse(raw, BufferJSON.reviver);
    delete parsed.contextInfo;
    if (!parsed.url && typeof parsed.directPath === "string" && parsed.directPath.startsWith("/")) {
      parsed.url = `https://mmg.whatsapp.net${parsed.directPath}`;
    }
    return parsed;
  } catch {
    return null;
  }
}

function loadStickerFromDisk(query: string): { name: string; stickerMessage: Record<string, any> } | null {
  const clean = sanitizeKey(query);
  if (!clean || !fs.existsSync(CACHE_DIR)) return null;

  const exactPath = path.join(CACHE_DIR, `${clean}.json`);
  if (fs.existsSync(exactPath)) {
    const parsed = parseStickerFile(exactPath);
    if (parsed) return { name: clean, stickerMessage: parsed };
  }

  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const base = file.replace(/\.json$/i, "");
    if (base.includes(clean) || clean.includes(base)) {
      const parsed = parseStickerFile(path.join(CACHE_DIR, file));
      if (parsed) return { name: base, stickerMessage: parsed };
    }
  }

  return null;
}

function loadAllStickersFromDisk(): Array<{ name: string; stickerMessage: Record<string, any> }> {
  if (!fs.existsSync(CACHE_DIR)) return [];
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  const list: Array<{ name: string; stickerMessage: Record<string, any> }> = [];

  for (const file of files) {
    const parsed = parseStickerFile(path.join(CACHE_DIR, file));
    if (parsed) {
      list.push({
        name: file.replace(/\.json$/i, ""),
        stickerMessage: parsed,
      });
    }
  }

  return list;
}

function getSha256Hex(stickerObj: any): string {
  const sha = stickerObj?.fileSha256;
  if (!sha) return "";
  if (Buffer.isBuffer(sha)) return sha.toString("hex");
  if (sha instanceof Uint8Array) return Buffer.from(sha).toString("hex");
  return "";
}

function findDuplicateByHash(targetHex: string): string | null {
  if (!targetHex || !fs.existsSync(CACHE_DIR)) return null;
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(CACHE_DIR, file), "utf8");
      const parsed = JSON.parse(raw, BufferJSON.reviver);
      if (getSha256Hex(parsed) === targetHex) {
        return file.replace(/\.json$/i, "");
      }
    } catch {}
  }
  return null;
}

function buildParentMessageKey(sock: any, from: string, msg: any, ctxInfo: any) {
  if (!ctxInfo?.stanzaId) {
    return msg.key;
  }

  const isGroup = from.endsWith("@g.us");
  const rawParticipant = String(ctxInfo.participant || "");
  const normalizedParticipant = rawParticipant ? jidNormalizedUser(rawParticipant) : "";

  const botId = sock?.user?.id ? jidNormalizedUser(sock.user.id) : "";
  const botLid = sock?.user?.lid ? jidNormalizedUser(sock.user.lid) : "";

  const isFromMe = Boolean(
    normalizedParticipant &&
      ((botId && areJidsSameUser(normalizedParticipant, botId)) ||
        (botLid && areJidsSameUser(normalizedParticipant, botLid))),
  );

  const parentKey: Record<string, any> = {
    remoteJid: from,
    fromMe: isFromMe,
    id: String(ctxInfo.stanzaId),
  };

  if (isGroup && normalizedParticipant) {
    parentKey.participant = normalizedParticipant;
  }

  return parentKey;
}

async function sendStickerAssociation(
  sock: any,
  from: string,
  parentMessageKey: Record<string, any>,
  stickerMessage: Record<string, any>,
) {
  await sock.relayMessage(
    from,
    {
      messageContextInfo: {
        messageAssociation: {
          associationType: 11,
          parentMessageKey,
        },
      },
      stickerMessage,
    } as any,
    {},
  );
}

export default {
  name: ["reacsticker", "reacticker", "reactsticker", "rsticker"],
  category: "group",
  description: "Guarda stickers y reacciona con ellos de forma individual o en ráfaga (boom / boom2).",
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
            `• Reacción simple: \`${prefix}reacticker <nombre>\`\n` +
            `• Ráfaga 1 sticker: \`${prefix}reacsticker boom <nombre> [cant]\`\n` +
            `• Ráfaga todos: \`${prefix}reacsticker boom2 [rondas]\``,
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
        const cleanName = sanitizeKey(args.slice(1).join(""));

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

        const stickerPayload = cleanStickerPayload(quotedSticker);
        if (!stickerPayload.mediaKey || (!stickerPayload.directPath && !stickerPayload.url)) {
          return reply(`❌ El sticker seleccionado no contiene metadatos válidos.`);
        }

        const existingDup = findDuplicateByHash(getSha256Hex(stickerPayload));
        if (existingDup && existingDup !== cleanName) {
          saveStickerToDisk(cleanName, stickerPayload);
          await react("💾").catch(() => undefined);
          return reply(
            `✅ Sticker actualizado y guardado como \`${cleanName}\` (también disponible como \`${existingDup}\`).`,
          );
        }

        saveStickerToDisk(cleanName, stickerPayload);
        await react("💾").catch(() => undefined);
        return reply(
          `✅ Sticker guardado como \`${cleanName}\`.\n• Responde a cualquier mensaje con \`${prefix}reacticker ${cleanName}\` o \`${prefix}reacsticker boom ${cleanName}\`.`,
        );
      }

      if (sub === "boom") {
        if (!ctxInfo?.stanzaId) {
          return reply(
            `⚠️ Responde al mensaje que quieres rodear de reacciones y escribe:\n\`${prefix}reacsticker boom <nombre> [cantidad]\``,
          );
        }

        const parentMessageKey = buildParentMessageKey(sock, from, msg, ctxInfo);
        const arg1 = String(args[1] || "").trim();
        const arg2 = String(args[2] || "").trim();

        let count = DEFAULT_BOOM_COUNT;
        let targetSticker: Record<string, any> | null = null;

        if (/^\d+$/.test(arg1)) {
          count = Math.min(MAX_BOOM_LIMIT, Math.max(2, parseInt(arg1, 10)));
        } else if (arg1) {
          const found = loadStickerFromDisk(arg1);
          if (!found) {
            return reply(
              `❌ No se encontró el sticker \`${sanitizeKey(arg1)}\`.\n• Usa \`${prefix}reacsticker list\` para ver tus stickers guardados.`,
            );
          }
          targetSticker = found.stickerMessage;
          if (/^\d+$/.test(arg2)) {
            count = Math.min(MAX_BOOM_LIMIT, Math.max(2, parseInt(arg2, 10)));
          }
        }

        if (!targetSticker) {
          if (quotedRoot?.stickerMessage) {
            targetSticker = cleanStickerPayload(quotedRoot.stickerMessage);
          } else {
            const allSaved = loadAllStickersFromDisk();
            if (!allSaved.length) {
              return reply(
                `❌ No tienes stickers guardados. Guarda uno primero con \`${prefix}reacsticker save <nombre>\`.`,
              );
            }
            targetSticker = allSaved[0].stickerMessage;
          }
        }

        await react("💥").catch(() => undefined);

        for (let i = 0; i < count; i++) {
          await sendStickerAssociation(sock, from, parentMessageKey, targetSticker);
          if (i + 1 < count) {
            await sleep(BURST_DELAY_MS);
          }
        }

        await react("✅").catch(() => undefined);
        return;
      }

      if (sub === "boom2") {
        if (!ctxInfo?.stanzaId) {
          return reply(
            `⚠️ Responde al mensaje al que quieres reaccionar con todos los stickers y escribe:\n\`${prefix}reacsticker boom2 [rondas]\``,
          );
        }

        const allSaved = loadAllStickersFromDisk();
        if (!allSaved.length) {
          return reply(
            `📂 No hay stickers guardados para ejecutar \`boom2\`.\n• Guarda varios con \`${prefix}reacsticker save <nombre>\`.`,
          );
        }

        const parentMessageKey = buildParentMessageKey(sock, from, msg, ctxInfo);
        const roundsArg = parseInt(String(args[1] || "1"), 10);
        const rounds = Number.isFinite(roundsArg) && roundsArg > 0 ? roundsArg : 1;
        const totalToSend = Math.min(MAX_BOOM_LIMIT, allSaved.length * rounds);

        await react("💣").catch(() => undefined);

        for (let i = 0; i < totalToSend; i++) {
          const item = allSaved[i % allSaved.length];
          await sendStickerAssociation(sock, from, parentMessageKey, item.stickerMessage);
          if (i + 1 < totalToSend) {
            await sleep(BURST_DELAY_MS);
          }
        }

        await react("✅").catch(() => undefined);
        return;
      }

      const requestedStickerName = sanitizeKey(args.join(""));

      if (requestedStickerName) {
        const found = loadStickerFromDisk(requestedStickerName);
        if (!found) {
          return reply(
            `❌ No se encontró el sticker \`${requestedStickerName}\`.\n• Usa \`${prefix}reacsticker list\` para ver los disponibles o guárdalo con \`${prefix}reacsticker save ${requestedStickerName}\`.`,
          );
        }

        const parentMessageKey = buildParentMessageKey(sock, from, msg, ctxInfo);
        await sendStickerAssociation(sock, from, parentMessageKey, found.stickerMessage);
        await react("✅").catch(() => undefined);
        return;
      }

      if (quotedRoot?.stickerMessage) {
        const stickerMessage = cleanStickerPayload(quotedRoot.stickerMessage);
        const parentMessageKey = buildParentMessageKey(sock, from, msg, ctxInfo);
        await sendStickerAssociation(sock, from, parentMessageKey, stickerMessage);
        await react("✅").catch(() => undefined);
        return;
      }

      return reply(
        `╭〔 🎯 ${fytBold("Uso de ReacSticker")} 〕⬣\n` +
          `• *Guardar sticker:*\n  Responde a un sticker con \`${prefix}reacsticker save gatoxd\`\n` +
          `• *Reaccionar a un mensaje:*\n  Responde al mensaje con \`${prefix}reacticker gatoxd\`\n` +
          `• *Modo Boom (1 sticker repetido):*\n  Responde al mensaje con \`${prefix}reacsticker boom gatoxd 20\`\n` +
          `• *Modo Boom2 (Todos los guardados):*\n  Responde al mensaje con \`${prefix}reacsticker boom2\`\n` +
          `• *Ver lista / Eliminar:*\n  \`${prefix}reacsticker list\` | \`${prefix}reacsticker del gatoxd\`\n` +
          `╰━━━━━━━━━━━━⬣`,
      );
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ ${fytBold("ReacSticker:")} ${e?.message || String(e)}`).catch(() => undefined);
    }
  },
};
