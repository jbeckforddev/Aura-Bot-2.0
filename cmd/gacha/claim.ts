import Database from "better-sqlite3";
import { existsSync, mkdirSync, promises as fs } from "node:fs";
import path from "node:path";
import type { CommandContext } from "../../types/index.d.ts";

const charactersFilePath = path.resolve("./src/database/characters[1].json");
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 15_000;

type Character = {
  id: string | number;
  name: string;
  user?: string | null;
  status?: string;
  [key: string]: unknown;
};

type MessageNode = Record<string, any> | null | undefined;


const dataDir = globalThis.DATA_BASE_DIR || "./data";
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
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

const getClaim = db.prepare(
  "SELECT user_id, character_name FROM gacha_claims WHERE character_id = ?",
);
const insertClaim = db.prepare(`
  INSERT OR IGNORE INTO gacha_claims
    (character_id, user_id, character_name, claimed_at)
  VALUES (?, ?, ?, ?)
`);

function unwrapMessage(message: MessageNode): MessageNode {
  let current = message;
  while (current && typeof current === "object") {
    const next =
      current.ephemeralMessage?.message ??
      current.viewOnceMessage?.message ??
      current.viewOnceMessageV2?.message ??
      current.documentWithCaptionMessage?.message;
    if (!next) break;
    current = next;
  }
  return current;
}

function getQuotedContext(ctx: CommandContext): any {
  const message = ctx.msg?.message as MessageNode;
  const unwrapped = unwrapMessage(message);
  if (!unwrapped) return null;

  for (const value of Object.values(unwrapped)) {
    if (value && typeof value === "object" && (value as any).contextInfo?.quotedMessage) {
      return (value as any).contextInfo;
    }
  }
  return null;
}

function getQuotedText(quotedMessage: MessageNode): string {
  const message = unwrapMessage(quotedMessage);
  if (!message) return "";

  return String(
    message.conversation ??
      message.extendedTextMessage?.text ??
      message.imageMessage?.caption ??
      message.videoMessage?.caption ??
      message.documentMessage?.caption ??
      message.documentWithCaptionMessage?.message?.documentMessage?.caption ??
      message.buttonsMessage?.contentText ??
      "",
  );
}

async function loadCharacters(): Promise<Character[]> {
  const data = await fs.readFile(charactersFilePath, "utf8");
  const parsed: unknown = JSON.parse(data);
  if (!Array.isArray(parsed)) throw new Error("El archivo de personajes no contiene una lista válida.");
  return parsed as Character[];
}

export default {
  name: ["claim", "c"],
  description: "Reclama el personaje citado en el mensaje.",
  category: "gacha",
  groupOnly: true,
  async run(ctx: CommandContext) {
    await ctx.react("⏳");

    const now = Date.now();
    const cooldownUntil = cooldowns.get(ctx.sender) ?? 0;
    if (now < cooldownUntil) {
      const remaining = Math.ceil((cooldownUntil - now) / 1000);
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      await ctx.reply(`> ⓘ Debes esperar: *${minutes} minutos y ${seconds} segundos*.`);
      await ctx.react("❌");
      return;
    }

    const quotedContext = getQuotedContext(ctx);
    const quotedMessage = quotedContext?.quotedMessage;
    if (!quotedMessage) {
      await ctx.reply("> ⓘ Responde al mensaje del personaje enviado por .rw con .claim.");
      await ctx.react("❌");
      return;
    }

    try {
      const quotedText = getQuotedText(quotedMessage);
      const match = quotedText.match(/\bID\s*:\s*([^*\n\r]+)/i);
      if (!match) {
        await ctx.reply("> ⓘ No encontré el ID del personaje. Cita el mensaje completo del personaje.");
        await ctx.react("❌");
        return;
      }

      const characterId = match[1].trim();
      const characters = await loadCharacters();
      const character = characters.find((item) => String(item.id) === characterId);
      if (!character) {
        await ctx.reply("> ⓘ El ID citado no corresponde a un personaje de la base de datos.");
        await ctx.react("❌");
        return;
      }

     
      const senderId = ctx.sender.endsWith("@lid")
        ? (await ctx.resolveLid(ctx.sender)) || ctx.sender
        : ctx.sender;

      const existing = getClaim.get(String(character.id)) as
        | { user_id: string; character_name: string }
        | undefined;

      if (existing) {
        if (existing.user_id === senderId) {
          await ctx.reply(`> ⓘ Ya reclamaste a *${character.name}* anteriormente.`);
        } else {
          await ctx.reply("> ⓘ Este personaje ya fue reclamado por otra persona.");
        }
        await ctx.react("❌");
        return;
      }

    
      if (character.user) {
        await ctx.reply("> ⓘ Este personaje ya figura como reclamado en los datos existentes.");
        await ctx.react("❌");
        return;
      }

   
      const result = insertClaim.run(
        String(character.id),
        senderId,
        String(character.name),
        now,
      );

      if (result.changes === 0) {
        await ctx.reply("> ⓘ Otro usuario acaba de reclamar este personaje. Intenta con otro.");
        await ctx.react("❌");
        return;
      }

      cooldowns.set(ctx.sender, now + COOLDOWN_MS);
      await ctx.reply(`> ⓘ Has reclamado a *${character.name}* correctamente. ✅`);
      await ctx.react("✅");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.reply(`> ⓘ Error al reclamar el personaje: *${message}*`);
      await ctx.react("❌");
    }
  },
};
