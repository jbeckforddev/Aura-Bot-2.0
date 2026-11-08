import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { jidNormalizedUser } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import { getActivePremBots } from "../../connection/premBotManager.ts";
import { isPrimaryBotForGroup } from "../../core/groupModeration.ts";

const requireModule = createRequire(import.meta.url);

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

const DATA_DIR = path.resolve(globalThis.DATA_BASE_DIR || "./data");
const DB_PATH = path.join(DATA_DIR, "AuraAntiRaid.db");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "antiraid_global.json");

const MAX_DEBOUNCE_ENTRIES = 1500;
const DEBOUNCE_TTL_MS = 15_000;
const META_CACHE_TTL_MS = 20_000;

const gRaid = globalThis as unknown as {
  __auraAntiRaidSql?: SqlDriver;
  __auraAntiRaidMemIndex?: {
    byCase: Map<string, GlobalBanRecord>;
    byPhone: Map<string, GlobalBanRecord>;
    byJid: Map<string, GlobalBanRecord>;
    byLid: Map<string, GlobalBanRecord>;
    disabledGroups: Set<string>;
    staffInbox: Set<string>;
  };
  __auraAntiRaidHookedSockets?: WeakSet<object>;
  __auraAntiRaidInterval?: NodeJS.Timeout;
  __auraAntiRaidRecentJoins?: Map<string, number>;
  __auraAntiRaidMetaCache?: Map<string, { exp: number; meta: any }>;
  mainSocket?: any;
};

const recentJoinDebounce =
  gRaid.__auraAntiRaidRecentJoins ??
  (gRaid.__auraAntiRaidRecentJoins = new Map<string, number>());

const groupMetaShortCache =
  gRaid.__auraAntiRaidMetaCache ??
  (gRaid.__auraAntiRaidMetaCache = new Map<string, { exp: number; meta: any }>());

function pruneBoundedMaps() {
  const now = Date.now();
  if (recentJoinDebounce.size > MAX_DEBOUNCE_ENTRIES) {
    for (const [k, ts] of recentJoinDebounce.entries()) {
      if (now - ts > DEBOUNCE_TTL_MS) recentJoinDebounce.delete(k);
    }
    if (recentJoinDebounce.size > MAX_DEBOUNCE_ENTRIES) {
      recentJoinDebounce.clear();
    }
  }
  if (groupMetaShortCache.size > 200) {
    for (const [k, v] of groupMetaShortCache.entries()) {
      if (v.exp <= now) groupMetaShortCache.delete(k);
    }
  }
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
      const memBans = new Map<string, any>();
      const memGroups = new Map<string, number>();
      const memInbox = new Set<string>(["573118353868@s.whatsapp.net"]);
      driver = {
        exec: () => {},
        run: (sql: string, params: any[] = []) => {
          if (sql.includes("INSERT OR REPLACE INTO antiraid_bans")) {
            memBans.set(params[0], {
              case_id: params[0],
              phone: params[1],
              jid: params[2],
              lid: params[3],
              reason: params[4],
              evidence: params[5],
              admin_name: params[6],
              admin_phone: params[7],
              created_at: params[8],
              date_str: params[9],
              appeal_status: params[10],
              last_appeal_text: params[11],
              last_appeal_at: params[12],
              kicked_count: params[13],
            });
          } else if (sql.includes("DELETE FROM antiraid_bans")) {
            memBans.delete(params[0]);
          } else if (sql.includes("INSERT OR REPLACE INTO antiraid_groups")) {
            memGroups.set(params[0], params[1]);
          } else if (sql.includes("INSERT OR IGNORE INTO antiraid_inbox")) {
            memInbox.add(params[0]);
          }
        },
        get: () => null,
        all: (sql: string) => {
          if (sql.includes("FROM antiraid_bans")) return Array.from(memBans.values());
          if (sql.includes("FROM antiraid_groups")) {
            return Array.from(memGroups.entries()).map(([group_jid, enabled]) => ({
              group_jid,
              enabled,
            }));
          }
          if (sql.includes("FROM antiraid_inbox")) {
            return Array.from(memInbox).map((admin_jid) => ({ admin_jid }));
          }
          return [];
        },
      };
    }
  }

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
    "573118353868@s.whatsapp.net",
  ]);

  gRaid.__auraAntiRaidSql = driver;
  return driver;
}

