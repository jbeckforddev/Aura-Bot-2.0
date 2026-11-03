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
import { mkdir, rm } from "node:fs/promises";
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
  registerActiveBot,
  unregisterActiveBot,
} from "./activeBotRegistry.ts";
import {
  moveBotSessionDirectory,
  removeBotSessionDirectories,
} from "./sessionStorage.ts";
import {
  claimPremiumToken,
  isPremiumTokenValidForAccount,
} from "../core/premiumTokens.ts";
import { resolveBotType } from "../core/botType.ts";
import { logInfo, operationLogger } from "../core/logger.ts";
import { t } from "../src/langs/index.ts";
import type {
  ConnectionOptions,
  ExtendedWASocket,
  GroupCallEvent,
  SubBotLinkRequest,
} from "../types/index";

export type LinkRequest = SubBotLinkRequest;

const activeSubBots = new Map<string, ExtendedWASocket>();
const pendingRequests = new Map<string, Promise<string>>();
const connectionsInProgress = new Set<string>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const reconnectAttempts = new Map<string, number>();
const managedReconnects = new Map<string, Promise<void>>();
const subBotLogger = operationLogger.child({ component: "sub-bot" });

// Caché en memoria para mensajes recientes (evita fallos de descifrado y permite retransmisión)
const recentMessagesCache = new LRUCache<string, proto.IMessage>({
  max: 1000,
  ttl: 15 * 60 * 1000,
});

const STARTUP_CONCURRENCY = 2;
const STARTUP_STAGGER_MS = 1500;
const PAIRING_CODE_REQUEST_DELAY_MS = 3000;
const WA_WEB_VERSION_TIMEOUT_MS = 8000;
const MAX_RECONNECT_ATTEMPTS = 5;
const SESSION_ROOT = globalThis.subBotSession ?? "./sessions/subs";
const PREM_SESSION_ROOT = globalThis.premBotSession ?? "./sessions/prem";

function setActiveSubBot(sessionName: string, socket: ExtendedWASocket): void {
  activeSubBots.set(sessionName, socket);
  registerActiveBot(sessionName, socket);
}

function deleteActiveSubBot(
  sessionName: string,
  expectedSocket?: ExtendedWASocket,
): void {
  const socket = activeSubBots.get(sessionName);
  if (expectedSocket && socket !== expectedSocket) {
    unregisterActiveBot(sessionName, expectedSocket);
    return;
  }
  activeSubBots.delete(sessionName);
  if (socket) unregisterActiveBot(sessionName, socket);
}

// Semáforo para escalonar reconexiones y evitar bloqueos '503 Stream Errored' por ráfagas concurrentes en la misma IP
const MAX_CONCURRENT_RECONNECTS = 2;
let activeReconnects = 0;
const reconnectQueue: (() => Promise<void>)[] = [];

function processReconnectQueue() {
  if (activeReconnects >= MAX_CONCURRENT_RECONNECTS || reconnectQueue.length === 0) {
    return;
  }
  const task = reconnectQueue.shift();
  if (!task) return;

  activeReconnects++;
  void task().finally(() => {
    setTimeout(() => {
      activeReconnects--;
      processReconnectQueue();
    }, 1200);
  });
}

function enqueueReconnect(task: () => Promise<void>) {
  reconnectQueue.push(task);
  processReconnectQueue();
}

export function runWithReconnectSlot<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    reconnectQueue.push(async () => {
      try {
        resolve(await task());
      } catch (error) {
        reject(error);
      }
    });
    processReconnectQueue();
  });
}

let waWebVersionPromise: Promise<[number, number, number]> | undefined;

function createBoundedCacheStore(max: number, ttl: number) {
  const cache = new LRUCache<string, any>({ max, ttl });
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

function getSubBotWebVersion() {
  if (!waWebVersionPromise) {
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
        throw error;
      });
  }
  return waWebVersionPromise;
}

function clearReconnectTimer(sessionName: string) {
  const timer = reconnectTimers.get(sessionName);
  if (!timer) return;
  clearTimeout(timer);
  reconnectTimers.delete(sessionName);
}

/**
 * Destruye de forma segura y en el orden correcto un socket.
 * Primero se marcan banderas de cierre, luego eventos y socket WS, y al final se cierra SQLite de forma segura.
 */
