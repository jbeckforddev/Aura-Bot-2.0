import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useSQLiteAuthState,
  type proto,
} from "baileys";
import { Boom } from "@hapi/boom";
import { LRUCache } from "lru-cache";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  GROUP_METADATA_CACHE,
  getGroupMetadata,
  handleMessage,
  invalidateGroupCache,
} from "../handler.ts";
import { getPlugins } from "../core/cmdLoader.ts";
import {
  handleAntilink,
  handleGroupCall,
  isPrimaryBotForGroup,
} from "../core/groupModeration.ts";
import { db } from "../database/AuraDB.ts";
import {
  claimPremiumToken,
  getPremiumTokens,
  isPremiumTokenValidForAccount,
  releasePremiumTokenReservation,
  reservePremiumToken,
} from "../core/premiumTokens.ts";
import { logInfo, operationLogger } from "../core/logger.ts";
import { resolveBotType } from "../core/botType.ts";
import {
  registerActiveBot,
  unregisterActiveBot,
} from "./activeBotRegistry.ts";
import {
  moveBotSessionDirectory,
  removeBotSessionDirectories,
} from "./sessionStorage.ts";
import type {
  ConnectionOptions,
  ExtendedWASocket,
  GroupCallEvent,
  PremBotLinkRequest,
} from "../types/index";
import {
  getActiveSubBots,
  reconnectSubBot,
  runWithReconnectSlot,
  suspendSubBot,
} from "./subbotManager.ts";

const SESSION_ROOT = globalThis.premBotSession ?? "./sessions/prem";
const LEGACY_SESSION_ROOT = globalThis.subBotSession ?? "./sessions/subs";
const ACTIVE_PREM_BOTS = new Map<string, ExtendedWASocket>();
const PENDING_PREM_REQUESTS = new Map<string, Promise<string>>();
const CONNECTIONS_IN_PROGRESS = new Set<string>();
const RECONNECT_PREM_TIMERS = new Map<string, NodeJS.Timeout>();
const RECONNECT_PREM_ATTEMPTS = new Map<string, number>();
const PREM_BOT_LOGGER = operationLogger.child({ component: "prem-bot" });
const recentMessages = new LRUCache<string, proto.IMessage>({
  max: 1500,
  ttl: 15 * 60 * 1000,
});
const PAIRING_CODE_REQUEST_DELAY_MS = 3000;
const WA_WEB_VERSION_TIMEOUT_MS = 8000;
const WA_WEB_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_RECONNECT_ATTEMPTS = 6;

let waWebVersionPromise: Promise<[number, number, number]> | undefined;
let waWebVersionExpiresAt = 0;

function deleteActivePremBot(
  sessionName: string,
  socket?: ExtendedWASocket,
): void {
  const current = ACTIVE_PREM_BOTS.get(sessionName);
  if (socket && current !== socket) {
    unregisterActiveBot(sessionName, socket);
    return;
  }
  ACTIVE_PREM_BOTS.delete(sessionName);
  if (current) unregisterActiveBot(sessionName, current);
}

function normalizePhone(value: unknown): string {
  const phone = String(value || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
  return phone.length >= 7 && phone.length <= 15 ? phone : "";
}

function sessionNameFor(requester: string, phone?: string): string {
  const fallback =
    normalizePhone(phone) ||
    normalizePhone(requester) ||
    String(requester || "")
      .split("@")[0]
      .split(":")[0]
      .replace(/[^a-zA-Z0-9_-]/g, "");
  return `prem-${fallback || "bot"}`;
}

function withSessionPrefix(sessionName: string, prefix: "prem" | "sub"): string {
  const accountId = sessionName.replace(/^(?:prem|sub)-/i, "");
  return `${prefix}-${accountId}`;
}

function createBoundedCacheStore(max: number, ttl: number) {
  const cache = new LRUCache<string, unknown>({ max, ttl });
  return {
    get: <T>(key: string): T | undefined => cache.get(key) as T | undefined,
    set: <T>(key: string, value: T): void => {
      cache.set(key, value);
    },
    del: (key: string): void => {
      cache.delete(key);
    },
    flushAll: (): void => {
      cache.clear();
    },
  };
}

async function getWebVersion(): Promise<[number, number, number]> {
  if (!waWebVersionPromise || Date.now() >= waWebVersionExpiresAt) {
    waWebVersionExpiresAt = Date.now() + WA_WEB_VERSION_CACHE_TTL_MS;
    let timeout: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `La consulta de versión de WhatsApp Web superó ${WA_WEB_VERSION_TIMEOUT_MS} ms.`,
            ),
          ),
        WA_WEB_VERSION_TIMEOUT_MS,
      );
    });
    waWebVersionPromise = Promise.race([
      fetchLatestWaWebVersion().then(
        ({ version }) => version as [number, number, number],
      ),
      timeoutPromise,
    ])
      .finally(() => clearTimeout(timeout))
      .catch((error) => {
        waWebVersionPromise = undefined;
        waWebVersionExpiresAt = 0;
        throw error;
      });
  }
  return waWebVersionPromise;
}

