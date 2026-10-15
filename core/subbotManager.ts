import { connectToWhatsApp, type ConnectionOptions } from "./conection.ts";
import { db } from "../database/AuraDB.ts";
import type { ExtendedWASocket, SubBotLinkRequest } from "../types/index.d.ts";

export type LinkRequest = SubBotLinkRequest;

const activeSubBots = new Map<string, ExtendedWASocket>();
const pendingRequests = new Map<string, Promise<string>>();

const STARTUP_CONCURRENCY = 3;
const STARTUP_STAGGER_MS = 250;

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
    (socket.ev as any)?.removeAllListeners?.();
    (socket.ev as any)?.destroy?.();
  } catch {}
  try {
    socket.ws?.close();
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

  const existingPending = pendingRequests.get(sessionName);
  if (existingPending) {
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

    const connection = await connectToWhatsApp(sessionName, true, options);
    if (connection) {
      managedSocket = connection;
      activeSubBots.set(sessionName, connection);
    }

    return sessionName;
  })();

  pendingRequests.set(sessionName, task);

  try {
    return await task;
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

  if (sessionsToStart.length === 0) return;

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
        const connection = await connectToWhatsApp(sessionName, true, {
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
        }
      } catch {
        cleanSubBot(sessionName, managedSocket);
      }
    }
  };

  const workerCount = Math.min(STARTUP_CONCURRENCY, sessionsToStart.length);
  await Promise.allSettled(
    Array.from({ length: workerCount }, () => worker()),
  );
}
