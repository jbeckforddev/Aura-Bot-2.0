import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import * as http from "node:http";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const execAsync = promisify(exec);

interface ChatMessageItem {
  id: string;
  sender: string;
  pushName: string;
  text: string;
  time: string;
  timestamp: number;
  fromMe: boolean;
  mediaType?: "image" | "sticker" | "video" | "audio" | "document" | null;
  mediaMime?: string;
  hasMedia?: boolean;
  quotedId?: string;
  quotedSender?: string;
  quotedText?: string;
  reactions?: Record<string, string>;
  rawKey?: any;
  rawMessage?: any;
}

interface ChatSessionItem {
  jid: string;
  name: string;
  isGroup: boolean;
  unread: number;
  lastTime: number;
  lastPreview: string;
  avatarUrl?: string | null;
  statusText?: string;
  messages: ChatMessageItem[];
}

interface CallLogItem {
  id: string;
  botKey: string;
  peerJid: string;
  peerName: string;
  isVideo: boolean;
  isGroup: boolean;
  direction: "incoming" | "outgoing";
  status: string;
  timestamp: number;
  timeStr: string;
}

interface MediaBufferItem {
  mime: string;
  buffer: Buffer;
  createdAt: number;
}

interface ReportRecord {
  phone: string;
  totalReports: number;
  subbotsUsed: Set<string>;
  lastTimestamp: string;
}

interface WebPanelState {
  server: http.Server | null;
  port: number;
  token: string;
  tempUser: string;
  tempPass: string;
  ownerEmail: string;
  tunnelUrl: string | null;
  publicIp: string | null;
  tunnelProcess: ChildProcess | null;
  msgRx: number;
  msgTx: number;
  subbotsPaused: boolean;
  pausedBotIds: Set<string>;
  blockedCommands: Set<string>;
  wrappedCommands: Map<string, (...args: any[]) => Promise<any>>;
  hookedSockets: WeakSet<object>;
  originalSenders: WeakMap<object, (...args: any[]) => Promise<any>>;
  reportRegistry: Map<string, ReportRecord>;
  botChatStores: Map<string, Map<string, ChatSessionItem>>;
  botGroupSynced: Set<string>;
  mediaStore: Map<string, MediaBufferItem>;
  avatarCache: Map<string, string>;
  callLogs: CallLogItem[];
  autoRejectCalls: boolean;
  autoRejectMessage: string;
  lastSock: any;
}

const gState = globalThis as unknown as { __auraWebPanel?: WebPanelState };

if (!gState.__auraWebPanel) {
  gState.__auraWebPanel = {
    server: null,
    port: 0,
    token: randomBytes(12).toString("hex"),
    tempUser: `lufer_${randomBytes(2).toString("hex")}`,
    tempPass: String(Math.floor(100000 + Math.random() * 900000)),
    ownerEmail: "luisfernandoguzmannino@gmail.com",
    tunnelUrl: null,
    publicIp: null,
    tunnelProcess: null,
    msgRx: 0,
    msgTx: 0,
    subbotsPaused: false,
    pausedBotIds: new Set<string>(),
    blockedCommands: new Set<string>(),
    wrappedCommands: new Map(),
    hookedSockets: new WeakSet(),
    originalSenders: new WeakMap(),
    reportRegistry: new Map(),
    botChatStores: new Map(),
    botGroupSynced: new Set(),
    mediaStore: new Map(),
    avatarCache: new Map(),
    callLogs: [],
    autoRejectCalls: false,
    autoRejectMessage: "⚠️ No puedo responder llamadas en este momento. Envíame un mensaje de texto.",
    lastSock: null,
  };
}

const state = gState.__auraWebPanel!;

if (!state.pausedBotIds) state.pausedBotIds = new Set<string>();
if (!state.botChatStores) state.botChatStores = new Map();
if (!state.botGroupSynced) state.botGroupSynced = new Set();
if (!state.reportRegistry) state.reportRegistry = new Map();
if (!state.mediaStore) state.mediaStore = new Map();
if (!state.avatarCache) state.avatarCache = new Map();
if (!state.callLogs) state.callLogs = [];
if (state.autoRejectCalls === undefined) state.autoRejectCalls = false;
if (!state.autoRejectMessage) {
  state.autoRejectMessage = "⚠️ No puedo responder llamadas en este momento. Envíame un mensaje de texto.";
}

let cachedBaileysMod: any = null;
async function getBaileysModule(): Promise<any> {
  if (cachedBaileysMod) return cachedBaileysMod;
  try {
    cachedBaileysMod = await import("baileys");
    return cachedBaileysMod;
  } catch {}
  try {
    cachedBaileysMod = await import("@whiskeysockets/baileys");
    return cachedBaileysMod;
  } catch {}
  return null;
}

function saveMediaToStore(id: string, mime: string, buffer: Buffer) {
  if (!id || !buffer || !buffer.length) return;
  state.mediaStore.set(id, { mime, buffer, createdAt: Date.now() });
  if (state.mediaStore.size > 180) {
    const oldestKey = state.mediaStore.keys().next().value;
    if (oldestKey) state.mediaStore.delete(oldestKey);
  }
}

function rotateCredentials() {
  state.token = randomBytes(12).toString("hex");
  state.tempUser = `lufer_${randomBytes(2).toString("hex")}`;
  state.tempPass = String(Math.floor(100000 + Math.random() * 900000));
}

function getBotKey(botSock: any, fallbackIndex = 0): string {
  const raw = botSock?.user?.id || `bot_${fallbackIndex}`;
  return String(raw).split("@")[0].split(":")[0] || `bot_${fallbackIndex}`;
}

function ensureBotChatMap(botKey: string): Map<string, ChatSessionItem> {
  if (!state.botChatStores.has(botKey)) {
    state.botChatStores.set(botKey, new Map());
  }
  return state.botChatStores.get(botKey)!;
}

function unwrapMessage(msgObj: any): any {
  if (!msgObj) return null;
  return (
    msgObj.ephemeralMessage?.message ||
    msgObj.viewOnceMessage?.message ||
    msgObj.viewOnceMessageV2?.message ||
    msgObj.viewOnceMessageV2Extension?.message ||
    msgObj.documentWithCaptionMessage?.message ||
    msgObj
  );
}

