import {
  generateWAMessageFromContent,
  jidNormalizedUser,
  type proto,
} from "baileys";
import { GROUP_METADATA_CACHE } from "../../handler.ts";
import type { CommandContext } from "../../types/index.d.ts";

export interface PrivateRelayOptions {
  mode?: "include" | "exclude";
  target: string[];
  deviceMode?: "all" | "primary";
  targetMe?: boolean;
  hideDecryptFail?: boolean;
}

function cleanDigits(val: unknown): string {
  return String(val || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

async function resolveGroupTargets(
  sock: any,
  db: any,
  participants: any[],
  rawTargets: string[],
): Promise<Set<string>> {
  const matchedIds = new Set<string>();
  const targetDigits = new Set(rawTargets.map(cleanDigits).filter(Boolean));
  const targetRawSet = new Set(rawTargets.map((t) => t.trim()).filter(Boolean));

  for (const num of targetDigits) {
    try {
      const pnJid = `${num}@s.whatsapp.net`;
      const lid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(pnJid);
      if (lid) {
        targetRawSet.add(String(lid));
        targetDigits.add(cleanDigits(lid));
      }
      const userRec = db?.getUser?.(pnJid);
      if (userRec?.lid) {
        targetRawSet.add(String(userRec.lid));
        targetDigits.add(cleanDigits(userRec.lid));
      }
    } catch {}
  }

  for (const p of participants) {
    const pId = String(p?.id || "");
    const pLid = String(p?.lid || "");
    const pPhone = String(p?.phoneNumber || "");

    const idDigits = cleanDigits(pId);
    const lidDigits = cleanDigits(pLid);
    const phoneDigits = cleanDigits(pPhone);

    if (
      targetRawSet.has(pId) ||
      targetRawSet.has(pLid) ||
      (idDigits && targetDigits.has(idDigits)) ||
      (lidDigits && targetDigits.has(lidDigits)) ||
      (phoneDigits && targetDigits.has(phoneDigits))
    ) {
      if (pId) matchedIds.add(pId);
      if (pLid) matchedIds.add(pLid);
    }
  }

  return matchedIds;
}

export async function sendPrivateRelay(
  sock: any,
  db: any,
  chatJid: string,
  message: proto.IMessage,
  options: PrivateRelayOptions,
): Promise<string> {
  const mode = options.mode ?? "include";
  const metadata = await sock.groupMetadata(chatJid);
  const allParticipants: any[] = metadata?.participants ?? [];

  const targetParticipantIds = await resolveGroupTargets(
    sock,
    db,
    allParticipants,
    options.target,
  );

  if (mode === "include" && targetParticipantIds.size === 0) {
    throw new Error(
      "El usuario o número indicado no fue encontrado dentro de este grupo.",
    );
  }

  const botJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : "";
  const botLid = String(sock.user?.lid || "").replace(/:\d+@/, "@");

  const filteredParticipants = allParticipants.filter((p) => {
    const pId = String(p?.id || "");
    const pLid = String(p?.lid || "");
    const isMe =
      (botJid && (pId === botJid || pLid === botJid)) ||
      (botLid && (pId === botLid || pLid === botLid));

    if (isMe) return options.targetMe ?? true;

    const isMatched =
      targetParticipantIds.has(pId) || (pLid && targetParticipantIds.has(pLid));
    return mode === "include" ? isMatched : !isMatched;
  });

  const previousCache = GROUP_METADATA_CACHE.get(chatJid);
  const keysStore = sock.authState?.keys;
  const origGet = keysStore?.get?.bind(keysStore);
  const origSet = keysStore?.set?.bind(keysStore);

  const ephemeralSenderKeys = new Map<string, any>();
  const ephemeralSenderMemory = new Map<string, any>();

  try {
    GROUP_METADATA_CACHE.set(chatJid, {
      ...metadata,
      participants: filteredParticipants,
    });

    if (keysStore && origGet && origSet) {
      keysStore.get = async (type: string, ids: string[]) => {
        if (type === "sender-key") {
          const res: Record<string, any> = {};
          for (const id of ids) {
            if (ephemeralSenderKeys.has(id)) {
              res[id] = ephemeralSenderKeys.get(id);
            }
          }
          return res;
        }
        if (type === "sender-key-memory") {
          const res: Record<string, any> = {};
          for (const id of ids) {
            if (ephemeralSenderMemory.has(id)) {
              res[id] = ephemeralSenderMemory.get(id);
            }
          }
          return res;
        }
        return origGet(type, ids);
      };

      keysStore.set = async (data: Record<string, Record<string, any>>) => {
        const passThrough: Record<string, Record<string, any>> = {};
        for (const [category, entries] of Object.entries(data || {})) {
          if (category === "sender-key") {
            for (const [k, v] of Object.entries(entries || {})) {
              ephemeralSenderKeys.set(k, v);
            }
          } else if (category === "sender-key-memory") {
            for (const [k, v] of Object.entries(entries || {})) {
              ephemeralSenderMemory.set(k, v);
            }
          } else {
            passThrough[category] = entries;
          }
        }
        if (Object.keys(passThrough).length > 0) {
          await origSet(passThrough);
        }
      };
    }

    const waMsg = generateWAMessageFromContent(chatJid, message, {
      userJid: sock.user?.id || chatJid,
    });

    const msgId = waMsg.key.id!;
    await sock.relayMessage(chatJid, waMsg.message!, {
      messageId: msgId,
      useCachedGroupMetadata: true,
    });

    return msgId;
  } finally {
    if (keysStore && origGet && origSet) {
      keysStore.get = origGet;
      keysStore.set = origSet;
    }
    if (previousCache) {
      GROUP_METADATA_CACHE.set(chatJid, previousCache);
    } else {
      GROUP_METADATA_CACHE.delete(chatJid);
    }
  }
}

export default {
  name: ["privatetest", "solodevice", "relaytest"],
  category: "system",
  description: "Envía un mensaje al grupo que solo puede ser descifrado y visto por el dispositivo del usuario elegido.",
  groupOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, args, reply, react, msg, db } = ctx;

    if (typeof (sock as any).sendPrivateRelay !== "function") {
      (sock as any).sendPrivateRelay = (
        jid: string,
        content: proto.IMessage,
        opts: PrivateRelayOptions,
      ) => sendPrivateRelay(sock, db, jid, content, opts);
    }

    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const mentioned = context?.mentionedJid?.[0];
    const quotedUser = context?.participant;
    const firstArg = args[0] || "";

    const isFirstArgUser =
      /^@?\+?\d{7,15}$/.test(firstArg) ||
      firstArg.endsWith("@s.whatsapp.net") ||
      firstArg.endsWith("@lid");

    const targetRaw = mentioned || quotedUser || (isFirstArgUser ? firstArg : "");

    if (!targetRaw) {
      return reply(
        "Debes indicar un número, mencionar o responder a un usuario del grupo.\n*Ejemplo:* `.privatetest 573118353868 Hola secreto`",
      );
    }

    const cleanTarget = cleanDigits(targetRaw);
    const customText = (isFirstArgUser ? args.slice(1) : args).join(" ").trim();
    const textPayload =
      customText ||
      `🔒 *PRIVATE RELAY:* Este mensaje está cifrado exclusivamente para el dispositivo de @${cleanTarget} y nadie más en el grupo puede verlo.`;

    await react("🕵️").catch(() => undefined);

    try {
      const messageId = await (sock as any).sendPrivateRelay(
        from,
        {
          extendedTextMessage: {
            text: textPayload,
            contextInfo: {
              mentionedJid: [
                targetRaw.includes("@")
                  ? targetRaw
                  : `${cleanTarget}@s.whatsapp.net`,
              ],
            },
          },
        },
        {
          mode: "include",
          target: [targetRaw],
          deviceMode: "all",
          targetMe: true,
          hideDecryptFail: true,
        },
      );

      await react("✅").catch(() => undefined);
      await reply(
        `⚡ *Private Relay enviado*\n• *ID:* \`${messageId}\`\n• *Receptor único:* +${cleanTarget}`,
      );
    } catch (error) {
      await react("❌").catch(() => undefined);
      await reply(
        `Error al enviar Private Relay: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
