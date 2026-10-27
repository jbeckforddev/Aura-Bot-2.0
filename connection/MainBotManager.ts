import makeWASocket, {
  DisconnectReason,
  Browsers,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  useSQLiteAuthState,
  jidNormalizedUser,
  type proto,
} from "baileys";
import chalk from "chalk";
import pino from "pino";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import qrcodeTerminal from "qrcode-terminal";
import { Boom } from "@hapi/boom";
import { LRUCache } from "lru-cache";
import {
  handleMessage,
  invalidateGroupCache,
  getGroupMetadata,
  GROUP_METADATA_CACHE,
} from "../handler.ts";
import { getPlugins } from "../core/cmdLoader.ts";
import { logInfo, pairingMenuLog } from "../core/logger.ts";
import { db } from "../database/AuraDB.ts";
import { resolveBotType } from "../core/botType.ts";
import {
  handleAntilink,
  handleGroupCall,
  isPrimaryBotForGroup,
} from "../core/groupModeration.ts";
import { preloadMenuBanner } from "../cmd/socket/menu.ts";

import type {
  ExtendedWASocket,
  GroupCallEvent,
} from "../types/index";
import { t } from "../src/langs/index.ts";

export const logger = pino({ level: "silent" });

const MAX_MAIN_RECONNECT_ATTEMPTS = 5;
const WA_WEB_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PAIRING_CODE_REQUEST_DELAY_MS = 3000;

const reconnectTimers = new Map<string, NodeJS.Timeout>();
const reconnectAttempts = new Map<string, number>();
const pairingRetryAttempts = new Map<string, number>();
const connectionsInProgress = new Set<string>();

const mainMessagesCache = new LRUCache<string, proto.IMessage>({
  max: 1500,
  ttl: 15 * 60 * 1000,
});

let waWebVersionPromise: Promise<[number, number, number]> | undefined;
let waWebVersionExpiresAt = 0;

export const GroupCache = new LRUCache({max: 1000, ttl: 5 * 60, ttlAutopurge: true })

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

// Reemplaza tu función actual por esta versión asíncrona:
async function safelyDestroySocket(sock?: ExtendedWASocket | null, reason?: Error) {
  if (!sock) return;
  try {
    if (sock.ev && typeof sock.ev.off === "function") {
      sock.ev.off("creds.update", () => {});
      sock.ev.off("connection.update", () => {});
      sock.ev.off("messages.upsert", () => {});
      sock.ev.off("call", () => {});
      sock.ev.off("groups.update", () => {});
      sock.ev.off("group-participants.update", () => {});
    } else if (typeof sock.ev.removeAllListeners === "function") {
      (sock.ev as any).removeAllListeners();
    }
  } catch {}
  if (sock.ws) {
    try {
      if ((sock.ws as any).readyState !== 3) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 2000);
          sock.ws.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
          sock.ws.close();
        });
      }
    } catch {}
  }

  try {
    await sock.end?.(reason);
  } catch {}
}

async function removeSessionFolder(sessionName: string) {
  const authFolder = path.join(
    globalThis.mainBotSession ?? "./sessions",
    sessionName,
  );
  await rm(authFolder, { recursive: true, force: true }).catch(() => undefined);
}


function getWaWebVersion(): Promise<[number, number, number]> {
  if (!waWebVersionPromise || Date.now() >= waWebVersionExpiresAt) {
    waWebVersionExpiresAt = Date.now() + WA_WEB_VERSION_CACHE_TTL_MS;
    waWebVersionPromise = fetchLatestWaWebVersion()
      .then(({ version }) => version as [number, number, number])
      .catch((error) => {
        waWebVersionPromise = undefined;
        waWebVersionExpiresAt = 0;
        throw error;
      });
  }
  return waWebVersionPromise;
}

function resetReconnectAttempts(sessionName: string) {
  reconnectAttempts.delete(sessionName);
}

function registerReconnectAttempt(sessionName: string) {
  const attempts = (reconnectAttempts.get(sessionName) ?? 0) + 1;
  reconnectAttempts.set(sessionName, attempts);
  return attempts;
}

function clearReconnectTimer(sessionName: string) {
  const currentTimer = reconnectTimers.get(sessionName);
  if (currentTimer) {
    clearTimeout(currentTimer);
    reconnectTimers.delete(sessionName);
  }
}

