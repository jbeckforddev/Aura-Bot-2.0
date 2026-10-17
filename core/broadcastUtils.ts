import { LRUCache } from "lru-cache";
import { getActiveSubBots } from "./subbotManager.ts";
import type { ExtendedWASocket } from "../types/index.d.ts";

const claimedMessages = new LRUCache<string, true>({
  max: 20_000,
  ttl: 5 * 60 * 1000,
});

export function claimOnce(key: string): boolean {
  if (claimedMessages.has(key)) return false;
  claimedMessages.set(key, true);
  return true;
}

export function getAllSockets(): ExtendedWASocket[] {
  const sockets = [globalThis.mainSocket, ...getActiveSubBots()];
  return [...new Set(
    sockets.filter(
      (socket): socket is ExtendedWASocket => Boolean(socket?.user),
    ),
  )];
}