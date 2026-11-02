import type { ExtendedWASocket } from "../types/index.d.ts";

const activeSockets = new Map<string, ExtendedWASocket>();

export function registerActiveBot(
  sessionName: string,
  socket: ExtendedWASocket,
): void {
  activeSockets.set(sessionName, socket);
}

export function unregisterActiveBot(
  sessionName: string,
  socket?: ExtendedWASocket,
): void {
  if (!socket || activeSockets.get(sessionName) === socket) {
    activeSockets.delete(sessionName);
  }
}

export function getActiveBotSockets(): ExtendedWASocket[] {
  return [...activeSockets.values()].filter(
    (socket) => Boolean(socket.user?.id) && !(socket as any).isClosed,
  );
}