function extractMessageDetails(msgObj: any): {
  text: string;
  mediaType: "image" | "sticker" | "video" | "audio" | "document" | null;
  mediaMime: string;
  mediaNode: any;
  thumbBuffer: Buffer | null;
  quotedId: string;
  quotedSender: string;
  quotedText: string;
} {
  const empty = {
    text: "",
    mediaType: null as any,
    mediaMime: "",
    mediaNode: null,
    thumbBuffer: null as Buffer | null,
    quotedId: "",
    quotedSender: "",
    quotedText: "",
  };
  const m = unwrapMessage(msgObj);
  if (!m) return empty;

  const ctxInfo =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    null;

  let quotedId = "";
  let quotedSender = "";
  let quotedText = "";

  if (ctxInfo?.quotedMessage) {
    quotedId = ctxInfo.stanzaId || "";
    quotedSender = String(ctxInfo.participant || "").split("@")[0].split(":")[0];
    const qUnwrapped = unwrapMessage(ctxInfo.quotedMessage);
    quotedText =
      qUnwrapped?.conversation ||
      qUnwrapped?.extendedTextMessage?.text ||
      qUnwrapped?.imageMessage?.caption ||
      (qUnwrapped?.imageMessage ? "📷 Imagen" : "") ||
      (qUnwrapped?.stickerMessage ? "🏷️ Sticker" : "") ||
      (qUnwrapped?.audioMessage ? "🎤 Audio" : "") ||
      (qUnwrapped?.videoMessage ? "🎥 Video" : "") ||
      "[Mensaje citado]";
  }

  if (typeof m.conversation === "string" && m.conversation) {
    return { ...empty, text: m.conversation, quotedId, quotedSender, quotedText };
  }
  if (typeof m.extendedTextMessage?.text === "string" && m.extendedTextMessage.text) {
    return { ...empty, text: m.extendedTextMessage.text, quotedId, quotedSender, quotedText };
  }
  if (m.imageMessage) {
    const thumb = m.imageMessage.jpegThumbnail ? Buffer.from(m.imageMessage.jpegThumbnail) : null;
    return {
      text: m.imageMessage.caption || "",
      mediaType: "image",
      mediaMime: m.imageMessage.mimetype || "image/jpeg",
      mediaNode: m.imageMessage,
      thumbBuffer: thumb,
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.stickerMessage) {
    return {
      text: "",
      mediaType: "sticker",
      mediaMime: m.stickerMessage.mimetype || "image/webp",
      mediaNode: m.stickerMessage,
      thumbBuffer: null,
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.videoMessage) {
    const thumb = m.videoMessage.jpegThumbnail ? Buffer.from(m.videoMessage.jpegThumbnail) : null;
    return {
      text: m.videoMessage.caption || "",
      mediaType: "video",
      mediaMime: m.videoMessage.mimetype || "video/mp4",
      mediaNode: m.videoMessage,
      thumbBuffer: thumb,
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.audioMessage) {
    return {
      text: m.audioMessage.ptt ? "🎤 Nota de voz" : "🎵 Audio",
      mediaType: "audio",
      mediaMime: m.audioMessage.mimetype || "audio/ogg; codecs=opus",
      mediaNode: m.audioMessage,
      thumbBuffer: null,
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.documentMessage) {
    return {
      text: `📄 ${m.documentMessage.fileName || "Documento"}`,
      mediaType: "document",
      mediaMime: m.documentMessage.mimetype || "application/octet-stream",
      mediaNode: m.documentMessage,
      thumbBuffer: null,
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.contactMessage) {
    return { ...empty, text: `👤 Contacto: ${m.contactMessage.displayName || ""}` };
  }
  if (m.locationMessage) {
    return { ...empty, text: `📍 Ubicación (${m.locationMessage.degreesLatitude}, ${m.locationMessage.degreesLongitude})` };
  }
  if (m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3) {
    const poll = m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3;
    return { ...empty, text: `📊 Encuesta: ${poll.name || ""}` };
  }
  if (m.interactiveMessage || m.buttonsMessage || m.templateMessage) {
    return { ...empty, text: "🎛️ [Mensaje Interactivo]" };
  }
  return empty;
}

async function downloadAndCacheMedia(botSock: any, fullMsg: any, msgId: string, details: ReturnType<typeof extractMessageDetails>) {
  if (!details.mediaType || !details.mediaNode) return;
  if (details.thumbBuffer && !state.mediaStore.has(msgId)) {
    saveMediaToStore(msgId, "image/jpeg", details.thumbBuffer);
  }
  try {
    const bMod = await getBaileysModule();
    if (bMod && typeof bMod.downloadContentFromMessage === "function") {
      const dlType = details.mediaType === "sticker" ? "sticker" : details.mediaType;
      const stream = await bMod.downloadContentFromMessage(details.mediaNode, dlType);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buf = Buffer.concat(chunks);
      if (buf.length > 0) {
        saveMediaToStore(msgId, details.mediaMime, buf);
        return;
      }
    }
    if (bMod && typeof bMod.downloadMediaMessage === "function") {
      const buf = await bMod.downloadMediaMessage(
        fullMsg,
        "buffer",
        {},
        { logger: undefined, reuploadRequest: botSock?.updateMediaMessage }
      );
      if (Buffer.isBuffer(buf) && buf.length > 0) {
        saveMediaToStore(msgId, details.mediaMime, buf);
      }
    }
  } catch {}
}

function recordChatMessage(
  botKey: string,
  remoteJid: string,
  msgData: {
    id: string;
    sender: string;
    pushName: string;
    text: string;
    fromMe: boolean;
    chatName?: string;
    timestamp?: number;
    mediaType?: "image" | "sticker" | "video" | "audio" | "document" | null;
    mediaMime?: string;
    hasMedia?: boolean;
    quotedId?: string;
    quotedSender?: string;
    quotedText?: string;
    rawKey?: any;
    rawMessage?: any;
  }
) {
  if (!remoteJid || remoteJid === "status@broadcast") return;
  if (!msgData.text && !msgData.mediaType) return;

  const store = ensureBotChatMap(botKey);
  const isGroup = remoteJid.endsWith("@g.us");
  const cleanRemote = remoteJid.split("@")[0].split(":")[0];
  const nowTs = msgData.timestamp || Date.now();
  const timeStr = new Date(nowTs).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const previewLabel =
    msgData.mediaType === "sticker"
      ? "🏷️ Sticker"
      : msgData.mediaType === "image"
      ? `📷 ${msgData.text || "Foto"}`
      : msgData.mediaType === "video"
      ? `🎥 ${msgData.text || "Video"}`
      : msgData.mediaType === "audio"
      ? "🎤 Audio"
      : msgData.text;

  let session = store.get(remoteJid);
  if (!session) {
    session = {
      jid: remoteJid,
      name: msgData.chatName || (isGroup ? `Grupo ${cleanRemote}` : msgData.pushName || `+${cleanRemote}`),
      isGroup,
      unread: 0,
      lastTime: nowTs,
      lastPreview: previewLabel.slice(0, 70),
      messages: [],
    };
    store.set(remoteJid, session);
  } else {
    if (msgData.chatName && (session.name.startsWith("Grupo ") || session.name.startsWith("+"))) {
      session.name = msgData.chatName;
    } else if (!isGroup && !msgData.fromMe && msgData.pushName && session.name.startsWith("+")) {
      session.name = msgData.pushName;
    }
  }

  const existingMsg = session.messages.find((x) => x.id === msgData.id);
  if (existingMsg) {
    if (msgData.hasMedia) existingMsg.hasMedia = true;
    return;
  }

  session.lastTime = nowTs;
  session.lastPreview = previewLabel.slice(0, 70);
  if (!msgData.fromMe) {
    session.unread = Math.min(999, session.unread + 1);
  }

  session.messages.push({
    id: msgData.id,
    sender: msgData.sender,
    pushName: msgData.pushName,
    text: msgData.text,
    time: timeStr,
    timestamp: nowTs,
    fromMe: msgData.fromMe,
    mediaType: msgData.mediaType || null,
    mediaMime: msgData.mediaMime || "",
    hasMedia: Boolean(msgData.hasMedia || msgData.mediaType),
    quotedId: msgData.quotedId || "",
    quotedSender: msgData.quotedSender || "",
    quotedText: msgData.quotedText || "",
    reactions: {},
    rawKey: msgData.rawKey,
    rawMessage: msgData.rawMessage,
  });

  if (session.messages.length > 160) {
    session.messages.splice(0, session.messages.length - 160);
  }
}

function getAllBotSockets(mainSock?: any): any[] {
  const base = mainSock || state.lastSock;
  let subs: any[] = [];
  try {
    if (typeof getActiveSubBots === "function") {
      subs = getActiveSubBots() || [];
    }
  } catch {
    subs = [];
  }
  const combined = [base, ...subs].filter(Boolean);
  const seen = new Set<any>();
  return combined.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

async function syncBotGroupsToStore(botSock: any, idx: number) {
  const botKey = getBotKey(botSock, idx);
  if (state.botGroupSynced.has(botKey)) return;
  state.botGroupSynced.add(botKey);

  const store = ensureBotChatMap(botKey);
  if (typeof botSock?.groupFetchAllParticipating === "function") {
    try {
      const groups = await botSock.groupFetchAllParticipating();
      for (const [jid, meta] of Object.entries(groups || {}) as Array<[string, any]>) {
        const existing = store.get(jid);
        if (!existing) {
          store.set(jid, {
            jid,
            name: meta?.subject || `Grupo ${jid.split("@")[0]}`,
            isGroup: true,
            unread: 0,
            lastTime: meta?.creation ? Number(meta.creation) * 1000 : Date.now() - 86400000,
            lastPreview: `👥 ${meta?.participants?.length || 0} miembros`,
            statusText: meta?.desc ? String(meta.desc).slice(0, 120) : "",
            messages: [],
          });
        } else {
          if (meta?.subject) existing.name = meta.subject;
          if (meta?.desc) existing.statusText = String(meta.desc).slice(0, 120);
        }
      }
    } catch {}
  }
}

function hookSockets(mainSock?: any) {
  if (mainSock) state.lastSock = mainSock;
  const sockets = getAllBotSockets(mainSock);

  sockets.forEach((botSock, index) => {
    if (!botSock || typeof botSock !== "object") return;
    const botKey = getBotKey(botSock, index);
    ensureBotChatMap(botKey);

    if (!state.hookedSockets.has(botSock)) {
      state.hookedSockets.add(botSock);

      if (botSock.ev && typeof botSock.ev.on === "function") {
        botSock.ev.on("messages.upsert", ({ messages }: any) => {
          if (!Array.isArray(messages)) return;
          const currentKey = getBotKey(botSock, index);
          for (const m of messages) {
            if (!m?.message) continue;

            if (m.message.reactionMessage) {
              const reactObj = m.message.reactionMessage;
              const targetId = reactObj.key?.id;
              const rJid = reactObj.key?.remoteJid || m.key?.remoteJid;
              const emoji = reactObj.text || "";
              const reactor = String(m.key?.participant || m.key?.remoteJid || "user").split("@")[0];
              if (rJid && targetId) {
                const chat = ensureBotChatMap(currentKey).get(rJid);
                const targetMsg = chat?.messages.find((x) => x.id === targetId);
                if (targetMsg) {
                  if (!targetMsg.reactions) targetMsg.reactions = {};
                  if (emoji) targetMsg.reactions[reactor] = emoji;
                  else delete targetMsg.reactions[reactor];
                }
              }
              continue;
            }

            const fromMe = Boolean(m.key?.fromMe);
            if (fromMe) state.msgTx++;
            else state.msgRx++;

            const remoteJid = m.key?.remoteJid || "";
            const participant = m.key?.participant || (fromMe ? botSock?.user?.id : remoteJid) || "";
            const senderNum = String(participant).split("@")[0].split(":")[0];
            const pushName = fromMe ? (botSock?.user?.name || "Bot") : (m.pushName || `+${senderNum}`);
            const msgId = m.key?.id || randomBytes(6).toString("hex");
            const rawTs = typeof m.messageTimestamp === "number" ? m.messageTimestamp * 1000 : Date.now();

            const details = extractMessageDetails(m.message);
            if (!details.text && !details.mediaType) continue;

            if (details.mediaType) {
              downloadAndCacheMedia(botSock, m, msgId, details).catch(() => {});
            }

            recordChatMessage(currentKey, remoteJid, {
              id: msgId,
              sender: senderNum,
              pushName,
              text: details.text,
              fromMe,
              timestamp: rawTs,
              mediaType: details.mediaType,
              mediaMime: details.mediaMime,
              hasMedia: Boolean(details.mediaType),
              quotedId: details.quotedId,
              quotedSender: details.quotedSender,
              quotedText: details.quotedText,
              rawKey: m.key,
              rawMessage: m,
            });
          }
        });

        botSock.ev.on("call", async (calls: any[]) => {
          if (!Array.isArray(calls)) return;
          const currentKey = getBotKey(botSock, index);
          for (const c of calls) {
            const callId = String(c.id || randomBytes(4).toString("hex"));
            const peerJid = String(c.from || c.chatId || "");
            const cleanPeer = peerJid.split("@")[0].split(":")[0];
            const status = String(c.status || "offer");
            const isVideo = Boolean(c.isVideo);
            const isGroup = Boolean(c.isGroup || peerJid.endsWith("@g.us"));
            const now = Date.now();
            const timeStr = new Date(now).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });

            const existingCall = state.callLogs.find((x) => x.id === callId && x.botKey === currentKey);
            if (existingCall) {
              existingCall.status = status;
              existingCall.timestamp = now;
              existingCall.timeStr = timeStr;
            } else {
              const store = ensureBotChatMap(currentKey);
              const knownName = store.get(peerJid)?.name || `+${cleanPeer}`;
              state.callLogs.unshift({
                id: callId,
                botKey: currentKey,
                peerJid,
                peerName: knownName,
                isVideo,
                isGroup,
                direction: "incoming",
                status,
                timestamp: now,
                timeStr,
              });
              if (state.callLogs.length > 80) state.callLogs.pop();

              recordChatMessage(currentKey, peerJid, {
                id: `call_${callId}`,
                sender: cleanPeer,
                pushName: knownName,
                text: `${isVideo ? "📹 Videollamada" : "📞 Llamada de voz"} entrante (${status.toUpperCase()})`,
                fromMe: false,
                timestamp: now,
              });
            }

            if (status === "offer" && state.autoRejectCalls) {
              try {
                if (typeof botSock.rejectCall === "function") {
                  await botSock.rejectCall(callId, peerJid);
                }
                if (state.autoRejectMessage && peerJid) {
                  const origSend = state.originalSenders.get(botSock) || botSock.sendMessage.bind(botSock);
                  await origSend(peerJid, { text: state.autoRejectMessage });
                }
              } catch {}
            }
          }
        });
      }

      if (typeof botSock.sendMessage === "function") {
        const origSend = botSock.sendMessage.bind(botSock);
        state.originalSenders.set(botSock, origSend);

        botSock.sendMessage = async (jid: string, content: any, options?: any) => {
          const currentKey = getBotKey(botSock, index);
          const isSub = Boolean(botSock.isSubBot || index > 0);
          if ((state.subbotsPaused && isSub) || state.pausedBotIds.has(currentKey)) {
            return undefined;
          }
          state.msgTx++;
          const res = await origSend(jid, content, options);

          try {
            const msgId = res?.key?.id || randomBytes(6).toString("hex");
            let mediaType: "image" | "sticker" | "video" | "audio" | "document" | null = null;
            let mediaMime = "";
            let textPreview = "";

            if (typeof content?.text === "string") {
              textPreview = content.text;
            } else if (content?.image) {
              mediaType = "image";
              mediaMime = content.mimetype || "image/jpeg";
              textPreview = content.caption || "";
              if (Buffer.isBuffer(content.image)) saveMediaToStore(msgId, mediaMime, content.image);
            } else if (content?.sticker) {
              mediaType = "sticker";
              mediaMime = content.mimetype || "image/webp";
              if (Buffer.isBuffer(content.sticker)) saveMediaToStore(msgId, mediaMime, content.sticker);
            } else if (content?.video) {
              mediaType = "video";
              mediaMime = content.mimetype || "video/mp4";
              textPreview = content.caption || "";
              if (Buffer.isBuffer(content.video)) saveMediaToStore(msgId, mediaMime, content.video);
            } else if (content?.audio) {
              mediaType = "audio";
              mediaMime = content.mimetype || "audio/mp4";
              textPreview = content.ptt ? "🎤 Nota de voz" : "🎵 Audio";
              if (Buffer.isBuffer(content.audio)) saveMediaToStore(msgId, mediaMime, content.audio);
            } else if (content?.document) {
              mediaType = "document";
              mediaMime = content.mimetype || "application/octet-stream";
              textPreview = `📄 ${content.fileName || "Documento"}`;
            }

            if (textPreview || mediaType) {
              recordChatMessage(currentKey, jid, {
                id: msgId,
                sender: currentKey,
                pushName: botSock?.user?.name || "Bot",
                text: textPreview,
                fromMe: true,
                timestamp: Date.now(),
                mediaType,
                mediaMime,
                hasMedia: Boolean(mediaType),
                rawKey: res?.key,
                rawMessage: res,
              });
            }
          } catch {}

          return res;
        };
      }
    }
  });
}

async function syncCommandInterceptors() {
  const cmdRoot = path.resolve(process.cwd(), "cmd");
  if (!fs.existsSync(cmdRoot)) return [];

  const allCmdNames: string[] = [];
  const categories = fs.readdirSync(cmdRoot, { withFileTypes: true });

  for (const cat of categories) {
    if (!cat.isDirectory()) continue;
    const catDir = path.join(cmdRoot, cat.name);
    const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

    for (const file of files) {
      const fullPath = path.join(catDir, file);
      try {
        const mod = await import(pathToFileURL(fullPath).href);
        const plugin = mod?.default;
        if (!plugin || typeof plugin.run !== "function") continue;

        const names: string[] = Array.isArray(plugin.name) ? plugin.name : [String(plugin.name || "")];
        const primaryName = names[0];
        if (!primaryName) continue;

        names.forEach((n) => {
          if (n) allCmdNames.push(n.toLowerCase());
        });

        if (!state.wrappedCommands.has(fullPath)) {
          const originalRun = plugin.run.bind(plugin);
          state.wrappedCommands.set(fullPath, originalRun);

          plugin.run = async (ctx: CommandContext) => {
            const invoked = String(ctx.cmdName || primaryName).toLowerCase();
            const isBlocked =
              state.blockedCommands.has(invoked) ||
              names.some((alias) => state.blockedCommands.has(alias.toLowerCase()));

            if (isBlocked) {
              return ctx.reply(
                `🛠️ *${fytBold("MANTENIMIENTO ACTIVO")}*\n\nEl comando *${invoked}* se encuentra temporalmente deshabilitado desde el Panel Web.`
              );
            }
            return originalRun(ctx);
          };
        }
      } catch {}
    }
  }

  return Array.from(new Set(allCmdNames)).sort();
}

async function fetchPublicIp(): Promise<string> {
  if (state.publicIp) return state.publicIp;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    clearTimeout(timer);
    const data = (await res.json()) as { ip?: string };
    if (data?.ip) {
      state.publicIp = data.ip;
      return data.ip;
    }
  } catch {}
  return "127.0.0.1";
}

function extractValidTunnelUrl(text: string): string | null {
  const regex = /https:\/\/[a-zA-Z0-9.-]+\.(?:lhr\.life|localhost\.run|serveo\.net|serveousercontent\.com|pinggy\.link|a\.pinggy\.io|trycloudflare\.com)/g;
  const matches = text.match(regex);
  if (!matches) return null;
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (
      !lower.includes("admin.localhost.run") &&
      !lower.includes("localhost.run/docs") &&
      !lower.includes("twitter.com") &&
      !lower.includes("dashboard.pinggy.io")
    ) {
      return m;
    }
  }
  return null;
}

function spawnSshTunnel(port: number, hostTarget: string, extraArgs: string[] = []): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (url: string | null) => {
      if (!resolved) {
        resolved = true;
        resolve(url);
      }
    };

    try {
      const sshProc = spawn(
        "ssh",
        [
          "-o",
          "StrictHostKeyChecking=no",
          "-o",
          "UserKnownHostsFile=/dev/null",
          "-o",
          "ServerAliveInterval=30",
          ...extraArgs,
          "-R",
          `80:127.0.0.1:${port}`,
          hostTarget,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      state.tunnelProcess = sshProc;

      const parseChunk = (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        const found = extractValidTunnelUrl(text);
        if (found) {
          state.tunnelUrl = found;
          finish(found);
        }
      };

      sshProc.stdout?.on("data", parseChunk);
      sshProc.stderr?.on("data", parseChunk);

      sshProc.on("error", () => finish(null));
      sshProc.on("exit", () => {
        if (!resolved) finish(null);
      });

      setTimeout(() => finish(null), 5500);
    } catch {
      finish(null);
    }
  });
}

async function startPublicTunnel(port: number): Promise<string | null> {
  if (
    state.tunnelUrl &&
    !state.tunnelUrl.includes("admin.localhost.run") &&
    state.tunnelProcess &&
    !state.tunnelProcess.killed
  ) {
    return state.tunnelUrl;
  }

  if (state.tunnelProcess) {
    try {
      state.tunnelProcess.kill();
    } catch {}
    state.tunnelProcess = null;
    state.tunnelUrl = null;
  }

  const primary = await spawnSshTunnel(port, "nokey@localhost.run");
  if (primary) return primary;

  const secondary = await spawnSshTunnel(port, "serveo.net");
  if (secondary) return secondary;

  const tertiary = await spawnSshTunnel(port, "a.pinggy.io", ["-p", "443"]);
  return tertiary;
}

async function sendCredentialsEmail(email: string, url: string, user: string, pass: string, token: string): Promise<boolean> {
  const subject = "Aura-Bot 2.0 - Credenciales Temporales Panel Web";
  const body = [
    `Hola Luis Fernando,`,
    ``,
    `Credenciales activas para el Panel Web y WhatsApp Web Multi-Subbot de Aura-Bot 2.0:`,
    ``,
    `Enlace de Acceso: ${url}`,
    `Usuario Temporal: ${user}`,
    `Clave / Codigo OTP: ${pass}`,
    `Token Directo: ${token}`,
    ``,
    `Acceso directo en un clic: ${url}/?token=${token}`,
  ].join("\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: subject,
        _captcha: "false",
        usuario_temporal: user,
        clave_otp: pass,
        enlace_panel: `${url}/?token=${token}`,
        mensaje: body,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) return true;
  } catch {}

  try {
    const escapedBody = body.replace(/"/g, '\\"');
    await execAsync(`printf "Subject: ${subject}\\nTo: ${email}\\n\\n${escapedBody}\\n" | sendmail -t 2>/dev/null`);
    return true;
  } catch {}

  return false;
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 25 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: any) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function safeResolvePath(relPath: string): string {
  const root = process.cwd();
  const target = path.resolve(root, relPath || ".");
  if (!target.startsWith(root)) return root;
  return target;
}

function buildLoginHtml(email: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Aura-Bot 2.0 | Acceso Propietario</title>
<style>
  :root {
    --bg: #07090e;
    --panel: #10141f;
    --border: #1e2638;
    --accent: #00e5ff;
    --danger: #ff2a54;
    --success: #00e676;
    --text: #e2e8f0;
    --muted: #8b9bb4;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: radial-gradient(circle at top, #121a2d 0%, #07090e 100%); color: var(--text); font-family: system-ui, -apple-system, sans-serif; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .login-card { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 30px 24px; width: 100%; max-width: 420px; box-shadow: 0 24px 60px rgba(0,0,0,0.65); }
  .title { font-size: 21px; font-weight: 900; color: var(--accent); margin-bottom: 6px; text-align: center; letter-spacing: 0.5px; }
  .sub { font-size: 13px; color: var(--muted); text-align: center; margin-bottom: 22px; line-height: 1.45; }
  label { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px; margin-top: 14px; }
  input { width: 100%; background: #07090e; color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; font-size: 14px; outline: none; transition: 0.2s; }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(0,229,255,0.15); }
  .btn { width: 100%; background: var(--accent); color: #000; border: none; padding: 12px; border-radius: 10px; font-weight: 800; font-size: 14px; cursor: pointer; margin-top: 20px; transition: 0.2s; }
  .btn:hover { opacity: 0.92; }
  .btn-sec { background: transparent; color: var(--accent); border: 1px solid var(--accent); margin-top: 10px; }
  .msg { margin-top: 14px; font-size: 13px; text-align: center; font-weight: 600; }
</style>
</head>
<body>
  <div class="login-card">
    <div class="title">⚡ AURA-BOT 2.0 // SUITE</div>
    <div class="sub">Ingresa las credenciales temporales enviadas a tu WhatsApp o a ${email}</div>
    <form onsubmit="doLogin(event)">
      <label>Usuario Temporal o Correo</label>
      <input type="text" id="userInp" placeholder="Ej: lufer_a1b2" required autocomplete="off">
      <label>Clave / Código OTP</label>
      <input type="password" id="passInp" placeholder="Código de 6 dígitos" required autocomplete="off">
      <button type="submit" class="btn">🔓 Iniciar Sesión</button>
    </form>
    <button type="button" class="btn btn-sec" onclick="sendNewCode()">📲 Generar y Enviar Nuevas Credenciales</button>
    <div class="msg" id="statusMsg"></div>
  </div>
<script>
async function doLogin(e) {
  e.preventDefault();
  const msg = document.getElementById('statusMsg');
  msg.style.color = '#8b9bb4';
  msg.textContent = 'Verificando credenciales...';
  const user = document.getElementById('userInp').value.trim();
  const pass = document.getElementById('passInp').value.trim();
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass })
    });
    const d = await r.json();
    if (d.ok && d.token) {
      msg.style.color = '#00e676';
      msg.textContent = 'Acceso concedido...';
      window.location.href = '/?token=' + encodeURIComponent(d.token);
    } else {
      msg.style.color = '#ff2a54';
      msg.textContent = d.error || 'Credenciales incorrectas.';
    }
  } catch (err) {
    msg.style.color = '#ff2a54';
    msg.textContent = 'Error de conexión.';
  }
}

