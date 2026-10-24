import { randomBytes } from "node:crypto";
import { fytBold } from "./socketText.ts";
import { getActiveSubBots } from "../connection/subbotManager.ts";
import type { proto } from "baileys";
import type { ExtendedWASocket } from "../types/index.d.ts";
import { t } from "../src/langs/index.ts";


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
  return t("core_value0_value1_value2_value3_va_1abe5b70", { value0: fytBold(t("core_nuevo_reporte_f67dd1f5")), value1: fytBold(t("core_id_89f89c02")), value2: data.id, value3: fytBold(t("core_usuario_3f2ecdef")), value4: data.senderJid.split("@")[0], value5: fytBold(t("core_chat_2ced57f1")), value6: data.originName || data.originJid, value7: fytBold(t("core_bot_3a3192e2")), value8: data.botSession || "actual", value9: fytBold(t("core_fecha_bcc47609")), value10: new Date().toLocaleString("es-CR"), value11: fytBold(t("core_mensaje_eb9e23ef")), value12: reportText.replace(/\n/g, "\n┃ > "), value13: fytBold(t("core_system_active_e403484a")), value14: encodeReportData(data) });
}

export function replyCaption(text: string): string {
  return t("core_value0_value1_value2_34992875", { value0: fytBold(t("core_respuesta_de_soporte_5a7edfa4")), value1: text.replace(/\n/g, "\n"), value2: fytBold(t("core_system_active_e403484a")) });
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
