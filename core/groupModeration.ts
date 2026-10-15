import { readFileSync } from "node:fs";
import { LRUCache } from "lru-cache";
import { fytBold } from "./socketText.ts";
import { getActiveSubBots } from "./subbotManager.ts";
import type { GroupMetadata, proto } from "@whiskeysockets/baileys";
import type {
  ExtendedWASocket,
  IDatabase,
  DatabaseGroup,
  GroupWarnEntry,
  GroupCallEvent,
} from "../types/index.d.ts";
import type { BadWordLevel } from "../types/media.d.ts";
import { t } from "../src/langs/index.ts";

type ToxicMatch = { word: string; reason: string };

const badWordsData = JSON.parse(
  readFileSync(new URL("../database/badWords.json", import.meta.url), "utf8"),
);

const moderationMetaCache = new LRUCache<string, GroupMetadata>({
  max: 200,
  ttl: 45_000,
});

const dateFormatter = new Intl.DateTimeFormat("es-CR", {
  timeZone: "America/Costa_Rica",
});

const prohibitedLinkRegex =
  /(?:chat\.whatsapp\.com|whatsapp\.com\/channel)\/[\w-]+/i;

function getFormattedDate(): string {
  return dateFormatter.format(new Date());
}

function cleanJid(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/:\d+(?=@)/, "");
}

function localPart(jid: string): string {
  return jid.split("@")[0] || "";
}

function getWarnLimit(group: DatabaseGroup): number {
  const fromData = Number(
    (group.data as Record<string, unknown> | undefined)?.warnLimit,
  );
  if (Number.isFinite(fromData) && fromData > 0) return fromData;
  const fromRoot = Number(group.warnLimit);
  if (Number.isFinite(fromRoot) && fromRoot > 0) return fromRoot;
  return 3;
}

function getWarnings(group: DatabaseGroup): Record<string, GroupWarnEntry[]> {
  return group.warns && typeof group.warns === "object" ? group.warns : {};
}

function addWarning(
  db: IDatabase,
  groupJid: string,
  userJid: string,
  reason: string,
  dateStr: string = getFormattedDate(),
): { count: number; warns: Record<string, GroupWarnEntry[]> } {
  const group = db.getGroup(groupJid);
  const warns = getWarnings(group);
  const history = Array.isArray(warns[userJid]) ? [...warns[userJid]] : [];
  history.push({ reason, date: dateStr });
  const updatedWarns = { ...warns, [userJid]: history };
  db.setGroup(groupJid, { warns: updatedWarns });
  return { count: history.length, warns: updatedWarns };
}

export function isPrimaryBotForGroup(
  sock: ExtendedWASocket,
  groupJid: string,
  db: IDatabase,
  primaryBotOverride?: string | null,
  storedBotIdOverride?: string | null,
): boolean {
  const primaryBot = cleanJid(
    primaryBotOverride !== undefined
      ? primaryBotOverride
      : db.getPrimary(groupJid),
  );
  if (!primaryBot) return true;

  const primaryLocal = localPart(primaryBot);
  const botJid = cleanJid(sock.user?.id);
  const storedBotId =
    storedBotIdOverride !== undefined
      ? storedBotIdOverride
      : db.getBot(botJid)?.bot_id;

  const identities = [botJid, sock.subBotId, storedBotId]
    .map(cleanJid)
    .filter(Boolean);

  for (const id of identities) {
    if (id === primaryBot || localPart(id) === primaryLocal) return true;
  }
  return false;
}

function getCandidateSockets(current: ExtendedWASocket): ExtendedWASocket[] {
  const seen = new Set<ExtendedWASocket>();
  const list: ExtendedWASocket[] = [];
  for (const sock of [current, globalThis.mainSocket, ...getActiveSubBots()]) {
    if (sock && typeof sock.groupMetadata === "function" && !seen.has(sock)) {
      seen.add(sock);
      list.push(sock);
    }
  }
  return list;
}