async function sendNewCode() {
  const msg = document.getElementById('statusMsg');
  msg.style.color = '#00e5ff';
  msg.textContent = 'Enviando nuevas credenciales al chat privado y correo...';
  try {
    const r = await fetch('/api/request-otp', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      msg.style.color = '#00e676';
      msg.textContent = 'Credenciales enviadas a tu WhatsApp y a ' + d.email;
    } else {
      msg.style.color = '#ff2a54';
      msg.textContent = 'No se pudo enviar.';
    }
  } catch (e) {
    msg.style.color = '#ff2a54';
    msg.textContent = 'Error al solicitar código.';
  }
}
</script>
</body>
</html>`;
}

function buildDashboardHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Aura-Bot 2.0 | WhatsApp Web & Control Suite</title>
<style>
  :root {
    --bg: #07090e;
    --panel: #10141f;
    --panel2: #161c2b;
    --border: #1e2638;
    --accent: #00e5ff;
    --wa-green: #00a884;
    --wa-teal: #008069;
    --wa-out: #005c4b;
    --wa-in: #202c33;
    --wa-bg: #0b141a;
    --wa-panel: #111b21;
    --danger: #ff2a54;
    --success: #00e676;
    --warn: #ffab00;
    --text: #e9edef;
    --muted: #8696a0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; min-height: 100dvh; display: flex; flex-direction: column; overflow-x: hidden; }
  header { background: var(--panel); border-bottom: 1px solid var(--border); padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; gap: 8px; }
  .brand { font-size: 15px; font-weight: 900; color: var(--accent); letter-spacing: 0.4px; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .header-right { display: flex; align-items: center; gap: 8px; }
  .badge { background: rgba(0,229,255,0.12); color: var(--accent); border: 1px solid var(--accent); padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .tabs { display: flex; gap: 6px; padding: 8px 14px; overflow-x: auto; border-bottom: 1px solid var(--border); background: #0b0e17; scrollbar-width: none; position: sticky; top: 45px; z-index: 90; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab-btn { background: var(--panel); color: var(--muted); border: 1px solid var(--border); padding: 7px 13px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 12px; white-space: nowrap; transition: 0.15s; display: flex; align-items: center; gap: 5px; }
  .tab-btn.active, .tab-btn:hover { color: var(--text); border-color: var(--accent); background: rgba(0,229,255,0.12); }
  .container { width: 100%; max-width: 1440px; margin: 10px auto; padding: 0 12px 24px; flex: 1; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 12px; margin-bottom: 14px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px; overflow: hidden; }
  .card-title { font-size: 11px; color: var(--muted); text-transform: uppercase; margin-bottom: 6px; font-weight: 700; }
  .card-val { font-size: 20px; font-weight: 800; color: var(--text); }
  .card-sub { font-size: 11px; color: var(--accent); margin-top: 4px; }
  .section { display: none; }
  .section.active { display: block; }
  .table-wrap { width: 100%; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 500px; }
  th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 700; text-transform: uppercase; font-size: 11px; }
  .btn { background: var(--accent); color: #000; border: none; padding: 8px 12px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; transition: 0.15s; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
  .btn:hover { opacity: 0.88; }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-warn { background: var(--warn); color: #000; }
  .btn-success { background: var(--success); color: #000; }
  .btn-wa { background: var(--wa-green); color: #fff; }
  .btn-ghost { background: #2a3942; color: var(--text); }
  input, select, textarea { background: #07090e; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px; font-size: 13px; width: 100%; outline: none; }
  input:focus, select:focus, textarea:focus { border-color: var(--accent); }
  textarea { font-family: monospace; min-height: 280px; resize: vertical; }
  .flex-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
  .pill { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; }
  .pill-on { background: rgba(0,230,118,0.15); color: var(--success); }
  .pill-off { background: rgba(255,42,84,0.15); color: var(--danger); }
  .cmd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 8px; margin-top: 12px; }
  .cmd-item { background: #0b0e17; border: 1px solid var(--border); padding: 8px 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
  pre { background: #05070b; border: 1px solid var(--border); padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; color: #00e676; max-height: 320px; }

  .wa-wrapper { display: grid; grid-template-columns: 360px 1fr; height: calc(100dvh - 118px); min-height: 520px; background: var(--wa-bg); border: 1px solid #222e35; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.5); position: relative; }
  .wa-sidebar { background: var(--wa-panel); border-right: 1px solid #222e35; display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .wa-side-top { padding: 10px; background: #202c33; border-bottom: 1px solid #222e35; display: flex; flex-direction: column; gap: 8px; }
  .wa-bot-select-row { display: flex; gap: 6px; align-items: center; }
  .wa-search-row { display: flex; gap: 6px; }
  .wa-filter-row { display: flex; gap: 6px; }
  .wa-chip { background: #202c33; color: var(--muted); border: 1px solid #2a3942; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; cursor: pointer; }
  .wa-chip.active { background: rgba(0,168,132,0.2); color: #00a884; border-color: #00a884; }
  .wa-chat-list { flex: 1; overflow-y: auto; }
  .wa-chat-item { padding: 11px 14px; border-bottom: 1px solid rgba(134,150,160,0.12); cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 11px; transition: background 0.15s; }
  .wa-chat-item:hover { background: #202c33; }
  .wa-chat-item.active { background: #2a3942; }
  .wa-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--wa-teal); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; flex-shrink: 0; overflow: hidden; object-fit: cover; border: 1px solid rgba(255,255,255,0.08); }
  .wa-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .wa-chat-meta { flex: 1; min-width: 0; }
  .wa-chat-name { font-size: 14px; font-weight: 700; color: #e9edef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wa-chat-prev { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 3px; }
  .wa-chat-right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; }
  .wa-chat-time { font-size: 11px; color: var(--muted); }
  .wa-unread { background: var(--wa-green); color: #111b21; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px; }

  .wa-main { display: flex; flex-direction: column; height: 100%; background: var(--wa-bg); position: relative; overflow: hidden; }
  .wa-header { background: #202c33; padding: 8px 14px; border-bottom: 1px solid #222e35; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 60px; z-index: 10; }
  .wa-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; cursor: pointer; flex: 1; }
  .wa-back-btn { display: none; background: #2a3942; color: #fff; border: none; padding: 7px 11px; border-radius: 8px; font-weight: 800; cursor: pointer; }
  .wa-header-actions { display: flex; align-items: center; gap: 6px; }
  .wa-icon-btn { background: #2a3942; color: var(--text); border: none; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 15px; transition: 0.15s; }
  .wa-icon-btn:hover { background: #374854; }

  .wa-messages {
    flex: 1;
    padding: 16px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background-color: #0b141a;
    background-image: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 0);
    background-size: 24px 24px;
  }
  .wa-msg-row { display: flex; flex-direction: column; max-width: 76%; position: relative; }
  .wa-msg-row.in { align-self: flex-start; }
  .wa-msg-row.out { align-self: flex-end; }
  .wa-bubble { padding: 7px 11px; border-radius: 10px; font-size: 13.5px; line-height: 1.42; position: relative; word-wrap: break-word; white-space: pre-wrap; box-shadow: 0 1px 2px rgba(0,0,0,0.35); }
  .wa-msg-row.in .wa-bubble { background: var(--wa-in); color: #e9edef; border-top-left-radius: 2px; }
  .wa-msg-row.out .wa-bubble { background: var(--wa-out); color: #e9edef; border-top-right-radius: 2px; }
  .wa-bubble.sticker-bubble { background: transparent !important; box-shadow: none !important; padding: 2px !important; }
  .wa-bubble-sender { font-size: 11.5px; font-weight: 800; color: #00e5ff; margin-bottom: 3px; cursor: pointer; }
  .wa-quoted-box { background: rgba(0,0,0,0.26); border-left: 3px solid var(--wa-green); border-radius: 6px; padding: 5px 8px; margin-bottom: 6px; font-size: 11.5px; color: #cfd8dc; max-height: 60px; overflow: hidden; }
  .wa-quoted-sender { font-weight: 800; color: var(--wa-green); font-size: 11px; margin-bottom: 2px; }
  .wa-media-img { max-width: 290px; width: 100%; max-height: 320px; border-radius: 8px; object-fit: cover; display: block; margin-bottom: 4px; cursor: zoom-in; background: #111b21; }
  .wa-media-sticker { width: 145px; height: 145px; object-fit: contain; display: block; cursor: pointer; transition: transform 0.15s; }
  .wa-media-sticker:hover { transform: scale(1.06); }
  .wa-media-video { max-width: 290px; width: 100%; max-height: 320px; border-radius: 8px; display: block; margin-bottom: 4px; background: #000; }
  .wa-media-audio { width: 250px; max-width: 100%; height: 38px; margin: 3px 0; }
  .wa-bubble-meta { display: flex; align-items: center; justify-content: flex-end; gap: 6px; font-size: 10px; color: rgba(255,255,255,0.62); margin-top: 3px; }
  .wa-msg-tools { display: none; gap: 4px; position: absolute; top: -12px; right: 4px; background: #202c33; border: 1px solid #2a3942; border-radius: 999px; padding: 2px 6px; z-index: 20; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
  .wa-msg-row.in .wa-msg-tools { right: auto; left: 4px; }
  .wa-msg-row:hover .wa-msg-tools { display: flex; }
  .wa-tool-btn { background: transparent; border: none; color: #e9edef; cursor: pointer; font-size: 12px; padding: 2px 4px; }
  .wa-tool-btn:hover { transform: scale(1.2); }
  .wa-reactions-pill { display: inline-flex; gap: 3px; background: #202c33; border: 1px solid #2a3942; border-radius: 999px; padding: 2px 6px; font-size: 11px; margin-top: -6px; align-self: flex-end; z-index: 5; }

  .wa-reply-bar { display: none; background: #182229; border-top: 1px solid #222e35; border-left: 4px solid var(--wa-green); padding: 8px 14px; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
  .wa-reply-bar.active { display: flex; }
  .wa-emoji-bar { display: none; background: #182229; border-top: 1px solid #222e35; padding: 8px 12px; gap: 8px; flex-wrap: wrap; align-items: center; max-height: 130px; overflow-y: auto; }
  .wa-emoji-bar.active { display: flex; }
  .wa-emoji-item { font-size: 20px; cursor: pointer; padding: 3px; user-select: none; transition: transform 0.1s; }
  .wa-emoji-item:hover { transform: scale(1.25); }

  .wa-composer { background: #202c33; padding: 9px 12px; display: flex; gap: 7px; align-items: center; border-top: 1px solid #222e35; }
  .wa-composer input[type="text"] { background: #2a3942; border: none; color: #e9edef; padding: 11px 14px; border-radius: 10px; flex: 1; font-size: 14px; }

  .wa-drawer { position: absolute; top: 0; right: 0; width: 320px; max-width: 100%; height: 100%; background: var(--wa-panel); border-left: 1px solid #222e35; z-index: 40; display: none; flex-direction: column; overflow-y: auto; padding: 16px; }
  .wa-drawer.open { display: flex; }

  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.82); z-index: 999; display: none; align-items: center; justify-content: center; padding: 16px; }
  .modal-backdrop.open { display: flex; }
  .lightbox-img { max-width: 94vw; max-height: 85vh; border-radius: 10px; object-fit: contain; }

  .call-banner { position: fixed; bottom: 20px; right: 20px; background: #161f2c; border: 2px solid var(--wa-green); border-radius: 16px; padding: 16px 20px; z-index: 950; width: 320px; box-shadow: 0 18px 45px rgba(0,0,0,0.75); display: none; flex-direction: column; gap: 10px; animation: pulseBorder 1.5s infinite; }
  .call-banner.active { display: flex; }
  @keyframes pulseBorder { 0% { box-shadow: 0 0 0 0 rgba(0,168,132,0.6); } 70% { box-shadow: 0 0 0 14px rgba(0,168,132,0); } 100% { box-shadow: 0 0 0 0 rgba(0,168,132,0); } }

  @media (max-width: 860px) {
    .container { padding: 0 6px 14px; margin: 6px auto; }
    .wa-wrapper { grid-template-columns: 1fr; height: calc(100dvh - 108px); border-radius: 8px; }
    .wa-wrapper.chat-open .wa-sidebar { display: none; }
    .wa-wrapper:not(.chat-open) .wa-main { display: none; }
    .wa-back-btn { display: inline-flex; }
    .wa-msg-row { max-width: 88%; }
    .wa-media-img, .wa-media-video { max-width: 240px; }
  }
</style>
</head>
<body>
<header>
  <div class="brand">⚡ AURA-BOT 2.0 // SUITE</div>
  <div class="header-right">
    <div class="badge" id="callStatusBadge" style="display:none; background:rgba(255,42,84,0.2); color:#ff2a54; border-color:#ff2a54;">📞 Llamada Activa</div>
    <div class="badge" id="uptimeBadge">Conectando...</div>
  </div>
</header>

<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('wa', this)">💬 WhatsApp Web</button>
  <button class="tab-btn" onclick="switchTab('calls', this)">📞 Central de Llamadas <span id="callCountPill" class="pill pill-on" style="display:none">0</span></button>
  <button class="tab-btn" onclick="switchTab('dash', this)">📊 Clúster & Subbots</button>
  <button class="tab-btn" onclick="switchTab('procs', this)">💀 Procesos & RAM</button>
  <button class="tab-btn" onclick="switchTab('cmds', this)">🛠️ Comandos</button>
  <button class="tab-btn" onclick="switchTab('spam', this)">🚨 Reportes / Spam</button>
  <button class="tab-btn" onclick="switchTab('files', this)">📁 Archivos & Editor</button>
  <button class="tab-btn" onclick="switchTab('bench', this)">⚡ Benchmark & Shell</button>
</div>

<div class="container">
  <div id="tab-wa" class="section active">
    <div class="wa-wrapper" id="waWrapper">
      <div class="wa-sidebar">
        <div class="wa-side-top">
          <div class="wa-bot-select-row">
            <select id="waBotSelector" onchange="onSelectSubbot()" style="flex:1; font-weight:700;"></select>
            <button class="btn btn-wa" onclick="syncSubbotGroups()" title="Sincronizar Grupos">🔄</button>
          </div>
          <div class="wa-search-row">
            <input type="text" id="waSearchInput" placeholder="Buscar chat, número o mensaje..." oninput="renderWaChatList()">
            <button class="btn" onclick="startNewChatPrompt()" title="Nuevo chat">➕</button>
          </div>
          <div class="wa-filter-row">
            <button class="wa-chip active" onclick="setChatFilter('all', this)">Todos</button>
            <button class="wa-chip" onclick="setChatFilter('unread', this)">No leídos</button>
            <button class="wa-chip" onclick="setChatFilter('groups', this)">Grupos</button>
            <button class="wa-chip" onclick="setChatFilter('direct', this)">Privados</button>
          </div>
        </div>
        <div class="wa-chat-list" id="waChatList"></div>
      </div>

      <div class="wa-main">
        <div class="wa-header">
          <div class="wa-header-left" onclick="toggleChatDrawer()">
            <button class="wa-back-btn" onclick="event.stopPropagation(); closeMobileChat()">⬅</button>
            <div class="wa-avatar" id="waActiveAvatar">?</div>
            <div style="min-width:0; flex:1;">
              <div class="wa-chat-name" id="waActiveName">Selecciona una conversación</div>
              <div class="wa-chat-prev" id="waActiveJid">Elige un Subbot arriba a la izquierda</div>
            </div>
          </div>
          <div class="wa-header-actions" id="waHeaderActions" style="display:none;">
            <button class="wa-icon-btn" onclick="triggerCallFromChat(false)" title="Llamada de Voz">📞</button>
            <button class="wa-icon-btn" onclick="triggerCallFromChat(true)" title="Videollamada">📹</button>
            <button class="wa-icon-btn" onclick="sendPresenceState('composing')" title="Simular Escribiendo...">✍️</button>
            <button class="wa-icon-btn" onclick="toggleChatDrawer()" title="Información del Contacto/Grupo">ℹ️</button>
            <button class="wa-icon-btn" onclick="clearActiveChatHistory()" title="Vaciar Chat">🗑️</button>
          </div>
        </div>

        <div class="wa-messages" id="waMessagesBox">
          <div style="margin:auto; text-align:center; color:#8696a0; padding:24px; max-width:420px;">
            <h3 style="color:#e9edef; margin-bottom:8px; font-size:18px;">📱 Aura WhatsApp Web Multi-Subbot</h3>
            <p style="font-size:13px; line-height:1.5;">Visualiza imágenes, stickers animados, audios y videos en tiempo real. Selecciona cualquier instancia arriba a la izquierda para responder, enviar notas de voz, reaccionar o gestionar llamadas.</p>
          </div>
        </div>

        <div class="wa-reply-bar" id="waReplyBar">
          <div style="min-width:0; flex:1;">
            <div style="font-weight:800; color:var(--wa-green);" id="waReplySender">Respondiendo</div>
            <div style="color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="waReplyText"></div>
          </div>
          <button class="wa-icon-btn" style="width:28px; height:28px;" onclick="cancelReply()">✖</button>
        </div>

        <div class="wa-emoji-bar" id="waEmojiBar"></div>

        <form class="wa-composer" onsubmit="sendWaMessage(event)">
          <button type="button" class="wa-icon-btn" onclick="toggleEmojiBar()" title="Emojis">😀</button>
          <button type="button" class="wa-icon-btn" onclick="document.getElementById('waMediaFileInput').click()" title="Enviar Imagen, Sticker, Video o Archivo">📎</button>
          <input type="file" id="waMediaFileInput" style="display:none" accept="image/*,video/*,audio/*,.webp,.pdf,.zip" onchange="handleMediaUpload(event)">
          <input type="text" id="waMessageInput" placeholder="Escribe un mensaje..." autocomplete="off" oninput="onComposerTyping()">
          <button type="button" class="wa-icon-btn" id="waVoiceBtn" onclick="toggleVoiceRecording()" title="Grabar Nota de Voz">🎤</button>
          <button type="submit" class="btn btn-wa" style="padding:10px 15px; border-radius:10px;">➤</button>
        </form>

        <div class="wa-drawer" id="waInfoDrawer">
          <div class="flex-row" style="justify-content:space-between; border-bottom:1px solid #222e35; padding-bottom:10px;">
            <h4>ℹ️ Detalles del Chat</h4>
            <button class="wa-icon-btn" style="width:30px; height:30px;" onclick="toggleChatDrawer()">✖</button>
          </div>
          <div style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:16px 0; gap:10px;">
            <div class="wa-avatar" id="drawerAvatar" style="width:88px; height:88px; font-size:28px;">?</div>
            <div style="font-size:16px; font-weight:800;" id="drawerName">-</div>
            <div style="font-size:12px; color:var(--muted);" id="drawerJid">-</div>
            <div style="font-size:12px; color:#00e5ff; background:#182229; padding:8px 12px; border-radius:8px; width:100%;" id="drawerBio">Sin descripción</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
            <button class="btn btn-wa" onclick="triggerCallFromChat(false)">📞 Iniciar Llamada de Voz</button>
            <button class="btn" onclick="triggerCallFromChat(true)">📹 Iniciar Videollamada</button>
            <button class="btn btn-warn" onclick="sendStickerQuickPrompt()">🏷️ Enviar Imagen/URL como Sticker</button>
            <button class="btn btn-danger" onclick="blockOrUnblockCurrentChat('block')">🚫 Bloquear Contacto</button>
            <button class="btn btn-success" onclick="blockOrUnblockCurrentChat('unblock')">✅ Desbloquear Contacto</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="tab-calls" class="section">
    <div class="card" style="margin-bottom:14px;">
      <div class="flex-row" style="justify-content:space-between;">
        <div>
          <h3>📞 Central de Llamadas & Defensa Anti-Call</h3>
          <p style="font-size:12px; color:var(--muted); margin-top:4px;">Monitorea llamadas entrantes/salientes en todos los subbots, rechaza llamadas automáticamente o lanza timbrados directos.</p>
        </div>
        <div class="flex-row" style="margin:0;">
          <button class="btn" id="btnAutoRejectCalls" onclick="toggleAutoRejectCalls()">🛡️ Auto-Rechazar: OFF</button>
        </div>
      </div>
      <div class="flex-row" style="margin-top:12px;">
        <input type="text" id="autoRejectMsgInput" placeholder="Mensaje automático al rechazar llamada..." style="flex:1; min-width:240px;">
        <button class="btn btn-success" onclick="saveAutoRejectSettings()">💾 Guardar Respuesta Auto-Rechazo</button>
      </div>
      <hr style="border:none; border-top:1px solid var(--border); margin:14px 0;">
      <h4>📲 Lanzar Llamada / Timbrado desde un Subbot</h4>
      <div class="flex-row" style="margin-top:10px;">
        <select id="callBotSelector" style="max-width:240px;"></select>
        <input type="text" id="callTargetInput" placeholder="Número o JID (ej: 573001234567)" style="max-width:260px;">
        <select id="callTypeSelect" style="max-width:160px;">
          <option value="voice">📞 Llamada de Voz</option>
          <option value="video">📹 Videollamada</option>
        </select>
        <button class="btn btn-wa" onclick="initiateManualCall()">🚀 Llamar Ahora</button>
      </div>
    </div>

    <div class="card">
      <div class="flex-row" style="justify-content:space-between;">
        <h3>📋 Historial de Llamadas en Tiempo Real</h3>
        <button class="btn btn-ghost" onclick="clearCallLogs()">🗑️ Limpiar Registro</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Hora</th><th>Subbot</th><th>Contacto / JID</th><th>Tipo</th><th>Dirección</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody id="callsTable"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="tab-dash" class="section">
    <div class="grid">
      <div class="card"><div class="card-title">Instancias Activas</div><div class="card-val" id="mSubbots">0</div><div class="card-sub" id="mSubState">Operando</div></div>
      <div class="card"><div class="card-title">Tráfico Mensajes</div><div class="card-val" id="mMsgs">0 / 0</div><div class="card-sub">RX Recibidos / TX Enviados</div></div>
      <div class="card"><div class="card-title">Grupos en Red</div><div class="card-val" id="mGroups">0</div><div class="card-sub">Sincronizados</div></div>
      <div class="card"><div class="card-title">Memoria (RSS / Heap)</div><div class="card-val" id="mRam">0 MB</div><div class="card-sub" id="mCpu">CPU: 0.00</div></div>
    </div>

    <div class="card">
      <div class="flex-row" style="justify-content: space-between;">
        <h3>🤖 Control de Nodos (Main + Subbots)</h3>
        <div class="flex-row" style="margin:0;">
          <button class="btn btn-warn" onclick="togglePauseSubbots()" id="btnPauseSubs">⏸️ Pausar Todos</button>
          <button class="btn btn-success" onclick="cleanRam()">🧹 Limpiar RAM</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>JID / Número</th><th>Nombre</th><th>Estado</th><th>Rol</th><th>Acciones</th></tr></thead>
          <tbody id="subbotsTable"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="tab-procs" class="section">
    <div class="card">
      <div class="flex-row" style="justify-content: space-between;">
        <h3>💀 Procesos del Servidor y Memoria</h3>
        <div class="flex-row" style="margin:0;">
          <input type="text" id="multiPidInput" placeholder="PIDs (ej: 1204, 1502)" style="width:200px;">
          <button class="btn btn-danger" onclick="killMultiplePids()">Matar PIDs</button>
          <button class="btn btn-success" onclick="cleanRam()">Forzar GC / RAM</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>PID</th><th>Proceso</th><th>% CPU</th><th>% MEM</th><th>Acción</th></tr></thead>
          <tbody id="procsTable"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="tab-cmds" class="section">
    <div class="card">
      <h3>🛠️ Bloqueo de Comandos por Mantenimiento</h3>
      <div class="flex-row" style="margin-top:10px;">
        <input type="text" id="customCmdInput" placeholder="Comando (ej: play, sticker, lid)" style="max-width:280px;">
        <button class="btn btn-danger" onclick="toggleCmdManual()">Alternar Estado</button>
      </div>
      <div class="cmd-grid" id="cmdGrid"></div>
    </div>
  </div>

  <div id="tab-spam" class="section">
    <div class="card">
      <h3>🚨 Ejecutor y Auditoría de Reportes por Subbots</h3>
      <div class="flex-row" style="margin-top:10px;">
        <input type="text" id="spamTarget" placeholder="Número (ej: 573001234567)" style="max-width:240px;">
        <input type="number" id="spamCycles" value="5" min="1" max="20" style="max-width:100px;">
        <button class="btn btn-danger" onclick="runSpamReport()">🚀 Ejecutar con Subbots</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Objetivo</th><th>Total Reportes</th><th>Subbots Usados</th><th>Último Evento</th></tr></thead>
          <tbody id="spamTable"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="tab-files" class="section">
    <div class="card">
      <h3>📁 Explorador y Editor en Vivo</h3>
      <div class="flex-row" style="margin-top:10px;">
        <input type="text" id="currentDirInput" value="." style="max-width:300px;">
        <button class="btn" onclick="loadDir()">📂 Abrir Carpeta</button>
      </div>
      <div id="fileList" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;"></div>
      <div class="flex-row" style="justify-content: space-between;">
        <input type="text" id="editingFilePath" placeholder="Archivo seleccionado..." readonly style="max-width:400px;">
        <button class="btn btn-success" onclick="saveFileContent()">💾 Guardar Cambios</button>
      </div>
      <textarea id="fileEditor" placeholder="Selecciona un archivo para editar..."></textarea>
    </div>
  </div>

  <div id="tab-bench" class="section">
    <div class="card">
      <h3>⚡ Benchmark V8 & Terminal Shell</h3>
      <div class="flex-row" style="margin-top:10px;">
        <button class="btn" onclick="runBenchmark()">🔥 Ejecutar Benchmark</button>
      </div>
      <pre id="benchOutput">Pulsa el botón para medir rendimiento...</pre>
      <h3 style="margin-top:16px;">💻 Consola Shell</h3>
      <div class="flex-row" style="margin-top:8px;">
        <input type="text" id="shellCmdInput" placeholder="Comando (ej: df -h, free -m, ps aux)" style="max-width:400px;">
        <button class="btn btn-warn" onclick="runShellTest()">Ejecutar</button>
      </div>
      <pre id="shellOutput">Listo...</pre>
    </div>
  </div>
</div>

<div class="modal-backdrop" id="lightboxModal" onclick="closeLightbox()">
  <img id="lightboxImg" class="lightbox-img" src="" alt="Vista previa">
</div>

<div class="call-banner" id="incomingCallBanner">
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <span style="font-weight:900; color:var(--wa-green); font-size:13px;" id="bannerCallType">📞 LLAMADA ENTRANTE</span>
    <span style="font-size:11px; color:var(--muted);" id="bannerCallBot"></span>
  </div>
  <div style="font-size:16px; font-weight:800; color:#fff;" id="bannerCallerName">Desconocido</div>
  <div style="font-size:12px; color:var(--muted);" id="bannerCallerJid"></div>
  <div class="flex-row" style="margin:4px 0 0; justify-content:space-between;">
    <button class="btn btn-danger" style="flex:1;" onclick="rejectBannerCall()">📵 Rechazar</button>
    <button class="btn btn-wa" style="flex:1;" onclick="openBannerCallerChat()">💬 Abrir Chat</button>
  </div>
</div>

<script>
const TOKEN = "${token}";
let selectedBotKey = "";
let selectedChatJid = "";
let chatFilterMode = "all";
let cachedChats = [];
let currentMessages = [];
let knownBots = [];
let replyTargetMsg = null;
let activeBannerCall = null;
let mediaRecorder = null;
let recordedChunks = [];
let lastTypingSent = 0;

const EMOJI_LIST = ["😂","❤️","🔥","👍","😭","🙏","😍","🥰","🤣","😊","😎","🙌","💀","👀","✨","🎉","💯","😡","😱","🤔","👏","🫡","🤝","⚡","🚀","👑","💎","🤖","✅","❌"];

function initEmojiBar() {
  const bar = document.getElementById('waEmojiBar');
  bar.innerHTML = EMOJI_LIST.map(e => '<span class="wa-emoji-item" onclick="insertEmoji(\\'' + e + '\\')">' + e + '</span>').join('');
}

function toggleEmojiBar() {
  document.getElementById('waEmojiBar').classList.toggle('active');
}

function insertEmoji(e) {
  const inp = document.getElementById('waMessageInput');
  inp.value += e;
  inp.focus();
}

function switchTab(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'files') loadDir();
  if (id === 'cmds') loadCommands();
  if (id === 'wa') refreshWaChats();
  if (id === 'calls') refreshCallCenter();
}

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'x-aura-token': TOKEN } };
  if (body) opts.body = JSON.stringify(body);
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch('/api/' + path + sep + 'token=' + TOKEN, opts);
  return r.json();
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openLightbox(url) {
  const modal = document.getElementById('lightboxModal');
  document.getElementById('lightboxImg').src = url;
  modal.classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightboxModal').classList.remove('open');
}

async function refreshTelemetry() {
  try {
    const d = await api('status');
    document.getElementById('uptimeBadge').textContent = '⏱️ ' + d.uptime;
    document.getElementById('mSubbots').textContent = d.subbots.length;
    document.getElementById('mSubState').textContent = d.subbotsPaused ? '⏸️ PAUSADOS' : '🟢 OPERANDO';
    document.getElementById('btnPauseSubs').textContent = d.subbotsPaused ? '▶️ Reanudar Todos' : '⏸️ Pausar Todos';
    document.getElementById('mMsgs').textContent = d.msgRx + ' / ' + d.msgTx;
    document.getElementById('mGroups').textContent = d.groupsCount;
    document.getElementById('mRam').textContent = d.ramRss + ' / ' + d.ramHeap + ' MB';
    document.getElementById('mCpu').textContent = 'CPU Load: ' + d.loadAvg;

    knownBots = d.subbots || [];
    const selector = document.getElementById('waBotSelector');
    const callSelector = document.getElementById('callBotSelector');
    const prevVal = selector.value || selectedBotKey;
    const optsHtml = knownBots.map((s, idx) => {
      const label = (idx === 0 ? '👑 Main: ' : '🤖 Sub #' + idx + ': ') + s.name + ' (+' + s.id + ')';
      return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(label) + '</option>';
    }).join('');

    if (selector.innerHTML !== optsHtml) {
      selector.innerHTML = optsHtml;
      if (callSelector) callSelector.innerHTML = optsHtml;
      if (prevVal && knownBots.some(b => b.id === prevVal)) {
        selector.value = prevVal;
        selectedBotKey = prevVal;
      } else if (knownBots[0]) {
        selectedBotKey = knownBots[0].id;
        selector.value = selectedBotKey;
      }
    }

    const sbHtml = knownBots.map((s, i) => '<tr>' +
      '<td>#' + (i + 1) + '</td>' +
      '<td><code>+' + escapeHtml(s.id) + '</code></td>' +
      '<td>' + escapeHtml(s.name) + '</td>' +
      '<td><span class="pill ' + (s.paused ? 'pill-off' : 'pill-on') + '">' + (s.paused ? 'PAUSADO' : 'ONLINE') + '</span></td>' +
      '<td>' + escapeHtml(s.role) + '</td>' +
      '<td>' +
        '<button class="btn btn-wa" style="padding:5px 8px; margin-right:4px;" onclick="jumpToBotWa(\\'' + escapeHtml(s.id) + '\\')">💬 Chats</button>' +
        '<button class="btn ' + (s.paused ? 'btn-success' : 'btn-warn') + '" style="padding:5px 8px;" onclick="toggleSingleBot(\\'' + escapeHtml(s.id) + '\\')">' + (s.paused ? '▶️' : '⏸️') + '</button>' +
      '</td>' +
    '</tr>').join('');
    document.getElementById('subbotsTable').innerHTML = sbHtml;

    const prHtml = (d.processes || []).map(p => '<tr>' +
      '<td><code>' + escapeHtml(p.pid) + '</code></td>' +
      '<td>' + escapeHtml(p.comm) + '</td>' +
      '<td>' + escapeHtml(p.cpu) + '%</td>' +
      '<td>' + escapeHtml(p.mem) + '%</td>' +
      '<td><button class="btn btn-danger" style="padding:4px 8px;" onclick="killPid(\\'' + escapeHtml(p.pid) + '\\')">Matar</button></td>' +
    '</tr>').join('');
    document.getElementById('procsTable').innerHTML = prHtml;

    const spHtml = (d.reports && d.reports.length) ? d.reports.map(r => '<tr>' +
      '<td><code>+' + escapeHtml(r.phone) + '</code></td>' +
      '<td><b>' + r.totalReports + '</b></td>' +
      '<td>' + r.subbotsCount + ' bots</td>' +
      '<td>' + escapeHtml(r.lastTimestamp) + '</td>' +
    '</tr>').join('') : '<tr><td colspan="4" style="color:var(--muted)">Sin reportes registrados.</td></tr>';
    document.getElementById('spamTable').innerHTML = spHtml;

    handleIncomingCallsAlert(d.calls || [], d.autoRejectCalls, d.autoRejectMessage);
  } catch (e) {}
}

function handleIncomingCallsAlert(calls, autoRej, autoMsg) {
  const pill = document.getElementById('callCountPill');
  if (calls.length > 0) {
    pill.style.display = 'inline-block';
    pill.textContent = calls.length;
  } else {
    pill.style.display = 'none';
  }

  const btnAuto = document.getElementById('btnAutoRejectCalls');
  if (btnAuto) {
    btnAuto.textContent = autoRej ? '🛡️ Auto-Rechazar: ON' : '🛡️ Auto-Rechazar: OFF';
    btnAuto.className = 'btn ' + (autoRej ? 'btn-success' : 'btn-warn');
  }
  const msgInp = document.getElementById('autoRejectMsgInput');
  if (msgInp && document.activeElement !== msgInp && autoMsg) {
    msgInp.value = autoMsg;
  }

  const recentOffer = calls.find(c => (c.status === 'offer' || c.status === 'ringing') && (Date.now() - c.timestamp < 30000));
  const banner = document.getElementById('incomingCallBanner');
  const badge = document.getElementById('callStatusBadge');

  if (recentOffer) {
    activeBannerCall = recentOffer;
    document.getElementById('bannerCallType').textContent = recentOffer.isVideo ? '📹 VIDEOLLAMADA ENTRANTE' : '📞 LLAMADA DE VOZ ENTRANTE';
    document.getElementById('bannerCallBot').textContent = 'Bot +' + recentOffer.botKey;
    document.getElementById('bannerCallerName').textContent = recentOffer.peerName;
    document.getElementById('bannerCallerJid').textContent = recentOffer.peerJid;
    banner.classList.add('active');
    badge.style.display = 'inline-block';
  } else {
    activeBannerCall = null;
    banner.classList.remove('active');
    badge.style.display = 'none';
  }
}

async function rejectBannerCall() {
  if (!activeBannerCall) return;
  await api('wa-call', 'POST', {
    action: 'reject',
    botKey: activeBannerCall.botKey,
    callId: activeBannerCall.id,
    peerJid: activeBannerCall.peerJid
  });
  document.getElementById('incomingCallBanner').classList.remove('active');
  refreshTelemetry();
  refreshCallCenter();
}

function openBannerCallerChat() {
  if (!activeBannerCall) return;
  selectedBotKey = activeBannerCall.botKey;
  const sel = document.getElementById('waBotSelector');
  if (sel) sel.value = selectedBotKey;
  const firstBtn = document.querySelector('.tab-btn');
  switchTab('wa', firstBtn);
  openWaChat(activeBannerCall.peerJid);
}

async function refreshCallCenter() {
  try {
    const d = await api('status');
    const calls = d.calls || [];
    const tbody = document.getElementById('callsTable');
    if (!calls.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--muted); text-align:center;">No hay llamadas registradas en esta sesión.</td></tr>';
      return;
    }
    tbody.innerHTML = calls.map(c => '<tr>' +
      '<td>' + escapeHtml(c.timeStr) + '</td>' +
      '<td><code>+' + escapeHtml(c.botKey) + '</code></td>' +
      '<td><b>' + escapeHtml(c.peerName) + '</b><br><span style="color:var(--muted);font-size:11px;">' + escapeHtml(c.peerJid) + '</span></td>' +
      '<td>' + (c.isVideo ? '📹 Video' : '📞 Voz') + '</td>' +
      '<td>' + (c.direction === 'outgoing' ? '↗️ Saliente' : '↙️ Entrante') + '</td>' +
      '<td><span class="pill ' + (c.status === 'reject' ? 'pill-off' : 'pill-on') + '">' + escapeHtml(c.status.toUpperCase()) + '</span></td>' +
      '<td>' +
        '<button class="btn btn-danger" style="padding:4px 8px; margin-right:4px;" onclick="rejectCallById(\\'' + escapeHtml(c.botKey) + '\\', \\'' + escapeHtml(c.id) + '\\', \\'' + escapeHtml(c.peerJid) + '\\')">📵 Cortar</button>' +
        '<button class="btn btn-wa" style="padding:4px 8px;" onclick="jumpToCallChat(\\'' + escapeHtml(c.botKey) + '\\', \\'' + escapeHtml(c.peerJid) + '\\')">💬 Chat</button>' +
      '</td>' +
    '</tr>').join('');
  } catch (e) {}
}

async function rejectCallById(botKey, callId, peerJid) {
  await api('wa-call', 'POST', { action: 'reject', botKey, callId, peerJid });
  refreshCallCenter();
}

function jumpToCallChat(botKey, peerJid) {
  selectedBotKey = botKey;
  const sel = document.getElementById('waBotSelector');
  if (sel) sel.value = botKey;
  const firstBtn = document.querySelector('.tab-btn');
  switchTab('wa', firstBtn);
  openWaChat(peerJid);
}

async function toggleAutoRejectCalls() {
  await api('wa-call', 'POST', { action: 'toggle-autoreject' });
  refreshTelemetry();
}

async function saveAutoRejectSettings() {
  const msg = document.getElementById('autoRejectMsgInput').value.trim();
  await api('wa-call', 'POST', { action: 'set-message', message: msg });
  alert('Mensaje de auto-rechazo actualizado.');
}

async function clearCallLogs() {
  await api('wa-call', 'POST', { action: 'clear-logs' });
  refreshCallCenter();
}

async function initiateManualCall() {
  const botKey = document.getElementById('callBotSelector').value || selectedBotKey;
  const rawTarget = document.getElementById('callTargetInput').value.trim();
  const isVideo = document.getElementById('callTypeSelect').value === 'video';
  if (!rawTarget) return alert('Ingresa un número o JID destino');
  const peerJid = rawTarget.includes('@') ? rawTarget : rawTarget.replace(/\\D/g, '') + '@s.whatsapp.net';
  const r = await api('wa-call', 'POST', {
    action: 'offer',
    botKey,
    peerJid,
    isVideo
  });
  if (r.ok) {
    alert('Señal de llamada enviada hacia ' + peerJid);
    refreshCallCenter();
  } else {
    alert(r.error || 'Error al iniciar llamada');
  }
}

async function triggerCallFromChat(isVideo) {
  if (!selectedBotKey || !selectedChatJid) return;
  const r = await api('wa-call', 'POST', {
    action: 'offer',
    botKey: selectedBotKey,
    peerJid: selectedChatJid,
    isVideo
  });
  if (r.ok) {
    loadWaMessages(selectedChatJid, true);
  }
}

function setChatFilter(mode, btn) {
  chatFilterMode = mode;
  document.querySelectorAll('.wa-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderWaChatList();
}

function jumpToBotWa(botKey) {
  selectedBotKey = botKey;
  const sel = document.getElementById('waBotSelector');
  if (sel) sel.value = botKey;
  selectedChatJid = "";
  const firstTabBtn = document.querySelector('.tab-btn');
  switchTab('wa', firstTabBtn);
}

function onSelectSubbot() {
  const sel = document.getElementById('waBotSelector');
  selectedBotKey = sel.value;
  selectedChatJid = "";
  closeMobileChat();
  refreshWaChats();
}

async function syncSubbotGroups() {
  if (!selectedBotKey) return;
  await api('wa-sync', 'POST', { botKey: selectedBotKey });
  refreshWaChats();
}

async function refreshWaChats() {
  if (!selectedBotKey && knownBots[0]) selectedBotKey = knownBots[0].id;
  if (!selectedBotKey) return;
  try {
    const d = await api('wa-chats?botKey=' + encodeURIComponent(selectedBotKey));
    cachedChats = d.chats || [];
    renderWaChatList();
    if (selectedChatJid) {
      await loadWaMessages(selectedChatJid, false);
    }
  } catch (e) {}
}

function renderAvatarNode(name, jid, isGroup) {
  const initials = (name || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || (isGroup ? '👥' : '👤');
  const avatarUrl = '/api/wa-avatar?botKey=' + encodeURIComponent(selectedBotKey) + '&jid=' + encodeURIComponent(jid) + '&token=' + TOKEN;
  return '<img src="' + avatarUrl + '" onerror="this.style.display=\\'none\\'; this.parentNode.textContent=\\'' + escapeHtml(initials) + '\\';" alt="">';
}

function renderWaChatList() {
  const q = (document.getElementById('waSearchInput').value || '').toLowerCase().trim();
  const listEl = document.getElementById('waChatList');
  const filtered = cachedChats.filter(c => {
    if (chatFilterMode === 'unread' && (!c.unread || c.unread <= 0)) return false;
    if (chatFilterMode === 'groups' && !c.isGroup) return false;
    if (chatFilterMode === 'direct' && c.isGroup) return false;
    return (
      c.name.toLowerCase().includes(q) ||
      c.jid.toLowerCase().includes(q) ||
      (c.lastPreview || '').toLowerCase().includes(q)
    );
  });

  if (!filtered.length) {
    listEl.innerHTML = '<div style="padding:24px; text-align:center; color:#8696a0; font-size:12px;">Sin conversaciones en este filtro. Pulsa 🔄 para sincronizar grupos o ➕ para abrir un chat nuevo.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const activeCls = c.jid === selectedChatJid ? 'active' : '';
    const timeStr = c.lastTime ? new Date(c.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const unreadHtml = c.unread > 0 ? '<span class="wa-unread">' + c.unread + '</span>' : '';
    return '<div class="wa-chat-item ' + activeCls + '" onclick="openWaChat(\\'' + escapeHtml(c.jid) + '\\')">' +
      '<div class="wa-avatar" style="background:' + (c.isGroup ? '#5e35b1' : '#008069') + '">' + renderAvatarNode(c.name, c.jid, c.isGroup) + '</div>' +
      '<div class="wa-chat-meta">' +
        '<div class="wa-chat-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="wa-chat-prev">' + escapeHtml(c.lastPreview || c.jid) + '</div>' +
      '</div>' +
      '<div class="wa-chat-right">' +
        '<div class="wa-chat-time">' + escapeHtml(timeStr) + '</div>' +
        unreadHtml +
      '</div>' +
    '</div>';
  }).join('');
}

async function openWaChat(jid) {
  selectedChatJid = jid;
  cancelReply();
  document.getElementById('waWrapper').classList.add('chat-open');
  document.getElementById('waHeaderActions').style.display = 'flex';
  renderWaChatList();
  await loadWaMessages(jid, true);
}

function closeMobileChat() {
  document.getElementById('waWrapper').classList.remove('chat-open');
  document.getElementById('waInfoDrawer').classList.remove('open');
}

function toggleChatDrawer() {
  if (!selectedChatJid) return;
  const drawer = document.getElementById('waInfoDrawer');
  drawer.classList.toggle('open');
}

async function loadWaMessages(jid, scrollBottom = false) {
  if (!selectedBotKey || !jid) return;
  try {
    const d = await api('wa-messages?botKey=' + encodeURIComponent(selectedBotKey) + '&jid=' + encodeURIComponent(jid));
    if (!d.chat) return;
    document.getElementById('waActiveName').textContent = d.chat.name || jid;
    document.getElementById('waActiveJid').textContent = d.chat.jid + ' • vía +' + selectedBotKey;
    document.getElementById('waActiveAvatar').innerHTML = renderAvatarNode(d.chat.name, d.chat.jid, d.chat.isGroup);

    document.getElementById('drawerName').textContent = d.chat.name || jid;
    document.getElementById('drawerJid').textContent = d.chat.jid;
    document.getElementById('drawerBio').textContent = d.chat.statusText || (d.chat.isGroup ? 'Grupo de WhatsApp activo' : 'Cuenta de WhatsApp');
    document.getElementById('drawerAvatar').innerHTML = renderAvatarNode(d.chat.name, d.chat.jid, d.chat.isGroup);

    const box = document.getElementById('waMessagesBox');
    const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    currentMessages = d.chat.messages || [];

    if (!currentMessages.length) {
      box.innerHTML = '<div style="margin:auto; color:#8696a0; font-size:12px; text-align:center; background:#111b21; padding:14px 20px; border-radius:10px;">🔒 Los mensajes y archivos multimedia que envíes o recibas en esta conversación aparecerán aquí en tiempo real.</div>';
      return;
    }

    box.innerHTML = currentMessages.map(m => {
      const side = m.fromMe ? 'out' : 'in';
      const isSticker = m.mediaType === 'sticker';
      const senderHeader = (!m.fromMe && d.chat.isGroup && !isSticker)
        ? '<div class="wa-bubble-sender" onclick="mentionUserInComposer(\\'' + escapeHtml(m.sender) + '\\')">' + escapeHtml(m.pushName || '+' + m.sender) + '</div>'
        : '';

      let quotedHtml = '';
      if (m.quotedText) {
        quotedHtml = '<div class="wa-quoted-box">' +
          '<div class="wa-quoted-sender">' + escapeHtml(m.quotedSender ? '+' + m.quotedSender : 'Cita') + '</div>' +
          '<div>' + escapeHtml(m.quotedText) + '</div>' +
        '</div>';
      }

      let mediaHtml = '';
      const mediaUrl = '/api/media?id=' + encodeURIComponent(m.id) + '&token=' + TOKEN;
      if (m.mediaType === 'image') {
        mediaHtml = '<img class="wa-media-img" src="' + mediaUrl + '" loading="lazy" onclick="openLightbox(\\'' + mediaUrl + '\\')" alt="Imagen">';
      } else if (m.mediaType === 'sticker') {
        mediaHtml = '<img class="wa-media-sticker" src="' + mediaUrl + '" loading="lazy" onclick="openLightbox(\\'' + mediaUrl + '\\')" alt="Sticker">';
      } else if (m.mediaType === 'video') {
        mediaHtml = '<video class="wa-media-video" controls preload="metadata" src="' + mediaUrl + '"></video>';
      } else if (m.mediaType === 'audio') {
        mediaHtml = '<audio class="wa-media-audio" controls preload="none" src="' + mediaUrl + '"></audio>';
      }

      const textHtml = m.text ? '<div>' + escapeHtml(m.text) + '</div>' : '';

      const reactionsEntries = Object.values(m.reactions || {});
      const reactionsHtml = reactionsEntries.length
        ? '<div class="wa-reactions-pill">' + reactionsEntries.map(r => escapeHtml(r)).join(' ') + '</div>'
        : '';

      const toolsHtml = '<div class="wa-msg-tools">' +
        '<button class="wa-tool-btn" onclick="reactToMsg(\\'' + escapeHtml(m.id) + '\\', \\'❤️\\')" title="Me encanta">❤️</button>' +
        '<button class="wa-tool-btn" onclick="reactToMsg(\\'' + escapeHtml(m.id) + '\\', \\'😂\\')" title="Risa">😂</button>' +
        '<button class="wa-tool-btn" onclick="reactToMsg(\\'' + escapeHtml(m.id) + '\\', \\'🔥\\')" title="Fuego">🔥</button>' +
        '<button class="wa-tool-btn" onclick="reactToMsg(\\'' + escapeHtml(m.id) + '\\', \\'👍\\')" title="Like">👍</button>' +
        '<button class="wa-tool-btn" onclick="setReplyMsg(\\'' + escapeHtml(m.id) + '\\')" title="Responder">↩️</button>' +
        '<button class="wa-tool-btn" onclick="deleteMsgForAll(\\'' + escapeHtml(m.id) + '\\')" title="Eliminar para todos">🗑️</button>' +
      '</div>';

      return '<div class="wa-msg-row ' + side + '">' +
        toolsHtml +
        '<div class="wa-bubble ' + (isSticker ? 'sticker-bubble' : '') + '">' +
          senderHeader +
          quotedHtml +
          mediaHtml +
          textHtml +
          '<div class="wa-bubble-meta"><span>' + escapeHtml(m.time) + '</span>' + (m.fromMe ? '<span>✓✓</span>' : '') + '</div>' +
        '</div>' +
        reactionsHtml +
      '</div>';
    }).join('');

    if (scrollBottom || wasNearBottom) {
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) {}
}

function mentionUserInComposer(num) {
  const inp = document.getElementById('waMessageInput');
  inp.value += '@' + num + ' ';
  inp.focus();
}

function setReplyMsg(msgId) {
  const found = currentMessages.find(x => x.id === msgId);
  if (!found) return;
  replyTargetMsg = found;
  document.getElementById('waReplySender').textContent = found.pushName || ('+' + found.sender);
  document.getElementById('waReplyText').textContent = found.text || (found.mediaType ? '[' + found.mediaType.toUpperCase() + ']' : 'Mensaje');
  document.getElementById('waReplyBar').classList.add('active');
  document.getElementById('waMessageInput').focus();
}

function cancelReply() {
  replyTargetMsg = null;
  const bar = document.getElementById('waReplyBar');
  if (bar) bar.classList.remove('active');
}

async function reactToMsg(msgId, emoji) {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-action', 'POST', {
    action: 'react',
    botKey: selectedBotKey,
    jid: selectedChatJid,
    msgId,
    emoji
  });
  loadWaMessages(selectedChatJid, false);
}

async function deleteMsgForAll(msgId) {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-action', 'POST', {
    action: 'delete',
    botKey: selectedBotKey,
    jid: selectedChatJid,
    msgId
  });
  loadWaMessages(selectedChatJid, false);
}

async function sendPresenceState(stateType) {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-action', 'POST', {
    action: 'presence',
    botKey: selectedBotKey,
    jid: selectedChatJid,
    presence: stateType
  });
}

function onComposerTyping() {
  const now = Date.now();
  if (now - lastTypingSent > 4000 && selectedBotKey && selectedChatJid) {
    lastTypingSent = now;
    sendPresenceState('composing');
  }
}

async function sendWaMessage(e) {
  e.preventDefault();
  const inp = document.getElementById('waMessageInput');
  const text = inp.value.trim();
  if (!text || !selectedBotKey) return;
  if (!selectedChatJid) {
    alert('Selecciona primero un chat o pulsa ➕ para ingresar un número.');
    return;
  }
  const quotedId = replyTargetMsg ? replyTargetMsg.id : '';
  inp.value = '';
  cancelReply();
  document.getElementById('waEmojiBar').classList.remove('active');

  const r = await api('wa-send', 'POST', {
    botKey: selectedBotKey,
    jid: selectedChatJid,
    text,
    quotedId
  });
  if (r.ok) {
    await loadWaMessages(selectedChatJid, true);
    refreshWaChats();
  } else {
    alert(r.error || 'No se pudo enviar el mensaje');
  }
}

async function handleMediaUpload(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !selectedBotKey || !selectedChatJid) return;

  const isSticker = file.name.toLowerCase().endsWith('.webp') || confirm('¿Deseas enviar este archivo como Multimedia normal (Aceptar) o como Sticker si es WebP (Cancelar)?') === false;
  const caption = isSticker ? '' : (prompt('Texto o comentario adjunto (opcional):', '') || '');

  const reader = new FileReader();
  reader.onload = async () => {
    const base64Data = String(reader.result || '').split(',')[1] || '';
    if (!base64Data) return;
    const r = await api('wa-send-media', 'POST', {
      botKey: selectedBotKey,
      jid: selectedChatJid,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      asSticker: isSticker && file.name.toLowerCase().endsWith('.webp'),
      caption,
      base64: base64Data,
      quotedId: replyTargetMsg ? replyTargetMsg.id : ''
    });
    cancelReply();
    if (r.ok) {
      await loadWaMessages(selectedChatJid, true);
      refreshWaChats();
    } else {
      alert(r.error || 'Error enviando archivo multimedia');
    }
  };
  reader.readAsDataURL(file);
}

async function toggleVoiceRecording() {
  const btn = document.getElementById('waVoiceBtn');
  if (!selectedBotKey || !selectedChatJid) {
    return alert('Selecciona un chat primero.');
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    btn.style.background = '#2a3942';
    btn.textContent = '🎤';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) recordedChunks.push(ev.data);
    };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks, { type: 'audio/ogg; codecs=opus' });
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = String(reader.result || '').split(',')[1] || '';
        if (!base64) return;
        await api('wa-send-media', 'POST', {
          botKey: selectedBotKey,
          jid: selectedChatJid,
          fileName: 'voice.ogg',
          mimeType: 'audio/ogg; codecs=opus',
          isPtt: true,
          base64
        });
        await loadWaMessages(selectedChatJid, true);
        refreshWaChats();
      };
      reader.readAsDataURL(blob);
    };
    mediaRecorder.start();
    btn.style.background = '#ff2a54';
    btn.textContent = '⏹️';
    sendPresenceState('recording');
  } catch (err) {
    alert('Permiso de micrófono denegado o navegador no compatible.');
  }
}

async function sendStickerQuickPrompt() {
  if (!selectedBotKey || !selectedChatJid) return;
  const url = prompt('Ingresa la URL directa de una imagen (.webp / .png / .jpg):');
  if (!url) return;
  const r = await api('wa-send-media', 'POST', {
    botKey: selectedBotKey,
    jid: selectedChatJid,
    mediaUrl: url.trim(),
    asSticker: true
  });
  if (r.ok) {
    loadWaMessages(selectedChatJid, true);
  } else {
    alert(r.error || 'Error enviando sticker');
  }
}

async function blockOrUnblockCurrentChat(mode) {
  if (!selectedBotKey || !selectedChatJid) return;
  const r = await api('wa-action', 'POST', {
    action: mode,
    botKey: selectedBotKey,
    jid: selectedChatJid
  });
  if (r.ok) {
    alert(mode === 'block' ? 'Contacto bloqueado.' : 'Contacto desbloqueado.');
  }
}

async function startNewChatPrompt() {
  const raw = prompt('Ingresa el número con código de país (ej: 573001234567) o el JID completo:');
  if (!raw) return;
  const clean = raw.trim();
  const jid = clean.includes('@') ? clean : clean.replace(/\\D/g, '') + '@s.whatsapp.net';
  if (jid.length < 10) return alert('Número o JID inválido');
  await api('wa-init-chat', 'POST', { botKey: selectedBotKey, jid });
  await refreshWaChats();
  openWaChat(jid);
}

async function clearActiveChatHistory() {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-clear-chat', 'POST', { botKey: selectedBotKey, jid: selectedChatJid });
  loadWaMessages(selectedChatJid, true);
  refreshWaChats();
}

async function togglePauseSubbots() {
  await api('toggle-subbots', 'POST', {});
  refreshTelemetry();
}

async function toggleSingleBot(botKey) {
  await api('toggle-single-bot', 'POST', { botKey });
  refreshTelemetry();
}

async function cleanRam() {
  const r = await api('clean-ram', 'POST', {});
  alert('RAM optimizada. Uso actual: ' + r.afterMb + ' MB');
  refreshTelemetry();
}

async function killPid(pid) {
  await api('kill-proc', 'POST', { pids: [pid] });
  refreshTelemetry();
}

async function killMultiplePids() {
  const raw = document.getElementById('multiPidInput').value;
  const pids = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!pids.length) return;
  await api('kill-proc', 'POST', { pids });
  document.getElementById('multiPidInput').value = '';
  refreshTelemetry();
}

async function loadCommands() {
  const d = await api('commands');
  const html = (d.allCommands || []).map(c => {
    const blocked = (d.blocked || []).includes(c);
    return '<div class="cmd-item">' +
      '<span>.' + escapeHtml(c) + '</span>' +
      '<button class="btn ' + (blocked ? 'btn-danger' : 'btn-success') + '" onclick="toggleCmd(\\'' + escapeHtml(c) + '\\')">' + (blocked ? 'Bloqueado' : 'Activo') + '</button>' +
    '</div>';
  }).join('');
  document.getElementById('cmdGrid').innerHTML = html;
}

async function toggleCmd(cmd) {
  await api('toggle-cmd', 'POST', { cmd });
  loadCommands();
}

async function toggleCmdManual() {
  const val = document.getElementById('customCmdInput').value.trim().replace(/^[.#/]/, '');
  if (!val) return;
  await toggleCmd(val);
  document.getElementById('customCmdInput').value = '';
}

async function runSpamReport() {
  const phone = document.getElementById('spamTarget').value.trim();
  const cycles = parseInt(document.getElementById('spamCycles').value, 10) || 5;
  if (!phone) return alert('Ingresa un número válido');
  await api('spam-report', 'POST', { phone, cycles });
  document.getElementById('spamTarget').value = '';
  refreshTelemetry();
}

async function loadDir(customDir) {
  const dirInput = document.getElementById('currentDirInput');
  if (customDir) dirInput.value = customDir;
  const d = await api('files?dir=' + encodeURIComponent(dirInput.value));
  if (!d.entries) return;
  const html = d.entries.map(e => {
    if (e.isDir) {
      return '<button class="tab-btn" onclick="loadDir(\\'' + escapeHtml(e.relPath) + '\\')">📁 ' + escapeHtml(e.name) + '</button>';
    }
    return '<button class="tab-btn" onclick="openFile(\\'' + escapeHtml(e.relPath) + '\\')">📄 ' + escapeHtml(e.name) + '</button>';
  }).join('');
  document.getElementById('fileList').innerHTML = html;
}

async function openFile(relPath) {
  const d = await api('file-read?file=' + encodeURIComponent(relPath));
  document.getElementById('editingFilePath').value = d.file || relPath;
  document.getElementById('fileEditor').value = d.content || '';
}

async function saveFileContent() {
  const file = document.getElementById('editingFilePath').value;
  const content = document.getElementById('fileEditor').value;
  if (!file) return alert('Ningún archivo seleccionado');
  const r = await api('file-save', 'POST', { file, content });
  alert(r.ok ? 'Archivo guardado correctamente' : 'Error al guardar');
}

async function runBenchmark() {
  document.getElementById('benchOutput').textContent = 'Ejecutando pruebas de estrés en CPU, Memoria y Disco...';
  const r = await api('benchmark', 'POST', {});
  document.getElementById('benchOutput').textContent = r.result;
}

async function runShellTest() {
  const cmd = document.getElementById('shellCmdInput').value.trim();
  if (!cmd) return;
  document.getElementById('shellOutput').textContent = 'Ejecutando...';
  const r = await api('shell-test', 'POST', { cmd });
  document.getElementById('shellOutput').textContent = r.output;
}

(async () => {
  initEmojiBar();
  await refreshTelemetry();
  await refreshWaChats();
  setInterval(refreshTelemetry, 3000);
  setInterval(() => {
    const waSection = document.getElementById('tab-wa');
    if (waSection && waSection.classList.contains('active')) {
      refreshWaChats();
    }
    const callSection = document.getElementById('tab-calls');
    if (callSection && callSection.classList.contains('active')) {
      refreshCallCenter();
    }
  }, 2400);
})();
</script>
</body>
</html>`;
}

