import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataDir = globalThis.DATA_BASE_DIR ?? path.resolve("./data");
mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "gacha.sqlite3");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS gacha_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    series TEXT NOT NULL,
    gender TEXT NOT NULL,
    booru_tag TEXT NOT NULL,
    value INTEGER NOT NULL,
    rarity TEXT NOT NULL DEFAULT 'common',
    image_url TEXT DEFAULT NULL,
    UNIQUE(name, series)
  );

  CREATE TABLE IF NOT EXISTS gacha_ownership (
    user_id TEXT NOT NULL,
    char_id INTEGER NOT NULL,
    obtained_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, char_id)
  );

  CREATE TABLE IF NOT EXISTS gacha_favorites (
    user_id TEXT PRIMARY KEY,
    char_id INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gacha_stats (
    user_id TEXT PRIMARY KEY,
    total_rolls INTEGER NOT NULL DEFAULT 0,
    total_claimed INTEGER NOT NULL DEFAULT 0,
    total_sold INTEGER NOT NULL DEFAULT 0,
    total_value INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS gacha_daily (
    user_id TEXT PRIMARY KEY,
    last_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gacha_shop (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller TEXT NOT NULL,
    char_id INTEGER NOT NULL,
    price INTEGER NOT NULL,
    listed_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gacha_wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    char_name TEXT NOT NULL,
    series TEXT NOT NULL
  );
`);

const gachaColumns = db
  .prepare("PRAGMA table_info('gacha_characters')")
  .all() as Array<{ name: string }>;
if (!gachaColumns.some((column) => column.name === "image_url")) {
  db.exec("ALTER TABLE gacha_characters ADD COLUMN image_url TEXT DEFAULT NULL");
}

const RARITY_EMOJI: Record<string, string> = {
  common: "⚪",
  rare: "🔵",
  epic: "🟣",
  legendary: "🟡",
  mythic: "🔴",
};

export type GachaRarity = keyof typeof RARITY_EMOJI;

export interface GachaCharacter {
  id: number;
  name: string;
  series: string;
  gender: string;
  booru_tag: string;
  value: number;
  rarity: GachaRarity | string;
  image_url: string | null;
}

export function computeRarity(value: number): GachaRarity {
  if (value >= 15000) return "mythic";
  if (value >= 9000) return "legendary";
  if (value >= 6500) return "epic";
  if (value >= 4500) return "rare";
  return "common";
}

function rowToChar(row: Record<string, any> | undefined): GachaCharacter | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name),
    series: String(row.series),
    gender: String(row.gender),
    booru_tag: String(row.booru_tag),
    value: Number(row.value),
    rarity: String(row.rarity || "common"),
    image_url: row.image_url ? String(row.image_url) : null,
  };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getGachaStats(userId: string) {
  const row = db
    .prepare("SELECT * FROM gacha_stats WHERE user_id = ?")
    .get(userId) as any;
  if (!row) {
    return { totalRolls: 0, totalClaimed: 0, totalSold: 0, totalValue: 0 };
  }
  return {
    totalRolls: Number(row.total_rolls),
    totalClaimed: Number(row.total_claimed),
    totalSold: Number(row.total_sold),
    totalValue: Number(row.total_value),
  };
}

function updateGachaStats(
  userId: string,
  fn: (stats: {
    totalRolls: number;
    totalClaimed: number;
    totalSold: number;
    totalValue: number;
  }) => void,
) {
  const stats = getGachaStats(userId);
  fn(stats);
  db.prepare(
    `INSERT INTO gacha_stats (user_id, total_rolls, total_claimed, total_sold, total_value)
     VALUES (?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       total_rolls = excluded.total_rolls,
       total_claimed = excluded.total_claimed,
       total_sold = excluded.total_sold,
       total_value = excluded.total_value`,
  ).run(
    userId,
    stats.totalRolls,
    stats.totalClaimed,
    stats.totalSold,
    stats.totalValue,
  );
}

function getRandomCharacter() {
  const row = db
    .prepare("SELECT * FROM gacha_characters ORDER BY RANDOM() LIMIT 1")
    .get() as any;
  return rowToChar(row);
}

function getCharacterCount() {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM gacha_characters")
    .get() as { c: number } | undefined;
  return Number(row?.c ?? 0);
}

function searchCharacters(query: string) {
  const q = `%${query}%`;
  const rows = db
    .prepare(
      "SELECT * FROM gacha_characters WHERE name LIKE ? OR series LIKE ? LIMIT 50",
    )
    .all(q, q) as any[];
  return rows.map((row) => rowToChar(row)).filter(Boolean) as GachaCharacter[];
}

function addCharacter({
  name,
  series,
  gender,
  booru_tag,
  value,
  image_url,
}: {
  name: string;
  series: string;
  gender: string;
  booru_tag: string;
  value: number;
  image_url?: string | null;
}) {
  const dup = db
    .prepare("SELECT 1 FROM gacha_characters WHERE name = ? AND series = ?")
    .get(name, series);
  if (dup) throw new Error("DUPLICATE_CHARACTER");
  const rarity = computeRarity(value);
  db.prepare(
    "INSERT INTO gacha_characters (name, series, gender, booru_tag, value, rarity, image_url) VALUES (?,?,?,?,?,?,?)",
  ).run(name, series, gender, booru_tag, value, rarity, image_url ?? null);
}

function giveCharacter(userId: string, charId: number) {
  const owns = db
    .prepare("SELECT 1 FROM gacha_ownership WHERE user_id = ? AND char_id = ?")
    .get(userId, charId);
  if (owns) throw new Error("CHARACTER_ALREADY_OWNED");
  db.prepare(
    "INSERT INTO gacha_ownership (user_id, char_id, obtained_at) VALUES (?,?,?)",
  ).run(userId, charId, Date.now());
  return true;
}

function getUserHarem(userId: string) {
  const rows = db
    .prepare(
      `SELECT c.* FROM gacha_ownership o
       JOIN gacha_characters c ON c.id = o.char_id
       WHERE o.user_id = ?
       ORDER BY o.obtained_at ASC`,
    )
    .all(userId) as any[];
  return rows.map((row) => rowToChar(row)).filter(Boolean) as GachaCharacter[];
}

function getUserHaremCount(userId: string) {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM gacha_ownership WHERE user_id = ?")
    .get(userId) as { c: number } | undefined;
  return Number(row?.c ?? 0);
}

function getFavorite(userId: string) {
  const row = db
    .prepare(
      `SELECT c.* FROM gacha_favorites f
       JOIN gacha_characters c ON c.id = f.char_id
       WHERE f.user_id = ?`,
    )
    .get(userId) as any;
  return rowToChar(row);
}

function setFavorite(userId: string, charId: number) {
  const owns = db
    .prepare("SELECT 1 FROM gacha_ownership WHERE user_id = ? AND char_id = ?")
    .get(userId, charId);
  if (!owns) throw new Error("CHARACTER_NOT_OWNED");
  db.prepare(
    `INSERT INTO gacha_favorites (user_id, char_id) VALUES (?,?)
     ON CONFLICT(user_id) DO UPDATE SET char_id = excluded.char_id`,
  ).run(userId, charId);
}

function removeFavorite(userId: string) {
  db.prepare("DELETE FROM gacha_favorites WHERE user_id = ?").run(userId);
}

function hasUsedDailyRoll(userId: string) {
  const row = db
    .prepare("SELECT last_date FROM gacha_daily WHERE user_id = ?")
    .get(userId) as any;
  return !!row && row.last_date === todayStr();
}

function setDailyRollUsed(userId: string) {
  db.prepare(
    `INSERT INTO gacha_daily (user_id, last_date) VALUES (?,?)
     ON CONFLICT(user_id) DO UPDATE SET last_date = excluded.last_date`,
  ).run(userId, todayStr());
}

function sellCharacter(userId: string, charId: number) {
  const owns = db
    .prepare("SELECT 1 FROM gacha_ownership WHERE user_id = ? AND char_id = ?")
    .get(userId, charId);
  if (!owns) throw new Error("CHARACTER_NOT_OWNED");
  const char = db
    .prepare("SELECT * FROM gacha_characters WHERE id = ?")
    .get(charId) as any;
  const price = Math.floor(char.value * (0.5 + Math.random() * 0.2));

  db.prepare(
    "DELETE FROM gacha_ownership WHERE user_id = ? AND char_id = ?",
  ).run(userId, charId);

  const favRow = db
    .prepare("SELECT char_id FROM gacha_favorites WHERE user_id = ?")
    .get(userId) as any;
  if (favRow && favRow.char_id === charId) removeFavorite(userId);

  updateGachaStats(userId, (s) => {
    s.totalSold += price;
  });

  return price;
}

function fusionCharacters(userId: string, id1: number, id2: number) {
  const own1 = db
    .prepare("SELECT 1 FROM gacha_ownership WHERE user_id = ? AND char_id = ?")
    .get(userId, id1);
  const own2 = db
    .prepare("SELECT 1 FROM gacha_ownership WHERE user_id = ? AND char_id = ?")
    .get(userId, id2);
  if (!own1 || !own2) throw new Error("CHARACTER_NOT_OWNED");

  const c1 = db.prepare("SELECT * FROM gacha_characters WHERE id = ?").get(id1) as any;
  const c2 = db.prepare("SELECT * FROM gacha_characters WHERE id = ?").get(id2) as any;

  const bonus = 1.15 + Math.random() * 0.15;
  const value = Math.floor((c1.value + c2.value) * bonus);
  const rarity = computeRarity(value);
  const name = `${c1.name} × ${c2.name}`;
  const series = "Fusión";

  let fusedId: number;
  const existing = db
    .prepare("SELECT id FROM gacha_characters WHERE name = ? AND series = ?")
    .get(name, series) as any;
  if (existing) {
    fusedId = Number(existing.id);
    db.prepare(
      "UPDATE gacha_characters SET value = ?, rarity = ? WHERE id = ?",
    ).run(value, rarity, fusedId);
  } else {
    const info = db
      .prepare(
        "INSERT INTO gacha_characters (name, series, gender, booru_tag, value, rarity, image_url) VALUES (?,?,?,?,?,?,?)",
      )
      .run(name, series, c1.gender, c1.booru_tag, value, rarity, c1.image_url ?? null);
    fusedId = Number(info.lastInsertRowid);
  }

  db.prepare(
    "DELETE FROM gacha_ownership WHERE user_id = ? AND char_id IN (?,?)",
  ).run(userId, id1, id2);

  const favRow = db
    .prepare("SELECT char_id FROM gacha_favorites WHERE user_id = ?")
    .get(userId) as any;
  if (favRow && (favRow.char_id === id1 || favRow.char_id === id2))
    removeFavorite(userId);

  db.prepare(
    "INSERT OR IGNORE INTO gacha_ownership (user_id, char_id, obtained_at) VALUES (?,?,?)",
  ).run(userId, fusedId, Date.now());

  return rowToChar(
    db.prepare("SELECT * FROM gacha_characters WHERE id = ?").get(fusedId) as any,
  );
}

function getRarityEmoji(rarity: string | undefined) {
  return RARITY_EMOJI[rarity || "common"] || "⚪";
}

function getShopListings() {
  const rows = db
    .prepare(
      `SELECT s.id as shop_id, s.seller, s.price, c.* FROM gacha_shop s
       JOIN gacha_characters c ON c.id = s.char_id
       ORDER BY s.listed_at ASC`,
    )
    .all() as any[];
  return rows.map((r) => ({
    shopId: Number(r.shop_id),
    seller: String(r.seller),
    price: Number(r.price),
    char: rowToChar(r),
  }));
}

function listInShop(userId: string, charId: number, price: number) {
  const owns = db
    .prepare("SELECT 1 FROM gacha_ownership WHERE user_id = ? AND char_id = ?")
    .get(userId, charId);
  if (!owns) throw new Error("CHARACTER_NOT_OWNED");
  db.prepare(
    "DELETE FROM gacha_ownership WHERE user_id = ? AND char_id = ?",
  ).run(userId, charId);
  const favRow = db
    .prepare("SELECT char_id FROM gacha_favorites WHERE user_id = ?")
    .get(userId) as any;
  if (favRow && favRow.char_id === charId) removeFavorite(userId);
  db.prepare(
    "INSERT INTO gacha_shop (seller, char_id, price, listed_at) VALUES (?,?,?,?)",
  ).run(userId, charId, price, Date.now());
}

function buyFromShop(userId: string, index: number) {
  const listings = getShopListings();
  const listing = listings[index];
  if (!listing) throw new Error("LISTING_NOT_FOUND");
  if (listing.seller === userId) throw new Error("CANNOT_BUY_OWN_LISTING");
  db.prepare("DELETE FROM gacha_shop WHERE id = ?").run(listing.shopId);
  db.prepare(
    "INSERT OR IGNORE INTO gacha_ownership (user_id, char_id, obtained_at) VALUES (?,?,?)",
  ).run(userId, listing.char?.id ?? 0, Date.now());
  return { char: listing.char, seller: listing.seller, price: listing.price };
}

function unlistFromShop(userId: string, index: number) {
  const listings = getShopListings();
  const listing = listings[index];
  if (!listing) throw new Error("LISTING_NOT_FOUND");
  if (listing.seller !== userId) throw new Error("NOT_YOUR_LISTING");
  db.prepare("DELETE FROM gacha_shop WHERE id = ?").run(listing.shopId);
  db.prepare(
    "INSERT OR IGNORE INTO gacha_ownership (user_id, char_id, obtained_at) VALUES (?,?,?)",
  ).run(userId, listing.char?.id ?? 0, Date.now());
  return listing.char;
}

function transferCharacter(fromUserId: string, toUserId: string, charId: number) {
  const owns = db
    .prepare("SELECT 1 FROM gacha_ownership WHERE user_id = ? AND char_id = ?")
    .get(fromUserId, charId);
  if (!owns) throw new Error("CHARACTER_NOT_OWNED");
  const targetOwns = db
    .prepare("SELECT 1 FROM gacha_ownership WHERE user_id = ? AND char_id = ?")
    .get(toUserId, charId);
  if (targetOwns) throw new Error("TARGET_ALREADY_OWNS");

  db.prepare(
    "DELETE FROM gacha_ownership WHERE user_id = ? AND char_id = ?",
  ).run(fromUserId, charId);
  const favRow = db
    .prepare("SELECT char_id FROM gacha_favorites WHERE user_id = ?")
    .get(fromUserId) as any;
  if (favRow && favRow.char_id === charId) removeFavorite(fromUserId);

  db.prepare(
    "INSERT INTO gacha_ownership (user_id, char_id, obtained_at) VALUES (?,?,?)",
  ).run(toUserId, charId, Date.now());
}

function getWishlist(userId: string) {
  return db
    .prepare(
      "SELECT id, char_name as charName, series FROM gacha_wishlist WHERE user_id = ? ORDER BY id ASC",
    )
    .all(userId) as Array<{ id: number; charName: string; series: string }>;
}

function addWish(userId: string, charName: string, series: string) {
  const dup = db
    .prepare(
      "SELECT 1 FROM gacha_wishlist WHERE user_id = ? AND char_name = ? AND series = ?",
    )
    .get(userId, charName, series);
  if (dup) throw new Error("ALREADY_IN_WISHLIST");
  db.prepare(
    "INSERT INTO gacha_wishlist (user_id, char_name, series) VALUES (?,?,?)",
  ).run(userId, charName, series);
}

function removeWish(userId: string, index: number) {
  const list = getWishlist(userId);
  const item = list[index];
  if (!item) return false;
  db.prepare("DELETE FROM gacha_wishlist WHERE id = ?").run(item.id);
  return true;
}

function matchWishlist(charName: string, series: string) {
  const rows = db
    .prepare(
      "SELECT user_id as userId, char_name as charName, series FROM gacha_wishlist WHERE char_name LIKE ? AND series LIKE ?",
    )
    .all(`%${charName}%`, `%${series}%`) as any[];
  return rows;
}

function getAllHaremData() {
  const rows = db
    .prepare(
      `SELECT o.user_id as userId, COUNT(*) as count, SUM(c.value) as totalValue
       FROM gacha_ownership o
       JOIN gacha_characters c ON c.id = o.char_id
       GROUP BY o.user_id`,
    )
    .all() as any[];
  return rows.map((r) => ({
    userId: String(r.userId),
    count: Number(r.count),
    totalValue: Number(r.totalValue || 0),
  }));
}

export const gacha = {
  getRandomCharacter,
  getCharacterCount,
  searchCharacters,
  addCharacter,
  giveCharacter,
  getUserHarem,
  getUserHaremCount,
  getFavorite,
  setFavorite,
  removeFavorite,
  hasUsedDailyRoll,
  setDailyRollUsed,
  sellCharacter,
  fusionCharacters,
  getRarityEmoji,
  getShopListings,
  listInShop,
  buyFromShop,
  unlistFromShop,
  transferCharacter,
  getWishlist,
  addWish,
  removeWish,
  matchWishlist,
  getAllHaremData,
  getGachaStats,
  updateGachaStats,
};

export function recordUserRoll(userId: string, char: GachaCharacter) {
  gacha.updateGachaStats(userId, (stats) => {
    stats.totalRolls += 1;
    stats.totalValue += char.value;
  });
}

export function today() {
  return todayStr();
}
