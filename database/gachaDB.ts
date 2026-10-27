import DataBase from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import "../config.ts";

const DATA_BASE_DIR = globalThis.DATA_BASE_DIR;
if (!existsSync(DATA_BASE_DIR)) {
  mkdirSync(DATA_BASE_DIR, { recursive: true });
}

const db_instance = new DataBase(`${DATA_BASE_DIR}/GachaAura.db`);
export const GACHA_CLAIM_TTL_MS = 60_000;
db_instance.pragma("journal_mode = WAL");
db_instance.pragma("synchronous = NORMAL");
db_instance.pragma("foreign_keys = ON");
db_instance.pragma("wal_autocheckpoint = 1000");
db_instance.pragma("busy_timeout = 2000");
db_instance.pragma("cache_size = -16000");
db_instance.pragma("mmap_size = 67108864");

db_instance.exec(`
CREATE INDEX IF NOT EXISTS idx_gachadraws_user ON GachaDraws(user_id);
CREATE INDEX IF NOT EXISTS idx_gachaowner_user ON GachaOwnership(user_id);
CREATE INDEX IF NOT EXISTS idx_gachaimgowner_user ON GachaImageOwnership(user_id);
`);

db_instance.exec(`
CREATE TABLE IF NOT EXISTS GachaClaims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  claim_date TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  UNIQUE(user_id, claim_date, claim_type)
);

CREATE TABLE IF NOT EXISTS GachaDraws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  image_id INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  UNIQUE(group_id, message_id)
);

CREATE TABLE IF NOT EXISTS GachaOwnership (
  group_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  source_message_id TEXT NOT NULL,
  PRIMARY KEY(group_id, character_id)
);`);

const drawColumns = db_instance
  .prepare("PRAGMA table_info('GachaDraws')")
  .all() as Array<{ name: string }>;
if (!drawColumns.some((column) => column.name === "image_id")) {
  db_instance.exec(
    "ALTER TABLE GachaDraws ADD COLUMN image_id INTEGER NOT NULL DEFAULT 0",
  );
}

db_instance.exec(`
CREATE TABLE IF NOT EXISTS GachaImageOwnership (
  group_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  image_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  source_message_id TEXT NOT NULL,
  PRIMARY KEY(group_id, character_id, image_id)
);`);

export interface GachaOwnership {
  group_id: string;
  character_id: string;
  user_id: string;
  claimed_at: number;
  source_message_id: string;
  image_id?: number | null;
  legacy?: boolean;
}

export interface GachaHaremEntry {
  character_id: string;
  image_id: number | null;
  claimed_at: number;
}

export function getGachaClaimedCards(
  groupId: string,
): Array<Pick<GachaHaremEntry, "character_id" | "image_id">> {
  return db_instance
    .prepare(
      `SELECT character_id, image_id
       FROM GachaImageOwnership
       WHERE group_id = ?
       UNION
       SELECT character_id, NULL AS image_id
       FROM GachaOwnership
       WHERE group_id = ?`,
    )
    .all(groupId, groupId) as Array<
    Pick<GachaHaremEntry, "character_id" | "image_id">
  >;
}

interface GachaDraw {
  group_id: string;
  message_id: string;
  user_id: string;
  character_id: string;
  image_id: number;
  status: string;
  created_at: number;
}

export function getGachaOwnership(
  groupId: string,
  characterId: string,
  imageId: number,
): GachaOwnership | undefined {
  const imageOwner = db_instance
    .prepare(
      "SELECT group_id, character_id, image_id, user_id, claimed_at, source_message_id FROM GachaImageOwnership WHERE group_id = ? AND character_id = ? AND image_id = ?",
    )
    .get(groupId, characterId, imageId) as GachaOwnership | undefined;
  if (imageOwner) return imageOwner;

  const legacyOwner = db_instance
    .prepare(
      "SELECT group_id, character_id, user_id, claimed_at, source_message_id FROM GachaOwnership WHERE group_id = ? AND character_id = ?",
    )
    .get(groupId, characterId) as GachaOwnership | undefined;
  return legacyOwner ? { ...legacyOwner, image_id: null, legacy: true } : undefined;
}