async function safelyDestroySocket(
  sock?: ExtendedWASocket | null,
  reason?: Error,
) {
  if (!sock) return;
  (sock as any).isClosed = true;
  (sock as any).isClosing = true;

  try {
    if (sock.ev && typeof sock.ev.removeAllListeners === "function") {
      (sock.ev as any).removeAllListeners();
    }
  } catch {}

  if (sock.ws) {
    try {
      sock.ws.removeAllListeners?.();
      if ((sock.ws as any).readyState !== 3) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 1500);
          sock.ws?.once("close", () => {
            clearTimeout(timeout);
            resolve();
          });
          sock.ws?.close();
        });
      }
    } catch {}
  }

  try {
    await sock.end?.(reason);
  } catch {}

  try {
    await (sock as any).closeAuth?.();
  } catch {}
}

/*
 * Desvincula por completo un subbot de memoria, base de datos y disco de forma atómica.
 */
export async function unlinkSubBot(
  sessionName: string,
  targetSocket?: ExtendedWASocket,
  reason: string = "desvinculado",
) {
  clearReconnectTimer(sessionName);
  reconnectAttempts.delete(sessionName);
  connectionsInProgress.delete(sessionName);

  const socket = targetSocket || activeSubBots.get(sessionName);
  deleteActiveSubBot(sessionName, socket);
  const botJid = socket?.user?.id ? jidNormalizedUser(socket.user.id) : "";

  if (socket) {
    await safelyDestroySocket(socket);
  }

  // Eliminar de la base de datos tanto por JID normalizado como por sessionName
  try {
    if (botJid) db.deleteBot(botJid);
    db.deleteBot(sessionName);
  } catch (err) {
    logInfo(
      `Error eliminando subbot ${sessionName} de la base de datos: ${String(err)}`,
      "error",
    );
  }

  // Eliminar del disco
  try {
    await removeBotSessionDirectories(sessionName, {
      prem: PREM_SESSION_ROOT,
      sub: SESSION_ROOT,
    });
  } catch (error) {
    logInfo(
      `No se pudieron eliminar las credenciales de ${sessionName}: ${String(error)}`,
      "error",
    );
  }

  logInfo(
    `Subbot ${sessionName} desvinculado y purgado completamente. Motivo: ${reason}.`,
    "warn",
  );
}

/*
 * Limpia la instancia en memoria sin necesariamente purgar la sesión de disco/DB (usado en reconexiones).
 */
async function cleanSubBot(sessionName: string, targetSocket?: ExtendedWASocket) {
  clearReconnectTimer(sessionName);
  connectionsInProgress.delete(sessionName);

  const current = activeSubBots.get(sessionName);
  deleteActiveSubBot(sessionName, targetSocket ?? current);
  if (targetSocket && current && current !== targetSocket) {
    await safelyDestroySocket(targetSocket);
    return;
  }
  if (current) {
    await safelyDestroySocket(current);
  }
}

/*
 * Programa reconexiones inteligentes con jitter aleatorio para prevenir tormentas
 * y backoff espaciado en lugar de muerte permanente tras 5 intentos.
 */
function scheduleReconnect(sessionName: string, options: ConnectionOptions) {
  clearReconnectTimer(sessionName);
  const attempts = (reconnectAttempts.get(sessionName) ?? 0) + 1;
  reconnectAttempts.set(sessionName, attempts);

  const jitter = Math.floor(Math.random() * 4000) + 2000;
  let delayMs: number;

  if (attempts <= MAX_RECONNECT_ATTEMPTS) {
    delayMs = Math.min(2500 * attempts, 15000) + jitter;
    logInfo(
      `Reconexión ${attempts}/${MAX_RECONNECT_ATTEMPTS} para ${sessionName} en ${Math.round(delayMs / 1000)}s...`,
      "warn",
    );
  } else {
    // Backoff de fondo: reintenta cada 5 minutos en lugar de rendirse para siempre
    delayMs = 5 * 60 * 1000 + jitter;
    logInfo(
      `${sessionName} superó ${MAX_RECONNECT_ATTEMPTS} intentos rápidos. Reintentando en segundo plano en ${Math.round(delayMs / 60000)} min...`,
      "warn",
    );
  }

  const timer = setTimeout(() => {
    reconnectTimers.delete(sessionName);
    enqueueReconnect(async () => {
      try {
        await connectSubBot(sessionName, options);
      } catch (error) {
        logInfo(
          `Falló la reconexión de ${sessionName}: ${String(error)}`,
          "error",
        );
        scheduleReconnect(sessionName, options);
      }
    });
  }, delayMs);
  timer.unref?.();
  reconnectTimers.set(sessionName, timer);
}

