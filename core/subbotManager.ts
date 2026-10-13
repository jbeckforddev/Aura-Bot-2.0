import { connectToWhatsApp, type ConnectionOptions } from "./conection.ts";
import { db } from "../database/AuraDB.ts";
import type { ExtendedWASocket, SubBotLinkRequest } from "../types/index.d.ts";

export type LinkRequest = SubBotLinkRequest;

const activeSubBots = new Map<string, ExtendedWASocket>();

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function sessionNameFor(requester: string): string {
  return `sub-${String(requester).split("@")[0].replace(/\D/g, "") || "bot"}`;
}

export function getActiveSubBots(): ExtendedWASocket[] {
  return [...activeSubBots.values()];
}

function cleanSubBot(sessionName: string) {
  const socket = activeSubBots.get(sessionName);
  if (socket) {
    try {
      (socket.ev as any)?.removeAllListeners?.();
      (socket.ev as any)?.destroy?.();
      socket.ws?.close();
      socket.end?.(undefined);
    } catch {}
  }
  activeSubBots.delete(sessionName);
}

export function forgetActiveSubBot(sessionName: string) {
  cleanSubBot(sessionName);
}

export async function requestSubBotLink(request: LinkRequest) {
  const manualPhone = normalizePhone(request.phoneNumber);
  const storedPhone = normalizePhone(db.getUser(request.requester)?.phone_number);
  const pairingPhone = manualPhone || storedPhone;

  if (request.method === "code" && !pairingPhone) {
    throw new Error("No se pudo obtener un número de teléfono válido para la vinculación.");
  }

  const sessionName = sessionNameFor(request.requester);
  
  if (activeSubBots.has(sessionName)) {
    cleanSubBot(sessionName);
  }

  const options: ConnectionOptions = {
    pairingMethod: request.method,
    allowPairing: true,
    pairingPhone,
    onSocketCreated: (socket) => {
      activeSubBots.set(sessionName, socket);
    },
    pairingTimeoutMs: 60_000,
    onQr: request.onQr,
    onPairingCode: request.onPairingCode,
    onConnected: request.onConnected,
    onPairingError: async (error) => {
      cleanSubBot(sessionName);
      db.deleteBot(sessionName);
      await request.onPairingError?.(error);
    },
    onPairingExpired: () => {
      cleanSubBot(sessionName);
      db.deleteBot(sessionName);
      return request.onPairingExpired?.();
    },
    onDisconnected: () => {
      cleanSubBot(sessionName);
    },
  };

  const connection = await connectToWhatsApp(sessionName, true, options);
  if (connection) activeSubBots.set(sessionName, connection);

  return sessionName;
}

export async function startSavedSubBots() {
  const bots = db.getAllBots();
  for (const bot of bots) {
    if (String(bot.jid || "").startsWith("sub-")) {
      db.deleteBot(bot.jid);
      continue;
    }

    const sessionName = (bot.data as Record<string, unknown> | undefined)?.sessionName as string | undefined;
    if (bot.isMain || !sessionName || activeSubBots.has(sessionName)) continue;

    const connection = await connectToWhatsApp(sessionName, true, {
      allowPairing: false,
      onSocketCreated: (socket) => {
        activeSubBots.set(sessionName, socket);
      },
      onDisconnected: () => {
        cleanSubBot(sessionName);
      },
    });
    
    if (connection) activeSubBots.set(sessionName, connection);
  }
}
