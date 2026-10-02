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
      (socket.ev as unknown as { destroy?: () => void })?.destroy?.();
      void socket.end?.(undefined);
    } catch {
      // Ignorar errores al cerrar socket del subbot
    }
  }
  activeSubBots.delete(sessionName);
}

export function forgetActiveSubBot(sessionName: string) {
  cleanSubBot(sessionName);
}

export async function requestSubBotLink(request: LinkRequest) {
  const storedUser = db.getUser(request.requester);
  const storedPhone = normalizePhone(storedUser?.phone_number);
  const manualPhone = normalizePhone(request.phoneNumber);

  if (request.method === "code" && !storedPhone && !manualPhone) {
    throw new Error(
      "No tienes un teléfono guardado. Usa .code <número con código de país>.",
    );
  }

  const sessionName = sessionNameFor(request.requester);
  if (activeSubBots.has(sessionName)) {
    throw new Error(
      "Ya hay una vinculación de subbot en curso para este usuario.",
    );
  }

  const options: ConnectionOptions = {
    pairingMethod: request.method,
    allowPairing: true,
    pairingPhone: storedPhone || manualPhone,
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
  for (const bot of db.getAllBots()) {
    if (String(bot.jid || "").startsWith("sub-")) {
      db.deleteBot(bot.jid);
      continue;
    }

    const sessionName = (bot.data as Record<string, unknown> | undefined)
      ?.sessionName as string | undefined;
    if (bot.isMain || !sessionName) continue;
    if (activeSubBots.has(sessionName)) continue;

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
