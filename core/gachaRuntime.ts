import { GachaCharacters } from "../src/GachaCharacters/index.ts";
import type { proto } from "baileys";

export type GachaRarity =
  | "Especial"
  | "Super especial"
  | "Épico"
  | "Mítico"
  | "Legendario";

export interface GachaCharacter {
  id: string;
  name: string;
  rarity: GachaRarity;
  type: string;
  source?: string;
  value: number;
  images: GachaImageVariant[];
}

export interface GachaImageVariant {
  id: number;
  url: string;
}

const RARITY_WEIGHTS: Record<GachaRarity, number> = {
  Especial: 50,
  "Super especial": 25,
  "Épico": 15,
  "Mítico": 8,
  Legendario: 2,
};

const RARITY_ALIASES: Record<string, GachaRarity> = {
  especial: "Especial",
  special: "Especial",
  "super especial": "Super especial",
  "super special": "Super especial",
  epico: "Épico",
  epic: "Épico",
  mitico: "Mítico",
  mitic: "Mítico",
  mythic: "Mítico",
  legendario: "Legendario",
  legendary: "Legendario",
};

function normalizeRarity(value: unknown): GachaRarity {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
  return RARITY_ALIASES[normalized] || "Especial";
}

function loadCharacters(): GachaCharacter[] {
  const entries = Object.entries(GachaCharacters as Record<string, unknown>);
  return entries.flatMap(([id, value]) => {
    if (!value || typeof value !== "object") return [];
    const character = value as Record<string, unknown>;
    const rawImages = Array.isArray(character.img)
      ? character.img
      : [character.img];
    const images = rawImages.flatMap((image, index): GachaImageVariant[] => {
      const imageData =
        typeof image === "string"
          ? { id: index + 1, url: image }
          : image && typeof image === "object"
            ? (image as Record<string, unknown>)
            : null;
      if (!imageData) return [];

      const imageId = Number(imageData.id);
      const url = typeof imageData.url === "string" ? imageData.url.trim() : "";
      if (!Number.isSafeInteger(imageId) || imageId < 0 || !/^https?:\/\//i.test(url)) {
        return [];
      }
      return [{ id: imageId, url }];
    });
    if (images.length === 0) return [];

    return [
      {
        id,
        name: String(character.name || id),
        rarity: normalizeRarity(character.rarity),
        type: String(character.type || "Sin tipo"),
        source:
          typeof character.source === "string" ? character.source.trim() : "",
        value: Number.isFinite(Number(character.value))
          ? Number(character.value)
          : 0,
        images,
      },
    ];
  });
}

const CHARACTERS = loadCharacters();

export function getGachaCatalogStats() {
  const series = new Set(
    CHARACTERS.map((character) => character.source.trim().toLowerCase()).filter(
      Boolean,
    ),
  );
  return { characters: CHARACTERS.length, series: series.size };
}

export function drawRandomCharacter(): GachaCharacter {
  if (CHARACTERS.length === 0) {
    throw new Error("El catálogo gacha no contiene personajes con imágenes válidas.");
  }

  const rarityCounts = new Map<GachaRarity, number>();
  for (const character of CHARACTERS) {
    rarityCounts.set(
      character.rarity,
      (rarityCounts.get(character.rarity) || 0) + 1,
    );
  }

  const weighted = CHARACTERS.map((character) => ({
    character,
    weight:
      RARITY_WEIGHTS[character.rarity] /
      (rarityCounts.get(character.rarity) || 1),
  }));
  const totalWeight = weighted.reduce((total, entry) => total + entry.weight, 0);
  let selection = Math.random() * totalWeight;

  for (const entry of weighted) {
    selection -= entry.weight;
    if (selection < 0) return entry.character;
  }

  return weighted[weighted.length - 1]!.character;
}

export function drawRandomImage(character: GachaCharacter): GachaImageVariant {
  return character.images[Math.floor(Math.random() * character.images.length)]!;
}

export function getQuotedMessageId(
  message: proto.IWebMessageInfo,
): string | null {
  const findContextInfo = (
    value: unknown,
    depth = 0,
  ): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || depth > 8) return null;
    const record = value as Record<string, unknown>;
    if (record.contextInfo && typeof record.contextInfo === "object") {
      return record.contextInfo as Record<string, unknown>;
    }

    for (const child of Object.values(record)) {
      const found = findContextInfo(child, depth + 1);
      if (found) return found;
    }
    return null;
  };

  const contextInfo = findContextInfo(message.message);
  return typeof contextInfo?.stanzaId === "string"
    ? contextInfo.stanzaId
    : null;
}

export const GACHA_COOLDOWNS = {
  claim: 5 * 60 * 1000, // 5 Minutos
  rw: 10 * 60 * 1000, // 10 Minutos
} as const;