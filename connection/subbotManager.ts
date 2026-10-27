import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useSQLiteAuthState,
} from "baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { LRUCache } from "lru-cache";
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
import { logInfo } from "../core/logger.ts";
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
const subBotLogger = pino({ level: "silent" });

const STARTUP_CONCURRENCY = 2;
const STARTUP_STAGGER_MS = 1500;
const PAIRING_CODE_REQUEST_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const SESSION_ROOT = globalThis.subBotSession ?? "./sessions/subs";

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
    waWebVersionPromise = fetchLatestWaWebVersion()
      .then(({ version }) => version as [number, number, number])
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

function scheduleReconnect(sessionName: string, options: ConnectionOptions) {
  clearReconnectTimer(sessionName);
  const attempts = (reconnectAttempts.get(sessionName) ?? 0) + 1;
  reconnectAttempts.set(sessionName, attempts);
  if (attempts > MAX_RECONNECT_ATTEMPTS) {
    logInfo(
      `${sessionName} alcanzó el máximo de ${MAX_RECONNECT_ATTEMPTS} intentos de reconexión.`,
      "SubBotError",
    );
    return;
  }

  const delayMs = Math.min(2000 * attempts, 10000) + Math.floor(Math.random() * 2000);
  logInfo(
    `Reconexión ${attempts}/${MAX_RECONNECT_ATTEMPTS} para ${sessionName} en ${delayMs} ms.`,
    "SubBotWarning",
  );
  const timer = setTimeout(() => {
    reconnectTimers.delete(sessionName);
    void connectSubBot(sessionName, options).catch((error) => {
      logInfo(
        `Falló la reconexión de ${sessionName}: ${String(error)}`,
        "SubBotError",
      );
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
      "SubBotWarning",
    );
    return activeSubBots.get(sessionName);
  }
  connectionsInProgress.add(sessionName);

  const sessionDir = path.join(SESSION_ROOT, sessionName);
  logInfo(
    `${options.allowPairing === false ? "Restaurando" : "Iniciando"} sesión ${sessionName} en ${sessionDir}.`,
    "SubBotInfo",
  );
  let authState: Awaited<ReturnType<typeof useSQLiteAuthState>>;
  try {
    await mkdir(sessionDir, { recursive: true });
    authState = await useSQLiteAuthState(sessionDir);
  } catch (error) {
    connectionsInProgress.delete(sessionName);
    logInfo(
      `No se pudo abrir la sesión ${sessionName}: ${String(error)}`,
      "SubBotError",
    );
    throw error;
  }

  const { state, saveCreds, close: closeAuthState } = authState;
  const isRegistered = Boolean(state.creds?.registered || state.creds?.me);
  logInfo(
    `Sesión ${sessionName}: ${isRegistered ? "credenciales encontradas" : "requiere vinculación"}.`,
    isRegistered ? "SubBotSuccess" : "SubBotPairing",
  );
  if (!isRegistered && options.allowPairing === false) {
    logInfo(
      `No hay credenciales válidas para restaurar ${sessionName}; se detiene la conexión automática.`,
      "SubBotWarning",
    );
    closeAuthState?.();
    await rm(sessionDir, { recursive: true, force: true });
    connectionsInProgress.delete(sessionName);
    return null;
  }

  let version: [number, number, number] | undefined;
  try {
    version = await getSubBotWebVersion();
  } catch {
    logInfo(`Se usará la versión interna de Baileys para ${sessionName}.`, "SubBotWarning");
  }

  const signalKeyCache = createBoundedCacheStore(150, 3 * 60 * 1000);
  const msgRetryCounterCache = createBoundedCacheStore(100, 2 * 60 * 1000);
  const userDevicesCache = createBoundedCacheStore(150, 3 * 60 * 1000);
  const subBotStartTime = Math.floor(Date.now() / 1000);

  const socket = makeWASocket({
    version: version || [2, 3000, 1042466098],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, subBotLogger, signalKeyCache),
    },
    msgRetryCounterCache,
    userDevicesCache,
    getMessage: async () => undefined,
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

  logInfo(`Socket creado para ${sessionName}.`, "SubBotInfo");
  socket.isSubBot = true;
  socket.subBotId = sessionName;
  socket.sessionName = sessionName;
  activeSubBots.set(sessionName, socket);
  await options.onSocketCreated?.(socket);
  connectionsInProgress.delete(sessionName);

  let connected = isRegistered;
  let pairingExpired = false;
  let pairingCodeRequested = false;
  let connectionClosed = false;
  let pairingTimer: NodeJS.Timeout | undefined;
  let closingAuth = false;
  const knownGroupJids = new Set<string>();

  const closeAuth = () => {
    if (closingAuth) return;
    closingAuth = true;
    try {
      signalKeyCache.flushAll();
      msgRetryCounterCache.flushAll();
      userDevicesCache.flushAll();
    } catch {}
    try {
      closeAuthState?.();
    } catch (error) {
      logInfo(`Error cerrando auth de ${sessionName}: ${String(error)}`, "SubBotWarning");
    }
  };
  (socket as any).closeAuth = closeAuth;

  socket.ev.on("creds.update", () => {
    void saveCreds().catch((error: unknown) =>
      logInfo(`Error guardando credenciales de ${sessionName}: ${String(error)}`, "SubBotError"),
    );
  });

  if (!isRegistered) {
    pairingTimer = setTimeout(() => {
      if (connected) return;
      pairingExpired = true;
      logInfo(
        `Venció el tiempo de vinculación de ${sessionName}.`,
        "SubBotWarning",
      );
      void (async () => {
        try {
          socket.ws?.close();
          await socket.end?.(new Error("Pairing expired"));
        } catch {}
        closeAuth();
        await rm(sessionDir, { recursive: true, force: true });
        activeSubBots.delete(sessionName);
        await options.onPairingExpired?.();
      })();
    }, options.pairingTimeoutMs ?? 60000);
    pairingTimer.unref?.();
  }

  const runtimeLogger = {
    message: () => {},
    warn: (payload: unknown) => logInfo(String(payload), "SubBotWarning"),
    error: (payload: unknown) => logInfo(String(payload), "SubBotError"),
    cmdExec: () => {},
  };

  socket.ev.on("connection.update", async (update) => {
    if (update.qr && (options.pairingMethod ?? "qr") === "qr") {
      logInfo(
        `QR generado para ${sessionName}; entregándolo al solicitante.`,
        "SubBotPairing",
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
          "SubBotInfo",
        );
        await new Promise((resolve) =>
          setTimeout(resolve, PAIRING_CODE_REQUEST_DELAY_MS),
        );
        if (pairingExpired || connectionClosed || connected) return;
        logInfo(
          `Solicitando código de vinculación para ${sessionName}.`,
          "SubBotPairing",
        );
        const rawCode = await socket.requestPairingCode(
          options.pairingPhone.replace(/\D/g, ""),
        );
        logInfo(
          `Código generado para ${sessionName}; entregándolo al solicitante.`,
          "SubBotSuccess",
        );
        await options.onPairingCode?.(
          rawCode.match(/.{1,4}/g)?.join("-") || rawCode,
        );
      } catch (error) {
        logInfo(
          `Error solicitando el código para ${sessionName}: ${String(error)}`,
          "SubBotError",
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
      const botName = String(
        (socket.user as unknown as Record<string, unknown> | undefined)?.name ||
          (socket.user as unknown as Record<string, unknown> | undefined)?.notify ||
          previousBot?.bot_name ||
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
        bot_type: "Sub-Bot",
        status: "active",
        sessionName,
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
        `Usuario ${botName ?? "sin nombre"} (${botJid}) vinculado con éxito. Sesión: ${sessionName}.`,
        "SubBotSuccess",
      );
      await options.onConnected?.();
      return;
    }

    if (update.connection !== "close") return;
    connectionClosed = true;
    if (pairingTimer) clearTimeout(pairingTimer);
    destroySocketInstance(socket);
    await options.onDisconnected?.();
    closeAuth();
    const error = update.lastDisconnect?.error;
    const statusCode =
      new Boom(error).output?.statusCode ||
      (error as { statusCode?: number } | undefined)?.statusCode ||
      0;
    logInfo(
      `${sessionName} se desconectó. Código: ${statusCode || "N/A"}. Motivo: ${error?.message || "desconocido"}.`,
      statusCode ? "SubBotWarning" : "SubBotInfo",
    );
    const botJid = socket.user?.id ? jidNormalizedUser(socket.user.id) : "";
    if (botJid && connected) db.setBot(botJid, { status: "offline" });
    if (activeSubBots.get(sessionName) === socket) activeSubBots.delete(sessionName);

    if (socket.manualLogout) {
      logInfo(`Cierre manual completado para ${sessionName}.`, "SubBotInfo");
      clearReconnectTimer(sessionName);
      reconnectAttempts.delete(sessionName);
      await rm(sessionDir, { recursive: true, force: true });
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

    if (!currentRegistered || invalidSession) {
      logInfo(
        `Sesión ${sessionName} inválida o sin credenciales; se elimina para permitir una nueva vinculación.`,
        "SubBotWarning",
      );
      await rm(sessionDir, { recursive: true, force: true });
      if (!currentRegistered) {
        await options.onPairingExpired?.();
      } else {
        await options.onPairingError?.(
          new Error(`Sesión de subbot inválida (${statusCode || "sin estado"}).`),
        );
      }
      return;
    }

    scheduleReconnect(sessionName, options);
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !Array.isArray(messages) || messages.length === 0) return;
    if (socket.user?.id) reconnectAttempts.delete(sessionName);

    await Promise.allSettled(
      messages.map(async (message) => {
        if (!message?.message) return;

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
          logInfo(`Error procesando mensaje de ${sessionName}: ${String(error)}`, "SubBotError");
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
      logInfo(`Error de participantes en ${id}: ${String(error)}`, "SubBotError");
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

function sessionNameFor(requester: string, fallbackPhone?: string): string {
  const cleanId =
    normalizePhone(requester) ||
    normalizePhone(fallbackPhone) ||
    String(requester || "")
      .split("@")[0]
      .split(":")[0]
      .replace(/[^a-zA-Z0-9_-]/g, "");
  return `sub-${cleanId || "bot"}`;
}

function destroySocketInstance(socket: ExtendedWASocket | undefined) {
  if (!socket) return;
  try {
    (socket as any).closeAuth?.();
  } catch {}
  try {
    socket.ws?.removeAllListeners?.();
    socket.ws?.close();
  } catch {}
  try {
    (socket.ev as any)?.removeAllListeners?.();
    (socket.ev as any)?.destroy?.();
  } catch {}
  try {
    socket.end?.(undefined);
  } catch {}
}

function cleanSubBot(sessionName: string, targetSocket?: ExtendedWASocket) {
  const current = activeSubBots.get(sessionName);
  if (targetSocket && current && current !== targetSocket) {
    destroySocketInstance(targetSocket);
    return;
  }
  if (current) {
    destroySocketInstance(current);
  }
  activeSubBots.delete(sessionName);
}

export function getActiveSubBots(): ExtendedWASocket[] {
  const list: ExtendedWASocket[] = [];
  for (const [sessionName, socket] of activeSubBots.entries()) {
    if (!socket) {
      activeSubBots.delete(sessionName);
      continue;
    }
    list.push(socket);
  }
  return list;
}

export function forgetActiveSubBot(sessionName: string) {
  cleanSubBot(sessionName);
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
    "SubBotPairing",
  );

  const existingPending = pendingRequests.get(sessionName);
  if (existingPending) {
    logInfo(
      `Ya hay una vinculación pendiente para ${sessionName}; se espera esa solicitud.`,
      "SubBotWarning",
    );
    return existingPending;
  }

  const task = (async () => {
    if (activeSubBots.has(sessionName)) {
      cleanSubBot(sessionName);
    }

    let managedSocket: ExtendedWASocket | undefined;

    const options: ConnectionOptions = {
      pairingMethod: request.method,
      allowPairing: true,
      pairingPhone,
      onSocketCreated: (socket) => {
        managedSocket = socket;
        activeSubBots.set(sessionName, socket);
      },
      pairingTimeoutMs: 60_000,
      onQr: request.onQr,
      onPairingCode: request.onPairingCode,
      onConnected: request.onConnected,
      onPairingError: async (error) => {
        cleanSubBot(sessionName, managedSocket);
        try {
          db.deleteBot(sessionName);
        } catch {}
        await request.onPairingError?.(error);
      },
      onPairingExpired: () => {
        cleanSubBot(sessionName, managedSocket);
        try {
          db.deleteBot(sessionName);
        } catch {}
        return request.onPairingExpired?.();
      },
      onDisconnected: () => {
        cleanSubBot(sessionName, managedSocket);
      },
    };

    const connection = await connectSubBot(sessionName, options);
    if (connection) {
      managedSocket = connection;
      activeSubBots.set(sessionName, connection);
    }

    return sessionName;
  })();

  pendingRequests.set(sessionName, task);

  try {
    return await task;
  } catch (error) {
    logInfo(
      `No se pudo iniciar la sesión ${sessionName}: ${String(error)}`,
      "SubBotError",
    );
    throw error;
  } finally {
    pendingRequests.delete(sessionName);
  }
}

export async function startSavedSubBots() {
  const bots = db.getAllBots();
  const sessionsToStart: string[] = [];
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

    const sessionName = String(parsedData?.sessionName || "").trim();
    if (
      !sessionName ||
      seenSessions.has(sessionName) ||
      activeSubBots.has(sessionName) ||
      pendingRequests.has(sessionName)
    ) {
      continue;
    }

    seenSessions.add(sessionName);
    sessionsToStart.push(sessionName);
  }

  logInfo(`Iniciando ${sessionsToStart.length} sub-bot(s) guardado(s).`, "SubBotInfo");
  if (sessionsToStart.length === 0) {
    logInfo("No hay sesiones de subbots guardadas para restaurar.", "SubBotInfo");
    return;
  }

  let currentIndex = 0;

  const worker = async () => {
    while (true) {
      const idx = currentIndex++;
      if (idx >= sessionsToStart.length) break;

      const sessionName = sessionsToStart[idx];
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
          "SubBotInfo",
        );
        const connection = await connectSubBot(sessionName, {
          allowPairing: false,
          onSocketCreated: (socket) => {
            managedSocket = socket;
            activeSubBots.set(sessionName, socket);
          },
          onDisconnected: () => {
            cleanSubBot(sessionName, managedSocket);
          },
        });

        if (connection) {
          managedSocket = connection;
          activeSubBots.set(sessionName, connection);
          logInfo(
            `Socket de ${sessionName} iniciado.`,
            "SubBotSuccess",
          );
        }
      } catch (error) {
        logInfo(
          `No se pudo restaurar ${sessionName}: ${String(error)}`,
          "SubBotError",
        );
        cleanSubBot(sessionName, managedSocket);
      }
    }
  };

  const workerCount = Math.min(STARTUP_CONCURRENCY, sessionsToStart.length);
  await Promise.allSettled(
    Array.from({ length: workerCount }, () => worker()),
  );
}
