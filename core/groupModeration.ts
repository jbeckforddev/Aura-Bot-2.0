import { readFileSync } from "node:fs";
import { fytBold } from "./socketText.ts";
import { getActiveSubBots } from "./subbotManager.ts";
import type { proto } from "@whiskeysockets/baileys";
import type {
  ExtendedWASocket,
  IDatabase,
  DatabaseGroup,
  GroupWarnEntry,
  GroupCallEvent,
} from "../types/index.d.ts";
import type { BadWordLevel } from "../types/media.d.ts";

const badWordsData = JSON.parse(
  readFileSync(new URL("../database/badWords.json", import.meta.url), "utf8"),
);

function getWarnings(group: DatabaseGroup): Record<string, GroupWarnEntry[]> {
  return group.warns && typeof group.warns === "object" ? group.warns : {};
}

function addWarning(
  db: IDatabase,
  groupJid: string,
  userJid: string,
  reason: string,
): number {
  const group = db.getGroup(groupJid);
  const warns = getWarnings(group);
  const history = Array.isArray(warns[userJid]) ? warns[userJid] : [];
  history.push({
    reason,
    date: new Date().toLocaleDateString("es-CR", {
      timeZone: "America/Costa_Rica",
    }),
  });
  db.setGroup(groupJid, { warns: { ...warns, [userJid]: history } });
  return history.length;
}

function cleanJid(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/:\d+(?=@)/, "");
}

export function isPrimaryBotForGroup(
  sock: ExtendedWASocket,
  groupJid: string,
  db: IDatabase,
): boolean {
  const primaryBot = cleanJid(db.getPrimary(groupJid));
  if (!primaryBot) return true;

  const botJid = cleanJid(sock.user?.id);
  const storedBot = db.getBot(botJid);
  const identities = [botJid, sock.subBotId, storedBot?.bot_id]
    .map(cleanJid)
    .filter(Boolean);

  return identities.some(
    (identity) =>
      identity === primaryBot ||
      identity.split("@")[0] === primaryBot.split("@")[0],
  );
}

async function getAdminSocket(
  current: ExtendedWASocket,
  groupJid: string,
): Promise<ExtendedWASocket | null> {
  const sockets = [current, globalThis.mainSocket, ...getActiveSubBots()];
  const candidates = sockets.filter(
    (socket, index) =>
      socket?.groupMetadata && sockets.indexOf(socket) === index,
  );

  for (const socket of candidates) {
    try {
      const metadata = await socket.groupMetadata(groupJid);
      const identities = [socket.user?.id, socket.user?.lid, socket.subBotId]
        .map(cleanJid)
        .filter(Boolean);
      const phoneJid = identities.find((jid) =>
        jid.endsWith("@s.whatsapp.net"),
      );
      if (phoneJid) {
        const lid = await socket.signalRepository?.lidMapping
          ?.getLIDForPN(phoneJid)
          .catch(() => "");
        if (lid) identities.push(cleanJid(lid));
      }

      const participant = metadata?.participants?.find((entry) => {
        const e = entry as unknown as Record<string, unknown>;
        return [e?.id, e?.lid, e?.jid, e?.phoneNumber]
          .map(cleanJid)
          .some((jid: string) => jid && identities.includes(jid));
      });
      if (participant?.admin === "admin" || participant?.admin === "superadmin")
        return socket;
    } catch {
      continue;
    }
  }

  return null;
}

async function isGroupAdmin(
  current: ExtendedWASocket,
  groupJid: string,
  userJid: string,
): Promise<boolean> {
  const targetJid = cleanJid(userJid);
  if (!targetJid) return false;

  const sockets = [current, globalThis.mainSocket, ...getActiveSubBots()];
  const candidates = sockets.filter(
    (socket, index) =>
      socket?.groupMetadata && sockets.indexOf(socket) === index,
  );

  for (const socket of candidates) {
    try {
      const metadata = await socket.groupMetadata(groupJid);
      const targetIdentities = new Set([targetJid]);
      if (targetJid.endsWith("@s.whatsapp.net")) {
        try {
          const lid =
            await socket.signalRepository?.lidMapping?.getLIDForPN(targetJid);
          if (lid) targetIdentities.add(cleanJid(lid));
        } catch {
          // La identidad directa todavía permite cotejar la metadata.
        }
      }

      const participant = metadata?.participants?.find((entry) => {
        const e = entry as unknown as Record<string, unknown>;
        return [e?.id, e?.lid, e?.jid, e?.phoneNumber]
          .map(cleanJid)
          .some((jid) => jid && targetIdentities.has(jid));
      });
      if (participant?.admin === "admin" || participant?.admin === "superadmin")
        return true;
    } catch {
      continue;
    }
  }

  return false;
}

type ToxicMatch = { word: string; reason: string };

const prohibitedLinkRegex =
  /(?:https?:\/\/)?(?:www\.)?(?:chat\.whatsapp\.com\/[\w-]+|whatsapp\.com\/channel\/[\w-]+)/i;

