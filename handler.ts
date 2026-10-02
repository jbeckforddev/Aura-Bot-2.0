import chalk from "chalk";
import { LRUCache } from "lru-cache";
import {
  generateWAMessageFromContent,
  jidNormalizedUser,
  proto,
} from "@whiskeysockets/baileys";
import { cmdLog } from "./core/logger.ts";
import {
  fytBold,
  NOT_CMD_FOUND,
  ERROR_CMD,
  NOT_BOT_ADMIN,
  NOT_BOT_USER,
  NOT_PRIVATE,
  NOT_OWNER,
  NOT_GROUP,
  NOT_ADMIN,
  NOT_MOD,
  NOT_PREMIUM,
  NOT_HAVE_COINS
} from "./core/socketText.ts";
import { db } from "./database/AuraDB.ts";
import {
  handleGroupStatus,
  handleGroupToxic,
  isPrimaryBotForGroup,
} from "./core/groupModeration.ts";
import {
  checkDownloadCoins,
  chargeDownloadCost,
  formatMoney,
  getBotCurrency,
  type DownloadMediaType,
} from "./core/economyConfig.ts";

import type {
  GroupMetadata,
  GroupParticipant,
  WAMessage,
} from "@whiskeysockets/baileys";
import type {
  ExtendedWASocket,
  CommandPlugin,
  ButtonItem,
  OptionSection,
  OptionRow,
  ReplyContent,
  ContactMetadata,
  HandlerConfig,
  HandlerLogger,
  HandlerOptions,
  TopMsgUser,
  DatabaseBot,
  DatabaseUser,
} from "./types/index.d.ts";

export type { ContactMetadata, HandlerConfig, HandlerLogger, HandlerOptions };

