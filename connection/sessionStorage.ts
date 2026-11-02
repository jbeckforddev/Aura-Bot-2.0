import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

export type BotSessionType = "Prem-Bot" | "Sub-Bot";

export interface BotSessionRoots {
  prem: string;
  sub: string;
}

function getSessionNames(sessionName: string): {
  prem: string;
  sub: string;
} {
  const accountId = sessionName.replace(/^(?:prem|sub)-/i, "");
  return {
    prem: `prem-${accountId}`,
    sub: `sub-${accountId}`,
  };
}

export function getBotSessionDirectory(
  sessionName: string,
  type: BotSessionType,
  roots: BotSessionRoots,
): string {
  const names = getSessionNames(sessionName);
  return path.join(type === "Prem-Bot" ? roots.prem : roots.sub, names[
    type === "Prem-Bot" ? "prem" : "sub"
  ]);
}

export async function moveBotSessionDirectory(
  sessionName: string,
  type: BotSessionType,
  roots: BotSessionRoots,
): Promise<string> {
  const destination = getBotSessionDirectory(sessionName, type, roots);

  const names = getSessionNames(sessionName);
  const candidates =
    type === "Prem-Bot"
      ? [
          path.join(roots.sub, names.sub),
          path.join(roots.prem, names.sub),
          path.join(roots.sub, names.prem),
        ]
      : [
          path.join(roots.prem, names.prem),
          path.join(roots.prem, names.sub),
          path.join(roots.sub, names.prem),
        ];
  const sourcesWithAuth = candidates.filter((candidate) =>
    existsSync(path.join(candidate, "session.db")),
  );
  if (sourcesWithAuth.length > 1) {
    throw new Error(
      `Hay credenciales duplicadas para ${sessionName}; revisa las carpetas de sesión antes de moverlas.`,
    );
  }
  if (existsSync(destination)) {
    if (
      existsSync(path.join(destination, "session.db")) &&
      sourcesWithAuth.length > 0
    ) {
      throw new Error(
        `Hay credenciales duplicadas para ${sessionName}; revisa las carpetas de sesión antes de moverlas.`,
      );
    }
    if (!existsSync(path.join(destination, "session.db")) && sourcesWithAuth.length > 0) {
      throw new Error(
        `La carpeta destino de ${sessionName} existe sin una sesión válida; no se movieron las credenciales.`,
      );
    }
    return destination;
  }

  const source = sourcesWithAuth[0] ?? candidates.find(existsSync);
  if (!source) return destination;

  await mkdir(path.dirname(destination), { recursive: true });
  await rename(source, destination);
  return destination;
}

export async function removeBotSessionDirectories(
  sessionName: string,
  roots: BotSessionRoots,
): Promise<void> {
  const names = getSessionNames(sessionName);
  const directories = new Set([
    path.join(roots.prem, names.prem),
    path.join(roots.prem, names.sub),
    path.join(roots.sub, names.sub),
    path.join(roots.sub, names.prem),
  ]);
  await Promise.all(
    [...directories].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
}
