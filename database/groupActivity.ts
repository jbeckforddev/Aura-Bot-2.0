import type { Database } from "better-sqlite3";
import type {
  GroupRanking,
  GroupRankingEntry,
  GroupRankingPage,
} from "../types/database.d.ts";

export const GROUP_RANKING_PAGE_SIZE = 10;
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
// El primer lunes desde el inicio de Unix a las 00:00 en Costa Rica.
const MONDAY = 4 * DAY + 6 * 60 * 60 * 1000;
const RANKINGS = ["topMsgUsers", "topCmdUsers"] as const;

function currentWeek(): number {
  return Math.floor((Date.now() - MONDAY) / WEEK) * WEEK + MONDAY;
}

function legacyWeek(week: number): string {
  const thursday = new Date(week + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const number =
    Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / WEEK) + 1;
  return `${year}-W${String(number).padStart(2, "0")}`;
}

function parseJson(value: string | null): unknown {
  try {
    return value === null ? null : JSON.parse(value);
  } catch {
    return null;
  }
}

function readEntries(value: string | null): GroupRankingEntry[] {
  const entries = parseJson(value);
  return Array.isArray(entries) ? (entries as GroupRankingEntry[]) : [];
}

export function createGroupActivity(database: Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS group_weekly_activity (
      groupJid TEXT NOT NULL REFERENCES groups(jid) ON DELETE CASCADE,
      jid TEXT NOT NULL,
      messages INTEGER NOT NULL DEFAULT 0,
      commands INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (groupJid, jid)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_group_weekly_messages
      ON group_weekly_activity (groupJid, messages DESC, jid) WHERE messages > 0;
    CREATE INDEX IF NOT EXISTS idx_group_weekly_commands
      ON group_weekly_activity (groupJid, commands DESC, jid) WHERE commands > 0;
  `);

  const groupWeek = database.prepare<[string], { rankingWeek: number | null }>(
    "SELECT rankingWeek FROM groups WHERE jid = ?",
  );
  const createGroup = database.prepare(
    "INSERT OR IGNORE INTO groups (jid, group_id) VALUES (?, ?)",
  );
  const legacyGroup = database.prepare<
    [string],
    Record<GroupRanking | "data", string | null>
  >("SELECT topMsgUsers, topCmdUsers, data FROM groups WHERE jid = ?");
  const resetGroup = database.prepare(
    "UPDATE groups SET rankingWeek = ?, topMsgUsers = '[]', topCmdUsers = '[]' WHERE jid = ?",
  );
  const resetCounts = database.prepare(
    "DELETE FROM group_weekly_activity WHERE groupJid = ?",
  );
  const addCounts = database.prepare(`
    INSERT INTO group_weekly_activity (groupJid, jid, messages, commands) VALUES (?, ?, ?, ?)
    ON CONFLICT (groupJid, jid) DO UPDATE SET
      messages = messages + excluded.messages,
      commands = commands + excluded.commands
  `);
  const removeAlias = database.prepare<
    [string, string],
    { messages: number; commands: number }
  >(`
    DELETE FROM group_weekly_activity WHERE groupJid = ? AND jid = ? RETURNING messages, commands
  `);

  function rankingStatements(
    ranking: GroupRanking,
    column: "messages" | "commands",
  ) {
    const rankedUsers = `FROM group_weekly_activity WHERE groupJid = ? AND ${column} > 0`;
    const orderedUsers = `SELECT jid, ${column} AS count ${rankedUsers} ORDER BY ${column} DESC, jid`;
    return {
      save: database.prepare(`
        WITH ranking(value) AS MATERIALIZED (
          SELECT json_group_array(json_object('jid', jid, 'count', count))
          FROM (${orderedUsers} LIMIT ${GROUP_RANKING_PAGE_SIZE})
        )
        UPDATE groups SET ${ranking} = ranking.value FROM ranking
        WHERE jid = ? AND ${ranking} IS NOT ranking.value
      `),
      read: database.prepare<
        [string],
        { rankingWeek: number | null; entries: string | null }
      >(`SELECT rankingWeek, ${ranking} AS entries FROM groups WHERE jid = ?`),
      count: database.prepare<[string], { count: number }>(
        `SELECT COUNT(*) AS count ${rankedUsers}`,
      ),
      page: database.prepare<[string, number, number], GroupRankingEntry>(
        `${orderedUsers} LIMIT ? OFFSET ?`,
      ),
    };
  }

  const rankings = {
    topMsgUsers: rankingStatements("topMsgUsers", "messages"),
    topCmdUsers: rankingStatements("topCmdUsers", "commands"),
  };
  const messageCounts = database.prepare<[string, number], GroupRankingEntry>(`
    SELECT activity.jid, activity.messages AS count
    FROM group_weekly_activity AS activity
    JOIN groups ON groups.jid = activity.groupJid
    WHERE activity.groupJid = ? AND groups.rankingWeek = ? AND activity.messages > 0
  `);

  function importLegacyRanking(
    groupJid: string,
    ranking: GroupRanking,
    week: number,
    source: unknown,
  ) {
    if (!Array.isArray(source)) return;
    const isoWeek = legacyWeek(week);
    for (const entry of source) {
      const jid = entry?.jid || entry?.lid;
      const value = entry?.count;
      const count =
        typeof value === "number" || typeof value === "string"
          ? Number(value)
          : 0;
      if (
        entry?.week !== isoWeek ||
        typeof jid !== "string" ||
        !jid ||
        !Number.isSafeInteger(count) ||
        count <= 0
      )
        continue;
      addCounts.run(
        groupJid,
        jid,
        ranking === "topMsgUsers" ? count : 0,
        ranking === "topCmdUsers" ? count : 0,
      );
    }
  }

  function ensureCurrentWeek(groupJid: string, week: number) {
    const group = groupWeek.get(groupJid);
    if (group?.rankingWeek === week) return;

    if (!group) createGroup.run(groupJid, groupJid);
    if (group?.rankingWeek === null) {
      const legacy = legacyGroup.get(groupJid);
      const data = parseJson(legacy?.data ?? null) as Partial<
        Record<GroupRanking, unknown>
      > | null;
      resetGroup.run(week, groupJid);
      for (const ranking of RANKINGS) {
        const entries = parseJson(legacy?.[ranking] ?? null);
        importLegacyRanking(
          groupJid,
          ranking,
          week,
          Array.isArray(entries) && entries.length ? entries : data?.[ranking],
        );
        rankings[ranking].save.run(groupJid, groupJid);
      }
      return;
    }

    if (group) resetCounts.run(groupJid);
    resetGroup.run(week, groupJid);
  }
  const initializeWeek = database.transaction(ensureCurrentWeek);

  function refreshExistingWeek(groupJid: string): number {
    const week = currentWeek();
    const group = groupWeek.get(groupJid);
    if (group && group.rankingWeek !== week)
      initializeWeek.immediate(groupJid, week);
    return week;
  }

  const record = database.transaction(
    (groupJid: string, jid: string, ranking: GroupRanking, lid?: string) => {
      ensureCurrentWeek(groupJid, currentWeek());
      const alias =
        lid && lid.endsWith("@lid") && lid !== jid
          ? removeAlias.get(groupJid, lid)
          : undefined;
      const messages = alias?.messages ?? 0;
      const commands = alias?.commands ?? 0;
      addCounts.run(
        groupJid,
        jid,
        messages + Number(ranking === "topMsgUsers"),
        commands + Number(ranking === "topCmdUsers"),
      );
      if (ranking === "topMsgUsers" || messages > 0)
        rankings.topMsgUsers.save.run(groupJid, groupJid);
      if (ranking === "topCmdUsers" || commands > 0)
        rankings.topCmdUsers.save.run(groupJid, groupJid);
    },
  );

  function getRanking(
    groupJid: string,
    ranking: GroupRanking,
  ): GroupRankingEntry[] {
    const week = currentWeek();
    let row = rankings[ranking].read.get(groupJid);
    if (row && row.rankingWeek !== week) {
      initializeWeek.immediate(groupJid, week);
      row = rankings[ranking].read.get(groupJid);
    }
    if (row?.rankingWeek !== week) return [];
    return readEntries(row.entries);
  }

  const readRankingPage = database.transaction(
    (
      groupJid: string,
      ranking: GroupRanking,
      week: number,
      page: number,
    ): GroupRankingPage => {
      const statements = rankings[ranking];
      const row = statements.read.get(groupJid);
      if (row?.rankingWeek !== week) return { entries: [], totalPages: 0 };

      const totalPages = Math.ceil(
        (statements.count.get(groupJid)?.count ?? 0) / GROUP_RANKING_PAGE_SIZE,
      );
      if (!Number.isSafeInteger(page) || page < 1 || page > totalPages) {
        return { entries: [], totalPages };
      }

      const entries =
        page === 1
          ? readEntries(row.entries)
          : statements.page.all(
              groupJid,
              GROUP_RANKING_PAGE_SIZE,
              (page - 1) * GROUP_RANKING_PAGE_SIZE,
            );
      return { entries, totalPages };
    },
  );

  function getRankingPage(
    groupJid: string,
    ranking: GroupRanking,
    page: number,
  ): GroupRankingPage {
    return readRankingPage(
      groupJid,
      ranking,
      refreshExistingWeek(groupJid),
      page,
    );
  }

  function getMessageCounts(groupJid: string): GroupRankingEntry[] {
    return messageCounts.all(groupJid, refreshExistingWeek(groupJid));
  }

  return {
    record: record.immediate,
    getRanking,
    getRankingPage,
    getMessageCounts,
  };
}
