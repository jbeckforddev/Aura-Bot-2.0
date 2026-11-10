import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import { getActivePremBots } from "../../connection/premBotManager.ts";
import { GROUP_METADATA_CACHE } from "../../handler.ts";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";

interface IdentityProfile {
  phone: string;
  lid: string;
  name: string;
}

interface ChatMessageItem {
  id: string;
  senderJid: string;
  senderPhone: string;
  senderLid: string;
  pushName: string;
  text: string;
  time: string;
  timestamp: number;
  fromMe: boolean;
  isViewOnce?: boolean;
  mediaType?: "image" | "sticker" | "video" | "audio" | "document" | null;
  mediaMime?: string;
  hasMedia?: boolean;
  quotedId?: string;
  quotedSender?: string;
  quotedText?: string;
  reactions?: Record<string, string>;
  rawKey?: any;
  rawMessage?: any;
  mediaNode?: any;
}

interface GroupMemberItem {
  jid: string;
  phone: string;
  lid: string;
  name: string;
  isAdmin: boolean;
}

interface ChatSessionItem {
  jid: string;
  name: string;
  isGroup: boolean;
  peerPhone: string;
  peerLid: string;
  unread: number;
  lastTime: number;
  lastPreview: string;
  avatarUrl?: string | null;
  statusText?: string;
  members?: GroupMemberItem[];
  messages: ChatMessageItem[];
}

interface ContactEntry {
  jid: string;
  phone: string;
  lid: string;
  name: string;
  isGroup: boolean;
}

interface MediaBufferItem {
  mime: string;
  buffer: Buffer;
  createdAt: number;
}

interface WaWebSuiteState {
  server: http.Server | null;
  port: number;
  token: string;
  tempUser: string;
  tempPass: string;
  tunnelUrl: string | null;
  publicIp: string | null;
  tunnelProcess: ChildProcess | null;
  tunnelWatchdogTimer: NodeJS.Timeout | null;
  presenceLoops: Map<string, NodeJS.Timeout>;
  hookedSockets: WeakSet<object>;
  knownSockets: Set<any>;
  originalSenders: WeakMap<object, (...args: any[]) => Promise<any>>;
  botChatStores: Map<string, Map<string, ChatSessionItem>>;
  botContacts: Map<string, Map<string, ContactEntry>>;
  botGroupSynced: Set<string>;
  botGroupSyncing: Set<string>;
  identityByPhone: Map<string, IdentityProfile>;
  identityByLid: Map<string, IdentityProfile>;
  mediaStore: Map<string, MediaBufferItem>;
  thumbStore: Map<string, Buffer>;
  mediaDownloading: Map<string, Promise<MediaBufferItem | null>>;
  msgLookup: Map<string, { botKey: string; msg: ChatMessageItem }>;
  avatarCache: Map<string, string>;
  avatarQueue: Array<{ botKey: string; jid: string }>;
  avatarWorkerBusy: boolean;
  sseClients: Set<http.ServerResponse>;
  ownerJid: string;
  lastSock: any;
}

const gState = globalThis as unknown as { __auraWaWebSuite?: WaWebSuiteState };

if (!gState.__auraWaWebSuite) {
  gState.__auraWaWebSuite = {
    server: null,
    port: 0,
    token: randomBytes(12).toString("hex"),
    tempUser: `lufer_${randomBytes(2).toString("hex")}`,
    tempPass: String(Math.floor(100000 + Math.random() * 900000)),
    tunnelUrl: null,
    publicIp: null,
    tunnelProcess: null,
    tunnelWatchdogTimer: null,
    presenceLoops: new Map(),
    hookedSockets: new WeakSet(),
    knownSockets: new Set(),
    originalSenders: new WeakMap(),
    botChatStores: new Map(),
    botContacts: new Map(),
    botGroupSynced: new Set(),
    botGroupSyncing: new Set(),
    identityByPhone: new Map(),
    identityByLid: new Map(),
    mediaStore: new Map(),
    thumbStore: new Map(),
    mediaDownloading: new Map(),
    msgLookup: new Map(),
    avatarCache: new Map(),
    avatarQueue: [],
    avatarWorkerBusy: false,
    sseClients: new Set(),
    ownerJid: "573118353868@s.whatsapp.net",
    lastSock: null,
  };
}

const state = gState.__auraWaWebSuite!;

let cachedBaileysMod: any = null;
async function getBaileysModule(): Promise<any> {
  if (cachedBaileysMod) return cachedBaileysMod;
  try {
    cachedBaileysMod = await import("baileys");
    return cachedBaileysMod;
  } catch {}
  return null;
}

