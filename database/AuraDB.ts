import DataBase from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import "../config.ts";
import type {
  IDatabase,
  DatabaseUser,
  DatabaseGroup,
  DatabaseBot,
  UserRole,
  TopMsgUser,
  UserDbRow,
  GroupDbRow,
  BotDbRow,
} from "../types/index";

const ECONOMY_LAST_COLUMNS = {
  lastDaily: "LastEconomyDaily",
  lastWeekly: "LastEconomyWeekly",
  lastMonthly: "LastEconomyMonthly",
  lastFortnightly: "LastEconomyFortnightly",
  lastWork: "LastEconomyWork",
  lastPpt: "LastEconomyPpt",
  lastMine: "LastEconomyMine",
  lastHunt: "LastEconomyHunt",
  lastCrime: "LastEconomyCrime",
  lastSlut: "LastEconomySlut",
  lastSteal: "LastEconomySteal",
  lastAdventure: "LastEconomyAdventure",
  lastCf: "LastEconomyCf",
  lastRoulete: "LastEconomyRoulete",
  lastAura: "LastEconomyAura",
  lastRob: "LastEconomyRob",
} as const;

export type {
  DatabaseUser,
  DatabaseGroup,
  DatabaseBot,
  UserRole,
  IDatabase,
  UserDbRow,
  GroupDbRow,
  BotDbRow,
};

const DATA_BASE_DIR = globalThis.DATA_BASE_DIR;
if (!existsSync(DATA_BASE_DIR)) {
  mkdirSync(DATA_BASE_DIR, { recursive: true });
}

const db_instance = new DataBase(`${DATA_BASE_DIR}/Aura.db`);
db_instance.pragma("journal_mode = WAL");
db_instance.pragma("synchronous = NORMAL");
db_instance.pragma("foreign_keys = ON");
db_instance.pragma("wal_checkpoint = 1000");
db_instance.pragma("busy_timeout = 2000");
db_instance.pragma("cache_size = -4000");

db_instance.exec(`
  CREATE TABLE IF NOT EXISTS users (
    jid TEXT PRIMARY KEY,
    lid TEXT,
    username TEXT,
    phone_number TEXT,
    role TEXT DEFAULT 'user',
    is_banned INTEGER DEFAULT 0,
    self INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 100000,
    bank INTEGER DEFAULT 10000,
    marriage_to TEXT DEFAULT NULL,
    name TEXT DEFAULT NULL,
    genre TEXT DEFAULT 'Unknown',
    birth_date TEXT DEFAULT NULL,
    description TEXT DEFAULT 'Sin descripcion',
    aura_points INTEGER DEFAULT 0,
    aura_level INTEGER DEFAULT 1,
    stickerPackAuthor TEXT DEFAULT NULL,
    stickerPackName TEXT DEFAULT NULL,
    cmdsUsedCount INTEGER DEFAULT 0,
    LastEconomyDaily INTEGER DEFAULT 0,
    LastEconomyWeekly INTEGER DEFAULT 0,
    LastEconomyMonthly INTEGER DEFAULT 0,
    LastEconomyFortnightly INTEGER DEFAULT 0,
    LastEconomyWork INTEGER DEFAULT 0,
    LastEconomyPpt INTEGER DEFAULT 0,
    LastEconomyMine INTEGER DEFAULT 0,
    LastEconomyHunt INTEGER DEFAULT 0,
    LastEconomyCrime INTEGER DEFAULT 0,
    LastEconomySlut INTEGER DEFAULT 0,
    LastEconomySteal INTEGER DEFAULT 0,
    LastEconomyAdventure INTEGER DEFAULT 0,
    LastEconomyCf INTEGER DEFAULT 0,
    LastEconomyRoulete INTEGER DEFAULT 0,
    LastEconomyAura INTEGER DEFAULT 0,
    LastEconomyRob INTEGER DEFAULT 0,
    data TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS groups (
    jid TEXT PRIMARY KEY,
    group_id TEXT,
    group_name TEXT,
    mutedUsers TEXT DEFAULT '[]',
    antilink INTEGER DEFAULT 0,
    antiCalls INTEGER DEFAULT 0,
    antiToxic INTEGER DEFAULT 0,
    antiSpam INTEGER DEFAULT 0,
    antiStatus INTEGER DEFAULT 0,
    onlyAdmin INTEGER DEFAULT 0,
    botOnline INTEGER DEFAULT 1,
    prefix TEXT DEFAULT NULL,
    topMsgUsers TEXT DEFAULT '[]',
    topCmdUsers TEXT DEFAULT '[]',
    userWarns TEXT DEFAULT '{}',
    catBlocked TEXT DEFAULT '["nsfw"]',
    data TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS bots (
    jid TEXT PRIMARY KEY,
    bot_id TEXT,
    bot_name TEXT,
    phone_number TEXT,
    isPremBot INTEGER DEFAULT 0,
    lid TEXT,
    groups TEXT DEFAULT '[]',
    isMain INTEGER DEFAULT 0,
    status TEXT DEFAULT 'offline',
    modPrefix TEXT DEFAULT NULL,
    modSelf INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'AuraCoins',
    currencySymbol TEXT DEFAULT '₡',
    currentBanner TEXT DEFAULT NULL,
    currentAudio TEXT DEFAULT NULL,
    data TEXT DEFAULT '{}'
  );
`);

