import makeWASocket, {
  DisconnectReason,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { mkdir } from "fs/promises";
import path from "path";
import fs from "fs";
import readline from "readline";
import qrcodeTerminal from "qrcode-terminal";
import { Boom } from "@hapi/boom";
import { handleMessage } from "../handler.ts";
import { getPlugins } from "./cmdLoader.ts";
import { connectionLog, pairingLog } from "./logger.ts";
import { db } from "../database/AuraDB.ts";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import {
  handleAntilink,
  handleGroupCall,
  isPrimaryBotForGroup,
} from "./groupModeration.ts";

import type {
  ExtendedWASocket,
  ConnectionOptions,
  GroupCallEvent,
} from "../types/index.d.ts";
export type { ConnectionOptions };

export const logger = pino({ level: "silent" });

const MAX_MAIN_RECONNECT_ATTEMPTS = 2;
const WA_WEB_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const reconnectAttempts = new Map<string, number>();
const connectionsInProgress = new Set<string>();
let waWebVersionPromise: Promise<[number, number, number]> | undefined;
let waWebVersionExpiresAt = 0;

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

function scheduleReconnect(
  delayMs: number,
  sessionName: string,
  isSubBot: boolean,
  options: ConnectionOptions = {},
) {
  const currentTimer = reconnectTimers.get(sessionName);
  if (currentTimer) {
    clearTimeout(currentTimer);
  }

  const timer = setTimeout(() => {
    reconnectTimers.delete(sessionName);
    void connectToWhatsApp(sessionName, isSubBot, options);
  }, delayMs);
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

async function getBotGroups(sock: ExtendedWASocket): Promise<string[]> {
  try {
    const participating = await sock.groupFetchAllParticipating?.();
    return Object.keys(participating || {}).filter((jid) =>
      jid.endsWith("@g.us"),
    );
  } catch {
    return [];
  }
}

export async function connectToWhatsApp(
  sessionName: string,
  isSubBot: boolean = false,
  options: ConnectionOptions = {},
) {
  if (connectionsInProgress.has(sessionName)) {
    return;
  }

  connectionsInProgress.add(sessionName);

  let authState;

  try {
    const baseSessionDir = isSubBot
      ? (globalThis.subBotSession ?? "./sessions/subs")
      : (globalThis.mainBotSession ?? "./sessions");

    const sessionDir = path.join(baseSessionDir, sessionName);

    if (!fs.existsSync(sessionDir)) {
      await mkdir(sessionDir, { recursive: true });
    }

    authState = await useMultiFileAuthState(sessionDir);
  } catch (error) {
    connectionsInProgress.delete(sessionName);
    throw error;
  }

  const { state, saveCreds, close: closeAuthState } = authState;
  connectionsInProgress.delete(sessionName);

  const isRegistered = Boolean(
    state.creds && (state.creds.registered || state.creds.me),
  );

  if (isSubBot && !isRegistered && options.allowPairing === false) {
    const authBase = globalThis.subBotSession ?? "./sessions/subs";
    const authFolder = path.join(authBase, sessionName);
    if (fs.existsSync(authFolder))
      fs.rmSync(authFolder, { recursive: true, force: true });
    connectionsInProgress.delete(sessionName);
    connectionLog(
      "Sesión de subbot sin credenciales; reconexión detenida sin activar QR.",
      "alert",
    );
    return null;
  }

  let pairingMethod = options.pairingMethod;
  let pairingPhone = normalizePairingPhone(options.pairingPhone || "");

  if (!isRegistered && !isSubBot && !pairingMethod) {
    pairingLog("Selecciona el método de vinculación:");
    const option = await askQuestion("Seleccione una opción (1 o 2): ");

    if (option === "2") {
      pairingMethod = "code";
      pairingLog("Ingrese el número de teléfono con código de país");
      pairingPhone = normalizePairingPhone(
        await askQuestion("Ej: 50612345678: "),
      );

      if (!pairingPhone) {
        pairingMethod = "qr";
        connectionLog("Número inválido. Se usará QR por defecto.");
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
    connectionLog(
      "No se pudo obtener la versión de WhatsApp Web; usando la interna de Baileys.",
      "warn",
    );
  }

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ["Mac OS", "Chrome", "20.0.04"],
    logger,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 15000,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  const extendedSock = sock as ExtendedWASocket;
  if (!isSubBot) globalThis.mainSocket = extendedSock;
  extendedSock.isSubBot = isSubBot;
  extendedSock.subBotId = sessionName;
  extendedSock.sessionName = sessionName;
  await options.onSocketCreated?.(extendedSock);
  extendedSock.ev.on("creds.update", saveCreds);

  let connectionOpened = isRegistered;
  let pairingExpired = false;
  let pairingTimer: NodeJS.Timeout | null = null;

  const clearPairingTimer = () => {
    if (!pairingTimer) return;
    clearTimeout(pairingTimer);
    pairingTimer = null;
  };

  if (!isRegistered) {
    pairingTimer = setTimeout(async () => {
      if (connectionOpened) return;

      pairingExpired = true;
      try {
        (
          extendedSock.ev as unknown as {
            removeAllListeners: () => void;
            destroy?: () => void;
          }
        ).removeAllListeners();
        (extendedSock.ev as unknown as { destroy?: () => void }).destroy?.();
        void extendedSock.end?.(undefined);
        extendedSock.ws?.close();
      } catch {
        // La sesión ya puede haberse cerrado al expirar el código.
      }

      try {
        closeAuthState();
      } catch {
        // No interrumpir el aviso de expiración si la sesión ya estaba cerrada.
      }

      const authBase = isSubBot
        ? (globalThis.subBotSession ?? "./sessions/subs")
        : (globalThis.mainBotSession ?? "./sessions");
      const authFolder = path.join(authBase, sessionName);
      if (fs.existsSync(authFolder))
        fs.rmSync(authFolder, { recursive: true, force: true });

      await options.onPairingExpired?.();
    }, options.pairingTimeoutMs ?? 60_000);
  }

  if (pairingMethod === "code" && !isRegistered) {
    void (async () => {
      try {
        pairingLog(
          "Esperando estabilización del socket para generar el código",
        );
        await sock.waitForSocketOpen();
        await new Promise((resolve) => setTimeout(resolve, 3000));

        if (!pairingPhone) {
          connectionLog(
            "Falta el número telefónico para la solicitud de emparejamiento.",
            "warn",
          );
          return;
        }

        pairingLog(`Solicitando código para: ${pairingPhone}`);
        const rawCode = String(
          (await sock.requestPairingCode(pairingPhone)) || "",
        ).replace(/[^a-zA-Z0-9]/g, "");
        if (!rawCode)
          throw new Error("WhatsApp no devolvió un código de vinculación.");
        const code = rawCode.match(/.{1,4}/g)?.join("-") || rawCode;

        await options.onPairingCode?.(code);

        console.log(
          "\n" +
            "╭──────────────────────────────────────────╮\n" +
            "│ 🔑 CÓDIGO DE VINCULACIÓN PRINCIPAL:      │\n" +
            "│                                          │\n" +
            `│        ${code?.toUpperCase() ?? ""}        │\n` +
            "│                                          │\n" +
            "╰──────────────────────────────────────────╯\n",
        );
      } catch (err) {
        const pairingError =
          err instanceof Error ? err : new Error(String(err));
        connectionLog(
          `Error al solicitar el código de emparejamiento: ${pairingError.message}`,
          "error",
        );
        await options.onPairingError?.(pairingError);
      }
    })();
  }

  sock.ev.on("connection.update", async (u) => {
    if (u.qr && pairingMethod === "qr") {
      connectionLog(
        "Escanea este código QR con WhatsApp para vincular al bot.",
        "alert",
      );
      qrcodeTerminal.generate(u.qr, { small: true });
      await options.onQr?.(u.qr);
    }

    if (u.connection === "open") {
      connectionOpened = true;
      clearPairingTimer();
      const mainNum = sock.user?.id ?? "desconocido";
      const botJid = jidNormalizedUser(mainNum);
      let botId = String(
        (sock.user as unknown as Record<string, unknown>)?.lid || "",
      ).trim();
      if (!botId) {
        try {
          botId = String(
            (await sock.signalRepository?.lidMapping?.getLIDForPN(botJid)) ||
              "",
          ).trim();
        } catch {
          botId = "";
        }
      }
      botId = normalizeBotId(botId, botJid);
      const botPhoneNumber = cleanPhoneNumber(botJid);
      const botLid = cleanLid(botId);
      const botGroups = await getBotGroups(extendedSock);
      const previousBot = db.getBot(botJid);
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
        groups: botGroups,
        isMain: isSubBot ? 0 : 1,
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
      connectionLog(
        `WhatsApp conectado correctamente. JID: ${mainNum}`,
        "alert",
      );
      await options.onConnected?.();
      return;
    }

    if (u.connection !== "close") {
      return;
    }

    clearPairingTimer();
    await options.onDisconnected?.();
    if (pairingExpired) return;

    if (extendedSock.manualLogout) {
      try {
        (
          extendedSock.ev as unknown as {
            removeAllListeners: () => void;
            destroy?: () => void;
          }
        ).removeAllListeners();
        (extendedSock.ev as unknown as { destroy?: () => void }).destroy?.();
        void extendedSock.end?.(undefined);
        closeAuthState();
      } catch {
        // La sesión puede haberse cerrado antes de ejecutar la limpieza.
      }

      const authBase = isSubBot
        ? (globalThis.subBotSession ?? "./sessions/subs")
        : (globalThis.mainBotSession ?? "./sessions");
      const authFolder = path.join(authBase, sessionName);
      if (fs.existsSync(authFolder))
        fs.rmSync(authFolder, { recursive: true, force: true });
      const logoutBotJid = sock.user?.id
        ? jidNormalizedUser(sock.user.id)
        : sessionName;
      db.setBot(logoutBotJid, { status: "offline" });
      connectionLog(
        "Sesión cerrada por comando del bot. No se reconectará automáticamente.",
        "alert",
      );

      if (!isSubBot) {
        globalThis.mainSocket = null;
        connectionLog(
          "Iniciando nuevamente el menú de vinculación del bot principal...",
          "alert",
        );
        void connectToWhatsApp(sessionName, false);
      }
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

    try {
      (
        sock.ev as unknown as {
          removeAllListeners: () => void;
          destroy?: () => void;
        }
      ).removeAllListeners();
      (sock.ev as unknown as { destroy?: () => void }).destroy?.();
      void sock.end?.(error);
    } catch (cleanupErr) {
      connectionLog(
        `Aviso al limpiar socket desconectado: ${String(cleanupErr)}`,
        "warn",
      );
    }

    try {
      closeAuthState();
    } catch (closeError) {
      connectionLog(`Error al cerrar sesión: ${String(closeError)}`, "error");
    }

    connectionLog(
      `Conexión cerrada. Código: ${String(statusCode || "N/A")}. Motivo: ${errorMessage}`,
      statusCode === 0 ? "warn" : "error",
    );

    const currentIsRegistered = Boolean(
      state.creds && (state.creds.registered || state.creds.me),
    );
    const isNotRegistered = !currentIsRegistered;

    const disconnectedBotJid = sock.user?.id
      ? jidNormalizedUser(sock.user.id)
      : "";
    if (disconnectedBotJid && !isNotRegistered) {
      db.setBot(disconnectedBotJid, { status: "offline" });
    }

    if (isSubBot && isNotRegistered) {
      pairingExpired = true;
      const authBase = globalThis.subBotSession ?? "./sessions/subs";
      const authFolder = path.join(authBase, sessionName);
      if (fs.existsSync(authFolder)) {
        try {
          fs.rmSync(authFolder, { recursive: true, force: true });
        } catch (cleanupError) {
          connectionLog(
            `Error al limpiar la vinculación del subbot: ${String(cleanupError)}`,
            "error",
          );
        }
      }

      db.deleteBot(sessionName);
      await options.onPairingExpired?.();
      connectionLog(
        "Vinculación del subbot detenida definitivamente; no se solicitará un QR de respaldo.",
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
    ];

    const shouldResetSession =
      [
        DisconnectReason.loggedOut,
        DisconnectReason.badSession,
        DisconnectReason.forbidden,
        DisconnectReason.multideviceMismatch,
      ].includes(statusCode) || isNotRegistered;

    const isTransientDisconnect =
      transientDisconnectCodes.includes(statusCode) && !isNotRegistered;

    if (isTransientDisconnect) {
      const retryCount = registerReconnectAttempt(sessionName);
      const delayMs = Math.min(5000 * retryCount, 20000);
      connectionLog(
        `Desconexión temporal detectada. Reintentando sin borrar la sesión actual...`,
        "warn",
      );
      scheduleReconnect(delayMs, sessionName, isSubBot, options);
      return;
    }

    if (shouldResetSession) {
      if (isNotRegistered) {
        connectionLog(
          "La vinculación fue interrumpida, expiró o la IP está bloqueada.",
          "alert",
        );
      } else {
        connectionLog(
          "La sesión no es válida o fue desvinculada por WhatsApp.",
          "alert",
        );
      }

      connectionLog(
        "Limpiando credenciales y reiniciando el proceso de vinculación...",
        "warn",
      );
      const authBase = isSubBot
        ? (globalThis.subBotSession ?? "./sessions/subs")
        : (globalThis.mainBotSession ?? "./sessions");
      const authFolder = path.join(authBase, sessionName);
      if (fs.existsSync(authFolder)) {
        try {
          fs.rmSync(authFolder, { recursive: true, force: true });
        } catch (error) {
          connectionLog(
            `Error al limpiar credenciales: ${String(error)}`,
            "error",
          );
        }
      }

      connectionLog(
        "Iniciando nuevo proceso de vinculación en 3 segundos...",
        "warn",
      );
      scheduleReconnect(3000, sessionName, isSubBot, options);
      return;
    }

    const retryCount = registerReconnectAttempt(sessionName);
    if (retryCount >= MAX_MAIN_RECONNECT_ATTEMPTS) {
      connectionLog(
        `Se alcanzó el máximo de reintentos. Reiniciando emparejamiento...`,
        "alert",
      );
      const authBase = isSubBot
        ? (globalThis.subBotSession ?? "./sessions/subs")
        : (globalThis.mainBotSession ?? "./sessions");
      const authFolder = path.join(authBase, sessionName);
      if (fs.existsSync(authFolder)) {
        try {
          fs.rmSync(authFolder, { recursive: true, force: true });
        } catch (error) {
          connectionLog(
            `Error al limpiar la sesión principal: ${String(error)}`,
            "error",
          );
        }
      }

      resetReconnectAttempts(sessionName);
      return;
    }

    connectionLog(
      `Conexión interrumpida. Reconectando en 5 segundos... intento ${retryCount}/${MAX_MAIN_RECONNECT_ATTEMPTS}`,
      "warn",
    );
    scheduleReconnect(5000, sessionName, isSubBot, options);
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    if (!Array.isArray(messages) || messages.length === 0) return;

    for (const msg of messages) {
      if (!msg) continue;

      try {
        if (msg.key?.remoteJid?.endsWith("@g.us")) {
          const connectedBot = sock.user?.id || "";
          if (connectedBot) db.addBotGroup(connectedBot, msg.key.remoteJid);
        }
        await handleMessage(
          sock,
          msg,
          isSubBot ? "SUB" : "MAIN",
          sock.user?.id ?? null,
          [],
          {
            db,
            config: {
              prefix: globalThis.DEFAULT_PREFIXES ?? ["."],
            },
            getPlugins: () => getPlugins(),
            checkAntilink: ({
              sock: messageSock,
              msg,
              body,
              isAdmin,
              isOwner,
              isBotAdmin,
            }) =>
              handleAntilink(
                messageSock,
                msg,
                body,
                isAdmin,
                isOwner,
                isBotAdmin,
              ),
            logger: {
              message: () => {},
              warn: (payload: unknown) =>
                connectionLog(String(payload), "warn"),
              error: (payload: unknown) =>
                connectionLog(String(payload), "error"),
              cmdExec: () => {},
            },
          },
        );
      } catch (error) {
        connectionLog(`Error al procesar mensaje: ${String(error)}`, "error");
      }
    }
  });

  sock.ev.on("call", async (calls: unknown[]) => {
    if (!Array.isArray(calls)) return;
    for (const call of calls) {
      await handleGroupCall(sock, call as GroupCallEvent, db);
    }
  });

  sock.ev.on(
    "group-participants.update",
    async ({ id, participants, action }) => {
      if (
        !id ||
        !Array.isArray(participants) ||
        !["add", "remove"].includes(action)
      )
        return;
      if (!isPrimaryBotForGroup(sock, id, db)) return;

      try {
        const metadata = await sock.groupMetadata(id);
        const group = db.getGroup(id);
        const groupName = metadata?.subject || group.group_name || id;

        if (group.group_name !== groupName) {
          db.setGroup(id, { group_name: groupName });
        }

        const setting = action === "add" ? "welcome" : "goodbye";
        if (!group[setting]) return;

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
        const mentions = participantJids;
        const tags = participantJids
          .map((participant: string) => `@${participant.split("@")[0]}`)
          .join(", ");
        const groupDescription =
          metadata?.desc?.toString() || "Sin descripción";
        const memberCount = metadata?.participants?.length || 0;
        const text = template
          .replaceAll("{group}", groupName)
          .replaceAll("{mention}", tags)
          .replaceAll("@user", tags)
          .replaceAll("@group", groupName)
          .replaceAll("@desc", groupDescription)
          .replaceAll("@count", String(memberCount));

        await sock.sendMessage(id, { text, mentions }, { quoted: undefined });
      } catch (error) {
        connectionLog(
          `Error en evento de participantes del grupo: ${String(error)}`,
          "error",
        );
      }
    },
  );

  return sock;
}