function cleanDigits(val: unknown): string {
  return String(val || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function normalizeLid(val: unknown): string {
  const raw = String(val || "").trim().toLowerCase();
  if (!raw || !raw.endsWith("@lid")) return "";
  const d = cleanDigits(raw);
  return d ? `${d}@lid` : "";
}

function normalizePhoneDigits(val: unknown): string {
  const raw = String(val || "").trim().toLowerCase();
  if (!raw || raw.endsWith("@lid") || raw.endsWith("@g.us") || raw.includes("broadcast")) return "";
  const d = cleanDigits(raw);
  return d.length >= 7 && d.length <= 15 ? d : "";
}

function getBotInfo(botSock: any, fallbackIndex = 0): { key: string; jid: string; lid: string; name: string } {
  const rawId = botSock?.user?.id || botSock?.authState?.creds?.me?.id || "";
  const rawLid = botSock?.user?.lid || botSock?.authState?.creds?.me?.lid || "";
  const key = cleanDigits(rawId) || `bot_${fallbackIndex}`;
  const jid = key.startsWith("bot_") ? "" : `${key}@s.whatsapp.net`;
  const lid = normalizeLid(rawLid);
  const name = String(botSock?.user?.name || botSock?.authState?.creds?.me?.name || (fallbackIndex === 0 ? "MainBot" : `SubBot-${fallbackIndex}`)).trim();
  return { key, jid, lid, name };
}

function isSameAsBot(botSock: any, candidatePhone: string, candidateLid: string, candidateName?: string): boolean {
  const info = getBotInfo(botSock);
  if (candidatePhone && info.key && candidatePhone === info.key) return true;
  if (candidateLid && info.lid && candidateLid === info.lid) return true;
  if (candidateName && info.name && candidateName.toLowerCase() === info.name.toLowerCase()) return true;
  return false;
}

function registerIdentity(phoneInput?: unknown, lidInput?: unknown, nameInput?: unknown, botSock?: any): IdentityProfile {
  const phone = normalizePhoneDigits(phoneInput);
  const lid = normalizeLid(lidInput);
  const rawName = String(nameInput || "").trim();
  const validName = rawName && !rawName.startsWith("+") && !rawName.startsWith("Grupo ") && (!botSock || !isSameAsBot(botSock, "", "", rawName)) ? rawName : "";

  let profile: IdentityProfile | undefined =
    (phone ? state.identityByPhone.get(phone) : undefined) ||
    (lid ? state.identityByLid.get(lid) : undefined);

  if (!profile) {
    profile = {
      phone: phone || "",
      lid: lid || "",
      name: validName || "",
    };
  } else {
    if (phone && !profile.phone) profile.phone = phone;
    if (lid && !profile.lid) profile.lid = lid;
    if (validName && (!profile.name || profile.name.length < 2)) profile.name = validName;
  }

  if (profile.phone) state.identityByPhone.set(profile.phone, profile);
  if (profile.lid) state.identityByLid.set(profile.lid, profile);

  if (botSock && (profile.phone || profile.lid)) {
    const botKey = getBotInfo(botSock).key;
    if (botKey && !isSameAsBot(botSock, profile.phone, profile.lid)) {
      const cMap = ensureBotContactsMap(botKey);
      const cKey = profile.phone ? `${profile.phone}@s.whatsapp.net` : profile.lid;
      if (cKey) {
        const existing = cMap.get(cKey);
        cMap.set(cKey, {
          jid: cKey,
          phone: profile.phone || existing?.phone || "",
          lid: profile.lid || existing?.lid || "",
          name: profile.name || existing?.name || (profile.phone ? `+${profile.phone}` : profile.lid),
          isGroup: false,
        });
      }
    }
  }

  return profile;
}

async function resolvePeerIdentity(
  botSock: any,
  rawJid: string,
  altJid?: string,
  pushNameHint?: string,
  fromMe?: boolean
): Promise<IdentityProfile> {
  if (!rawJid || rawJid.endsWith("@g.us")) {
    return { phone: "", lid: "", name: "" };
  }

  const p1 = normalizePhoneDigits(rawJid);
  const p2 = normalizePhoneDigits(altJid);
  const l1 = normalizeLid(rawJid);
  const l2 = normalizeLid(altJid);

  let phone = p1 || p2;
  let lid = l1 || l2;
  const safeName = !fromMe ? String(pushNameHint || "").trim() : "";

  const memHit =
    (phone ? state.identityByPhone.get(phone) : undefined) ||
    (lid ? state.identityByLid.get(lid) : undefined);

  if (memHit) {
    if (!phone && memHit.phone) phone = memHit.phone;
    if (!lid && memHit.lid) lid = memHit.lid;
  }

  const lidRepo = botSock?.signalRepository?.lidMapping;
  if (lid && !phone && typeof lidRepo?.getPNForLID === "function") {
    try {
      const mappedPn = await lidRepo.getPNForLID(lid);
      if (mappedPn) phone = normalizePhoneDigits(mappedPn);
    } catch {}
  }
  if (phone && !lid && typeof lidRepo?.getLIDForPN === "function") {
    try {
      const mappedLid = await lidRepo.getLIDForPN(`${phone}@s.whatsapp.net`);
      if (mappedLid) lid = normalizeLid(mappedLid);
    } catch {}
  }

  const activeDb = (globalThis as any).db;
  if (activeDb && typeof activeDb.getUser === "function" && (!phone || !lid || !safeName)) {
    try {
      const uRec =
        (phone && activeDb.getUser(`${phone}@s.whatsapp.net`)) ||
        (lid && activeDb.getUser(lid)) ||
        activeDb.getUser(rawJid);
      if (uRec) {
        if (!phone && (uRec.phone_number || uRec.jid)) {
          phone = normalizePhoneDigits(uRec.phone_number || uRec.jid);
        }
        if (!lid && uRec.lid) {
          lid = normalizeLid(uRec.lid);
        }
        if (!safeName && (uRec.pushName || uRec.username || uRec.name)) {
          return registerIdentity(phone, lid, uRec.pushName || uRec.username || uRec.name, botSock);
        }
      }
    } catch {}
  }

  return registerIdentity(phone, lid, safeName, botSock);
}

function broadcastSse(event: string, data: any) {
  if (state.sseClients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of Array.from(state.sseClients)) {
    try {
      res.write(payload);
    } catch {
      state.sseClients.delete(res);
    }
  }
}

function saveMediaToStore(id: string, mime: string, buffer: Buffer) {
  if (!id || !buffer || !buffer.length) return;
  state.mediaStore.set(id, { mime, buffer, createdAt: Date.now() });
  if (state.mediaStore.size > 150) {
    const oldestKey = state.mediaStore.keys().next().value;
    if (oldestKey) state.mediaStore.delete(oldestKey);
  }
}

function saveThumbToStore(id: string, buffer: Buffer) {
  if (!id || !buffer || !buffer.length) return;
  state.thumbStore.set(id, buffer);
  if (state.thumbStore.size > 300) {
    const oldestKey = state.thumbStore.keys().next().value;
    if (oldestKey) state.thumbStore.delete(oldestKey);
  }
}

function rotateCredentials() {
  state.token = randomBytes(12).toString("hex");
  state.tempUser = `lufer_${randomBytes(2).toString("hex")}`;
  state.tempPass = String(Math.floor(100000 + Math.random() * 900000));
}

function ensureBotChatMap(botKey: string): Map<string, ChatSessionItem> {
  if (!state.botChatStores.has(botKey)) {
    state.botChatStores.set(botKey, new Map());
  }
  return state.botChatStores.get(botKey)!;
}

function ensureBotContactsMap(botKey: string): Map<string, ContactEntry> {
  if (!state.botContacts.has(botKey)) {
    state.botContacts.set(botKey, new Map());
  }
  return state.botContacts.get(botKey)!;
}

function unwrapMessage(msgObj: any): { unwrapped: any; isViewOnce: boolean } {
  if (!msgObj) return { unwrapped: null, isViewOnce: false };
  if (msgObj.viewOnceMessage?.message) {
    return { unwrapped: msgObj.viewOnceMessage.message, isViewOnce: true };
  }
  if (msgObj.viewOnceMessageV2?.message) {
    return { unwrapped: msgObj.viewOnceMessageV2.message, isViewOnce: true };
  }
  if (msgObj.viewOnceMessageV2Extension?.message) {
    return { unwrapped: msgObj.viewOnceMessageV2Extension.message, isViewOnce: true };
  }
  if (msgObj.ephemeralMessage?.message) {
    return unwrapMessage(msgObj.ephemeralMessage.message);
  }
  if (msgObj.documentWithCaptionMessage?.message) {
    return unwrapMessage(msgObj.documentWithCaptionMessage.message);
  }
  return { unwrapped: msgObj, isViewOnce: false };
}

function extractMessageDetails(msgObj: any): {
  text: string;
  isViewOnce: boolean;
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
    isViewOnce: false,
    mediaType: null as any,
    mediaMime: "",
    mediaNode: null,
    thumbBuffer: null as Buffer | null,
    quotedId: "",
    quotedSender: "",
    quotedText: "",
  };
  const { unwrapped: m, isViewOnce } = unwrapMessage(msgObj);
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
    const qPart = String(ctxInfo.participant || "");
    const qDigits = cleanDigits(qPart);
    const qProf = state.identityByPhone.get(qDigits) || state.identityByLid.get(normalizeLid(qPart));
    quotedSender = qProf?.phone ? `+${qProf.phone}` : qDigits ? `+${qDigits}` : "Cita";
    const { unwrapped: qUnwrapped } = unwrapMessage(ctxInfo.quotedMessage);
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

  const voFlag = Boolean(
    isViewOnce ||
      m.imageMessage?.viewOnce ||
      m.videoMessage?.viewOnce ||
      m.audioMessage?.viewOnce
  );

  if (typeof m.conversation === "string" && m.conversation) {
    return { ...empty, text: m.conversation, isViewOnce: voFlag, quotedId, quotedSender, quotedText };
  }
  if (typeof m.extendedTextMessage?.text === "string" && m.extendedTextMessage.text) {
    return { ...empty, text: m.extendedTextMessage.text, isViewOnce: voFlag, quotedId, quotedSender, quotedText };
  }
  if (m.imageMessage) {
    const thumb = m.imageMessage.jpegThumbnail ? Buffer.from(m.imageMessage.jpegThumbnail) : null;
    return {
      text: m.imageMessage.caption || "",
      isViewOnce: voFlag,
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
      isViewOnce: false,
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
      isViewOnce: voFlag,
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
      isViewOnce: voFlag,
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
      isViewOnce: voFlag,
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
  if (m.locationMessage || m.liveLocationMessage) {
    const loc = m.locationMessage || m.liveLocationMessage;
    return { ...empty, text: `📍 Ubicación: ${loc.name || ""} (${loc.degreesLatitude}, ${loc.degreesLongitude})` };
  }
  if (m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3) {
    const poll = m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3;
    return { ...empty, text: `📊 Encuesta: ${poll.name || ""}` };
  }
  if (m.interactiveMessage || m.buttonsMessage || m.templateMessage || m.botForwardedMessage) {
    return { ...empty, text: "🎛️ [Tarjeta Interactiva / Embed]" };
  }
  return empty;
}

async function downloadMediaBuffer(
  botSock: any,
  fullMsg: any,
  msgId: string,
  mediaType: "image" | "sticker" | "video" | "audio" | "document",
  mediaMime: string,
  mediaNode: any
): Promise<MediaBufferItem | null> {
  if (state.mediaStore.has(msgId)) return state.mediaStore.get(msgId)!;
  if (state.mediaDownloading.has(msgId)) return state.mediaDownloading.get(msgId)!;

  const task = (async (): Promise<MediaBufferItem | null> => {
    try {
      const bMod = await getBaileysModule();
      if (bMod && typeof bMod.downloadContentFromMessage === "function" && mediaNode) {
        const dlType = mediaType === "sticker" ? "sticker" : mediaType;
        const stream = await bMod.downloadContentFromMessage(mediaNode, dlType);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buf = Buffer.concat(chunks);
        if (buf.length > 0) {
          saveMediaToStore(msgId, mediaMime, buf);
          return state.mediaStore.get(msgId) || null;
        }
      }
      if (bMod && typeof bMod.downloadMediaMessage === "function" && fullMsg) {
        const buf = await bMod.downloadMediaMessage(
          fullMsg,
          "buffer",
          {},
          { logger: undefined, reuploadRequest: botSock?.updateMediaMessage }
        );
        if (Buffer.isBuffer(buf) && buf.length > 0) {
          saveMediaToStore(msgId, mediaMime, buf);
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

function findConsolidatedSession(
  store: Map<string, ChatSessionItem>,
  remoteJid: string,
  peerPhone: string,
  peerLid: string
): { canonicalJid: string; session: ChatSessionItem | undefined } {
  if (remoteJid.endsWith("@g.us")) {
    return { canonicalJid: remoteJid, session: store.get(remoteJid) };
  }
  if (store.has(remoteJid)) {
    return { canonicalJid: remoteJid, session: store.get(remoteJid) };
  }
  if (peerPhone) {
    const pnJid = `${peerPhone}@s.whatsapp.net`;
    if (store.has(pnJid)) return { canonicalJid: pnJid, session: store.get(pnJid) };
  }
  if (peerLid && store.has(peerLid)) {
    return { canonicalJid: peerLid, session: store.get(peerLid) };
  }
  for (const [k, s] of store.entries()) {
    if (s.isGroup) continue;
    if ((peerPhone && s.peerPhone === peerPhone) || (peerLid && s.peerLid === peerLid)) {
      return { canonicalJid: k, session: s };
    }
  }
  const preferredJid = peerPhone ? `${peerPhone}@s.whatsapp.net` : remoteJid;
  return { canonicalJid: preferredJid, session: undefined };
}

function recordChatMessage(
  botSock: any,
  botKey: string,
  remoteJid: string,
  msgData: {
    id: string;
    senderJid: string;
    senderPhone: string;
    senderLid: string;
    pushName: string;
    text: string;
    fromMe: boolean;
    isViewOnce?: boolean;
    chatName?: string;
    peerPhone?: string;
    peerLid?: string;
    timestamp?: number;
    mediaType?: "image" | "sticker" | "video" | "audio" | "document" | null;
    mediaMime?: string;
    hasMedia?: boolean;
    quotedId?: string;
    quotedSender?: string;
    quotedText?: string;
    rawKey?: any;
    rawMessage?: any;
    mediaNode?: any;
  }
) {
  if (!remoteJid || remoteJid === "status@broadcast" || remoteJid.includes("newsletter")) return;
  if (!msgData.text && !msgData.mediaType) return;

  const store = ensureBotChatMap(botKey);
  const isGroup = remoteJid.endsWith("@g.us");
  const cleanRemote = cleanDigits(remoteJid);
  const nowTs = msgData.timestamp || Date.now();
  const timeStr = new Date(nowTs).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const peerPhone = !isGroup
    ? msgData.peerPhone || (!msgData.fromMe ? msgData.senderPhone : "") || normalizePhoneDigits(remoteJid)
    : "";
  const peerLid = !isGroup
    ? msgData.peerLid || (!msgData.fromMe ? msgData.senderLid : "") || normalizeLid(remoteJid)
    : "";

  const { canonicalJid, session: foundSession } = findConsolidatedSession(store, remoteJid, peerPhone, peerLid);
  let session = foundSession;

  const previewLabel =
    (msgData.isViewOnce ? "👁️ " : "") +
    (msgData.mediaType === "sticker"
      ? "🏷️ Sticker"
      : msgData.mediaType === "image"
      ? `📷 ${msgData.text || "Foto"}`
      : msgData.mediaType === "video"
      ? `🎥 ${msgData.text || "Video"}`
      : msgData.mediaType === "audio"
      ? "🎤 Audio"
      : msgData.text);

  const peerIdentity = !isGroup
    ? (peerPhone ? state.identityByPhone.get(peerPhone) : undefined) ||
      (peerLid ? state.identityByLid.get(peerLid) : undefined)
    : undefined;

  const resolvedPeerName = !isGroup
    ? peerIdentity?.name ||
      (!msgData.fromMe && msgData.pushName && !isSameAsBot(botSock, "", "", msgData.pushName) ? msgData.pushName : "") ||
      (peerPhone ? `+${peerPhone}` : peerLid ? `LID ${cleanDigits(peerLid)}` : `+${cleanRemote}`)
    : msgData.chatName || `Grupo ${cleanRemote}`;

  if (!session) {
    session = {
      jid: canonicalJid,
      name: resolvedPeerName,
      isGroup,
      peerPhone: peerPhone || "",
      peerLid: peerLid || "",
      unread: 0,
      lastTime: nowTs,
      lastPreview: previewLabel.slice(0, 75),
      messages: [],
    };
    store.set(canonicalJid, session);
  } else {
    if (peerPhone && !session.peerPhone) session.peerPhone = peerPhone;
    if (peerLid && !session.peerLid) session.peerLid = peerLid;
    if (isGroup && msgData.chatName && session.name.startsWith("Grupo ")) {
      session.name = msgData.chatName;
    } else if (!isGroup) {
      const currentNameIsBot = isSameAsBot(botSock, "", "", session.name);
      const currentNameIsGeneric = session.name.startsWith("+") || session.name.startsWith("LID ");
      if (currentNameIsBot || (currentNameIsGeneric && resolvedPeerName && !resolvedPeerName.startsWith("+"))) {
        session.name = resolvedPeerName;
      }
    }
  }

  const existingMsg = session.messages.find((x) => x.id === msgData.id);
  if (existingMsg) {
    if (msgData.hasMedia) existingMsg.hasMedia = true;
    return;
  }

  session.lastTime = nowTs;
  session.lastPreview = previewLabel.slice(0, 75);
  if (!msgData.fromMe) {
    session.unread = Math.min(999, session.unread + 1);
  }

  const item: ChatMessageItem = {
    id: msgData.id,
    senderJid: msgData.senderJid,
    senderPhone: msgData.senderPhone,
    senderLid: msgData.senderLid,
    pushName: msgData.pushName,
    text: msgData.text,
    time: timeStr,
    timestamp: nowTs,
    fromMe: msgData.fromMe,
    isViewOnce: Boolean(msgData.isViewOnce),
    mediaType: msgData.mediaType || null,
    mediaMime: msgData.mediaMime || "",
    hasMedia: Boolean(msgData.hasMedia || msgData.mediaType),
    quotedId: msgData.quotedId || "",
    quotedSender: msgData.quotedSender || "",
    quotedText: msgData.quotedText || "",
    reactions: {},
    rawKey: msgData.rawKey,
    rawMessage: msgData.rawMessage,
    mediaNode: msgData.mediaNode,
  };

  session.messages.push(item);
  state.msgLookup.set(item.id, { botKey, msg: item });
  if (state.msgLookup.size > 1000) {
    const firstKey = state.msgLookup.keys().next().value;
    if (firstKey) state.msgLookup.delete(firstKey);
  }

  if (session.messages.length > 180) {
    session.messages.splice(0, session.messages.length - 180);
  }

  broadcastSse("chat_update", {
    botKey,
    jid: session.jid,
    name: session.name,
    peerPhone: session.peerPhone,
    peerLid: session.peerLid,
    unread: session.unread,
    lastTime: session.lastTime,
    lastPreview: session.lastPreview,
    msgId: item.id,
  });
}

function getAllBotSockets(mainSock?: any): any[] {
  if (mainSock) {
    state.lastSock = mainSock;
    state.knownSockets.add(mainSock);
  }

  const gAny = globalThis as any;
  const rawList: any[] = [
    mainSock,
    state.lastSock,
    gAny.mainSocket,
    gAny.mainSock,
    gAny.sock,
    ...Array.from(state.knownSockets),
  ];

  try {
    if (typeof getActiveSubBots === "function") {
      rawList.push(...(getActiveSubBots() || []));
    }
  } catch {}

  try {
    if (typeof getActivePremBots === "function") {
      rawList.push(...(getActivePremBots() || []));
    }
  } catch {}

  const unique: any[] = [];
  const seenKeys = new Set<string>();

  for (const item of rawList) {
    const realSock = item?.sock ?? item;
    if (!realSock || typeof realSock.sendMessage !== "function" || (realSock as any).isClosed) {
      continue;
    }
    state.knownSockets.add(realSock);
    const info = getBotInfo(realSock, unique.length);
    if (seenKeys.has(info.key)) continue;
    seenKeys.add(info.key);
    unique.push(realSock);
  }

  return unique;
}

function ingestGroupMetadata(botSock: any, botKey: string, jid: string, meta: any) {
  if (!jid || !jid.endsWith("@g.us") || !meta) return;
  const store = ensureBotChatMap(botKey);
  const participants: any[] = Array.isArray(meta.participants) ? meta.participants : [];
  const members: GroupMemberItem[] = [];

  for (const p of participants) {
    const pId = String(p?.id || "");
    const pLid = normalizeLid(p?.lid || (pId.endsWith("@lid") ? pId : ""));
    const pPhone = normalizePhoneDigits(p?.phoneNumber || (pId.endsWith("@s.whatsapp.net") ? pId : ""));
    const pName = String(p?.name || p?.notify || p?.verifiedName || "").trim();
    const prof = registerIdentity(pPhone, pLid, pName, botSock);
    members.push({
      jid: pPhone ? `${pPhone}@s.whatsapp.net` : pLid || pId,
      phone: prof.phone || pPhone,
      lid: prof.lid || pLid,
      name: prof.name || (pPhone ? `+${pPhone}` : pLid || "Miembro"),
      isAdmin: p?.admin === "admin" || p?.admin === "superadmin",
    });
  }

  const existing = store.get(jid);
  if (!existing) {
    store.set(jid, {
      jid,
      name: meta.subject || `Grupo ${cleanDigits(jid)}`,
      isGroup: true,
      peerPhone: "",
      peerLid: "",
      unread: 0,
      lastTime: meta.creation ? Number(meta.creation) * 1000 : Date.now() - 86400000,
      lastPreview: `👥 ${participants.length} miembros`,
      statusText: meta.desc ? String(meta.desc).slice(0, 140) : "",
      members,
      messages: [],
    });
  } else {
    if (meta.subject) existing.name = meta.subject;
    if (meta.desc) existing.statusText = String(meta.desc).slice(0, 140);
    if (members.length) existing.members = members;
  }
}

function hydrateFastMemoryForBot(botSock: any, idx: number) {
  const info = getBotInfo(botSock, idx);
  const botKey = info.key;
  const store = ensureBotChatMap(botKey);
  const contactsMap = ensureBotContactsMap(botKey);

  if (GROUP_METADATA_CACHE && typeof GROUP_METADATA_CACHE.entries === "function") {
    for (const [gid, meta] of GROUP_METADATA_CACHE.entries()) {
      if (gid.endsWith("@g.us") && meta?.participants) {
        const hasBot = meta.participants.some((p: any) => {
          const pPhone = cleanDigits(p?.phoneNumber || p?.id);
          const pLid = normalizeLid(p?.lid || p?.id);
          return (info.key && pPhone === info.key) || (info.lid && pLid === info.lid);
        });
        if (hasBot) {
          ingestGroupMetadata(botSock, botKey, gid, meta);
        }
      }
    }
  }

  if (botSock?.contacts && typeof botSock.contacts === "object") {
    try {
      const entries = botSock.contacts instanceof Map ? Array.from(botSock.contacts.entries()) : Object.entries(botSock.contacts);
      for (const [cJid, cObj] of entries as Array<[string, any]>) {
        if (!cJid || cJid.endsWith("@g.us") || cJid === "status@broadcast") continue;
        const cPhone = normalizePhoneDigits(cObj?.phoneNumber || cObj?.id || cJid);
        const cLid = normalizeLid(cObj?.lid || cJid);
        const cName = String(cObj?.name || cObj?.notify || cObj?.verifiedName || "").trim();
        registerIdentity(cPhone, cLid, cName, botSock);
      }
    } catch {}
  }

  const activeDb = (globalThis as any).db;
  if (activeDb && typeof activeDb.getAllUsers === "function") {
    try {
      const users = activeDb.getAllUsers() || [];
      for (const u of users.slice(0, 400)) {
        const uPhone = normalizePhoneDigits(u?.phone_number || u?.jid);
        const uLid = normalizeLid(u?.lid);
        const uName = String(u?.pushName || u?.username || "").trim();
        if (uPhone || uLid) {
          registerIdentity(uPhone, uLid, uName, botSock);
        }
      }
    } catch {}
  }

  if (botSock?.chats && typeof botSock.chats === "object") {
    try {
      const entries = botSock.chats instanceof Map ? Array.from(botSock.chats.entries()) : Object.entries(botSock.chats);
      for (const [jid, cObj] of entries as Array<[string, any]>) {
        if (!jid || jid === "status@broadcast" || jid.includes("newsletter") || store.has(jid)) continue;
        const isG = jid.endsWith("@g.us");
        const pPhone = !isG ? normalizePhoneDigits(cObj?.phoneNumber || jid) : "";
        const pLid = !isG ? normalizeLid(cObj?.lid || jid) : "";
        const cName = String(cObj?.name || cObj?.subject || cObj?.notify || "").trim();
        const prof = !isG ? registerIdentity(pPhone, pLid, cName, botSock) : null;

        store.set(jid, {
          jid,
          name: isG
            ? cName || `Grupo ${cleanDigits(jid)}`
            : prof?.name || (pPhone ? `+${pPhone}` : pLid ? `LID ${cleanDigits(pLid)}` : `+${cleanDigits(jid)}`),
          isGroup: isG,
          peerPhone: prof?.phone || pPhone,
          peerLid: prof?.lid || pLid,
          unread: Number(cObj?.unreadCount || 0),
          lastTime: Number(cObj?.conversationTimestamp ? Number(cObj.conversationTimestamp) * 1000 : Date.now() - 180000),
          lastPreview: isG ? "👥 Grupo activo" : "💬 Conversación directa",
          messages: [],
        });
      }
    } catch {}
  }

  for (const s of store.values()) {
    if (!s.isGroup && (s.peerPhone || s.peerLid)) {
      const key = s.peerPhone ? `${s.peerPhone}@s.whatsapp.net` : s.peerLid;
      if (key && !contactsMap.has(key)) {
        contactsMap.set(key, {
          jid: key,
          phone: s.peerPhone,
          lid: s.peerLid,
          name: s.name,
          isGroup: false,
        });
      }
    }
  }
}

function triggerBackgroundGroupSync(botSock: any, idx: number, force = false) {
  hydrateFastMemoryForBot(botSock, idx);
  const botKey = getBotInfo(botSock, idx).key;
  if (!force && state.botGroupSynced.has(botKey)) return;
  if (state.botGroupSyncing.has(botKey)) return;

  state.botGroupSyncing.add(botKey);

  if (typeof botSock?.groupFetchAllParticipating === "function") {
    Promise.race([
      botSock.groupFetchAllParticipating(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5500)),
    ])
      .then((groups: any) => {
        for (const [jid, meta] of Object.entries(groups || {}) as Array<[string, any]>) {
          ingestGroupMetadata(botSock, botKey, jid, meta);
        }
        state.botGroupSynced.add(botKey);
        broadcastSse("sync_done", { botKey });
      })
      .catch(() => {})
      .finally(() => {
        state.botGroupSyncing.delete(botKey);
      });
  } else {
    state.botGroupSynced.add(botKey);
    state.botGroupSyncing.delete(botKey);
  }
}

function enqueueAvatarLookup(botKey: string, jid: string) {
  const cacheKey = `${botKey}:${jid}`;
  if (state.avatarCache.has(cacheKey)) return;
  if (state.avatarQueue.some((q) => q.botKey === botKey && q.jid === jid)) return;
  if (state.avatarQueue.length > 60) return;
  state.avatarQueue.push({ botKey, jid });
  processAvatarQueue();
}

async function processAvatarQueue() {
  if (state.avatarWorkerBusy) return;
  state.avatarWorkerBusy = true;
  try {
    while (state.avatarQueue.length > 0) {
      const item = state.avatarQueue.shift()!;
      const cacheKey = `${item.botKey}:${item.jid}`;
      if (state.avatarCache.has(cacheKey)) continue;

      const allBots = getAllBotSockets();
      const targetBot = allBots.find((b, i) => getBotInfo(b, i).key === item.botKey) || allBots[0];
      if (!targetBot || typeof targetBot.profilePictureUrl !== "function") {
        state.avatarCache.set(cacheKey, "");
        continue;
      }

      try {
        const url = await Promise.race([
          targetBot.profilePictureUrl(item.jid, "image"),
          new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 1600)),
        ]);
        const validUrl = typeof url === "string" ? url : "";
        state.avatarCache.set(cacheKey, validUrl);
        if (validUrl) {
          const chat = ensureBotChatMap(item.botKey).get(item.jid);
          if (chat) chat.avatarUrl = validUrl;
        }
      } catch {
        state.avatarCache.set(cacheKey, "");
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  } finally {
    state.avatarWorkerBusy = false;
  }
}

function hookSockets(mainSock?: any) {
  const sockets = getAllBotSockets(mainSock);

  sockets.forEach((botSock, index) => {
    if (!botSock || typeof botSock !== "object") return;
    const info = getBotInfo(botSock, index);
    ensureBotChatMap(info.key);
    ensureBotContactsMap(info.key);

    if (!state.hookedSockets.has(botSock)) {
      state.hookedSockets.add(botSock);
      triggerBackgroundGroupSync(botSock, index);

      if (botSock.ev && typeof botSock.ev.on === "function") {
        botSock.ev.on("contacts.upsert", (contacts: any[]) => {
          if (!Array.isArray(contacts)) return;
          for (const c of contacts) {
            registerIdentity(c?.phoneNumber || c?.id, c?.lid || c?.id, c?.name || c?.notify || c?.verifiedName, botSock);
          }
        });

        botSock.ev.on("contacts.update", (updates: any[]) => {
          if (!Array.isArray(updates)) return;
          for (const c of updates) {
            registerIdentity(c?.phoneNumber || c?.id, c?.lid || c?.id, c?.name || c?.notify || c?.verifiedName, botSock);
          }
        });

        botSock.ev.on("messages.upsert", async ({ messages }: any) => {
          if (!Array.isArray(messages)) return;
          const currentInfo = getBotInfo(botSock, index);
          const currentKey = currentInfo.key;

          for (const m of messages) {
            if (!m?.message) continue;

            if (m.message.reactionMessage) {
              const reactObj = m.message.reactionMessage;
              const targetId = reactObj.key?.id;
              const rJid = reactObj.key?.remoteJid || m.key?.remoteJid;
              const emoji = reactObj.text || "";
              const reactor = cleanDigits(m.key?.participant || m.key?.remoteJid || "user");
              if (rJid && targetId) {
                const lookup = state.msgLookup.get(targetId);
                if (lookup) {
                  if (!lookup.msg.reactions) lookup.msg.reactions = {};
                  if (emoji) lookup.msg.reactions[reactor] = emoji;
                  else delete lookup.msg.reactions[reactor];
                  broadcastSse("reaction", { botKey: currentKey, jid: rJid, msgId: targetId, reactions: lookup.msg.reactions });
                }
              }
              continue;
            }

            const fromMe = Boolean(m.key?.fromMe);
            const remoteJid = String(m.key?.remoteJid || "");
            if (!remoteJid || remoteJid === "status@broadcast") continue;

            const isGroup = remoteJid.endsWith("@g.us");
            const rawParticipant = String(
              m.key?.participant ||
                (m as any)?.participant ||
                (fromMe ? currentInfo.jid : remoteJid) ||
                ""
            );
            const altParticipant = String(
              (m.key as any)?.participantPn ||
                (m.key as any)?.senderPn ||
                (m as any)?.participantPn ||
                ""
            );

            const senderProfile = fromMe
              ? { phone: currentInfo.key, lid: currentInfo.lid, name: currentInfo.name }
              : await resolvePeerIdentity(botSock, rawParticipant || remoteJid, altParticipant, m.pushName, false);

            const peerProfile = !isGroup
              ? fromMe
                ? await resolvePeerIdentity(botSock, remoteJid, altParticipant, undefined, true)
                : senderProfile
              : { phone: "", lid: "", name: "" };

            const senderPhone = senderProfile.phone || cleanDigits(rawParticipant);
            const senderLid = senderProfile.lid || normalizeLid(rawParticipant);
            const pushName = fromMe
              ? currentInfo.name
              : senderProfile.name || m.pushName || (senderPhone ? `+${senderPhone}` : `LID ${cleanDigits(senderLid)}`);

            const msgId = m.key?.id || randomBytes(6).toString("hex");
            const rawTs = typeof m.messageTimestamp === "number" ? m.messageTimestamp * 1000 : Date.now();

            const details = extractMessageDetails(m.message);
            if (!details.text && !details.mediaType) continue;

            if (details.thumbBuffer) {
              saveThumbToStore(msgId, details.thumbBuffer);
            }

            if (details.mediaType) {
              downloadMediaBuffer(
                botSock,
                m,
                msgId,
                details.mediaType,
                details.mediaMime,
                details.mediaNode
              ).catch(() => {});
            }

            recordChatMessage(botSock, currentKey, remoteJid, {
              id: msgId,
              senderJid: rawParticipant || remoteJid,
              senderPhone,
              senderLid,
              pushName,
              text: details.text,
              fromMe,
              isViewOnce: details.isViewOnce,
              peerPhone: peerProfile.phone,
              peerLid: peerProfile.lid,
              timestamp: rawTs,
              mediaType: details.mediaType,
              mediaMime: details.mediaMime,
              hasMedia: Boolean(details.mediaType),
              quotedId: details.quotedId,
              quotedSender: details.quotedSender,
              quotedText: details.quotedText,
              rawKey: m.key,
              rawMessage: m,
              mediaNode: details.mediaNode,
            });
          }
        });
      }

      if (typeof botSock.sendMessage === "function") {
        const origSend = botSock.sendMessage.bind(botSock);
        state.originalSenders.set(botSock, origSend);

        botSock.sendMessage = async (jid: string, content: any, options?: any) => {
          const currentInfo = getBotInfo(botSock, index);
          const currentKey = currentInfo.key;
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
            } else if (content?.location) {
              textPreview = `📍 Ubicación: ${content.location.name || ""}`;
            } else if (content?.contacts) {
              textPreview = `👤 Contacto: ${content.contacts.displayName || ""}`;
            }

            if (textPreview || mediaType) {
              const peerProf = !jid.endsWith("@g.us")
                ? await resolvePeerIdentity(botSock, jid, undefined, undefined, true)
                : { phone: "", lid: "", name: "" };

              recordChatMessage(botSock, currentKey, jid, {
                id: msgId,
                senderJid: currentInfo.jid,
                senderPhone: currentInfo.key,
                senderLid: currentInfo.lid,
                pushName: currentInfo.name,
                text: textPreview,
                fromMe: true,
                isViewOnce: Boolean(content?.viewOnce),
                peerPhone: peerProf.phone,
                peerLid: peerProf.lid,
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
  const regex = new RegExp(
    "https:\\/\\/[a-zA-Z0-9.-]+\\.(?:trycloudflare\\.com|lhr\\.life|localhost\\.run|serveo\\.net|serveousercontent\\.com|pinggy\\.link|a\\.pinggy\\.io)",
    "g"
  );
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

function spawnCloudflaredTunnel(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (url: string | null) => {
      if (!resolved) {
        resolved = true;
        resolve(url);
      }
    };

    const binCandidates = ["cloudflared", path.join(os.tmpdir(), "cloudflared")];
    const bin = binCandidates.find((b) => (b.startsWith("/") ? fs.existsSync(b) : true)) || "cloudflared";

    try {
      const proc = spawn(bin, ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      state.tunnelProcess = proc;

      const parseChunk = (chunk: Buffer) => {
        const found = extractValidTunnelUrl(chunk.toString("utf8"));
        if (found) {
          state.tunnelUrl = found;
          finish(found);
        }
      };

      proc.stdout?.on("data", parseChunk);
      proc.stderr?.on("data", parseChunk);
      proc.on("error", () => finish(null));
      proc.on("exit", () => {
        if (!resolved) finish(null);
      });

      setTimeout(() => finish(null), 5000);
    } catch {
      finish(null);
    }
  });
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
          "ServerAliveInterval=15",
          "-o",
          "ServerAliveCountMax=3",
          "-o",
          "ExitOnForwardFailure=yes",
          "-o",
          "TCPKeepAlive=yes",
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

      setTimeout(() => finish(null), 5000);
    } catch {
      finish(null);
    }
  });
}

async function startPublicTunnel(port: number, forceRestart = false): Promise<string | null> {
  if (
    !forceRestart &&
    state.tunnelUrl &&
    state.tunnelProcess &&
    !state.tunnelProcess.killed &&
    state.tunnelProcess.exitCode === null
  ) {
    return state.tunnelUrl;
  }

  if (state.tunnelProcess) {
    try {
      state.tunnelProcess.kill("SIGKILL");
    } catch {}
    state.tunnelProcess = null;
    state.tunnelUrl = null;
  }

  const cf = await spawnCloudflaredTunnel(port);
  if (cf) return cf;

  const primary = await spawnSshTunnel(port, "nokey@localhost.run");
  if (primary) return primary;

  const secondary = await spawnSshTunnel(port, "serveo.net");
  if (secondary) return secondary;

  const tertiary = await spawnSshTunnel(port, "a.pinggy.io", ["-p", "443"]);
  return tertiary;
}

function ensureTunnelWatchdog(port: number) {
  if (state.tunnelWatchdogTimer) return;

  state.tunnelWatchdogTimer = setInterval(async () => {
    try {
      const procDead =
        !state.tunnelProcess ||
        state.tunnelProcess.killed ||
        state.tunnelProcess.exitCode !== null;

      let httpDead = false;
      if (!procDead && state.tunnelUrl) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 4000);
          const r = await fetch(`${state.tunnelUrl}/api/ping`, { signal: controller.signal });
          clearTimeout(timer);
          if (!r.ok && r.status !== 401) httpDead = true;
        } catch {
          httpDead = true;
        }
      }

      if (procDead || httpDead) {
        const oldUrl = state.tunnelUrl;
        const newUrl = await startPublicTunnel(port, true);
        if (newUrl && newUrl !== oldUrl) {
          broadcastSse("tunnel_update", { url: `${newUrl}/?token=${state.token}` });
          if (state.lastSock) {
            const origSend = state.originalSenders.get(state.lastSock) || state.lastSock.sendMessage?.bind(state.lastSock);
            if (origSend) {
              await origSend(state.ownerJid, {
                text: [
                  `🔄 *${fytBold("TÚNEL AUTO-RECONECTADO")}*`,
                  ``,
                  `El túnel anterior expiró y el Watchdog levantó uno nuevo automáticamente:`,
                  `⚡ ${newUrl}/?token=${state.token}`,
                ].join("\n"),
              }).catch(() => {});
            }
          }
        }
      }
    } catch {}
  }, 22000);

  state.tunnelWatchdogTimer.unref?.();
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 30 * 1024 * 1024) req.destroy();
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

function buildLoginHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Aura WhatsApp Web | Acceso</title>
<style>
  :root { --bg: #080d11; --panel: #111b21; --border: #222e35; --accent: #00a884; --text: #e9edef; --muted: #8696a0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: radial-gradient(circle at top, #112229 0%, #080d11 100%); color: var(--text); font-family: system-ui, -apple-system, sans-serif; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 30px 24px; width: 100%; max-width: 400px; box-shadow: 0 24px 60px rgba(0,0,0,0.65); }
  .title { font-size: 20px; font-weight: 900; color: var(--accent); margin-bottom: 6px; text-align: center; }
  .sub { font-size: 13px; color: var(--muted); text-align: center; margin-bottom: 22px; }
  label { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px; margin-top: 14px; }
  input { width: 100%; background: #0b141a; color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; font-size: 14px; outline: none; }
  input:focus { border-color: var(--accent); }
  .btn { width: 100%; background: var(--accent); color: #080d11; border: none; padding: 12px; border-radius: 10px; font-weight: 800; font-size: 14px; cursor: pointer; margin-top: 20px; }
  .msg { margin-top: 14px; font-size: 13px; text-align: center; font-weight: 600; }
</style>
</head>
<body>
  <div class="card">
    <div class="title">💬 AURA WHATSAPP WEB</div>
    <div class="sub">Ingresa tu usuario temporal o código OTP enviado a tu WhatsApp</div>
    <form onsubmit="doLogin(event)">
      <label>Usuario Temporal</label>
      <input type="text" id="userInp" placeholder="lufer_xxxx" required autocomplete="off">
      <label>Código OTP / Token</label>
      <input type="password" id="passInp" placeholder="6 dígitos" required autocomplete="off">
      <button type="submit" class="btn">🔓 Entrar a WhatsApp Web</button>
    </form>
    <div class="msg" id="statusMsg"></div>
  </div>
<script>
async function doLogin(e) {
  e.preventDefault();
  const msg = document.getElementById('statusMsg');
  msg.style.color = '#8696a0';
  msg.textContent = 'Verificando...';
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
      window.location.href = '/?token=' + encodeURIComponent(d.token);
    } else {
      msg.style.color = '#ff2a54';
      msg.textContent = d.error || 'Credenciales inválidas.';
    }
  } catch (err) {
    msg.style.color = '#ff2a54';
    msg.textContent = 'Error de red.';
  }
}
</script>
</body>
</html>`;
}

function buildWaWebHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Aura WhatsApp Web Multi-Subbot</title>
<style>
  :root {
    --bg: #0b141a;
    --panel: #111b21;
    --panel-head: #202c33;
    --border: #222e35;
    --wa-green: #00a884;
    --wa-teal: #008069;
    --wa-out: #005c4b;
    --wa-in: #202c33;
    --accent: #00e5ff;
    --troll: #b388ff;
    --danger: #ff2a54;
    --text: #e9edef;
    --muted: #8696a0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { background: #060a0d; color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
  .top-bar { background: #111b21; border-bottom: 1px solid var(--border); padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; z-index: 50; }
  .brand { font-size: 14px; font-weight: 900; color: var(--wa-green); display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .bot-switcher { display: flex; align-items: center; gap: 6px; flex: 1; max-width: 460px; }
  select, input, textarea { background: #202c33; color: var(--text); border: 1px solid #2a3942; border-radius: 8px; padding: 8px 11px; font-size: 13px; outline: none; width: 100%; }
  select:focus, input:focus, textarea:focus { border-color: var(--wa-green); }
  .btn { background: var(--wa-green); color: #081014; border: none; padding: 8px 12px; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; white-space: nowrap; transition: 0.15s; }
  .btn:hover { opacity: 0.9; }
  .btn-ghost { background: #2a3942; color: var(--text); }
  .btn-troll { background: linear-gradient(135deg, #7c4dff, #ff2a54); color: #fff; }
  .btn-danger { background: var(--danger); color: #fff; }
  .status-pill { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: rgba(0,168,132,0.15); color: var(--wa-green); border: 1px solid rgba(0,168,132,0.4); white-space: nowrap; }

  .wa-layout { flex: 1; display: grid; grid-template-columns: 370px 1fr; overflow: hidden; position: relative; background: var(--bg); }
  .wa-sidebar { background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .side-controls { padding: 10px; background: #111b21; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
  .search-row { display: flex; gap: 6px; }
  .filter-tabs { display: flex; gap: 5px; overflow-x: auto; scrollbar-width: none; }
  .filter-tabs::-webkit-scrollbar { display: none; }
  .chip { background: #202c33; color: var(--muted); border: 1px solid #2a3942; padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .chip.active { background: rgba(0,168,132,0.2); color: var(--wa-green); border-color: var(--wa-green); }

  .chat-list { flex: 1; overflow-y: auto; }
  .chat-item { padding: 10px 13px; border-bottom: 1px solid rgba(134,150,160,0.1); cursor: pointer; display: flex; align-items: center; gap: 11px; transition: background 0.12s; }
  .chat-item:hover { background: #202c33; }
  .chat-item.active { background: #2a3942; }
  .avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--wa-teal); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; overflow: hidden; position: relative; }
  .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .chat-meta { flex: 1; min-width: 0; }
  .chat-title-row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .chat-name { font-size: 14px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chat-time { font-size: 10.5px; color: var(--muted); flex-shrink: 0; }
  .chat-id-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
  .id-tag { font-size: 10px; font-family: monospace; padding: 1px 5px; border-radius: 4px; background: rgba(0,229,255,0.1); color: #00e5ff; border: 1px solid rgba(0,229,255,0.22); }
  .id-tag.lid { background: rgba(179,136,255,0.12); color: #d1c4e9; border-color: rgba(179,136,255,0.25); }
  .chat-prev-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 3px; }
  .chat-prev { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .unread-badge { background: var(--wa-green); color: #0b141a; font-size: 10px; font-weight: 900; padding: 2px 6px; border-radius: 999px; flex-shrink: 0; }

  .wa-main { display: flex; flex-direction: column; height: 100%; position: relative; overflow: hidden; background: var(--bg); }
  .chat-header { background: var(--panel-head); padding: 8px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 60px; z-index: 15; }
  .header-left { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; cursor: pointer; }
  .back-btn { display: none; background: #2a3942; color: #fff; border: none; padding: 7px 10px; border-radius: 8px; font-weight: 800; cursor: pointer; }
  .header-info { min-width: 0; flex: 1; }
  .header-name { font-size: 14.5px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .header-sub { font-size: 11.5px; color: #00e5ff; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .header-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .icon-btn { background: #2a3942; color: var(--text); border: none; width: 35px; height: 35px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; transition: 0.15s; }
  .icon-btn:hover { background: #374854; }

  .messages-box {
    flex: 1;
    padding: 14px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background-color: #0b141a;
    background-image: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 0);
    background-size: 22px 22px;
  }
  .msg-row { display: flex; flex-direction: column; max-width: 78%; position: relative; }
  .msg-row.in { align-self: flex-start; }
  .msg-row.out { align-self: flex-end; }
  .bubble { padding: 7px 11px; border-radius: 10px; font-size: 13.5px; line-height: 1.42; position: relative; word-wrap: break-word; white-space: pre-wrap; box-shadow: 0 1px 2px rgba(0,0,0,0.35); }
  .msg-row.in .bubble { background: var(--wa-in); color: var(--text); border-top-left-radius: 2px; }
  .msg-row.out .bubble { background: var(--wa-out); color: var(--text); border-top-right-radius: 2px; }
  .bubble.sticker-bubble { background: transparent !important; box-shadow: none !important; padding: 2px !important; }
  .sender-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; font-size: 11px; font-weight: 800; color: var(--accent); cursor: pointer; }
  .sender-badge { font-family: monospace; font-size: 10px; font-weight: 600; background: rgba(0,0,0,0.3); color: #cbd5e1; padding: 1px 5px; border-radius: 4px; }
  .vo-badge { display: inline-block; background: rgba(255,42,84,0.2); color: #ff6b8b; border: 1px solid #ff2a54; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 5px; margin-bottom: 4px; }
  .quoted-box { background: rgba(0,0,0,0.28); border-left: 3px solid var(--wa-green); border-radius: 6px; padding: 5px 8px; margin-bottom: 6px; font-size: 11.5px; color: #cfd8dc; }
  .quoted-sender { font-weight: 800; color: var(--wa-green); font-size: 11px; margin-bottom: 2px; }
  .media-img { max-width: 280px; width: 100%; max-height: 320px; border-radius: 8px; object-fit: cover; display: block; margin-bottom: 4px; cursor: zoom-in; background: #111b21; }
  .media-sticker { width: 140px; height: 140px; object-fit: contain; display: block; cursor: pointer; }
  .media-video { max-width: 280px; width: 100%; max-height: 320px; border-radius: 8px; display: block; margin-bottom: 4px; background: #000; }
  .media-audio { width: 245px; max-width: 100%; height: 38px; margin: 3px 0; }
  .bubble-meta { display: flex; align-items: center; justify-content: flex-end; gap: 6px; font-size: 10px; color: rgba(255,255,255,0.62); margin-top: 3px; }
  .msg-tools { display: none; gap: 4px; position: absolute; top: -13px; right: 4px; background: #202c33; border: 1px solid #2a3942; border-radius: 999px; padding: 2px 7px; z-index: 20; box-shadow: 0 4px 12px rgba(0,0,0,0.45); }
  .msg-row.in .msg-tools { right: auto; left: 4px; }
  .msg-row:hover .msg-tools { display: flex; }
  .tool-btn { background: transparent; border: none; color: var(--text); cursor: pointer; font-size: 12px; padding: 2px 4px; }
  .tool-btn:hover { transform: scale(1.2); }
  .reactions-pill { display: inline-flex; gap: 3px; background: #202c33; border: 1px solid #2a3942; border-radius: 999px; padding: 2px 6px; font-size: 11px; margin-top: -6px; align-self: flex-end; z-index: 5; }

  .reply-bar { display: none; background: #182229; border-top: 1px solid var(--border); border-left: 4px solid var(--wa-green); padding: 8px 14px; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
  .reply-bar.active { display: flex; }
  .emoji-bar { display: none; background: #182229; border-top: 1px solid var(--border); padding: 8px 12px; gap: 8px; flex-wrap: wrap; max-height: 130px; overflow-y: auto; }
  .emoji-bar.active { display: flex; }
  .emoji-item { font-size: 20px; cursor: pointer; padding: 3px; user-select: none; }

  .composer { background: var(--panel-head); padding: 8px 10px; display: flex; gap: 6px; align-items: center; border-top: 1px solid var(--border); }
  .composer input[type="text"] { background: #2a3942; border: none; padding: 10px 13px; border-radius: 10px; flex: 1; font-size: 14px; }
  .vo-toggle.active { background: var(--danger); color: #fff; box-shadow: 0 0 10px rgba(255,42,84,0.5); }

  .drawer { position: absolute; top: 0; right: 0; width: 350px; max-width: 100%; height: 100%; background: #111b21; border-left: 1px solid var(--border); z-index: 40; display: none; flex-direction: column; overflow-y: auto; padding: 14px; gap: 12px; box-shadow: -10px 0 30px rgba(0,0,0,0.6); }
  .drawer.open { display: flex; }
  .troll-box { background: #182229; border: 1px solid #263540; border-radius: 11px; padding: 11px; display: flex; flex-direction: column; gap: 7px; }
  .troll-box h5 { font-size: 12px; color: var(--troll); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px; }
  .troll-lbl { font-size: 10.5px; color: var(--muted); font-weight: 700; }

  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.88); z-index: 999; display: none; align-items: center; justify-content: center; padding: 16px; }
  .modal-backdrop.open { display: flex; }
  .lightbox-img { max-width: 94vw; max-height: 88vh; border-radius: 10px; object-fit: contain; }

  @media (max-width: 840px) {
    .wa-layout { grid-template-columns: 1fr; }
    .wa-layout.chat-open .wa-sidebar { display: none; }
    .wa-layout:not(.chat-open) .wa-main { display: none; }
    .back-btn { display: inline-flex; }
    .msg-row { max-width: 88%; }
  }
</style>
</head>
<body>
<div class="top-bar">
  <div class="brand">⚡ AURA WA-WEB PRO</div>
  <div class="bot-switcher">
    <select id="waBotSelector" onchange="onSelectSubbot()"></select>
    <button class="btn" onclick="syncSubbotGroups()" title="Sincronizar Grupos y Contactos">🔄</button>
    <button class="btn btn-ghost" onclick="startNewChatPrompt()" title="Abrir chat por número o LID">➕</button>
  </div>
  <div class="status-pill" id="sseStatusPill">🟢 LIVE</div>
</div>

<div class="wa-layout" id="waLayout">
  <div class="wa-sidebar">
    <div class="side-controls">
      <div class="search-row">
        <input type="text" id="waSearchInput" placeholder="Buscar nombre, +número, @lid o texto..." oninput="renderSidebarList(true)">
      </div>
      <div class="filter-tabs">
        <button class="chip active" onclick="setFilterMode('all', this)">💬 Todos</button>
        <button class="chip" onclick="setFilterMode('unread', this)">🟢 No leídos</button>
        <button class="chip" onclick="setFilterMode('direct', this)">👤 Privados</button>
        <button class="chip" onclick="setFilterMode('groups', this)">👥 Grupos</button>
        <button class="chip" onclick="setFilterMode('contacts', this)">📒 Contactos</button>
      </div>
    </div>
    <div class="chat-list" id="waSidebarList"></div>
  </div>

  <div class="wa-main">
    <div class="chat-header">
      <div class="header-left" onclick="openDrawer('info')">
        <button class="back-btn" onclick="event.stopPropagation(); closeMobileChat()">⬅</button>
        <div class="avatar" id="waActiveAvatar">?</div>
        <div class="header-info">
          <div class="header-name" id="waActiveName">Selecciona un chat o contacto</div>
          <div class="header-sub" id="waActiveSub">Elige un Subbot en la barra superior</div>
        </div>
      </div>
      <div class="header-actions" id="waHeaderActions" style="display:none;">
        <button class="btn btn-troll" onclick="openDrawer('troll')" title="Herramientas Troll & Spoof">🎭 Trolls</button>
        <button class="icon-btn" onclick="quickCall(false)" title="Llamada de Voz">📞</button>
        <button class="icon-btn" onclick="quickCall(true)" title="Videollamada">📹</button>
        <button class="icon-btn" onclick="openDrawer('info')" title="Datos del Contacto / Grupo">ℹ️</button>
      </div>
    </div>

    <div class="messages-box" id="waMessagesBox">
      <div style="margin:auto; text-align:center; color:#8696a0; padding:24px; max-width:440px;">
        <h3 style="color:#e9edef; margin-bottom:8px; font-size:18px;">💬 WhatsApp Web Multi-Subbot</h3>
        <p style="font-size:13px; line-height:1.5;">Velocidad en tiempo real con resolución automática de <b>Número (+Phone)</b> y <b>LID (@lid)</b>, revelador de <b>Ver Una Vez</b> y suite de <b>Trolls</b> integrada.</p>
      </div>
    </div>

    <div class="reply-bar" id="waReplyBar">
      <div style="min-width:0; flex:1;">
        <div style="font-weight:800; color:var(--wa-green);" id="waReplySender">Respondiendo</div>
        <div style="color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="waReplyText"></div>
      </div>
      <button class="icon-btn" style="width:28px; height:28px;" onclick="cancelReply()">✖</button>
    </div>

    <div class="emoji-bar" id="waEmojiBar"></div>

    <form class="composer" onsubmit="sendWaMessage(event)">
      <button type="button" class="icon-btn" onclick="toggleEmojiBar()" title="Emojis">😀</button>
      <button type="button" class="icon-btn" onclick="document.getElementById('waMediaFileInput').click()" title="Adjuntar imagen, video, sticker o documento">📎</button>
      <button type="button" class="icon-btn vo-toggle" id="voToggleBtn" onclick="toggleViewOnceMode()" title="Activar Modo Ver Una Vez (1x)">👁️</button>
      <input type="file" id="waMediaFileInput" style="display:none" accept="image/*,video/*,audio/*,.webp,.pdf,.zip" onchange="handleMediaUpload(event)">
      <input type="text" id="waMessageInput" placeholder="Escribe un mensaje..." autocomplete="off" oninput="onComposerTyping()">
      <button type="button" class="icon-btn" id="waVoiceBtn" onclick="toggleVoiceRecording()" title="Grabar Nota de Voz">🎤</button>
      <button type="submit" class="btn" style="padding:9px 14px; border-radius:10px;">➤</button>
    </form>

    <div class="drawer" id="waTrollDrawer">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:8px;">
        <h4 style="color:var(--troll);">🎭 Suite Troll & Spoof</h4>
        <button class="icon-btn" style="width:28px; height:28px;" onclick="closeDrawers()">✖</button>
      </div>

      <div class="troll-box">
        <h5>💬 1. Cita Falsa (Spoof Quote)</h5>
        <div class="troll-lbl">Víctima (elige miembro o escribe número/LID):</div>
        <select id="trollMemberSelect" onchange="document.getElementById('trollFakeSender').value=this.value" style="margin-bottom:4px;">
          <option value="">-- Seleccionar del chat --</option>
        </select>
        <input type="text" id="trollFakeSender" placeholder="Ej: 573001234567 o 27527...@lid">
        <div class="troll-lbl">Texto falso que "dijo" la víctima:</div>
        <input type="text" id="trollFakeQuotedText" placeholder="Ej: Me gusta comer jabón">
        <div class="troll-lbl">Tu respuesta en el chat:</div>
        <input type="text" id="trollRealReplyText" placeholder="Ej: ¿Cómo así bro? 📸🤨">
        <button class="btn btn-troll" onclick="execTroll('fake-quote')">🚀 Enviar Cita Falsa</button>
      </div>

      <div class="troll-box">
        <h5>👻 2. Mención Fantasma (Hidden Tag)</h5>
        <div class="troll-lbl">Menciona a todo el grupo sin mostrar @ en el texto:</div>
        <input type="text" id="trollGhostText" placeholder="Texto visible (ej: Buenas noches)">
        <button class="btn btn-troll" onclick="execTroll('ghost-tag')">👻 Enviar Hidden Tag Masivo</button>
      </div>

      <div class="troll-box">
        <h5>📞 3. Bombardero de Timbrado (Call Ring)</h5>
        <div style="display:flex; gap:6px;">
          <input type="number" id="trollCallCount" value="3" min="1" max="15" style="width:80px;">
          <select id="trollCallVideo">
            <option value="0">📞 Voz</option>
            <option value="1">📹 Video</option>
          </select>
          <button class="btn btn-danger" style="flex:1;" onclick="execTroll('call-bomb')">📲 Timbrar</button>
        </div>
      </div>

      <div class="troll-box">
        <h5>📍 4. Ubicación Falsa (Spoof GPS)</h5>
        <select id="trollLocPreset" onchange="applyLocPreset(this.value)">
          <option value="37.2431,-115.7930,Área 51 - Base Clasificada">🛸 Área 51 (Nevada)</option>
          <option value="39.0392,125.7625,Pyongyang - Corea del Norte">🚀 Pyongyang (Corea del Norte)</option>
          <option value="51.3890,30.0990,Reactor 4 - Chernobyl">☢️ Reactor 4 (Chernobyl)</option>
          <option value="4.7110,-74.0721,Motel Las Palmas Habitación 69">🏩 Motel Las Palmas (Hab. 69)</option>
        </select>
        <input type="text" id="trollLocName" value="Área 51 - Base Clasificada" placeholder="Nombre del lugar">
        <div style="display:flex; gap:6px;">
          <input type="text" id="trollLocLat" value="37.2431" placeholder="Latitud">
          <input type="text" id="trollLocLng" value="-115.7930" placeholder="Longitud">
        </div>
        <button class="btn btn-troll" onclick="execTroll('fake-loc')">📍 Enviar Ubicación Falsa</button>
      </div>

      <div class="troll-box">
        <h5>🪪 5. Contacto Falso (Spoof vCard)</h5>
        <input type="text" id="trollVcardName" value="Soporte Oficial WhatsApp" placeholder="Nombre del contacto">
        <input type="text" id="trollVcardPhone" value="16505434800" placeholder="Número (ej: 16505434800)">
        <button class="btn btn-troll" onclick="execTroll('fake-vcard')">🪪 Enviar vCard Falsa</button>
      </div>

      <div class="troll-box">
        <h5>⚡ 6. Ráfaga de Reacciones & Estado Infinito</h5>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-ghost" style="flex:1;" onclick="execTroll('react-rain')">🎉 Lluvia Reacciones</button>
          <button class="btn btn-ghost" style="flex:1;" onclick="execTroll('presence-loop-composing')">✍️ Escribiendo 60s</button>
          <button class="btn btn-ghost" style="flex:1;" onclick="execTroll('presence-loop-recording')">🎤 Grabando 60s</button>
        </div>
      </div>
    </div>

    <div class="drawer" id="waInfoDrawer">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:8px;">
        <h4>ℹ️ Ficha de Identidad</h4>
        <button class="icon-btn" style="width:28px; height:28px;" onclick="closeDrawers()">✖</button>
      </div>
      <div style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:12px 0; gap:8px;">
        <div class="avatar" id="drawerAvatar" style="width:76px; height:76px; font-size:24px;">?</div>
        <div style="font-size:16px; font-weight:800;" id="drawerName">-</div>
        <div style="width:100%; background:#182229; border:1px solid #263540; border-radius:10px; padding:10px; text-align:left; font-size:12px; line-height:1.7; font-family:monospace;">
          <div>📱 <b>Número:</b> <span id="drawerPhone" style="color:#00e5ff;">-</span></div>
          <div>🔗 <b>LID:</b> <span id="drawerLid" style="color:#d1c4e9;">-</span></div>
          <div>🌐 <b>JID Chat:</b> <span id="drawerJid" style="color:#8696a0;">-</span></div>
          <div>🤖 <b>Subbot Activo:</b> <span id="drawerBot" style="color:#00a884;">-</span></div>
        </div>
        <div style="font-size:12px; color:#cbd5e1; background:#182229; padding:8px 12px; border-radius:8px; width:100%;" id="drawerBio">Sin descripción</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:7px;">
        <button class="btn" onclick="copyIdentityInfo()">📋 Copiar Número + LID</button>
        <button class="btn btn-troll" onclick="openDrawer('troll')">🎭 Abrir Panel Troll</button>
        <button class="btn btn-ghost" onclick="clearActiveChatHistory()">🗑️ Limpiar Mensajes Locales</button>
        <button class="btn btn-danger" onclick="blockOrUnblockCurrentChat('block')">🚫 Bloquear Contacto</button>
        <button class="btn btn-ghost" onclick="blockOrUnblockCurrentChat('unblock')">✅ Desbloquear Contacto</button>
      </div>
    </div>
  </div>
</div>

<div class="modal-backdrop" id="lightboxModal" onclick="closeLightbox()">
  <img id="lightboxImg" class="lightbox-img" src="" alt="Vista previa">
</div>

<script>
const TOKEN = "${token}";
let selectedBotKey = "";
let selectedChatJid = "";
let filterMode = "all";
let cachedChats = [];
let cachedContacts = [];
let currentChatObj = null;
let currentMessages = [];
let knownBots = [];
let replyTargetMsg = null;
let viewOnceEnabled = false;
let mediaRecorder = null;
let recordedChunks = [];
let lastTypingSent = 0;
let isFetchingChats = false;
let isFetchingMsgs = false;

const EMOJI_LIST = ["😂","❤️","🔥","👍","😭","🙏","😍","🥰","🤣","😊","😎","🙌","💀","👀","✨","🎉","💯","😡","😱","🤔","👏","🫡","🤝","⚡","🚀","👑","💎","🤖","✅","❌"];

function initEmojiBar() {
  const bar = document.getElementById('waEmojiBar');
  bar.innerHTML = EMOJI_LIST.map(e => '<span class="emoji-item" onclick="insertEmoji(\\'' + e + '\\')">' + e + '</span>').join('');
}

function toggleEmojiBar() {
  document.getElementById('waEmojiBar').classList.toggle('active');
}

function insertEmoji(e) {
  const inp = document.getElementById('waMessageInput');
  inp.value += e;
  inp.focus();
}

function toggleViewOnceMode() {
  viewOnceEnabled = !viewOnceEnabled;
  const btn = document.getElementById('voToggleBtn');
  btn.classList.toggle('active', viewOnceEnabled);
}

function openDrawer(which) {
  if (!selectedChatJid) return;
  document.getElementById('waTrollDrawer').classList.toggle('open', which === 'troll');
  document.getElementById('waInfoDrawer').classList.toggle('open', which === 'info');
}

function closeDrawers() {
  document.getElementById('waTrollDrawer').classList.remove('open');
  document.getElementById('waInfoDrawer').classList.remove('open');
}

function applyLocPreset(val) {
  const parts = val.split(',');
  document.getElementById('trollLocLat').value = parts[0] || '0';
  document.getElementById('trollLocLng').value = parts[1] || '0';
  document.getElementById('trollLocName').value = parts.slice(2).join(',') || '';
}

async function api(path, method = 'GET', body = null, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'x-aura-token': TOKEN },
      signal: controller.signal
    };
    if (body) opts.body = JSON.stringify(body);
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch('/api/' + path + sep + 'token=' + TOKEN, opts);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightboxModal').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightboxModal').classList.remove('open');
}

function connectSseStream() {
  try {
    const es = new EventSource('/api/stream?token=' + encodeURIComponent(TOKEN));
    const pill = document.getElementById('sseStatusPill');

    es.onopen = () => {
      pill.textContent = '🟢 LIVE SSE';
    };

    es.addEventListener('chat_update', (ev) => {
      try {
        const d = JSON.parse(ev.data || '{}');
        if (d.botKey === selectedBotKey) {
          refreshWaChats(true);
          if (selectedChatJid && d.jid === selectedChatJid) {
            loadWaMessages(selectedChatJid, true, true);
          }
        }
      } catch {}
    });

    es.addEventListener('reaction', (ev) => {
      try {
        const d = JSON.parse(ev.data || '{}');
        if (d.botKey === selectedBotKey && d.jid === selectedChatJid) {
          loadWaMessages(selectedChatJid, false, true);
        }
      } catch {}
    });

    es.addEventListener('sync_done', (ev) => {
      try {
        const d = JSON.parse(ev.data || '{}');
        if (d.botKey === selectedBotKey) {
          refreshWaChats(true);
        }
      } catch {}
    });

    es.onerror = () => {
      pill.textContent = '🟡 SYNC';
    };
  } catch {}
}

async function loadSubbotsList() {
  try {
    const d = await api('bots', 'GET', null, 5000);
    knownBots = d.bots || [];
    const selector = document.getElementById('waBotSelector');
    const prevVal = selector.value || selectedBotKey;
    const html = knownBots.map((b, idx) => {
      const role = idx === 0 ? '👑 Main: ' : '🤖 Sub #' + idx + ': ';
      const unreadTxt = b.unreadTotal > 0 ? ' (' + b.unreadTotal + ' nuevos)' : '';
      return '<option value="' + escapeHtml(b.key) + '">' + escapeHtml(role + b.name + ' (+' + b.key + ')' + unreadTxt) + '</option>';
    }).join('');

    if (selector.dataset.sig !== html) {
      selector.dataset.sig = html;
      selector.innerHTML = html;
      if (prevVal && knownBots.some(x => x.key === prevVal)) {
        selector.value = prevVal;
        selectedBotKey = prevVal;
      } else if (knownBots[0]) {
        selectedBotKey = knownBots[0].key;
        selector.value = selectedBotKey;
      }
    }
  } catch {}
}

function setFilterMode(mode, btn) {
  filterMode = mode;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderSidebarList(true);
}

function onSelectSubbot() {
  const sel = document.getElementById('waBotSelector');
  selectedBotKey = sel.value;
  selectedChatJid = "";
  currentChatObj = null;
  closeMobileChat();
  document.getElementById('waSidebarList').innerHTML = '<div style="padding:24px; text-align:center; color:#00e5ff; font-size:13px;">⚡ Cargando chats de +' + escapeHtml(selectedBotKey) + '...</div>';
  refreshWaChats(true);
}

async function syncSubbotGroups() {
  if (!selectedBotKey) return;
  await api('wa-sync', 'POST', { botKey: selectedBotKey });
  setTimeout(() => refreshWaChats(true), 600);
}

async function refreshWaChats(force = false) {
  if (isFetchingChats && !force) return;
  if (!selectedBotKey && knownBots[0]) selectedBotKey = knownBots[0].key;
  if (!selectedBotKey) return;
  isFetchingChats = true;
  try {
    const d = await api('wa-chats?botKey=' + encodeURIComponent(selectedBotKey), 'GET', null, 5000);
    cachedChats = d.chats || [];
    cachedContacts = d.contacts || [];
    renderSidebarList(force);
  } catch {} finally {
    isFetchingChats = false;
  }
}

function renderAvatarHtml(name, avatarUrl, isGroup) {
  const initials = (name || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || (isGroup ? '👥' : '👤');
  if (avatarUrl) {
    return '<img src="' + escapeHtml(avatarUrl) + '" loading="lazy" onerror="this.style.display=\\'none\\'; this.parentNode.textContent=\\'' + escapeHtml(initials) + '\\';" alt="">';
  }
  return escapeHtml(initials);
}

function renderSidebarList() {
  const q = (document.getElementById('waSearchInput').value || '').toLowerCase().trim();
  const listEl = document.getElementById('waSidebarList');

  if (filterMode === 'contacts') {
    const filteredContacts = cachedContacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.lid || '').toLowerCase().includes(q) ||
      c.jid.toLowerCase().includes(q)
    );

    if (!filteredContacts.length) {
      listEl.innerHTML = '<div style="padding:24px; text-align:center; color:#8696a0; font-size:12px;">Sin contactos registrados en este filtro. Pulsa 🔄 para sincronizar.</div>';
      return;
    }

    listEl.innerHTML = filteredContacts.slice(0, 200).map(c => {
      const phoneTag = c.phone ? '<span class="id-tag">📱 +' + escapeHtml(c.phone) + '</span>' : '';
      const lidTag = c.lid ? '<span class="id-tag lid">🔗 ' + escapeHtml(c.lid) + '</span>' : '';
      return '<div class="chat-item" onclick="openContactChat(\\'' + escapeHtml(c.jid) + '\\', \\'' + escapeHtml(c.name) + '\\', \\'' + escapeHtml(c.phone) + '\\', \\'' + escapeHtml(c.lid) + '\\')">' +
        '<div class="avatar" style="background:#008069">' + renderAvatarHtml(c.name, '', false) + '</div>' +
        '<div class="chat-meta">' +
          '<div class="chat-title-row"><div class="chat-name">' + escapeHtml(c.name) + '</div></div>' +
          '<div class="chat-id-tags">' + phoneTag + lidTag + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    return;
  }

  const filtered = cachedChats.filter(c => {
    if (filterMode === 'unread' && (!c.unread || c.unread <= 0)) return false;
    if (filterMode === 'groups' && !c.isGroup) return false;
    if (filterMode === 'direct' && c.isGroup) return false;
    return (
      c.name.toLowerCase().includes(q) ||
      c.jid.toLowerCase().includes(q) ||
      (c.peerPhone || '').includes(q) ||
      (c.peerLid || '').toLowerCase().includes(q) ||
      (c.lastPreview || '').toLowerCase().includes(q)
    );
  });

  if (!filtered.length) {
    listEl.innerHTML = '<div style="padding:24px; text-align:center; color:#8696a0; font-size:12px;">Sin conversaciones en este filtro. Usa 📒 Contactos o pulsa ➕ para abrir un chat.</div>';
    return;
  }

  listEl.innerHTML = filtered.slice(0, 150).map(c => {
    const activeCls = c.jid === selectedChatJid ? 'active' : '';
    const timeStr = c.lastTime ? new Date(c.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const unreadHtml = c.unread > 0 ? '<span class="unread-badge">' + c.unread + '</span>' : '';

    let idTagsHtml = '';
    if (!c.isGroup) {
      const pTag = c.peerPhone ? '<span class="id-tag">📱 +' + escapeHtml(c.peerPhone) + '</span>' : '';
      const lTag = c.peerLid ? '<span class="id-tag lid">🔗 ' + escapeHtml(c.peerLid) + '</span>' : '';
      idTagsHtml = '<div class="chat-id-tags">' + pTag + lTag + '</div>';
    }

    return '<div class="chat-item ' + activeCls + '" onclick="openWaChat(\\'' + escapeHtml(c.jid) + '\\')">' +
      '<div class="avatar" style="background:' + (c.isGroup ? '#5e35b1' : '#008069') + '">' + renderAvatarHtml(c.name, c.avatarUrl, c.isGroup) + '</div>' +
      '<div class="chat-meta">' +
        '<div class="chat-title-row">' +
          '<div class="chat-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="chat-time">' + escapeHtml(timeStr) + '</div>' +
        '</div>' +
        idTagsHtml +
        '<div class="chat-prev-row">' +
          '<div class="chat-prev">' + escapeHtml(c.lastPreview || c.jid) + '</div>' +
          unreadHtml +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function openContactChat(jid, name, phone, lid) {
  await api('wa-init-chat', 'POST', { botKey: selectedBotKey, jid, name, phone, lid });
  setFilterMode('all', document.querySelector('.chip'));
  await refreshWaChats(true);
  openWaChat(jid);
}

async function openWaChat(jid) {
  selectedChatJid = jid;
  cancelReply();
  closeDrawers();
  document.getElementById('waLayout').classList.add('chat-open');
  document.getElementById('waHeaderActions').style.display = 'flex';
  renderSidebarList();
  await loadWaMessages(jid, true, true);
}

function closeMobileChat() {
  document.getElementById('waLayout').classList.remove('chat-open');
  closeDrawers();
}

async function loadWaMessages(jid, scrollBottom = false, force = false) {
  if (isFetchingMsgs && !force) return;
  if (!selectedBotKey || !jid) return;
  isFetchingMsgs = true;
  try {
    const d = await api('wa-messages?botKey=' + encodeURIComponent(selectedBotKey) + '&jid=' + encodeURIComponent(jid), 'GET', null, 5000);
    if (!d.chat) return;

    currentChatObj = d.chat;
    currentMessages = d.chat.messages || [];

    document.getElementById('waActiveName').textContent = d.chat.name || jid;

    let subParts = [];
    if (d.chat.isGroup) {
      subParts.push('👥 ' + ((d.chat.members && d.chat.members.length) || 0) + ' miembros');
      subParts.push('ID: ' + d.chat.jid);
    } else {
      if (d.chat.peerPhone) subParts.push('📱 +' + d.chat.peerPhone);
      if (d.chat.peerLid) subParts.push('🔗 ' + d.chat.peerLid);
      if (!subParts.length) subParts.push(d.chat.jid);
    }
    subParts.push('🤖 Subbot: +' + selectedBotKey);
    document.getElementById('waActiveSub').textContent = subParts.join(' • ');

    document.getElementById('waActiveAvatar').innerHTML = renderAvatarHtml(d.chat.name, d.chat.avatarUrl, d.chat.isGroup);

    document.getElementById('drawerName').textContent = d.chat.name || jid;
    document.getElementById('drawerPhone').textContent = d.chat.peerPhone ? ('+' + d.chat.peerPhone) : (d.chat.isGroup ? 'Grupo' : 'No resuelto');
    document.getElementById('drawerLid').textContent = d.chat.peerLid || (d.chat.isGroup ? 'N/A' : 'No vinculado');
    document.getElementById('drawerJid').textContent = d.chat.jid;
    document.getElementById('drawerBot').textContent = '+' + selectedBotKey;
    document.getElementById('drawerBio').textContent = d.chat.statusText || (d.chat.isGroup ? 'Grupo sincronizado' : 'Chat directo');
    document.getElementById('drawerAvatar').innerHTML = renderAvatarHtml(d.chat.name, d.chat.avatarUrl, d.chat.isGroup);

    const memberSel = document.getElementById('trollMemberSelect');
    if (d.chat.isGroup && Array.isArray(d.chat.members) && d.chat.members.length) {
      memberSel.innerHTML = '<option value="">-- Seleccionar miembro del grupo --</option>' +
        d.chat.members.map(m => {
          const idLbl = (m.phone ? '+' + m.phone : '') + (m.lid ? ' (' + m.lid + ')' : '');
          return '<option value="' + escapeHtml(m.jid) + '">' + escapeHtml(m.name + ' ' + idLbl) + '</option>';
        }).join('');
    } else {
      const directTarget = d.chat.peerPhone ? (d.chat.peerPhone + '@s.whatsapp.net') : (d.chat.peerLid || d.chat.jid);
      memberSel.innerHTML = '<option value="' + escapeHtml(directTarget) + '">' + escapeHtml(d.chat.name) + '</option>';
      document.getElementById('trollFakeSender').value = directTarget;
    }

    const box = document.getElementById('waMessagesBox');
    const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;

    if (!currentMessages.length) {
      box.innerHTML = '<div style="margin:auto; color:#8696a0; font-size:12px; text-align:center; background:#111b21; padding:14px 20px; border-radius:10px;">🔒 Conversación lista. Envía un mensaje o usa el botón 🎭 Trolls arriba a la derecha.</div>';
      return;
    }

    box.innerHTML = currentMessages.map(m => {
      const side = m.fromMe ? 'out' : 'in';
      const isSticker = m.mediaType === 'sticker';

      let senderHeader = '';
      if (!m.fromMe && !isSticker) {
        const pBadge = m.senderPhone ? '<span class="sender-badge">+' + escapeHtml(m.senderPhone) + '</span>' : '';
        const lBadge = m.senderLid ? '<span class="sender-badge">' + escapeHtml(m.senderLid) + '</span>' : '';
        const targetId = m.senderPhone || m.senderLid || m.senderJid;
        senderHeader = '<div class="sender-line" onclick="selectUserForMentionOrTroll(\\'' + escapeHtml(targetId) + '\\', \\'' + escapeHtml(m.pushName) + '\\')">' +
          '<span>' + escapeHtml(m.pushName || 'Usuario') + '</span>' + pBadge + lBadge +
        '</div>';
      }

      const voBadge = m.isViewOnce ? '<div class="vo-badge">👁️ VER UNA VEZ (REVELADO)</div>' : '';

      let quotedHtml = '';
      if (m.quotedText) {
        quotedHtml = '<div class="quoted-box">' +
          '<div class="quoted-sender">' + escapeHtml(m.quotedSender || 'Cita') + '</div>' +
          '<div>' + escapeHtml(m.quotedText) + '</div>' +
        '</div>';
      }

      let mediaHtml = '';
      const mediaUrl = '/api/media?id=' + encodeURIComponent(m.id) + '&botKey=' + encodeURIComponent(selectedBotKey) + '&token=' + TOKEN;
      const thumbUrl = '/api/thumb?id=' + encodeURIComponent(m.id) + '&token=' + TOKEN;

      if (m.mediaType === 'image') {
        mediaHtml = '<img class="media-img" src="' + mediaUrl + '" loading="lazy" onclick="openLightbox(\\'' + mediaUrl + '\\')" alt="Imagen">';
      } else if (m.mediaType === 'sticker') {
        mediaHtml = '<img class="media-sticker" src="' + mediaUrl + '" loading="lazy" onclick="openLightbox(\\'' + mediaUrl + '\\')" alt="Sticker">';
      } else if (m.mediaType === 'video') {
        mediaHtml = '<video class="media-video" controls playsinline preload="metadata" poster="' + thumbUrl + '" src="' + mediaUrl + '"></video>';
      } else if (m.mediaType === 'audio') {
        mediaHtml = '<audio class="media-audio" controls preload="metadata" src="' + mediaUrl + '"></audio>';
      }

      const textHtml = m.text ? '<div>' + escapeHtml(m.text) + '</div>' : '';

      const reactionsEntries = Object.values(m.reactions || {});
      const reactionsHtml = reactionsEntries.length
        ? '<div class="reactions-pill">' + reactionsEntries.map(r => escapeHtml(r)).join(' ') + '</div>'
        : '';

      const toolsHtml = '<div class="msg-tools">' +
        '<button class="tool-btn" onclick="reactToMsg(\\'' + escapeHtml(m.id) + '\\', \\'❤️\\')">❤️</button>' +
        '<button class="tool-btn" onclick="reactToMsg(\\'' + escapeHtml(m.id) + '\\', \\'😂\\')">😂</button>' +
        '<button class="tool-btn" onclick="reactToMsg(\\'' + escapeHtml(m.id) + '\\', \\'🔥\\')">🔥</button>' +
        '<button class="tool-btn" onclick="reactToMsg(\\'' + escapeHtml(m.id) + '\\', \\'💀\\')">💀</button>' +
        '<button class="tool-btn" onclick="setReplyMsg(\\'' + escapeHtml(m.id) + '\\')" title="Responder">↩️</button>' +
        '<button class="tool-btn" onclick="prefillFakeQuote(\\'' + escapeHtml(m.senderPhone || m.senderLid || m.senderJid) + '\\')" title="Citar Falso a este usuario">🎭</button>' +
        '<button class="tool-btn" onclick="deleteMsgForAll(\\'' + escapeHtml(m.id) + '\\')" title="Eliminar para todos">🗑️</button>' +
      '</div>';

      return '<div class="msg-row ' + side + '">' +
        toolsHtml +
        '<div class="bubble ' + (isSticker ? 'sticker-bubble' : '') + '">' +
          senderHeader +
          voBadge +
          quotedHtml +
          mediaHtml +
          textHtml +
          '<div class="bubble-meta"><span>' + escapeHtml(m.time) + '</span>' + (m.fromMe ? '<span>✓✓</span>' : '') + '</div>' +
        '</div>' +
        reactionsHtml +
      '</div>';
    }).join('');

    if (scrollBottom || wasNearBottom) {
      box.scrollTop = box.scrollHeight;
    }
  } catch {} finally {
    isFetchingMsgs = false;
  }
}

function selectUserForMentionOrTroll(id, name) {
  const num = String(id).split('@')[0];
  const inp = document.getElementById('waMessageInput');
  inp.value += '@' + num + ' ';
  inp.focus();
  document.getElementById('trollFakeSender').value = id;
}

function prefillFakeQuote(senderId) {
  document.getElementById('trollFakeSender').value = senderId;
  openDrawer('troll');
  document.getElementById('trollFakeQuotedText').focus();
}

function copyIdentityInfo() {
  if (!currentChatObj) return;
  const txt = 'Nombre: ' + currentChatObj.name + '\\nNúmero: +' + (currentChatObj.peerPhone || 'N/A') + '\\nLID: ' + (currentChatObj.peerLid || 'N/A') + '\\nJID: ' + currentChatObj.jid;
  navigator.clipboard?.writeText(txt);
  alert('Datos copiados:\\n' + txt);
}

function setReplyMsg(msgId) {
  const found = currentMessages.find(x => x.id === msgId);
  if (!found) return;
  replyTargetMsg = found;
  document.getElementById('waReplySender').textContent = found.pushName || ('+' + found.senderPhone);
  document.getElementById('waReplyText').textContent = found.text || 'Multimedia';
  document.getElementById('waReplyBar').classList.add('active');
  document.getElementById('waMessageInput').focus();
}

function cancelReply() {
  replyTargetMsg = null;
  document.getElementById('waReplyBar').classList.remove('active');
}

async function reactToMsg(msgId, emoji) {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-action', 'POST', { action: 'react', botKey: selectedBotKey, jid: selectedChatJid, msgId, emoji });
  loadWaMessages(selectedChatJid, false, true);
}

async function deleteMsgForAll(msgId) {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-action', 'POST', { action: 'delete', botKey: selectedBotKey, jid: selectedChatJid, msgId });
  loadWaMessages(selectedChatJid, false, true);
}

function onComposerTyping() {
  const now = Date.now();
  if (now - lastTypingSent > 4000 && selectedBotKey && selectedChatJid) {
    lastTypingSent = now;
    api('wa-action', 'POST', { action: 'presence', botKey: selectedBotKey, jid: selectedChatJid, presence: 'composing' });
  }
}

async function sendWaMessage(e) {
  e.preventDefault();
  const inp = document.getElementById('waMessageInput');
  const text = inp.value.trim();
  if (!text || !selectedBotKey || !selectedChatJid) return;
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
    await loadWaMessages(selectedChatJid, true, true);
    refreshWaChats(true);
  } else {
    alert(r.error || 'Error enviando mensaje');
  }
}

async function handleMediaUpload(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !selectedBotKey || !selectedChatJid) return;

  const isSticker = file.name.toLowerCase().endsWith('.webp');
  const caption = isSticker ? '' : (prompt('Comentario adjunto (opcional):', '') || '');

  const reader = new FileReader();
  reader.onload = async () => {
    const base64Data = String(reader.result || '').split(',')[1] || '';
    if (!base64Data) return;
    const r = await api('wa-send-media', 'POST', {
      botKey: selectedBotKey,
      jid: selectedChatJid,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      asSticker: isSticker,
      viewOnce: viewOnceEnabled,
      caption,
      base64: base64Data,
      quotedId: replyTargetMsg ? replyTargetMsg.id : ''
    }, 20000);
    cancelReply();
    if (r.ok) {
      await loadWaMessages(selectedChatJid, true, true);
      refreshWaChats(true);
    } else {
      alert(r.error || 'Error enviando archivo');
    }
  };
  reader.readAsDataURL(file);
}

async function toggleVoiceRecording() {
  const btn = document.getElementById('waVoiceBtn');
  if (!selectedBotKey || !selectedChatJid) return alert('Selecciona un chat primero.');
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
          viewOnce: viewOnceEnabled,
          base64
        }, 20000);
        await loadWaMessages(selectedChatJid, true, true);
        refreshWaChats(true);
      };
      reader.readAsDataURL(blob);
    };
    mediaRecorder.start();
    btn.style.background = '#ff2a54';
    btn.textContent = '⏹️';
  } catch {
    alert('Micrófono no disponible.');
  }
}

async function quickCall(isVideo) {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-troll', 'POST', {
    botKey: selectedBotKey,
    jid: selectedChatJid,
    type: 'call-bomb',
    count: 1,
    isVideo
  });
  loadWaMessages(selectedChatJid, true, true);
}

async function execTroll(type) {
  if (!selectedBotKey || !selectedChatJid) return alert('Abre un chat primero');
  const payload = { botKey: selectedBotKey, jid: selectedChatJid, type };

  if (type === 'fake-quote') {
    payload.fakeSender = document.getElementById('trollFakeSender').value.trim();
    payload.fakeQuotedText = document.getElementById('trollFakeQuotedText').value.trim();
    payload.replyText = document.getElementById('trollRealReplyText').value.trim();
    if (!payload.fakeQuotedText || !payload.replyText) return alert('Completa el texto falso y tu respuesta');
  } else if (type === 'ghost-tag') {
    payload.text = document.getElementById('trollGhostText').value.trim() || '⚡';
  } else if (type === 'call-bomb') {
    payload.count = parseInt(document.getElementById('trollCallCount').value, 10) || 3;
    payload.isVideo = document.getElementById('trollCallVideo').value === '1';
  } else if (type === 'fake-loc') {
    payload.lat = parseFloat(document.getElementById('trollLocLat').value) || 37.2431;
    payload.lng = parseFloat(document.getElementById('trollLocLng').value) || -115.7930;
    payload.name = document.getElementById('trollLocName').value.trim();
  } else if (type === 'fake-vcard') {
    payload.vcardName = document.getElementById('trollVcardName').value.trim();
    payload.vcardPhone = document.getElementById('trollVcardPhone').value.trim();
  } else if (type === 'react-rain') {
    const lastMsg = currentMessages[currentMessages.length - 1];
    if (!lastMsg) return alert('No hay mensajes en el chat para reaccionar');
    payload.msgId = lastMsg.id;
  }

  const r = await api('wa-troll', 'POST', payload, 15000);
  if (r.ok) {
    loadWaMessages(selectedChatJid, true, true);
  } else {
    alert(r.error || 'Error ejecutando troll');
  }
}

async function startNewChatPrompt() {
  const raw = prompt('Ingresa el número con código de país (ej: 573001234567) o el @lid:');
  if (!raw) return;
  const clean = raw.trim();
  const jid = clean.includes('@') ? clean : clean.replace(/\\D/g, '') + '@s.whatsapp.net';
  await api('wa-init-chat', 'POST', { botKey: selectedBotKey, jid });
  await refreshWaChats(true);
  openWaChat(jid);
}

async function clearActiveChatHistory() {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-clear-chat', 'POST', { botKey: selectedBotKey, jid: selectedChatJid });
  loadWaMessages(selectedChatJid, true, true);
  refreshWaChats(true);
}

async function blockOrUnblockCurrentChat(mode) {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-action', 'POST', { action: mode, botKey: selectedBotKey, jid: selectedChatJid });
  alert(mode === 'block' ? 'Contacto bloqueado.' : 'Contacto desbloqueado.');
}

(async () => {
  initEmojiBar();
  await loadSubbotsList();
  await refreshWaChats(true);
  connectSseStream();
  setInterval(loadSubbotsList, 6000);
  setInterval(() => refreshWaChats(false), 5000);
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

      if (pathname === "/api/ping") {
        sendJson(res, 200, { ok: true, ts: Date.now() });
        return;
      }

      if (pathname === "/api/login" && req.method === "POST") {
        const body = await readJsonBody(req);
        const u = String(body.user || "").trim();
        const p = String(body.pass || "").trim();
        if ((u === state.tempUser && p === state.tempPass) || p === state.token || p === state.tempPass) {
          sendJson(res, 200, { ok: true, token: state.token });
        } else {
          sendJson(res, 401, { ok: false, error: "Credenciales inválidas." });
        }
        return;
      }

      const queryToken = parsedUrl.searchParams.get("token") || req.headers["x-aura-token"];

      if (pathname === "/" && req.method === "GET") {
        if (queryToken !== state.token) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(buildLoginHtml());
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(buildWaWebHtml(state.token));
        return;
      }

      if (queryToken !== state.token) {
        sendJson(res, 401, { error: "No autorizado" });
        return;
      }

      if (pathname === "/api/stream" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "X-Accel-Buffering": "no",
        });
        res.write(`event: connected\ndata: {"ok":true}\n\n`);
        state.sseClients.add(res);
        req.on("close", () => {
          state.sseClients.delete(res);
        });
        return;
      }

      if (pathname === "/api/bots" && req.method === "GET") {
        hookSockets();
        const allBots = getAllBotSockets();
        const bots = allBots.map((b, idx) => {
          const info = getBotInfo(b, idx);
          const store = ensureBotChatMap(info.key);
          let unreadTotal = 0;
          for (const c of store.values()) unreadTotal += c.unread || 0;
          return {
            key: info.key,
            name: info.name,
            lid: info.lid,
            unreadTotal,
          };
        });
        sendJson(res, 200, { bots });
        return;
      }

      if (pathname === "/api/wa-chats" && req.method === "GET") {
        hookSockets();
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : allBots[0];
        const effectiveKey = targetBot ? getBotInfo(targetBot, Math.max(0, targetIdx)).key : botKey;

        if (targetBot) {
          hydrateFastMemoryForBot(targetBot, Math.max(0, targetIdx));
          triggerBackgroundGroupSync(targetBot, Math.max(0, targetIdx), false);
        }

        const store = ensureBotChatMap(effectiveKey);
        const chats = Array.from(store.values())
          .sort((a, b) => b.lastTime - a.lastTime)
          .map((c) => {
            if (!c.isGroup && (!c.peerPhone || !c.peerLid)) {
              const pDigits = c.peerPhone || normalizePhoneDigits(c.jid);
              const lNorm = c.peerLid || normalizeLid(c.jid);
              const prof =
                (pDigits ? state.identityByPhone.get(pDigits) : undefined) ||
                (lNorm ? state.identityByLid.get(lNorm) : undefined);
              if (prof) {
                if (!c.peerPhone && prof.phone) c.peerPhone = prof.phone;
                if (!c.peerLid && prof.lid) c.peerLid = prof.lid;
                if (prof.name && (c.name.startsWith("+") || c.name.startsWith("LID ") || isSameAsBot(targetBot, "", "", c.name))) {
                  c.name = prof.name;
                }
              }
            }
            const cachedAva = c.avatarUrl || state.avatarCache.get(`${effectiveKey}:${c.jid}`) || "";
            if (!state.avatarCache.has(`${effectiveKey}:${c.jid}`)) {
              enqueueAvatarLookup(effectiveKey, c.jid);
            }
            return {
              jid: c.jid,
              name: c.name,
              isGroup: c.isGroup,
              peerPhone: c.peerPhone || "",
              peerLid: c.peerLid || "",
              unread: c.unread,
              lastTime: c.lastTime,
              lastPreview: c.lastPreview,
              avatarUrl: cachedAva,
            };
          });

        const contactsMap = ensureBotContactsMap(effectiveKey);
        const contacts = Array.from(contactsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

        sendJson(res, 200, { botKey: effectiveKey, chats, contacts });
        return;
      }

      if (pathname === "/api/wa-sync" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        state.botGroupSynced.delete(botKey);
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
        if (targetIdx >= 0) {
          triggerBackgroundGroupSync(allBots[targetIdx], targetIdx, true);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-messages" && req.method === "GET") {
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        const jid = parsedUrl.searchParams.get("jid") || "";
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : allBots[0];

        const store = ensureBotChatMap(botKey);
        const chat = store.get(jid);
        if (chat) {
          chat.unread = 0;

          if (!chat.isGroup && targetBot && (!chat.peerPhone || !chat.peerLid)) {
            const resolved = await resolvePeerIdentity(targetBot, chat.jid, chat.peerLid || chat.peerPhone, undefined, true);
            if (resolved.phone && !chat.peerPhone) chat.peerPhone = resolved.phone;
            if (resolved.lid && !chat.peerLid) chat.peerLid = resolved.lid;
            if (resolved.name && (chat.name.startsWith("+") || chat.name.startsWith("LID ") || isSameAsBot(targetBot, "", "", chat.name))) {
              chat.name = resolved.name;
            }
          }

          if (chat.isGroup && targetBot && (!chat.members || !chat.members.length)) {
            try {
              const cachedMeta = GROUP_METADATA_CACHE?.get?.(chat.jid);
              if (cachedMeta) {
                ingestGroupMetadata(targetBot, botKey, chat.jid, cachedMeta);
              } else if (typeof targetBot.groupMetadata === "function") {
                const freshMeta = await Promise.race([
                  targetBot.groupMetadata(chat.jid),
                  new Promise<null>((r) => setTimeout(() => r(null), 2000)),
                ]);
                if (freshMeta) ingestGroupMetadata(targetBot, botKey, chat.jid, freshMeta);
              }
            } catch {}
          }

          const sanitizedMessages = chat.messages.map((m) => ({
            id: m.id,
            senderJid: m.senderJid,
            senderPhone: m.senderPhone,
            senderLid: m.senderLid,
            pushName: m.pushName,
            text: m.text,
            time: m.time,
            timestamp: m.timestamp,
            fromMe: m.fromMe,
            isViewOnce: m.isViewOnce,
            mediaType: m.mediaType,
            mediaMime: m.mediaMime,
            hasMedia: m.hasMedia,
            mediaReady: state.mediaStore.has(m.id),
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
              peerPhone: chat.peerPhone || "",
              peerLid: chat.peerLid || "",
              avatarUrl: chat.avatarUrl || state.avatarCache.get(`${botKey}:${chat.jid}`) || "",
              statusText: chat.statusText || "",
              members: chat.members || [],
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
          const allBots = getAllBotSockets();
          const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
          const targetBot = targetIdx >= 0 ? allBots[targetIdx] : allBots[0];
          const store = ensureBotChatMap(botKey);
          const isGroup = jid.endsWith("@g.us");
          const resolved = !isGroup && targetBot
            ? await resolvePeerIdentity(targetBot, jid, body.lid || body.phone, body.name, false)
            : { phone: normalizePhoneDigits(body.phone || jid), lid: normalizeLid(body.lid || jid), name: String(body.name || "") };

          const { canonicalJid, session } = findConsolidatedSession(store, jid, resolved.phone, resolved.lid);
          if (!session) {
            store.set(canonicalJid, {
              jid: canonicalJid,
              name: resolved.name || (isGroup ? `Grupo ${cleanDigits(jid)}` : resolved.phone ? `+${resolved.phone}` : resolved.lid || `+${cleanDigits(jid)}`),
              isGroup,
              peerPhone: resolved.phone,
              peerLid: resolved.lid,
              unread: 0,
              lastTime: Date.now(),
              lastPreview: "Chat abierto desde el panel",
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
        const chat = ensureBotChatMap(botKey).get(jid);
        if (chat) {
          chat.messages = [];
          chat.lastPreview = "Historial vaciado";
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

        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : null;
        if (!targetBot || !jid || !text) {
          sendJson(res, 400, { ok: false, error: "Subbot o datos inválidos" });
          return;
        }

        const chat = ensureBotChatMap(botKey).get(jid);
        const quotedObj = quotedId ? chat?.messages.find((x) => x.id === quotedId) : undefined;
        const mentionMatches = text.match(/@(\d{7,15})/g) || [];
        const mentions = mentionMatches.map((m) => `${m.slice(1)}@s.whatsapp.net`);

        const origSend = state.originalSenders.get(targetBot) || targetBot.sendMessage.bind(targetBot);
        const sent = await origSend(
          jid,
          { text, ...(mentions.length ? { mentions } : {}) },
          quotedObj?.rawMessage ? { quoted: quotedObj.rawMessage } : undefined
        );

        const botInfo = getBotInfo(targetBot, targetIdx);
        recordChatMessage(targetBot, botKey, jid, {
          id: sent?.key?.id || randomBytes(6).toString("hex"),
          senderJid: botInfo.jid,
          senderPhone: botInfo.key,
          senderLid: botInfo.lid,
          pushName: botInfo.name,
          text,
          fromMe: true,
          peerPhone: chat?.peerPhone,
          peerLid: chat?.peerLid,
          timestamp: Date.now(),
          quotedId: quotedObj?.id || "",
          quotedSender: quotedObj?.senderPhone ? `+${quotedObj.senderPhone}` : quotedObj?.pushName || "",
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
        const viewOnce = Boolean(body.viewOnce);
        const quotedId = String(body.quotedId || "");

        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : null;
        if (!targetBot || !jid) {
          sendJson(res, 404, { ok: false, error: "Subbot inválido" });
          return;
        }

        const buf = body.base64 ? Buffer.from(String(body.base64), "base64") : null;
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
          payload = { audio: buf, mimetype: mimeType, ptt: isPtt, viewOnce };
          mediaKind = "audio";
        } else if (mimeType.startsWith("image/")) {
          payload = { image: buf, caption, mimetype: mimeType, viewOnce };
          mediaKind = "image";
        } else if (mimeType.startsWith("video/")) {
          payload = { video: buf, caption, mimetype: mimeType, viewOnce };
          mediaKind = "video";
        } else {
          payload = { document: buf, fileName, mimetype: mimeType, caption };
          mediaKind = "document";
        }

        const sent = await origSend(jid, payload, sendOpts);
        const msgId = sent?.key?.id || randomBytes(6).toString("hex");
        saveMediaToStore(msgId, mediaKind === "sticker" ? "image/webp" : mimeType, buf);

        const botInfo = getBotInfo(targetBot, targetIdx);
        recordChatMessage(targetBot, botKey, jid, {
          id: msgId,
          senderJid: botInfo.jid,
          senderPhone: botInfo.key,
          senderLid: botInfo.lid,
          pushName: botInfo.name,
          text: caption || (mediaKind === "audio" ? "🎤 Nota de voz" : ""),
          fromMe: true,
          isViewOnce: viewOnce,
          peerPhone: chat?.peerPhone,
          peerLid: chat?.peerLid,
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

      if (pathname === "/api/wa-troll" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        const type = String(body.type || "");

        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : null;
        if (!targetBot || !jid) {
          sendJson(res, 404, { ok: false, error: "Subbot no disponible" });
          return;
        }

        const origSend = state.originalSenders.get(targetBot) || targetBot.sendMessage.bind(targetBot);
        const botInfo = getBotInfo(targetBot, targetIdx);
        const chat = ensureBotChatMap(botKey).get(jid);

        if (type === "fake-quote") {
          const rawSender = String(body.fakeSender || "").trim();
          const fakeJid = rawSender.includes("@")
            ? rawSender
            : `${cleanDigits(rawSender) || "573000000000"}@s.whatsapp.net`;
          const fakeQuotedText = String(body.fakeQuotedText || "Hola");
          const replyText = String(body.replyText || "👀");

          const fakeMsgObj = {
            key: {
              remoteJid: jid,
              fromMe: false,
              id: `FAKE_${randomBytes(5).toString("hex").toUpperCase()}`,
              ...(jid.endsWith("@g.us") ? { participant: fakeJid } : {}),
            },
            message: {
              conversation: fakeQuotedText,
            },
          };

          const sent = await origSend(
            jid,
            { text: replyText, mentions: [fakeJid] },
            { quoted: fakeMsgObj }
          );

          recordChatMessage(targetBot, botKey, jid, {
            id: sent?.key?.id || randomBytes(6).toString("hex"),
            senderJid: botInfo.jid,
            senderPhone: botInfo.key,
            senderLid: botInfo.lid,
            pushName: botInfo.name,
            text: replyText,
            fromMe: true,
            quotedSender: `+${cleanDigits(fakeJid)}`,
            quotedText: fakeQuotedText,
            timestamp: Date.now(),
          });

          sendJson(res, 200, { ok: true });
          return;
        }

        if (type === "ghost-tag") {
          const text = String(body.text || "⚡");
          let mentions: string[] = [];
          if (jid.endsWith("@g.us")) {
            if (chat?.members?.length) {
              mentions = chat.members.map((m) => m.jid);
            } else {
              try {
                const meta = await targetBot.groupMetadata(jid);
                mentions = (meta?.participants || []).map((p: any) => p.id || p.lid).filter(Boolean);
              } catch {}
            }
          } else {
            mentions = [jid];
          }

          const sent = await origSend(jid, { text, mentions });
          recordChatMessage(targetBot, botKey, jid, {
            id: sent?.key?.id || randomBytes(6).toString("hex"),
            senderJid: botInfo.jid,
            senderPhone: botInfo.key,
            senderLid: botInfo.lid,
            pushName: botInfo.name,
            text: `${text} [👻 HiddenTag: ${mentions.length}]`,
            fromMe: true,
            timestamp: Date.now(),
          });
          sendJson(res, 200, { ok: true });
          return;
        }

        if (type === "call-bomb") {
          const count = Math.min(15, Math.max(1, Number(body.count || 3)));
          const isVideo = Boolean(body.isVideo);

          for (let i = 0; i < count; i++) {
            const callId = randomBytes(8).toString("hex").toUpperCase();
            try {
              if (typeof targetBot.query === "function") {
                await targetBot
                  .query({
                    tag: "call",
                    attrs: { to: jid, id: callId },
                    content: [
                      {
                        tag: "offer",
                        attrs: {
                          "call-id": callId,
                          "call-creator": botInfo.jid || `${botKey}@s.whatsapp.net`,
                        },
                        content: isVideo
                          ? [{ tag: "video", attrs: {} }]
                          : [{ tag: "audio", attrs: { enc: "opus", rate: "16000" } }],
                      },
                    ],
                  })
                  .catch(() => {});
              }
            } catch {}
            await new Promise((r) => setTimeout(r, 350));
          }

          recordChatMessage(targetBot, botKey, jid, {
            id: `troll_call_${Date.now()}`,
            senderJid: botInfo.jid,
            senderPhone: botInfo.key,
            senderLid: botInfo.lid,
            pushName: botInfo.name,
            text: `📲 [Troll] ${count}x Timbrado de ${isVideo ? "Videollamada" : "Voz"} enviado`,
            fromMe: true,
            timestamp: Date.now(),
          });
          sendJson(res, 200, { ok: true });
          return;
        }

        if (type === "fake-loc") {
          const degreesLatitude = Number(body.lat || 37.2431);
          const degreesLongitude = Number(body.lng || -115.793);
          const name = String(body.name || "Ubicación Clasificada");
          const sent = await origSend(jid, {
            location: { degreesLatitude, degreesLongitude, name, address: name },
          });
          recordChatMessage(targetBot, botKey, jid, {
            id: sent?.key?.id || randomBytes(6).toString("hex"),
            senderJid: botInfo.jid,
            senderPhone: botInfo.key,
            senderLid: botInfo.lid,
            pushName: botInfo.name,
            text: `📍 Ubicación Falsa: ${name} (${degreesLatitude}, ${degreesLongitude})`,
            fromMe: true,
            timestamp: Date.now(),
          });
          sendJson(res, 200, { ok: true });
          return;
        }

        if (type === "fake-vcard") {
          const displayName = String(body.vcardName || "Soporte Oficial WhatsApp");
          const phone = cleanDigits(body.vcardPhone || "16505434800");
          const vcard = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            `FN:${displayName}`,
            `ORG:Meta Platforms Inc.;`,
            `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}`,
            "END:VCARD",
          ].join("\n");

          const sent = await origSend(jid, {
            contacts: { displayName, contacts: [{ vcard }] },
          });
          recordChatMessage(targetBot, botKey, jid, {
            id: sent?.key?.id || randomBytes(6).toString("hex"),
            senderJid: botInfo.jid,
            senderPhone: botInfo.key,
            senderLid: botInfo.lid,
            pushName: botInfo.name,
            text: `🪪 vCard Falsa: ${displayName} (+${phone})`,
            fromMe: true,
            timestamp: Date.now(),
          });
          sendJson(res, 200, { ok: true });
          return;
        }

        if (type === "react-rain") {
          const targetMsg = chat?.messages.find((x) => x.id === body.msgId) || chat?.messages[chat.messages.length - 1];
          if (targetMsg?.rawKey) {
            const rainEmojis = ["🔥", "💀", "😂", "⚡", "🤡", "💣", "👑"];
            (async () => {
              for (const em of rainEmojis) {
                try {
                  await origSend(jid, { react: { text: em, key: targetMsg.rawKey } });
                  if (!targetMsg.reactions) targetMsg.reactions = {};
                  targetMsg.reactions[botKey] = em;
                  broadcastSse("reaction", { botKey, jid, msgId: targetMsg.id, reactions: targetMsg.reactions });
                } catch {}
                await new Promise((r) => setTimeout(r, 450));
              }
            })();
          }
          sendJson(res, 200, { ok: true });
          return;
        }

        if (type === "presence-loop-composing" || type === "presence-loop-recording") {
          const pMode = type.endsWith("recording") ? "recording" : "composing";
          const loopKey = `${botKey}:${jid}`;
          if (state.presenceLoops.has(loopKey)) {
            clearInterval(state.presenceLoops.get(loopKey)!);
            state.presenceLoops.delete(loopKey);
          }
          let ticks = 0;
          const timer = setInterval(() => {
            ticks++;
            if (ticks > 15 || typeof targetBot.sendPresenceUpdate !== "function") {
              clearInterval(timer);
              state.presenceLoops.delete(loopKey);
              return;
            }
            targetBot.sendPresenceUpdate(pMode, jid).catch(() => {});
          }, 4000);
          targetBot.sendPresenceUpdate?.(pMode, jid).catch(() => {});
          state.presenceLoops.set(loopKey, timer);
          sendJson(res, 200, { ok: true });
          return;
        }

        sendJson(res, 400, { ok: false, error: "Troll desconocido" });
        return;
      }

      if (pathname === "/api/wa-action" && req.method === "POST") {
        const body = await readJsonBody(req);
        const action = String(body.action || "");
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        const msgId = String(body.msgId || "");

        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
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
          const blockTarget = chat?.peerPhone ? `${chat.peerPhone}@s.whatsapp.net` : jid;
          await targetBot.updateBlockStatus(blockTarget, action);
          sendJson(res, 200, { ok: true });
          return;
        }

        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/thumb" && req.method === "GET") {
        const msgId = parsedUrl.searchParams.get("id") || "";
        const thumb = state.thumbStore.get(msgId);
        if (!thumb) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": thumb.length,
          "Cache-Control": "public, max-age=3600",
        });
        res.end(thumb);
        return;
      }

      if (pathname === "/api/media" && req.method === "GET") {
        const msgId = parsedUrl.searchParams.get("id") || "";
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        let item = state.mediaStore.get(msgId) || null;

        if (!item) {
          const lookup = state.msgLookup.get(msgId);
          if (lookup && lookup.msg.mediaType) {
            const allBots = getAllBotSockets();
            const targetBot =
              allBots.find((b, i) => getBotInfo(b, i).key === (botKey || lookup.botKey)) || allBots[0];
            item = await downloadMediaBuffer(
              targetBot,
              lookup.msg.rawMessage,
              msgId,
              lookup.msg.mediaType,
              lookup.msg.mediaMime || "application/octet-stream",
              lookup.msg.mediaNode
            );
          }
        }

        if (!item && state.thumbStore.has(msgId)) {
          const fallbackThumb = state.thumbStore.get(msgId)!;
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Content-Length": fallbackThumb.length,
            "Cache-Control": "no-store",
          });
          res.end(fallbackThumb);
          return;
        }

        if (!item || !item.buffer.length) {
          res.writeHead(404, { "Cache-Control": "no-store" });
          res.end();
          return;
        }

        const total = item.buffer.length;
        const mime = item.mime || "application/octet-stream";
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10) || 0;
          const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
          const safeEnd = Math.min(end, total - 1);
          const chunkSize = safeEnd - start + 1;
          const sliced = item.buffer.subarray(start, safeEnd + 1);

          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${safeEnd}/${total}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize,
            "Content-Type": mime,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600",
          });
          res.end(sliced);
          return;
        }

        res.writeHead(200, {
          "Content-Type": mime,
          "Content-Length": total,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(item.buffer);
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
  name: ["checkweb", "webpanel", "panelweb", "dashboard", "waweb"],
  category: "group",
  description: "Inicia el cliente WhatsApp Web Multi-Subbot en tiempo real con resolución de LID/Números, Contactos y Suite Troll.",
  groupOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, db, msg, groupMeta, sock, from, sender } = ctx;

    hookSockets(sock);

    const rawInput = sender || msg.key?.participant || from;
    const server = rawInput.split("@")[1] || "desconocido";
    const cleanInputId = cleanDigits(rawInput);

    let resolvedJid: string | null = null;
    let resolvedLid: string | null = null;

    if (server === "s.whatsapp.net") {
      resolvedJid = `${cleanInputId}@s.whatsapp.net`;
    } else if (server === "lid") {
      resolvedLid = `${cleanInputId}@lid`;
    }

    if (groupMeta?.participants) {
      const foundInGroup = groupMeta.participants.find((p: any) => {
        const pLid = cleanDigits(p.lid);
        const pId = cleanDigits(p.id);
        const pPhone = cleanDigits(p.phoneNumber);
        return pLid === cleanInputId || pId === cleanInputId || (pPhone && pPhone === cleanInputId);
      }) as any;

      if (foundInGroup) {
        if (!resolvedJid) {
          if (foundInGroup.id?.endsWith("@s.whatsapp.net")) {
            resolvedJid = foundInGroup.id;
          } else if (foundInGroup.phoneNumber) {
            const num = cleanDigits(foundInGroup.phoneNumber);
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
          const cleanPn = cleanDigits(pn);
          if (cleanPn) resolvedJid = `${cleanPn}@s.whatsapp.net`;
        }
      } catch {}
    }

    const dbAny = db as any;
    if (dbAny && typeof dbAny.getUser === "function" && !resolvedJid) {
      try {
        const userRec = (resolvedLid && dbAny.getUser(resolvedLid)) || dbAny.getUser(rawInput);
        if (userRec?.phone_number) {
          resolvedJid = `${cleanDigits(userRec.phone_number)}@s.whatsapp.net`;
        } else if (userRec?.jid?.endsWith("@s.whatsapp.net")) {
          resolvedJid = userRec.jid;
        }
      } catch {}
    }

    const realNumber = resolvedJid ? cleanDigits(resolvedJid) : cleanInputId;

    const isAuthorizedOwner =
      realNumber === "573118353868" ||
      cleanInputId === "573118353868" ||
      Boolean((ctx as any).isOwner) ||
      Boolean(msg.key?.fromMe) ||
      Boolean(resolvedJid && dbAny?.hasRole?.(resolvedJid, "owner")) ||
      Boolean(dbAny?.hasRole?.(sender, "owner"));

    if (!isAuthorizedOwner) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ *Acceso denegado:* Este cliente WhatsApp Web es exclusivo para el propietario.");
    }

    if (resolvedJid) state.ownerJid = resolvedJid;

    await react("💬").catch(() => undefined);

    rotateCredentials();

    const port = await ensureWebServerRunning();
    const [tunnelBase, publicIp] = await Promise.all([
      startPublicTunnel(port),
      fetchPublicIp(),
    ]);

    ensureTunnelWatchdog(port);

    const baseHost = tunnelBase || `http://${publicIp}:${port}`;
    const magicLink = `${baseHost}/?token=${state.token}`;

    const panelMessage = [
      `💬 *${fytBold("AURA WHATSAPP WEB • MULTI-SUBBOT")}* 💬`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Usuario Temporal:* \`${state.tempUser}\``,
      `🔑 *Clave / OTP:* \`${state.tempPass}\``,
      `🛡️ *Watchdog Túnel:* \`Activo (Auto-Reconnect)\``,
      `🎭 *Suite Troll & ViewOnce:* \`Habilitada\``,
      ``,
      `⚡ *Acceso Directo (1 Clic):*`,
      `${magicLink}`,
    ].join("\n");

    const dmTarget = resolvedJid || sender;
    const origSend = state.originalSenders.get(sock) || sock.sendMessage.bind(sock);
    await origSend(dmTarget, { text: panelMessage }, { quoted: msg as any }).catch(() => {});

    if (from.endsWith("@g.us")) {
      await reply("💬 *WhatsApp Web Pro listo.* El enlace directo fue enviado a tu chat privado.");
    }

    await react("✅").catch(() => undefined);
  },
};