async function fetchGroupMetadataFast(
  groupJid: string,
  sockets: ExtendedWASocket[],
): Promise<GroupMetadata | null> {
  const cached = moderationMetaCache.get(groupJid);
  if (cached) return cached;

  for (const socket of sockets) {
    try {
      const metadata = await socket.groupMetadata(groupJid);
      if (metadata?.participants) {
        moderationMetaCache.set(groupJid, metadata);
        return metadata;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function buildAdminTokenSet(metadata: GroupMetadata | null): Set<string> {
  const admins = new Set<string>();
  if (!metadata?.participants) return admins;

  for (const entry of metadata.participants) {
    if (entry.admin !== "admin" && entry.admin !== "superadmin") continue;
    const rawEntry = entry as unknown as Record<string, unknown>;
    for (const candidate of [
      rawEntry.id,
      rawEntry.lid,
      rawEntry.jid,
      rawEntry.phoneNumber,
    ]) {
      const cleaned = cleanJid(candidate);
      if (cleaned) {
        admins.add(cleaned);
        const local = localPart(cleaned);
        if (local) admins.add(local);
      }
    }
  }
  return admins;
}

async function getAdminSocket(
  current: ExtendedWASocket,
  groupJid: string,
): Promise<ExtendedWASocket | null> {
  const sockets = getCandidateSockets(current);
  const metadata = await fetchGroupMetadataFast(groupJid, sockets);
  if (!metadata) return null;

  const adminTokens = buildAdminTokenSet(metadata);
  if (adminTokens.size === 0) return null;

  for (const socket of sockets) {
    const identities = [
      socket.user?.id,
      (socket.user as unknown as Record<string, unknown>)?.lid,
      socket.subBotId,
    ]
      .map(cleanJid)
      .filter(Boolean);

    for (const id of identities) {
      if (adminTokens.has(id) || adminTokens.has(localPart(id))) {
        return socket;
      }
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

  const metadata = await fetchGroupMetadataFast(
    groupJid,
    getCandidateSockets(current),
  );
  if (!metadata) return false;

  const adminTokens = buildAdminTokenSet(metadata);
  return adminTokens.has(targetJid) || adminTokens.has(localPart(targetJid));
}

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
  ) {
    return false;
  }

  if (!prohibitedLinkRegex.test(text)) return false;

  const userJid = message.key?.participant || message.participant;
  if (!userJid) return false;

  const actionSock = isBotAdmin ? sock : await getAdminSocket(sock, groupJid);
  if (!actionSock) return false;

  try {
    await Promise.allSettled([
      actionSock.sendMessage(groupJid, { delete: message.key }),
      actionSock.groupParticipantsUpdate(groupJid, [userJid], "remove"),
      actionSock.sendMessage(
        groupJid,
        {
          text: `> 🚫 *Anti-Link Activado*\n\nSe ha eliminado el mensaje de *${message.pushName || "Usuario"}* y será expulsado por enviar un enlace de grupo o canal.\n\n⚠️ Los enlaces de grupos y canales no están permitidos.`,
          mentions: [userJid],
        },
        {
          quoted: message as proto.IWebMessageInfo & { key: proto.IMessageKey },
        },
      ),
    ]);
    return true;
  } catch {
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

const singleWordToxicMap = new Map<string, ToxicMatch>();
const multiWordToxicList: ToxicMatch[] = [];

const allToxicEntries: ToxicMatch[] = Object.values(badWordsData.levels)
  .flatMap((level: BadWordLevel) =>
    level.words.map((word: string) => ({
      word: normalizeText(word),
      reason: level.reason,
    })),
  )
  .filter((entry) => entry.word.length > 0)
  .sort((left, right) => right.word.length - left.word.length);

for (const entry of allToxicEntries) {
  if (entry.word.includes(" ")) {
    multiWordToxicList.push(entry);
  } else if (!singleWordToxicMap.has(entry.word)) {
    singleWordToxicMap.set(entry.word, entry);
  }
}

function findToxicMatch(text: string): ToxicMatch | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  if (multiWordToxicList.length > 0 && normalized.includes(" ")) {
    const padded = ` ${normalized} `;
    for (const entry of multiWordToxicList) {
      if (padded.includes(` ${entry.word} `)) return entry;
    }
  }

  const tokens = normalized.split(" ");
  let bestMatch: ToxicMatch | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const match = singleWordToxicMap.get(tokens[i]);
    if (match && (!bestMatch || match.word.length > bestMatch.word.length)) {
      bestMatch = match;
    }
  }

  return bestMatch;
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
  const userJid = message?.key?.participant || message?.participant;

  if (
    !groupJid?.endsWith("@g.us") ||
    !userJid ||
    message.key?.fromMe ||
    isAdmin ||
    !text ||
    text.startsWith(".")
  ) {
    return false;
  }

  const group = db.getGroup(groupJid);
  if (!group.antiToxic) return false;
  if (!isPrimaryBotForGroup(sock, groupJid, db, group.primaryBot)) return false;

  const toxicMatch = findToxicMatch(text);
  if (!toxicMatch) return false;

  const actionSock = isBotAdmin ? sock : await getAdminSocket(sock, groupJid);
  if (!actionSock) return false;

  try {
    const today = getFormattedDate();
    const limit = getWarnLimit(group);
    const { count, warns } = addWarning(
      db,
      groupJid,
      userJid,
      `Toxicidad: ${toxicMatch.reason}`,
      today,
    );

    const tasks: Promise<unknown>[] = [
      actionSock.sendMessage(groupJid, { delete: message.key }),
      actionSock.sendMessage(groupJid, {
        text: `╭〔 ⚠️ ${fytBold(t("core_aura_reed_95dcfb15"))} 〕⬣\n┃ 🚫 ${fytBold(t("core_anti_toxic_system_384ef390"))}\n╰━━━━━━━━━━━━⬣\n\n┃ 👤 Usuario: @${localPart(userJid)}\n┃ 📊 Warns: [ ${count}/${limit} ]\n┃ 🛡️ Admin: ${fytBold(t("core_system_29d43743"))} ⚡\n┃ 📌 Acción: Llamada de atención\n┃ 📝 Razón: ${toxicMatch.reason}\n┃ ⏰ Fecha: ${today}\n\n┣━━━━━━━━━━━━━━━━⬣\n\n┃ ⚠️ Se ha añadido una\n┃ ⚠️ advertencia al usuario.\n┣━━━━━━━━━━━━━━━━⬣\n\n┃ ❗ El mensaje infractor\n┃ ❗ ha sido eliminado.\n\n╰〔 ${fytBold(t("core_system_active_e403484a"))} 〕⬣`,
        mentions: [userJid],
      }),
    ];

    if (count >= limit) {
      db.setGroup(groupJid, { warns: { ...warns, [userJid]: [] } });
      tasks.push(
        actionSock.groupParticipantsUpdate(groupJid, [userJid], "remove"),
      );
    }

    await Promise.allSettled(tasks);
    return true;
  } catch {
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
    !groupJid.endsWith("@g.us") ||
    !call?.id ||
    (call.status && call.status !== "offer")
  ) {
    return;
  }

  const group = db.getGroup(groupJid);
  if (!group.antiCalls) return;
  if (!isPrimaryBotForGroup(sock, groupJid, db, group.primaryBot)) return;

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
    const limit = getWarnLimit(group);
    const { count, warns } = addWarning(
      db,
      groupJid,
      userJid,
      "Intento de llamada en grupo",
    );

    const sockWithReject = sock as unknown as {
      rejectCall?: (id: string, from: string) => Promise<void>;
    };

    const tasks: Promise<unknown>[] = [
      actionSock.sendMessage(groupJid, {
        text: `╭〔 ⚠️ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕⬣\n┃ 🚫 𝐋𝐋𝐀𝐌𝐀𝐃𝐀 𝐍𝐎 𝐏𝐄𝐑𝐌𝐈𝐓𝐈𝐃𝐀\n╰━━━━━━━━━━━━⬣\n\n┃ 👤 Usuario: @${localPart(userJid)}\n┃ 📊 Warns: [ ${count}/${limit} ]\n┃ 🛡️ Razón: Llamada no permitida\n╰〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 〕⬣`,
        mentions: [userJid],
      }),
    ];

    if (typeof sockWithReject.rejectCall === "function") {
      tasks.push(
        sockWithReject.rejectCall(String(call.id), String(call.from || groupJid)),
      );
    }

    if (count >= limit) {
      db.setGroup(groupJid, { warns: { ...warns, [userJid]: [] } });
      tasks.push(
        actionSock.groupParticipantsUpdate(groupJid, [userJid], "remove"),
      );
    }

    await Promise.allSettled(tasks);
  } catch {}
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

  const group = db.getGroup(groupJid);
  if (!group.antiStatus) return false;
  if (!isPrimaryBotForGroup(sock, groupJid, db, group.primaryBot)) return false;

  const statusKey = statusMessage.statusKey || statusMessage.key;
  const userJid =
    statusKey?.participant ||
    message.key?.participant ||
    message.participant ||
    statusKey?.remoteJid;

  if (!userJid || userJid.endsWith("@broadcast") || message.key?.fromMe) {
    return false;
  }

  if (await isGroupAdmin(sock, groupJid, userJid)) return false;

  const actionSock = await getAdminSocket(sock, groupJid);
  if (!actionSock) return false;

  try {
    const limit = getWarnLimit(group);
    const { count, warns } = addWarning(
      db,
      groupJid,
      userJid,
      "Publicar un estado mencionando el grupo",
    );

    const tasks: Promise<unknown>[] = [
      actionSock.sendMessage(groupJid, {
        delete: {
          remoteJid: groupJid,
          id: message.key!.id,
          fromMe: Boolean(message.key!.fromMe),
          ...(message.key!.participant
            ? { participant: message.key!.participant }
            : {}),
        },
      }),
      actionSock.sendMessage(groupJid, {
        text: `╭〔 ⚠️ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕⬣\n┃ 🚫 𝐄𝐒𝐓𝐀𝐃𝐎 𝐍𝐎 𝐏𝐄𝐑𝐌𝐈𝐓𝐈𝐃𝐎\n╰━━━━━━━━━━━━⬣\n\n┃ 👤 Usuario: @${localPart(userJid)}\n┃ 📊 Warns: [ ${count}/${limit} ]\n┃ 🛡️ Razón: Estado mencionando el grupo\n╰〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 〕⬣`,
        mentions: [userJid],
      }),
    ];

    if (count >= limit) {
      db.setGroup(groupJid, { warns: { ...warns, [userJid]: [] } });
      tasks.push(
        actionSock.groupParticipantsUpdate(groupJid, [userJid], "remove"),
      );
    }

    await Promise.allSettled(tasks);
    return true;
  } catch {
    return false;
  }
}
