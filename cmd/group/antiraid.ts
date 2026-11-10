import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { jidNormalizedUser } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import { getActivePremBots } from "../../connection/premBotManager.ts";
import { GROUP_METADATA_CACHE } from "../../handler.ts";

const requireModule = createRequire(import.meta.url);

const SUPREME_OWNER_PHONE = "5215538176300";
const SUPREME_OWNER_JID = "5215538176300@s.whatsapp.net";

export interface GlobalBanRecord {
  caseId: string;
  phone: string;
  jid: string;
  lid: string;
  reason: string;
  evidence: string;
  adminName: string;
  adminPhone: string;
  createdAt: number;
  dateStr: string;
  appealStatus: "none" | "pending" | "rejected";
  lastAppealText: string;
  lastAppealAt: number;
  kickedCount: number;
}

interface ResolvedIdentity {
  phone: string;
  jid: string;
  lid: string;
}

interface SqlDriver {
  exec: (sql: string) => void;
  run: (sql: string, params?: any[]) => void;
  get: (sql: string, params?: any[]) => any;
  all: (sql: string, params?: any[]) => any[];
}

const DATA_DIR = path.resolve((globalThis as any).DATA_BASE_DIR || "./data");
const DB_PATH = path.join(DATA_DIR, "AuraAntiRaid.db");
const STATE_MIRROR_PATH = path.join(DATA_DIR, "AuraAntiRaid.state.json");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "antiraid_global.json");

const MAX_DEBOUNCE_ENTRIES = 1500;
const DEBOUNCE_TTL_MS = 10_000;
const WARN_COOLDOWN_MS = 45_000;
const META_CACHE_TTL_MS = 20_000;

const gRaid = globalThis as unknown as {
  __auraAntiRaidSql?: SqlDriver;
  __auraAntiRaidMemIndex?: {
    byCase: Map<string, GlobalBanRecord>;
    byPhone: Map<string, GlobalBanRecord>;
    byJid: Map<string, GlobalBanRecord>;
    byLid: Map<string, GlobalBanRecord>;
    disabledGroups: Set<string>;
    enabledGroups: Set<string>;
    staffInbox: Set<string>;
  };
  __auraSupremeOwnerLid?: string;
  __auraAntiRaidKnownSockets?: Set<any>;
  __auraAntiRaidHookedSockets?: WeakSet<object>;
  __auraAntiRaidInterval?: NodeJS.Timeout;
  __auraAntiRaidRecentActions?: Map<string, number>;
  __auraAntiRaidWarnCooldown?: Map<string, number>;
  __auraAntiRaidMetaCache?: Map<string, { exp: number; meta: any }>;
  mainSocket?: any;
};

const knownSockets =
  gRaid.__auraAntiRaidKnownSockets ??
  (gRaid.__auraAntiRaidKnownSockets = new Set<any>());

const recentActionDebounce =
  gRaid.__auraAntiRaidRecentActions ??
  (gRaid.__auraAntiRaidRecentActions = new Map<string, number>());

const warnCooldownMap =
  gRaid.__auraAntiRaidWarnCooldown ??
  (gRaid.__auraAntiRaidWarnCooldown = new Map<string, number>());

const groupMetaShortCache =
  gRaid.__auraAntiRaidMetaCache ??
  (gRaid.__auraAntiRaidMetaCache = new Map<string, { exp: number; meta: any }>());

function pruneBoundedMaps() {
  const now = Date.now();
  if (recentActionDebounce.size > MAX_DEBOUNCE_ENTRIES) {
    for (const [k, ts] of recentActionDebounce.entries()) {
      if (now - ts > DEBOUNCE_TTL_MS) recentActionDebounce.delete(k);
    }
    if (recentActionDebounce.size > MAX_DEBOUNCE_ENTRIES) recentActionDebounce.clear();
  }
  if (warnCooldownMap.size > MAX_DEBOUNCE_ENTRIES) {
    for (const [k, ts] of warnCooldownMap.entries()) {
      if (now - ts > WARN_COOLDOWN_MS) warnCooldownMap.delete(k);
    }
    if (warnCooldownMap.size > MAX_DEBOUNCE_ENTRIES) warnCooldownMap.clear();
  }
  if (groupMetaShortCache.size > 300) {
    for (const [k, v] of groupMetaShortCache.entries()) {
      if (v.exp <= now) groupMetaShortCache.delete(k);
    }
  }
}

