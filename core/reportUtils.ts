import { randomBytes } from "node:crypto";
import { fytBold } from "./socketText.ts";
import { getActiveSubBots } from "./subbotManager.ts";
import type { proto } from "@whiskeysockets/baileys";
import type { ExtendedWASocket } from "../types/index.d.ts";

export const REPORT_GROUP_JID = "120363410372126705@g.us";
const REPORT_MARKER = /\[AURA_REPORT:([A-Za-z0-9_-]+)\]/;

export type ReportData = {
  id: string;
  originJid: string;
  originName?: string;
  senderJid: string;
  botSession: string;
  sourceMessage?: { key: proto.IMessageKey; message: proto.IMessage };
};

export function createReportId(): string {
  return randomBytes(6).toString("hex");
}

export function encodeReportData(data: ReportData): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

export function decodeReportData(text: unknown): ReportData | null {
  const marker = String(text || "").match(REPORT_MARKER)?.[1];
  if (!marker) return null;

  try {
    const data = JSON.parse(Buffer.from(marker, "base64url").toString("utf8"));
    if (!data?.originJid || !data?.senderJid || !data?.id) return null;
    return data as ReportData;
  } catch {
    return null;
  }
}

export function getQuotedText(message: proto.IWebMessageInfo): string {
  const quoted =
    message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const extractText = (content: unknown, seen = new Set<object>()): string => {
    if (!content || typeof content !== "object" || seen.has(content)) return "";
    seen.add(content);

    const messageContent = content as Record<string, unknown>;
    const conversation = messageContent.conversation;
    if (typeof conversation === "string") return conversation;

    for (const key of ["extendedTextMessage", "imageMessage", "videoMessage", "documentMessage"]) {
      const item = messageContent[key];
      if (!item || typeof item !== "object") continue;
      const text = item as Record<string, unknown>;
      const value = text.text ?? text.caption;
      if (typeof value === "string") return value;
    }

    for (const key of [
      "ephemeralMessage",
      "viewOnceMessage",
      "viewOnceMessageV2",
      "viewOnceMessageV2Extension",
      "documentWithCaptionMessage",
      "editedMessage",
    ]) {
      const wrapped = messageContent[key];
      if (!wrapped || typeof wrapped !== "object") continue;
      const nestedMessage = (wrapped as Record<string, unknown>).message ?? wrapped;
      const text = extractText(nestedMessage, seen);
      if (text) return text;
    }

    return "";
  };

  return extractText(quoted);
}

export function reportCaption(data: ReportData, reportText: string): string {
  return `╭〔 📢 ${fytBold("NUEVO REPORTE")} 〕━⬣

┃ 🆔 ${fytBold("ID")} › ${data.id}
┃ 👤 ${fytBold("Usuario")} › @${data.senderJid.split("@")[0]}
┃ 📍 ${fytBold("Chat")} › ${data.originName || data.originJid}
┃ 🤖 ${fytBold("Bot")} › ${data.botSession || "actual"}
┃ 🕒 ${fytBold("Fecha")} › ${new Date().toLocaleString("es-CR")}

┣━━━━━━━━━━━━⬣

┃ 📝 ${fytBold("Mensaje")}
┃ > ${reportText.replace(/\n/g, "\n┃ > ")}

╰━━〔 ⚡ ${fytBold("SYSTEM ACTIVE")} 〕━━⬣
[AURA_REPORT:${encodeReportData(data)}]`;
}

export function replyCaption(text: string): string {
  return `╭〔 💬 ${fytBold("RESPUESTA DE SOPORTE")} 〕⬣\n\n┃ > ${text.replace(/\n/g, "\n")}\n\n╰━━〔 ⚡ ${fytBold("SYSTEM ACTIVE")} 〕━━⬣`;
}

export function getSocketCandidates(
  current: ExtendedWASocket,
): ExtendedWASocket[] {
  const candidates = [
    current,
    globalThis.mainSocket,
    ...getActiveSubBots(),
  ] as ExtendedWASocket[];
  return candidates.filter(
    (socket, index) =>
      socket?.sendMessage && candidates.indexOf(socket) === index,
  );
}

export async function sendWithAvailableBot(
  sockets: ExtendedWASocket[],
  jid: string,
  content: Record<string, unknown>,
  options?: Record<string, unknown>,
): Promise<unknown> {
  let lastError: unknown;
  for (const socket of sockets) {
    try {
      return await socket.sendMessage(
        jid,
        content as Parameters<typeof socket.sendMessage>[1],
        options,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Ningún bot pudo enviar el mensaje.");
}