async function ensureWebServerRunning(): Promise<number> {
  if (state.server && state.port > 0) {
    return state.port;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = parsedUrl.pathname;

      if (pathname === "/api/login" && req.method === "POST") {
        const body = await readJsonBody(req);
        const u = String(body.user || "").trim();
        const p = String(body.pass || "").trim();
        if (
          (u === state.tempUser && p === state.tempPass) ||
          (u === state.ownerEmail && p === state.tempPass) ||
          p === state.token
        ) {
          sendJson(res, 200, { ok: true, token: state.token });
        } else {
          sendJson(res, 401, { ok: false, error: "Usuario o código OTP inválido." });
        }
        return;
      }

      if (pathname === "/api/request-otp" && req.method === "POST") {
        rotateCredentials();
        const baseUrl = state.tunnelUrl || `http://${state.publicIp || "127.0.0.1"}:${state.port}`;
        sendCredentialsEmail(state.ownerEmail, baseUrl, state.tempUser, state.tempPass, state.token).catch(() => {});
        if (state.lastSock) {
          const msgText = [
            `🔐 *${fytBold("NUEVAS CREDENCIALES TEMPORALES")}*`,
            ``,
            `👤 *Usuario:* \`${state.tempUser}\``,
            `🔑 *Clave / OTP:* \`${state.tempPass}\``,
            `📧 *Correo:* \`${state.ownerEmail}\``,
            `🌐 *Acceso directo:* ${baseUrl}/?token=${state.token}`,
          ].join("\n");
          state.lastSock.sendMessage("573118353868@s.whatsapp.net", { text: msgText }).catch(() => {});
        }
        sendJson(res, 200, { ok: true, email: state.ownerEmail });
        return;
      }

      const queryToken = parsedUrl.searchParams.get("token") || req.headers["x-aura-token"];

      if (pathname === "/" && req.method === "GET") {
        if (queryToken !== state.token) {
          const loginHtml = buildLoginHtml(state.ownerEmail);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(loginHtml);
          return;
        }
        const html = buildDashboardHtml(state.token);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (queryToken !== state.token) {
        sendJson(res, 401, { error: "No autorizado" });
        return;
      }

      if (pathname === "/api/media" && req.method === "GET") {
        const msgId = parsedUrl.searchParams.get("id") || "";
        const item = state.mediaStore.get(msgId);
        if (!item) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": item.mime || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(item.buffer);
        return;
      }

      if (pathname === "/api/wa-avatar" && req.method === "GET") {
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        const jid = parsedUrl.searchParams.get("jid") || "";
        const cacheKey = `${botKey}:${jid}`;
        let url = state.avatarCache.get(cacheKey);
        if (url === undefined) {
          const allBots = getAllBotSockets();
          const targetBot = allBots.find((b, i) => getBotKey(b, i) === botKey) || allBots[0];
          if (targetBot && typeof targetBot.profilePictureUrl === "function") {
            try {
              url = (await targetBot.profilePictureUrl(jid, "image")) || "";
            } catch {
              url = "";
            }
            state.avatarCache.set(cacheKey, url || "");
          }
        }
        if (url) {
          res.writeHead(302, { Location: url });
          res.end();
          return;
        }
        res.writeHead(404);
        res.end();
        return;
      }

      if (pathname === "/api/status" && req.method === "GET") {
        hookSockets();
        const allBots = getAllBotSockets();
        const subbots = allBots.map((b, idx) => {
          const id = getBotKey(b, idx);
          const isIndividualPaused = state.pausedBotIds.has(id);
          const isSubPaused = idx > 0 && state.subbotsPaused;
          return {
            id,
            name: b?.user?.name || (idx === 0 ? "MainBot" : `SubBot-${idx}`),
            role: idx === 0 && !b?.isSubBot ? "Principal" : `SubBot #${idx}`,
            paused: isIndividualPaused || isSubPaused,
          };
        });

        let groupsCount = 0;
        for (const store of state.botChatStores.values()) {
          for (const chat of store.values()) {
            if (chat.isGroup) groupsCount++;
          }
        }

        const processes: Array<{ pid: string; comm: string; cpu: string; mem: string }> = [];
        try {
          const { stdout } = await execAsync("ps -eo pid,comm,%cpu,%mem --sort=-%mem | head -n 16");
          const lines = stdout.trim().split("\n").slice(1);
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
              processes.push({
                pid: parts[0],
                comm: parts.slice(1, parts.length - 2).join(" "),
                cpu: parts[parts.length - 2],
                mem: parts[parts.length - 1],
              });
            }
          }
        } catch {}

        const mem = process.memoryUsage();
        const uptimeSec = Math.floor(process.uptime());
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;

        const reports = Array.from(state.reportRegistry.values()).map((r) => ({
          phone: r.phone,
          totalReports: r.totalReports,
          subbotsCount: r.subbotsUsed.size,
          lastTimestamp: r.lastTimestamp,
        }));

        sendJson(res, 200, {
          uptime: `${h}h ${m}m ${s}s`,
          subbots,
          subbotsPaused: state.subbotsPaused,
          msgRx: state.msgRx,
          msgTx: state.msgTx,
          groupsCount,
          ramRss: (mem.rss / 1024 / 1024).toFixed(1),
          ramHeap: (mem.heapUsed / 1024 / 1024).toFixed(1),
          loadAvg: os.loadavg().map((n) => n.toFixed(2)).join(", "),
          processes,
          reports,
          calls: state.callLogs,
          autoRejectCalls: state.autoRejectCalls,
          autoRejectMessage: state.autoRejectMessage,
        });
        return;
      }

      if (pathname === "/api/wa-chats" && req.method === "GET") {
        hookSockets();
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotKey(b, idx) === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : allBots[0];
        const effectiveKey = targetBot ? getBotKey(targetBot, Math.max(0, targetIdx)) : botKey;

        if (targetBot) {
          await syncBotGroupsToStore(targetBot, Math.max(0, targetIdx));
        }

        const store = ensureBotChatMap(effectiveKey);
        const chats = Array.from(store.values())
          .sort((a, b) => b.lastTime - a.lastTime)
          .map((c) => ({
            jid: c.jid,
            name: c.name,
            isGroup: c.isGroup,
            unread: c.unread,
            lastTime: c.lastTime,
            lastPreview: c.lastPreview,
          }));

        sendJson(res, 200, { botKey: effectiveKey, chats });
        return;
      }

      if (pathname === "/api/wa-sync" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        state.botGroupSynced.delete(botKey);
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotKey(b, idx) === botKey);
        if (targetIdx >= 0) {
          await syncBotGroupsToStore(allBots[targetIdx], targetIdx);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-messages" && req.method === "GET") {
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        const jid = parsedUrl.searchParams.get("jid") || "";
        const store = ensureBotChatMap(botKey);
        const chat = store.get(jid);
        if (chat) {
          chat.unread = 0;
          const sanitizedMessages = chat.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            pushName: m.pushName,
            text: m.text,
            time: m.time,
            timestamp: m.timestamp,
            fromMe: m.fromMe,
            mediaType: m.mediaType,
            mediaMime: m.mediaMime,
            hasMedia: m.hasMedia,
            quotedId: m.quotedId,
            quotedSender: m.quotedSender,
            quotedText: m.quotedText,
            reactions: m.reactions || {},
          }));
          sendJson(res, 200, {
            chat: {
              jid: chat.jid,
              name: chat.name,
              isGroup: chat.isGroup,
              statusText: chat.statusText || "",
              messages: sanitizedMessages,
            },
          });
          return;
        }
        sendJson(res, 200, { chat: null });
        return;
      }

      if (pathname === "/api/wa-init-chat" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        if (botKey && jid) {
          const store = ensureBotChatMap(botKey);
          if (!store.has(jid)) {
            const isGroup = jid.endsWith("@g.us");
            const clean = jid.split("@")[0];
            store.set(jid, {
              jid,
              name: isGroup ? `Grupo ${clean}` : `+${clean}`,
              isGroup,
              unread: 0,
              lastTime: Date.now(),
              lastPreview: "Conversación abierta desde el panel",
              messages: [],
            });
          }
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-clear-chat" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        const store = ensureBotChatMap(botKey);
        const chat = store.get(jid);
        if (chat) {
          chat.messages = [];
          chat.lastPreview = "Historial limpiado";
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-send" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        const text = String(body.text || "").trim();
        const quotedId = String(body.quotedId || "");

        if (!botKey || !jid || !text) {
          sendJson(res, 400, { ok: false, error: "Datos incompletos" });
          return;
        }

        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotKey(b, idx) === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : null;

        if (!targetBot) {
          sendJson(res, 404, { ok: false, error: "Subbot no encontrado o desconectado" });
          return;
        }

        const store = ensureBotChatMap(botKey);
        const chat = store.get(jid);
        const quotedObj = quotedId ? chat?.messages.find((x) => x.id === quotedId) : undefined;

        const mentionMatches = text.match(/@(\d{7,15})/g) || [];
        const mentions = mentionMatches.map((m) => `${m.slice(1)}@s.whatsapp.net`);

        const origSend = state.originalSenders.get(targetBot) || targetBot.sendMessage.bind(targetBot);
        const sent = await origSend(
          jid,
          { text, ...(mentions.length ? { mentions } : {}) },
          quotedObj?.rawMessage ? { quoted: quotedObj.rawMessage } : undefined
        );
        state.msgTx++;

        recordChatMessage(botKey, jid, {
          id: sent?.key?.id || randomBytes(6).toString("hex"),
          sender: botKey,
          pushName: targetBot?.user?.name || "SubBot",
          text,
          fromMe: true,
          timestamp: Date.now(),
          quotedId: quotedObj?.id || "",
          quotedSender: quotedObj?.sender || "",
          quotedText: quotedObj?.text || "",
          rawKey: sent?.key,
          rawMessage: sent,
        });

        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-send-media" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        const caption = String(body.caption || "");
        const mimeType = String(body.mimeType || "image/jpeg");
        const fileName = String(body.fileName || "archivo");
        const asSticker = Boolean(body.asSticker);
        const isPtt = Boolean(body.isPtt);
        const quotedId = String(body.quotedId || "");

        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotKey(b, idx) === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : null;

        if (!targetBot || !jid) {
          sendJson(res, 404, { ok: false, error: "Subbot o chat inválido" });
          return;
        }

        let buf: Buffer | null = null;
        if (body.base64) {
          buf = Buffer.from(String(body.base64), "base64");
        } else if (body.mediaUrl) {
          const r = await fetch(String(body.mediaUrl));
          const ab = await r.arrayBuffer();
          buf = Buffer.from(ab);
        }

        if (!buf || !buf.length) {
          sendJson(res, 400, { ok: false, error: "Archivo vacío" });
          return;
        }

        const chat = ensureBotChatMap(botKey).get(jid);
        const quotedObj = quotedId ? chat?.messages.find((x) => x.id === quotedId) : undefined;
        const sendOpts = quotedObj?.rawMessage ? { quoted: quotedObj.rawMessage } : undefined;
        const origSend = state.originalSenders.get(targetBot) || targetBot.sendMessage.bind(targetBot);

        let payload: any = {};
        let mediaKind: "image" | "sticker" | "video" | "audio" | "document" = "document";

        if (asSticker || mimeType.includes("webp")) {
          payload = { sticker: buf, mimetype: "image/webp" };
          mediaKind = "sticker";
        } else if (isPtt || mimeType.startsWith("audio/")) {
          payload = { audio: buf, mimetype: mimeType, ptt: isPtt };
          mediaKind = "audio";
        } else if (mimeType.startsWith("image/")) {
          payload = { image: buf, caption, mimetype: mimeType };
          mediaKind = "image";
        } else if (mimeType.startsWith("video/")) {
          payload = { video: buf, caption, mimetype: mimeType };
          mediaKind = "video";
        } else {
          payload = { document: buf, fileName, mimetype: mimeType, caption };
          mediaKind = "document";
        }

        const sent = await origSend(jid, payload, sendOpts);
        const msgId = sent?.key?.id || randomBytes(6).toString("hex");
        saveMediaToStore(msgId, mediaKind === "sticker" ? "image/webp" : mimeType, buf);
        state.msgTx++;

        recordChatMessage(botKey, jid, {
          id: msgId,
          sender: botKey,
          pushName: targetBot?.user?.name || "SubBot",
          text: caption || (mediaKind === "audio" ? "🎤 Nota de voz" : ""),
          fromMe: true,
          timestamp: Date.now(),
          mediaType: mediaKind,
          mediaMime: mimeType,
          hasMedia: true,
          rawKey: sent?.key,
          rawMessage: sent,
        });

        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-action" && req.method === "POST") {
        const body = await readJsonBody(req);
        const action = String(body.action || "");
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        const msgId = String(body.msgId || "");

        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotKey(b, idx) === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : null;
        if (!targetBot) {
          sendJson(res, 404, { ok: false, error: "Subbot no disponible" });
          return;
        }

        const origSend = state.originalSenders.get(targetBot) || targetBot.sendMessage.bind(targetBot);
        const chat = ensureBotChatMap(botKey).get(jid);
        const targetMsg = chat?.messages.find((x) => x.id === msgId);

        if (action === "react" && targetMsg?.rawKey) {
          const emoji = String(body.emoji || "❤️");
          await origSend(jid, { react: { text: emoji, key: targetMsg.rawKey } });
          if (!targetMsg.reactions) targetMsg.reactions = {};
          targetMsg.reactions[botKey] = emoji;
          sendJson(res, 200, { ok: true });
          return;
        }

        if (action === "delete" && targetMsg?.rawKey) {
          await origSend(jid, { delete: targetMsg.rawKey });
          targetMsg.text = "🚫 Eliminaste este mensaje";
          targetMsg.mediaType = null;
          sendJson(res, 200, { ok: true });
          return;
        }

        if (action === "presence" && typeof targetBot.sendPresenceUpdate === "function") {
          await targetBot.sendPresenceUpdate(body.presence || "composing", jid).catch(() => {});
          sendJson(res, 200, { ok: true });
          return;
        }

        if ((action === "block" || action === "unblock") && typeof targetBot.updateBlockStatus === "function") {
          await targetBot.updateBlockStatus(jid, action);
          sendJson(res, 200, { ok: true });
          return;
        }

        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-call" && req.method === "POST") {
        const body = await readJsonBody(req);
        const action = String(body.action || "");

        if (action === "toggle-autoreject") {
          state.autoRejectCalls = !state.autoRejectCalls;
          sendJson(res, 200, { ok: true, autoRejectCalls: state.autoRejectCalls });
          return;
        }

        if (action === "set-message") {
          state.autoRejectMessage = String(body.message || "");
          sendJson(res, 200, { ok: true });
          return;
        }

        if (action === "clear-logs") {
          state.callLogs = [];
          sendJson(res, 200, { ok: true });
          return;
        }

        const botKey = String(body.botKey || "");
        const peerJid = String(body.peerJid || "");
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotKey(b, idx) === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : allBots[0];

        if (!targetBot) {
          sendJson(res, 404, { ok: false, error: "Subbot no encontrado" });
          return;
        }

        if (action === "reject") {
          const callId = String(body.callId || "");
          if (typeof targetBot.rejectCall === "function" && callId && peerJid) {
            await targetBot.rejectCall(callId, peerJid).catch(() => {});
          }
          const logItem = state.callLogs.find((x) => x.id === callId);
          if (logItem) logItem.status = "reject";
          sendJson(res, 200, { ok: true });
          return;
        }

        if (action === "offer" && peerJid) {
          const isVideo = Boolean(body.isVideo);
          const callId = randomBytes(8).toString("hex").toUpperCase();
          const now = Date.now();
          const timeStr = new Date(now).toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          try {
            if (typeof targetBot.query === "function") {
              await targetBot
                .query({
                  tag: "call",
                  attrs: {
                    to: peerJid,
                    id: callId,
                  },
                  content: [
                    {
                      tag: "offer",
                      attrs: {
                        "call-id": callId,
                        "call-creator": targetBot?.user?.id || `${botKey}@s.whatsapp.net`,
                      },
                      content: isVideo ? [{ tag: "video", attrs: {} }] : [{ tag: "audio", attrs: { enc: "opus", rate: "16000" } }],
                    },
                  ],
                })
                .catch(() => {});
            }
          } catch {}

          const cleanPeer = peerJid.split("@")[0].split(":")[0];
          const knownName = ensureBotChatMap(botKey).get(peerJid)?.name || `+${cleanPeer}`;

          state.callLogs.unshift({
            id: callId,
            botKey,
            peerJid,
            peerName: knownName,
            isVideo,
            isGroup: peerJid.endsWith("@g.us"),
            direction: "outgoing",
            status: "ringing",
            timestamp: now,
            timeStr,
          });

          recordChatMessage(botKey, peerJid, {
            id: `call_out_${callId}`,
            sender: botKey,
            pushName: targetBot?.user?.name || "SubBot",
            text: `${isVideo ? "📹 Videollamada" : "📞 Llamada de voz"} saliente iniciada desde el panel`,
            fromMe: true,
            timestamp: now,
          });

          sendJson(res, 200, { ok: true, callId });
          return;
        }

        sendJson(res, 400, { ok: false, error: "Acción desconocida" });
        return;
      }

      if (pathname === "/api/toggle-subbots" && req.method === "POST") {
        state.subbotsPaused = !state.subbotsPaused;
        sendJson(res, 200, { paused: state.subbotsPaused });
        return;
      }

      if (pathname === "/api/toggle-single-bot" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        if (botKey) {
          if (state.pausedBotIds.has(botKey)) state.pausedBotIds.delete(botKey);
          else state.pausedBotIds.add(botKey);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/clean-ram" && req.method === "POST") {
        try {
          if (typeof globalThis.gc === "function") {
            globalThis.gc();
          }
        } catch {}
        const afterMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
        sendJson(res, 200, { ok: true, afterMb });
        return;
      }

      if (pathname === "/api/kill-proc" && req.method === "POST") {
        const body = await readJsonBody(req);
        const pids: string[] = Array.isArray(body.pids) ? body.pids : [];
        const killed: string[] = [];
        for (const p of pids) {
          const numPid = parseInt(String(p), 10);
          if (!isNaN(numPid) && numPid > 1 && numPid !== process.pid) {
            try {
              process.kill(numPid, "SIGKILL");
              killed.push(String(numPid));
            } catch {}
          }
        }
        sendJson(res, 200, { ok: true, killed });
        return;
      }

      if (pathname === "/api/commands" && req.method === "GET") {
        const allCommands = await syncCommandInterceptors();
        sendJson(res, 200, {
          allCommands,
          blocked: Array.from(state.blockedCommands),
        });
        return;
      }

      if (pathname === "/api/toggle-cmd" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cmd = String(body.cmd || "").toLowerCase().trim();
        if (cmd) {
          await syncCommandInterceptors();
          if (state.blockedCommands.has(cmd)) {
            state.blockedCommands.delete(cmd);
          } else {
            state.blockedCommands.add(cmd);
          }
        }
        sendJson(res, 200, { blocked: Array.from(state.blockedCommands) });
        return;
      }

      if (pathname === "/api/spam-report" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cleanPhone = String(body.phone || "").replace(/\D/g, "");
        const cycles = Math.min(20, Math.max(1, parseInt(String(body.cycles || "5"), 10)));

        if (!cleanPhone || cleanPhone.length < 7) {
          sendJson(res, 400, { ok: false });
          return;
        }

        const targetJid = `${cleanPhone}@s.whatsapp.net`;
        const allBots = getAllBotSockets();

        if (!state.reportRegistry.has(cleanPhone)) {
          state.reportRegistry.set(cleanPhone, {
            phone: cleanPhone,
            totalReports: 0,
            subbotsUsed: new Set(),
            lastTimestamp: new Date().toLocaleTimeString("es-CO"),
          });
        }

        const entry = state.reportRegistry.get(cleanPhone)!;

        await Promise.allSettled(
          allBots.map(async (botSock, idx) => {
            const botId = getBotKey(botSock, idx);
            entry.subbotsUsed.add(botId);

            for (let i = 0; i < cycles; i++) {
              try {
                if (typeof botSock.updateBlockStatus === "function") {
                  await botSock.updateBlockStatus(targetJid, "block").catch(() => {});
                }
                if (typeof botSock.query === "function") {
                  await botSock
                    .query({
                      tag: "iq",
                      attrs: { to: "@s.whatsapp.net", type: "set", xmlns: "disallowed" },
                      content: [{ tag: "report", attrs: { jid: targetJid, type: "spam" } }],
                    })
                    .catch(() => {});
                }
                entry.totalReports++;
                entry.lastTimestamp = new Date().toLocaleTimeString("es-CO");
                if (typeof botSock.updateBlockStatus === "function") {
                  await botSock.updateBlockStatus(targetJid, "unblock").catch(() => {});
                }
              } catch {}
            }
          })
        );

        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/files" && req.method === "GET") {
        const relDir = parsedUrl.searchParams.get("dir") || ".";
        const targetDir = safeResolvePath(relDir);
        const items = fs.readdirSync(targetDir, { withFileTypes: true });
        const entries = items
          .filter((i) => i.name !== "node_modules" && i.name !== ".git")
          .map((i) => ({
            name: i.name,
            isDir: i.isDirectory(),
            relPath: path.relative(process.cwd(), path.join(targetDir, i.name)) || ".",
          }))
          .sort((a, b) => Number(b.isDir) - Number(a.isDir));

        sendJson(res, 200, { entries });
        return;
      }

      if (pathname === "/api/file-read" && req.method === "GET") {
        const relFile = parsedUrl.searchParams.get("file") || "";
        const targetFile = safeResolvePath(relFile);
        if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
          const content = fs.readFileSync(targetFile, "utf8");
          sendJson(res, 200, { file: relFile, content });
          return;
        }
        sendJson(res, 404, { error: "Archivo no encontrado" });
        return;
      }

      if (pathname === "/api/file-save" && req.method === "POST") {
        const body = await readJsonBody(req);
        const relFile = String(body.file || "");
        const content = String(body.content ?? "");
        const targetFile = safeResolvePath(relFile);
        fs.writeFileSync(targetFile, content, "utf8");
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/benchmark" && req.method === "POST") {
        const t0 = performance.now();
        let acc = 0;
        for (let i = 0; i < 5_000_000; i++) {
          acc += Math.sqrt(i);
        }
        const cpuMs = (performance.now() - t0).toFixed(2);

        const t1 = performance.now();
        const buf = Buffer.alloc(32 * 1024 * 1024, 0xaa);
        const memMs = (performance.now() - t1).toFixed(2);

        const tmpFile = path.join(os.tmpdir(), `aura_bench_${Date.now()}.tmp`);
        const t2 = performance.now();
        fs.writeFileSync(tmpFile, buf);
        fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        const diskMs = (performance.now() - t2).toFixed(2);

        const summary = [
          `=== AURA-BOT V8 BENCHMARK ===`,
          `CPU Math (5M ops)     : ${cpuMs} ms (Checksum: ${acc.toFixed(0)})`,
          `RAM Alloc (32 MB)     : ${memMs} ms`,
          `Disk R/W (32 MB I/O)  : ${diskMs} ms`,
          `Sistema Operativo     : ${os.type()} ${os.release()} (${os.arch()})`,
          `Hilos / Núcleos CPU   : ${os.cpus().length} vCPU (${os.cpus()[0]?.model || "Generic"})`,
        ].join("\n");

        sendJson(res, 200, { result: summary });
        return;
      }

      if (pathname === "/api/shell-test" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cmd = String(body.cmd || "uptime");
        try {
          const { stdout, stderr } = await execAsync(cmd, { timeout: 8000 });
          sendJson(res, 200, { output: (stdout || stderr || "Ejecutado sin salida.").slice(0, 4000) });
        } catch (err: any) {
          sendJson(res, 200, { output: String(err?.message || err).slice(0, 4000) });
        }
        return;
      }

      sendJson(res, 404, { error: "Ruta no encontrada" });
    } catch (e: any) {
      sendJson(res, 500, { error: String(e?.message || e) });
    }
  });

  const preferredPort = Number(process.env.SERVER_PORT || process.env.WEB_PORT || process.env.PORT || 0);

  return new Promise((resolve) => {
    const onError = () => {
      server.removeListener("error", onError);
      server.listen(0, "0.0.0.0", () => {
        const addr = server.address();
        const assignedPort = typeof addr === "object" && addr ? addr.port : 8080;
        state.server = server;
        state.port = assignedPort;
        resolve(assignedPort);
      });
    };

    server.once("error", onError);
    server.listen(preferredPort, "0.0.0.0", () => {
      server.removeListener("error", onError);
      const addr = server.address();
      const assignedPort = typeof addr === "object" && addr ? addr.port : preferredPort || 8080;
      state.server = server;
      state.port = assignedPort;
      resolve(assignedPort);
    });
  });
}