function cleanDigits(val: unknown): string {
  return String(val || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function normalizeLid(val: unknown): string {
  const raw = String(val || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.endsWith("@lid")) {
    const d = cleanDigits(raw);
    return d ? `${d}@lid` : "";
  }
  return "";
}

function normalizePhoneJid(val: unknown): { phone: string; jid: string } {
  const raw = String(val || "").trim().toLowerCase();
  if (!raw || raw.endsWith("@lid") || raw.endsWith("@g.us")) {
    return { phone: "", jid: "" };
  }
  const d = cleanDigits(raw);
  if (d.length >= 7 && d.length <= 15) {
    return { phone: d, jid: `${d}@s.whatsapp.net` };
  }
  return { phone: "", jid: "" };
}

function isSupremeOwnerIdentity(
  identity?: Partial<ResolvedIdentity> | null,
  rawFallback?: unknown,
): boolean {
  const ownerLid = gRaid.__auraSupremeOwnerLid || "";
  if (identity) {
    const pDigits = cleanDigits(identity.phone);
    const jDigits = cleanDigits(identity.jid);
    const normLid = normalizeLid(identity.lid);

    if (pDigits === SUPREME_OWNER_PHONE || jDigits === SUPREME_OWNER_PHONE) {
      if (normLid) gRaid.__auraSupremeOwnerLid = normLid;
      return true;
    }
    if (ownerLid && normLid && normLid === ownerLid) {
      return true;
    }
    if (ownerLid && identity.phone === `LID_${cleanDigits(ownerLid)}`) {
      return true;
    }
  }

  if (rawFallback) {
    const rawStr = String(rawFallback).trim();
    if (!rawStr.endsWith("@lid") && cleanDigits(rawStr) === SUPREME_OWNER_PHONE) {
      return true;
    }
    if (ownerLid && rawStr.endsWith("@lid") && normalizeLid(rawStr) === ownerLid) {
      return true;
    }
  }

  return false;
}

function saveDiskMirror() {
  try {
    const idx = gRaid.__auraAntiRaidMemIndex;
    if (!idx) return;
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      bans: Array.from(idx.byCase.values()),
      disabledGroups: Array.from(idx.disabledGroups),
      enabledGroups: Array.from(idx.enabledGroups),
      staffInbox: Array.from(idx.staffInbox),
      supremeOwnerLid: gRaid.__auraSupremeOwnerLid || "",
    };
    writeFileSync(STATE_MIRROR_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch {}
}

function initSqlDriver(): SqlDriver {
  if (gRaid.__auraAntiRaidSql) return gRaid.__auraAntiRaidSql;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  let driver: SqlDriver | null = null;

  try {
    const BetterSqlite3 = requireModule("better-sqlite3");
    const db = new BetterSqlite3(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    driver = {
      exec: (sql: string) => db.exec(sql),
      run: (sql: string, params: any[] = []) => {
        db.prepare(sql).run(...params);
      },
      get: (sql: string, params: any[] = []) => db.prepare(sql).get(...params),
      all: (sql: string, params: any[] = []) => db.prepare(sql).all(...params),
    };
  } catch {
    try {
      const nodeSqlite = requireModule("node:sqlite");
      const db = new nodeSqlite.DatabaseSync(DB_PATH);
      db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
      driver = {
        exec: (sql: string) => db.exec(sql),
        run: (sql: string, params: any[] = []) => {
          db.prepare(sql).run(...params);
        },
        get: (sql: string, params: any[] = []) => db.prepare(sql).get(...params),
        all: (sql: string, params: any[] = []) => db.prepare(sql).all(...params),
      };
    } catch {
      driver = {
        exec: () => {},
        run: () => {},
        get: () => null,
        all: () => [],
      };
    }
  }

  try {
    driver.exec(`
      CREATE TABLE IF NOT EXISTS antiraid_bans (
        case_id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        jid TEXT NOT NULL,
        lid TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL,
        evidence TEXT NOT NULL DEFAULT '',
        admin_name TEXT NOT NULL,
        admin_phone TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        appeal_status TEXT NOT NULL DEFAULT 'none',
        last_appeal_text TEXT NOT NULL DEFAULT '',
        last_appeal_at INTEGER NOT NULL DEFAULT 0,
        kicked_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_antiraid_phone ON antiraid_bans(phone);
      CREATE INDEX IF NOT EXISTS idx_antiraid_jid ON antiraid_bans(jid);
      CREATE INDEX IF NOT EXISTS idx_antiraid_lid ON antiraid_bans(lid);

      CREATE TABLE IF NOT EXISTS antiraid_groups (
        group_jid TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS antiraid_inbox (
        admin_jid TEXT PRIMARY KEY
      );
    `);
    driver.run("INSERT OR IGNORE INTO antiraid_inbox (admin_jid) VALUES (?)", [
      SUPREME_OWNER_JID,
    ]);
  } catch {}

  gRaid.__auraAntiRaidSql = driver;
  return driver;
}

function rowToRecord(r: any): GlobalBanRecord {
  return {
    caseId: String(r.case_id || r.caseId || ""),
    phone: String(r.phone || ""),
    jid: String(r.jid || ""),
    lid: String(r.lid || ""),
    reason: String(r.reason || ""),
    evidence: String(r.evidence || ""),
    adminName: String(r.admin_name || r.adminName || ""),
    adminPhone: String(r.admin_phone || r.adminPhone || ""),
    createdAt: Number(r.created_at || r.createdAt || Date.now()),
    dateStr: String(r.date_str || r.dateStr || ""),
    appealStatus: ((r.appeal_status || r.appealStatus) as "none" | "pending" | "rejected") || "none",
    lastAppealText: String(r.last_appeal_text || r.lastAppealText || ""),
    lastAppealAt: Number(r.last_appeal_at || r.lastAppealAt || 0),
    kickedCount: Number(r.kicked_count || r.kickedCount || 0),
  };
}

function getMemIndex() {
  if (gRaid.__auraAntiRaidMemIndex) return gRaid.__auraAntiRaidMemIndex;
  const sql = initSqlDriver();

  const index = {
    byCase: new Map<string, GlobalBanRecord>(),
    byPhone: new Map<string, GlobalBanRecord>(),
    byJid: new Map<string, GlobalBanRecord>(),
    byLid: new Map<string, GlobalBanRecord>(),
    disabledGroups: new Set<string>(),
    enabledGroups: new Set<string>(),
    staffInbox: new Set<string>([SUPREME_OWNER_JID]),
  };

  gRaid.__auraAntiRaidMemIndex = index;

  if (existsSync(STATE_MIRROR_PATH)) {
    try {
      const mirror = JSON.parse(readFileSync(STATE_MIRROR_PATH, "utf8"));
      if (mirror?.supremeOwnerLid) {
        gRaid.__auraSupremeOwnerLid = normalizeLid(mirror.supremeOwnerLid);
      }
      if (Array.isArray(mirror?.bans)) {
        for (const b of mirror.bans) {
          if (!b?.caseId) continue;
          const rec = rowToRecord(b);
          if (isSupremeOwnerIdentity(rec)) continue;
          indexRecordInMemory(rec);
        }
      }
      if (Array.isArray(mirror?.disabledGroups)) {
        for (const g of mirror.disabledGroups) index.disabledGroups.add(String(g));
      }
      if (Array.isArray(mirror?.enabledGroups)) {
        for (const g of mirror.enabledGroups) {
          index.enabledGroups.add(String(g));
          index.disabledGroups.delete(String(g));
        }
      }
      if (Array.isArray(mirror?.staffInbox)) {
        for (const a of mirror.staffInbox) index.staffInbox.add(String(a));
      }
    } catch {}
  }

  if (existsSync(LEGACY_JSON_PATH)) {
    try {
      const legacy = JSON.parse(readFileSync(LEGACY_JSON_PATH, "utf8"));
      if (legacy?.bans && typeof legacy.bans === "object") {
        for (const b of Object.values(legacy.bans) as any[]) {
          if (!b?.caseId) continue;
          const rec = rowToRecord({
            ...b,
            jid: b.jid || `${b.phone}@s.whatsapp.net`,
          });
          if (isSupremeOwnerIdentity(rec)) continue;
          upsertBanInSql(rec);
        }
      }
      if (Array.isArray(legacy?.disabledGroups)) {
        for (const gid of legacy.disabledGroups) {
          index.disabledGroups.add(String(gid));
        }
      }
      renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
    } catch {}
  }

  try {
    for (const r of sql.all("SELECT * FROM antiraid_bans")) {
      const rec = rowToRecord(r);
      if (!rec.caseId) continue;
      if (isSupremeOwnerIdentity(rec)) {
        sql.run("DELETE FROM antiraid_bans WHERE case_id = ?", [rec.caseId]);
        continue;
      }
      indexRecordInMemory(rec);
    }
    for (const g of sql.all("SELECT * FROM antiraid_groups")) {
      const gid = String(g?.group_jid || "");
      if (!gid) continue;
      if (Number(g.enabled) === 0) {
        index.disabledGroups.add(gid);
        index.enabledGroups.delete(gid);
      } else {
        index.enabledGroups.add(gid);
        index.disabledGroups.delete(gid);
      }
    }
    for (const a of sql.all("SELECT * FROM antiraid_inbox")) {
      if (a?.admin_jid) index.staffInbox.add(String(a.admin_jid));
    }
  } catch {}

  saveDiskMirror();
  return index;
}

function indexRecordInMemory(rec: GlobalBanRecord) {
  if (isSupremeOwnerIdentity(rec)) return;
  const idx = getMemIndex();
  idx.byCase.set(rec.caseId.toUpperCase(), rec);
  if (rec.phone) idx.byPhone.set(rec.phone, rec);
  if (rec.jid) idx.byJid.set(rec.jid.toLowerCase(), rec);
  if (rec.lid) {
    const normLid = normalizeLid(rec.lid);
    if (normLid) idx.byLid.set(normLid, rec);
  }
}

function unindexRecordFromMemory(rec: GlobalBanRecord) {
  const idx = getMemIndex();
  idx.byCase.delete(rec.caseId.toUpperCase());
  if (rec.phone) idx.byPhone.delete(rec.phone);
  if (rec.jid) idx.byJid.delete(rec.jid.toLowerCase());
  if (rec.lid) {
    const normLid = normalizeLid(rec.lid);
    if (normLid) idx.byLid.delete(normLid);
  }
}

function upsertBanInSql(rec: GlobalBanRecord) {
  if (isSupremeOwnerIdentity(rec)) return;
  const sql = initSqlDriver();
  try {
    sql.run(
      `INSERT OR REPLACE INTO antiraid_bans (
        case_id, phone, jid, lid, reason, evidence, admin_name, admin_phone,
        created_at, date_str, appeal_status, last_appeal_text, last_appeal_at, kicked_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rec.caseId,
        rec.phone,
        rec.jid,
        rec.lid || "",
        rec.reason,
        rec.evidence || "",
        rec.adminName,
        rec.adminPhone,
        rec.createdAt,
        rec.dateStr,
        rec.appealStatus,
        rec.lastAppealText || "",
        rec.lastAppealAt || 0,
        rec.kickedCount || 0,
      ],
    );
  } catch {}
  indexRecordInMemory(rec);
  saveDiskMirror();
}

function deleteBanInSql(rec: GlobalBanRecord) {
  const sql = initSqlDriver();
  try {
    sql.run("DELETE FROM antiraid_bans WHERE case_id = ?", [rec.caseId]);
  } catch {}
  unindexRecordFromMemory(rec);
  saveDiskMirror();
}

function purgeSupremeOwnerBans(): number {
  const idx = getMemIndex();
  let removed = 0;
  for (const rec of Array.from(idx.byCase.values())) {
    if (isSupremeOwnerIdentity(rec)) {
      deleteBanInSql(rec);
      removed++;
    }
  }
  return removed;
}

function addStaffInboxSql(adminJid: string) {
  if (!adminJid.endsWith("@s.whatsapp.net")) return;
  const sql = initSqlDriver();
  try {
    sql.run("INSERT OR IGNORE INTO antiraid_inbox (admin_jid) VALUES (?)", [adminJid]);
  } catch {}
  getMemIndex().staffInbox.add(adminJid);
  saveDiskMirror();
}

async function getCachedGroupMetadata(sock: any, groupId: string): Promise<any> {
  const cachedGlobal = GROUP_METADATA_CACHE?.get?.(groupId);
  if (cachedGlobal?.participants?.length) return cachedGlobal;

  const now = Date.now();
  const cached = groupMetaShortCache.get(groupId);
  if (cached && cached.exp > now) return cached.meta;

  try {
    const meta = await Promise.race([
      sock.groupMetadata(groupId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
    ]);
    if (meta) {
      groupMetaShortCache.set(groupId, { exp: now + META_CACHE_TTL_MS, meta });
    }
    return meta;
  } catch {
    return null;
  }
}

function getBotIdentifiers(sock: any): { jid: string; phone: string; lid: string; lidDigits: string } {
  const rawId = sock?.user?.id || sock?.authState?.creds?.me?.id || "";
  const rawLid = sock?.user?.lid || sock?.authState?.creds?.me?.lid || "";
  const jid = rawId ? jidNormalizedUser(rawId) : "";
  const phone = cleanDigits(jid);
  const lid = normalizeLid(rawLid);
  const lidDigits = cleanDigits(lid);
  return { jid, phone, lid, lidDigits };
}

function findParticipantEntry(participants: any[], phone: string, lid: string): any | null {
  const cleanPhone = phone && !phone.startsWith("LID_") ? cleanDigits(phone) : "";
  const cleanLid = cleanDigits(lid);

  for (const p of participants) {
    const pId = String(p?.id || "");
    const pLid = String(p?.lid || (pId.endsWith("@lid") ? pId : ""));
    const pPhone = cleanDigits(
      p?.phoneNumber || (pId.endsWith("@s.whatsapp.net") ? pId : ""),
    );
    const pLidDigits = cleanDigits(pLid);

    if (pPhone === SUPREME_OWNER_PHONE && pLid) {
      gRaid.__auraSupremeOwnerLid = normalizeLid(pLid);
    }

    if (cleanPhone && (pPhone === cleanPhone || (!pId.endsWith("@lid") && cleanDigits(pId) === cleanPhone))) {
      return p;
    }
    if (cleanLid && (pLidDigits === cleanLid || (pId.endsWith("@lid") && cleanDigits(pId) === cleanLid))) {
      return p;
    }
  }
  return null;
}

async function resolveFullIdentity(
  sock: any,
  db: any,
  rawInput: any,
  groupMetaOrId?: any,
): Promise<ResolvedIdentity> {
  let phone = "";
  let jid = "";
  let lid = "";

  if (typeof rawInput === "object" && rawInput !== null) {
    const pId = String(rawInput.id || "");
    const pLid = String(rawInput.lid || "");
    const pPhone = String(rawInput.phoneNumber || "");

    if (pLid.endsWith("@lid")) lid = normalizeLid(pLid);
    else if (pId.endsWith("@lid")) lid = normalizeLid(pId);

    if (pId.endsWith("@s.whatsapp.net")) {
      const norm = normalizePhoneJid(pId);
      phone = norm.phone;
      jid = norm.jid;
    } else if (pPhone) {
      const norm = normalizePhoneJid(pPhone);
      phone = norm.phone;
      jid = norm.jid;
    }
  } else {
    const str = String(rawInput || "").trim();
    if (str.endsWith("@lid")) {
      lid = normalizeLid(str);
    } else {
      const norm = normalizePhoneJid(str);
      phone = norm.phone;
      jid = norm.jid;
    }
  }

  let groupParticipants: any[] = [];
  if (typeof groupMetaOrId === "string" && groupMetaOrId.endsWith("@g.us")) {
    const meta = await getCachedGroupMetadata(sock, groupMetaOrId);
    groupParticipants = meta?.participants || [];
  } else if (groupMetaOrId?.participants) {
    groupParticipants = groupMetaOrId.participants;
  }

  if (groupParticipants.length > 0) {
    const matched = findParticipantEntry(groupParticipants, phone, lid);
    if (matched) {
      const pId = String(matched.id || "");
      const pLid = normalizeLid(matched.lid || (pId.endsWith("@lid") ? pId : ""));
      const pPhoneNorm = normalizePhoneJid(
        matched.phoneNumber || (pId.endsWith("@s.whatsapp.net") ? pId : ""),
      );
      if (!phone && pPhoneNorm.phone) {
        phone = pPhoneNorm.phone;
        jid = pPhoneNorm.jid;
      }
      if (!lid && pLid) {
        lid = pLid;
      }
    }
  }

  const lidRepo = sock?.signalRepository?.lidMapping;
  if (lid && !phone && typeof lidRepo?.getPNForLID === "function") {
    try {
      const mappedPn = await lidRepo.getPNForLID(lid);
      if (mappedPn) {
        const norm = normalizePhoneJid(mappedPn);
        if (norm.phone) {
          phone = norm.phone;
          jid = norm.jid;
        }
      }
    } catch {}
  }

  if (phone && !lid && typeof lidRepo?.getLIDForPN === "function") {
    try {
      const mappedLid = await lidRepo.getLIDForPN(jid);
      if (mappedLid) {
        lid = normalizeLid(mappedLid);
      }
    } catch {}
  }

  const activeDb = db || (globalThis as any).db;
  if (activeDb && typeof activeDb.getUser === "function") {
    try {
      const uRec =
        (jid && activeDb.getUser(jid)) ||
        (lid && activeDb.getUser(lid)) ||
        (phone && activeDb.getUser(phone));
      if (uRec) {
        if (!phone && (uRec.phone_number || uRec.jid)) {
          const norm = normalizePhoneJid(uRec.phone_number || uRec.jid);
          if (norm.phone) {
            phone = norm.phone;
            jid = norm.jid;
          }
        }
        if (!lid && uRec.lid) {
          lid = normalizeLid(uRec.lid);
        }
      }
    } catch {}
  }

  if (phone === SUPREME_OWNER_PHONE && lid) {
    gRaid.__auraSupremeOwnerLid = normalizeLid(lid);
  } else if (
    !phone &&
    lid &&
    gRaid.__auraSupremeOwnerLid &&
    normalizeLid(lid) === gRaid.__auraSupremeOwnerLid
  ) {
    phone = SUPREME_OWNER_PHONE;
    jid = SUPREME_OWNER_JID;
  }

  if (!phone && lid) {
    const lidDigits = cleanDigits(lid);
    phone = `LID_${lidDigits}`;
    jid = lid;
  }

  return { phone, jid, lid };
}

function findBanByIdentity(identity: Partial<ResolvedIdentity>, rawFallback?: string): GlobalBanRecord | null {
  if (isSupremeOwnerIdentity(identity, rawFallback)) {
    purgeSupremeOwnerBans();
    return null;
  }

  const idx = getMemIndex();

  if (rawFallback) {
    const byCase = idx.byCase.get(rawFallback.replace(/^#/, "").toUpperCase());
    if (byCase) {
      if (isSupremeOwnerIdentity(byCase)) {
        deleteBanInSql(byCase);
        return null;
      }
      return byCase;
    }
  }

  if (identity.phone && idx.byPhone.has(identity.phone)) {
    const rec = idx.byPhone.get(identity.phone)!;
    linkMissingIdentityFields(rec, identity);
    if (isSupremeOwnerIdentity(rec)) {
      deleteBanInSql(rec);
      return null;
    }
    return rec;
  }

  if (identity.jid && idx.byJid.has(identity.jid.toLowerCase())) {
    const rec = idx.byJid.get(identity.jid.toLowerCase())!;
    linkMissingIdentityFields(rec, identity);
    if (isSupremeOwnerIdentity(rec)) {
      deleteBanInSql(rec);
      return null;
    }
    return rec;
  }

  if (identity.lid) {
    const normLid = normalizeLid(identity.lid);
    if (normLid && idx.byLid.has(normLid)) {
      const rec = idx.byLid.get(normLid)!;
      linkMissingIdentityFields(rec, identity);
      if (isSupremeOwnerIdentity(rec)) {
        deleteBanInSql(rec);
        return null;
      }
      return rec;
    }
    const lidDigits = cleanDigits(normLid);
    if (lidDigits && idx.byPhone.has(`LID_${lidDigits}`)) {
      const rec = idx.byPhone.get(`LID_${lidDigits}`)!;
      linkMissingIdentityFields(rec, identity);
      if (isSupremeOwnerIdentity(rec)) {
        deleteBanInSql(rec);
        return null;
      }
      return rec;
    }
  }

  if (rawFallback) {
    const str = String(rawFallback).trim();
    if (str.endsWith("@lid")) {
      const normLid = normalizeLid(str);
      if (normLid && idx.byLid.has(normLid)) return idx.byLid.get(normLid)!;
      const d = cleanDigits(normLid);
      if (d && idx.byPhone.has(`LID_${d}`)) return idx.byPhone.get(`LID_${d}`)!;
    } else {
      const d = cleanDigits(str);
      if (d) {
        if (idx.byPhone.has(d)) return idx.byPhone.get(d)!;
        if (idx.byLid.has(`${d}@lid`)) return idx.byLid.get(`${d}@lid`)!;
      }
    }
  }

  return null;
}

function linkMissingIdentityFields(rec: GlobalBanRecord, discovered: Partial<ResolvedIdentity>) {
  let changed = false;

  if (
    discovered.phone &&
    !discovered.phone.startsWith("LID_") &&
    (rec.phone.startsWith("LID_") || !rec.phone)
  ) {
    unindexRecordFromMemory(rec);
    rec.phone = discovered.phone;
    rec.jid = `${discovered.phone}@s.whatsapp.net`;
    changed = true;
  }

  if (discovered.lid) {
    const normLid = normalizeLid(discovered.lid);
    if (normLid && rec.lid !== normLid) {
      unindexRecordFromMemory(rec);
      rec.lid = normLid;
      changed = true;
    }
  }

  if (isSupremeOwnerIdentity(rec)) {
    deleteBanInSql(rec);
    return;
  }

  if (changed) {
    upsertBanInSql(rec);
  }
}

function isGroupProtectionEnabled(groupId: string): boolean {
  const idx = getMemIndex();
  if (idx.enabledGroups.has(groupId)) return true;
  if (idx.disabledGroups.has(groupId)) return false;
  return true;
}

function setGroupProtection(groupId: string, enabled: boolean, db?: any) {
  const sql = initSqlDriver();
  const idx = getMemIndex();
  try {
    sql.run(
      "INSERT OR REPLACE INTO antiraid_groups (group_jid, enabled, updated_at) VALUES (?, ?, ?)",
      [groupId, enabled ? 1 : 0, Date.now()],
    );
  } catch {}
  if (enabled) {
    idx.disabledGroups.delete(groupId);
    idx.enabledGroups.add(groupId);
  } else {
    idx.enabledGroups.delete(groupId);
    idx.disabledGroups.add(groupId);
  }
  saveDiskMirror();
  try {
    const activeDb = db || (globalThis as any).db;
    activeDb?.setGroup?.(groupId, { antiraid: enabled ? 1 : 0 });
  } catch {}
}

function discoverAllActiveSockets(currentSock?: any): any[] {
  if (currentSock) knownSockets.add(currentSock);

  const gAny = globalThis as any;
  const candidates: any[] = [
    currentSock,
    gAny.mainSocket,
    gAny.mainSock,
    gAny.sock,
    gAny.conn,
    gAny.__auraWebPanel?.mainSock,
    ...Array.from(knownSockets),
  ];

  try {
    for (const val of Object.values(gAny)) {
      if (
        val &&
        typeof val === "object" &&
        typeof (val as any).groupParticipantsUpdate === "function" &&
        typeof (val as any).sendMessage === "function" &&
        (val as any).ev
      ) {
        candidates.push(val);
      }
    }
  } catch {}

  try {
    const prems = getActivePremBots?.() || [];
    candidates.push(...prems);
  } catch {}
  try {
    const subs = getActiveSubBots?.() || [];
    candidates.push(...subs);
  } catch {}

  const unique: any[] = [];
  const seenIds = new Set<string>();

  for (const item of candidates) {
    const realSock = item?.sock ?? item;
    if (
      !realSock ||
      typeof realSock.groupParticipantsUpdate !== "function" ||
      (realSock as any).isClosed
    ) {
      continue;
    }
    knownSockets.add(realSock);
    const bot = getBotIdentifiers(realSock);
    const key = bot.jid || bot.lid || String(unique.length);
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    unique.push(realSock);
  }

  return unique;
}

function buildAntiRaidRichCard(data: {
  mode: "DM_BANNED" | "GROUP_AUTOKICK" | "GROUP_WARN_NO_ADMIN" | "APPEAL_TICKET" | "UNBANNED_DM" | "GLOBAL_REPORT";
  badgeText: string;
  title: string;
  subtitle: string;
  caseId: string;
  targetPhone: string;
  targetLid: string;
  reason: string;
  adminName: string;
  dateStr: string;
  extraLabel: string;
  extraValue: string;
  footerNote: string;
  copyCommand: string;
  copyLabel: string;
  rawSummary: string;
}) {
  const serialized = JSON.stringify(data);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:420px;margin:0 auto;background:linear-gradient(180deg,#150726 0%,#070210 100%);border:1.5px solid #4c1d95;border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.9),0 0 30px rgba(255,0,85,.22);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#ff0055,#9333ea,#00ffcc,#ff0055);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.head{padding:14px 16px;background:radial-gradient(circle at 85% 15%,rgba(255,0,85,.25),transparent 65%);border-bottom:1px solid #2d144f;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px}
.orb{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#ff0055,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 16px rgba(255,0,85,.55)}
.brand-txt h1{font-size:13.5px;font-weight:900;letter-spacing:.9px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:10px;color:#ff6b8b;font-weight:800;font-family:'Courier New',monospace}
.pill{font-size:9.5px;font-weight:900;padding:4px 9px;border-radius:999px;background:rgba(255,0,85,.18);color:#fda4af;border:1px solid rgba(255,0,85,.45);font-family:'Courier New',monospace}
.body{padding:14px 16px}
.hero{background:linear-gradient(135deg,rgba(46,16,101,.55),rgba(15,5,29,.9));border:1px solid #4c1d95;border-left:3.5px solid #ff0055;border-radius:14px;padding:12px;margin-bottom:12px}
.hero-top{font-size:9.5px;font-weight:900;color:#f472b6;text-transform:uppercase;letter-spacing:1px}
.hero-main{font-size:15px;font-weight:900;color:#fff;margin-top:2px;font-family:'Courier New',monospace}
.hero-sub{font-size:10.5px;color:#c4b5fd;margin-top:3px;font-family:'Courier New',monospace}
.reason-box{background:#0c041a;border:1px solid #2b154d;border-radius:12px;padding:10px 12px;margin-bottom:12px}
.sec-lbl{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#a78bfa;margin-bottom:4px;display:flex;justify-content:space-between}
.reason-txt{font-size:12px;font-weight:700;color:#f3e8ff;line-height:1.45;word-break:break-word;white-space:pre-wrap}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.info-card{background:#0f061e;border:1px solid #251345;border-radius:11px;padding:8px 10px}
.k{font-size:9px;font-weight:800;color:#8b74b0;text-transform:uppercase;letter-spacing:.6px}
.v{font-size:12px;font-weight:900;color:#e9d5ff;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v.hl{color:#00ffcc;font-family:'Courier New',monospace}
.v.admin{color:#f0abfc}
.note-box{background:rgba(124,58,237,.12);border:1px dashed #6d28d9;border-radius:11px;padding:9px 11px;font-size:11px;color:#ddd6fe;line-height:1.4;margin-bottom:12px}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:11px;padding:10px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.7px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-primary{background:linear-gradient(135deg,#ff0055,#9333ea);color:#fff;box-shadow:0 4px 15px rgba(255,0,85,.35)}
.btn-sec{background:#170d2b;border:1px solid #3b2166;color:#d8b4fe}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#8b5cf6;color:#fff;font-size:11.5px;font-weight:800;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="card">
  <div class="head">
    <div class="brand">
      <div class="orb" id="orbIco">🛡️</div>
      <div class="brand-txt">
        <h1 id="titleTxt"></h1>
        <p id="subTxt"></p>
      </div>
    </div>
    <span class="pill" id="casePill"></span>
  </div>

  <div class="body">
    <div class="hero">
      <div class="hero-top" id="badgeTxt"></div>
      <div class="hero-main" id="targetTxt"></div>
      <div class="hero-sub" id="lidTxt"></div>
    </div>

    <div class="reason-box">
      <div class="sec-lbl"><span>📋 EXPEDIENTE SQL / MOTIVO</span><span id="dateSpan"></span></div>
      <div class="reason-txt" id="reasonTxt"></div>
    </div>

    <div class="grid">
      <div class="info-card">
        <div class="k">👮 Sancionado Por</div>
        <div class="v admin" id="adminTxt"></div>
      </div>
      <div class="info-card">
        <div class="k" id="extraLbl"></div>
        <div class="v hl" id="extraVal"></div>
      </div>
    </div>

    <div class="note-box" id="noteBox"></div>

    <div class="actions">
      <button class="btn btn-primary" id="copyCmdBtn" onclick="copyText(D.copyCommand, 'Comando copiado')"></button>
      <button class="btn btn-sec" onclick="copyText(D.rawSummary, 'Acta copiada')">📋 Copiar Acta</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const D = ${serialized};
function $(id){ return document.getElementById(id); }

function init(){
  if (D.mode === "UNBANNED_DM") $("orbIco").textContent = "✅";
  else if (D.mode === "APPEAL_TICKET") $("orbIco").textContent = "📩";
  else if (D.mode === "GROUP_WARN_NO_ADMIN") $("orbIco").textContent = "⚠️";
  else $("orbIco").textContent = "🚨";

  $("titleTxt").textContent = D.title;
  $("subTxt").textContent = D.subtitle;
  $("casePill").textContent = "#" + D.caseId;
  $("badgeTxt").textContent = D.badgeText;
  $("targetTxt").textContent = D.targetPhone.startsWith("LID_") ? D.targetPhone : ("+" + D.targetPhone);
  $("lidTxt").textContent = D.targetLid ? ("LID: " + D.targetLid) : "SQL Indexed • JID & LID Active";
  $("dateSpan").textContent = D.dateStr;
  $("reasonTxt").textContent = D.reason;
  $("adminTxt").textContent = D.adminName;
  $("extraLbl").textContent = D.extraLabel;
  $("extraVal").textContent = D.extraValue;
  $("noteBox").textContent = D.footerNote;
  $("copyCmdBtn").textContent = D.copyLabel;
}

function copyText(txt, msg){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).catch(function(){});
  } else {
    const t = document.createElement("textarea");
    t.value = txt;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(t);
  }
  const el = $("toast");
  el.textContent = msg || "Copiado";
  el.classList.add("show");
  setTimeout(function(){ el.classList.remove("show"); }, 1600);
}

init();
</script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [],
        payload: html,
      },
    },
  };
}

async function sendRichOrFallback(
  sock: any,
  jid: string,
  title: string,
  footer: string,
  cardData: Parameters<typeof buildAntiRaidRichCard>[0],
  mentions: string[] = [],
) {
  try {
    const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
    const rich = new AIRich(sock).setTitle(title).setFooter(footer);
    rich.addSection(buildAntiRaidRichCard(cardData));
    await rich.send(jid, {});
  } catch {}
  await sock
    .sendMessage(jid, {
      text: cardData.rawSummary,
      ...(mentions.length ? { mentions } : {}),
    })
    .catch(() => undefined);
}

async function sendNonAdminWarningToGroup(
  sock: any,
  groupId: string,
  ban: GlobalBanRecord,
  mentionJids: string[],
) {
  if (isSupremeOwnerIdentity(ban)) return;
  const warnKey = `${groupId}:${ban.caseId}`;
  const now = Date.now();
  if (now - (warnCooldownMap.get(warnKey) || 0) < WARN_COOLDOWN_MS) return;
  warnCooldownMap.set(warnKey, now);

  const displayTag = ban.phone.startsWith("LID_")
    ? `@${cleanDigits(ban.lid)}`
    : `@${ban.phone}`;

  const warnText = [
    `╭〔 ⚠️ ${fytBold("ALERTA DE SEGURIDAD ANTI-RAID")} 〕⬣`,
    `┃ 🚨 *Usuario Sancionado Detectado en el Grupo*`,
    `╰━━━━━━━━━━━━⬣`,
    `┃ 👤 *Usuario:* ${displayTag}`,
    `┃ 🆔 *Caso SQL:* \`#${ban.caseId}\``,
    ...(ban.lid ? [`┃ 🔗 *LID:* \`${ban.lid}\``] : []),
    `┃ 📋 *Motivo:* ${ban.reason}`,
    `┃ 👮 *Sancionado por:* ${ban.adminName}`,
    `┃ 📅 *Fecha:* ${ban.dateStr}`,
    `┃`,
    `┃ ⚠️ *ATENCIÓN ADMINISTRADORES:*`,
    `┃ El bot/subbot no posee permisos de *Administrador* en este grupo para expulsar automáticamente a este usuario. Se recomienda eliminarlo de inmediato o darle admin al bot.`,
    `╰━━〔 ⚡ ${fytBold("AURA REED SECURITY")} 〕━━⬣`,
  ].join("\n");

  await sendRichOrFallback(
    sock,
    groupId,
    `⚠️ ALERTA ANTI-RAID // #${ban.caseId}`,
    "El bot requiere permisos de Administrador para expulsar al infractor",
    {
      mode: "GROUP_WARN_NO_ADMIN",
      badgeText: "PELIGRO • BOT SIN PERMISOS DE ADMIN",
      title: "Alerta Anti-Raid",
      subtitle: "SE REQUIERE ACCIÓN DE ADMINS",
      caseId: ban.caseId,
      targetPhone: ban.phone,
      targetLid: ban.lid,
      reason: ban.reason,
      adminName: ban.adminName,
      dateStr: ban.dateStr,
      extraLabel: "Acción Requerida",
      extraValue: "DAR ADMIN / EXPULSAR",
      footerNote:
        "Este usuario está en la Lista Negra Global de Aura Reed, pero ningún bot o subbot en el grupo tiene rango de administrador para sacarlo.",
      copyCommand: `.checkban ${ban.caseId}`,
      copyLabel: "🔍 Ver Caso SQL",
      rawSummary: warnText,
    },
    mentionJids,
  );
}

async function executeImmediateGroupAction(
  primarySock: any,
  groupId: string,
  ban: GlobalBanRecord,
  candidateTargetJids: string[],
  announceKick = true,
): Promise<"kicked" | "warned" | "none"> {
  if (isSupremeOwnerIdentity(ban)) {
    deleteBanInSql(ban);
    return "none";
  }
  if (!isGroupProtectionEnabled(groupId)) return "none";

  const debounceKey = `${groupId}:${ban.caseId}`;
  const now = Date.now();
  if (now - (recentActionDebounce.get(debounceKey) || 0) < 4000) return "none";
  recentActionDebounce.set(debounceKey, now);

  const allSocks = discoverAllActiveSockets(primarySock);
  const meta = await getCachedGroupMetadata(primarySock, groupId);
  const participants: any[] = meta?.participants || [];

  const targetInGroup = findParticipantEntry(participants, ban.phone, ban.lid);
  if (targetInGroup) {
    const discoveredPn = normalizePhoneJid(
      targetInGroup.phoneNumber ||
        (String(targetInGroup.id || "").endsWith("@s.whatsapp.net") ? targetInGroup.id : ""),
    );
    const discoveredLid = normalizeLid(
      targetInGroup.lid ||
        (String(targetInGroup.id || "").endsWith("@lid") ? targetInGroup.id : ""),
    );
    if (discoveredPn.phone === SUPREME_OWNER_PHONE) {
      deleteBanInSql(ban);
      return "none";
    }
    linkMissingIdentityFields(ban, {
      phone: discoveredPn.phone,
      jid: discoveredPn.jid,
      lid: discoveredLid,
    });
  }

  const removeList = Array.from(
    new Set(
      [
        targetInGroup?.id,
        targetInGroup?.lid,
        ...candidateTargetJids,
        ban.lid,
        ban.jid,
      ].filter(
        (x) =>
          typeof x === "string" &&
          x.includes("@") &&
          !isSupremeOwnerIdentity(null, x),
      ),
    ),
  );

  if (removeList.length === 0) return "none";

  const socketsInGroup: any[] = [];
  const adminSockets: any[] = [];

  if (participants.length > 0) {
    for (const s of allSocks) {
      const bot = getBotIdentifiers(s);
      const present = findParticipantEntry(participants, bot.phone, bot.lid);
      if (present) {
        socketsInGroup.push(s);
        if (present.admin === "admin" || present.admin === "superadmin") {
          adminSockets.push(s);
        }
      }
    }
  }

  const tryKickSockets = adminSockets.length > 0 ? adminSockets : [primarySock, ...socketsInGroup];
  let kickingSock: any = null;

  for (const s of tryKickSockets) {
    if (!s) continue;
    for (const targetJid of removeList) {
      try {
        await s.groupParticipantsUpdate(groupId, [targetJid], "remove");
        kickingSock = s;
        break;
      } catch {}
    }
    if (kickingSock) break;
  }

  if (kickingSock) {
    ban.kickedCount = (ban.kickedCount || 0) + 1;
    upsertBanInSql(ban);

    if (announceKick) {
      const displayUser = ban.phone.startsWith("LID_")
        ? `@${cleanDigits(ban.lid)}`
        : `@${ban.phone}`;

      const alertText = [
        `╭〔 🚨 ${fytBold("AURA REED ANTI-RAID SQL")} 〕⬣`,
        `┃ 🚫 *Expulsión Automática Ejecutada*`,
        `╰━━━━━━━━━━━━⬣`,
        `┃ 👤 *Usuario:* ${displayUser}`,
        `┃ 🆔 *Caso SQL:* \`#${ban.caseId}\``,
        ...(ban.lid ? [`┃ 🔗 *LID Vinculado:* \`${ban.lid}\``] : []),
        `┃ 📋 *Motivo:* ${ban.reason}`,
        `┃ 👮 *Sancionado por:* ${ban.adminName}`,
        `┃ 📅 *Fecha:* ${ban.dateStr}`,
        `┃`,
        `┃ ⚠️ *Este usuario está en la Lista Negra Global (JID/LID) y tiene prohibido estar en cualquier grupo con Aura Reed.*`,
        `╰━━〔 ⚡ ${fytBold("PROTECCIÓN ACTIVA")} 〕━━⬣`,
      ].join("\n");

      void sendRichOrFallback(
        kickingSock,
        groupId,
        `🚨 ANTI-RAID // #${ban.caseId}`,
        "Usuario expulsado automáticamente por Lista Negra SQL",
        {
          mode: "GROUP_AUTOKICK",
          badgeText: "ACCESO DENEGADO • LISTA NEGRA SQL",
          title: "Aura Anti-Raid",
          subtitle: "JID & LID GUARD",
          caseId: ban.caseId,
          targetPhone: ban.phone,
          targetLid: ban.lid,
          reason: ban.reason,
          adminName: ban.adminName,
          dateStr: ban.dateStr,
          extraLabel: "Intentos Bloqueados",
          extraValue: `${ban.kickedCount} expulsión(es)`,
          footerNote:
            "El usuario fue expulsado inmediatamente mediante verificación cruzada de Número, JID y LID. Usa .antiraid off si deseas apagar esta defensa.",
          copyCommand: `.checkban ${ban.caseId}`,
          copyLabel: "🔍 Ver Caso SQL",
          rawSummary: alertText,
        },
        removeList,
      );
    }

    return "kicked";
  }

  const notifierSock = socketsInGroup[0] || primarySock;
  if (notifierSock) {
    void sendNonAdminWarningToGroup(notifierSock, groupId, ban, removeList);
    return "warned";
  }

  return "none";
}

async function inspectAndEnforceEntries(
  sock: any,
  groupId: string,
  rawEntries: any[],
  db?: any,
): Promise<{ kicked: number; warned: number }> {
  if (!isGroupProtectionEnabled(groupId)) return { kicked: 0, warned: 0 };

  let kicked = 0;
  let warned = 0;

  for (const entry of rawEntries) {
    const rawStr =
      typeof entry === "string"
        ? entry
        : String(entry?.id || entry?.lid || entry?.phoneNumber || "");

    if (isSupremeOwnerIdentity(null, rawStr)) continue;

    let ban = findBanByIdentity(
      {
        jid: rawStr.endsWith("@s.whatsapp.net") ? rawStr : "",
        lid: rawStr.endsWith("@lid") ? rawStr : "",
        phone: !rawStr.endsWith("@lid") ? cleanDigits(rawStr) : "",
      },
      rawStr,
    );

    if (!ban) {
      const identity = await resolveFullIdentity(sock, db, entry, groupId);
      if (isSupremeOwnerIdentity(identity, rawStr)) continue;
      ban = findBanByIdentity(identity, rawStr);
    }

    if (!ban || isSupremeOwnerIdentity(ban)) continue;

    const candidates = [
      typeof entry === "string" ? entry : "",
      entry?.id,
      entry?.lid,
      ban.lid,
      ban.jid,
    ].filter(Boolean);

    const res = await executeImmediateGroupAction(sock, groupId, ban, candidates, true);
    if (res === "kicked") kicked++;
    else if (res === "warned") warned++;
  }

  return { kicked, warned };
}

function attachAntiRaidHooks(db?: any, currentSock?: any) {
  pruneBoundedMaps();
  getMemIndex();

  if (!gRaid.__auraAntiRaidHookedSockets) {
    gRaid.__auraAntiRaidHookedSockets = new WeakSet<object>();
  }
  const hooked = gRaid.__auraAntiRaidHookedSockets;
  const sockets = discoverAllActiveSockets(currentSock);

  for (const sock of sockets) {
    if (!sock || typeof sock !== "object" || hooked.has(sock)) continue;
    hooked.add(sock);

    sock.ev?.on?.("group-participants.update", async (ev: any) => {
      try {
        if (!ev?.id || !Array.isArray(ev.participants)) return;
        const act = String(ev.action || "").toLowerCase();
        if (act !== "add" && act !== "invite" && act !== "linked_group_join") return;
        groupMetaShortCache.delete(ev.id);
        await inspectAndEnforceEntries(sock, ev.id, ev.participants, db);
      } catch {}
    });

    sock.ev?.on?.("messages.upsert", async ({ messages, type }: any) => {
      try {
        if (type !== "notify" || !Array.isArray(messages)) return;
        const idx = getMemIndex();
        if (idx.byCase.size === 0) return;

        for (const m of messages) {
          if (!m?.message || m?.key?.fromMe) continue;
          const rJid = String(m?.key?.remoteJid || "");
          const senderPnHint = String((m?.key as any)?.participantPn || "");
          const senderJid = String(
            m?.key?.participant ||
              senderPnHint ||
              m?.key?.remoteJid ||
              "",
          );
          if (!senderJid) continue;

          if (
            cleanDigits(senderPnHint) === SUPREME_OWNER_PHONE ||
            (!senderJid.endsWith("@lid") && cleanDigits(senderJid) === SUPREME_OWNER_PHONE)
          ) {
            if (senderJid.endsWith("@lid")) {
              gRaid.__auraSupremeOwnerLid = normalizeLid(senderJid);
            }
            purgeSupremeOwnerBans();
            continue;
          }

          if (isSupremeOwnerIdentity(null, senderJid)) {
            purgeSupremeOwnerBans();
            continue;
          }

          const fastBan = findBanByIdentity(
            {
              jid: senderJid.endsWith("@s.whatsapp.net") ? senderJid : "",
              lid: senderJid.endsWith("@lid") ? senderJid : "",
              phone: !senderJid.endsWith("@lid") ? cleanDigits(senderJid) : "",
            },
            senderJid,
          );

          if (!fastBan) continue;

          if (rJid.endsWith("@g.us") && isGroupProtectionEnabled(rJid)) {
            void executeImmediateGroupAction(sock, rJid, fastBan, [senderJid], true);
          }

          const text = String(
            m.message?.conversation ||
              m.message?.extendedTextMessage?.text ||
              m.message?.imageMessage?.caption ||
              m.message?.videoMessage?.caption ||
              "",
          ).trim();

          if (/^[.!/#\\;,\\-]/.test(text)) {
            const cmdWord = text.slice(1).trim().split(/\s+/)[0]?.toLowerCase() || "";
            const allowedForBanned =
              cmdWord === "appeal" || cmdWord === "apelar" || cmdWord === "checkban";

            if (!allowedForBanned) {
              delete m.message.conversation;
              delete m.message.extendedTextMessage;
              delete m.message.imageMessage;
              delete m.message.videoMessage;

              const warnCmdKey = `cmdblock:${rJid}:${fastBan.caseId}`;
              const now = Date.now();
              if (now - (recentActionDebounce.get(warnCmdKey) || 0) > 12_000) {
                recentActionDebounce.set(warnCmdKey, now);
                void sock
                  .sendMessage(rJid, {
                    text:
                      `⛔ *COMANDO BLOQUEADO POR ANTI-RAID*\n` +
                      `Estás en la Lista Negra Global (Caso \`#${fastBan.caseId}\`).\n` +
                      `• *Motivo:* ${fastBan.reason}\n` +
                      `• Solo tienes permitido usar \`.appeal <pruebas>\` para apelar tu sanción.`,
                    ...(rJid.endsWith("@g.us") ? { mentions: [senderJid] } : {}),
                  })
                  .catch(() => undefined);
              }
            }
          }
        }
      } catch {}
    });
  }
}

getMemIndex();
attachAntiRaidHooks((globalThis as any).db);

if (!gRaid.__auraAntiRaidInterval) {
  gRaid.__auraAntiRaidInterval = setInterval(() => {
    try {
      attachAntiRaidHooks((globalThis as any).db);
    } catch {}
  }, 2500);
  gRaid.__auraAntiRaidInterval.unref?.();
}

async function sweepAndKickAcrossNetwork(
  primarySock: any,
  ban: GlobalBanRecord,
  currentGroupJid?: string,
  currentTargetRaw?: string,
): Promise<{ kickedGroups: number; warnedGroups: number }> {
  if (isSupremeOwnerIdentity(ban)) {
    deleteBanInSql(ban);
    return { kickedGroups: 0, warnedGroups: 0 };
  }

  const sockets = discoverAllActiveSockets(primarySock);
  const visitedGroups = new Set<string>();
  let kickedGroups = 0;
  let warnedGroups = 0;

  if (currentGroupJid && currentGroupJid.endsWith("@g.us") && isGroupProtectionEnabled(currentGroupJid)) {
    visitedGroups.add(currentGroupJid);
    const res = await executeImmediateGroupAction(
      primarySock,
      currentGroupJid,
      ban,
      [currentTargetRaw || "", ban.lid, ban.jid].filter(Boolean),
      true,
    );
    if (res === "kicked") kickedGroups++;
    else if (res === "warned") warnedGroups++;
  }

  const groupMap = new Map<string, any>();

  if (GROUP_METADATA_CACHE && typeof GROUP_METADATA_CACHE.entries === "function") {
    for (const [gid, meta] of GROUP_METADATA_CACHE.entries()) {
      if (gid.endsWith("@g.us") && meta?.participants) {
        groupMap.set(gid, meta);
      }
    }
  }

  await Promise.allSettled(
    sockets.map(async (s) => {
      try {
        const fetched = await Promise.race([
          s.groupFetchAllParticipating?.(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4500)),
        ]);
        if (fetched && typeof fetched === "object") {
          for (const [gid, meta] of Object.entries(fetched)) {
            if (gid.endsWith("@g.us") && (meta as any)?.participants) {
              groupMap.set(gid, meta);
            }
          }
        }
      } catch {}
    }),
  );

  const groupTasks: Promise<void>[] = [];

  for (const [groupId, meta] of groupMap.entries()) {
    if (visitedGroups.has(groupId) || !isGroupProtectionEnabled(groupId)) continue;
    const participants: any[] = meta?.participants || [];
    const targetMember = findParticipantEntry(participants, ban.phone, ban.lid);
    if (!targetMember) continue;

    visitedGroups.add(groupId);
    groupTasks.push(
      (async () => {
        const res = await executeImmediateGroupAction(
          primarySock,
          groupId,
          ban,
          [targetMember.id, targetMember.lid, ban.lid, ban.jid].filter(Boolean),
          true,
        );
        if (res === "kicked") kickedGroups++;
        else if (res === "warned") warnedGroups++;
      })(),
    );
  }

  await Promise.allSettled(groupTasks);
  return { kickedGroups, warnedGroups };
}

export default {
  name: [
    "antiraid",
    "gban",
    "raidban",
    "forceban",
    "ungban",
    "unraidban",
    "perdonar",
    "appeal",
    "apelar",
    "rejectappeal",
    "denegar",
    "checkban",
    "raidlist",
  ],
  category: "system",
  description: "Sistema Global Anti-Raid con motor SQLite, barrido instantáneo en bots/subbots, aviso sin admin y bloqueo de comandos.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, sender, msg, args = [], usedPrefix, reply, react, isOwner, isAdmin, db, groupMeta } = ctx;
    const prefix = usedPrefix || ".";
    attachAntiRaidHooks(db, sock);

    const rawBody =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      msg?.message?.imageMessage?.caption ||
      msg?.message?.videoMessage?.caption ||
      "";
    const invokedCmd = rawBody
      .trim()
      .slice(prefix.length)
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();

    const senderPnHint = String((msg?.key as any)?.participantPn || "");
    const senderRaw = String(sender || senderPnHint || msg?.key?.participant || from);
    const senderIdentity = await resolveFullIdentity(sock, db, senderRaw, groupMeta || from);

    if (!senderIdentity.phone || senderIdentity.phone.startsWith("LID_")) {
      if (cleanDigits(senderPnHint) === SUPREME_OWNER_PHONE) {
        senderIdentity.phone = SUPREME_OWNER_PHONE;
        senderIdentity.jid = SUPREME_OWNER_JID;
      }
    }

    const isSupremeOwner =
      isSupremeOwnerIdentity(senderIdentity, senderRaw) ||
      cleanDigits(senderPnHint) === SUPREME_OWNER_PHONE ||
      (Boolean(msg?.key?.fromMe) && getBotIdentifiers(sock).phone === SUPREME_OWNER_PHONE);

    if (isSupremeOwner) {
      if (senderIdentity.lid) {
        gRaid.__auraSupremeOwnerLid = normalizeLid(senderIdentity.lid);
      }
      purgeSupremeOwnerBans();
    }

    const senderDigits = isSupremeOwner
      ? SUPREME_OWNER_PHONE
      : senderIdentity.phone.startsWith("LID_")
        ? cleanDigits(senderRaw)
        : senderIdentity.phone || cleanDigits(senderRaw);

    const dbAny = db as any;
    const isStaff =
      isSupremeOwner ||
      Boolean(isOwner) ||
      Boolean((ctx as any).isMod) ||
      Boolean(dbAny?.hasRole?.(senderRaw, "owner")) ||
      Boolean(dbAny?.hasRole?.(senderRaw, "mod")) ||
      Boolean(senderIdentity.jid && dbAny?.hasRole?.(senderIdentity.jid, "owner")) ||
      Boolean(senderIdentity.jid && dbAny?.hasRole?.(senderIdentity.jid, "mod"));

    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const mentioned = context?.mentionedJid?.[0];
    const quotedParticipant = context?.participant;

    if (invokedCmd === "checkban" || (invokedCmd === "antiraid" && args[0]?.toLowerCase() === "info")) {
      const argToken = args[invokedCmd === "antiraid" ? 1 : 0] || "";
      const qRaw = mentioned || quotedParticipant || argToken;
      if (!qRaw) {
        return reply(`🔍 Indica o cita a un usuario, número, LID o ID de caso.\n*Ejemplo:* \`${prefix}checkban 573001234567\``);
      }
      const qIdentity = await resolveFullIdentity(sock, db, qRaw, groupMeta || from);
      const ban = findBanByIdentity(qIdentity, qRaw);
      if (!ban) {
        return reply(`✅ *Sin registros en SQL:* El identificador \`${qRaw}\` no posee sanciones activas.`);
      }
      return reply(
        [
          `╭〔 🗄️ ${fytBold("EXPEDIENTE SQL ANTI-RAID")} 〕⬣`,
          `┃ 🆔 *Caso:* \`#${ban.caseId}\``,
          `┃ 📱 *Número:* ${ban.phone.startsWith("LID_") ? "Oculto (Solo LID)" : `+${ban.phone}`}`,
          `┃ 🌐 *JID:* \`${ban.jid}\``,
          `┃ 🔗 *LID:* \`${ban.lid || "No vinculado aún"}\``,
          `┃ 📋 *Motivo:* ${ban.reason}`,
          `┃ 👮 *Sancionado por:* ${ban.adminName}`,
          `┃ 📅 *Fecha:* ${ban.dateStr}`,
          `┃ 🏰 *Expulsiones acumuladas:* ${ban.kickedCount}`,
          `┃ ⚖️ *Estado Apelación:* ${ban.appealStatus.toUpperCase()}`,
          ...(ban.lastAppealText ? [`┃ 💬 *Última Apelación:* ${ban.lastAppealText}`] : []),
          `╰━━〔 ⚡ ${fytBold("AURA REED SQL")} 〕━━⬣`,
        ].join("\n"),
      );
    }

    if (invokedCmd === "appeal" || invokedCmd === "apelar") {
      if (isSupremeOwner) {
        purgeSupremeOwnerBans();
        return reply(`👑 *Inmunidad Suprema Activa:* Tu cuenta (+${SUPREME_OWNER_PHONE}) es intocable y nunca puede ser sancionada.`);
      }

      const ban = findBanByIdentity(senderIdentity, senderRaw);
      if (!ban) {
        return reply(
          `✅ *No tienes sanciones activas*\nTu cuenta (Número/LID) no figura en la Lista Negra de Aura Reed.`,
        );
      }

      if (ban.appealStatus === "rejected") {
        return reply(
          `⛔ *Apelación Denegada Definitivamente*\nEl caso \`#${ban.caseId}\` ya fue revisado y rechazado por la administración.`,
        );
      }

      const appealText = args.join(" ").trim();
      if (appealText.length < 10) {
        return reply(
          `📩 *${fytBold("SISTEMA DE APELACIONES AURA REED")}*\n\n` +
            `Estás sancionado globalmente bajo el caso SQL \`#${ban.caseId}\`.\n` +
            `• *Motivo:* ${ban.reason}\n` +
            `• *Sancionado por:* ${ban.adminName}\n\n` +
            `Para enviar tu apelación escribe:\n` +
            `\`${prefix}appeal <explicación detallada y pruebas>\``,
        );
      }

      const now = Date.now();
      if (ban.lastAppealAt && now - ban.lastAppealAt < 15 * 60 * 1000) {
        const waitMin = Math.ceil((15 * 60 * 1000 - (now - ban.lastAppealAt)) / 60000);
        return reply(
          `⏳ Ya tienes una apelación en revisión. Espera *${waitMin} min* mientras el staff verifica las pruebas.`,
        );
      }

      await react("📩").catch(() => undefined);
      ban.appealStatus = "pending";
      ban.lastAppealText = appealText;
      ban.lastAppealAt = now;
      upsertBanInSql(ban);

      const idx = getMemIndex();
      const ticketSummary = [
        `╭〔 📩 ${fytBold("APELACIÓN SQL ANTI-RAID")} 〕⬣`,
        `┃ 🆔 *Caso:* \`#${ban.caseId}\``,
        `┃ 👤 *Usuario:* +${ban.phone} (${msg?.pushName || "Sin nombre"})`,
        `┃ 🔗 *LID:* \`${ban.lid || "N/A"}\``,
        `┃ 👮 *Sancionado por:* ${ban.adminName}`,
        `┃ 📋 *Motivo original:* ${ban.reason}`,
        `┃`,
        `┃ 💬 *Descargo / Evidencia:*`,
        `┃ ${appealText}`,
        `┃`,
        `┃ ✅ *Aprobar:* \`${prefix}ungban ${ban.caseId}\``,
        `┃ ❌ *Rechazar:* \`${prefix}rejectappeal ${ban.caseId} Pruebas insuficientes\``,
        `╰━━〔 ⚡ ${fytBold("AURA REED STAFF")} 〕━━⬣`,
      ].join("\n");

      for (const adminJid of idx.staffInbox) {
        await sendRichOrFallback(
          sock,
          adminJid,
          `📩 APELACIÓN // #${ban.caseId}`,
          `Solicitante: +${ban.phone}`,
          {
            mode: "APPEAL_TICKET",
            badgeText: "TICKET DE APELACIÓN ENTRANTE",
            title: "Revisión de Caso",
            subtitle: "AURA REED SQL JUSTICE",
            caseId: ban.caseId,
            targetPhone: ban.phone,
            targetLid: ban.lid,
            reason: `Motivo original: ${ban.reason}\n\nDescargo del usuario:\n"${appealText}"`,
            adminName: ban.adminName,
            dateStr: ban.dateStr,
            extraLabel: "Estado SQL",
            extraValue: "PENDIENTE",
            footerNote:
              "Puedes absolver al usuario con .ungban o denegar definitivamente su ticket con .rejectappeal",
            copyCommand: `${prefix}ungban ${ban.caseId}`,
            copyLabel: "🔓 Copiar .ungban",
            rawSummary: ticketSummary,
          },
        );
      }

      await react("✅").catch(() => undefined);
      return reply(
        `✅ *Apelación registrada en SQL (Caso #${ban.caseId})*\n\n` +
          `Tu solicitud fue enviada a los administradores de *Aura Reed*. Recibirás la resolución por mensaje privado.`,
      );
    }

    if (invokedCmd === "rejectappeal" || invokedCmd === "denegar") {
      if (!isStaff) {
        return reply("⛔ Solo el staff global de Aura Reed puede denegar apelaciones.");
      }
      const firstToken = String(args[0] || "").trim();
      const targetArg = mentioned || quotedParticipant || firstToken;
      if (!targetArg) {
        return reply(`⚠️ Uso: \`${prefix}rejectappeal <número o #caso> <motivo de rechazo>\``);
      }
      const targetId = await resolveFullIdentity(sock, db, targetArg, groupMeta || from);
      const ban = findBanByIdentity(targetId, targetArg);
      if (!ban) {
        return reply(`❌ No se encontró ningún caso activo para \`${targetArg}\`.`);
      }

      const rejectReason =
        (mentioned || quotedParticipant ? args : args.slice(1)).join(" ").trim() ||
        "Las pruebas aportadas no desvirtúan el reporte original.";
      ban.appealStatus = "rejected";
      upsertBanInSql(ban);

      const dmTarget = ban.jid.endsWith("@s.whatsapp.net") ? ban.jid : ban.lid;
      if (dmTarget) {
        await sock
          .sendMessage(dmTarget, {
            text:
              `╭〔 ⛔ ${fytBold("APELACIÓN RECHAZADA")} 〕⬣\n` +
              `┃ 🆔 *Caso:* \`#${ban.caseId}\`\n` +
              `┃ 👮 *Revisado por:* ${msg?.pushName || "Staff Aura Reed"}\n` +
              `┃ 📋 *Resolución:* ${rejectReason}\n` +
              `┃\n` +
              `┃ ⚠️ *El baneo global permanece activo de forma definitiva.*\n` +
              `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
          })
          .catch(() => undefined);
      }

      return reply(`⛔ Apelación del caso \`#${ban.caseId}\` (+${ban.phone}) marcada como *RECHAZADA*.`);
    }

    if (
      invokedCmd === "antiraid" &&
      args[0] &&
      /^(on|off|activar|desactivar|status|estado|scan|escanear)$/i.test(args[0])
    ) {
      if (!from.endsWith("@g.us")) {
        return reply("⚠️ Los subcomandos `.antiraid on | off | status | scan` solo funcionan dentro de grupos.");
      }
      if (!isAdmin && !isStaff) {
        return reply("⛔ Solo los administradores del grupo pueden gestionar el escudo Anti-Raid.");
      }

      const sub = args[0].toLowerCase();

      if (sub === "scan" || sub === "escanear") {
        await react("🔎").catch(() => undefined);
        const meta = await sock.groupMetadata(from);
        const participants = meta?.participants || [];
        const { kicked, warned } = await inspectAndEnforceEntries(sock, from, participants, db);
        await react("✅").catch(() => undefined);
        return reply(
          kicked > 0 || warned > 0
            ? `🛡️ *Escaneo SQL completado:* Expulsados: *${kicked}* | Advertidos (sin admin): *${warned}*.`
            : `✅ *Grupo limpio:* Ninguno de los ${participants.length} miembros actuales figura en la Lista Negra Global.`,
        );
      }

      if (sub === "status" || sub === "estado") {
        const active = isGroupProtectionEnabled(from);
        const totalBans = getMemIndex().byCase.size;
        return reply(
          `🛡️ *ESTADO ANTI-RAID SQL*\n\n` +
            `• *Protección en este grupo:* ${active ? "✅ ACTIVA (Persistente)" : "❌ DESACTIVADA"}\n` +
            `• *Sancionados en Base SQL:* ${totalBans}\n` +
            `• *Sockets Vigilando:* ${discoverAllActiveSockets(sock).length}\n\n` +
            `Usa \`${prefix}antiraid scan\` para escanear a los miembros actuales.`,
        );
      }

      const enable = sub === "on" || sub === "activar";
      setGroupProtection(from, enable, db);

      if (enable) {
        try {
          const meta = await sock.groupMetadata(from);
          await inspectAndEnforceEntries(sock, from, meta?.participants || [], db);
        } catch {}
      }

      return reply(
        enable
          ? `🛡️ *Anti-Raid SQL Activado y Guardado:* El estado quedó persistido en disco/SQL (no se apagará al reiniciar).`
          : `⚠️ *Anti-Raid Desactivado en este grupo:* Estado guardado en SQL/disco.`,
      );
    }

    if (invokedCmd === "raidlist" || (invokedCmd === "antiraid" && args[0]?.toLowerCase() === "list")) {
      const bans = Array.from(getMemIndex().byCase.values()).sort(
        (a, b) => b.createdAt - a.createdAt,
      );
      if (bans.length === 0) {
        return reply("🛡️ La base de datos SQL de Lista Negra Global está vacía.");
      }
      const listText = bans
        .slice(0, 25)
        .map(
          (b, i) =>
            `${i + 1}. *${b.phone.startsWith("LID_") ? b.phone : `+${b.phone}`}* [\`#${b.caseId}\`]\n` +
            `   ├ *LID:* \`${b.lid || "Pendiente"}\`\n` +
            `   ├ *Motivo:* ${b.reason}\n` +
            `   └ *Por:* ${b.adminName} (${b.dateStr})`,
        )
        .join("\n\n");
      return reply(
        `╭〔 🗄️ ${fytBold("LISTA NEGRA SQL GLOBAL")} 〕⬣\n` +
          `┃ Total registrados: *${bans.length}*\n` +
          `╰━━━━━━━━━━━━⬣\n\n${listText}`,
      );
    }

    if (invokedCmd === "ungban" || invokedCmd === "unraidban" || invokedCmd === "perdonar") {
      const senderBanRecord = findBanByIdentity(senderIdentity, senderRaw);
      if (senderBanRecord && !isSupremeOwner) {
        return reply(
          `⛔ *Auto-desbaneo Bloqueado:* Estás sancionado bajo el caso \`#${senderBanRecord.caseId}\`. Nadie puede autodesbanearse salvo el creador del sistema (+${SUPREME_OWNER_PHONE}).`,
        );
      }

      if (!isStaff) {
        return reply("⛔ Solo la administración autorizada de Aura Reed puede retirar sanciones de la base SQL.");
      }

      const firstArg = String(args[0] || "").trim();
      const isFirstArgId =
        /^#?AR-[A-Z0-9]+$/i.test(firstArg) ||
        firstArg.endsWith("@s.whatsapp.net") ||
        firstArg.endsWith("@lid") ||
        /^\+?\d{7,15}$/.test(firstArg.replace(/[-()\s]/g, ""));

      const rawTarget =
        mentioned ||
        quotedParticipant ||
        (isFirstArgId ? firstArg : isSupremeOwner ? SUPREME_OWNER_JID : "");

      if (!rawTarget) {
        return reply(
          `⚠️ Responde al mensaje del usuario, menciónalo o indica su número/código de caso (\`#AR-...\`).\n*Ejemplo:* \`${prefix}ungban 573001234567\``,
        );
      }

      const targetIdentity = await resolveFullIdentity(sock, db, rawTarget, groupMeta || from);

      if (isSupremeOwner && isSupremeOwnerIdentity(targetIdentity, rawTarget)) {
        const purged = purgeSupremeOwnerBans();
        await react("✅").catch(() => undefined);
        return reply(
          `👑 *Auto-desbaneo Supremo Ejecutado*\nTu cuenta (+${SUPREME_OWNER_PHONE}) está completamente limpia y blindada (${purged} registro(s) removidos).`,
        );
      }

      const isSelfTarget =
        (targetIdentity.phone &&
          senderIdentity.phone &&
          targetIdentity.phone === senderIdentity.phone) ||
        (targetIdentity.lid &&
          senderIdentity.lid &&
          normalizeLid(targetIdentity.lid) === normalizeLid(senderIdentity.lid));

      if (isSelfTarget && !isSupremeOwner) {
        return reply(
          `⛔ *Acción Denegada:* Ningún usuario o administrador puede autodesbanearse. Solo +${SUPREME_OWNER_PHONE} tiene ese privilegio.`,
        );
      }

      const existing = findBanByIdentity(targetIdentity, rawTarget);
      if (!existing) {
        return reply(`ℹ️ No existe ningún baneo activo en SQL para \`${rawTarget}\`.`);
      }

      if (
        !isSupremeOwner &&
        ((existing.phone && existing.phone === senderDigits) ||
          (existing.lid &&
            senderIdentity.lid &&
            normalizeLid(existing.lid) === normalizeLid(senderIdentity.lid)))
      ) {
        return reply(
          `⛔ *Acción Denegada:* No puedes quitarte tu propia sanción. Solo +${SUPREME_OWNER_PHONE} puede autodesbanearse.`,
        );
      }

      deleteBanInSql(existing);
      await react("✅").catch(() => undefined);

      const pardonDm = [
        `╭〔 ✅ ${fytBold("SANCIÓN GLOBAL RETIRADA")} 〕⬣`,
        `┃ 🆔 *Caso SQL cerrado:* \`#${existing.caseId}\``,
        `┃ 👤 *Usuario:* +${existing.phone}`,
        `┃ 👮 *Absuelto por:* ${msg?.pushName || "Staff Aura Reed"}`,
        `┃`,
        `┃ ✨ *Tu registro fue eliminado de la Lista Negra SQL (Número, JID y LID). Ya puedes usar comandos y volver a ingresar a todos los grupos de Aura Reed.*`,
        `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
      ].join("\n");

      const dmRecipient = existing.jid.endsWith("@s.whatsapp.net") ? existing.jid : existing.lid;
      if (dmRecipient) {
        void sendRichOrFallback(
          sock,
          dmRecipient,
          `✅ BANEO RETIRADO // #${existing.caseId}`,
          "Acceso restaurado en toda la red Aura Reed",
          {
            mode: "UNBANNED_DM",
            badgeText: "CUENTA ABSUELTA • ACCESO TOTAL",
            title: "Sanción Levantada",
            subtitle: "AURA REED SQL JUSTICE",
            caseId: existing.caseId,
            targetPhone: existing.phone,
            targetLid: existing.lid,
            reason: "La administración aprobó el retiro de tu sanción global.",
            adminName: msg?.pushName || "Staff Aura Reed",
            dateStr: new Date().toLocaleDateString("es-CR"),
            extraLabel: "Estado SQL",
            extraValue: "LIMPIO / LIBRE",
            footerNote: "Tanto tu número como tu identificador LID quedaron libres de restricciones.",
            copyCommand: `${prefix}menu`,
            copyLabel: "⚡ Copiar .menu",
            rawSummary: pardonDm,
          },
        );
      }

      return reply(
        `✅ *Baneo SQL Eliminado*\nEl usuario *+${existing.phone}* (Caso \`#${existing.caseId}\`) fue absuelto en toda la red.`,
      );
    }

    if (!isSupremeOwner) {
      await react("⛔").catch(() => undefined);
      return reply(
        `⛔ *${fytBold("ACCESO EXCLUSIVO DEL CREADOR")}*\n` +
          `Únicamente el dueño principal del sistema (*+${SUPREME_OWNER_PHONE}*) puede ejecutar el comando \`${prefix}gban\`.`,
      );
    }

    const firstToken = String(args[0] || "").trim();
    const isFirstArgTarget =
      firstToken.endsWith("@s.whatsapp.net") ||
      firstToken.endsWith("@lid") ||
      firstToken.startsWith("@") ||
      /^\+?\d{7,15}$/.test(firstToken.replace(/[-()\s]/g, ""));

    const rawTarget = mentioned || quotedParticipant || (isFirstArgTarget ? firstToken : "");
    if (!rawTarget) {
      return reply(
        `╭〔 🛡️ ${fytBold("PANEL ANTI-RAID SQL")} 〕⬣\n` +
          `┃ Sanciona por Número, JID o LID en toda la red.\n` +
          `╰━━━━━━━━━━━━⬣\n\n` +
          `• *Banear:* \`${prefix}gban <número/lid/@mención> <motivo>\`\n` +
          `• *Desbanear:* \`${prefix}ungban <número/lid/#caso>\`\n` +
          `• *Rechazar apelación:* \`${prefix}rejectappeal <#caso> <motivo>\`\n` +
          `• *Expediente SQL:* \`${prefix}checkban <número/lid/#caso>\`\n` +
          `• *Lista negra:* \`${prefix}raidlist\``,
      );
    }

    void react("🚨").catch(() => undefined);

    const targetIdentity = await resolveFullIdentity(sock, db, rawTarget, groupMeta || from);
    if (!targetIdentity.phone && !targetIdentity.lid) {
      await react("❌").catch(() => undefined);
      return reply("⚠️ No se pudo extraer un Número, JID ni LID válido del objetivo indicado.");
    }

    if (isSupremeOwnerIdentity(targetIdentity, rawTarget)) {
      await react("⛔").catch(() => undefined);
      return reply(`⛔ *Inmunidad Absoluta:* No se puede aplicar \`.gban\` al dueño del sistema (+${SUPREME_OWNER_PHONE}).`);
    }

    const reasonTokens = (isFirstArgTarget && !mentioned && !quotedParticipant ? args.slice(1) : args).filter(
      (tok) => !/^@\d+$/.test(String(tok).trim()),
    );
    const reason =
      reasonTokens.join(" ").trim() ||
      "Violación grave de seguridad (Raid / Doxeo / Contenido Ilegal).";

    const prevBan = findBanByIdentity(targetIdentity, rawTarget);
    const caseId =
      prevBan?.caseId || `AR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const dateStr = new Date().toLocaleDateString("es-CR");
    const adminName = String(msg?.pushName || "LuferOS DEV").trim();

    const record: GlobalBanRecord = {
      caseId,
      phone: targetIdentity.phone || prevBan?.phone || `LID_${cleanDigits(targetIdentity.lid)}`,
      jid:
        targetIdentity.jid && targetIdentity.jid.endsWith("@s.whatsapp.net")
          ? targetIdentity.jid
          : prevBan?.jid || targetIdentity.lid,
      lid: targetIdentity.lid || prevBan?.lid || "",
      reason,
      evidence: quotedParticipant ? `MsgID:${context?.stanzaId || "quoted"}` : "",
      adminName,
      adminPhone: SUPREME_OWNER_PHONE,
      createdAt: Date.now(),
      dateStr,
      appealStatus: "none",
      lastAppealText: prevBan?.lastAppealText || "",
      lastAppealAt: prevBan?.lastAppealAt || 0,
      kickedCount: prevBan?.kickedCount || 0,
    };

    upsertBanInSql(record);
    addStaffInboxSql(SUPREME_OWNER_JID);

    const { kickedGroups, warnedGroups } = await sweepAndKickAcrossNetwork(
      sock,
      record,
      from.endsWith("@g.us") ? from : undefined,
      rawTarget,
    );

    const dmText = [
      `╭〔 🚨 ${fytBold("NOTIFICACIÓN DE BANEO GLOBAL")} 〕⬣`,
      `┃ Has sido expulsado y vetado permanentemente`,
      `┃ de todos los grupos protegidos por *Aura Reed*.`,
      `╰━━━━━━━━━━━━⬣`,
      `┃ 🆔 *Caso SQL:* \`#${record.caseId}\``,
      `┃ 📋 *Motivo de la sanción:* ${record.reason}`,
      `┃ 👮 *Sancionado por:* ${record.adminName}`,
      `┃ 🏰 *Grupos expulsados:* ${kickedGroups}`,
      `┃ 📅 *Fecha:* ${record.dateStr}`,
      `┃`,
      `┃ ⚖️ *¿Consideras que fue un reporte falso?*`,
      `┃ Envía tus pruebas aquí mismo usando:`,
      `┃ \`${prefix}appeal <explicación detallada y pruebas>\``,
      `╰━━〔 ⚡ ${fytBold("AURA REED SECURITY")} 〕━━⬣`,
    ].join("\n");

    const dmRecipient = record.jid.endsWith("@s.whatsapp.net") ? record.jid : record.lid;
    if (dmRecipient) {
      void sendRichOrFallback(
        sock,
        dmRecipient,
        `🚨 BANEO GLOBAL // #${record.caseId}`,
        `Sancionado por ${record.adminName} • Usa ${prefix}appeal para apelar`,
        {
          mode: "DM_BANNED",
          badgeText: "EXPULSIÓN GLOBAL PERMANENTE",
          title: "Sanción Anti-Raid",
          subtitle: "AURA REED SQL NETWORK",
          caseId: record.caseId,
          targetPhone: record.phone,
          targetLid: record.lid,
          reason: record.reason,
          adminName: record.adminName,
          dateStr: record.dateStr,
          extraLabel: "Grupos Expulsado",
          extraValue: `${kickedGroups} grupo(s)`,
          footerNote: `La identidad del denunciante es estrictamente confidencial. Si tienes pruebas de que fue un reporte falso, escribe ${prefix}appeal seguido de tu descargo.`,
          copyCommand: `${prefix}appeal Solicito revisión del caso #${record.caseId}: `,
          copyLabel: "⚖️ Copiar .appeal",
          rawSummary: dmText,
        },
      );
    }

    const reportText = [
      `╭〔 🛡️ ${fytBold("EJECUCIÓN SQL ANTI-RAID")} 〕⬣`,
      `┃ 🆔 *Caso SQL:* \`#${record.caseId}\``,
      `┃ 🎯 *Número:* ${record.phone.startsWith("LID_") ? "Oculto (Baneo por LID)" : `+${record.phone}`}`,
      `┃ 🔗 *LID:* \`${record.lid || "Auto-detectable al entrar"}\``,
      `┃ 📋 *Motivo:* ${record.reason}`,
      `┃ 👮 *Ejecutor:* ${record.adminName}`,
      `┃ 🏰 *Expulsado de:* ${kickedGroups} grupo(s) en vivo`,
      ...(warnedGroups > 0 ? [`┃ ⚠️ *Alertados (sin admin):* ${warnedGroups} grupo(s)`] : []),
      `┃ 📩 *Notificación DM:* Enviada con opción a \`.appeal\``,
      `╰━━〔 ⚡ ${fytBold("AURA REED SQL")} 〕━━⬣`,
    ].join("\n");

    await sendRichOrFallback(
      sock,
      from,
      `🛡️ BANEO SQL EJECUTADO // #${record.caseId}`,
      `Expulsado de ${kickedGroups} grupo(s) • Alertados: ${warnedGroups}`,
      {
        mode: "GLOBAL_REPORT",
        badgeText: "OBJETIVO REGISTRADO EN SQL",
        title: "Acta de Baneo Global",
        subtitle: "AURA REED ANTI-RAID SQL",
        caseId: record.caseId,
        targetPhone: record.phone,
        targetLid: record.lid,
        reason: record.reason,
        adminName: record.adminName,
        dateStr: record.dateStr,
        extraLabel: "Red Procesada",
        extraValue: `${kickedGroups} kick / ${warnedGroups} warn`,
        footerNote:
          "El usuario quedó bloqueado de todos los comandos y grupos en SQLite + espejo en disco. Donde el bot no sea admin se envió alerta al grupo.",
        copyCommand: `${prefix}ungban ${record.caseId}`,
        copyLabel: "🔓 Copiar .ungban",
        rawSummary: reportText,
      },
    );

    await react("✅").catch(() => undefined);
  },
};