async function preparePremSession(sessionName: string): Promise<string> {
  await suspendSubBot(withSessionPrefix(sessionName, "sub"));
  const sessionDir = await moveBotSessionDirectory(sessionName, "Prem-Bot", {
    prem: SESSION_ROOT,
    sub: LEGACY_SESSION_ROOT,
  });
  logInfo(`Credenciales premium de ${sessionName}: ${sessionDir}.`, "info");
  return sessionDir;
}

function clearReconnectTimer(sessionName: string): void {
  const timer = RECONNECT_PREM_TIMERS.get(sessionName);
  if (!timer) return;
  clearTimeout(timer);
  RECONNECT_PREM_TIMERS.delete(sessionName);
}

async function safelyDestroySocket(
  socket?: ExtendedWASocket | null,
  reason?: Error,
): Promise<void> {
  if (!socket) return;
  (socket as any).isClosed = true;
  (socket as any).isClosing = true;
  try {
    (socket.ev as any).removeAllListeners();
  } catch (error) {
    logInfo(`No se pudieron quitar los listeners premium: ${String(error)}`, "warn");
  }
  try {
    (socket.ws as any)?.removeAllListeners?.();
    if (socket.ws && (socket.ws as any).readyState !== 3) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1500);
        socket.ws?.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
        try {
          socket.ws?.close();
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
    }
  } catch (error) {
    logInfo(`No se pudo cerrar el WebSocket premium: ${String(error)}`, "warn");
  }
  try {
    await socket.end?.(reason);
  } catch (error) {
    logInfo(`No se pudo finalizar el socket premium: ${String(error)}`, "warn");
  }
  try {
    await (socket as any).closeAuth?.();
  } catch (error) {
    logInfo(`No se pudo cerrar SQLite premium: ${String(error)}`, "warn");
  }
}

async function cleanPremBot(
  sessionName: string,
  targetSocket?: ExtendedWASocket,
): Promise<void> {
  clearReconnectTimer(sessionName);
  CONNECTIONS_IN_PROGRESS.delete(sessionName);
  const current = ACTIVE_PREM_BOTS.get(sessionName);
  const socket = targetSocket ?? current;
  if (targetSocket && current && current !== targetSocket) {
    unregisterActiveBot(sessionName, targetSocket);
    await safelyDestroySocket(targetSocket);
    return;
  }
  deleteActivePremBot(sessionName, socket);
  await safelyDestroySocket(socket);
}

export async function unlinkPremBot(
  sessionName: string,
  targetSocket?: ExtendedWASocket,
  reason = "desvinculado",
): Promise<void> {
  clearReconnectTimer(sessionName);
  RECONNECT_PREM_ATTEMPTS.delete(sessionName);
  CONNECTIONS_IN_PROGRESS.delete(sessionName);
  const socket = targetSocket ?? ACTIVE_PREM_BOTS.get(sessionName);
  deleteActivePremBot(sessionName, socket);
  const botJid = socket?.user?.id ? jidNormalizedUser(socket.user.id) : "";
  await safelyDestroySocket(socket);
  try {
    if (botJid) db.deleteBot(botJid);
    db.deleteBot(sessionName);
  } catch {}
  await removeBotSessionDirectories(sessionName, {
    prem: SESSION_ROOT,
    sub: LEGACY_SESSION_ROOT,
  }).catch(() => undefined);
  logInfo(`Prem-Bot ${sessionName} eliminado. Motivo: ${reason}.`, "warn");
}