for (const column of [
  ["phone_number", "TEXT"],
  ["lid", "TEXT"],
  ["groups", "TEXT DEFAULT '[]'"],
  ["genre", "TEXT DEFAULT 'Unknown'"],
  ["aura_points", "INTEGER DEFAULT 0"],
  ["aura_level", "INTEGER DEFAULT 1"],
  ["stickerPackAuthor", "TEXT DEFAULT NULL"],
  ["stickerPackName", "TEXT DEFAULT NULL"],
  ["botOnline", "INTEGER DEFAULT 1"],
] as const) {
  const exists = db_instance
    .prepare("SELECT 1 FROM pragma_table_info('bots') WHERE name = ?")
    .get(column[0]);
  if (!exists)
    db_instance.exec(`ALTER TABLE bots ADD COLUMN ${column[0]} ${column[1]}`);
}

const groupsMeta = db_instance.prepare("PRAGMA table_info('groups')").all() as Array<{ name: string }>;
const hasMutedUsers = groupsMeta.some((column) => column.name === "mutedUsers");
const hasLegacyMedUsers = groupsMeta.some((column) => column.name === "medUsers");
if (!hasMutedUsers && hasLegacyMedUsers) {
  db_instance.exec("ALTER TABLE groups RENAME COLUMN medUsers TO mutedUsers");
}

