import { promises as fs } from "node:fs";
import path from "node:path";
import type { WAMessage } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";

type Character = {
  id: string | number;
  name: string;
  gender?: string;
  value?: string | number;
  source?: string;
  img?: string[];
  vid?: string[];
  user?: string | null;
  status?: string;
  votes?: number;
  [key: string]: unknown;
};

const charactersFilePath = path.resolve("./src/database/characters[1].json");

function pickImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;

  const valid = images.filter(
    (item): item is string =>
      typeof item === "string" &&
      /^https?:\/\//i.test(item.trim()),
  );

  if (!valid.length) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

function isAvailable(character: Character): boolean {
  const hasOwner =
    character.user !== undefined &&
    character.user !== null &&
    String(character.user).trim() !== "";

  return !hasOwner &&
    (!character.status || /^(libre|free|disponible)$/i.test(character.status));
}

export default {
  name: ["rollowner", "rowner"],
  category: "gacha",
  description: "Envía un personaje específico del gacha (solo owners).",
  ownerOnly: true,
  groupOnly: true,

  async run(ctx: CommandContext) {
    try {
      const requested = ctx.args.join(" ").trim();

      if (!requested) {
        return ctx.reply(
          `> ⓘ Uso: *${ctx.usedPrefix || "."}rollowner nombre o ID*\n` +
          `> ⓘ Ejemplos:\n` +
          `> • *${ctx.usedPrefix || "."}rollowner Miku Nakano*\n` +
          `> • *${ctx.usedPrefix || "."}rollowner 123*`,
        );
      }

      const raw = await fs.readFile(charactersFilePath, "utf8");
      const parsed: unknown = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        throw new Error("El archivo de personajes no contiene una lista válida.");
      }

      const characters = parsed as Character[];
      const normalized = requested.toLocaleLowerCase();

      const character = characters.find((item) =>
        String(item.id) === requested ||
        item.name?.trim().toLocaleLowerCase() === normalized
      );

      if (!character) {
        return ctx.reply(`> ⓘ No se encontró ningún personaje con el nombre o ID: *${requested}*.`);
      }

      if (!isAvailable(character)) {
        return ctx.reply(
          `> ⓘ *${character.name}* no está libre y no se puede reclamar con .c.\n` +
          `> ⓘ Estado actual: *${character.status || (character.user ? "Reclamado" : "No disponible")}*`,
        );
      }

      const imageUrl = pickImage(character.img);
      if (!imageUrl) {
        return ctx.reply(
          `> ⓘ Encontré a *${character.name}* (ID: ${character.id}), pero no tiene imágenes URL válidas en el campo img.`,
        );
      }

      const caption =
        `╭〔 🎴 GACHA OWNER 〕⬣\n` +
        `┃ 👤 Nombre: *${character.name}*\n` +
        `┃ ⚧ Género: *${character.gender || "Desconocido"}*\n` +
        `┃ 💰 Valor: *${character.value ?? "0"}*\n` +
        `┃ 📌 Estado: *${character.status || "Libre"}*\n` +
        `┃ 🎬 Fuente: *${character.source || "Desconocida"}*\n` +
        `┃ 🆔 ID: *${character.id}*\n` +
        `╰━━━━━━━━━━━━⬣\n\n` +
        `> ⓘ Para reclamarlo, responde a esta imagen con *${ctx.usedPrefix || "."}c*.`;

      await ctx.sock.sendMessage(
        ctx.from,
        { image: { url: imageUrl }, caption },
        { quoted: ctx.msg as WAMessage },
      );

      await ctx.react("✅");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido.";
      await ctx.reply(`> ⓘ Error en rollowner: ${message}`);
      await ctx.react("❌");
    }
  },
};