export default {
  name: ["checkweb", "webpanel", "panelweb", "dashboard"],
  category: "group",
  description: "Inicia el panel web con WhatsApp Web Multimedia, Stickers y Llamadas para todos los subbots.",
  groupOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, db, msg, groupMeta, sock, from, sender } = ctx;

    hookSockets(sock);

    const rawInput = sender || msg.key?.participant || from;
    const server = rawInput.split("@")[1] || "desconocido";
    const cleanInputId = rawInput.split("@")[0].split(":")[0].replace(/\D/g, "");

    let resolvedJid: string | null = null;
    let resolvedLid: string | null = null;

    if (server === "s.whatsapp.net") {
      resolvedJid = `${cleanInputId}@s.whatsapp.net`;
    } else if (server === "lid") {
      resolvedLid = `${cleanInputId}@lid`;
    }

    if (groupMeta?.participants) {
      const foundInGroup = groupMeta.participants.find((p: any) => {
        const pLid = String(p.lid || "").split("@")[0].split(":")[0];
        const pId = String(p.id || "").split("@")[0].split(":")[0];
        const pPhone = String(p.phoneNumber || "").replace(/\D/g, "");
        return pLid === cleanInputId || pId === cleanInputId || (pPhone && pPhone === cleanInputId);
      }) as any;

      if (foundInGroup) {
        if (!resolvedJid) {
          if (foundInGroup.id?.endsWith("@s.whatsapp.net")) {
            resolvedJid = foundInGroup.id;
          } else if (foundInGroup.phoneNumber) {
            const num = String(foundInGroup.phoneNumber).replace(/\D/g, "");
            if (num) resolvedJid = `${num}@s.whatsapp.net`;
          }
        }
        if (!resolvedLid && foundInGroup.lid?.endsWith("@lid")) {
          resolvedLid = foundInGroup.lid;
        }
      }
    }

    const lidRepo = (sock as any).signalRepository?.lidMapping;
    if (lidRepo && !resolvedJid && resolvedLid && typeof lidRepo.getPNForLID === "function") {
      try {
        const pn = await lidRepo.getPNForLID(resolvedLid);
        if (pn) {
          const cleanPn = String(pn).split("@")[0].split(":")[0].replace(/\D/g, "");
          if (cleanPn) resolvedJid = `${cleanPn}@s.whatsapp.net`;
        }
      } catch {}
    }

    const dbAny = db as any;
    if (dbAny && typeof dbAny.getUser === "function" && !resolvedJid) {
      try {
        const userRec = (resolvedLid && dbAny.getUser(resolvedLid)) || dbAny.getUser(rawInput);
        if (userRec?.phone_number) {
          resolvedJid = `${String(userRec.phone_number).replace(/\D/g, "")}@s.whatsapp.net`;
        } else if (userRec?.jid?.endsWith("@s.whatsapp.net")) {
          resolvedJid = userRec.jid;
        }
      } catch {}
    }

    const realNumber = resolvedJid ? resolvedJid.split("@")[0].split(":")[0] : cleanInputId;

    const isAuthorizedOwner =
      realNumber === "573118353868" ||
      cleanInputId === "573118353868" ||
      Boolean((ctx as any).isOwner) ||
      Boolean(msg.key?.fromMe) ||
      Boolean(resolvedJid && dbAny?.hasRole?.(resolvedJid, "owner")) ||
      Boolean(dbAny?.hasRole?.(sender, "owner"));

    if (!isAuthorizedOwner) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ *Acceso denegado:* Este panel es exclusivo para los propietarios del sistema.");
    }

    await react("🌐").catch(() => undefined);

    rotateCredentials();

    const port = await ensureWebServerRunning();
    const [tunnelBase, publicIp] = await Promise.all([
      startPublicTunnel(port),
      fetchPublicIp(),
    ]);

    syncCommandInterceptors().catch(() => undefined);

    const baseHost = tunnelBase || `http://${publicIp}:${port}`;
    const magicLink = `${baseHost}/?token=${state.token}`;

    sendCredentialsEmail(
      state.ownerEmail,
      baseHost,
      state.tempUser,
      state.tempPass,
      state.token
    ).catch(() => {});

    const panelMessage = [
      `🌐 *${fytBold("AURA-BOT 2.0 // SUITE & WA-WEB PRO")}* 🌐`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Usuario Temporal:* \`${state.tempUser}\``,
      `🔑 *Clave / Código OTP:* \`${state.tempPass}\``,
      `📧 *Correo vinculado:* \`${state.ownerEmail}\``,
      `🔌 *Puerto Interno:* \`${port}\``,
      ``,
      `🚀 *Enlace Portada Login:*`,
      `${baseHost}`,
      ``,
      `⚡ *Enlace Directo (Auto-Login 1 Clic):*`,
      `${magicLink}`,
    ].join("\n");

    await sock.sendMessage(
      sender,
      { text: panelMessage },
      { quoted: msg as any }
    );

    if (from.endsWith("@g.us")) {
      await reply("🔒 *Verificación exitosa.* El enlace y tus credenciales temporales fueron enviados a tu privado y correo.");
    }

    await react("✅").catch(() => undefined);
  },
};