async function connectSubBot(
  sessionName: string,
  options: ConnectionOptions = {},
): Promise<ExtendedWASocket | null | undefined> {
  if (connectionsInProgress.has(sessionName)) {
    logInfo(
      `Ya hay una conexión en curso para ${sessionName}; se reutiliza la instancia activa.`,
      "warn",
    );
    return activeSubBots.get(sessionName);
  }
  connectionsInProgress.add(sessionName);

  let authState: Awaited<ReturnType<typeof useSQLiteAuthState>>;
  let sessionDir: string;
  try {
    sessionDir = await moveBotSessionDirectory(sessionName, "Sub-Bot", {
      prem: PREM_SESSION_ROOT,
      sub: SESSION_ROOT,
    });
    await mkdir(sessionDir, { recursive: true });
    authState = await useSQLiteAuthState(sessionDir);
  } catch (error) {
    connectionsInProgress.delete(sessionName);
    logInfo(
      `No se pudo abrir la sesión ${sessionName}: ${String(error)}`,
      "error",
    );
    throw error;
  }
  logInfo(
    `${options.allowPairing === false ? "Restaurando" : "Iniciando"} sesión ${sessionName} en ${sessionDir}.`,
    "info",
  );

  const { state, saveCreds, close: closeAuthState } = authState;
  const isRegistered = Boolean(state.creds?.registered || state.creds?.me);
  logInfo(
    `Sesión ${sessionName}: ${isRegistered ? "credenciales encontradas" : "requiere vinculación"}.`,
    isRegistered ? "success" : "pairing",
  );

  if (!isRegistered && options.allowPairing === false) {
    logInfo(
      `No hay credenciales válidas para restaurar ${sessionName}; se detiene la conexión automática.`,
      "warn",
    );
    try {
      closeAuthState?.();
    } catch {}
    await rm(sessionDir, { recursive: true, force: true });
    connectionsInProgress.delete(sessionName);
    return null;
  }

  let version: [number, number, number] | undefined;
  try {
    version = await getSubBotWebVersion();
  } catch {
    logInfo(`Se usará la versión interna de Baileys para ${sessionName}.`, "warn");
  }

  const signalKeyCache = createBoundedCacheStore(1500, 5 * 60 * 1000);
  const msgRetryCounterCache = createBoundedCacheStore(500, 3 * 60 * 1000);
  const userDevicesCache = createBoundedCacheStore(1500, 5 * 60 * 1000);

  let socket: ExtendedWASocket;
  try {
    socket = makeWASocket({
      version: version || [2, 3000, 1042466098],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, subBotLogger, signalKeyCache),
      },
      msgRetryCounterCache,
      userDevicesCache,
      getMessage: async (key) => {
        if (!key?.id) return undefined;
        return recentMessagesCache.get(key.id);
      },
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
      logger: subBotLogger,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
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
    connectionsInProgress.delete(sessionName);
    try {
      closeAuthState?.();
    } catch {}
    throw error;
  }

  logInfo(`Socket creado para ${sessionName}.`, "info");
  socket.isSubBot = true;
  socket.botType = "Sub-Bot";
  socket.subBotId = sessionName;
  socket.sessionName = sessionName;
  setActiveSubBot(sessionName, socket);

  try {
    await options.onSocketCreated?.(socket);
  } finally {
    connectionsInProgress.delete(sessionName);
  }

  let connected = isRegistered;
  let pairingExpired = false;
  let pairingCodeRequested = false;
  let connectionClosed = false;
  let pairingTimer: NodeJS.Timeout | undefined;
  const knownGroupJids = new Set<string>();
  try {
    const existingBot = db.getBot(sessionName);
    if (Array.isArray(existingBot?.groups)) {
      for (const g of existingBot.groups) {
        if (g) knownGroupJids.add(g);
      }
    }
  } catch {}
  let saveTimer: NodeJS.Timeout | null = null;
  let credentialsDirty = false;
  let authStateClosing = false;
  let authStateClosePromise: Promise<void> | null = null;
  let credentialsWriteQueue: Promise<void> = Promise.resolve();

  const persistCredentials = () => {
    if (!credentialsDirty) return credentialsWriteQueue;
    credentialsDirty = false;
    credentialsWriteQueue = credentialsWriteQueue
      .catch(() => {})
      .then(async () => {
        try {
          if (!authStateClosing) await saveCreds();
        } catch (error) {
          logInfo(`Error guardando credenciales de ${sessionName}: ${String(error)}`, "error");
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
        await persistCredentials();
      } catch (error) {
        logInfo(`Error guardando credenciales antes de cerrar ${sessionName}: ${String(error)}`, "warn");
      }
      try {
        signalKeyCache.flushAll();
        msgRetryCounterCache.flushAll();
        userDevicesCache.flushAll();
      } catch {}
      try {
        closeAuthState?.();
      } catch (error) {
        logInfo(`Error cerrando auth de ${sessionName}: ${String(error)}`, "warn");
      }
    })();
    return authStateClosePromise;
  };
  (socket as any).closeAuth = closeAuth;

  socket.ev.on("creds.update", () => {
    if (authStateClosing) return;
    credentialsDirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistCredentials();
    }, 500);
    saveTimer.unref?.();
  });

  if (!isRegistered) {
    pairingTimer = setTimeout(() => {
      if (connected) return;
      pairingExpired = true;
      logInfo(
        `Venció el tiempo de vinculación de ${sessionName}.`,
        "warn",
      );
      void (async () => {
        await unlinkSubBot(sessionName, socket, "tiempo de vinculación agotado");
        await options.onPairingExpired?.();
      })();
    }, options.pairingTimeoutMs ?? 60000);
    pairingTimer.unref?.();
  }

  const runtimeLogger = {
    message: () => {},
    warn: (payload: unknown) => logInfo(String(payload), "warn"),
    error: (payload: unknown) => logInfo(String(payload), "error"),
    cmdExec: () => {},
  };

  socket.ev.on("connection.update", async (update) => {
    if (update.qr && (options.pairingMethod ?? "qr") === "qr") {
      logInfo(
        `QR generado para ${sessionName}; entregándolo al solicitante.`,
        "pairing",
      );
      await options.onQr?.(update.qr);
    }

    if (
      update.qr &&
      !isRegistered &&
      options.pairingMethod === "code" &&
      options.pairingPhone &&
      !pairingCodeRequested
    ) {
      pairingCodeRequested = true;
      try {
        logInfo(
          `Esperando ${PAIRING_CODE_REQUEST_DELAY_MS} ms antes de solicitar el código de ${sessionName}.`,
          "info",
        );
        await new Promise((resolve) =>
          setTimeout(resolve, PAIRING_CODE_REQUEST_DELAY_MS),
        );
        if (pairingExpired || connectionClosed || connected) return;
        logInfo(
          `Solicitando código de vinculación para ${sessionName}.`,
          "pairing",
        );
        const rawCode = await socket.requestPairingCode(
          options.pairingPhone.replace(/\D/g, ""),
        );
        logInfo(
          `Código generado para ${sessionName}; entregándolo al solicitante.`,
          "success",
        );
        await options.onPairingCode?.(
          rawCode.match(/.{1,4}/g)?.join("-") || rawCode,
        );
      } catch (error) {
        pairingCodeRequested = false; // Permite reintento si falla la solicitud
        logInfo(
          `Error solicitando el código para ${sessionName}: ${String(error)}`,
          "error",
        );
        await options.onPairingError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    if (update.connection === "open") {
      connected = true;
      if (pairingTimer) clearTimeout(pairingTimer);
      reconnectAttempts.delete(sessionName);
      const botJid = jidNormalizedUser(socket.user?.id || "");
      const previousBot = db.getBot(botJid);
      let botId = String((socket.user as unknown as Record<string, unknown> | undefined)?.lid || "").trim();
      if (!botId) {
        try {
          botId = String(
            (await socket.signalRepository?.lidMapping?.getLIDForPN(botJid)) || "",
          ).trim();
        } catch {}
      }
      const botLid = botId.replace(/@lid$/, "") || null;
      const phoneNumber = botJid.split("@")[0].split(":")[0].replace(/\D/g, "");
      const premiumToken = String(
        options.premiumToken ?? previousBot?.data?.premiumToken ?? "",
      )
        .trim()
        .toLowerCase();
      if (premiumToken && options.requesterJid) {
        claimPremiumToken(premiumToken, options.requesterJid, botJid);
      }
      const botType =
        premiumToken && isPremiumTokenValidForAccount(premiumToken, botJid)
          ? "Prem-Bot"
          : "Sub-Bot";
      socket.botType = botType;
      const hasCustomName = Boolean(
        previousBot?.data?.customBotName && previousBot?.bot_name,
      );
      const botName = hasCustomName
        ? previousBot.bot_name
        : String(
            previousBot?.bot_name ||
              (socket.user as unknown as Record<string, unknown> | undefined)?.name ||
              (socket.user as unknown as Record<string, unknown> | undefined)?.notify ||
              "",
          ).trim() || null;

      socket.subBotId = botLid ? `${botLid}@lid` : botJid;
      db.setBot(botJid, {
        bot_id: socket.subBotId,
        bot_name: botName,
        phone_number: phoneNumber,
        lid: botLid,
        groups: Array.isArray(previousBot?.groups) ? previousBot.groups : [],
        isMain: 0,
        bot_type: botType,
        status: "active",
        sessionName,
        currentBanner: previousBot?.currentBanner ?? null,
        currentAudio: previousBot?.currentAudio ?? null,
        data: {
          ...(previousBot?.data || {}),
          sessionName,
          ...(premiumToken ? { premiumToken } : {}),
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
      logInfo(
        `Usuario ${botName ?? "sin nombre"} (${botJid}) vinculado con éxito como ${botType}. Sesión: ${sessionName}.`,
        "success",
      );
      await options.onConnected?.(botType);
      return;
    }

    if (update.connection !== "close") return;
    connectionClosed = true;
    if (pairingTimer) clearTimeout(pairingTimer);

    await options.onDisconnected?.();
    const error = update.lastDisconnect?.error;
    const statusCode =
      new Boom(error).output?.statusCode ||
      (error as { statusCode?: number } | undefined)?.statusCode ||
      0;
    logInfo(
      `${sessionName} se desconectó. Código: ${statusCode || "N/A"}. Motivo: ${error?.message || "desconocido"}.`,
      statusCode ? "warn" : "info",
    );
    const botJid = socket.user?.id ? jidNormalizedUser(socket.user.id) : "";
    if (botJid && connected) db.setBot(botJid, { status: "offline" });

    // Cierre manual por comando
    if (socket.manualLogout) {
      logInfo(`Cierre manual completado para ${sessionName}.`, "info");
      await unlinkSubBot(sessionName, socket, "cierre manual por comando");
      return;
    }
    if (pairingExpired) return;

    const currentRegistered = Boolean(state.creds?.registered || state.creds?.me);
    const invalidSession = [
      DisconnectReason.loggedOut,
      DisconnectReason.badSession,
      DisconnectReason.forbidden,
      DisconnectReason.multideviceMismatch,
    ].includes(statusCode as never);
    const transientDisconnect = [
      DisconnectReason.connectionLost,
      DisconnectReason.connectionClosed,
      DisconnectReason.timedOut,
      DisconnectReason.restartRequired,
      408,
      428,
      515,
    ].includes(statusCode as never);

    if (!currentRegistered && transientDisconnect) {
      logInfo(
        `Conexión de ${sessionName} interrumpida antes de vincular (${statusCode}); se reintentará automáticamente.`,
        "warn",
      );
      deleteActiveSubBot(sessionName, socket);
      await safelyDestroySocket(socket);
      scheduleReconnect(sessionName, options);
      return;
    }

    if (!currentRegistered || invalidSession) {
      await unlinkSubBot(
        sessionName,
        socket,
        `sesión inválida o expirada (Código: ${statusCode || "N/A"})`,
      );
      if (!currentRegistered) {
        await options.onPairingExpired?.();
      } else if (connected) {
        await options.onSessionClosed?.(
          statusCode === DisconnectReason.loggedOut
            ? "loggedOut"
            : `desconectado (${statusCode || "sin estado"})`,
        );
      } else {
        await options.onPairingError?.(
          new Error(`Sesión de subbot inválida (${statusCode || "sin estado"}).`),
        );
      }
      return;
    }

    if (statusCode === DisconnectReason.connectionReplaced) {
      logInfo(
        `Sesión ${sessionName} fue reemplazada por otra instancia o cliente externo (Código 440). Se suspende la reconexión automática para evitar conflicto en bucle.`,
        "warn",
      );
      deleteActiveSubBot(sessionName, socket);
      clearReconnectTimer(sessionName);
      reconnectAttempts.delete(sessionName);
      await safelyDestroySocket(socket);
      return;
    }

    // Desconexión transitoria: limpiar el socket de forma segura y reconectar
    deleteActiveSubBot(sessionName, socket);
    await safelyDestroySocket(socket);
    scheduleReconnect(sessionName, options);
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !Array.isArray(messages) || messages.length === 0) return;
    if (socket.user?.id) reconnectAttempts.delete(sessionName);

    // Guardar mensajes entrantes en caché para soporte de reenvío/descifrado
    messages.forEach((msg) => {
      if (msg.key?.id && msg.message) {
        recentMessagesCache.set(msg.key.id, msg.message);
      }
    });

    await Promise.allSettled(
      messages.map(async (message) => {
        if (!message?.message) return;
        if ((socket as any).isClosed) return;

        try {
          const groupJid = message.key?.remoteJid;
          if (groupJid?.endsWith("@g.us") && !knownGroupJids.has(groupJid)) {
            if (socket.user?.id) db.addBotGroup(socket.user.id, groupJid);
            knownGroupJids.add(groupJid);
          }
          await handleMessage(
            socket,
            message,
            "SUB",
            socket.user?.id || null,
            [],
            {
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
              logger: runtimeLogger,
            },
          );
        } catch (error) {
          logInfo(`Error procesando mensaje de ${sessionName}: ${String(error)}`, "error");
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
      const setting = action === "add" ? "welcome" : "goodbye";
      if (!group[setting]) return;
      const metadata = await getGroupMetadata(id, socket);
      const groupName = metadata?.subject || group.group_name || id;
      const participantJids = participants
        .map((participant: string | { id?: string }) =>
          typeof participant === "string" ? participant : participant?.id,
        )
        .filter((participant): participant is string => Boolean(participant));
      if (participantJids.length === 0) return;
      const defaultTemplate = action === "add"
        ? `╭〔 👋 𝐁𝐈𝐄𝐍𝐕𝐄𝐍𝐈𝐃𝐎/𝐀 〕⬣\n┃ ✨ 𝐀 𝐔𝐍 𝐍𝐔𝐄𝐕𝐎 𝐈𝐍𝐓𝐄𝐆𝐑𝐀𝐍𝐓𝐄\n╰━━━━━━━━━━━━⬣\n\n┃ 👋 𝐇𝐨𝐥𝐚 @user\n┃ ✨ 𝐁𝐢𝐞𝐧𝐯𝐞𝐧𝐢𝐝𝐨/𝐚 𝐚:\n┃ 🏰 *@group*\n\n┃ 📜 𝐍𝐨 𝐨𝐥𝐯𝐢𝐝𝐞𝐬 𝐥𝐞𝐞𝐫 𝐥𝐚𝐬 𝐫𝐞𝐠𝐥𝐚𝐬\n┃ 𝐲 𝐝𝐢𝐬𝐟𝐫𝐮𝐭𝐚𝐫 𝐭𝐮 𝐞𝐬𝐭𝐚𝐧𝐜𝐢𝐚.\n\n╰━━〔 ⚡ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕━━⬣`
        : `╭〔 😔 𝐒𝐄 𝐍𝐎𝐒 𝐅𝐔𝐄 〕⬣\n┃ ✨ 𝐇𝐀𝐒𝐓𝐀 𝐏𝐑𝐎𝐍𝐓𝐎\n╰━━━━━━━━━━━━⬣\n\n┃ 👋 𝐀𝐝𝐢ó𝐬 @user\n┃ > 𝐄𝐬 𝐮𝐧𝐚 𝐩𝐞𝐧𝐚 𝐪𝐮𝐞 𝐭𝐞 𝐯𝐚𝐲𝐚𝐬 𝐝𝐞:\n┃ > *@group*\n\n┃ > 𝐍𝐮𝐧𝐜𝐚 𝐭𝐞 𝐨𝐥𝐯𝐢𝐝𝐚𝐫𝐞𝐦𝐨𝐬\n\n╰━━〔 ⚡ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕━━⬣`;
      const template = String(
        (action === "add" ? group.welcomeMessage : group.goodbyeMessage) ||
          defaultTemplate,
      );
      const tags = participantJids
        .map((participant) => `@${participant.split("@")[0]}`)
        .join(", ");
      const text = template
        .replaceAll(t("core_group_fe6a00b1"), groupName)
        .replaceAll(t("core_mention_d5b00d52"), tags)
        .replaceAll(t("core_user_0f23d79d"), tags)
        .replaceAll(t("core_group_c77112aa"), groupName)
        .replaceAll(t("core_desc_476f541a"), metadata?.desc?.toString() || "Sin descripción")
        .replaceAll(t("core_count_7886d3a6"), String(metadata?.participants?.length || 0));
      await socket.sendMessage(id, { text, mentions: participantJids });
    } catch (error) {
      logInfo(`Error de participantes en ${id}: ${String(error)}`, "error");
    }
  });

  return socket;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

function normalizePhone(value: unknown): string {
  const raw = String(value || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
  return raw.length >= 7 && raw.length <= 15 ? raw : "";
}

/**
 * Prioriza el número telefónico destino sobre el solicitante para evitar colisiones.
 */
function sessionNameFor(requester: string, fallbackPhone?: string): string {
  const cleanId =
    normalizePhone(fallbackPhone) ||
    normalizePhone(requester) ||
    String(requester || "")
      .split("@")[0]
      .split(":")[0]
      .replace(/[^a-zA-Z0-9_-]/g, "");
  return `sub-${cleanId || "bot"}`;
}

/**
 * Devuelve únicamente sockets activos y debidamente autenticados con WhatsApp.
 */
export function getActiveSubBots(): ExtendedWASocket[] {
  const list: ExtendedWASocket[] = [];
  for (const socket of activeSubBots.values()) {
    if (!socket || !socket.user?.id || (socket as any).isClosed) {
      continue;
    }
    list.push(socket);
  }
  return list;
}

export function forgetActiveSubBot(sessionName: string) {
  void unlinkSubBot(sessionName, undefined, "olvidado manualmente");
}

export async function suspendSubBot(sessionName: string): Promise<void> {
  clearReconnectTimer(sessionName);
  reconnectAttempts.delete(sessionName);
  await cleanSubBot(sessionName);
}

export async function requestSubBotLink(request: LinkRequest): Promise<string> {
  const manualPhone = normalizePhone(request.phoneNumber);
  const storedPhone = normalizePhone(db.getUser(request.requester)?.phone_number);
  const jidPhone = String(request.requester || "").endsWith("@s.whatsapp.net")
    ? normalizePhone(request.requester)
    : "";
  const pairingPhone = manualPhone || storedPhone || jidPhone;

  if (request.method === "code" && !pairingPhone) {
    throw new Error("No se pudo obtener un número de teléfono válido para la vinculación.");
  }

  const sessionName = sessionNameFor(request.requester, pairingPhone);
  logInfo(
    `Solicitud ${request.method} recibida. Sesión: ${sessionName}.`,
    "pairing",
  );

  const existingPending = pendingRequests.get(sessionName);
  if (existingPending) {
    if (request.botType === "Prem-Bot") {
      throw new Error(
        `Ya existe una vinculación pendiente para ${sessionName}; espera a que termine antes de usar el token.`,
      );
    }
    logInfo(
      `Ya hay una vinculación pendiente para ${sessionName}; se espera esa solicitud.`,
      "warn",
    );
    return existingPending;
  }

  const task = (async () => {
    if (activeSubBots.has(sessionName)) {
      await cleanSubBot(sessionName);
    }

    let managedSocket: ExtendedWASocket | undefined;

    const options: ConnectionOptions = {
      pairingMethod: request.method,
      allowPairing: true,
      pairingPhone,
      botType: request.botType ?? "Sub-Bot",
      premiumToken: request.premiumToken,
      requesterJid: request.requester,
      onSocketCreated: (socket) => {
        managedSocket = socket;
        setActiveSubBot(sessionName, socket);
      },
      pairingTimeoutMs: 60_000,
      onQr: request.onQr,
      onPairingCode: request.onPairingCode,
      onConnected: request.onConnected,
      onPairingError: async (error) => {
        await unlinkSubBot(sessionName, managedSocket, "error de vinculación");
        await request.onPairingError?.(error);
      },
      onPairingExpired: async () => {
        await unlinkSubBot(sessionName, managedSocket, "tiempo de vinculación agotado");
        await request.onPairingExpired?.();
      },
      onSessionClosed: async (reason) => {
        await request.onSessionClosed?.(reason);
      },
      onDisconnected: () => {
        void cleanSubBot(sessionName, managedSocket);
      },
    };

    const connection = await connectSubBot(sessionName, options);
    if (connection) {
      managedSocket = connection;
      setActiveSubBot(sessionName, connection);
    }

    return sessionName;
  })();

  pendingRequests.set(sessionName, task);

  try {
    return await task;
  } catch (error) {
    logInfo(
      `No se pudo iniciar la sesión ${sessionName}: ${String(error)}`,
      "error",
    );
    throw error;
  } finally {
    pendingRequests.delete(sessionName);
  }
}

export async function reconnectSubBot(
  sessionName: string,
  botType: "Prem-Bot" | "Sub-Bot",
  premiumToken?: string,
): Promise<void> {
  const pending = managedReconnects.get(sessionName);
  if (pending) return pending;

  const task = (async () => {
    const socket = activeSubBots.get(sessionName);
    if (socket) await cleanSubBot(sessionName, socket);
    const options: ConnectionOptions = {
      allowPairing: false,
      botType,
      premiumToken,
      onSocketCreated: (nextSocket) => {
        setActiveSubBot(sessionName, nextSocket);
      },
      onDisconnected: () => {
        void cleanSubBot(sessionName);
      },
    };
    try {
      const connection = await connectSubBot(sessionName, options);
      if (connection) setActiveSubBot(sessionName, connection);
    } catch (error) {
      if (socket?.user?.id) {
        db.setBot(socket.user.id, { status: "offline" });
      }
      scheduleReconnect(sessionName, options);
      throw error;
    }
  })();

  managedReconnects.set(sessionName, task);
  try {
    await task;
  } finally {
    managedReconnects.delete(sessionName);
  }
}

export async function startSavedSubBots() {
  const bots = db.getAllBots();
  const sessionsToStart: Array<{
    sessionName: string;
    botType: "Prem-Bot" | "Sub-Bot";
    premiumToken?: string;
  }> = [];
  const seenSessions = new Set<string>();

  for (const bot of bots) {
    const rawJid = String(bot.jid || "");
    if (rawJid.startsWith("sub-")) {
      try {
        db.deleteBot(rawJid);
      } catch {}
      continue;
    }

    if (bot.isMain) continue;

    let parsedData: Record<string, unknown> | undefined;
    if (typeof bot.data === "string") {
      try {
        parsedData = JSON.parse(bot.data);
      } catch {}
    } else if (bot.data && typeof bot.data === "object") {
      parsedData = bot.data as Record<string, unknown>;
    }

    const sessionName = String(
      parsedData?.sessionName || (bot.phone_number ? `sub-${bot.phone_number}` : ""),
    ).trim();
    const premiumToken = String(parsedData?.premiumToken ?? "").trim().toLowerCase();
    if (premiumToken) continue;
    const isPremium = Boolean(
      premiumToken &&
        isPremiumTokenValidForAccount(premiumToken, bot.jid),
    );
    if (resolveBotType(bot.bot_type) !== (isPremium ? "Prem-Bot" : "Sub-Bot")) {
      db.setBot(bot.jid, { bot_type: isPremium ? "Prem-Bot" : "Sub-Bot" });
    }

    if (
      !sessionName ||
      seenSessions.has(sessionName) ||
      activeSubBots.has(sessionName) ||
      pendingRequests.has(sessionName)
    ) {
      continue;
    }

    // Validar pre-existencia en disco antes de crear carpetas o intentar sockets
    const sessionDir = await moveBotSessionDirectory(sessionName, "Sub-Bot", {
      prem: PREM_SESSION_ROOT,
      sub: SESSION_ROOT,
    });
    const dbFile = path.join(sessionDir, "session.db");
    if (!existsSync(dbFile)) {
      logInfo(
        `Subbot ${sessionName} (${rawJid}) sin sesión en disco. Depurando registro huérfano...`,
        "info",
      );
      try {
        db.deleteBot(rawJid);
        db.deleteBot(sessionName);
      } catch {}
      continue;
    }

    seenSessions.add(sessionName);
    sessionsToStart.push({
      sessionName,
      botType: isPremium ? "Prem-Bot" : "Sub-Bot",
      ...(premiumToken ? { premiumToken } : {}),
    });
  }

  logInfo(`Iniciando ${sessionsToStart.length} sub-bot(s) guardado(s).`, "info");
  if (sessionsToStart.length === 0) {
    logInfo("No hay sesiones de subbots guardadas para restaurar.", "info");
    return;
  }

  let currentIndex = 0;

  const worker = async () => {
    while (true) {
      const idx = currentIndex++;
      if (idx >= sessionsToStart.length) break;

      const session = sessionsToStart[idx];
      const { sessionName } = session;
      if (activeSubBots.has(sessionName) || pendingRequests.has(sessionName)) {
        continue;
      }

      if (idx > 0) {
        await sleep(STARTUP_STAGGER_MS);
      }

      let managedSocket: ExtendedWASocket | undefined;

      try {
        logInfo(
          `Restaurando ${sessionName} (${idx + 1}/${sessionsToStart.length}).`,
          "info",
        );
        const connection = await connectSubBot(sessionName, {
          allowPairing: false,
          botType: session.botType,
          premiumToken: session.premiumToken,
          onSocketCreated: (socket) => {
            managedSocket = socket;
            setActiveSubBot(sessionName, socket);
          },
          onDisconnected: () => {
            void cleanSubBot(sessionName, managedSocket);
          },
        });

        if (connection) {
          managedSocket = connection;
          setActiveSubBot(sessionName, connection);
          logInfo(
            `Socket de ${sessionName} iniciado.`,
            "success",
          );
        }
      } catch (error) {
        logInfo(
          `No se pudo restaurar ${sessionName}: ${String(error)}`,
          "error",
        );
        void cleanSubBot(sessionName, managedSocket);
      }
    }
  };

  const workerCount = Math.min(STARTUP_CONCURRENCY, sessionsToStart.length);
  await Promise.allSettled(
    Array.from({ length: workerCount }, () => worker()),
  );
}