function rowToRecord(r: any): GlobalBanRecord {
  return {
    caseId: String(r.case_id || ""),
    phone: String(r.phone || ""),
    jid: String(r.jid || ""),
    lid: String(r.lid || ""),
    reason: String(r.reason || ""),
    evidence: String(r.evidence || ""),
    adminName: String(r.admin_name || ""),
    adminPhone: String(r.admin_phone || ""),
    createdAt: Number(r.created_at || Date.now()),
    dateStr: String(r.date_str || ""),
    appealStatus: (r.appeal_status as "none" | "pending" | "rejected") || "none",
    lastAppealText: String(r.last_appeal_text || ""),
    lastAppealAt: Number(r.last_appeal_at || 0),
    kickedCount: Number(r.kicked_count || 0),
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
    staffInbox: new Set<string>(["573118353868@s.whatsapp.net"]),
  };

  gRaid.__auraAntiRaidMemIndex = index;

  if (existsSync(LEGACY_JSON_PATH)) {
    try {
      const legacy = JSON.parse(readFileSync(LEGACY_JSON_PATH, "utf8"));
      if (legacy?.bans && typeof legacy.bans === "object") {
        for (const b of Object.values(legacy.bans) as any[]) {
          if (!b?.caseId) continue;
          const rec: GlobalBanRecord = {
            caseId: String(b.caseId),
            phone: String(b.phone || ""),
            jid: String(b.jid || `${b.phone}@s.whatsapp.net`),
            lid: String(b.lid || ""),
            reason: String(b.reason || "Infracción global"),
            evidence: String(b.evidence || ""),
            adminName: String(b.adminName || "Staff Aura Reed"),
            adminPhone: String(b.adminPhone || ""),
            createdAt: Number(b.createdAt || Date.now()),
            dateStr: String(b.dateStr || new Date().toLocaleDateString("es-CR")),
            appealStatus: b.appealStatus || "none",
            lastAppealText: String(b.lastAppealText || ""),
            lastAppealAt: Number(b.lastAppealAt || 0),
            kickedCount: 0,
          };
          upsertBanInSql(rec);
        }
      }
      if (Array.isArray(legacy?.disabledGroups)) {
        for (const gid of legacy.disabledGroups) {
          sql.run(
            "INSERT OR REPLACE INTO antiraid_groups (group_jid, enabled, updated_at) VALUES (?, 0, ?)",
            [String(gid), Date.now()],
          );
        }
      }
      renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
    } catch {}
  }

  for (const r of sql.all("SELECT * FROM antiraid_bans")) {
    const rec = rowToRecord(r);
    indexRecordInMemory(rec);
  }
  for (const g of sql.all("SELECT * FROM antiraid_groups WHERE enabled = 0")) {
    if (g?.group_jid) index.disabledGroups.add(String(g.group_jid));
  }
  for (const a of sql.all("SELECT * FROM antiraid_inbox")) {
    if (a?.admin_jid) index.staffInbox.add(String(a.admin_jid));
  }

  return index;
}

function indexRecordInMemory(rec: GlobalBanRecord) {
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
  const sql = initSqlDriver();
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
  indexRecordInMemory(rec);
}

function deleteBanInSql(rec: GlobalBanRecord) {
  const sql = initSqlDriver();
  sql.run("DELETE FROM antiraid_bans WHERE case_id = ?", [rec.caseId]);
  unindexRecordFromMemory(rec);
}