export async function handleAntilink(
  sock: ExtendedWASocket,
  message: proto.IWebMessageInfo,
  text: string,
  isAdmin: boolean,
  isOwner: boolean,
  isBotAdmin: boolean,
): Promise<boolean> {
  const groupJid = message?.key?.remoteJid;
  if (
    !groupJid?.endsWith("@g.us") ||
    !text ||
    isAdmin ||
    isOwner ||
    message.key?.fromMe
  )
    return false;
  if (!prohibitedLinkRegex.test(text)) return false;

  const actionSock = isBotAdmin ? sock : await getAdminSocket(sock, groupJid);
  if (!actionSock) return false;

  const userJid = message.key?.participant || message.participant;
  if (!userJid) return false;

  try {
    await actionSock.sendMessage(groupJid, { delete: message.key });
    await actionSock.sendMessage(
      groupJid,
      {
        text: `> 🚫 *Anti-Link Activado*\n\nSe ha eliminado el mensaje de *${message.pushName || "Usuario"}* y será expulsado por enviar un enlace de grupo o canal.\n\n⚠️ Los enlaces de grupos y canales no están permitidos.`,
        mentions: [userJid],
      },
      { quoted: message as proto.IWebMessageInfo & { key: proto.IMessageKey } },
    );
    await actionSock.groupParticipantsUpdate(groupJid, [userJid], "remove");
    console.log(`[ANTILINK] Mensaje eliminado y usuario ${userJid} expulsado.`);
    return true;
  } catch (error) {
    console.error("Error en Anti-Link:", error);
    return false;
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const toxicWords: ToxicMatch[] = Object.values(badWordsData.levels)
  .flatMap((level: BadWordLevel) =>
    level.words.map((word: string) => ({
      word: normalizeText(word),
      reason: level.reason,
    })),
  )
  .sort((left, right) => right.word.length - left.word.length);

function findToxicMatch(text: string): ToxicMatch | null {
  const normalized = normalizeText(text);
  const padded = ` ${normalized} `;
  return toxicWords.find(({ word }) => padded.includes(` ${word} `)) || null;
}

export async function handleGroupToxic(
  sock: ExtendedWASocket,
  message: proto.IWebMessageInfo,
  text: string,
  db: IDatabase,
  isAdmin: boolean,
  isBotAdmin: boolean,
): Promise<boolean> {
  const groupJid = message?.key?.remoteJid;
  const userJid = message?.key?.participant;
  if (
    !groupJid?.endsWith("@g.us") ||
    !isPrimaryBotForGroup(sock, groupJid, db) ||
    !userJid ||
    message.key.fromMe ||
    isAdmin
  )
    return false;
  const group = db.getGroup(groupJid);
  if (!group.antiToxic || !text || text.startsWith(".")) return false;
  const toxicMatch = findToxicMatch(text);
  if (!toxicMatch) return false;

  const actionSock = isBotAdmin ? sock : await getAdminSocket(sock, groupJid);
  if (!actionSock) return false;

  try {
    await actionSock.sendMessage(groupJid, { delete: message.key });
    const count = addWarning(
      db,
      groupJid,
      userJid,
      `Toxicidad: ${toxicMatch.reason}`,
    );
    await actionSock.sendMessage(groupJid, {
      text: `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ 🚫 ${fytBold("ANTI-TOXIC SYSTEM")}\n╰━━━━━━━━━━━━⬣\n\n┃ 👤 Usuario: @${userJid.split("@")[0]}\n┃ 📊 Warns: [ ${count}/${(group.data as Record<string, unknown> | undefined)?.warnLimit || 3} ]\n┃ 🛡️ Admin: ${fytBold("SYSTEM")} ⚡\n┃ 📌 Acción: Llamada de atención\n┃ 📝 Razón: ${toxicMatch.reason}\n┃ ⏰ Fecha: ${new Date().toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" })}\n\n┣━━━━━━━━━━━━━━━━⬣\n\n┃ ⚠️ Se ha añadido una\n┃ ⚠️ advertencia al usuario.\n┣━━━━━━━━━━━━━━━━⬣\n\n┃ ❗ El mensaje infractor\n┃ ❗ ha sido eliminado.\n\n╰〔 ${fytBold("SYSTEM ACTIVE")} 〕⬣`,
      mentions: [userJid],
    });
    if (
      count >=
      Number(
        (group.data as Record<string, unknown> | undefined)?.warnLimit || 3,
      )
    ) {
      await actionSock
        .groupParticipantsUpdate(groupJid, [userJid], "remove")
        .catch(() => undefined);
      db.setGroup(groupJid, {
        warns: { ...getWarnings(db.getGroup(groupJid)), [userJid]: [] },
      });
    }
    return true;
  } catch (error) {
    console.error("Error en Anti-Toxic:", error);
    return false;
  }
}

export async function handleGroupCall(
  sock: ExtendedWASocket,
  call: GroupCallEvent,
  db: IDatabase,
): Promise<void> {
  const groupJid = String(call?.groupJid || call?.chatId || call?.from || "");
  if (
    !groupJid?.endsWith("@g.us") ||
    !call?.id ||
    (call.status && call.status !== "offer")
  )
    return;
  if (!isPrimaryBotForGroup(sock, groupJid, db)) return;

  const group = db.getGroup(groupJid);
  if (!group.antiCalls) return;

  const callParticipants = [
    call.creator,
    call.from,
    (call as Record<string, unknown>).participant,
  ]
    .map((jid) => String(jid || ""))
    .filter((jid) => jid && jid !== groupJid);
  const userJid = callParticipants[0];
  if (!userJid) return;
  for (const participantJid of callParticipants) {
    if (await isGroupAdmin(sock, groupJid, participantJid)) return;
  }

  const actionSock = (await getAdminSocket(sock, groupJid)) || sock;

  try {
    if (
      typeof (
        sock as unknown as {
          rejectCall: (id: string, from: string) => Promise<void>;
        }
      ).rejectCall === "function"
    )
      await (
        sock as unknown as {
          rejectCall: (id: string, from: string) => Promise<void>;
        }
      ).rejectCall(String(call.id), String(call.from || groupJid));
    const count = addWarning(
      db,
      groupJid,
      userJid,
      "Intento de llamada en grupo",
    );
    await actionSock.sendMessage(groupJid, {
      text: `╭〔 ⚠️ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕⬣\n┃ 🚫 𝐋𝐋𝐀𝐌𝐀𝐃𝐀 𝐍𝐎 𝐏𝐄𝐑𝐌𝐈𝐓𝐈𝐃𝐀\n╰━━━━━━━━━━━━⬣\n\n┃ 👤 Usuario: @${userJid.split("@")[0]}\n┃ 📊 Warns: [ ${count}/${(group.data as Record<string, unknown> | undefined)?.warnLimit || 3} ]\n┃ 🛡️ Razón: Llamada no permitida\n╰〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 〕⬣`,
      mentions: [userJid],
    });
    if (
      count >=
      Number(
        (group.data as Record<string, unknown> | undefined)?.warnLimit || 3,
      )
    ) {
      await actionSock
        .groupParticipantsUpdate(groupJid, [userJid], "remove")
        .catch(() => undefined);
      db.setGroup(groupJid, {
        warns: { ...getWarnings(db.getGroup(groupJid)), [userJid]: [] },
      });
    }
  } catch (error) {
    console.error("Error en Anti-Calls:", error);
  }
}

export async function handleGroupStatus(
  sock: ExtendedWASocket,
  message: proto.IWebMessageInfo,
  db: IDatabase,
): Promise<boolean> {
  const statusMessage = (message.message?.groupStatusMentionMessage ||
    message.message?.groupStatusMessageV2) as
    | (proto.Message.IFutureProofMessage & {
        statusKey?: proto.IMessageKey | null;
        key?: proto.IMessageKey | null;
      })
    | undefined;
  if (!statusMessage) return false;

  const groupJid =
    statusMessage.statusKey?.remoteJid || message?.key?.remoteJid || "";
  if (!groupJid.endsWith("@g.us")) return false;
  if (!isPrimaryBotForGroup(sock, groupJid, db)) return false;

  const group = db.getGroup(groupJid);
  if (!group.antiStatus) return false;

  const statusKey = statusMessage.statusKey || statusMessage.key;
  const userJid =
    statusKey?.participant ||
    message.key?.participant ||
    message.participant ||
    statusKey?.remoteJid;
  if (!userJid || userJid.endsWith("@broadcast") || message.key?.fromMe)
    return false;
  if (await isGroupAdmin(sock, groupJid, userJid)) return false;

  const actionSock = await getAdminSocket(sock, groupJid);
  if (!actionSock) return false;

  try {
    await actionSock.sendMessage(groupJid, {
      delete: {
        remoteJid: groupJid,
        id: message.key.id,
        fromMe: Boolean(message.key.fromMe),
        ...(message.key.participant
          ? { participant: message.key.participant }
          : {}),
      },
    });
    const count = addWarning(
      db,
      groupJid,
      userJid,
      "Publicar un estado mencionando el grupo",
    );
    await actionSock.sendMessage(groupJid, {
      text: `╭〔 ⚠️ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕⬣\n┃ 🚫 𝐄𝐒𝐓𝐀𝐃𝐎 𝐍𝐎 𝐏𝐄𝐑𝐌𝐈𝐓𝐈𝐃𝐎\n╰━━━━━━━━━━━━⬣\n\n┃ 👤 Usuario: @${userJid.split("@")[0]}\n┃ 📊 Warns: [ ${count}/${group.warnLimit || 3} ]\n┃ 🛡️ Razón: Estado mencionando el grupo\n╰〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 〕⬣`,
      mentions: [userJid],
    });
    if (count >= (group.warnLimit || 3)) {
      await actionSock
        .groupParticipantsUpdate(groupJid, [userJid], "remove")
        .catch(() => undefined);
      db.setGroup(groupJid, {
        warns: { ...getWarnings(db.getGroup(groupJid)), [userJid]: [] },
      });
    }
    return true;
  } catch (error) {
    console.error("Error en Anti-Status:", error);
    return false;
  }
}