function getMessageWeek(date = new Date()): string {
  const current = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((current.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${current.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const groupCache = new LRUCache<string, GroupMetadata>({
  max: 150,
  ttl: 5 * 60 * 1000,
});

const GROUP_METADATA_CACHE = groupCache;

const CONTACT_METADATA_CACHE = new LRUCache<string, ContactMetadata>({
  max: 500,
  ttl: 5 * 60 * 1000,
});

const configuredLidCache = new LRUCache<string, string | null>({
  max: 200,
  ttl: 30 * 60 * 1000,
});

function stripDeviceSuffixFromJid(jid?: string | null): string | null {
  if (!jid || typeof jid !== "string") return null;

  const trimmed = jid.trim();
  if (!trimmed) return null;

  const [localPart] = trimmed.split("@");
  if (!localPart) return null;

  const cleanLocalPart = localPart.split(":")[0];
  if (!cleanLocalPart) return null;

  return cleanLocalPart;
}

function cleanJid(jid = "") {
  if (!jid) return "";

  const raw = String(jid).trim();
  const atIndex = raw.lastIndexOf("@");

  if (atIndex === -1) {
    return raw.split(":")[0];
  }

  const userPart = raw.slice(0, atIndex).split(":")[0];
  const domainPart = raw.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

function createNativeFlowNode() {
  return {
    tag: "biz",
    attrs: {},
    content: [
      {
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [
          {
            tag: "native_flow",
            attrs: { v: "9", name: "mixed" },
          },
        ],
      },
    ],
  };
}

function getPhoneNumberFromJid(jid?: string | null): string | null {
  const localPart = stripDeviceSuffixFromJid(jid);
  if (!localPart || !/^\d+$/.test(localPart)) return null;

  return `+${localPart}`;
}

function normalizeContactMetadata(
  input?: Partial<ContactMetadata> | Record<string, unknown> | null,
): ContactMetadata {
  const data = input as Record<string, unknown> | undefined;
  const jid = (input?.jid ?? data?.id ?? null) as string | null;
  const lid = (input?.lid ?? null) as string | null;
  const user = (input?.user ?? data?.username ?? data?.notify ?? null) as
    string | null;

  const resolvedJid = jid ? jidNormalizedUser(jid) : null;
  const resolvedLid = lid ? jidNormalizedUser(lid) : null;

  const candidatePhoneNumber =
    (typeof input?.phoneNumber === "string" ? input.phoneNumber : null) ??
    getPhoneNumberFromJid(resolvedJid ?? null);

  return {
    user,
    jid: resolvedJid,
    lid: resolvedLid,
    phoneNumber:
      candidatePhoneNumber && candidatePhoneNumber !== "+undefined"
        ? candidatePhoneNumber
        : null,
  };
}

export function buildUserMetadataMap(
  users: Array<Partial<ContactMetadata> | Record<string, unknown>> = [],
): Map<string, ContactMetadata> {
  const map = new Map<string, ContactMetadata>();

  for (const user of users) {
    const meta = normalizeContactMetadata(user);

    if (meta.jid) map.set(meta.jid, meta);
    if (meta.lid) map.set(meta.lid, meta);
  }

  return map;
}

export function resolveUserMetadata(
  input?: Partial<ContactMetadata> | Record<string, unknown> | null,
): ContactMetadata | null {
  if (!input) return null;

  const data = input as Record<string, unknown>;
  const key = (input.jid ?? input.lid ?? data.id ?? null) as string | null;
  if (!key) return normalizeContactMetadata(input);

  const cached = CONTACT_METADATA_CACHE.get(key);
  if (cached) return cached;

  const resolved = normalizeContactMetadata(input);
  CONTACT_METADATA_CACHE.set(key, resolved);
  return resolved;
}

export async function getGroupMetadata(
  jid: string,
  sock: ExtendedWASocket,
): Promise<GroupMetadata | null> {
  const normalizedJid = jidNormalizedUser(jid);
  if (GROUP_METADATA_CACHE.has(normalizedJid)) {
    return GROUP_METADATA_CACHE.get(normalizedJid) ?? null;
  }

  try {
    const metadata = await sock.groupMetadata(normalizedJid);
    GROUP_METADATA_CACHE.set(normalizedJid, metadata);
    return metadata;
  } catch (error) {
    console.error(
      chalk.red(
        `Error al obtener metadata del grupo ${normalizedJid}: ${String(error)}`,
      ),
    );
    return null;
  }
}

export function invalidateGroupCache(groupJid: string) {
  groupCache.delete(groupJid);
  groupCache.delete(jidNormalizedUser(groupJid));
}

async function resolveLid(
  lidJid: string | null | undefined,
  groupMeta: GroupMetadata | null,
  sock: ExtendedWASocket,
) {
  if (!lidJid || !lidJid.endsWith("@lid")) return lidJid;

  const match = groupMeta?.participants?.find(
    (p: GroupParticipant) => cleanJid(p.id || "") === lidJid,
  );
  if (match?.phoneNumber) {
    return cleanJid(match.phoneNumber);
  }

  try {
    const resolved =
      await sock.signalRepository?.lidMapping?.getPNForLID(lidJid);
    if (resolved) return cleanJid(resolved);
  } catch {
    // Ignoramos errores de resolución de LID y devolvemos el valor original.
  }

  return lidJid;
}

async function matchesConfiguredNumber(
  numberList: Array<string | number | null | undefined>,
  senderNum: string,
  rawLid: string,
  sock: ExtendedWASocket,
) {
  if (!Array.isArray(numberList)) return false;

  if (
    numberList.some(
      (num) =>
        cleanJid(String(num ?? "")) === senderNum ||
        String(num ?? "") === senderNum,
    )
  ) {
    return true;
  }

  if (rawLid && rawLid.endsWith("@lid")) {
    for (const num of numberList) {
      const normalizedNum = String(num ?? "").trim();
      if (!normalizedNum) continue;

      let lid = configuredLidCache.get(normalizedNum);
      if (lid === undefined) {
        try {
          const resolved = await sock.signalRepository?.lidMapping?.getLIDForPN(
            `${normalizedNum}@s.whatsapp.net`,
          );
          lid = resolved ? cleanJid(resolved) : null;
        } catch {
          lid = null;
        }
        configuredLidCache.set(normalizedNum, lid);
      }

      if (lid && lid === rawLid) return true;
    }
  }

  return false;
}

export async function handleMessage(
  sock: ExtendedWASocket,
  rawMsg: proto.IWebMessageInfo,
  botLabel = "MAIN",
  mainBotNum: string | null = null,
  activeBotsLive: ExtendedWASocket[] = [],
  runtimeOptions: HandlerOptions = {},
) {
  try {
    const config = {
      prefix: globalThis.DEFAULT_PREFIXES ?? ["."],
      ownerNumber: [],
      coOwners: [],
      ...runtimeOptions.config,
    };

    const logger = {
      message: () => {},
      warn: () => {},
      error: () => {},
      cmdExec: () => {},
      ...runtimeOptions.logger,
    };

    const runtimeDb = runtimeOptions.db ?? db;

    const plugins =
      runtimeOptions.plugins ?? runtimeOptions.getPlugins?.() ?? new Map();
    const prefixes = Array.isArray(config.prefix)
      ? config.prefix
      : [config.prefix];

    const msg = rawMsg;
    const from = msg.key?.remoteJid;
    if (!from) return;
    if (await handleGroupStatus(sock, msg, runtimeDb)) return;
    if (from === "status@broadcast") return;

    const isGroup = from.endsWith("@g.us");
    const participantRaw = isGroup
      ? msg.key?.participant || msg.participant || ""
      : "";
    const participantReal = isGroup ? msg.key?.participant || "" : "";

    let senderJid;
    if (isGroup) {
      senderJid =
        participantRaw.endsWith("@lid") &&
        participantReal &&
        !participantReal.endsWith("@lid")
          ? participantReal
          : participantRaw;
    } else {
      const remoteAlt = msg.key?.remoteJid || "";
      senderJid =
        from.endsWith("@lid") && remoteAlt && !remoteAlt.endsWith("@lid")
          ? remoteAlt
          : from;
    }

    const senderLidJid = senderJid.endsWith("@lid")
      ? senderJid
      : isGroup
        ? participantRaw
        : from.endsWith("@lid")
          ? from
          : "";

    let sender = cleanJid(senderJid);
    const senderLid = cleanJid(senderLidJid);
    const botJid = cleanJid(sock.user?.id || "");
    const botRecord: Partial<DatabaseBot> = runtimeDb.getBot?.(botJid) ?? {};
    const modPrefix = String(botRecord.modPrefix ?? "").trim();

    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.buttonsResponseMessage?.selectedButtonId ||
      msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      (() => {
        const response =
          msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage;
        if (!response?.paramsJson) return "";
        try {
          const params = JSON.parse(response.paramsJson);
          return params.id || params.row_id || params.selected_id || "";
        } catch {
          return "";
        }
      })() ||
      msg.message?.templateButtonReplyMessage?.selectedId ||
      "";

    const msgType = msg.message
      ? (Object.keys(msg.message)[0] ?? "unknown")
      : "unknown";

    const msgTypeLabel =
      msgType === "conversation"
        ? "Texto"
        : msgType === "extendedTextMessage"
          ? "Texto"
          : msgType === "imageMessage"
            ? "🖼️ Imagen"
            : msgType === "videoMessage"
              ? "🎥 Video"
              : msgType === "audioMessage"
                ? "🎵 Audio"
                : msgType === "stickerMessage"
                  ? "🎴 Sticker"
                  : msgType === "documentMessage"
                    ? "📄 Documento"
                    : msgType === "ptvMessage"
                      ? "📹 Nota de video"
                      : msgType === "reactionMessage"
                        ? "🔥 Reacción"
                        : msgType === "contactMessage"
                          ? "👤 Contacto"
                          : msgType === "locationMessage"
                            ? "📍 Ubicación"
                            : msgType === "liveLocationMessage"
                              ? "📍 Ubicación en vivo"
                              : msgType === "pollCreationMessage"
                                ? "📊 Encuesta"
                                : msgType === "pollUpdateMessage"
                                  ? "📊 Actualización de encuesta"
                                  : msgType === "groupInviteMessage"
                                    ? "👥 Invitación a grupo"
                                    : msgType === "statusMentionMessage"
                                      ? "Mension De Estado"
                                      : "Otro";

    const groupPrefix = isGroup ? runtimeDb.getGroup(from)?.prefix : null;
    const activePrefixes = groupPrefix
      ? [groupPrefix]
      : modPrefix
        ? [modPrefix]
        : [...new Set(prefixes.filter(Boolean))].sort(
            (left, right) => right.length - left.length,
          );
    const usedPrefix =
      activePrefixes.find((p: string) => body.startsWith(p)) ?? null;
    const isCmd = !!usedPrefix;
    const isModPrefixCommand = Boolean(
      !groupPrefix && modPrefix && usedPrefix === modPrefix,
    );

    if (msg.key?.fromMe && !isCmd) return;

    const afterPrefix = isCmd ? body.slice(usedPrefix.length).trimStart() : "";
    const cmdName = isCmd ? afterPrefix.split(/\s+/)[0].toLowerCase() : "";
    const rawText = isCmd
      ? afterPrefix.slice(cmdName.length).replace(/^\s/, "")
      : "";
    const args = isCmd
      ? afterPrefix.slice(cmdName.length).trim().split(/\s+/).filter(Boolean)
      : [];
    const text = args.join(" ");

    let groupName = "";
    let groupMeta: GroupMetadata | null = null;

    if (isGroup) {
      if (groupCache.has(from)) {
        groupMeta = groupCache.get(from);
        groupName = groupMeta?.subject || from;
      } else {
        try {
          groupMeta = await sock.groupMetadata(from);
          groupName = groupMeta?.subject || from;
          groupCache.set(from, groupMeta);
        } catch {
          groupName = from;
        }
      }

      const storedGroup = runtimeDb.getGroup(from);
      if (groupName && storedGroup.group_name !== groupName) {
        runtimeDb.setGroup(from, { group_name: groupName });
      }

      const primaryBot = runtimeDb.getPrimary(from);
      if (primaryBot && cmdName !== "delprimary" && cmdName !== "setprimary") {
        const storedBot = runtimeDb.getBot?.(botJid);
        if (!isPrimaryBotForGroup(sock, from, runtimeDb) && isCmd) return;
        if (storedBot?.status !== "active") return;
      }
    }

    const rawSenderLid = sender.endsWith("@lid") ? sender : senderLid || "";

    if (sender.endsWith("@lid")) {
      sender = await resolveLid(sender, groupMeta, sock);
    }

    const senderNum = sender.split("@")[0];

    if (msg.pushName) {
      const currentUser: Partial<DatabaseUser> =
        runtimeDb.getUser?.(sender) ?? {};
      const hasResolvedPhone = !sender.endsWith("@lid");
      const nextContact = {
        jid: hasResolvedPhone ? sender : null,
        lid: senderLid || rawSenderLid || sender,
        username: msg.pushName,
        pushName: msg.pushName,
        phone_number: hasResolvedPhone ? senderNum : null,
      };
      const contactChanged =
        currentUser.username !== nextContact.username ||
        currentUser.pushName !== nextContact.pushName ||
        currentUser.phone_number !== nextContact.phone_number ||
        currentUser.lid !== nextContact.lid;

      if (contactChanged) runtimeDb.setUser?.(sender, nextContact);
    }

    if (isGroup && !msg.key?.fromMe && sender) {
      const groupData = runtimeDb.getGroup(from);
      const currentWeek = getMessageWeek();
      const storedTopMsgUsers = Array.isArray(groupData.topMsgUsers)
        ? (groupData.topMsgUsers as TopMsgUser[])
        : [];
      const topMsgUsers =
        storedTopMsgUsers.length > 0 &&
        storedTopMsgUsers.some((user: TopMsgUser) => user.week !== currentWeek)
          ? []
          : storedTopMsgUsers;
      const currentLid = senderLid || rawSenderLid || null;
      const currentPushName =
        msg.pushName || runtimeDb.getUser?.(sender)?.pushName || "Usuario";
      const entry = topMsgUsers.find(
        (user: TopMsgUser) =>
          (user.jid && user.jid === sender) ||
          (currentLid && user.lid && user.lid === currentLid),
      );

      if (entry) {
        entry.jid = sender;
        entry.lid = currentLid || entry.lid || null;
        entry.pushName = currentPushName;
        entry.week = currentWeek;
        entry.count = Number(entry.count || 0) + 1;
      } else {
        topMsgUsers.push({
          jid: sender,
          lid: currentLid,
          pushName: currentPushName,
          week: currentWeek,
          count: 1,
        });
      }

      runtimeDb.setGroup(from, { topMsgUsers });
    }
    const botUserJid = cleanJid(sock.user?.id || "");
    const storedBot: Partial<DatabaseBot> =
      runtimeDb.getBot?.(botUserJid) ?? botRecord;
    const botIdentities = [
      botUserJid,
      sock.subBotId,
      storedBot.bot_id,
      storedBot.lid ? `${storedBot.lid}@lid` : null,
    ]
      .filter(Boolean)
      .map((identity) => cleanJid(String(identity)));
    const botUserNum = botUserJid.split("@")[0];

    const isBotUser =
      Boolean(msg.key?.fromMe && isCmd) ||
      (!!mainBotNum && senderNum === cleanJid(mainBotNum).split("@")[0]) ||
      senderNum === botUserNum ||
      sender === botJid ||
      botIdentities.includes(sender) ||
      botIdentities.includes(senderLid);

    const configuredOwner = await matchesConfiguredNumber(
      config.ownerNumber ?? [],
      senderNum,
      rawSenderLid,
      sock,
    );
    const configuredCoOwner = await matchesConfiguredNumber(
      config.coOwners ?? [],
      senderNum,
      rawSenderLid,
      sock,
    );
    const isOwner = configuredOwner || runtimeDb.hasRole(sender, "owner");
    const isCoOwner = configuredCoOwner || runtimeDb.hasRole(sender, "coowner");
    const isMod = isOwner || isCoOwner || runtimeDb.hasRole(sender, "mod");
    const isPremium = isMod || runtimeDb.hasRole(senderNum, "premium");

    if (isModPrefixCommand && !isMod && !isBotUser) return;

    let isAdmin = false;
    let isBotAdmin = false;

    if (isGroup && groupMeta?.participants) {
      const botJidClean = cleanJid(botJid);
      let botLidClean = "";
      try {
        const resolvedBotLid =
          await sock.signalRepository?.lidMapping?.getLIDForPN(botJidClean);
        if (resolvedBotLid) botLidClean = cleanJid(resolvedBotLid);
      } catch {
        // Sin LID resoluble, se mantiene sin botLidClean.
      }

      const senderJidClean = cleanJid(sender);

      const matchesParticipant = (
        p: GroupParticipant,
        targetJid: string,
        targetLid: string,
      ) => {
        const pId = cleanJid(p.id);
        const pLid = cleanJid(p.lid || "");
        return (
          pId === targetJid ||
          (targetLid && pId === targetLid) ||
          (targetLid && pLid === targetLid) ||
          pLid === targetJid
        );
      };

      const botParticipant = groupMeta.participants.find(
        (p: GroupParticipant) =>
          matchesParticipant(p, botJidClean, botLidClean),
      );
      const senderParticipant = groupMeta.participants.find(
        (p: GroupParticipant) =>
          matchesParticipant(p, senderJidClean, senderLid),
      );

      isAdmin =
        senderParticipant?.admin === "admin" ||
        senderParticipant?.admin === "superadmin";
      isBotAdmin =
        botParticipant?.admin === "admin" ||
        botParticipant?.admin === "superadmin";
    }

    if (isGroup) {
      const groupData = runtimeDb.getGroup(from);

      // ── Protecciones de seguridad: se evalúan SIEMPRE antes de cualquier
      //    restricción de acceso (self, modSelf, chatBanned, etc.) para que
      //    funcionen incluso cuando el grupo está en modo self o modself. ──
      if (
        isPrimaryBotForGroup(sock, from, runtimeDb) &&
        groupData?.antilink &&
        body &&
        !isAdmin &&
        !isMod &&
        !isCmd &&
        !msg.key?.fromMe
      ) {
        const checkFn = runtimeOptions.checkAntilink;
        if (checkFn) {
          const handled = await checkFn({
            sock,
            msg,
            from,
            sender,
            body,
            isAdmin,
            isOwner,
            isBotAdmin,
            botLabel,
          });
          if (handled) return;
        }
      }

      // ── Restricciones de acceso ──
      const modSelfEnabled = Number(botRecord.modSelf ?? 0) === 1;
      const groupSelfDisabled =
        groupData?.data?.selfConfigured === true && groupData.self === 0;
      if (modSelfEnabled && !groupSelfDisabled && !isBotUser && !isMod) {
        return;
      }

      const isUnbanCommand = [
        "unbanchat",
        "desbanearchat",
        "unmutechat",
      ].includes(cmdName);
      if (groupData?.chatBanned && !isUnbanCommand) return;
      if (groupData?.botOn === 0 && cmdName !== "bot") return;

      if (groupData?.self && !isBotUser && !isMod) return;

      if (groupData?.privateMode && !isOwner && !isCoOwner) {
        return;
      }

      if (groupData?.adminMode && !isAdmin && !isMod) {
        return;
      }

      if (groupData?.onlyAdmin && isCmd && !isAdmin && !isMod && !isBotUser) {
        return;
      }

      if (!isCmd && body) {
        runtimeOptions.handleChatXp?.(sender);
      }
      
      // Verificar si el usuario está silenciado y eliminar su mensaje
      if (
        isGroup &&
        isPrimaryBotForGroup(sock, from, runtimeDb) &&
        !isCmd &&
        !isBotUser &&
        !isMod &&
        !isAdmin
      ) {
        const mutedUsers = groupData?.mutedUsers;

        if (Array.isArray(mutedUsers) && mutedUsers.length > 0) {
          const participantVariants = new Set<string>();
          for (const participant of groupMeta?.participants ?? []) {
            const candidateIds = [participant.id, participant.lid].filter(Boolean) as string[];
            for (const candidate of candidateIds) {
              const cleaned = cleanJid(candidate);
              if (!cleaned) continue;
              const local = cleaned.split("@")[0].split(":")[0];
              participantVariants.add(cleaned);
              participantVariants.add(local);
            }
          }

          const senderVariants = new Set<string>();
          const rawParticipantCandidates = [
            msg.key?.participant,
            msg.participant,
            sender,
            senderLid,
            senderNum,
            sender.split("@")[0],
            senderLid.split("@")[0],
          ];

          for (const candidate of rawParticipantCandidates) {
            const normalized = cleanJid(String(candidate || ""));
            if (normalized) {
              senderVariants.add(normalized);
              senderVariants.add(normalized.split("@")[0]);
            }
          }

          const isMuted = mutedUsers.some((mutedJid: string) => {
            const mutedVariants = new Set<string>();
            for (const candidate of [String(mutedJid || ""), cleanJid(String(mutedJid || "")), String(mutedJid || "").split("@")[0], String(mutedJid || "").split(":")[0]]) {
              if (!candidate) continue;
              const normalized = cleanJid(candidate);
              mutedVariants.add(candidate);
              if (normalized) {
                mutedVariants.add(normalized);
                mutedVariants.add(normalized.split("@")[0]);
              }
            }

            const directHit = Array.from(mutedVariants).some((value) => senderVariants.has(value));
            const rosterHit = Array.from(mutedVariants).some((value) => participantVariants.has(value));
            return directHit || rosterHit;
          });

          if (isMuted) {
            try {
              const messageKey = msg.key;
              if (messageKey && messageKey.id) {
                await sock.sendMessage(from, { delete: messageKey });
              }
              return;
            } catch (deleteError) {
              logger.warn?.(`Error al eliminar mensaje de usuario silenciado: ${String(deleteError)}`);
            }
          }
        }
      }
    }

    const logPayload = {
      from,
      sender,
      isGroup,
      groupName,
      body,
      isCmd,
      cmdName,
      botLabel,
      msgTypeLabel,
    };

    if (isCmd) {
      cmdLog({
        numeroReal: senderNum,
        rango: isOwner
          ? "OWNER"
          : isCoOwner
            ? "CO-OWNER"
            : isMod
              ? "MOD"
              : isAdmin
                ? "ADMIN"
                : "USUARIO",
        commandName: cmdName,
        isGroup,
        text: body,
        jidRemitente: sender,
        pushName: msg.pushName,
        groupMetadata: groupMeta ? { subject: groupName || undefined } : null,
        sock: { isSubBot: Boolean(sock?.isSubBot), subBotId: sock?.subBotId },
      });
    }

    logger.message?.(logPayload);

    const resolvePlugins = runtimeOptions.getPlugins ?? (() => plugins);
    const pluginMap = resolvePlugins();

    if (!isCmd) {
      const hangman = pluginMap.get("ahorcado");
      if (hangman?.handleReply) {
        const reply = async (content: ReplyContent) => {
          const msg2send =
            typeof content === "string" ? { text: content } : content;
          return sock.sendMessage(from, msg2send, {
            quoted: msg as unknown as WAMessage,
          });
        };
        const handled = await hangman.handleReply({
          sock,
          msg,
          from,
          body,
          sender,
          botJid,
          db: runtimeDb,
          usedPrefix: prefixes[0] ?? ".",
          reply,
          react: async (emoji: string) =>
            sock.sendMessage(from, { react: { text: emoji, key: msg.key } }),
        });
        if (handled) return;
      }

      if (
        isGroup &&
        (await handleGroupToxic(
          sock,
          msg,
          body,
          runtimeDb,
          isAdmin,
          isBotAdmin,
        ))
      )
        return;
      return;
    }

    const plugin = pluginMap.get(cmdName);

    if (!plugin) {
      return await sock.sendMessage(
        from,
        { text: `${NOT_CMD_FOUND({ cmdName, prefix: usedPrefix ?? "." })}` },
        { quoted: msg as unknown as WAMessage },
      );
    }

    const ctx = {
      sock,
      db: runtimeDb,
      msg,
      from,
      sender,
      senderNum,
      botJid,
      botLabel,
      mainBotNum,
      activeBotsLive,
      isGroup,
      groupName,
      groupMeta,
      body,
      isCmd,
      cmdName,
      args,
      text,
      rawText,
      usedPrefix,
      modPrefix,
      isOwner,
      isCoOwner,
      isMod,
      isPremium,
      isAdmin,
      isBotAdmin,
      isBotUser,
      resolveLid: (lidJid: string) => resolveLid(lidJid, groupMeta, sock),
      clearGroupCache: () => groupCache.delete(from),
      reply: async (content: ReplyContent) => {
        const sendable =
          typeof content === "string" ? { text: content } : { ...content };
        if (typeof sendable.text === "string") {
          const extra = (sendable as { mentions?: string[] }).mentions || [];
          (sendable as { mentions?: string[] }).mentions = [
            ...new Set([sender, ...extra]),
          ];
        }
        try {
          return await sock.sendMessage(from, sendable, {
            quoted: msg as unknown as WAMessage,
          });
        } catch (e1: unknown) {
          logger.warn?.(
            `[${botLabel}] reply con quoted falló (${e1 instanceof Error ? e1.message : String(e1)}), reintentando sin quoted...`,
          );
          try {
            return await sock.sendMessage(from, sendable);
          } catch (e2: unknown) {
            logger.error?.(
              `[${botLabel}] reply sin quoted también falló: ${e2 instanceof Error ? e2.message : String(e2)} | from: ${from}`,
            );
          }
        }
      },
      react: async (emoji: string) => {
        try {
          return await sock.sendMessage(from, {
            react: { text: emoji, key: msg.key },
          });
        } catch (e: unknown) {
          logger.warn?.(
            `[${botLabel}] react falló: ${e instanceof Error ? e.message : String(e)} | from: ${from}`,
          );
        }
      },
      copy: async (
        text: string,
        copyCode: string,
        buttonText = "📋 Copiar",
        footer?: string,
      ) => {
        try {
          const copyMessage = generateWAMessageFromContent(
            from,
            {
              interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({ text }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: footer || "",
                }),
                nativeFlowMessage:
                  proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    messageParamsJson: JSON.stringify({}),
                    buttons: [
                      {
                        name: "cta_copy",
                        buttonParamsJson: JSON.stringify({
                          id: "copy_code",
                          display_text: buttonText,
                          copy_code: copyCode,
                        }),
                      },
                    ],
                    messageVersion: 2,
                  }),
              }),
            } as proto.IMessage,
            {
              userJid: sock.user?.id || from,
              quoted: msg as unknown as WAMessage,
            },
          );
          return await sock.relayMessage(from, copyMessage.message, {
            messageId: copyMessage.key.id || undefined,
            additionalNodes: [createNativeFlowNode()],
          });
        } catch (e: unknown) {
          logger.warn?.(
            `[${botLabel}] copy falló: ${e instanceof Error ? e.message : String(e) || e} | from: ${from}`,
          );
          return await sock.sendMessage(
            from,
            {
              text: `${text}\n\n🔑 Código: *${copyCode}*`,
              footer: footer || "",
            },
            { quoted: msg as unknown as WAMessage },
          );
        }
      },
      buttons: async (text: string, buttons: ButtonItem[], footer?: string) => {
        try {
          return await sock.sendMessage(from, {
            text,
            footer: footer || "",
            buttons,
            headerType: 1,
          } as Parameters<typeof sock.sendMessage>[1]);
        } catch (e: unknown) {
          logger.warn?.(
            `[${botLabel}] buttons falló: ${e instanceof Error ? e.message : String(e)} | from: ${from}`,
          );
        }
      },
      options: async (
        text: string,
        sections: OptionSection[],
        footer?: string,
        buttonText = "Ver opciones",
        title = "",
      ) => {
        try {
          const interactive = generateWAMessageFromContent(
            from,
            {
              interactiveMessage: proto.Message.InteractiveMessage.create({
                header: proto.Message.InteractiveMessage.Header.create({
                  title,
                  hasMediaAttachment: false,
                }),
                body: proto.Message.InteractiveMessage.Body.create({ text }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: footer || "",
                }),
                nativeFlowMessage:
                  proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    messageParamsJson: JSON.stringify({}),
                    buttons: [
                      {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                          title: buttonText,
                          sections: sections.map((section: OptionSection) => ({
                            title: String(section.title || ""),
                            rows: (Array.isArray(section.rows)
                              ? section.rows
                              : []
                            ).map((row: OptionRow) => ({
                              id: String(row.rowId || ""),
                              title: String(row.title || ""),
                              description: String(row.description || ""),
                            })),
                          })),
                        }),
                      },
                    ],
                    messageVersion: 2,
                  }),
              }),
            } as proto.IMessage,
            {
              userJid: sock.user?.id || from,
              quoted: msg as unknown as WAMessage,
            },
          );
          return await sock.relayMessage(from, interactive.message, {
            messageId: interactive.key.id || undefined,
            additionalNodes: [createNativeFlowNode()],
          });
        } catch (e: unknown) {
          console.error(`[${botLabel}] options falló:`, e);
          return sock.sendMessage(
            from,
            { text: "❌ No pude mostrar las opciones. Inténtalo de nuevo." },
            { quoted: msg as unknown as WAMessage },
          );
        }
      },
      getPlugins: resolvePlugins,
      getPluginCategories: () => [
        ...new Set(
          [...pluginMap.values()]
            .map((item: CommandPlugin) => String(item?.category ?? "").trim())
            .filter(Boolean),
        ),
      ],
    };

    const disabledCategories = isGroup
      ? runtimeDb.getGroup(from)?.catBlocked
      : [];
    const pluginCategory = String(plugin.category ?? "")
      .trim()
      .toLowerCase();
    const isCatalogManager = ["disable", "enable"].includes(cmdName);
    if (
      pluginCategory &&
      !isCatalogManager &&
      Array.isArray(disabledCategories) &&
      disabledCategories.some(
        (category: string) => String(category).toLowerCase() === pluginCategory,
      )
    ) {
      return ctx.reply({
        text: `❌ El catálogo ${fytBold(pluginCategory)} está desactivado para este grupo.`,
      });
    }

    if (plugin.ownerOnly && !isOwner) return ctx.reply({ text: NOT_OWNER() });
    if (plugin.modOnly && !isMod) return ctx.reply({ text: NOT_MOD() });
    if (plugin.botAdmin && isGroup && !isBotAdmin)
      return ctx.reply({ text: NOT_BOT_ADMIN() });
    if (plugin.adminOnly && isGroup && !isAdmin && !isMod)
      return ctx.reply({ text: NOT_ADMIN() });
    if (plugin.premiumOnly && !isPremium)
      return ctx.reply({ text: NOT_PREMIUM() });
    if (plugin.groupOnly && !isGroup) return ctx.reply({ text: NOT_GROUP() });
    if (plugin.privateOnly && isGroup)
      return ctx.reply({ text: NOT_PRIVATE() });
    if (plugin.botUserOnly && !isBotUser)
      return ctx.reply({ text: NOT_BOT_USER() });

    const isDownloadCmd =
      pluginCategory === "download" ||
      ["pin", "pinterest"].includes(cmdName.toLowerCase());

    if (isDownloadCmd) {
      let mediaType: DownloadMediaType = "document";
      const name = cmdName.toLowerCase();

      if (["pin", "pinterest"].includes(name)) {
        mediaType = "image";
      } else if (
        [
          "docplay",
          "docvideo",
          "doctta",
          "docsoundcloud",
          "docspotify",
          "apk",
          "mediafire",
        ].includes(name)
      ) {
        mediaType = "document";
      } else if (["play", "spotify", "soundcloud", "ttaudio"].includes(name)) {
        mediaType = "audio";
      } else if (
        ["play2", "video", "tiktok", "tiktok2", "facebook", "instagram", "x"].includes(
          name,
        )
      ) {
        mediaType = "video";
      }

      const coinCheck = checkDownloadCoins(sender, mediaType);
      (ctx as Record<string, unknown>)._downloadMediaType = mediaType;
      if (!coinCheck.allowed) {
        const currency = getBotCurrency(ctx.botJid);
        const labels: Record<DownloadMediaType, string> = {
          audio: "Audios",
          video: "Videos",
          image: "Imágenes",
          document: "Documentos",
        };
        const requiredAmount = formatMoney(coinCheck.minCost, currency);
        const userBalance = formatMoney(coinCheck.currentBalance, currency);
        const typeMedia = labels[mediaType]
        const minAmount = formatMoney(coinCheck.minCost, currency)
        const currencyName = currency.name

        return ctx.reply({text: NOT_HAVE_COINS({
          typeMedia,
          requiredAmount,
          userBalance,
          minAmount,
          currencyName
        })});
      }
    }

    const start = Date.now();
    try {
      await plugin.run(ctx);
      const downloadState = ctx as Record<string, unknown>;
      if (
        isDownloadCmd &&
        downloadState._downloadSuccess &&
        !downloadState.downloadCharged
      ) {
        chargeDownloadCost(
          sender,
          (downloadState._downloadMediaType as DownloadMediaType) ||
            "document",
          Number(downloadState._downloadSize) || undefined,
        );
        downloadState.downloadCharged = true;
      }
      logger.cmdExec?.({
        cmdName,
        sender: senderNum,
        success: true,
        ms: Date.now() - start,
        botLabel,
      });
      if (isGroup) runtimeOptions.handleCommandXp?.(sender);
    } catch (e: unknown) {
      logger.cmdExec?.({
        cmdName,
        sender: senderNum,
        success: false,
        ms: Date.now() - start,
        botLabel,
      });
      logger.error?.(
        `Comando ${cmdName}: ${e instanceof Error ? e.message : String(e)}`,
      );
      await ctx.react("❌");

      if (
        (e instanceof Error ? e.message : "")
          .toLowerCase()
          .includes("forbidden")
      ) {
        await ctx.reply({ text: NOT_BOT_ADMIN() });
      } else {
        const errorDetails =
          e instanceof Error ? e.stack || e.message : String(e);
        await ctx.reply({ text: ERROR_CMD({ cmdName, errorDetails }) });
      }
    }
  } catch (e: unknown) {
    loggerError(
      runtimeOptions.logger,
      `handleMessage: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function loggerError(log: HandlerLogger | undefined, message: string) {
  log?.error?.(message);
  if (!log?.error) {
    console.error(message);
  }
}