function scheduleReconnect(
  sessionName: string,
  options: ConnectionOptions,
): void {
  clearReconnectTimer(sessionName);
  const attempts = (RECONNECT_PREM_ATTEMPTS.get(sessionName) ?? 0) + 1;
  RECONNECT_PREM_ATTEMPTS.set(sessionName, attempts);
  const jitter = Math.floor(Math.random() * 3500) + 1500;
  const delay =
    attempts <= MAX_RECONNECT_ATTEMPTS
      ? Math.min(3000 * Math.pow(1.4, attempts - 1), 25_000) + jitter
      : 3 * 60 * 1000 + jitter;

  logInfo(
    `Reconexión premium ${attempts}/${MAX_RECONNECT_ATTEMPTS} para ${sessionName} en ${Math.ceil(delay / 1000)} s.`,
    "warn",
  );
  const timer = setTimeout(() => {
    RECONNECT_PREM_TIMERS.delete(sessionName);
    void connectPremBot(sessionName, options).catch((error) => {
      logInfo(`Falló la reconexión premium ${sessionName}: ${String(error)}`, "error");
      scheduleReconnect(sessionName, options);
    });
  }, delay);
  timer.unref?.();
  RECONNECT_PREM_TIMERS.set(sessionName, timer);
}

async function connectPremBot(
  sessionName: string,
  options: ConnectionOptions,
): Promise<ExtendedWASocket | null> {
  return runWithReconnectSlot(() => connectPremBotNow(sessionName, options));
}