for (const [table, column, definition] of [
  ["groups", "prefix", "TEXT"],
  ["groups", "self", "INTEGER DEFAULT 0"],
  ["groups", "onlyAdmin", "INTEGER DEFAULT 0"],
  ["groups", "topMsgUsers", "TEXT DEFAULT '[]'"],
  ["groups", "topCmdUsers", "TEXT DEFAULT '[]'"],
  ["groups", "userWarns", "TEXT DEFAULT '{}'"],
  ["groups", "catBlocked", "TEXT DEFAULT '[\"nsfw\"]'"],
  ["groups", "mutedUsers", "TEXT DEFAULT '[]'"],
  ["groups", "botOnline", "INTEGER DEFAULT 1"],
  ["groups", "data", "TEXT DEFAULT '{}'"],
  ["bots", "modPrefix", "TEXT"],
  ["bots", "modSelf", "INTEGER DEFAULT 0"],
  ["bots", "currency", "TEXT DEFAULT 'AuraCoins'"],
  ["bots", "currencySymbol", "TEXT DEFAULT '₡'"],
  ["bots", "currentBanner", "TEXT DEFAULT NULL"],
  ["bots", "currentAudio", "TEXT DEFAULT NULL"],
  ["bots", "data", "TEXT DEFAULT '{}'"],
  ["users", "data", "TEXT DEFAULT '{}'"],
] as const) {
  const exists = db_instance
    .prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`)
    .get(column);
  if (!exists)
    db_instance.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

for (const column of Object.values(ECONOMY_LAST_COLUMNS)) {
  const exists = db_instance
    .prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = ?")
    .get(column);
  if (!exists)
    db_instance.exec(`ALTER TABLE users ADD COLUMN ${column} INTEGER DEFAULT 0`);
}

const hierarchy = ["user", "premium", "mod", "coowner", "owner"] as const;

const stmts = {
  getUser: db_instance.prepare("SELECT * FROM users WHERE jid = ?"),
  insertUser: db_instance.prepare(
    "INSERT OR IGNORE INTO users (jid, lid, username, phone_number, role, is_banned, coins, bank, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  updateEconomyLastByJid: db_instance.prepare(
    `UPDATE users SET ${Object.values(ECONOMY_LAST_COLUMNS).map((column) => `${column} = ?`).join(", ")} WHERE jid = ?`,
  ),
  updateEconomyLastByLid: db_instance.prepare(
    `UPDATE users SET ${Object.values(ECONOMY_LAST_COLUMNS).map((column) => `${column} = ?`).join(", ")} WHERE lid = ?`,
  ),
  updateUser: db_instance.prepare(
    "UPDATE users SET lid = ?, username = ?, phone_number = ?, role = ?, is_banned = ?, coins = ?, bank = ?, data = ? WHERE jid = ?",
  ),
  updateUserByLid: db_instance.prepare(
    "UPDATE users SET username = ?, phone_number = ?, role = ?, is_banned = ?, coins = ?, bank = ?, data = ? WHERE lid = ?",
  ),
  getAllUsers: db_instance.prepare(
    `SELECT jid, lid, username, phone_number, role, is_banned, coins, bank, data, ${Object.values(ECONOMY_LAST_COLUMNS).join(", ")} FROM users`,
  ),

  getGroup: db_instance.prepare("SELECT * FROM groups WHERE jid = ?"),
  insertGroup: db_instance.prepare(
    "INSERT INTO groups (jid, group_id, group_name, antilink, antiCalls, antiToxic, antiSpam, antiStatus, onlyAdmin, prefix, self, topMsgUsers, catBlocked, mutedUsers, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  updateGroup: db_instance.prepare(
    "UPDATE groups SET group_id = ?, group_name = ?, antilink = ?, antiCalls = ?, antiToxic = ?, antiSpam = ?, antiStatus = ?, onlyAdmin = ?, prefix = ?, self = ?, topMsgUsers = ?, catBlocked = ?, mutedUsers = ?, data = ? WHERE jid = ?",
  ),
  getAllGroups: db_instance.prepare(
    "SELECT jid, group_id, group_name, antilink, antiCalls, antiToxic, antiSpam, onlyAdmin, prefix, self, topMsgUsers, data FROM groups",
  ),

  getBot: db_instance.prepare("SELECT * FROM bots WHERE jid = ?"),
  insertBot: db_instance.prepare(
    "INSERT INTO bots (jid, bot_id, bot_name, phone_number, lid, groups, isMain, status, modPrefix, modSelf, currency, currencySymbol, currentBanner, currentAudio, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  updateBot: db_instance.prepare(
    "UPDATE bots SET bot_id = ?, bot_name = ?, phone_number = ?, lid = ?, groups = ?, isMain = ?, status = ?, modPrefix = ?, modSelf = ?, currency = ?, currencySymbol = ?, currentBanner = ?, currentAudio = ?, data = ? WHERE jid = ?",
  ),
  getAllBots: db_instance.prepare(
    "SELECT jid, bot_id, bot_name, phone_number, lid, groups, isMain, status, modPrefix, modSelf, currency, currencySymbol, currentBanner, currentAudio, data FROM bots",
  ),
  deleteBot: db_instance.prepare("DELETE FROM bots WHERE jid = ?"),
  resetGroupTopMsgUsers: db_instance.prepare(
    "UPDATE groups SET topMsgUsers = '[]' WHERE jid = ?",
  ),
};

function normalizeJid(input: string) {
  return String(input || "")
    .trim()
    .replace(/@.*$/, "")
    .replace(/:.*/, "");
}

function safeJson<T = Record<string, unknown>>(
  value: string | null | undefined,
): T {
  if (!value) return {} as T;

  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

function safeJsonArray(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function maxTimestamp(...values: unknown[]): number {
  const timestamps = values.map(Number).filter(Number.isFinite);
  return Math.max(0, ...timestamps);
}

function hydrateEconomyLasts(
  data: Record<string, unknown>,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const economy =
    data.economy && typeof data.economy === "object"
      ? { ...(data.economy as Record<string, unknown>) }
      : {};
  const hydrated = { ...data };

  for (const [key, column] of Object.entries(ECONOMY_LAST_COLUMNS)) {
    const timestamp = maxTimestamp(data[key], economy[key], row[column]);
    hydrated[key] = timestamp;
    economy[key] = timestamp;
  }

  hydrated.economy = economy;
  return hydrated;
}

function persistEconomyLasts(
  jid: string,
  lid: string | null,
  data: Record<string, unknown>,
): void {
  const row = getUserRow(jid, lid);
  if (!row) return;

  const economy =
    data.economy && typeof data.economy === "object"
      ? (data.economy as Record<string, unknown>)
      : {};
  const values = Object.entries(ECONOMY_LAST_COLUMNS).map(([key, column]) =>
    maxTimestamp(data[key], economy[key], row[column]),
  );

  if (row.jid === null && row.lid) {
    stmts.updateEconomyLastByLid.run(...values, row.lid);
  } else if (row.jid) {
    stmts.updateEconomyLastByJid.run(...values, row.jid);
  }
}

function getCurrentMessageWeek(date = new Date()): string {
  const current = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((current.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${current.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const userStmtCache = new Map<string, ReturnType<typeof db_instance.prepare>>();

function getUserRow(input: string, lid?: string | null): UserDbRow | undefined {
  const rawInput = String(input || "").trim();
  const key = normalizeJid(rawInput);
  const candidates = [rawInput, key, key ? `${key}@s.whatsapp.net` : ""].filter(
    Boolean,
  );
  const conditions = candidates.flatMap(() => ["jid = ?", "lid = ?"]);
  const values = candidates.flatMap((candidate) => [candidate, candidate]);

  if (lid) {
    conditions.push("lid = ?");
    values.push(lid);
  }

  // Sin condiciones no se puede construir una WHERE válida → nada que buscar.
  if (conditions.length === 0) return undefined;

  const queryKey = conditions.join(" OR ");
  let stmt = userStmtCache.get(queryKey);
  if (!stmt) {
    stmt = db_instance.prepare(`SELECT * FROM users WHERE ${queryKey} LIMIT 1`);
    userStmtCache.set(queryKey, stmt);
  }

  return (stmt as any).get(...values) as UserDbRow | undefined;
}

function getUser(input: string): DatabaseUser {
  const rawInput = String(input || "").trim();
  const key = normalizeJid(rawInput);
  const row = getUserRow(rawInput);

  if (!row) {
    const defaultUser: DatabaseUser = {
      jid: rawInput.endsWith("@lid") ? null : `${key}@s.whatsapp.net`,
      lid: rawInput.endsWith("@lid") ? rawInput : null,
      username: null,
      phone_number: rawInput.endsWith("@lid") ? null : key,
      role: "user",
      is_banned: 0,
      data: {},
    };

    try {
      stmts.insertUser.run(
        defaultUser.jid,
        defaultUser.lid,
        defaultUser.username,
        defaultUser.phone_number,
        defaultUser.role,
        defaultUser.is_banned,
        100000,
        10000,
        JSON.stringify(defaultUser.data),
      );
    } catch {
      // Ignora errores si la fila fue creada concurrentemente
    }

    return { ...defaultUser, coins: 100000, bank: 10000, bolsillo: 100000, banco: 10000 };
  }

  const jsonData = hydrateEconomyLasts(
    safeJson<Record<string, unknown>>(row.data as string | undefined),
    row as unknown as Record<string, unknown>,
  );
  const coins = Number(row.coins ?? jsonData.coins ?? jsonData.bolsillo ?? 100000);
  const bank = Number(row.bank ?? jsonData.bank ?? jsonData.banco ?? 10000);

  return {
    ...jsonData,
    jid: (row.jid !== undefined ? row.jid : (jsonData.jid ?? key)) as
      string | null,
    lid: (row.lid ??
      jsonData.lid ??
      (rawInput.endsWith("@lid") ? rawInput : null)) as string | null,
    username: (row.username ?? jsonData.username ?? null) as string | null,
    phone_number: (row.phone_number !== undefined
      ? row.phone_number
      : (jsonData.phone_number ?? key)) as string | null,
    role: (row.role ?? jsonData.role ?? "user") as string,
    is_banned: Number(row.is_banned ?? jsonData.is_banned ?? 0),
    coins,
    bank,
    bolsillo: coins,
    banco: bank,
    data: jsonData,
  };
}

function getGroup(jid: string): DatabaseGroup {
  const key = normalizeJid(jid);
  const row = stmts.getGroup.get(key) as GroupDbRow | undefined;

  if (!row) {
    const defaultGroup: DatabaseGroup = {
      group_id: key,
      group_name: null,
      antilink: 0,
      antiCalls: 0,
      antiToxic: 0,
      antiSpam: 0,
      antiStatus: 0,
      onlyAdmin: 0,
      prefix: null,
      self: 0,
      catBlocked: ["nsfw"],
      privateMode: false,
      adminMode: false,
      primaryBot: null,
      welcome: false,
      goodbye: false,
      welcomeMessage: null,
      goodbyeMessage: null,
      topMsgUsers: [],
      mutedUsers: [],
      data: {},
    };

    stmts.insertGroup.run(
      key,
      defaultGroup.group_id,
      defaultGroup.group_name,
      defaultGroup.antilink,
      defaultGroup.antiCalls,
      defaultGroup.antiToxic,
      defaultGroup.antiSpam,
      defaultGroup.antiStatus,
      defaultGroup.onlyAdmin,
      defaultGroup.prefix,
      defaultGroup.self,
      JSON.stringify(defaultGroup.topMsgUsers),
      JSON.stringify(defaultGroup.catBlocked),
      JSON.stringify(defaultGroup.mutedUsers),
      JSON.stringify(defaultGroup.data),
    );

    return defaultGroup;
  }

  const jsonData = safeJson<Record<string, unknown>>(
    row.data as string | undefined,
  );
  const storedMutedUsers = safeJsonArray(
    (row.mutedUsers ?? row.medUsers ?? jsonData.mutedUsers ?? jsonData.medUsers) as
      string | undefined,
  );
  const storedTopMsgUsers = safeJson<TopMsgUser[]>(
    (row.topMsgUsers ?? jsonData.topMsgUsers) as string | undefined,
  );
  const currentWeek = getCurrentMessageWeek();
  const hasPreviousWeek =
    storedTopMsgUsers.length > 0 &&
    storedTopMsgUsers.some((user) => user?.week !== currentWeek);
  if (hasPreviousWeek) {
    stmts.resetGroupTopMsgUsers.run(key);
  }

  return {
    ...jsonData,
    group_id: (row.group_id ?? jsonData.group_id ?? key) as string,
    group_name: (row.group_name ?? jsonData.group_name ?? null) as
      string | null,
    antilink: Number(row.antilink ?? jsonData.antilink ?? 0),
    antiCalls: Number(row.antiCalls ?? jsonData.antiCalls ?? 0),
    antiToxic: Number(row.antiToxic ?? jsonData.antiToxic ?? 0),
    antiSpam: Number(row.antiSpam ?? jsonData.antiSpam ?? 0),
    antiStatus: Number(row.antiStatus ?? jsonData.antiStatus ?? 0),
    onlyAdmin: Number(row.onlyAdmin ?? jsonData.onlyAdmin ?? 0),
    prefix: (row.prefix ?? jsonData.prefix ?? null) as string | null,
    self: Number(row.self ?? jsonData.self ?? 0),
    catBlocked: safeJsonArray(
      (row.catBlocked ?? jsonData.catBlocked ?? '["nsfw"]') as
        string | undefined,
    ),
    privateMode: Boolean(row.privateMode ?? jsonData.privateMode ?? false),
    adminMode: Boolean(row.adminMode ?? jsonData.adminMode ?? false),
    primaryBot: (row.primaryBot ?? jsonData.primaryBot ?? null) as
      string | null,
    welcome: Boolean(row.welcome ?? jsonData.welcome ?? false),
    goodbye: Boolean(row.goodbye ?? jsonData.goodbye ?? false),
    welcomeMessage: (row.welcomeMessage ?? jsonData.welcomeMessage ?? null) as
      string | null,
    goodbyeMessage: (row.goodbyeMessage ?? jsonData.goodbyeMessage ?? null) as
      string | null,
    topMsgUsers: hasPreviousWeek ? [] : storedTopMsgUsers,
    mutedUsers: storedMutedUsers,
    data: jsonData,
  };
}

function getBot(jid: string): DatabaseBot {
  const key = normalizeJid(jid);
  const row = stmts.getBot.get(key) as BotDbRow | undefined;

  if (!row) {
    const defaultBot: DatabaseBot = {
      jid: key,
      bot_id: key,
      bot_name: null,
      phone_number: null,
      lid: null,
      groups: [],
      isMain: 0,
      status: "offline",
      modPrefix: null,
      modSelf: 0,
      currency: "AuraCoins",
      currencySymbol: "₡",
      currentBanner: null,
      currentAudio: null,
      data: {},
    };

    stmts.insertBot.run(
      key,
      defaultBot.bot_id,
      defaultBot.bot_name,
      defaultBot.phone_number,
      defaultBot.lid,
      JSON.stringify(defaultBot.groups),
      defaultBot.isMain,
      defaultBot.status,
      defaultBot.modPrefix,
      defaultBot.modSelf,
      "AuraCoins",
      "₡",
      defaultBot.currentBanner,
      defaultBot.currentAudio,
      JSON.stringify(defaultBot.data),
    );

    return defaultBot;
  }

  const jsonData = safeJson<Record<string, unknown>>(
    row.data as string | undefined,
  );
  return {
    jid: (row.jid ?? key) as string,
    ...jsonData,
    bot_id: (row.bot_id ?? jsonData.bot_id ?? key) as string,
    bot_name: (row.bot_name ?? jsonData.bot_name ?? null) as string | null,
    phone_number: (row.phone_number ?? jsonData.phone_number ?? null) as
      string | null,
    lid: (row.lid ?? jsonData.lid ?? null) as string | null,
    groups: safeJsonArray(
      (row.groups ?? jsonData.groups) as string | undefined,
    ),
    isMain: Number(row.isMain ?? jsonData.isMain ?? 0),
    status: (row.status ?? jsonData.status ?? "offline") as string,
    modPrefix: (row.modPrefix ?? jsonData.modPrefix ?? null) as string | null,
    modSelf: Number(row.modSelf ?? jsonData.modSelf ?? 0),
    currency: (row.currency ?? jsonData.currency ?? "AuraCoins") as string,
    currencySymbol: (row.currencySymbol ??
      jsonData.currencySymbol ??
      "₡") as string,
    currentBanner: (row.currentBanner ?? jsonData.currentBanner ?? null) as
      | string
      | null,
    currentAudio: (row.currentAudio ?? jsonData.currentAudio ?? null) as
      | string
      | null,
    data: jsonData,
  };
}

export const db: IDatabase = {
  getUser,
  getGroup,
  getBot,

  setUser(
    jid: string,
    dataObject: Partial<DatabaseUser> & Record<string, unknown>,
  ) {
    const key = normalizeJid(jid);
    const currentData = getUser(jid);
    const merged = { ...currentData, ...dataObject };
    const isLidOnly = String(jid).endsWith("@lid") && !dataObject?.jid;
    const rawJid = isLidOnly
      ? null
      : String(dataObject?.jid ?? jid ?? key).trim() || key;
    const rawLid =
      String(
        dataObject?.lid ?? currentData?.lid ?? (isLidOnly ? jid : ""),
      ).trim() || null;
    const payload = {
      ...merged.data,
      ...merged,
      jid: rawJid,
      lid: rawLid || merged.lid || null,
    };

    delete payload.data;

    const row = getUserRow(rawJid ?? key, rawLid);
    const coins = Number(
      merged.coins ?? merged.bolsillo ?? row?.coins ?? 100000,
    );
    const bank = Number(
      merged.bank ?? merged.banco ?? row?.bank ?? 10000,
    );

    if (!row) {
      try {
        stmts.insertUser.run(
          rawJid,
          rawLid || merged.lid || null,
          merged.username ?? null,
          isLidOnly ? null : (merged.phone_number ?? key),
          merged.role ?? "user",
          Number(Boolean(merged.is_banned ?? 0)),
          coins,
          bank,
          JSON.stringify(payload),
        );
        persistEconomyLasts(rawJid ?? key, rawLid, payload);
        return;
      } catch {
        // Si ya existía, continuará al flujo de actualización más abajo
      }
    }

    const storedLid = rawLid || row.lid || merged.lid || null;
    const phoneNumber = isLidOnly
      ? null
      : (merged.phone_number ?? row.phone_number ?? key);
    if (row.jid === null && storedLid) {
      stmts.updateUserByLid.run(
        merged.username ?? row.username ?? null,
        phoneNumber,
        merged.role ?? row.role ?? "user",
        Number(Boolean(merged.is_banned ?? row.is_banned ?? 0)),
        coins,
        bank,
        JSON.stringify(payload),
        storedLid,
      );
    } else {
      stmts.updateUser.run(
        storedLid,
        merged.username ?? row.username ?? null,
        phoneNumber,
        merged.role ?? row.role ?? "user",
        Number(Boolean(merged.is_banned ?? row.is_banned ?? 0)),
        coins,
        bank,
        JSON.stringify(payload),
        row.jid ?? key,
      );
    }
    persistEconomyLasts(rawJid ?? key, rawLid, payload);
  },

  setGroup(
    jid: string,
    dataObject: Partial<DatabaseGroup> & Record<string, unknown>,
  ) {
    const key = normalizeJid(jid);
    const currentData = getGroup(key);
    const merged = { ...currentData, ...dataObject };
    const mutedUsers = Array.isArray(merged.mutedUsers)
      ? merged.mutedUsers
      : Array.isArray((merged.data as Record<string, unknown> | undefined)?.mutedUsers)
        ? ((merged.data as Record<string, unknown>).mutedUsers as string[])
        : Array.isArray((merged.data as Record<string, unknown> | undefined)?.medUsers)
          ? ((merged.data as Record<string, unknown>).medUsers as string[])
          : [];
    const payload = {
      ...merged.data,
      ...merged,
      mutedUsers,
    };

    delete payload.data;

    const row = stmts.getGroup.get(key) as Record<string, unknown> | undefined;
    if (!row) {
      stmts.insertGroup.run(
        key,
        merged.group_id ?? key,
        merged.group_name ?? null,
        Number(Boolean(merged.antilink ?? 0)),
        Number(Boolean(merged.antiCalls ?? 0)),
        Number(Boolean(merged.antiToxic ?? 0)),
        Number(Boolean(merged.antiSpam ?? 0)),
        Number(Boolean(merged.antiStatus ?? 0)),
        Number(Boolean(merged.onlyAdmin ?? 0)),
        merged.prefix ?? null,
        Number(Boolean(merged.self ?? 0)),
        JSON.stringify(
          Array.isArray(merged.topMsgUsers) ? merged.topMsgUsers : [],
        ),
        JSON.stringify(
          Array.isArray(merged.catBlocked) ? merged.catBlocked : ["nsfw"],
        ),
        JSON.stringify(mutedUsers),
        JSON.stringify(payload),
      );
      return;
    }

    stmts.updateGroup.run(
      merged.group_id ?? key,
      merged.group_name ?? row.group_name ?? null,
      Number(Boolean(merged.antilink ?? row.antilink ?? 0)),
      Number(Boolean(merged.antiCalls ?? row.antiCalls ?? 0)),
      Number(Boolean(merged.antiToxic ?? row.antiToxic ?? 0)),
      Number(Boolean(merged.antiSpam ?? row.antiSpam ?? 0)),
      Number(Boolean(merged.antiStatus ?? row.antiStatus ?? 0)),
      Number(Boolean(merged.onlyAdmin ?? row.onlyAdmin ?? 0)),
      merged.prefix !== undefined ? merged.prefix : (row.prefix ?? null),
      Number(Boolean(merged.self ?? row.self ?? 0)),
      JSON.stringify(
        Array.isArray(merged.topMsgUsers)
          ? merged.topMsgUsers
          : safeJson<Record<string, unknown>[]>(
              row.topMsgUsers as string | undefined,
            ),
      ),
      JSON.stringify(
        Array.isArray(merged.catBlocked)
          ? merged.catBlocked
          : safeJsonArray((row.catBlocked as string | undefined) ?? '["nsfw"]'),
      ),
      JSON.stringify(mutedUsers),
      JSON.stringify(payload),
      key,
    );
  },

  setBot(
    jid: string,
    dataObject: Partial<DatabaseBot> & Record<string, unknown>,
  ) {
    const key = normalizeJid(jid);
    const currentData = getBot(key);
    const row = stmts.getBot.get(key) as BotDbRow | undefined;
    const merged = { ...currentData, ...dataObject };
    const currentBanner =
      dataObject.currentBanner ?? currentData.currentBanner ?? row?.currentBanner ?? null;
    const currentAudio =
      dataObject.currentAudio ?? currentData.currentAudio ?? row?.currentAudio ?? null;
    const payload = {
      ...merged.data,
      ...merged,
      currentBanner,
      currentAudio,
    };

    delete payload.data;

    const currency =
      String(merged.currency ?? row?.currency ?? "AuraCoins").trim() ||
      "AuraCoins";
    const currencySymbol =
      String(merged.currencySymbol ?? row?.currencySymbol ?? "₡").trim() || "₡";
    payload.currency = currency;
    payload.currencySymbol = currencySymbol;
    if (!row) {
      stmts.insertBot.run(
        key,
        merged.bot_id ?? key,
        merged.bot_name ?? null,
        merged.phone_number ?? null,
        merged.lid ?? null,
        JSON.stringify(Array.isArray(merged.groups) ? merged.groups : []),
        Number(Boolean(merged.isMain ?? 0)),
        merged.status ?? "offline",
        merged.modPrefix ?? null,
        Number(Boolean(merged.modSelf ?? 0)),
        currency,
        currencySymbol,
        currentBanner,
        currentAudio,
        JSON.stringify(payload),
      );
      return;
    }

    stmts.updateBot.run(
      merged.bot_id ?? key,
      merged.bot_name ?? row.bot_name ?? null,
      merged.phone_number ?? row.phone_number ?? null,
      merged.lid ?? row.lid ?? null,
      JSON.stringify(
        Array.isArray(merged.groups)
          ? merged.groups
          : safeJsonArray(row.groups),
      ),
      Number(Boolean(merged.isMain ?? row.isMain ?? 0)),
      merged.status ?? row.status ?? "offline",
      merged.modPrefix !== undefined
        ? merged.modPrefix
        : (row.modPrefix ?? null),
      Number(Boolean(merged.modSelf ?? row.modSelf ?? 0)),
      currency,
      currencySymbol,
      currentBanner,
      currentAudio,
      JSON.stringify(payload),
      key,
    );
  },

  setPushName(jid: string, pushName: string) {
    if (!pushName) return;
    const existing = getUser(jid);
    this.setUser(jid, {
      jid,
      lid: existing?.lid || (jid.endsWith("@lid") ? jid : null),
      username: pushName,
      pushName,
      phone_number: jid.endsWith("@lid") ? null : normalizeJid(jid),
    });
  },

  getPrimary(groupJid: string) {
    const group = getGroup(groupJid);
    return group.primaryBot ?? null;
  },

  setPrimary(groupJid: string, botJid: string) {
    this.setGroup(groupJid, {
      primaryBot: String(botJid || "").trim() || null,
    });
  },

  addBotGroup(botJid: string, groupJid: string) {
    const group = String(groupJid || "").trim();
    if (!group.endsWith("@g.us")) return;

    const bot = getBot(botJid);
    const groups = Array.isArray(bot.groups) ? bot.groups : [];
    if (!groups.includes(group))
      this.setBot(botJid, { groups: [...groups, group] });
  },

  getBotById(botId: string) {
    const normalized = String(botId || "").trim();
    if (!normalized) return null;

    return (
      this.getAllBots().find(
        (bot) =>
          bot.bot_id === normalized ||
          normalizeJid(bot.bot_id) === normalizeJid(normalized) ||
          normalizeJid(bot.jid) === normalizeJid(normalized),
      ) ?? null
    );
  },

  deleteBot(jid: string) {
    stmts.deleteBot.run(normalizeJid(jid));
  },

  getAllUsers(): DatabaseUser[] {
    const rows = stmts.getAllUsers.all() as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const jsonData = hydrateEconomyLasts(
        safeJson<Record<string, unknown>>(row.data as string | undefined),
        row,
      );
      const coins = Number(
        row.coins ?? jsonData.coins ?? jsonData.bolsillo ?? 100000,
      );
      const bank = Number(
        row.bank ?? jsonData.bank ?? jsonData.banco ?? 10000,
      );
      return {
        jid: (row.jid ?? jsonData.jid ?? null) as string | null,
        ...jsonData,
        lid: (row.lid ?? jsonData.lid ?? null) as string | null,
        username: (row.username ?? jsonData.username ?? null) as string | null,
        phone_number: (row.phone_number ?? jsonData.phone_number ?? row.jid) as
          string | null,
        role: (row.role ?? jsonData.role ?? "user") as string,
        is_banned: Number(row.is_banned ?? jsonData.is_banned ?? 0),
        coins,
        bank,
        bolsillo: coins,
        banco: bank,
        data: jsonData,
      };
    });
  },

  getAllBots(): DatabaseBot[] {
    const rows = stmts.getAllBots.all() as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const jsonData = safeJson<Record<string, unknown>>(
        row.data as string | undefined,
      );
      return {
        jid: String(row.jid),
        ...jsonData,
        data: jsonData,
        bot_id: (row.bot_id ?? jsonData.bot_id ?? row.jid) as string,
        bot_name: (row.bot_name ?? jsonData.bot_name ?? null) as string | null,
        phone_number: (row.phone_number ?? jsonData.phone_number ?? null) as
          string | null,
        lid: (row.lid ?? jsonData.lid ?? null) as string | null,
        groups: safeJsonArray(
          (row.groups ?? jsonData.groups) as string | undefined,
        ),
        isMain: Number(row.isMain ?? jsonData.isMain ?? 0),
        status: (row.status ?? jsonData.status ?? "offline") as string,
        modPrefix: (row.modPrefix ?? jsonData.modPrefix ?? null) as
          string | null,
        modSelf: Number(row.modSelf ?? jsonData.modSelf ?? 0),
        currency: (row.currency ?? jsonData.currency ?? "AuraCoins") as string,
        currencySymbol: (row.currencySymbol ??
          jsonData.currencySymbol ??
          "₡") as string,
        currentBanner: (row.currentBanner ?? jsonData.currentBanner ?? null) as
          | string
          | null,
        currentAudio: (row.currentAudio ?? jsonData.currentAudio ?? null) as
          | string
          | null,
      };
    });
  },

  hasRole(jid: string, role: string) {
    const user = getUser(jid);
    const currentIndex = hierarchy.indexOf(
      (user?.role ?? "user") as (typeof hierarchy)[number],
    );
    const targetIndex = hierarchy.indexOf(role as (typeof hierarchy)[number]);

    return currentIndex >= 0 && targetIndex >= 0 && currentIndex >= targetIndex;
  },

  setRole(jid: string, role: string) {
    const normalizedRole = hierarchy.includes(role as UserRole) ? role : "user";
    this.setUser(jid, { role: normalizedRole });
  },

  syncDefaultUserRoles() {
    const configuredRoles = Array.isArray(globalThis.DEFAULT_USER_ROLES)
      ? globalThis.DEFAULT_USER_ROLES
      : [];

    for (const configured of configuredRoles) {
      const role = hierarchy.includes(configured?.role as UserRole)
        ? configured.role
        : "user";
      const configuredJid = String(configured?.jid ?? "").trim();
      const configuredLid = String(configured?.lid ?? "").trim();
      if (!configuredJid && !configuredLid) continue;

      const lookup = configuredJid || configuredLid;
      const current = getUserRow(lookup, configuredLid || null);
      const jid = configuredJid || current?.jid || null;
      const lid = configuredLid || current?.lid || null;
      const canonicalJid =
        jid && !jid.endsWith("@lid")
          ? jid.includes("@")
            ? jid
            : `${jid}@s.whatsapp.net`
          : null;

      if (!current) {
        const phone = canonicalJid ? normalizeJid(canonicalJid) : null;
        stmts.insertUser.run(
          canonicalJid,
          lid,
          null,
          phone,
          role,
          0,
          100000,
          10000,
          JSON.stringify({ jid: canonicalJid, lid, role }),
        );
        continue;
      }

      const currentData = safeJson<Record<string, unknown>>(
        current.data as string | undefined,
      );
      const changed =
        current.jid !== canonicalJid ||
        current.lid !== lid ||
        current.role !== role ||
        currentData.jid !== canonicalJid ||
        currentData.lid !== lid ||
        currentData.role !== role;

      if (!changed) continue;

      const payload = {
        ...currentData,
        jid: canonicalJid,
        lid,
        role,
      };
      if (current.jid === null && lid) {
        stmts.updateUserByLid.run(
          current.username ?? null,
          canonicalJid ? normalizeJid(canonicalJid) : null,
          role,
          Number(current.is_banned ?? 0),
          JSON.stringify(payload),
          lid,
        );
      } else if (current.jid) {
        stmts.updateUser.run(
          lid,
          current.username ?? null,
          canonicalJid ? normalizeJid(canonicalJid) : null,
          role,
          Number(current.is_banned ?? 0),
          current.coins ?? 100000, // <--- Faltaba coins
          current.bank ?? 10000,   // <--- Faltaba bank
          JSON.stringify(payload),
          current.jid,
        );
      }
    }
  },

  isBanned(jid: string) {
    return Number(getUser(jid).is_banned ?? 0) === 1;
  },

  ban(jid: string) {
    this.setUser(jid, { is_banned: 1, banned: true });
  },

  unban(jid: string) {
    this.setUser(jid, { is_banned: 0, banned: false });
  },
};

export function checkpointDb() {
  try {
    db_instance.pragma("wal_checkpoint(PASSIVE)");
  } catch {
    // Ignora errores si la base de datos está ocupada
  }
}

db.syncDefaultUserRoles();
