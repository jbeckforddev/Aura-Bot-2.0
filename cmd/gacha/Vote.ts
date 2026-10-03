import { promises as fs } from "node:fs";
import path from "node:path";
import type { CommandContext } from "../../types/index.d.ts";

type Character = {
  id: string | number;
  name: string;
  value: string | number;
  votes?: number;
  [key: string]: unknown;
};

const charactersFilePath = path.resolve("./src/database/characters[1].json");
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000;

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
    `${JSON.stringify(characters, null, 2)}\n`,
    "utf8",
  );
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours} horas, ${minutes} minutos y ${seconds} segundos`;
}

export default {
  name: ["vote", "votar"],
  category: "gacha",
  description: "Vota por un personaje y aumenta su valor.",
  groupOnly: true,

  async run(ctx: CommandContext) {
    try {
      if (!ctx.isGroup) {
        return ctx.reply("❌ Este comando solo funciona en grupos.");
      }

      const userId = ctx.sender;
      const now = Date.now();
      const expiration = cooldowns.get(userId) ?? 0;

      if (now < expiration) {
        return ctx.reply(
          `> ⓘ Debes esperar *${formatTime(expiration - now)}* antes de volver a votar.`,
        );
      }

      const characterName = ctx.args.join(" ").trim();
      if (!characterName) {
        return ctx.reply(
          `> ⓘ Uso: *${ctx.usedPrefix || "."}vote nombre del personaje*\n` +
          `> ⓘ Ejemplo: *${ctx.usedPrefix || "."}vote Miku Nakano*`,
        );
      }

      const characters = await loadCharacters();
      const character = characters.find(
        (item) => item.name.trim().toLocaleLowerCase() === characterName.toLocaleLowerCase(),
      );

      if (!character) {
        return ctx.reply(
          `> ⓘ No se encontró el personaje: *${characterName}*.\n` +
          "> ⓘ Escribe el nombre completo tal como aparece en la base de personajes.",
        );
      }

      const currentValue = Number(character.value);
      if (!Number.isFinite(currentValue)) {
        return ctx.reply(
          `> ⓘ El valor de *${character.name}* no es numérico y no se puede incrementar.`,
        );
      }

      const increment = Math.floor(Math.random() * 10) + 1;
      const previousValue = character.value;
      const previousVotes = Number(character.votes ?? 0);

      character.value = String(currentValue + increment);
      character.votes = (Number.isFinite(previousVotes) ? previousVotes : 0) + 1;

      try {
        await saveCharacters(characters);
      } catch {
        // Revert in-memory changes if the write fails.
        character.value = previousValue;
        character.votes = previousVotes;
        throw new Error("No se pudo guardar el archivo de personajes.");
      }

      cooldowns.set(userId, now + COOLDOWN_MS);

      await ctx.reply(
        `> ⓘ Has votado por: *${character.name}*\n` +
        `> ⓘ Incremento: *+${increment}*\n` +
        `> ⓘ Valor nuevo: *${character.value}*\n` +
        `> ⓘ Votos totales: *${character.votes}*\n` +
        "> ⓘ Podrás votar otra vez dentro de 1 hora.",
      );
      await ctx.react("✅");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido.";
      await ctx.reply(`> ⓘ Error al votar: ${message}`);
      await ctx.react("❌");
    }
  },
};
