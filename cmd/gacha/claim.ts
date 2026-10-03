import { promises as fs } from "node:fs";
import type { CommandContext } from "../../types/index.d.ts";

const charactersFilePath = "./src/database/characters[1].json";
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 15_000;

interface Character {
  id: string | number;
  name: string;
  user?: string | null;
  status?: string;
  [key: string]: unknown;
}

async function loadCharacters(): Promise<Character[]> {
  const data = await fs.readFile(charactersFilePath, "utf8");
  const parsed: unknown = JSON.parse(data);
  if (!Array.isArray(parsed)) {
    throw new Error("El archivo de personajes no contiene una lista válida.");
  }
  return parsed as Character[];
}

async function saveCharacters(characters: Character[]): Promise<void> {
  await fs.writeFile(
    charactersFilePath,
    JSON.stringify(characters, null, 2),
    "utf8",
  );
}

function getQuotedText(ctx: CommandContext): string {
  const message = ctx.msg.message as any;
  const contextInfo =
    message?.extendedTextMessage?.contextInfo ??
    message?.imageMessage?.contextInfo ??
    message?.videoMessage?.contextInfo ??
    message?.documentMessage?.contextInfo;

  let quoted = contextInfo?.quotedMessage;
  if (!quoted) return "";

  // Algunos mensajes citados pueden estar envueltos en mensajes efímeros.
  quoted =
    quoted.ephemeralMessage?.message ??
    quoted.viewOnceMessage?.message ??
    quoted.viewOnceMessageV2?.message ??
    quoted;

  return String(
    quoted.imageMessage?.caption ??
      quoted.videoMessage?.caption ??
      quoted.documentMessage?.caption ??
      quoted.extendedTextMessage?.text ??
      quoted.conversation ??
      "",
  );
}

export default {
  name: ["claim", "c"],
  description: "Reclama un personaje de Gacha respondiendo a su mensaje.",
  category: "gacha",
  groupOnly: true,
  async run(ctx: CommandContext) {
    await ctx.react("⏳");

    const now = Date.now();
    const nextAllowed = cooldowns.get(ctx.sender) ?? 0;
    if (now < nextAllowed) {
      const remaining = Math.ceil((nextAllowed - now) / 1000);
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      await ctx.reply(
        `> ⓘ Debes esperar: *${minutes} minutos y ${seconds} segundos*`,
      );
      await ctx.react("❌");
      return;
    }

    const quotedText = getQuotedText(ctx);
    if (!quotedText) {
      await ctx.reply(
        "> ⓘ Debes responder al mensaje del personaje enviado por .rw.",
      );
      await ctx.react("❌");
      return;
    }

    const idMatch = quotedText.match(/\bID\s*:\s*([^*\r\n]+)/i);
    if (!idMatch) {
      await ctx.reply(
        "> ⓘ No se encontró el ID. Responde al mensaje del personaje enviado por .rw.",
      );
      await ctx.react("❌");
      return;
    }

    const characterId = (idMatch[1] ?? "").trim();

    try {
      const characters = await loadCharacters();
      const character = characters.find(
        (item) => String(item.id).trim() === characterId,
      );

      if (!character) {
        await ctx.reply(
          "> ⓘ El personaje citado no existe en characters[1].json.",
        );
        await ctx.react("❌");
        return;
      }

      if (character.user && character.user !== ctx.sender) {
        await ctx.reply(
          "> ⓘ Este personaje ya ha sido reclamado por otro usuario.",
        );
        await ctx.react("❌");
        return;
      }

      character.user = ctx.sender;
      character.status = "Reclamado";
      await saveCharacters(characters);
      cooldowns.set(ctx.sender, now + COOLDOWN_MS);

      await ctx.reply(`> ⓘ Has reclamado a: *${character.name}* ✅`);
      await ctx.react("✅");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      await ctx.reply(`> ⓘ Error al reclamar el personaje: *${message}*`);
      await ctx.react("❌");
    }
  },
};
