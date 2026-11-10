import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import { getActivePremBots } from "../../connection/premBotManager.ts";
import { GROUP_METADATA_CACHE } from "../../handler.ts";
import {
  downloadMediaMessage,
  extractMessageContent,
  jidNormalizedUser,
} from "baileys";
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
  statusText?: string;
  members?: GroupMemberItem[];
  messages: ChatMessageItem[];
}

interface ContactEntry {
  jid: string;
  phone: string;
  lid: string;
  name: string;
}

interface MediaBufferItem {
  mime: string;
  buffer: Buffer;
}

interface AnonimusState {
  server: http.Server | null;
  port: number;
  burnKey: string;
  isBurned: boolean;
  activeSessionToken: string | null;
  otpCode: string;
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
  botSynced: Set<string>;
  identityByPhone: Map<string, IdentityProfile>;
  identityByLid: Map<string, IdentityProfile>;
  mediaStore: Map<string, MediaBufferItem>;
  thumbStore: Map<string, Buffer>;
  msgLookup: Map<string, { botKey: string; msg: ChatMessageItem }>;
  ownerJid: string;
  lastSock: any;
}

const gState = globalThis as unknown as { __auraAnonimusSuite?: AnonimusState };

if (!gState.__auraAnonimusSuite) {
  gState.__auraAnonimusSuite = {
    server: null,
    port: 0,
    burnKey: randomBytes(16).toString("hex"),
    isBurned: false,
    activeSessionToken: null,
    otpCode: String(Math.floor(100000 + Math.random() * 900000)),
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
    botSynced: new Set(),
    identityByPhone: new Map(),
    identityByLid: new Map(),
    mediaStore: new Map(),
    thumbStore: new Map(),
    msgLookup: new Map(),
    ownerJid: "573118353868@s.whatsapp.net",
    lastSock: null,
  };
}

const state = gState.__auraAnonimusSuite!;

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
  const normId = rawId ? jidNormalizedUser(rawId) : "";
  const key = cleanDigits(normId) || `bot_${fallbackIndex}`;
  const jid = key.startsWith("bot_") ? "" : `${key}@s.whatsapp.net`;
  const lid = normalizeLid(rawLid);
  const name = String(
    botSock?.user?.name ||
      botSock?.authState?.creds?.me?.name ||
      (fallbackIndex === 0 ? "MainBot" : `SubBot-${fallbackIndex}`)
  ).trim();
  return { key, jid, lid, name };
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
    if (typeof getActiveSubBots === "function") rawList.push(...(getActiveSubBots() || []));
  } catch {}
  try {
    if (typeof getActivePremBots === "function") rawList.push(...(getActivePremBots() || []));
  } catch {}

  const unique: any[] = [];
  const seenKeys = new Set<string>();

  for (const item of rawList) {
    const realSock = item?.sock ?? item;
    if (!realSock || typeof realSock.sendMessage !== "function" || (realSock as any).isClosed) continue;
    state.knownSockets.add(realSock);
    const info = getBotInfo(realSock, unique.length);
    if (seenKeys.has(info.key)) continue;
    seenKeys.add(info.key);
    unique.push(realSock);
  }

  return unique;
}

function isSameAsBot(botSock: any, phone: string, lid: string, name?: string): boolean {
  const info = getBotInfo(botSock);
  if (phone && info.key && phone === info.key) return true;
  if (lid && info.lid && lid === info.lid) return true;
  if (name && info.name && name.trim().toLowerCase() === info.name.toLowerCase()) return true;
  return false;
}

function ensureBotChatMap(botKey: string): Map<string, ChatSessionItem> {
  if (!state.botChatStores.has(botKey)) state.botChatStores.set(botKey, new Map());
  return state.botChatStores.get(botKey)!;
}

function ensureBotContactsMap(botKey: string): Map<string, ContactEntry> {
  if (!state.botContacts.has(botKey)) state.botContacts.set(botKey, new Map());
  return state.botContacts.get(botKey)!;
}

