import Database from "better-sqlite3";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CommandContext } from "../../types/index.d.ts";

const charactersFilePath = path.resolve("./src/database/characters[1].json");
const dataDir = globalThis.DATA_BASE_DIR || "./data";
const db = new Database(path.join(dataDir, "Aura.db"));

db.pragma("busy_timeout = 2000");
db.exec(`
  CREATE TABLE IF NOT EXISTS gacha_claims (
    character_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    character_name TEXT NOT NULL,
    claimed_at INTEGER NOT NULL
  );
`);

type Character = {
  id: string | number;
  name: string;
  value?: string | number;
};

type ClaimRow = {
  character_id: string;
  user_id: string;
  character_name: string;
  claimed_at: number;
};

async function loadCharacters(): Promise<Character[]> {
  try {
    const data = await fs.readFile(charactersFilePath, "utf8");
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      throw new Error("El archivo de personajes no contiene una lista válida.");
    }
    return parsed as Character[];
  } catch {
    return [];
  }
}

function normalizeJid(value: unknown): string {
  return String(value || "").trim().split(":")[0];
}

function getMessageContext(ctx: CommandContext): any {
  const message = ctx.msg?.message as Record<string, any> | undefined;
  if (!message) return {};

  const wrappers = [
    message.ephemeralMessage?.message,
    message.viewOnceMessage?.message,
    message.viewOnceMessageV2?.message,
    message.documentWithCaptionMessage?.message,
  ].filter(Boolean);

  const current = wrappers[0] ?? message;
  for (const value of Object.values(current)) {
    if (value && typeof value === "object" && (value as any).contextInfo) {
      return (value as any).contextInfo;
    }
  }
  return {};
}

export default {
  name: ["harem", "harén", "mispersonajes"],
  category: "gacha",
  description: "Muestra los personajes reclamados por ti o por otro usuario.",
  groupOnly: true,

  async run(ctx: CommandContext) {
    try {
      if (!ctx.isGroup) {
        return ctx.reply("❌ Este comando solo funciona en grupos.");
      }

      const contextInfo = getMessageContext(ctx);
      const mentionedJid = Array.isArray(contextInfo.mentionedJid)
        ? String(contextInfo.mentionedJid[0] || "")
        : "";

      const quotedSender = normalizeJid(contextInfo.participant || "");
      const firstArg = String(ctx.args?.[0] || "");
      const secondArg = String(ctx.args?.[1] || "");

      let targetId = normalizeJid(ctx.sender);
      let pageText = firstArg;

      // Permite responder al mensaje de alguien para consultar su harem.
      if (quotedSender) {
        targetId = quotedSender;
        pageText = firstArg;
      } else if (mentionedJid) {
        targetId = normalizeJid(mentionedJid);
        pageText = secondArg || ( /^\d+$/.test(firstArg) ? firstArg : "1");
      } else if (firstArg.startsWith("@")) {
        // Respaldo si la mención viene escrita como texto.
        const number = firstArg.replace(/^@/, "").replace(/\D/g, "");
        if (number) targetId = `${number}@s.whatsapp.net`;
        pageText = secondArg || "1";
      }

      if (targetId.endsWith("@lid")) {
        targetId = normalizeJid((await ctx.resolveLid(targetId)) || targetId);
      }

      const requestedPage = /^\d+$/.test(pageText) ? Number.parseInt(pageText, 10) : 1;
      if (!Number.isInteger(requestedPage) || requestedPage < 1) {
        return ctx.reply("⚠️ Indica una página válida. Ejemplo: `.harem 2`");
      }

      const rows = db.prepare(`
        SELECT character_id, user_id, character_name, claimed_at
        FROM gacha_claims
        WHERE user_id = ?
        ORDER BY claimed_at ASC
      `).all(targetId) as ClaimRow[];

      // Respaldo para instalaciones donde el JID guardado incluye un sufijo de dispositivo.
      const claims = rows.length
        ? rows
        : (db.prepare(`
            SELECT character_id, user_id, character_name, claimed_at
            FROM gacha_claims
            WHERE REPLACE(SUBSTR(user_id, 1, INSTR(user_id, '@') - 1), ':', '') = ?
            ORDER BY claimed_at ASC
          `).all(targetId.split("@")[0].split(":")[0]) as ClaimRow[]);

      if (!claims.length) {
        const isSelf = targetId === normalizeJid(ctx.sender);
        const label = isSelf ? "No tienes" : `@${targetId.split("@")[0]} no tiene`;
        return ctx.reply({
          text: `> ⓘ ${label} personajes reclamados.`,
          mentions: isSelf ? [] : [targetId],
        });
      }

      const characters = await loadCharacters();
      const characterById = new Map(
        characters.map((character) => [String(character.id), character]),
      );

      const pageSize = 50;
      const totalCharacters = claims.length;
      const totalPages = Math.ceil(totalCharacters / pageSize);

      if (requestedPage > totalPages) {
        return ctx.reply(
          `> ⓘ Página no válida.\n> ⓘ Páginas disponibles: *1 - ${totalPages}*`,
        );
      }

      const page = requestedPage;
      const startIndex = (page - 1) * pageSize;
      const pageClaims = claims.slice(startIndex, startIndex + pageSize);

      let message =
        `> ⓘ Usuario: *@${targetId.split("@")[0]}*\n` +
        `> ⓘ Total de personajes: *${totalCharacters}*\n` +
        `> ⓘ Página: *${page}/${totalPages}*\n\n`;

      pageClaims.forEach((claim, index) => {
        const character = characterById.get(String(claim.character_id));
        const name = character?.name || claim.character_name || `ID ${claim.character_id}`;
        const value = character?.value != null ? ` — ${character.value}` : "";
        message += `${startIndex + index + 1}. *${name}*${value}\n`;
      });

      if (page < totalPages) {
        message += `\n> ⓘ Usa: *.harem ${page + 1}* para ver la siguiente página.`;
      }

      return ctx.reply({
        text: message,
        mentions: [targetId],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido.";
      return ctx.reply(`> ⓘ Error al consultar el harem: ${message}`);
    }
  },
};
    