export function getGachaHarem(
  groupId: string,
  userId: string,
): GachaHaremEntry[] {
  return db_instance
    .prepare(
      `SELECT character_id, image_id, claimed_at
       FROM GachaImageOwnership
       WHERE group_id = ? AND user_id = ?
       UNION ALL
       SELECT character_id, NULL AS image_id, claimed_at
       FROM GachaOwnership
       WHERE group_id = ? AND user_id = ?
       ORDER BY claimed_at ASC, character_id ASC, image_id ASC`,
    )
    .all(groupId, userId, groupId, userId) as GachaHaremEntry[];
}

export function saveGachaDraw(
  groupId: string,
  messageId: string,
  userId: string,
  characterId: string,
  imageId: number,
): void {
  db_instance
    .prepare(
      "INSERT INTO GachaDraws (group_id, message_id, user_id, character_id, image_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(groupId, messageId, userId, characterId, imageId, Date.now());
}

export function getLastGachaDrawAt(
  groupId: string,
  userId: string,
): number | null {
  const result = db_instance
    .prepare(
      "SELECT MAX(created_at) AS last_draw_at FROM GachaDraws WHERE group_id = ? AND user_id = ?",
    )
    .get(groupId, userId) as { last_draw_at: number | null };
  return result.last_draw_at;
}

export function getLastGachaClaimAt(
  groupId: string,
  userId: string,
): number | null {
  const result = db_instance
    .prepare(
      `SELECT MAX(claimed_at) AS last_claim_at FROM (
         SELECT claimed_at FROM GachaImageOwnership WHERE group_id = ? AND user_id = ?
         UNION ALL
         SELECT claimed_at FROM GachaOwnership WHERE group_id = ? AND user_id = ?
       )`,
    )
    .get(groupId, userId, groupId, userId) as { last_claim_at: number | null };
  return result.last_claim_at;
}

export type GachaClaimResult =
  | { status: "claimed"; owner: GachaOwnership }
  | { status: "already_owned"; owner: GachaOwnership }
  | { status: "not_drawer" }
  | { status: "expired" }
  | { status: "not_found" }
  | { status: "already_resolved"; owner?: GachaOwnership };

export function claimGachaDraw(
  groupId: string,
  messageId: string,
  claimantId: string,
): GachaClaimResult {
  const claim = db_instance.transaction((): GachaClaimResult => {
    const draw = db_instance
      .prepare(
        "SELECT group_id, message_id, user_id, character_id, image_id, status, created_at FROM GachaDraws WHERE group_id = ? AND message_id = ?",
      )
      .get(groupId, messageId) as GachaDraw | undefined;

    if (!draw) return { status: "not_found" };
    if (draw.user_id !== claimantId) return { status: "not_drawer" };
    if (draw.status === "expired") return { status: "expired" };

    const existingOwner = getGachaOwnership(
      groupId,
      draw.character_id,
      draw.image_id,
    );
    if (draw.status !== "pending") {
      return { status: "already_resolved", owner: existingOwner };
    }

    if (Date.now() - draw.created_at >= GACHA_CLAIM_TTL_MS) {
      db_instance
        .prepare(
          "UPDATE GachaDraws SET status = 'expired' WHERE group_id = ? AND message_id = ?",
        )
        .run(groupId, messageId);
      return { status: "expired" };
    }

    if (existingOwner) {
      db_instance
        .prepare(
          "UPDATE GachaDraws SET status = 'unavailable' WHERE group_id = ? AND message_id = ?",
        )
        .run(groupId, messageId);
      return { status: "already_owned", owner: existingOwner };
    }

    const claimedAt = Date.now();
    db_instance
      .prepare(
        "INSERT INTO GachaImageOwnership (group_id, character_id, image_id, user_id, claimed_at, source_message_id) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        groupId,
        draw.character_id,
        draw.image_id,
        draw.user_id,
        claimedAt,
        messageId,
      );
    db_instance
      .prepare(
        "UPDATE GachaDraws SET status = 'claimed', claimed_at = ? WHERE group_id = ? AND message_id = ?",
      )
      .run(claimedAt, groupId, messageId);

    return {
      status: "claimed",
      owner: {
        group_id: groupId,
        character_id: draw.character_id,
        image_id: draw.image_id,
        user_id: draw.user_id,
        claimed_at: claimedAt,
        source_message_id: messageId,
      },
    };
  });

  return claim();
}