function registerIdentity(
  phoneInput?: unknown,
  lidInput?: unknown,
  nameInput?: unknown,
  botSock?: any
): IdentityProfile {
  let phone = normalizePhoneDigits(phoneInput);
  let lid = normalizeLid(lidInput);

  if (botSock && isSameAsBot(botSock, phone, lid)) {
    phone = "";
    lid = "";
  }

  const rawName = String(nameInput || "").trim();
  const validName =
    rawName &&
    !rawName.startsWith("+") &&
    !rawName.startsWith("Grupo ") &&
    !rawName.startsWith("LID ") &&
    (!botSock || !isSameAsBot(botSock, "", "", rawName))
      ? rawName
      : "";

  let profile: IdentityProfile | undefined =
    (phone ? state.identityByPhone.get(phone) : undefined) ||
    (lid ? state.identityByLid.get(lid) : undefined);

  if (!profile) {
    profile = { phone: phone || "", lid: lid || "", name: validName || "" };
  } else {
    if (phone && !profile.phone) profile.phone = phone;
    if (lid && !profile.lid) profile.lid = lid;
    if (validName && (!profile.name || profile.name.length < 2)) profile.name = validName;
  }

  if (profile.phone) state.identityByPhone.set(profile.phone, profile);
  if (profile.lid) state.identityByLid.set(profile.lid, profile);

  if (botSock && (profile.phone || profile.lid)) {
    const botKey = getBotInfo(botSock).key;
    const cMap = ensureBotContactsMap(botKey);
    const cKey = profile.phone ? `${profile.phone}@s.whatsapp.net` : profile.lid;
    if (cKey) {
      const prev = cMap.get(cKey);
      cMap.set(cKey, {
        jid: cKey,
        phone: profile.phone || prev?.phone || "",
        lid: profile.lid || prev?.lid || "",
        name:
          profile.name ||
          prev?.name ||
          (profile.phone ? `+${profile.phone}` : `LID ${cleanDigits(profile.lid)}`),
      });
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
  if (!rawJid || rawJid.endsWith("@g.us")) return { phone: "", lid: "", name: "" };

  let phone = normalizePhoneDigits(rawJid) || normalizePhoneDigits(altJid);
  let lid = normalizeLid(rawJid) || normalizeLid(altJid);

  if (isSameAsBot(botSock, phone, lid)) {
    phone = "";
    lid = "";
  }

  const safeName =
    !fromMe && pushNameHint && !isSameAsBot(botSock, "", "", String(pushNameHint))
      ? String(pushNameHint).trim()
      : "";

  const memHit =
    (phone ? state.identityByPhone.get(phone) : undefined) ||
    (lid ? state.identityByLid.get(lid) : undefined);

  if (memHit) {
    if (!phone && memHit.phone) phone = memHit.phone;
    if (!lid && memHit.lid) lid = memHit.lid;
  }

  if (lid && !phone) {
    for (const s of getAllBotSockets(botSock)) {
      try {
        const mappedPn = await s?.signalRepository?.lidMapping?.getPNForLID?.(lid);
        if (mappedPn) {
          const p = normalizePhoneDigits(mappedPn);
          if (p && !isSameAsBot(botSock, p, "")) {
            phone = p;
            break;
          }
        }
      } catch {}
    }
  }

  if (phone && !lid) {
    for (const s of getAllBotSockets(botSock)) {
      try {
        const mappedLid = await s?.signalRepository?.lidMapping?.getLIDForPN?.(`${phone}@s.whatsapp.net`);
        if (mappedLid) {
          const l = normalizeLid(mappedLid);
          if (l && !isSameAsBot(botSock, "", l)) {
            lid = l;
            break;
          }
        }
      } catch {}
    }
  }

  const activeDb = (globalThis as any).db;
  if (activeDb && typeof activeDb.getUser === "function" && (!phone || !lid || !safeName)) {
    try {
      const uRec =
        (phone && activeDb.getUser(`${phone}@s.whatsapp.net`)) ||
        (lid && activeDb.getUser(lid)) ||
        activeDb.getUser(rawJid);
      if (uRec) {
        const dbPhone = normalizePhoneDigits(uRec.phone_number || uRec.jid);
        const dbLid = normalizeLid(uRec.lid);
        if (!phone && dbPhone && !isSameAsBot(botSock, dbPhone, "")) phone = dbPhone;
        if (!lid && dbLid && !isSameAsBot(botSock, "", dbLid)) lid = dbLid;
        const dbName = uRec.pushName || uRec.username || uRec.name;
        if (!safeName && dbName) {
          return registerIdentity(phone, lid, dbName, botSock);
        }
      }
    } catch {}
  }

  return registerIdentity(phone, lid, safeName, botSock);
}

function generateNewBurnSession() {
  state.burnKey = randomBytes(16).toString("hex");
  state.isBurned = false;
  state.activeSessionToken = null;
  state.otpCode = String(Math.floor(100000 + Math.random() * 900000));
}

function parseMsgContent(msgObj: any): {
  text: string;
  isViewOnce: boolean;
  mediaType: "image" | "sticker" | "video" | "audio" | "document" | null;
  mediaMime: string;
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
    thumbBuffer: null as Buffer | null,
    quotedId: "",
    quotedSender: "",
    quotedText: "",
  };
  if (!msgObj) return empty;

  const isVoWrapper = Boolean(
    msgObj.viewOnceMessage || msgObj.viewOnceMessageV2 || msgObj.viewOnceMessageV2Extension
  );
  const m = extractMessageContent(msgObj) || msgObj;
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
    const qm = extractMessageContent(ctxInfo.quotedMessage) || ctxInfo.quotedMessage;
    quotedText =
      qm?.conversation ||
      qm?.extendedTextMessage?.text ||
      qm?.imageMessage?.caption ||
      (qm?.imageMessage ? "📷 Imagen" : "") ||
      (qm?.stickerMessage ? "🏷️ Sticker" : "") ||
      (qm?.audioMessage ? "🎤 Audio" : "") ||
      (qm?.videoMessage ? "🎥 Video" : "") ||
      "[Mensaje citado]";
  }

  const isViewOnce = Boolean(
    isVoWrapper || m.imageMessage?.viewOnce || m.videoMessage?.viewOnce || m.audioMessage?.viewOnce
  );

  if (typeof m.conversation === "string" && m.conversation) {
    return { ...empty, text: m.conversation, isViewOnce, quotedId, quotedSender, quotedText };
  }
  if (typeof m.extendedTextMessage?.text === "string" && m.extendedTextMessage.text) {
    return { ...empty, text: m.extendedTextMessage.text, isViewOnce, quotedId, quotedSender, quotedText };
  }
  if (m.imageMessage) {
    const thumb = m.imageMessage.jpegThumbnail ? Buffer.from(m.imageMessage.jpegThumbnail) : null;
    return {
      text: m.imageMessage.caption || "",
      isViewOnce,
      mediaType: "image",
      mediaMime: m.imageMessage.mimetype || "image/jpeg",
      thumbBuffer: thumb,
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.stickerMessage) {
    return {
      ...empty,
      mediaType: "sticker",
      mediaMime: m.stickerMessage.mimetype || "image/webp",
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.videoMessage) {
    const thumb = m.videoMessage.jpegThumbnail ? Buffer.from(m.videoMessage.jpegThumbnail) : null;
    return {
      text: m.videoMessage.caption || "",
      isViewOnce,
      mediaType: "video",
      mediaMime: m.videoMessage.mimetype || "video/mp4",
      thumbBuffer: thumb,
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.audioMessage) {
    return {
      text: m.audioMessage.ptt ? "🎤 Nota de voz" : "🎵 Audio",
      isViewOnce,
      mediaType: "audio",
      mediaMime: m.audioMessage.mimetype || "audio/ogg; codecs=opus",
      thumbBuffer: null,
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.documentMessage) {
    return {
      text: `📄 ${m.documentMessage.fileName || "Documento"}`,
      isViewOnce,
      mediaType: "document",
      mediaMime: m.documentMessage.mimetype || "application/octet-stream",
      thumbBuffer: null,
      quotedId,
      quotedSender,
      quotedText,
    };
  }
  if (m.locationMessage || m.liveLocationMessage) {
    const loc = m.locationMessage || m.liveLocationMessage;
    return { ...empty, text: `📍 Ubicación: ${loc.name || ""} (${loc.degreesLatitude}, ${loc.degreesLongitude})` };
  }
  if (m.contactMessage) {
    return { ...empty, text: `👤 Contacto: ${m.contactMessage.displayName || ""}` };
  }
  return empty;
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

  let peerPhone = !isGroup
    ? msgData.peerPhone || (!msgData.fromMe ? msgData.senderPhone : "") || normalizePhoneDigits(remoteJid)
    : "";
  let peerLid = !isGroup
    ? msgData.peerLid || (!msgData.fromMe ? msgData.senderLid : "") || normalizeLid(remoteJid)
    : "";

  if (!isGroup && isSameAsBot(botSock, peerPhone, peerLid)) {
    peerPhone = normalizePhoneDigits(remoteJid);
    peerLid = normalizeLid(remoteJid);
  }

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

  if (!isGroup && peerIdentity) {
    if (!peerPhone && peerIdentity.phone) peerPhone = peerIdentity.phone;
    if (!peerLid && peerIdentity.lid) peerLid = peerIdentity.lid;
  }

  const resolvedPeerName = !isGroup
    ? peerIdentity?.name ||
      (!msgData.fromMe && msgData.pushName && !isSameAsBot(botSock, "", "", msgData.pushName)
        ? msgData.pushName
        : "") ||
      (peerPhone ? `+${peerPhone}` : peerLid ? `LID ${cleanDigits(peerLid)}` : `+${cleanRemote}`)
    : msgData.chatName || `Grupo ${cleanRemote}`;

  if (!session) {
    session = {
      jid: canonicalJid,
      name: String(resolvedPeerName || `+${cleanRemote}`),
      isGroup,
      peerPhone: peerPhone || "",
      peerLid: peerLid || "",
      unread: 0,
      lastTime: nowTs,
      lastPreview: String(previewLabel || "").slice(0, 75),
      messages: [],
    };
    store.set(canonicalJid, session);
  } else {
    if (peerPhone && !session.peerPhone) session.peerPhone = peerPhone;
    if (peerLid && !session.peerLid) session.peerLid = peerLid;
    if (!isGroup) {
      const currName = String(session.name || "");
      if (
        isSameAsBot(botSock, "", "", currName) ||
        ((currName.startsWith("+") || currName.startsWith("LID ")) &&
          resolvedPeerName &&
          !resolvedPeerName.startsWith("+") &&
          !resolvedPeerName.startsWith("LID "))
      ) {
        session.name = resolvedPeerName;
      }
    }
  }

  if (session.messages.some((x) => x.id === msgData.id)) return;

  session.lastTime = nowTs;
  session.lastPreview = String(previewLabel || "").slice(0, 75);
  if (!msgData.fromMe) session.unread = Math.min(999, (session.unread || 0) + 1);

  const item: ChatMessageItem = {
    id: msgData.id,
    senderJid: msgData.senderJid,
    senderPhone: msgData.senderPhone || "",
    senderLid: msgData.senderLid || "",
    pushName: String(msgData.pushName || ""),
    text: String(msgData.text || ""),
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
  };

  session.messages.push(item);
  state.msgLookup.set(item.id, { botKey, msg: item });
  if (state.msgLookup.size > 800) {
    const oldest = state.msgLookup.keys().next().value;
    if (oldest) state.msgLookup.delete(oldest);
  }
  if (session.messages.length > 150) {
    session.messages.splice(0, session.messages.length - 150);
  }
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
      jid: prof.phone ? `${prof.phone}@s.whatsapp.net` : prof.lid || pId,
      phone: prof.phone || pPhone,
      lid: prof.lid || pLid,
      name: prof.name || (pPhone ? `+${pPhone}` : pLid ? `LID ${cleanDigits(pLid)}` : "Miembro"),
      isAdmin: p?.admin === "admin" || p?.admin === "superadmin",
    });
  }

  const existing = store.get(jid);
  const subject = String(meta.subject || existing?.name || `Grupo ${cleanDigits(jid)}`);
  if (!existing) {
    store.set(jid, {
      jid,
      name: subject,
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
    existing.name = subject;
    if (meta.desc) existing.statusText = String(meta.desc).slice(0, 140);
    if (members.length) existing.members = members;
  }
}

async function syncAllBotsNow(mainSock?: any) {
  const sockets = getAllBotSockets(mainSock);

  await Promise.allSettled(
    sockets.map(async (botSock, idx) => {
      const info = getBotInfo(botSock, idx);
      const botKey = info.key;
      ensureBotChatMap(botKey);
      ensureBotContactsMap(botKey);

      if (GROUP_METADATA_CACHE && typeof GROUP_METADATA_CACHE.entries === "function") {
        for (const [gid, meta] of GROUP_METADATA_CACHE.entries()) {
          if (gid.endsWith("@g.us") && meta?.participants) {
            const hasBot = meta.participants.some((p: any) => {
              const pPhone = cleanDigits(p?.phoneNumber || p?.id);
              const pLid = normalizeLid(p?.lid || p?.id);
              return (info.key && pPhone === info.key) || (info.lid && pLid === info.lid);
            });
            if (hasBot) ingestGroupMetadata(botSock, botKey, gid, meta);
          }
        }
      }

      if (!state.botSynced.has(botKey) && typeof botSock.groupFetchAllParticipating === "function") {
        try {
          const groups = await Promise.race([
            botSock.groupFetchAllParticipating(),
            new Promise<null>((r) => setTimeout(() => r(null), 3500)),
          ]);
          if (groups && typeof groups === "object") {
            for (const [gid, meta] of Object.entries(groups)) {
              ingestGroupMetadata(botSock, botKey, gid, meta);
            }
            state.botSynced.add(botKey);
          }
        } catch {}
      }
    })
  );
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

      if (botSock.ev && typeof botSock.ev.on === "function") {
        botSock.ev.on("contacts.upsert", (contacts: any[]) => {
          if (!Array.isArray(contacts)) return;
          for (const c of contacts) {
            registerIdentity(c?.phoneNumber || c?.id, c?.lid || c?.id, c?.name || c?.notify, botSock);
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
              const emoji = reactObj.text || "";
              const reactor = cleanDigits(m.key?.participant || m.key?.remoteJid || "user");
              if (targetId) {
                const lookup = state.msgLookup.get(targetId);
                if (lookup) {
                  if (!lookup.msg.reactions) lookup.msg.reactions = {};
                  if (emoji) lookup.msg.reactions[reactor] = emoji;
                  else delete lookup.msg.reactions[reactor];
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
            const altJid = String(
              (m.key as any)?.remoteJidAlt ||
                (m.key as any)?.participantPn ||
                (m.key as any)?.senderPn ||
                ""
            );

            const senderProfile = fromMe
              ? { phone: currentInfo.key, lid: currentInfo.lid, name: currentInfo.name }
              : await resolvePeerIdentity(botSock, rawParticipant || remoteJid, altJid, m.pushName, false);

            const peerProfile = !isGroup
              ? fromMe
                ? await resolvePeerIdentity(botSock, remoteJid, altJid, undefined, true)
                : senderProfile
              : { phone: "", lid: "", name: "" };

            const senderPhone = senderProfile.phone || (!rawParticipant.endsWith("@lid") ? cleanDigits(rawParticipant) : "");
            const senderLid = senderProfile.lid || normalizeLid(rawParticipant);
            const pushName = fromMe
              ? currentInfo.name
              : senderProfile.name ||
                (!isSameAsBot(botSock, "", "", m.pushName) ? m.pushName : "") ||
                (senderPhone ? `+${senderPhone}` : `LID ${cleanDigits(senderLid)}`);

            const msgId = m.key?.id || randomBytes(6).toString("hex");
            const rawTs = typeof m.messageTimestamp === "number" ? m.messageTimestamp * 1000 : Date.now();

            const details = parseMsgContent(m.message);
            if (!details.text && !details.mediaType) continue;

            if (details.thumbBuffer) {
              state.thumbStore.set(msgId, details.thumbBuffer);
            }

            if (details.mediaType) {
              downloadMediaMessage(
                m,
                "buffer",
                {},
                { logger: undefined as any, reuploadRequest: botSock.updateMediaMessage }
              )
                .then((buf: any) => {
                  if (Buffer.isBuffer(buf) && buf.length > 0) {
                    state.mediaStore.set(msgId, { mime: details.mediaMime, buffer: buf });
                  }
                })
                .catch(() => {});
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
            });
          }
        });
      }

      if (typeof botSock.sendMessage === "function") {
        const origSend = botSock.sendMessage.bind(botSock);
        state.originalSenders.set(botSock, origSend);

        botSock.sendMessage = async (jid: string, content: any, options?: any) => {
          const currentInfo = getBotInfo(botSock, index);
          const res = await origSend(jid, content, options);

          try {
            const msgId = res?.key?.id || randomBytes(6).toString("hex");
            let mediaType: "image" | "sticker" | "video" | "audio" | "document" | null = null;
            let mediaMime = "";
            let textPreview = "";

            if (typeof content?.text === "string") textPreview = content.text;
            else if (content?.image) {
              mediaType = "image";
              mediaMime = content.mimetype || "image/jpeg";
              textPreview = content.caption || "";
              if (Buffer.isBuffer(content.image)) state.mediaStore.set(msgId, { mime: mediaMime, buffer: content.image });
            } else if (content?.sticker) {
              mediaType = "sticker";
              mediaMime = "image/webp";
              if (Buffer.isBuffer(content.sticker)) state.mediaStore.set(msgId, { mime: mediaMime, buffer: content.sticker });
            } else if (content?.video) {
              mediaType = "video";
              mediaMime = content.mimetype || "video/mp4";
              textPreview = content.caption || "";
              if (Buffer.isBuffer(content.video)) state.mediaStore.set(msgId, { mime: mediaMime, buffer: content.video });
            } else if (content?.audio) {
              mediaType = "audio";
              mediaMime = content.mimetype || "audio/ogg; codecs=opus";
              textPreview = content.ptt ? "🎤 Nota de voz" : "🎵 Audio";
              if (Buffer.isBuffer(content.audio)) state.mediaStore.set(msgId, { mime: mediaMime, buffer: content.audio });
            }

            if (textPreview || mediaType) {
              const peerProf = !jid.endsWith("@g.us")
                ? await resolvePeerIdentity(botSock, jid, undefined, undefined, true)
                : { phone: "", lid: "", name: "" };

              recordChatMessage(botSock, currentInfo.key, jid, {
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

function buildBotSnapshot(botKey?: string) {
  const allBots = getAllBotSockets();
  const bots = allBots.map((b, idx) => {
    const info = getBotInfo(b, idx);
    const store = ensureBotChatMap(info.key);
    let unreadTotal = 0;
    for (const c of store.values()) unreadTotal += c.unread || 0;
    return { key: info.key, name: info.name, lid: info.lid, unreadTotal };
  });

  const targetIdx = botKey ? allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey) : 0;
  const targetBot = targetIdx >= 0 ? allBots[targetIdx] : allBots[0];
  const effectiveKey = targetBot ? getBotInfo(targetBot, Math.max(0, targetIdx)).key : botKey || "";

  const store = ensureBotChatMap(effectiveKey);
  const chats = Array.from(store.values())
    .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0))
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
          if (
            prof.name &&
            (String(c.name || "").startsWith("+") ||
              String(c.name || "").startsWith("LID ") ||
              isSameAsBot(targetBot, "", "", c.name))
          ) {
            c.name = prof.name;
          }
        }
      }
      return {
        jid: String(c.jid || ""),
        name: String(c.name || c.jid || "Chat"),
        isGroup: Boolean(c.isGroup),
        peerPhone: String(c.peerPhone || ""),
        peerLid: String(c.peerLid || ""),
        unread: Number(c.unread || 0),
        lastTime: Number(c.lastTime || 0),
        lastPreview: String(c.lastPreview || ""),
      };
    });

  const contacts = Array.from(ensureBotContactsMap(effectiveKey).values())
    .map((c) => ({
      jid: String(c.jid || ""),
      phone: String(c.phone || ""),
      lid: String(c.lid || ""),
      name: String(c.name || c.phone || c.lid || "Contacto"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { bots, botKey: effectiveKey, chats, contacts };
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

function spawnTunnelProcess(port: number, cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (url: string | null) => {
      if (!resolved) {
        resolved = true;
        resolve(url);
      }
    };

    try {
      const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
      state.tunnelProcess = proc;

      const onData = (chunk: Buffer) => {
        const found = extractValidTunnelUrl(chunk.toString("utf8"));
        if (found) {
          state.tunnelUrl = found;
          finish(found);
        }
      };

      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", onData);
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

  const cfBin = [path.join(os.tmpdir(), "cloudflared"), "cloudflared"].find((b) =>
    b.startsWith("/") ? fs.existsSync(b) : true
  )!;
  const cf = await spawnTunnelProcess(port, cfBin, [
    "tunnel",
    "--url",
    `http://127.0.0.1:${port}`,
    "--no-autoupdate",
  ]);
  if (cf) return cf;

  const sshBase = [
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
    "-R",
    `80:127.0.0.1:${port}`,
  ];

  return (
    (await spawnTunnelProcess(port, "ssh", [...sshBase, "nokey@localhost.run"])) ||
    (await spawnTunnelProcess(port, "ssh", [...sshBase, "serveo.net"])) ||
    (await spawnTunnelProcess(port, "ssh", ["-p", "443", ...sshBase, "a.pinggy.io"]))
  );
}

function buildBurnedLockHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ANONIMUS // ENLACE QUEMADO</title>
<style>
  body { background:#05070a; color:#f8fafc; font-family:monospace; height:100dvh; margin:0; display:flex; align-items:center; justify-content:center; padding:20px; text-align:center; }
  .box { background:#0f141c; border:1.5px solid #ff2a54; border-radius:16px; padding:28px 22px; max-width:390px; box-shadow:0 0 35px rgba(255,42,84,0.25); }
  h2 { color:#ff2a54; margin:0 0 10px; font-size:18px; }
  p { color:#94a3b8; font-size:12.5px; line-height:1.5; margin:0; }
</style>
</head>
<body>
  <div class="box">
    <h2>🔥 ENLACE QUEMADO (1 SOLO USO)</h2>
    <p>Este acceso único ya fue consumido por la conexión propietaria activa. Ejecuta <b>.anonimus</b> en WhatsApp si necesitas generar una llave nueva.</p>
  </div>
</body>
</html>`;
}

function buildAnonimusWebHtml(burnKey: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>ANONIMUS // WA-WEB</title>
<style>
  :root {
    --bg: #0b141a;
    --panel: #111b21;
    --head: #202c33;
    --border: #222e35;
    --green: #00a884;
    --out: #005c4b;
    --in: #202c33;
    --cyan: #00e5ff;
    --troll: #b388ff;
    --danger: #ff2a54;
    --text: #e9edef;
    --muted: #8696a0;
  }
  * { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
  body { background:#060a0d; color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; height:100dvh; display:flex; flex-direction:column; overflow:hidden; }
  .topbar { background:var(--panel); border-bottom:1px solid var(--border); padding:8px 10px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; z-index:50; }
  .brand { font-size:13px; font-weight:900; color:var(--green); letter-spacing:0.5px; display:flex; align-items:center; gap:6px; }
  .bot-bar { display:flex; align-items:center; gap:6px; flex:1; min-width:210px; }
  select, input { background:#202c33; color:var(--text); border:1px solid #2a3942; border-radius:8px; padding:8px 10px; font-size:13px; outline:none; width:100%; }
  #waBotSelector { font-weight:800; color:#00e5ff; min-width:150px; }
  .btn { background:var(--green); color:#06100e; border:none; padding:8px 11px; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:4px; white-space:nowrap; }
  .btn-ghost { background:#2a3942; color:var(--text); }
  .btn-troll { background:linear-gradient(135deg,#7c4dff,#ff2a54); color:#fff; }
  .btn-danger { background:var(--danger); color:#fff; }

  .wa-layout { flex:1; display:grid; grid-template-columns:360px 1fr; overflow:hidden; position:relative; background:var(--bg); }
  .wa-sidebar { background:var(--panel); border-right:1px solid var(--border); display:flex; flex-direction:column; height:100%; overflow:hidden; }
  .side-top { padding:8px 10px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:7px; }
  .chips { display:flex; gap:5px; overflow-x:auto; scrollbar-width:none; }
  .chips::-webkit-scrollbar { display:none; }
  .chip { background:#202c33; color:var(--muted); border:1px solid #2a3942; padding:5px 10px; border-radius:999px; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap; }
  .chip.active { background:rgba(0,168,132,0.2); color:var(--green); border-color:var(--green); }

  .chat-list { flex:1; overflow-y:auto; }
  .chat-item { padding:10px 12px; border-bottom:1px solid rgba(134,150,160,0.1); cursor:pointer; display:flex; align-items:center; gap:10px; }
  .chat-item:hover, .chat-item.active { background:#202c33; }
  .ava { width:42px; height:42px; border-radius:50%; background:#008069; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; flex-shrink:0; }
  .chat-meta { flex:1; min-width:0; }
  .chat-row1 { display:flex; justify-content:space-between; align-items:baseline; gap:6px; }
  .chat-name { font-size:13.5px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .chat-time { font-size:10px; color:var(--muted); flex-shrink:0; }
  .tags-row { display:flex; gap:4px; flex-wrap:wrap; margin-top:2px; }
  .tag { font-size:10px; font-family:monospace; padding:1px 5px; border-radius:4px; background:rgba(0,229,255,0.12); color:var(--cyan); }
  .tag.lid { background:rgba(179,136,255,0.14); color:#d1c4e9; }
  .chat-row2 { display:flex; justify-content:space-between; align-items:center; gap:6px; margin-top:3px; }
  .chat-prev { font-size:12px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .unread { background:var(--green); color:#08120f; font-size:10px; font-weight:900; padding:2px 6px; border-radius:999px; }

  .wa-main { display:flex; flex-direction:column; height:100%; position:relative; overflow:hidden; background:var(--bg); }
  .chat-head { background:var(--head); padding:8px 12px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:58px; }
  .head-left { display:flex; align-items:center; gap:9px; min-width:0; flex:1; cursor:pointer; }
  .back-btn { display:none; background:#2a3942; color:#fff; border:none; padding:6px 10px; border-radius:8px; font-weight:800; cursor:pointer; }
  .head-info { min-width:0; flex:1; }
  .head-name { font-size:14px; font-weight:800; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .head-sub { font-size:11px; color:var(--cyan); font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
  .head-acts { display:flex; align-items:center; gap:5px; flex-shrink:0; }
  .ico-btn { background:#2a3942; color:var(--text); border:none; width:34px; height:34px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size:13px; }

  .msgs-box { flex:1; padding:12px 14px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; background:#0b141a; }
  .msg-row { display:flex; flex-direction:column; max-width:80%; position:relative; }
  .msg-row.in { align-self:flex-start; }
  .msg-row.out { align-self:flex-end; }
  .bubble { padding:7px 11px; border-radius:10px; font-size:13.5px; line-height:1.4; position:relative; word-wrap:break-word; white-space:pre-wrap; box-shadow:0 1px 2px rgba(0,0,0,0.35); }
  .msg-row.in .bubble { background:var(--in); border-top-left-radius:2px; }
  .msg-row.out .bubble { background:var(--out); border-top-right-radius:2px; }
  .sender-head { display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-bottom:4px; font-size:11px; font-weight:800; color:var(--cyan); cursor:pointer; }
  .s-badge { font-family:monospace; font-size:9.5px; background:rgba(0,0,0,0.35); color:#e2e8f0; padding:1px 5px; border-radius:4px; }
  .vo-pill { display:inline-block; background:rgba(255,42,84,0.2); color:#ff6b8b; border:1px solid #ff2a54; font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; margin-bottom:4px; }
  .q-box { background:rgba(0,0,0,0.28); border-left:3px solid var(--green); border-radius:6px; padding:4px 8px; margin-bottom:5px; font-size:11px; color:#cbd5e1; }
  .media-img { max-width:260px; width:100%; max-height:300px; border-radius:8px; object-fit:cover; display:block; margin-bottom:4px; cursor:pointer; }
  .media-stk { width:130px; height:130px; object-fit:contain; display:block; }
  .media-vid { max-width:260px; width:100%; border-radius:8px; display:block; margin-bottom:4px; }
  .media-aud { width:230px; max-width:100%; height:36px; margin:3px 0; }
  .b-meta { display:flex; justify-content:flex-end; gap:6px; font-size:10px; color:rgba(255,255,255,0.6); margin-top:3px; }
  .b-tools { display:flex; gap:6px; margin-top:3px; font-size:11px; opacity:0.75; }
  .b-tools span { cursor:pointer; }

  .reply-bar { display:none; background:#182229; border-top:1px solid var(--border); border-left:4px solid var(--green); padding:7px 12px; align-items:center; justify-content:space-between; font-size:12px; }
  .reply-bar.active { display:flex; }
  .composer { background:var(--head); padding:8px 10px; display:flex; gap:6px; align-items:center; border-top:1px solid var(--border); }
  .composer input[type="text"] { background:#2a3942; border:none; padding:10px 12px; border-radius:10px; flex:1; }
  .vo-btn.active { background:var(--danger); color:#fff; }

  .drawer { position:absolute; top:0; right:0; width:340px; max-width:100%; height:100%; background:var(--panel); border-left:1px solid var(--border); z-index:40; display:none; flex-direction:column; overflow-y:auto; padding:14px; gap:10px; box-shadow:-8px 0 25px rgba(0,0,0,0.6); }
  .drawer.open { display:flex; }
  .t-card { background:#182229; border:1px solid #263540; border-radius:10px; padding:10px; display:flex; flex-direction:column; gap:6px; }
  .t-card h5 { font-size:11.5px; color:var(--troll); text-transform:uppercase; }

  @media (max-width: 820px) {
    .wa-layout { grid-template-columns:1fr; }
    .wa-layout.chat-open .wa-sidebar { display:none; }
    .wa-layout:not(.chat-open) .wa-main { display:none; }
    .back-btn { display:inline-flex; }
    .msg-row { max-width:88%; }
  }
</style>
</head>
<body>
<div class="topbar">
  <div class="brand">🕵️‍♂️ ANONIMUS</div>
  <div class="bot-bar">
    <select id="waBotSelector" onchange="onSelectSubbot()"></select>
    <button class="btn" onclick="forceSyncBot()" title="Sincronizar Grupos">🔄</button>
    <button class="btn btn-ghost" onclick="startNewChatPrompt()" title="Nuevo Chat">➕</button>
  </div>
</div>

<div class="wa-layout" id="waLayout">
  <div class="wa-sidebar">
    <div class="side-top">
      <input type="text" id="waSearchInput" placeholder="Buscar nombre, +número o @lid..." oninput="renderSidebarList()">
      <div class="chips">
        <button class="chip active" onclick="setFilter('all', this)">💬 Todos</button>
        <button class="chip" onclick="setFilter('direct', this)">👤 Privados</button>
        <button class="chip" onclick="setFilter('groups', this)">👥 Grupos</button>
        <button class="chip" onclick="setFilter('contacts', this)">📒 Contactos</button>
      </div>
    </div>
    <div class="chat-list" id="waSidebarList"></div>
  </div>

  <div class="wa-main">
    <div class="chat-head">
      <div class="head-left" onclick="openDrawer('info')">
        <button class="back-btn" onclick="event.stopPropagation(); closeMobileChat()">⬅</button>
        <div class="ava" id="waActiveAva">?</div>
        <div class="head-info">
          <div class="head-name" id="waActiveName">Selecciona una conversación</div>
          <div class="head-sub" id="waActiveSub">1 Conexión Segura Activa (Enlace Quemado)</div>
        </div>
      </div>
      <div class="head-acts" id="waHeadActs" style="display:none;">
        <button class="btn btn-troll" onclick="openDrawer('troll')">🎭 Trolls</button>
        <button class="ico-btn" onclick="quickCall(false)" title="Llamar Voz">📞</button>
        <button class="ico-btn" onclick="openDrawer('info')" title="Ficha Número/LID">ℹ️</button>
      </div>
    </div>

    <div class="msgs-box" id="waMsgsBox"></div>

    <div class="reply-bar" id="waReplyBar">
      <div style="min-width:0; flex:1;">
        <div style="font-weight:800; color:var(--green);" id="waReplySender">Cita</div>
        <div style="color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="waReplyText"></div>
      </div>
      <button class="ico-btn" style="width:26px; height:26px;" onclick="cancelReply()">✖</button>
    </div>

    <form class="composer" onsubmit="sendWaMessage(event)">
      <button type="button" class="ico-btn" onclick="document.getElementById('waFileInp').click()" title="Adjuntar">📎</button>
      <button type="button" class="ico-btn vo-btn" id="voBtn" onclick="toggleVo()" title="Ver Una Vez (1x)">👁️</button>
      <input type="file" id="waFileInp" style="display:none" accept="image/*,video/*,audio/*,.webp,.pdf" onchange="uploadMedia(event)">
      <input type="text" id="waMsgInp" placeholder="Escribe un mensaje..." autocomplete="off">
      <button type="submit" class="btn">➤</button>
    </form>

    <div class="drawer" id="trollDrawer">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4 style="color:var(--troll);">🎭 Suite Troll & Spoof</h4>
        <button class="ico-btn" onclick="closeDrawers()">✖</button>
      </div>
      <div class="t-card">
        <h5>💬 1. Cita Falsa (Spoof Quote)</h5>
        <select id="trollMemberSel" onchange="document.getElementById('tFakeSender').value=this.value"></select>
        <input type="text" id="tFakeSender" placeholder="Número o @lid víctima">
        <input type="text" id="tFakeQuoted" placeholder="Texto falso que dijo la víctima">
        <input type="text" id="tRealReply" placeholder="Tu respuesta">
        <button class="btn btn-troll" onclick="runTroll('fake-quote')">🚀 Enviar Cita Falsa</button>
      </div>
      <div class="t-card">
        <h5>👻 2. Mención Fantasma (Hidden Tag)</h5>
        <input type="text" id="tGhostTxt" placeholder="Texto visible (sin @)">
        <button class="btn btn-troll" onclick="runTroll('ghost-tag')">👻 Enviar Hidden Tag</button>
      </div>
      <div class="t-card">
        <h5>📞 3. Bombardero de Timbrado</h5>
        <div style="display:flex; gap:6px;">
          <input type="number" id="tCallCount" value="3" min="1" max="15" style="width:75px;">
          <select id="tCallVid"><option value="0">📞 Voz</option><option value="1">📹 Video</option></select>
          <button class="btn btn-danger" onclick="runTroll('call-bomb')">Timbrar</button>
        </div>
      </div>
      <div class="t-card">
        <h5>📍 4. Ubicación Falsa</h5>
        <input type="text" id="tLocName" value="Área 51 - Base Clasificada">
        <div style="display:flex; gap:6px;">
          <input type="text" id="tLocLat" value="37.2431">
          <input type="text" id="tLocLng" value="-115.7930">
        </div>
        <button class="btn btn-troll" onclick="runTroll('fake-loc')">📍 Enviar GPS Falso</button>
      </div>
      <div class="t-card">
        <h5>🪪 5. Contacto Falso (vCard)</h5>
        <input type="text" id="tVcardName" value="Soporte Oficial WhatsApp">
        <input type="text" id="tVcardPhone" value="16505434800">
        <button class="btn btn-troll" onclick="runTroll('fake-vcard')">🪪 Enviar vCard</button>
      </div>
      <div class="t-card">
        <h5>⚡ 6. Lluvia Reacciones & Estado</h5>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-ghost" style="flex:1" onclick="runTroll('react-rain')">🎉 Reacciones</button>
          <button class="btn btn-ghost" style="flex:1" onclick="runTroll('presence-loop-composing')">✍️ Escribiendo</button>
        </div>
      </div>
    </div>

    <div class="drawer" id="infoDrawer">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4>ℹ️ Identidad del Chat</h4>
        <button class="ico-btn" onclick="closeDrawers()">✖</button>
      </div>
      <div style="background:#182229; border:1px solid #263540; border-radius:10px; padding:12px; font-family:monospace; font-size:12px; line-height:1.8;">
        <div>🏷️ <b>Nombre:</b> <span id="iName">-</span></div>
        <div>📱 <b>Número:</b> <span id="iPhone" style="color:var(--cyan);">-</span></div>
        <div>🔗 <b>LID:</b> <span id="iLid" style="color:#d1c4e9;">-</span></div>
        <div>🌐 <b>JID:</b> <span id="iJid" style="color:var(--muted);">-</span></div>
        <div>🤖 <b>Subbot:</b> <span id="iBot" style="color:var(--green);">-</span></div>
      </div>
      <button class="btn" onclick="copyPeerIds()">📋 Copiar Número y LID</button>
    </div>
  </div>
</div>

<script>
const BURN_KEY = "${burnKey}";
let SESSION_TOKEN = sessionStorage.getItem("anon_sess_" + BURN_KEY) || "";
let selectedBotKey = "";
let selectedChatJid = "";
let filterMode = "all";
let cachedChats = [];
let cachedContacts = [];
let currentChatObj = null;
let currentMessages = [];
let knownBots = [];
let replyTargetMsg = null;
let voMode = false;

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function api(path, method = "GET", body = null, timeoutMs = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const opts = {
      method,
      headers: { "Content-Type": "application/json", "x-anon-session": SESSION_TOKEN },
      signal: ctrl.signal
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch("/api/" + path, opts);
    if (r.status === 403) {
      document.body.innerHTML = '<div style="margin:auto;color:#ff2a54;padding:30px;text-align:center;font-family:monospace;"><h2>🔥 ENLACE QUEMADO / SESIÓN BLOQUEADA</h2><p>Este acceso es de 1 solo uso y 1 sola conexión.</p></div>';
      throw new Error("burned");
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function claimBurnSession() {
  try {
    const d = await api("claim", "POST", { k: BURN_KEY, s: SESSION_TOKEN }, 8000);
    if (!d.ok) return;
    SESSION_TOKEN = d.sessionToken;
    sessionStorage.setItem("anon_sess_" + BURN_KEY, SESSION_TOKEN);
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, "/");
    }
    applySnapshot(d.snapshot);
  } catch {}
}

function applySnapshot(snap) {
  if (!snap) return;
  knownBots = snap.bots || [];
  const sel = document.getElementById("waBotSelector");
  const prev = selectedBotKey || snap.botKey;
  const html = knownBots.map((b, i) => {
    const role = i === 0 ? "👑 Main: " : "🤖 Sub #" + i + ": ";
    return '<option value="' + esc(b.key) + '">' + esc(role + "+" + b.key + " (" + b.name + ")") + '</option>';
  }).join("");
  if (sel.dataset.sig !== html) {
    sel.dataset.sig = html;
    sel.innerHTML = html;
  }
  if (prev && knownBots.some(x => x.key === prev)) {
    selectedBotKey = prev;
    sel.value = prev;
  } else if (knownBots[0]) {
    selectedBotKey = knownBots[0].key;
    sel.value = selectedBotKey;
  }
  cachedChats = snap.chats || [];
  cachedContacts = snap.contacts || [];
  renderSidebarList();
}

async function onSelectSubbot() {
  selectedBotKey = document.getElementById("waBotSelector").value;
  selectedChatJid = "";
  closeMobileChat();
  document.getElementById("waSidebarList").innerHTML = '<div style="padding:20px;text-align:center;color:#00e5ff;font-size:12px;">⚡ Abriendo memoria de +' + esc(selectedBotKey) + '...</div>';
  await refreshBotData();
}

async function refreshBotData() {
  if (!selectedBotKey) return;
  try {
    const d = await api("wa-chats?botKey=" + encodeURIComponent(selectedBotKey));
    if (d && d.ok) applySnapshot(d);
    if (selectedChatJid) await loadMessages(selectedChatJid, false);
  } catch {
    renderSidebarList();
  }
}

async function forceSyncBot() {
  if (!selectedBotKey) return;
  await api("wa-sync", "POST", { botKey: selectedBotKey }, 9000);
  await refreshBotData();
}

function setFilter(m, btn) {
  filterMode = m;
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderSidebarList();
}

function renderSidebarList() {
  const q = String(document.getElementById("waSearchInput").value || "").toLowerCase().trim();
  const box = document.getElementById("waSidebarList");

  if (filterMode === "contacts") {
    const list = cachedContacts.filter(c =>
      String(c.name || "").toLowerCase().includes(q) ||
      String(c.phone || "").includes(q) ||
      String(c.lid || "").toLowerCase().includes(q)
    );
    if (!list.length) {
      box.innerHTML = '<div style="padding:22px;text-align:center;color:#8696a0;font-size:12px;">Sin contactos aún. Pulsa 🔄 arriba para escanear grupos.</div>';
      return;
    }
    box.innerHTML = list.slice(0, 200).map(c => {
      const pTag = c.phone ? '<span class="tag">📱 +' + esc(c.phone) + '</span>' : '';
      const lTag = c.lid ? '<span class="tag lid">🔗 ' + esc(c.lid) + '</span>' : '';
      return '<div class="chat-item" onclick="openContact(\\'' + esc(c.jid) + '\\', \\'' + esc(c.name) + '\\', \\'' + esc(c.phone) + '\\', \\'' + esc(c.lid) + '\\')">' +
        '<div class="ava">👤</div>' +
        '<div class="chat-meta">' +
          '<div class="chat-row1"><div class="chat-name">' + esc(c.name) + '</div></div>' +
          '<div class="tags-row">' + pTag + lTag + '</div>' +
        '</div>' +
      '</div>';
    }).join("");
    return;
  }

  const list = cachedChats.filter(c => {
    if (filterMode === "groups" && !c.isGroup) return false;
    if (filterMode === "direct" && c.isGroup) return false;
    return (
      String(c.name || "").toLowerCase().includes(q) ||
      String(c.jid || "").toLowerCase().includes(q) ||
      String(c.peerPhone || "").includes(q) ||
      String(c.peerLid || "").toLowerCase().includes(q) ||
      String(c.lastPreview || "").toLowerCase().includes(q)
    );
  });

  if (!list.length) {
    box.innerHTML = '<div style="padding:22px;text-align:center;color:#8696a0;font-size:12px;">Sin conversaciones en esta vista. Usa 📒 Contactos o pulsa 🔄.</div>';
    return;
  }

  box.innerHTML = list.slice(0, 150).map(c => {
    const act = c.jid === selectedChatJid ? "active" : "";
    const tStr = c.lastTime ? new Date(c.lastTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const uHtml = c.unread > 0 ? '<span class="unread">' + c.unread + '</span>' : "";
    let tags = "";
    if (!c.isGroup) {
      const p = c.peerPhone ? '<span class="tag">📱 +' + esc(c.peerPhone) + '</span>' : "";
      const l = c.peerLid ? '<span class="tag lid">🔗 ' + esc(c.peerLid) + '</span>' : "";
      tags = '<div class="tags-row">' + p + l + '</div>';
    }
    return '<div class="chat-item ' + act + '" onclick="openChat(\\'' + esc(c.jid) + '\\')">' +
      '<div class="ava" style="background:' + (c.isGroup ? '#5e35b1' : '#008069') + '">' + (c.isGroup ? '👥' : '👤') + '</div>' +
      '<div class="chat-meta">' +
        '<div class="chat-row1"><div class="chat-name">' + esc(c.name) + '</div><div class="chat-time">' + esc(tStr) + '</div></div>' +
        tags +
        '<div class="chat-row2"><div class="chat-prev">' + esc(c.lastPreview || c.jid) + '</div>' + uHtml + '</div>' +
      '</div>' +
    '</div>';
  }).join("");
}

async function openContact(jid, name, phone, lid) {
  await api("wa-init-chat", "POST", { botKey: selectedBotKey, jid, name, phone, lid });
  setFilter("all", document.querySelector(".chip"));
  await refreshBotData();
  openChat(jid);
}

async function openChat(jid) {
  selectedChatJid = jid;
  cancelReply();
  closeDrawers();
  document.getElementById("waLayout").classList.add("chat-open");
  document.getElementById("waHeadActs").style.display = "flex";
  renderSidebarList();
  await loadMessages(jid, true);
}

function closeMobileChat() {
  document.getElementById("waLayout").classList.remove("chat-open");
  closeDrawers();
}

function openDrawer(w) {
  if (!selectedChatJid) return;
  document.getElementById("trollDrawer").classList.toggle("open", w === "troll");
  document.getElementById("infoDrawer").classList.toggle("open", w === "info");
}

function closeDrawers() {
  document.getElementById("trollDrawer").classList.remove("open");
  document.getElementById("infoDrawer").classList.remove("open");
}

async function loadMessages(jid, scroll = false) {
  if (!selectedBotKey || !jid) return;
  try {
    const d = await api("wa-messages?botKey=" + encodeURIComponent(selectedBotKey) + "&jid=" + encodeURIComponent(jid));
    if (!d || !d.chat) return;
    currentChatObj = d.chat;
    currentMessages = d.chat.messages || [];

    document.getElementById("waActiveName").textContent = d.chat.name || jid;
    let sub = [];
    if (d.chat.isGroup) {
      sub.push("👥 " + ((d.chat.members && d.chat.members.length) || 0) + " miembros");
    } else {
      if (d.chat.peerPhone) sub.push("📱 +" + d.chat.peerPhone);
      if (d.chat.peerLid) sub.push("🔗 " + d.chat.peerLid);
      if (!sub.length) sub.push(d.chat.jid);
    }
    sub.push("🤖 Bot: +" + selectedBotKey);
    document.getElementById("waActiveSub").textContent = sub.join(" • ");

    document.getElementById("iName").textContent = d.chat.name || "-";
    document.getElementById("iPhone").textContent = d.chat.peerPhone ? ("+" + d.chat.peerPhone) : (d.chat.isGroup ? "Grupo" : "Oculto");
    document.getElementById("iLid").textContent = d.chat.peerLid || "No vinculado";
    document.getElementById("iJid").textContent = d.chat.jid;
    document.getElementById("iBot").textContent = "+" + selectedBotKey;

    const mSel = document.getElementById("trollMemberSel");
    if (d.chat.isGroup && Array.isArray(d.chat.members) && d.chat.members.length) {
      mSel.innerHTML = '<option value="">-- Elegir miembro del grupo --</option>' +
        d.chat.members.map(m => '<option value="' + esc(m.jid) + '">' + esc(m.name + (m.phone ? " (+" + m.phone + ")" : "") + (m.lid ? " [" + m.lid + "]" : "")) + '</option>').join("");
    } else {
      const peerTarget = d.chat.peerPhone ? (d.chat.peerPhone + "@s.whatsapp.net") : (d.chat.peerLid || d.chat.jid);
      mSel.innerHTML = '<option value="' + esc(peerTarget) + '">' + esc(d.chat.name) + '</option>';
      document.getElementById("tFakeSender").value = peerTarget;
    }

    const box = document.getElementById("waMsgsBox");
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;

    if (!currentMessages.length) {
      box.innerHTML = '<div style="margin:auto;color:#8696a0;font-size:12px;text-align:center;background:#111b21;padding:14px;border-radius:10px;">🔒 Chat listo. Escribe abajo o abre 🎭 Trolls.</div>';
      return;
    }

    box.innerHTML = currentMessages.map(m => {
      const side = m.fromMe ? "out" : "in";
      let sHead = "";
      if (!m.fromMe) {
        const pB = m.senderPhone ? '<span class="s-badge">+' + esc(m.senderPhone) + '</span>' : "";
        const lB = m.senderLid ? '<span class="s-badge">' + esc(m.senderLid) + '</span>' : "";
        const tid = m.senderPhone || m.senderLid || m.senderJid;
        sHead = '<div class="sender-head" onclick="pickSender(\\'' + esc(tid) + '\\')"><span>' + esc(m.pushName || "Usuario") + '</span>' + pB + lB + '</div>';
      }
      const vo = m.isViewOnce ? '<div class="vo-pill">👁️ VER UNA VEZ REVELADO</div>' : "";
      const qHtml = m.quotedText ? '<div class="q-box"><b>' + esc(m.quotedSender || "Cita") + ':</b> ' + esc(m.quotedText) + '</div>' : "";

      let media = "";
      const mUrl = "/api/media?id=" + encodeURIComponent(m.id) + "&botKey=" + encodeURIComponent(selectedBotKey) + "&s=" + encodeURIComponent(SESSION_TOKEN);
      if (m.mediaType === "image") media = '<img class="media-img" src="' + mUrl + '" loading="lazy">';
      else if (m.mediaType === "sticker") media = '<img class="media-stk" src="' + mUrl + '" loading="lazy">';
      else if (m.mediaType === "video") media = '<video class="media-vid" controls playsinline src="' + mUrl + '"></video>';
      else if (m.mediaType === "audio") media = '<audio class="media-aud" controls src="' + mUrl + '"></audio>';

      const txt = m.text ? '<div>' + esc(m.text) + '</div>' : "";
      const reacts = Object.values(m.reactions || {}).join(" ");

      return '<div class="msg-row ' + side + '">' +
        '<div class="bubble">' +
          sHead + vo + qHtml + media + txt +
          '<div class="b-meta"><span>' + esc(m.time) + '</span><span>' + esc(reacts) + '</span></div>' +
          '<div class="b-tools">' +
            '<span onclick="reactMsg(\\'' + esc(m.id) + '\\',\\'❤️\\')">❤️</span>' +
            '<span onclick="reactMsg(\\'' + esc(m.id) + '\\',\\'😂\\')">😂</span>' +
            '<span onclick="reactMsg(\\'' + esc(m.id) + '\\',\\'🔥\\')">🔥</span>' +
            '<span onclick="setReply(\\'' + esc(m.id) + '\\')">↩️ Citar</span>' +
            '<span onclick="delMsg(\\'' + esc(m.id) + '\\')">🗑️</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join("");

    if (scroll || nearBottom) box.scrollTop = box.scrollHeight;
  } catch {}
}

function pickSender(id) {
  document.getElementById("tFakeSender").value = id;
  const num = String(id).split("@")[0];
  const inp = document.getElementById("waMsgInp");
  inp.value += "@" + num + " ";
  inp.focus();
}

function copyPeerIds() {
  if (!currentChatObj) return;
  const t = "Nombre: " + currentChatObj.name + "\\nNúmero: +" + (currentChatObj.peerPhone || "N/A") + "\\nLID: " + (currentChatObj.peerLid || "N/A") + "\\nJID: " + currentChatObj.jid;
  navigator.clipboard?.writeText(t);
  alert(t);
}

function setReply(id) {
  const f = currentMessages.find(x => x.id === id);
  if (!f) return;
  replyTargetMsg = f;
  document.getElementById("waReplySender").textContent = f.pushName || ("+" + f.senderPhone);
  document.getElementById("waReplyText").textContent = f.text || "Multimedia";
  document.getElementById("waReplyBar").classList.add("active");
}

function cancelReply() {
  replyTargetMsg = null;
  document.getElementById("waReplyBar").classList.remove("active");
}

function toggleVo() {
  voMode = !voMode;
  document.getElementById("voBtn").classList.toggle("active", voMode);
}

async function reactMsg(msgId, emoji) {
  await api("wa-action", "POST", { action: "react", botKey: selectedBotKey, jid: selectedChatJid, msgId, emoji });
  loadMessages(selectedChatJid, false);
}

async function delMsg(msgId) {
  await api("wa-action", "POST", { action: "delete", botKey: selectedBotKey, jid: selectedChatJid, msgId });
  loadMessages(selectedChatJid, false);
}

async function sendWaMessage(e) {
  e.preventDefault();
  const inp = document.getElementById("waMsgInp");
  const text = inp.value.trim();
  if (!text || !selectedBotKey || !selectedChatJid) return;
  const quotedId = replyTargetMsg ? replyTargetMsg.id : "";
  inp.value = "";
  cancelReply();
  await api("wa-send", "POST", { botKey: selectedBotKey, jid: selectedChatJid, text, quotedId });
  await loadMessages(selectedChatJid, true);
  await refreshBotData();
}

async function uploadMedia(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !selectedBotKey || !selectedChatJid) return;
  const isSticker = file.name.toLowerCase().endsWith(".webp");
  const caption = isSticker ? "" : (prompt("Comentario (opcional):", "") || "");
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = String(reader.result || "").split(",")[1] || "";
    if (!base64) return;
    await api("wa-send-media", "POST", {
      botKey: selectedBotKey,
      jid: selectedChatJid,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      asSticker: isSticker,
      viewOnce: voMode,
      caption,
      base64,
      quotedId: replyTargetMsg ? replyTargetMsg.id : ""
    }, 20000);
    cancelReply();
    await loadMessages(selectedChatJid, true);
    await refreshBotData();
  };
  reader.readAsDataURL(file);
}

async function quickCall(isVideo) {
  if (!selectedBotKey || !selectedChatJid) return;
  await api("wa-troll", "POST", { botKey: selectedBotKey, jid: selectedChatJid, type: "call-bomb", count: 1, isVideo });
  loadMessages(selectedChatJid, true);
}

async function runTroll(type) {
  if (!selectedBotKey || !selectedChatJid) return;
  const p = { botKey: selectedBotKey, jid: selectedChatJid, type };
  if (type === "fake-quote") {
    p.fakeSender = document.getElementById("tFakeSender").value.trim();
    p.fakeQuotedText = document.getElementById("tFakeQuoted").value.trim();
    p.replyText = document.getElementById("tRealReply").value.trim();
  } else if (type === "ghost-tag") {
    p.text = document.getElementById("tGhostTxt").value.trim() || "⚡";
  } else if (type === "call-bomb") {
    p.count = parseInt(document.getElementById("tCallCount").value, 10) || 3;
    p.isVideo = document.getElementById("tCallVid").value === "1";
  } else if (type === "fake-loc") {
    p.name = document.getElementById("tLocName").value.trim();
    p.lat = parseFloat(document.getElementById("tLocLat").value) || 37.2431;
    p.lng = parseFloat(document.getElementById("tLocLng").value) || -115.793;
  } else if (type === "fake-vcard") {
    p.vcardName = document.getElementById("tVcardName").value.trim();
    p.vcardPhone = document.getElementById("tVcardPhone").value.trim();
  }
  await api("wa-troll", "POST", p, 12000);
  loadMessages(selectedChatJid, true);
}

async function startNewChatPrompt() {
  const raw = prompt("Número con código de país (ej: 573001234567) o @lid:");
  if (!raw) return;
  const clean = raw.trim();
  const jid = clean.includes("@") ? clean : clean.replace(/\\D/g, "") + "@s.whatsapp.net";
  await api("wa-init-chat", "POST", { botKey: selectedBotKey, jid });
  await refreshBotData();
  openChat(jid);
}

(async () => {
  await claimBurnSession();
  setInterval(refreshBotData, 3200);
})();
</script>
</body>
</html>`;
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
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
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function ensureWebServerRunning(): Promise<number> {
  if (state.server && state.port > 0) return state.port;

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = parsedUrl.pathname;

      if (pathname === "/api/ping") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/" && req.method === "GET") {
        const k = parsedUrl.searchParams.get("k") || "";
        if (!state.isBurned && k === state.burnKey) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(buildAnonimusWebHtml(state.burnKey));
          return;
        }
        res.writeHead(403, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(buildBurnedLockHtml());
        return;
      }

      if (pathname === "/api/claim" && req.method === "POST") {
        const body = await readJsonBody(req);
        const k = String(body.k || "");
        const existingSess = String(body.s || "");

        if (state.isBurned) {
          if (state.activeSessionToken && existingSess === state.activeSessionToken) {
            sendJson(res, 200, {
              ok: true,
              sessionToken: state.activeSessionToken,
              snapshot: buildBotSnapshot(),
            });
            return;
          }
          sendJson(res, 403, { ok: false, error: "Enlace quemado" });
          return;
        }

        if (k !== state.burnKey) {
          sendJson(res, 403, { ok: false, error: "Llave inválida" });
          return;
        }

        state.isBurned = true;
        state.activeSessionToken = randomBytes(20).toString("hex");

        sendJson(res, 200, {
          ok: true,
          sessionToken: state.activeSessionToken,
          snapshot: buildBotSnapshot(),
        });
        return;
      }

      const clientSess =
        String(req.headers["x-anon-session"] || "") ||
        parsedUrl.searchParams.get("s") ||
        "";

      if (!state.activeSessionToken || clientSess !== state.activeSessionToken) {
        sendJson(res, 403, { error: "Sesión bloqueada o enlace quemado" });
        return;
      }

      if (pathname === "/api/wa-chats" && req.method === "GET") {
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        sendJson(res, 200, { ok: true, ...buildBotSnapshot(botKey) });
        return;
      }

      if (pathname === "/api/wa-sync" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        state.botSynced.delete(botKey);
        await syncAllBotsNow();
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-messages" && req.method === "GET") {
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        const jid = parsedUrl.searchParams.get("jid") || "";
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : allBots[0];

        const chat = ensureBotChatMap(botKey).get(jid);
        if (!chat) {
          sendJson(res, 200, { chat: null });
          return;
        }

        chat.unread = 0;

        if (!chat.isGroup && targetBot && (!chat.peerPhone || !chat.peerLid)) {
          const resolved = await resolvePeerIdentity(targetBot, chat.jid, chat.peerLid || chat.peerPhone, undefined, true);
          if (resolved.phone && !chat.peerPhone) chat.peerPhone = resolved.phone;
          if (resolved.lid && !chat.peerLid) chat.peerLid = resolved.lid;
          if (
            resolved.name &&
            (chat.name.startsWith("+") || chat.name.startsWith("LID ") || isSameAsBot(targetBot, "", "", chat.name))
          ) {
            chat.name = resolved.name;
          }
        }

        sendJson(res, 200, {
          chat: {
            jid: chat.jid,
            name: chat.name,
            isGroup: chat.isGroup,
            peerPhone: chat.peerPhone || "",
            peerLid: chat.peerLid || "",
            members: chat.members || [],
            messages: chat.messages.map((m) => ({
              id: m.id,
              senderJid: m.senderJid,
              senderPhone: m.senderPhone,
              senderLid: m.senderLid,
              pushName: m.pushName,
              text: m.text,
              time: m.time,
              fromMe: m.fromMe,
              isViewOnce: m.isViewOnce,
              mediaType: m.mediaType,
              quotedSender: m.quotedSender,
              quotedText: m.quotedText,
              reactions: m.reactions || {},
            })),
          },
        });
        return;
      }

      if (pathname === "/api/wa-init-chat" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotInfo(b, idx).key === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : allBots[0];
        const store = ensureBotChatMap(botKey);
        const isGroup = jid.endsWith("@g.us");
        const resolved =
          !isGroup && targetBot
            ? await resolvePeerIdentity(targetBot, jid, body.lid || body.phone, body.name, false)
            : {
                phone: normalizePhoneDigits(body.phone || jid),
                lid: normalizeLid(body.lid || jid),
                name: String(body.name || ""),
              };

        const { canonicalJid, session } = findConsolidatedSession(store, jid, resolved.phone, resolved.lid);
        if (!session) {
          store.set(canonicalJid, {
            jid: canonicalJid,
            name:
              resolved.name ||
              (isGroup
                ? `Grupo ${cleanDigits(jid)}`
                : resolved.phone
                ? `+${resolved.phone}`
                : resolved.lid || `+${cleanDigits(jid)}`),
            isGroup,
            peerPhone: resolved.phone,
            peerLid: resolved.lid,
            unread: 0,
            lastTime: Date.now(),
            lastPreview: "Chat listo",
            messages: [],
          });
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
          sendJson(res, 400, { ok: false });
          return;
        }

        const chat = ensureBotChatMap(botKey).get(jid);
        const quotedObj = quotedId ? chat?.messages.find((x) => x.id === quotedId
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