async function connectPremBotNow(
  sessionName: string,
  options: ConnectionOptions,
): Promise<ExtendedWASocket | null> {
  if (CONNECTIONS_IN_PROGRESS.has(sessionName)) {
    return ACTIVE_PREM_BOTS.get(sessionName) ?? null;
  }
  CONNECTIONS_IN_PROGRESS.add(sessionName);

  const current = ACTIVE_PREM_BOTS.get(sessionName);
  if (current) {
    deleteActivePremBot(sessionName, current);
    await safelyDestroySocket(current);
  }

  let auth: Awaited<ReturnType<typeof useSQLiteAuthState>>;
  let sessionDir: string;
  try {
    sessionDir = await moveBotSessionDirectory(sessionName, "Prem-Bot", {
      prem: SESSION_ROOT,
      sub: LEGACY_SESSION_ROOT,
    });
    await mkdir(sessionDir, { recursive: true });
    auth = await useSQLiteAuthState(sessionDir);
  } catch (error) {
    CONNECTIONS_IN_PROGRESS.delete(sessionName);
    throw error;
  }

  const { state, saveCreds, close } = auth;
  const registered = Boolean(state.creds?.registered || state.creds?.me);
  logInfo("Preparando sesión premium: " + sessionName, "pairing");
  if (!registered && options.allowPairing === false) {
    try {
      close?.();
    } catch {}
    CONNECTIONS_IN_PROGRESS.delete(sessionName);
    return null;
  }

  let version: [number, number, number] | undefined;
  try {
    version = await getWebVersion();
  } catch (error) {
    logInfo(`Baileys usará versión interna para ${sessionName}: ${String(error)}`, "warn");
  }

  const signalCache = createBoundedCacheStore(1500, 5 * 60 * 1000);
  const retryCache = createBoundedCacheStore(500, 3 * 60 * 1000);
  const deviceCache = createBoundedCacheStore(1500, 5 * 60 * 1000);
  let socket: ExtendedWASocket;
  try {
    socket = makeWASocket({
      version: version || [2, 3000, 1042466098],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, PREM_BOT_LOGGER, signalCache),
      },
      msgRetryCounterCache: retryCache,
      userDevicesCache: deviceCache,
      getMessage: async (key) =>
        key?.id ? recentMessages.get(key.id) : undefined,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
      logger: PREM_BOT_LOGGER,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      disableLinkPreviews: true,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 3,
      cachedGroupMetadata: async (jid) => GROUP_METADATA_CACHE.get(jid),
    }) as ExtendedWASocket;
  } catch (error) {
    CONNECTIONS_IN_PROGRESS.delete(sessionName);
    try {
      close?.();
    } catch {}
    throw error;
  }

  socket.isSubBot = true;
  socket.botType = "Sub-Bot";
  socket.sessionName = sessionName;
  socket.subBotId = sessionName;

  let saveTimer: NodeJS.Timeout | null = null;
  let credentialsDirty = false;
  let authStateClosing = false;
  let authStateClosePromise: Promise<void> | null = null;
  let credentialsWriteQueue: Promise<void> = Promise.resolve();

  const persistCredentials = (force = false) => {
    if (!credentialsDirty) return credentialsWriteQueue;
    if (authStateClosing && !force) return credentialsWriteQueue;
    credentialsDirty = false;
    credentialsWriteQueue = credentialsWriteQueue
      .catch(() => {})
      .then(async () => {
        try {
          await saveCreds();
        } catch (error) {
          credentialsDirty = true;
          logInfo(`No se pudieron guardar credenciales premium: ${String(error)}`, "error");
        }
      });
    return credentialsWriteQueue;
  };

  const closeAuth = () => {
    if (authStateClosePromise) return authStateClosePromise;
    authStateClosing = true;
    authStateClosePromise = (async () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      try {
        await persistCredentials(true);
      } catch {}
      try {
        signalCache.flushAll();
        retryCache.flushAll();
        deviceCache.flushAll();
      } catch {}
      try {
        close?.();
      } catch {}
    })();
    return authStateClosePromise;
  };

  (socket as any).closeAuth = closeAuth;
  ACTIVE_PREM_BOTS.set(sessionName, socket);
  registerActiveBot(sessionName, socket);

  // Auto-ACK unhandled WhatsApp status stanzas to prevent error 500: Stream Errored (ack)
  socket.ws?.on("CB:status", async (node: any) => {
    try {
      if (typeof (socket as any).sendMessageAck === "function") {
        await (socket as any).sendMessageAck(node);
      } else if (typeof (socket as any).sendNode === "function") {
        await (socket as any).sendNode({
          tag: "ack",
          attrs: {
            id: node?.attrs?.id,
            to: node?.attrs?.from,
            class: node?.tag || "status",
            ...(node?.attrs?.participant ? { participant: node.attrs.participant } : {}),
            ...(node?.attrs?.type ? { type: node.attrs.type } : {}),
          },
        });
      }
    } catch {}
  });

  socket.ev.on("creds.update", () => {
    if (authStateClosing) return;
    credentialsDirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistCredentials();
    }, 800);
    saveTimer.unref?.();
  });

  let connected = registered;
  let closed = false;
  let pairingCodeRequested = false;
  const knownGroupJids = new LRUCache<string, true>({
    max: 500,
    ttl: 60 * 60 * 1000,
  });

  const pairingTimer = !registered
    ? setTimeout(() => {
        if (connected) return;
        void unlinkPremBot(sessionName, socket, "tiempo de vinculación agotado");
        void options.onPairingExpired?.();
      }, options.pairingTimeoutMs ?? 60_000)
    : undefined;
  pairingTimer?.unref?.();

  socket.ev.on("connection.update", async (update) => {
    if (update.qr && options.pairingMethod === "qr") {
      await options.onQr?.(update.qr);
    }
    if (
      update.qr &&
      !registered &&
      options.pairingMethod === "code" &&
      options.pairingPhone &&
      !pairingCodeRequested
    ) {
      pairingCodeRequested = true;
      try {
        await new Promise((resolve) =>
          setTimeout(resolve, PAIRING_CODE_REQUEST_DELAY_MS),
        );
        if (closed || connected) return;
        const rawCode = await socket.requestPairingCode(
          options.pairingPhone.replace(/\D/g, ""),
        );
        await options.onPairingCode?.(
          rawCode.match(/.{1,4}/g)?.join("-") || rawCode,
        );
      } catch (error) {
        pairingCodeRequested = false;
        await options.onPairingError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    if (update.connection === "open") {
      connected = true;
      CONNECTIONS_IN_PROGRESS.delete(sessionName);
      if (pairingTimer) clearTimeout(pairingTimer);
      RECONNECT_PREM_ATTEMPTS.delete(sessionName);
      const botJid = jidNormalizedUser(socket.user?.id || "");
      const previous = db.getBot(botJid);
      const tokenId = String(
        options.premiumToken ?? previous?.data?.premiumToken ?? "",
      )
        .trim()
        .toLowerCase();
      if (tokenId && options.requesterJid) {
        claimPremiumToken(tokenId, options.requesterJid, botJid);
      }
      const isPremium = Boolean(
        tokenId && isPremiumTokenValidForAccount(tokenId, botJid),
      );
      const botType = isPremium ? "Prem-Bot" : "Sub-Bot";
      socket.botType = botType;
      const userData = socket.user as
        | (typeof socket.user & { lid?: string })
        | undefined;
      let botLid = String(userData?.lid || previous?.lid || "")
        .trim()
        .replace(/@lid$/, "");
      if (!botLid) {
        try {
          botLid = String(
            (await socket.signalRepository?.lidMapping?.getLIDForPN(botJid)) || "",
          )
            .trim()
            .replace(/@lid$/, "");
        } catch {}
      }
      const botId = botLid ? `${botLid}@lid` : botJid;
      const phoneNumber = normalizePhone(botJid);
      const botName = String(
        previous?.bot_name ||
          (socket.user as unknown as Record<string, unknown> | undefined)?.name ||
          (socket.user as unknown as Record<string, unknown> | undefined)?.notify ||
          "",
      ).trim() || null;

      logInfo(
        `${botType} conectado. Cuenta: ${botJid}. Sesión: ${sessionName}.`,
        "success",
      );
      socket.subBotId = botId;
      db.setBot(botJid, {
        bot_id: socket.subBotId,
        bot_name: botName,
        phone_number: phoneNumber,
        lid: botLid ? `${botLid}@lid` : null,
        groups: Array.isArray(previous?.groups) ? previous.groups : [],
        isMain: 0,
        bot_type: botType,
        status: "active",
        sessionName,
        currentBanner: previous?.currentBanner ?? null,
        currentAudio: previous?.currentAudio ?? null,
        data: {
          ...(previous?.data || {}),
          sessionName,
          ...(tokenId ? { premiumToken: tokenId } : {}),
        },
      });
      db.setUser(botJid, {
        jid: botJid,
        lid: botLid ? `${botLid}@lid` : null,
        username: botName,
        pushName: botName,
        phone_number: phoneNumber,
      });
      if (sessionName !== botJid) db.deleteBot(sessionName);
      ACTIVE_PREM_BOTS.set(sessionName, socket);
      registerActiveBot(sessionName, socket);
      db.invalidateBotDbCache(botJid);
      db.invalidateBotDbCache(sessionName);
      await options.onConnected?.(botType);
      return;
    }

    if (update.connection !== "close") return;
    closed = true;
    CONNECTIONS_IN_PROGRESS.delete(sessionName);
    knownGroupJids.clear();
    if (pairingTimer) clearTimeout(pairingTimer);
    const error = update.lastDisconnect?.error;
    const statusCode =
      new Boom(error).output?.statusCode ||
      (error as { statusCode?: number } | undefined)?.statusCode ||
      0;
    const botJid = socket.user?.id ? jidNormalizedUser(socket.user.id) : "";
    logInfo(
      `${sessionName} se desconectó. Código: ${statusCode || "N/A"}. Motivo: ${error?.message || "desconocido"}.`,
      statusCode ? "warn" : "info",
    );
    if (botJid && connected) {
      db.setBot(botJid, { status: "offline" });
      db.invalidateBotDbCache(botJid);
    }
    if (socket.manualLogout) {
      await unlinkPremBot(sessionName, socket, "cierre manual");
      return;
    }

    const currentRegistered = Boolean(state.creds?.registered || state.creds?.me);
    const invalidSession = [
      DisconnectReason.loggedOut,
      DisconnectReason.forbidden,
      DisconnectReason.multideviceMismatch,
    ].includes(statusCode as never);
    const transientDisconnect = [
      DisconnectReason.connectionLost,
      DisconnectReason.connectionClosed,
      DisconnectReason.timedOut,
      DisconnectReason.restartRequired,
      DisconnectReason.badSession,
      500,
      503,
      408,
      428,
      515,
    ].includes(statusCode as never);

    if (!currentRegistered && transientDisconnect) {
      deleteActivePremBot(sessionName, socket);
      await safelyDestroySocket(socket);
      logInfo(
        `Conexión premium interrumpida antes de vincular (${statusCode}); se reintentará automáticamente.`,
        "warn",
      );
      scheduleReconnect(sessionName, options);
      return;
    }

    if (!currentRegistered || invalidSession) {
      await unlinkPremBot(
        sessionName,
        socket,
        `sesión inválida (${statusCode || "N/A"})`,
      );
      await options.onDisconnected?.();
      if (!currentRegistered) {
        await options.onPairingError?.(
          new Error(
            `WhatsApp rechazó la vinculación (código ${statusCode || "desconocido"}). Intenta iniciar una nueva.`,
          ),
        );
      } else {
        await options.onSessionClosed?.(
          statusCode === DisconnectReason.loggedOut
            ? "loggedOut"
            : `desconectado (${statusCode})`,
        );
      }
      return;
    }

    if (statusCode === DisconnectReason.connectionReplaced) {
      logInfo(
        `Sesión premium ${sessionName} fue reemplazada por otra instancia (Código 440). Se suspende la reconexión automática.`,
        "warn",
      );
      deleteActivePremBot(sessionName, socket);
      clearReconnectTimer(sessionName);
      RECONNECT_PREM_ATTEMPTS.delete(sessionName);
      await safelyDestroySocket(socket);
      await options.onDisconnected?.();
      return;
    }

    deleteActivePremBot(sessionName, socket);
    await safelyDestroySocket(socket);
    await options.onDisconnected?.();
    scheduleReconnect(sessionName, options);
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    const isAppend = type === "append";
    if ((type !== "notify" && !isAppend) || !Array.isArray(messages) || messages.length === 0) return;
    if (socket.user?.id) RECONNECT_PREM_ATTEMPTS.delete(sessionName);

    const nowSec = Math.floor(Date.now() / 1000);
    const validMessages = isAppend
      ? messages.filter((m) => {
          const ts = Number(m.messageTimestamp || 0);
          return ts > 0 && nowSec - ts <= 120;
        })
      : messages;

    if (validMessages.length === 0) return;

    for (const message of validMessages) {
      if (message.key?.id && message.message) {
        recentMessages.set(message.key.id, message.message);
      }
    }
    await Promise.allSettled(
      validMessages.map(async (message) => {
        if (!message?.message || (socket as any).isClosed) return;
        try {
          const groupJid = message.key?.remoteJid;
          if (groupJid?.endsWith("@g.us") && !knownGroupJids.has(groupJid)) {
            if (socket.user?.id) db.addBotGroup(socket.user.id, groupJid);
            knownGroupJids.set(groupJid, true);
          }
          await handleMessage(socket, message, "SUB", socket.user?.id || null, [], {
            db,
            config: { prefix: globalThis.DEFAULT_PREFIXES ?? ["."] },
            getPlugins,
            checkAntilink: ({
              sock: messageSock,
              msg: antilinkMessage,
              body,
              isAdmin,
              isOwner,
              isBotAdmin,
            }) =>
              handleAntilink(
                messageSock,
                antilinkMessage,
                body,
                isAdmin,
                isOwner,
                isBotAdmin,
              ),
            logger: {
              message: () => {},
              warn: (payload: unknown) => logInfo(String(payload), "warn"),
              error: (payload: unknown) => logInfo(String(payload), "error"),
              cmdExec: () => {},
            },
          });
        } catch (error) {
          logInfo(`Error procesando mensaje premium: ${String(error)}`, "error");
        }
      }),
    );
  });

  socket.ev.on("call", async (calls: unknown[]) => {
    if (!Array.isArray(calls)) return;
    for (const call of calls) {
      await handleGroupCall(socket, call as GroupCallEvent, db);
    }
  });
  socket.ev.on("groups.update", (updates) => {
    for (const update of updates) {
      if (update.id) invalidateGroupCache(update.id);
    }
  });
  socket.ev.on("group-participants.update", async ({ id, participants, action }) => {
    if (!id) return;
    invalidateGroupCache(id);
    if (
      !Array.isArray(participants) ||
      (action !== "add" && action !== "remove") ||
      !isPrimaryBotForGroup(socket, id, db)
    ) {
      return;
    }
    try {
      const group = db.getGroup(id);
      const enabled = action === "add" ? group.welcome : group.goodbye;
      if (!enabled) return;
      const metadata = await getGroupMetadata(id, socket);
      const groupName = metadata?.subject || group.group_name || id;
      const mentions = participants
        .map((participant: string | { id?: string }) =>
          typeof participant === "string" ? participant : participant.id,
        )
        .filter((participant): participant is string => Boolean(participant));
      if (mentions.length === 0) return;
      const setting = action === "add" ? group.welcomeMessage : group.goodbyeMessage;
      const text = String(setting || (action === "add" ? "Bienvenido/a @user a @group" : "Adiós @user"))
        .replaceAll("@group", groupName)
        .replaceAll("@user", mentions.map((jid) => `@${jid.split("@")[0]}`).join(", "));
      await socket.sendMessage(id, { text, mentions });
    } catch (error) {
      logInfo(`Error de participantes en sesión premium: ${String(error)}`, "error");
    }
  });

  try {
    await options.onSocketCreated?.(socket);
  } finally {
    CONNECTIONS_IN_PROGRESS.delete(sessionName);
  }

  return socket;
}

export async function requestPremBotLink(
  request: PremBotLinkRequest,
): Promise<string> {
  const tokenId = request.token.trim().toLowerCase();
  const token = getPremiumTokens().find((entry) => entry.id === tokenId);
  if (
    !token ||
    (token.expiresAt > 0 && token.expiresAt <= Date.now()) ||
    (token.expiresAt <= 0 && !token.duration && !token.durationMs)
  ) {
    throw new Error("El token premium no existe o ya expiró.");
  }
  if (token.inUse || token.claimedBy) {
    throw new Error("Este token ya fue utilizado por otra instancia.");
  }

  const manualPhone = normalizePhone(request.phoneNumber);
  const requesterPhone = normalizePhone(db.getUser(request.requester)?.phone_number);
  const senderPhone = request.requester.endsWith("@s.whatsapp.net")
    ? normalizePhone(request.requester)
    : "";
  const phone = manualPhone || requesterPhone || senderPhone;
  if (request.method === "code" && !phone) {
    throw new Error("Indica manualmente un número válido con código de país.");
  }
  const sessionName = sessionNameFor(request.requester, phone);
  if (PENDING_PREM_REQUESTS.has(sessionName)) {
    throw new Error("Ya existe una vinculación premium en curso para esta cuenta.");
  }

  reservePremiumToken(tokenId, request.requester);
  const task = (async () => {
    try {
      const active = ACTIVE_PREM_BOTS.get(sessionName);
      if (active) await cleanPremBot(sessionName, active);
      await preparePremSession(sessionName);

      const options: ConnectionOptions = {
        pairingMethod: request.method,
        allowPairing: true,
        pairingPhone: phone,
        botType: "Prem-Bot",
        premiumToken: tokenId,
        requesterJid: request.requester,
        onQr: request.onQr,
        onPairingCode: request.onPairingCode,
        onConnected: request.onConnected,
        onPairingError: async (error) => {
          releasePremiumTokenReservation(tokenId, request.requester);
          await request.onPairingError?.(error);
        },
        onPairingExpired: async () => {
          releasePremiumTokenReservation(tokenId, request.requester);
          await request.onPairingExpired?.();
        },
        onSessionClosed: request.onSessionClosed,
      };
      await connectPremBot(sessionName, options);
      return sessionName;
    } catch (error) {
      releasePremiumTokenReservation(tokenId, request.requester);
      throw error;
    }
  })();
  PENDING_PREM_REQUESTS.set(sessionName, task);
  try {
    return await task;
  } finally {
    PENDING_PREM_REQUESTS.delete(sessionName);
  }
}

export function getActivePremBots(): ExtendedWASocket[] {
  return [...ACTIVE_PREM_BOTS.values()].filter((socket) => {
    const jid = socket.user?.id;
    if (!jid || (socket as any).isClosed) return false;
    const bot = db.getBot(jid);
    const token = String(bot?.data?.premiumToken ?? "");
    return (
      resolveBotType(bot?.bot_type) === "Prem-Bot" &&
      isPremiumTokenValidForAccount(token, jid)
    );
  });
}

async function reconnectPremBot(sessionName: string): Promise<void> {
  const current = ACTIVE_PREM_BOTS.get(sessionName);
  if (!current) return;
  const jid = current.user?.id ? jidNormalizedUser(current.user.id) : "";
  const bot = jid ? db.getBot(jid) : null;
  const premiumToken = String(bot?.data?.premiumToken ?? "");
  const shouldBePremium =
    Boolean(jid) && isPremiumTokenValidForAccount(premiumToken, jid);
  await cleanPremBot(sessionName, current);
  if (!shouldBePremium) {
    const subSessionName = withSessionPrefix(sessionName, "sub");
    if (jid) db.setBot(jid, { bot_type: "Sub-Bot", status: "offline" });
    logInfo(
      `El token de ${sessionName} expiró; se reinicia la sesión como Sub-Bot.`,
      "info",
    );
    try {
      await reconnectSubBot(subSessionName, "Sub-Bot", premiumToken);
    } catch (error) {
      logInfo(
        `No se pudo reconectar ${subSessionName} como Sub-Bot: ${String(error)}`,
        "error",
      );
    }
    return;
  }

  const options: ConnectionOptions = {
    allowPairing: false,
    botType: "Prem-Bot",
    premiumToken,
  };
  try {
    await connectPremBot(sessionName, options);
  } catch (error) {
    logInfo(`No se pudo reconectar ${sessionName}: ${String(error)}`, "error");
    scheduleReconnect(sessionName, options);
  }
}

export async function syncPremiumBotTypes(): Promise<void> {
  for (const [sessionName, socket] of ACTIVE_PREM_BOTS) {
    const jid = socket.user?.id;
    if (!jid) continue;
    const bot = db.getBot(jid);
    const tokenId = String(bot?.data?.premiumToken ?? "");
    const shouldBePremium = isPremiumTokenValidForAccount(tokenId, jid);
    const currentType = resolveBotType(bot?.bot_type);
    const expectedType = shouldBePremium ? "Prem-Bot" : "Sub-Bot";
    if (currentType !== expectedType) await reconnectPremBot(sessionName);
  }

  for (const socket of getActiveSubBots()) {
    const jid = socket.user?.id ? jidNormalizedUser(socket.user.id) : "";
    if (!jid) continue;
    const bot = db.getBot(jid);
    const tokenId = String(bot?.data?.premiumToken ?? "");
    if (!isPremiumTokenValidForAccount(tokenId, jid)) continue;

    const subSessionName = String(
      socket.sessionName ||
        bot?.data?.sessionName ||
        sessionNameFor(jid),
    ).trim();
    const sessionName = withSessionPrefix(subSessionName, "prem");
    await suspendSubBot(subSessionName);
    db.setBot(jid, { status: "offline" });
    const options: ConnectionOptions = {
      allowPairing: false,
      botType: "Prem-Bot",
      premiumToken: tokenId,
    };
    try {
      logInfo(
        `Token ${tokenId} activo para ${sessionName}; se reconecta como Prem-Bot.`,
        "info",
      );
      await connectPremBot(sessionName, options);
    } catch (error) {
      logInfo(
        `No se pudo reconectar ${sessionName} como Prem-Bot: ${String(error)}`,
        "error",
      );
      scheduleReconnect(sessionName, options);
    }
  }
}

export async function startSavedPremBots(): Promise<void> {
  const records = db.getAllBots();
  for (const bot of records) {
    if (bot.isMain || !bot.data?.premiumToken) continue;
    const storedSessionName = String(
      bot.data.sessionName ||
        (bot.phone_number ? sessionNameFor("", bot.phone_number) : ""),
    ).trim();
    if (!storedSessionName) continue;
    const isPremium = isPremiumTokenValidForAccount(
      String(bot.data.premiumToken).trim().toLowerCase(),
      bot.jid,
    );
    const sessionName = withSessionPrefix(
      storedSessionName,
      isPremium ? "prem" : "sub",
    );
    if (ACTIVE_PREM_BOTS.has(sessionName)) continue;

    const tokenId = String(bot.data.premiumToken).trim().toLowerCase();
    const expectedType = isPremium ? "Prem-Bot" : "Sub-Bot";
    if (resolveBotType(bot.bot_type) !== expectedType) {
      db.setBot(bot.jid, { bot_type: expectedType });
    }

    const sessionDir = isPremium
      ? await preparePremSession(sessionName)
      : await moveBotSessionDirectory(sessionName, "Sub-Bot", {
          prem: SESSION_ROOT,
          sub: LEGACY_SESSION_ROOT,
        });
    const sessionDb = path.join(
      sessionDir,
      "session.db",
    );
    if (!existsSync(sessionDb)) {
      logInfo(
        `No se encontraron credenciales premium reutilizables para ${sessionName}; se conserva el registro sin iniciar socket.`,
        "warn",
      );
      continue;
    }

    if (!isPremium) {
      db.setBot(bot.jid, { bot_type: "Sub-Bot" });
      try {
        await reconnectSubBot(sessionName, "Sub-Bot", tokenId);
      } catch (error) {
        logInfo(
          `No se pudo restaurar ${sessionName} como Sub-Bot: ${String(error)}`,
          "error",
        );
      }
      continue;
    }

    try {
      await connectPremBot(sessionName, {
        allowPairing: false,
        botType: expectedType,
        premiumToken: tokenId,
      });
    } catch (error) {
      logInfo(`No se pudo iniciar Prem-Bot guardado ${sessionName}: ${String(error)}`, "error");
    }
  }
}

export function startPremiumExpiryMonitor(): NodeJS.Timeout {
  const timer = setInterval(() => {
    void syncPremiumBotTypes().catch((error) => {
      logInfo(`No se pudo sincronizar el estado premium: ${String(error)}`, "error");
    });
  }, 15_000);
  timer.unref?.();
  return timer;
}