function scheduleReconnect(
  delayMs: number,
  sessionName: string,
) {
  clearReconnectTimer(sessionName);
  const timer = setTimeout(() => {
    reconnectTimers.delete(sessionName);
    void connectMainBot(sessionName);
  }, delayMs);
  timer.unref?.();
  reconnectTimers.set(sessionName, timer);
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function cleanPhoneNumber(jid: string): string | null {
  const local = String(jid || "")
    .split("@")[0]
    .split(":")[0];
  return /^\d+$/.test(local) ? local : null;
}

function cleanLid(lid: string): string | null {
  const local = String(lid || "")
    .replace(/@lid$/, "")
    .split(":")[0];
  return /^\d+$/.test(local) ? local : null;
}

function normalizeBotId(lid: string, fallbackJid: string): string {
  const clean = cleanLid(lid);
  return clean ? `${clean}@lid` : fallbackJid;
}

function normalizePairingPhone(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function getBotDisplayName(
  sock: ExtendedWASocket,
  previousName?: string | null,
): string | null {
  const user = sock.user as unknown as
    | {
        name?: string | null;
        notify?: string | null;
        pushName?: string | null;
      }
    | undefined;
  const name = user?.name || user?.notify || user?.pushName || previousName;
  return name ? String(name).trim() : null;
}

const groupsFetchCache = new Map<string, { groups: string[]; timestamp: number }>();
const GROUPS_CACHE_TTL = 60 * 60 * 1000; // 1 hora de caché

async function getBotGroups(sock: ExtendedWASocket): Promise<string[]> {
  const botId = sock.user?.id || "unknown";
  const cached = groupsFetchCache.get(botId);
  if (cached && Date.now() - cached.timestamp < GROUPS_CACHE_TTL) {
    return cached.groups;
  }

  try {
    const participating = await sock.groupFetchAllParticipating?.();
    if (!participating) return [];
    const keys = Object.keys(participating).filter((jid) => jid.endsWith("@g.us"));

    groupsFetchCache.set(botId, { groups: keys, timestamp: Date.now() });
    return keys;
  } catch (err: unknown) {
    logInfo(`No se pudo obtener el JID del grupo: ${err}`, "error");
    return [];
  }
}


const botStartTime = Math.floor(Date.now() / 1000);

export async function connectMainBot(
  sessionName: string,
) {
  return connectSocket(sessionName);
}

async function connectSocket(sessionName: string) {
  if (connectionsInProgress.has(sessionName)) {
    return;
  }

  connectionsInProgress.add(sessionName);

  let authState: Awaited<ReturnType<typeof useSQLiteAuthState>>;

  try {
    const sessionDir = path.join(
      globalThis.mainBotSession ?? "./sessions",
      sessionName,
    );
    await mkdir(sessionDir, { recursive: true });
    authState = await useSQLiteAuthState(sessionDir);
  } catch (error) {
    connectionsInProgress.delete(sessionName);
    throw error;
  }

  const { state, saveCreds, close: closeAuthState } = authState;


  const isRegistered = Boolean(
    state.creds && (state.creds.registered || state.creds.me),
  );

  let pairingMethod: "qr" | "code" | undefined;
  let pairingPhone = "";

  if (!isRegistered) {
    logInfo("Selecciona el método de vinculación:" , "pairing");
    pairingMenuLog();
    logInfo("Elija el etodo (1 o 2): ", "pairing");

    const option = await askQuestion("~/aura/method/select $ ");
    if (option === "2") {
      pairingMethod = "code";
      logInfo("Ingrese el número de teléfono con código de país (ej: 50612345678)", "pairing");
      pairingPhone = normalizePairingPhone(
        await askQuestion("~/aura/method/select/code $ "),
      );

      if (!pairingPhone) {
        pairingMethod = "qr";
        logInfo("Número inválido. Se usará QR por defecto.", "warn");
      }
    } else {
      pairingMethod = "qr";
    }
  }

  pairingMethod ??= "qr";

  let version: [number, number, number] | undefined;
  try {
    version = await getWaWebVersion();
  } catch {
    logInfo(
      "No se pudo obtener la versión de WhatsApp Web; usando la interna de Baileys.",
      "warn",
    );
  }

  const signalKeyCache = createBoundedCacheStore(250, 4 * 60 * 1000);
  const msgRetryCounterCache = createBoundedCacheStore(150, 2 * 60 * 1000);
  const userDevicesCache = createBoundedCacheStore(250, 4 * 60 * 1000);

  const flushSocketCaches = () => {
    signalKeyCache.flushAll();
    msgRetryCounterCache.flushAll();
    userDevicesCache.flushAll();
  };

  const sock = makeWASocket({
    version: version || [2, 3000, 1042466098],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger, signalKeyCache),
    },
    msgRetryCounterCache,
    userDevicesCache,
    getMessage: async (key) => {
      if (!key?.id) return undefined;
      return mainMessagesCache.get(key.id);
    },
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    logger,
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
    cachedGroupMetadata: async (jid) => GROUP_METADATA_CACHE.get(jid)
  });

  const extendedSock = sock as ExtendedWASocket;
  globalThis.mainSocket = extendedSock;
  extendedSock.isSubBot = false;
  extendedSock.sessionName = sessionName;

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
          await saveCreds();
        } catch (error) {
          credentialsDirty = true;
          throw error;
        }
      });
    return credentialsWriteQueue;
  };

  const closeAuthStateSafely = () => {
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
        logInfo(`Error al guardar credenciales antes del cierre: ${String(error)}`, "error");
      }

      try {
        closeAuthState?.();
      } catch (error) {
        logInfo(`Error al cerrar el almacén de credenciales: ${String(error)}`, "error");
      }

      flushSocketCaches();
    })();
    return authStateClosePromise;
  };

  extendedSock.ev.on("creds.update", () => {
    if (authStateClosing) return;
    credentialsDirty = true;
    if (saveTimer) return;

    saveTimer = setTimeout(async () => {
      saveTimer = null;
      try {
        await persistCredentials();
      } catch (error) {
        logInfo(`Error al guardar credenciales: ${String(error)}`, "error");
      }
    }, 3000);
    saveTimer.unref?.();
  });

  let hasConnected = false;
  let pairingCodeRequested = false;
  let connectionClosed = false;

  const knownGroupJids = new LRUCache<string, true>({
    max: 500,
    ttl: 60 * 60 * 1000,
  });

  const sharedRuntimeLogger = {
    message: () => {},
    warn: (payload: unknown) => logInfo(String(payload), "warn"),
    error: (payload: unknown) => logInfo(String(payload), "error"),
    cmdExec: () => {},
  };

  sock.ev.on("connection.update", async (u) => {
    if (u.qr && pairingMethod === "qr") {
      logInfo("Escanea este código QR con WhatsApp para vincular al bot.", "pairing");
      qrcodeTerminal.generate(u.qr, { small: true });
    }
    if (
      u.qr &&
      !isRegistered &&
      pairingMethod === "code" &&
      pairingPhone &&
      !pairingCodeRequested
    ) {
      pairingCodeRequested = true;
      try {
        logInfo(
          `Esperando ${PAIRING_CODE_REQUEST_DELAY_MS} ms antes de solicitar el código.`,
          "pairing",
        );
        await new Promise((resolve) =>
          setTimeout(resolve, PAIRING_CODE_REQUEST_DELAY_MS),
        );
        if (connectionClosed || hasConnected) return;
        const cleanPhone = pairingPhone.replace(/\D/g, "");
        logInfo(`Solicitando código para: ${cleanPhone}`, "pairing");
        const rawCode = await sock.requestPairingCode(cleanPhone);
        const code = rawCode.match(/.{1,4}/g)?.join("-") || rawCode;
        logInfo(`🔑 CÓDIGO: ${chalk.bgHex("#4c1d95").white.bold(code)}`, "pairing");
      } catch (err) {
        logInfo(`Error al solicitar código: ${String(err)}`, "error");
      }
    }
    if (u.connection === "open") {
      hasConnected = true;
      const mainNum = sock.user?.id ?? "desconocido";
      const botJid = jidNormalizedUser(mainNum);

      let botId = String(
        (sock.user as unknown as Record<string, unknown>)?.lid || "",
      ).trim();
      if (!botId) {
        try {
          botId = String(
            (await sock.signalRepository?.lidMapping?.getLIDForPN(botJid)) || "",
          ).trim();
        } catch {
          botId = "";
        }
      }
      botId = normalizeBotId(botId, botJid);
      const botPhoneNumber = cleanPhoneNumber(botJid);
      const botLid = cleanLid(botId);
      const previousBot = db.getBot(botJid);
      const previousBotType = resolveBotType(previousBot?.bot_type);
      const botType = previousBotType === "Prem-Bot" ? "Prem-Bot" : "Principal";
      const botName =
        previousBot?.data?.customBotName && previousBot.bot_name
          ? previousBot.bot_name
          : getBotDisplayName(extendedSock, previousBot?.bot_name);

      extendedSock.subBotId = botId;
      db.setBot(botJid, {
        bot_id: botId,
        bot_name: botName,
        phone_number: botPhoneNumber,
        lid: botLid,
        groups: Array.isArray(previousBot?.groups) ? previousBot.groups : [],
        isMain: 1,
        bot_type: botType,
        status: "active",
        sessionName,
      });
      db.setUser(botJid, {
        jid: botJid,
        lid: botLid ? `${botLid}@lid` : null,
        username: botName,
        pushName: botName,
        phone_number: botPhoneNumber,
      });
      if (sessionName !== botJid) db.deleteBot(sessionName);
      resetReconnectAttempts(sessionName);
      pairingRetryAttempts.delete(sessionName);
      void preloadMenuBanner(extendedSock).catch(() => {});
      logInfo(`El Usuario ${chalk.bold(botName)} con ${chalk.bold(mainNum)} vinculado con exito.`, "success");

      setTimeout(() => {
        void getBotGroups(extendedSock).then((botGroups) => {
          if (botGroups.length > 0) {
            for (const gJid of botGroups) knownGroupJids.set(gJid, true);
            db.setBot(botJid, { groups: botGroups });
          }
        });
      }, 10000);
      return;
    }

    if (u.connection !== "close") {
      return;
    }

    knownGroupJids.clear();
    connectionClosed = true;

    if (extendedSock.manualLogout) {
      safelyDestroySocket(extendedSock);
      await closeAuthStateSafely();
      await removeSessionFolder(sessionName);

      const logoutBotJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : sessionName;
      if (hasConnected) db.setBot(logoutBotJid, { status: "offline" });
      logInfo("Sesión cerrada por comando del bot. No se reconectará automáticamente.", "alert");

      globalThis.mainSocket = null;
      logInfo("Iniciando nuevamente el menú de vinculación del bot principal...", "pairing");
      void connectMainBot(sessionName);
      return;
    }

    const error = u.lastDisconnect?.error as
      | (Error & { output?: { statusCode?: number }; statusCode?: number })
      | undefined;
    const boomError = error ? new Boom(error) : null;
    const statusCode =
      boomError?.output?.statusCode ??
      error?.output?.statusCode ??
      error?.statusCode ??
      0;
    const errorMessage = error?.message || "Error desconocido";

    await  safelyDestroySocket(extendedSock, error);
    await closeAuthStateSafely();
    
    logInfo(
      `Conexión cerrada. Código: ${String(statusCode || "N/A")}. Motivo: ${errorMessage}`,
      statusCode === 0 ? "warn" : "error",
    );

    const currentIsRegistered = Boolean(
      state.creds && (state.creds.registered || state.creds.me),
    );
    const isNotRegistered = !currentIsRegistered;

    const disconnectedBotJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : "";
    if (disconnectedBotJid) {
      if (hasConnected) db.setBot(disconnectedBotJid, { status: "offline" });
    }

    if (statusCode === DisconnectReason.loggedOut) {
      clearReconnectTimer(sessionName);
      resetReconnectAttempts(sessionName);
      const retryAttempts = pairingRetryAttempts.get(sessionName) ?? 0;
      await removeSessionFolder(sessionName);

      if (retryAttempts < 1) {
        pairingRetryAttempts.set(sessionName, retryAttempts + 1);
        logInfo(
          "Sesión rechazada (401). Se limpió la carpeta y se intentará vincular una vez más con llaves nuevas.",
          "alert",
        );
        scheduleReconnect(3000, sessionName);
        return;
      }

      pairingRetryAttempts.delete(sessionName);
      logInfo(
        "WhatsApp volvió a rechazar la sesión (401). Espera antes de volver a intentar.",
        "alert",
      );
      return;
    }

    const transientDisconnectCodes = [
      DisconnectReason.connectionLost,
      DisconnectReason.connectionClosed,
      DisconnectReason.timedOut,
      DisconnectReason.restartRequired,
      DisconnectReason.connectionReplaced,
      408,
      428,
      515,
    ];

    const shouldResetSession =
      [
        DisconnectReason.loggedOut,
        DisconnectReason.badSession,
        DisconnectReason.forbidden,
        DisconnectReason.multideviceMismatch,
      ].includes(statusCode) || isNotRegistered;

    const isTransientDisconnect =
      transientDisconnectCodes.includes(statusCode as any) || !isNotRegistered;

    if (isTransientDisconnect && !shouldResetSession) {
      const retryCount = registerReconnectAttempt(sessionName);
      const delayMs = Math.min(2000 * retryCount, 10000);
      logInfo(
        `Desconexión temporal detectada (Código: ${statusCode}). Reconectando socket automáticamente...`,
        "warn",
      );
      scheduleReconnect(delayMs, sessionName);
      return;
    }

    if (shouldResetSession) {
      if (isNotRegistered) {
        logInfo("La vinculación fue interrumpida, expiró o la IP está bloqueada.", "alert");
      } else {
        logInfo("La sesión no es válida o fue desvinculada por WhatsApp.", "alert");
      }

      logInfo("Limpiando credenciales y reiniciando el proceso de vinculación...", "warn");
      await removeSessionFolder(sessionName);

      logInfo("Iniciando nuevo proceso de vinculación en 3 segundos...", "warn");
      scheduleReconnect(3000, sessionName);
      return;
    }

    const retryCount = registerReconnectAttempt(sessionName);
    if (retryCount >= MAX_MAIN_RECONNECT_ATTEMPTS) {
      logInfo("Se alcanzó el máximo de reintentos. Reiniciando emparejamiento...", "alert");
      await removeSessionFolder(sessionName);
      resetReconnectAttempts(sessionName);
      return;
    }

    logInfo(
      `Conexión interrumpida. Reconectando en 3 segundos... intento ${retryCount}/${MAX_MAIN_RECONNECT_ATTEMPTS}`,
      "warn",
    );
    scheduleReconnect(3000, sessionName);
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !Array.isArray(messages) || messages.length === 0) {
      return;
    }

    messages.forEach((msg) => {
      if (msg.key?.id && msg.message) {
        mainMessagesCache.set(msg.key.id, msg.message);
      }
    });

    const connectedBot = sock.user?.id || "";

    await Promise.allSettled(
      messages.map(async (msg) => {
        if (!msg?.message) return;

        try {
          const groupJid = msg.key?.remoteJid;
          if (groupJid?.endsWith("@g.us") && !knownGroupJids.has(groupJid)) {
            if (connectedBot) {
              db.addBotGroup(connectedBot, groupJid);
              knownGroupJids.set(groupJid, true);
            }
          }

          await handleMessage(
            extendedSock,
            msg,
            "MAIN",
            connectedBot || null,
            [],
            {
              db,
              config: {
                prefix: globalThis.DEFAULT_PREFIXES ?? ["."],
              },
              getPlugins,
              checkAntilink: ({
                sock: messageSock,
                msg: antilinkMsg,
                body,
                isAdmin,
                isOwner,
                isBotAdmin,
              }) =>
                handleAntilink(
                  messageSock,
                  antilinkMsg,
                  body,
                  isAdmin,
                  isOwner,
                  isBotAdmin,
                ),
              logger: sharedRuntimeLogger,
            },
          );
        } catch (error) {
          logInfo(`Error al procesar mensaje: ${String(error)}`, "error");
        }
      }),
    );
  });

  sock.ev.on("call", async (calls: unknown[]) => {
    if (!Array.isArray(calls)) return;
    for (const call of calls) {
      await handleGroupCall(extendedSock, call as GroupCallEvent, db);
    }
  });

  sock.ev.on("groups.update", (updates) => {
    for (const update of updates) {
      if (update.id) invalidateGroupCache(update.id);
    }
  });

  sock.ev.on(
    "group-participants.update",
    async ({ id, participants, action }) => {
      if (!id) return;
      invalidateGroupCache(id);
      if (
        !Array.isArray(participants) ||
        (action !== "add" && action !== "remove")
      ) {
        return;
      }

      if (!isPrimaryBotForGroup(extendedSock, id, db)) return;

      try {
        const group = db.getGroup(id);
        const setting = action === "add" ? "welcome" : "goodbye";
        if (!group[setting]) return;

        const metadata = await getGroupMetadata(id, extendedSock);
        const groupName = metadata?.subject || group.group_name || id;

        if (group.group_name !== groupName) {
          db.setGroup(id, { group_name: groupName });
        }

        const template = String(
          (action === "add"
            ? group.welcomeMessage ||
              `╭〔 👋 𝐁𝐈𝐄𝐍𝐕𝐄𝐍𝐈𝐃𝐎/𝐀 〕⬣\n┃ ✨ 𝐀 𝐔𝐍 𝐍𝐔𝐄𝐕𝐎 𝐈𝐍𝐓𝐄𝐆𝐑𝐀𝐍𝐓𝐄\n╰━━━━━━━━━━━━⬣\n\n┃ 👋 𝐇𝐨𝐥𝐚 @user\n┃ ✨ 𝐁𝐢𝐞𝐧𝐯𝐞𝐧𝐢𝐝𝐨/𝐚 𝐚:\n┃ 🏰 *@group*\n\n┃ 📜 𝐍𝐨 𝐨𝐥𝐯𝐢𝐝𝐞𝐬 𝐥𝐞𝐞𝐫 𝐥𝐚𝐬 𝐫𝐞𝐠𝐥𝐚𝐬\n┃ 𝐲 𝐝𝐢𝐬𝐟𝐫𝐮𝐭𝐚𝐫 𝐭𝐮 𝐞𝐬𝐭𝐚𝐧𝐜𝐢𝐚.\n\n╰━━〔 ⚡ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕━━⬣`
            : group.goodbyeMessage ||
              `╭〔 😔 𝐒𝐄 𝐍𝐎𝐒 𝐅𝐔𝐄 〕⬣\n┃ ✨ 𝐇𝐀𝐒𝐓𝐀 𝐏𝐑𝐎𝐍𝐓𝐎\n╰━━━━━━━━━━━━⬣\n\n┃ 👋 𝐀𝐝𝐢ó𝐬 @user\n┃ > 𝐄𝐬 𝐮𝐧𝐚 𝐩𝐞𝐧𝐚 𝐪𝐮𝐞 𝐭𝐞 𝐯𝐚𝐲𝐚𝐬 𝐝𝐞:\n┃ > *@group*\n\n┃ > 𝐍𝐮𝐧𝐜𝐚 𝐭𝐞 𝐨𝐥𝐯𝐢𝐝𝐚𝐫𝐞𝐦𝐨𝐬\n\n╰━━〔 ⚡ 𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃 〕━━⬣`) ||
            "",
        );

        const participantJids = participants
          .map((participant: string | { id?: string }) =>
            typeof participant === "string" ? participant : participant?.id,
          )
          .filter((p): p is string => Boolean(p));

        if (participantJids.length === 0) return;

        const tags = participantJids
          .map((participant: string) => `@${participant.split("@")[0]}`)
          .join(", ");
        const groupDescription = metadata?.desc?.toString() || "Sin descripción";
        const memberCount = metadata?.participants?.length || 0;

        const text = template
          .replaceAll(t("core_group_fe6a00b1"), groupName)
          .replaceAll(t("core_mention_d5b00d52"), tags)
          .replaceAll(t("core_user_0f23d79d"), tags)
          .replaceAll(t("core_group_c77112aa"), groupName)
          .replaceAll(t("core_desc_476f541a"), groupDescription)
          .replaceAll(t("core_count_7886d3a6"), String(memberCount));

        await sock.sendMessage(id, { text, mentions: participantJids });
      } catch (error) {
        logInfo(
          `Error en evento de participantes del grupo: ${String(error)}`,
          "error",
        );
      }
    },
  );
  connectionsInProgress.delete(sessionName);
  return extendedSock;
}
