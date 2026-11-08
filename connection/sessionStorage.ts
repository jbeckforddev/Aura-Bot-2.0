import { existsSync, statSync, type Dirent } from "node:fs";
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

export type BotSessionType = "Prem-Bot" | "Sub-Bot";

export interface BotSessionRoots {
  prem: string;
  sub: string;
}

const sessionLocks = new Map<string, Promise<unknown>>();

function withSessionLock<T>(accountId: string, task: () => Promise<T>): Promise<T> {
  const previous = sessionLocks.get(accountId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (sessionLocks.get(accountId) === next) {
        sessionLocks.delete(accountId);
      }
    });
  sessionLocks.set(accountId, next);
  return next;
}

function getAccountId(sessionName: string): string {
  return String(sessionName || "")
    .trim()
    .replace(/^(?:prem|sub)-/i, "");
}

function getSessionNames(sessionName: string): {
  prem: string;
  sub: string;
} {
  const accountId = getAccountId(sessionName);
  return {
    prem: `prem-${accountId}`,
    sub: `sub-${accountId}`,
  };
}

function getValidSessionDbMtime(dirPath: string): number {
  const dbPath = path.join(dirPath, "session.db");
  try {
    if (!existsSync(dbPath)) return 0;
    const stats = statSync(dbPath);
    return stats.isFile() && stats.size > 0 ? stats.mtimeMs : 0;
  } catch {
    return 0;
  }
}

export async function findStoredSessionNames(
  root: string,
  prefix: "sub" | "prem",
): Promise<string[]> {
  const resolvedRoot = path.resolve(root);
  let entries: Dirent<string>[];
  try {
    entries = await readdir(resolvedRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.toLowerCase().startsWith(`${prefix}-`) &&
        getValidSessionDbMtime(path.join(resolvedRoot, entry.name)) > 0,
    )
    .map((entry) => entry.name)
    .sort();
}

async function safeMoveDirectory(source: string, destination: string): Promise<void> {
  await rm(destination, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(path.dirname(destination), { recursive: true });

  try {
    await rename(source, destination);
  } catch {
    await cp(source, destination, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function getBotSessionDirectory(
  sessionName: string,
  type: BotSessionType,
  roots: BotSessionRoots,
): string {
  const names = getSessionNames(sessionName);
  const baseRoot = path.resolve(type === "Prem-Bot" ? roots.prem : roots.sub);
  return path.join(baseRoot, names[type === "Prem-Bot" ? "prem" : "sub"]);
}

export async function moveBotSessionDirectory(
  sessionName: string,
  type: BotSessionType,
  roots: BotSessionRoots,
): Promise<string> {
  const accountId = getAccountId(sessionName);

  return withSessionLock(accountId, async () => {
    const destination = getBotSessionDirectory(sessionName, type, roots);
    const names = getSessionNames(sessionName);
    const premRoot = path.resolve(roots.prem);
    const subRoot = path.resolve(roots.sub);

    const allCandidates = [
      path.join(subRoot, names.sub),
      path.join(premRoot, names.prem),
      path.join(premRoot, names.sub),
      path.join(subRoot, names.prem),
    ];

    const candidates = [...new Set(allCandidates)].filter(
      (candidate) => candidate !== destination,
    );

    const validSources = candidates
      .map((dir) => ({ dir, mtime: getValidSessionDbMtime(dir) }))
      .filter((item) => item.mtime > 0)
      .sort((a, b) => b.mtime - a.mtime);

    const destMtime = getValidSessionDbMtime(destination);

    if (destMtime > 0) {
      if (validSources.length > 0 && validSources[0].mtime > destMtime) {
        await safeMoveDirectory(validSources[0].dir, destination);
      }

      await Promise.all(
        candidates.map((candidate) =>
          rm(candidate, { recursive: true, force: true }).catch(() => undefined),
        ),
      );

      return destination;
    }

    if (validSources.length > 0) {
      const bestSource = validSources[0].dir;
      await safeMoveDirectory(bestSource, destination);

      await Promise.all(
        candidates
          .filter((candidate) => candidate !== bestSource)
          .map((candidate) =>
            rm(candidate, { recursive: true, force: true }).catch(() => undefined),
          ),
      );

      return destination;
    }

    if (existsSync(destination)) {
      return destination;
    }

    const fallbackSource = candidates.find((candidate) => existsSync(candidate));
    if (fallbackSource) {
      await safeMoveDirectory(fallbackSource, destination);
    }

    return destination;
  });
}

export async function removeBotSessionDirectories(
  sessionName: string,
  roots: BotSessionRoots,
): Promise<void> {
  const accountId = getAccountId(sessionName);

  return withSessionLock(accountId, async () => {
    const names = getSessionNames(sessionName);
    const premRoot = path.resolve(roots.prem);
    const subRoot = path.resolve(roots.sub);

    const directories = new Set([
      path.join(premRoot, names.prem),
      path.join(premRoot, names.sub),
      path.join(subRoot, names.sub),
      path.join(subRoot, names.prem),
    ]);

    await Promise.all(
      [...directories].map((directory) =>
        rm(directory, { recursive: true, force: true }).catch(() => undefined),
      ),
    );
  });
}