function addStaffInboxSql(adminJid: string) {
  if (!adminJid.endsWith("@s.whatsapp.net")) return;
  const sql = initSqlDriver();
  sql.run("INSERT OR IGNORE INTO antiraid_inbox (admin_jid) VALUES (?)", [adminJid]);
  getMemIndex().staffInbox.add(adminJid);
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

async function getCachedGroupMetadata(sock: any, groupId: string): Promise<any> {
  const now = Date.now();
  const cached = groupMetaShortCache.get(groupId);
  if (cached && cached.exp > now) return cached.meta;
  try {
    const meta = await sock.groupMetadata(groupId);
    if (meta) {
      groupMetaShortCache.set(groupId, { exp: now + META_CACHE_TTL_MS, meta });
    }
    return meta;
  } catch {
    return null;
  }
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
    const lidDigits = cleanDigits(lid);
    for (const p of groupParticipants) {
      const pId = String(p?.id || "");
      const pLid = normalizeLid(p?.lid || (pId.endsWith("@lid") ? pId : ""));
      const pPhoneNorm = normalizePhoneJid(
        p?.phoneNumber || (pId.endsWith("@s.whatsapp.net") ? pId : ""),
      );

      const matchesPhone = phone && pPhoneNorm.phone === phone;
      const matchesLid =
        (lid && pLid === lid) ||
        (lidDigits && cleanDigits(pLid) === lidDigits) ||
        (!phone && !lid && cleanDigits(rawInput) && cleanDigits(pLid) === cleanDigits(rawInput));

      if (matchesPhone || matchesLid) {
        if (!phone && pPhoneNorm.phone) {
          phone = pPhoneNorm.phone;
          jid = pPhoneNorm.jid;
        }
        if (!lid && pLid) {
          lid = pLid;
        }
        if (phone && lid) break;
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

  if (db && typeof db.getUser === "function") {
    try {
      const uRec =
        (jid && db.getUser(jid)) ||
        (lid && db.getUser(lid)) ||
        (phone && db.getUser(phone));
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

  if (phone && !lid && typeof sock?.onWhatsApp === "function") {
    try {
      const [waRes] = (await Promise.race([
        sock.onWhatsApp(jid),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 2000)),
      ])) ?? [];
      if (waRes?.lid) {
        lid = normalizeLid(waRes.lid);
      }
    } catch {}
  }

  if (!phone && lid) {
    const lidDigits = cleanDigits(lid);
    phone = `LID_${lidDigits}`;
    jid = lid;
  }

  return { phone, jid, lid };
}

function findBanByIdentity(identity: Partial<ResolvedIdentity>, rawFallback?: string): GlobalBanRecord | null {
  const idx = getMemIndex();

  if (rawFallback) {
    const byCase = idx.byCase.get(rawFallback.replace(/^#/, "").toUpperCase());
    if (byCase) return byCase;
  }

  if (identity.phone && idx.byPhone.has(identity.phone)) {
    const rec = idx.byPhone.get(identity.phone)!;
    linkMissingIdentityFields(rec, identity);
    return rec;
  }

  if (identity.jid && idx.byJid.has(identity.jid.toLowerCase())) {
    const rec = idx.byJid.get(identity.jid.toLowerCase())!;
    linkMissingIdentityFields(rec, identity);
    return rec;
  }

  if (identity.lid) {
    const normLid = normalizeLid(identity.lid);
    if (normLid && idx.byLid.has(normLid)) {
      const rec = idx.byLid.get(normLid)!;
      linkMissingIdentityFields(rec, identity);
      return rec;
    }
    const lidDigits = cleanDigits(normLid);
    if (lidDigits && idx.byPhone.has(`LID_${lidDigits}`)) {
      const rec = idx.byPhone.get(`LID_${lidDigits}`)!;
      linkMissingIdentityFields(rec, identity);
      return rec;
    }
  }

  if (rawFallback) {
    const d = cleanDigits(rawFallback);
    if (d) {
      if (idx.byPhone.has(d)) return idx.byPhone.get(d)!;
      if (idx.byPhone.has(`LID_${d}`)) return idx.byPhone.get(`LID_${d}`)!;
      if (idx.byLid.has(`${d}@lid`)) return idx.byLid.get(`${d}@lid`)!;
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

  if (changed) {
    upsertBanInSql(rec);
  }
}

function isGroupProtectionEnabled(groupId: string, db?: any): boolean {
  const idx = getMemIndex();
  if (idx.disabledGroups.has(groupId)) return false;
  try {
    const gRec = db?.getGroup?.(groupId);
    if (gRec && gRec.antiraid === false) return false;
  } catch {}
  return true;
}

function setGroupProtection(groupId: string, enabled: boolean, db?: any) {
  const sql = initSqlDriver();
  const idx = getMemIndex();
  sql.run(
    "INSERT OR REPLACE INTO antiraid_groups (group_jid, enabled, updated_at) VALUES (?, ?, ?)",
    [groupId, enabled ? 1 : 0, Date.now()],
  );
  if (enabled) idx.disabledGroups.delete(groupId);
  else idx.disabledGroups.add(groupId);
  try {
    db?.setGroup?.(groupId, { antiraid: enabled ? 1 : 0 });
  } catch {}
}

function getAllActiveSockets(currentSock?: any): any[] {
  const list: any[] = [];
  if (currentSock) list.push(currentSock);
  if (gRaid.mainSocket) list.push(gRaid.mainSocket);
  try {
    const prems = getActivePremBots?.() || [];
    list.push(...prems);
  } catch {}
  try {
    const subs = getActiveSubBots?.() || [];
    list.push(...subs);
  } catch {}

  const unique: any[] = [];
  const seenIds = new Set<string>();
  for (const s of list) {
    const realSock = s?.sock ?? s;
    if (!realSock || (realSock as any).isClosed) continue;
    const id = jidNormalizedUser(realSock.user?.id || "");
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    unique.push(realSock);
  }
  return unique;
}

function buildAntiRaidRichCard(data: {
  mode: "DM_BANNED" | "GROUP_AUTOKICK" | "APPEAL_TICKET" | "UNBANNED_DM" | "GLOBAL_REPORT";
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

async function enforceBanInGroupOnJoin(
  sock: any,
  groupId: string,
  rawEntries: any[],
  db?: any,
): Promise<number> {
  if (!isGroupProtectionEnabled(groupId, db)) return 0;
  if (db && typeof isPrimaryBotForGroup === "function") {
    try {
      if (!isPrimaryBotForGroup(sock, groupId, db)) return 0;
    } catch {}
  }

  let kickedNow = 0;

  for (const entry of rawEntries) {
    const identity = await resolveFullIdentity(sock, db, entry, groupId);
    const ban = findBanByIdentity(identity, typeof entry === "string" ? entry : "");
    if (!ban) continue;

    const debounceKey = `${groupId}:${ban.caseId}`;
    const now = Date.now();
    if (now - (recentJoinDebounce.get(debounceKey) || 0) < DEBOUNCE_TTL_MS) continue;
    recentJoinDebounce.set(debounceKey, now);

    const targetsToRemove = new Set<string>();
    if (typeof entry === "string" && entry.includes("@")) targetsToRemove.add(entry);
    else if (typeof entry === "object" && entry) {
      if (entry.id) targetsToRemove.add(String(entry.id));
      if (entry.lid) targetsToRemove.add(String(entry.lid));
    }
    if (identity.jid && identity.jid.includes("@")) targetsToRemove.add(identity.jid);
    if (identity.lid && identity.lid.includes("@")) targetsToRemove.add(identity.lid);

    let removedSuccess = false;
    for (const candidateJid of targetsToRemove) {
      try {
        await sock.groupParticipantsUpdate(groupId, [candidateJid], "remove");
        removedSuccess = true;
        break;
      } catch {}
    }

    if (!removedSuccess) continue;

    kickedNow++;
    ban.kickedCount = (ban.kickedCount || 0) + 1;
    upsertBanInSql(ban);

    const displayUser = ban.phone.startsWith("LID_") ? `@${cleanDigits(ban.lid)}` : `@${ban.phone}`;
    const mentionList = Array.from(targetsToRemove);

    const alertText = [
      `╭〔 🚨 ${fytBold("AURA REED ANTI-RAID SQL")} 〕⬣`,
      `┃ 🚫 *Ingreso Bloqueado Automáticamente*`,
      `╰━━━━━━━━━━━━⬣`,
      `┃ 👤 *Usuario:* ${displayUser}`,
      `┃ 🆔 *Caso SQL:* \`#${ban.caseId}\``,
      ...(ban.lid ? [`┃ 🔗 *LID Vinculado:* \`${ban.lid}\``] : []),
      `┃ 📋 *Motivo:* ${ban.reason}`,
      `┃ 👮 *Sancionado por:* ${ban.adminName}`,
      `┃ 📅 *Fecha:* ${ban.dateStr}`,
      `┃`,
      `┃ ⚠️ *Este usuario está en la Lista Negra Global (JID/LID) y no puede unirse a ningún grupo donde esté Aura Reed.*`,
      `╰━━〔 ⚡ ${fytBold("PROTECCIÓN ACTIVA")} 〕━━⬣`,
    ].join("\n");

    await sendRichOrFallback(
      sock,
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
          "El usuario fue detectado mediante verificación cruzada de Número, JID y LID. Los administradores pueden usar .antiraid off si desean desactivar el filtro en este grupo.",
        copyCommand: `.checkban ${ban.caseId}`,
        copyLabel: "🔍 Ver Caso SQL",
        rawSummary: alertText,
      },
      mentionList,
    );
  }

  return kickedNow;
}

function attachAntiRaidHooks(db?: any) {
  pruneBoundedMaps();

  if (!gRaid.__auraAntiRaidHookedSockets) {
    gRaid.__auraAntiRaidHookedSockets = new WeakSet<object>();
  }
  const hooked = gRaid.__auraAntiRaidHookedSockets;
  const sockets = getAllActiveSockets();

  for (const sock of sockets) {
    if (!sock || typeof sock !== "object" || hooked.has(sock)) continue;
    hooked.add(sock);

    sock.ev?.on?.("group-participants.update", async (ev: any) => {
      try {
        if (!ev?.id || !Array.isArray(ev.participants)) return;
        const act = String(ev.action || "").toLowerCase();
        if (act !== "add" && act !== "invite" && act !== "linked_group_join") return;
        groupMetaShortCache.delete(ev.id);
        await enforceBanInGroupOnJoin(sock, ev.id, ev.participants, db);
      } catch {}
    });

    sock.ev?.on?.("messages.upsert", async ({ messages, type }: any) => {
      try {
        if (type !== "notify" || !Array.isArray(messages)) return;
        const idx = getMemIndex();
        if (idx.byCase.size === 0) return;

        for (const m of messages) {
          const rJid = String(m?.key?.remoteJid || "");
          if (!rJid.endsWith("@g.us") || m?.key?.fromMe) continue;
          if (idx.disabledGroups.has(rJid)) continue;

          const participant = String(m?.key?.participant || "");
          const altParticipant = String((m?.key as any)?.participantPn || (m as any)?.participant || "");
          if (!participant && !altParticipant) continue;

          const fastHit =
            findBanByIdentity({
              jid: participant.endsWith("@s.whatsapp.net") ? participant : altParticipant,
              lid: participant.endsWith("@lid") ? participant : "",
              phone: cleanDigits(participant.endsWith("@s.whatsapp.net") ? participant : altParticipant),
            }) || findBanByIdentity({}, participant);

          if (fastHit) {
            await enforceBanInGroupOnJoin(sock, rJid, [participant], db);
          }
        }
      } catch {}
    });
  }
}

if (!gRaid.__auraAntiRaidInterval) {
  gRaid.__auraAntiRaidInterval = setInterval(() => {
    try {
      attachAntiRaidHooks((globalThis as any).db);
    } catch {}
  }, 6000);
  gRaid.__auraAntiRaidInterval.unref?.();
}

async function sweepAndKickAcrossNetwork(
  sockets: any[],
  ban: GlobalBanRecord,
  db?: any,
): Promise<number> {
  let kickedGroupsCount = 0;
  const visitedGroups = new Set<string>();
  const targetCleanPhone = ban.phone.startsWith("LID_") ? "" : ban.phone;
  const targetCleanLid = cleanDigits(ban.lid);

  for (const s of sockets) {
    let participating: Record<string, any> = {};
    try {
      participating = (await s.groupFetchAllParticipating?.()) || {};
    } catch {
      continue;
    }

    for (const [groupId, meta] of Object.entries(participating)) {
      if (!groupId.endsWith("@g.us") || visitedGroups.has(groupId)) continue;
      if (!isGroupProtectionEnabled(groupId, db)) continue;

      const participants: any[] = meta?.participants || [];
      const botId = jidNormalizedUser(s.user?.id || "");
      const botLid = cleanDigits(s.user?.lid);

      const botMember = participants.find((p) => {
        const pId = jidNormalizedUser(p?.id || "");
        const pLid = cleanDigits(p?.lid);
        return pId === botId || (botLid && pLid === botLid);
      });

      const isBotAdmin =
        botMember?.admin === "admin" || botMember?.admin === "superadmin";
      if (!isBotAdmin) continue;

      const targetMember = participants.find((p) => {
        const pId = String(p?.id || "");
        const pLid = String(p?.lid || (pId.endsWith("@lid") ? pId : ""));
        const pPhone = cleanDigits(
          p?.phoneNumber || (pId.endsWith("@s.whatsapp.net") ? pId : ""),
        );
        const pLidDigits = cleanDigits(pLid);

        if (targetCleanPhone && pPhone === targetCleanPhone) return true;
        if (targetCleanLid && pLidDigits === targetCleanLid) return true;
        if (targetCleanPhone && cleanDigits(pId) === targetCleanPhone) return true;
        return false;
      });

      if (!targetMember) continue;

      const discoveredPn = normalizePhoneJid(
        targetMember.phoneNumber ||
          (String(targetMember.id || "").endsWith("@s.whatsapp.net") ? targetMember.id : ""),
      );
      const discoveredLid = normalizeLid(
        targetMember.lid ||
          (String(targetMember.id || "").endsWith("@lid") ? targetMember.id : ""),
      );
      linkMissingIdentityFields(ban, {
        phone: discoveredPn.phone,
        jid: discoveredPn.jid,
        lid: discoveredLid,
      });

      const candidateJids = [targetMember.id, targetMember.lid].filter(Boolean);
      let kickedHere = false;
      for (const cJid of candidateJids) {
        try {
          await s.groupParticipantsUpdate(groupId, [cJid], "remove");
          kickedHere = true;
          break;
        } catch {}
      }

      if (!kickedHere) continue;

      visitedGroups.add(groupId);
      kickedGroupsCount++;

      const displayTag = ban.phone.startsWith("LID_")
        ? `@${cleanDigits(ban.lid)}`
        : `@${ban.phone}`;

      const groupNotice = [
        `╭〔 🚨 ${fytBold("EXPULSIÓN GLOBAL ANTI-RAID")} 〕⬣`,
        `┃ 👤 *Usuario:* ${displayTag}`,
        `┃ 🆔 *Caso SQL:* \`#${ban.caseId}\``,
        `┃ 📋 *Motivo:* ${ban.reason}`,
        `┃ 👮 *Sancionado por:* ${ban.adminName}`,
        `┃`,
        `┃ 🛡️ *Eliminado permanentemente de todos los grupos protegidos por Aura Reed.*`,
        `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
      ].join("\n");

      await s
        .sendMessage(groupId, {
          text: groupNotice,
          mentions: candidateJids,
        })
        .catch(() => undefined);
    }
  }

  if (kickedGroupsCount > 0) {
    ban.kickedCount = (ban.kickedCount || 0) + kickedGroupsCount;
    upsertBanInSql(ban);
  }

  return kickedGroupsCount;
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
  description: "Sistema Global Anti-Raid con motor SQLite, detección dual JID/LID, auto-kick y apelaciones.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, sender, msg, args = [], usedPrefix, reply, react, isOwner, isAdmin, db, groupMeta } = ctx;
    const prefix = usedPrefix || ".";
    getMemIndex();
    attachAntiRaidHooks(db);

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

    const senderRaw = String(sender || msg?.key?.participant || from);
    const senderIdentity = await resolveFullIdentity(sock, db, senderRaw, groupMeta || from);
    const senderDigits = senderIdentity.phone.startsWith("LID_")
      ? cleanDigits(senderRaw)
      : senderIdentity.phone || cleanDigits(senderRaw);

    const dbAny = db as any;
    const isStaff =
      Boolean(isOwner) ||
      Boolean((ctx as any).isMod) ||
      Boolean(msg?.key?.fromMe) ||
      senderDigits === "573118353868" ||
      Boolean(dbAny?.hasRole?.(senderRaw, "owner")) ||
      Boolean(dbAny?.hasRole?.(senderRaw, "mod")) ||
      Boolean(senderIdentity.jid && dbAny?.hasRole?.(senderIdentity.jid, "owner")) ||
      Boolean(senderIdentity.jid && dbAny?.hasRole?.(senderIdentity.jid, "mod"));

    if (invokedCmd === "checkban" || (invokedCmd === "antiraid" && args[0]?.toLowerCase() === "info")) {
      const qRaw =
        args[invokedCmd === "antiraid" ? 1 : 0] ||
        msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
        msg?.message?.extendedTextMessage?.contextInfo?.participant ||
        "";
      if (!qRaw) {
        return reply(`🔍 Indica un número, JID, LID o ID de caso.\n*Ejemplo:* \`${prefix}checkban 573001234567\``);
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
      const ban = findBanByIdentity(senderIdentity, senderRaw);
      if (!ban) {
        return reply(
          `✅ *No tienes sanciones activas*\nTu cuenta (Número/LID) no figura en la base de datos SQL de Lista Negra de Aura Reed.`,
        );
      }

      if (ban.appealStatus === "rejected") {
        return reply(
          `⛔ *Apelación Denegada Definitivamente*\nEl caso \`#${ban.caseId}\` ya fue revisado y rechazado por la administración de Aura Reed.`,
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
            `\`${prefix}appeal <explicación detallada y enlaces de evidencia>\``,
        );
      }

      const now = Date.now();
      if (ban.lastAppealAt && now - ban.lastAppealAt < 15 * 60 * 1000) {
        const waitMin = Math.ceil((15 * 60 * 1000 - (now - ban.lastAppealAt)) / 60000);
        return reply(
          `⏳ Ya tienes una apelación en cola. Espera *${waitMin} min* mientras el staff revisa las pruebas.`,
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
          `Tu solicitud fue enviada a los administradores de *Aura Reed*. Recibirás la respuesta en este chat privado.`,
      );
    }

    if (invokedCmd === "rejectappeal" || invokedCmd === "denegar") {
      if (!isStaff) {
        return reply("⛔ Solo el staff global de Aura Reed puede denegar apelaciones.");
      }
      const targetArg = args[0] || "";
      if (!targetArg) {
        return reply(`⚠️ Uso: \`${prefix}rejectappeal <número o #caso> <motivo de rechazo>\``);
      }
      const targetId = await resolveFullIdentity(sock, db, targetArg, groupMeta || from);
      const ban = findBanByIdentity(targetId, targetArg);
      if (!ban) {
        return reply(`❌ No se encontró ningún caso activo para \`${targetArg}\`.`);
      }

      const rejectReason =
        args.slice(1).join(" ").trim() || "Las pruebas aportadas no desvirtúan el reporte original.";
      ban.appealStatus = "rejected";
      upsertBanInSql(ban);

      if (ban.jid && ban.jid.endsWith("@s.whatsapp.net")) {
        await sock
          .sendMessage(ban.jid, {
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
        const kicked = await enforceBanInGroupOnJoin(sock, from, participants, db);
        await react("✅").catch(() => undefined);
        return reply(
          kicked > 0
            ? `🛡️ *Escaneo SQL completado:* Se detectaron y expulsaron a *${kicked}* usuario(s) de la Lista Negra Global.`
            : `✅ *Grupo limpio:* Ninguno de los ${participants.length} miembros actuales figura en la Lista Negra Global (JID/LID).`,
        );
      }

      if (sub === "status" || sub === "estado") {
        const active = isGroupProtectionEnabled(from, db);
        const totalBans = getMemIndex().byCase.size;
        return reply(
          `🛡️ *ESTADO ANTI-RAID SQL*\n\n` +
            `• *Protección en este grupo:* ${active ? "✅ ACTIVA" : "❌ DESACTIVADA"}\n` +
            `• *Sancionados en Base SQL:* ${totalBans}\n` +
            `• *Detección:* Número + JID + LID cruzado\n\n` +
            `Usa \`${prefix}antiraid scan\` para escanear a los miembros actuales.`,
        );
      }

      const enable = sub === "on" || sub === "activar";
      setGroupProtection(from, enable, db);

      if (enable) {
        try {
          const meta = await sock.groupMetadata(from);
          await enforceBanInGroupOnJoin(sock, from, meta?.participants || [], db);
        } catch {}
      }

      return reply(
        enable
          ? `🛡️ *Anti-Raid SQL Activado:* El bot verificará el Número, JID y LID de cada persona que ingrese y expulsará a cualquier sancionado global.`
          : `⚠️ *Anti-Raid Desactivado:* Este grupo ya no expulsará automáticamente a los usuarios de la lista negra.`,
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
      if (!isStaff) {
        return reply("⛔ Solo los administradores globales de Aura Reed pueden retirar sanciones de la base SQL.");
      }

      const context = msg?.message?.extendedTextMessage?.contextInfo;
      const rawTarget = args[0] || context?.mentionedJid?.[0] || context?.participant || "";
      if (!rawTarget) {
        return reply(
          `⚠️ Indica el número, LID, mención o código de caso (\`#AR-...\`).\n*Ejemplo:* \`${prefix}ungban 573001234567\``,
        );
      }

      const targetIdentity = await resolveFullIdentity(sock, db, rawTarget, groupMeta || from);
      const existing = findBanByIdentity(targetIdentity, rawTarget);
      if (!existing) {
        return reply(`ℹ️ No existe ningún baneo activo en SQL para \`${rawTarget}\`.`);
      }

      deleteBanInSql(existing);
      await react("✅").catch(() => undefined);

      const pardonDm = [
        `╭〔 ✅ ${fytBold("SANCIÓN GLOBAL RETIRADA")} 〕⬣`,
        `┃ 🆔 *Caso SQL cerrado:* \`#${existing.caseId}\``,
        `┃ 👤 *Usuario:* +${existing.phone}`,
        `┃ 👮 *Absuelto por:* ${msg?.pushName || "Staff Aura Reed"}`,
        `┃`,
        `┃ ✨ *Tu registro fue eliminado de la Lista Negra SQL (Número, JID y LID). Ya puedes volver a ingresar a todos los grupos de Aura Reed.*`,
        `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
      ].join("\n");

      if (existing.jid && existing.jid.endsWith("@s.whatsapp.net")) {
        await sendRichOrFallback(
          sock,
          existing.jid,
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

    if (!isStaff) {
      return reply(
        `🛡️ *${fytBold("SISTEMA ANTI-RAID SQL AURA REED")}*\n\n` +
          `• Apelar sanción: \`${prefix}appeal <pruebas>\`\n` +
          `• Consultar estado: \`${prefix}checkban <número/caso>\`\n` +
          `• Admins de grupo: \`${prefix}antiraid on | off | scan | status\``,
      );
    }

    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const mentioned = context?.mentionedJid?.[0];
    const quotedParticipant = context?.participant;
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
          `• *Lista negra:* \`${prefix}raidlist\`\n` +
          `• *Escaneo en grupo:* \`${prefix}antiraid scan\``,
      );
    }

    await react("🚨").catch(() => undefined);

    const targetIdentity = await resolveFullIdentity(sock, db, rawTarget, groupMeta || from);
    if (!targetIdentity.phone && !targetIdentity.lid) {
      await react("❌").catch(() => undefined);
      return reply("⚠️ No se pudo extraer un Número, JID ni LID válido del objetivo indicado.");
    }

    if (
      targetIdentity.phone === "573118353868" ||
      cleanDigits(targetIdentity.jid) === "573118353868"
    ) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ No está permitido sancionar globalmente al propietario del sistema.");
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
    const adminName = String(msg?.pushName || "Staff Aura Reed").trim();

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
      adminPhone: senderDigits,
      createdAt: Date.now(),
      dateStr,
      appealStatus: "none",
      lastAppealText: prevBan?.lastAppealText || "",
      lastAppealAt: prevBan?.lastAppealAt || 0,
      kickedCount: prevBan?.kickedCount || 0,
    };

    upsertBanInSql(record);
    if (senderIdentity.jid && senderIdentity.jid.endsWith("@s.whatsapp.net")) {
      addStaffInboxSql(senderIdentity.jid);
    }

    const allSockets = getAllActiveSockets(sock);
    const kickedGroups = await sweepAndKickAcrossNetwork(allSockets, record, db);

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
      await sendRichOrFallback(
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
      `┃ 📩 *Notificación DM:* Enviada con opción a \`.appeal\``,
      `╰━━〔 ⚡ ${fytBold("AURA REED SQL")} 〕━━⬣`,
    ].join("\n");

    await sendRichOrFallback(
      sock,
      from,
      `🛡️ BANEO SQL EJECUTADO // #${record.caseId}`,
      `Expulsado de ${kickedGroups} grupo(s) • JID & LID bloqueados`,
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
        extraLabel: "Grupos Limpiados",
        extraValue: `${kickedGroups} grupo(s)`,
        footerNote:
          "El usuario quedó indexado en SQLite por Número, JID y LID. Cualquier intento de ingreso futuro será bloqueado en el acto.",
        copyCommand: `${prefix}ungban ${record.caseId}`,
        copyLabel: "🔓 Copiar .ungban",
        rawSummary: reportText,
      },
    );

    await react("✅").catch(() => undefined);
  },
};
