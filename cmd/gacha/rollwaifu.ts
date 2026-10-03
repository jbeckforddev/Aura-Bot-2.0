
import { promises as fs } from "fs";
import type { CommandContext } from "../../types/index.d.ts";

interface Character {
  id: string;
  name: string;
  gender: string;
  value: string;
  source: string;
  img: string[];
  vid?: string[];
  user: string | null;
  status: string;
  votes: number;
}

const charactersFilePath = "./src/database/characters[1].json";
const cooldowns = new Map<string, number>();
const COOLDOWN = 3 * 60 * 1000;

async function loadCharacters(): Promise<Character[]> {
  const data = await fs.readFile(charactersFilePath, "utf-8");
  const characters: unknown = JSON.parse(data);

  if (!Array.isArray(characters)) {
    throw new Error("El archivo de personajes no contiene una lista válida.");
  }

  return characters as Character[];
}

export default {
  name: ["rw", "rollwaifu"],
  category: "gacha",
  description: "Sortear un personaje aleatorio.",
  async run(ctx: CommandContext) {
    const userId = ctx.sender;
    const now = Date.now();

    await ctx.react("⏳");

    try {
      const expiration = cooldowns.get(userId) ?? 0;

      if (now < expiration) {
        const remaining = Math.ceil((expiration - now) / 1000);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;

        await ctx.reply(
          `⏳ Debes esperar ${minutes} minutos y ${seconds} segundos.`
        );
        await ctx.react("❌");
        return;
      }

      const characters = await loadCharacters();

      if (characters.length === 0) {
        throw new Error("No hay personajes registrados.");
      }

      const character =
        characters[Math.floor(Math.random() * characters.length)];

      if (!character.img?.length) {
        throw new Error(
          `El personaje ${character.name} no tiene imágenes disponibles.`
        );
      }

      const image =
        character.img[Math.floor(Math.random() * character.img.length)];

      const owner = character.user;
      const status = owner
        ? "🔴 Ya reclamado"
        : "🟢 Disponible";

      const caption = [
        `🎴 *${character.name}*`,
        "",
        `> Género: *${character.gender}*`,
        `> Valor: *${character.value}*`,
        `> Estado: *${status}*`,
        `> Fuente: *${character.source}*`,
        "",
        `🔖 *ID: ${character.id}*`,
        owner ? `👤 Dueño: @${owner.split("@")[0]}` : "",
        "",
        "Usa el comando de reclamo respondiendo a este mensaje."
      ].filter(Boolean).join("\n");

      await ctx.reply({
        image: { url: image },
        caption,
        mentions: owner ? [owner] : []
      });

      cooldowns.set(userId, now + COOLDOWN);
      await ctx.react("✅");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido.";

      await ctx.reply(`❌ Error al sortear el personaje: ${message}`);
      await ctx.react("❌");
    }
  }
};
         
