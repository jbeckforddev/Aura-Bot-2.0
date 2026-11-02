import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

export interface PremiumToken {
  id: string;
  createdAt: number;
  expiresAt: number;
  duration?: string;
  durationMs?: number;
  inUse?: boolean;
  claimedBy?: string;
  reservedBy?: string;
  reservedUntil?: number;
}

type TokenStore = Record<string, PremiumToken>;

const TOKEN_FILE = path.join(
  globalThis.DATA_BASE_DIR ?? path.resolve("./data"),
  "premium-tokens.json",
);
const MAX_RESERVATION_MS = 15 * 60 * 1000;

function normalizeTokenId(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function generateTokenId(store: TokenStore): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = randomBytes(4).toString("hex").slice(0, 6);
    if (!store[id]) return id;
  }
  throw new Error("No se pudo generar un token único. Intenta de nuevo.");
}

function normalizeJid(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const [user, server = ""] = raw.split("@");
  return `${user.split(":")[0]}${server ? `@${server}` : ""}`;
}

function normalizeAccountIdentity(value: string): string {
  const jid = normalizeJid(value);
  if (!jid) return "";

  const [user, server = ""] = jid.split("@");
  if (!server || server === "s.whatsapp.net" || server === "c.us") {
    const phoneNumber = user.replace(/\D/g, "");
    if (phoneNumber) return `phone:${phoneNumber}`;
  }
  return jid;
}

function isSameAccount(first: string, second: string): boolean {
  return normalizeAccountIdentity(first) === normalizeAccountIdentity(second);
}

function readStore(): TokenStore {
  if (!existsSync(TOKEN_FILE)) return {};

  const parsed: unknown = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("La base JSON de tokens premium tiene un formato inválido.");
  }

  const store = parsed as Record<string, unknown>;
  const result: TokenStore = {};
  let migratedLegacyTokens = false;
  for (const [key, value] of Object.entries(store)) {
    if (
      !value ||
      typeof value !== "object" ||
      !Number.isFinite(Number((value as PremiumToken).expiresAt))
    ) {
      throw new Error(`El registro del token "${key}" está dañado.`);
    }
    const token = value as PremiumToken;
    if (
      !token.duration &&
      !token.durationMs &&
      !token.inUse &&
      !token.claimedBy
    ) {
      const previousDuration = token.expiresAt - Number(token.createdAt);
      if (Number.isFinite(previousDuration) && previousDuration > 0) {
        token.durationMs = previousDuration;
        token.expiresAt = 0;
        migratedLegacyTokens = true;
      }
    }
    result[key] = token;
  }
  if (migratedLegacyTokens) writeStore(result);
  return result;
}

function writeStore(store: TokenStore): void {
  mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  const temporaryFile = `${TOKEN_FILE}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    renameSync(temporaryFile, TOKEN_FILE);
  } catch (error) {
    try {
      if (existsSync(temporaryFile)) unlinkSync(temporaryFile);
    } catch (cleanupError) {
      console.error("[premiumTokens] No se pudo limpiar el archivo temporal:", cleanupError);
    }
    throw error;
  }
}

function addDuration(from: number, amount: number, unit: string): number {
  const date = new Date(from);
  switch (unit.toLowerCase()) {
    case "mo": {
      const targetMonth = date.getMonth() + amount;
      const lastDay = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
      date.setDate(1);
      date.setMonth(targetMonth);
      date.setDate(Math.min(new Date(from).getDate(), lastDay));
      break;
    }
    case "m":
      date.setMinutes(date.getMinutes() + amount);
      break;
    case "s":
      date.setSeconds(date.getSeconds() + amount);
      break;
    case "h":
      date.setHours(date.getHours() + amount);
      break;
    case "d":
      date.setDate(date.getDate() + amount);
      break;
    case "w":
      date.setDate(date.getDate() + amount * 7);
      break;
    case "y":
      date.setFullYear(date.getFullYear() + amount);
      break;
    default:
      throw new Error("Unidad no válida. Usa s (segundos), m (minutos), h, d, w, mo (meses) o y.");
  }
  return date.getTime();
}

export function parsePremiumDuration(value: string, now = Date.now()): number {
  const match = String(value || "")
    .trim()
    .match(/^([1-9]\d{0,3})(mo|s|m|h|d|w|y)$/i);
  if (!match) {
    throw new Error("Duración inválida. Ejemplo: 60m, 30s, 60mo, 30d o 12h.");
  }
  return addDuration(now, Number(match[1]), match[2]);
}

export function createPremiumToken(
  id: string | null,
  duration: string,
): PremiumToken {
  const store = readStore();
  const tokenId = id ? normalizeTokenId(id) : generateTokenId(store);
  if (!/^[a-z0-9]{1,6}$/.test(tokenId)) {
    throw new Error("El token manual debe tener entre 1 y 6 caracteres alfanuméricos.");
  }
  const existing = store[tokenId];
  const now = Date.now();
  const isClaimed = Boolean(existing?.inUse || existing?.claimedBy);
  const renewalBase =
    existing && existing.expiresAt > now
      ? existing.expiresAt
      : now;
  const calculatedExpiration = parsePremiumDuration(duration, renewalBase);
  const expiresAt = isClaimed ? calculatedExpiration : 0;
  const token: PremiumToken = {
    id: tokenId,
    createdAt: existing?.createdAt ?? now,
    expiresAt,
    ...(!isClaimed ? { duration: duration.trim().toLowerCase() } : {}),
    inUse: existing?.inUse ?? false,
    ...(existing?.claimedBy ? { claimedBy: existing.claimedBy } : {}),
    ...(existing?.reservedBy ? { reservedBy: existing.reservedBy } : {}),
    ...(existing?.reservedUntil ? { reservedUntil: existing.reservedUntil } : {}),
  };
  store[tokenId] = token;
  writeStore(store);
  return token;
}

export function deletePremiumToken(id: string): PremiumToken | null {
  const tokenId = normalizeTokenId(id);
  const store = readStore();
  const token = store[tokenId] ?? null;
  if (token) {
    delete store[tokenId];
    writeStore(store);
  }
  return token;
}

export function reservePremiumToken(id: string, requester: string): PremiumToken {
  const tokenId = normalizeTokenId(id);
  const requesterJid = normalizeJid(requester);
  if (!requesterJid) {
    throw new Error("No se pudo identificar al usuario que solicita el token.");
  }
  const store = readStore();
  const token = store[tokenId];
  if (
    !token ||
    (token.expiresAt > 0 && token.expiresAt <= Date.now()) ||
    (token.expiresAt <= 0 && !token.duration && !token.durationMs)
  ) {
    throw new Error("El token no existe o ya expiró.");
  }
  if (token.inUse || token.claimedBy) {
    throw new Error("Este token ya fue utilizado por otra instancia.");
  }
  if (
    token.reservedBy &&
    token.reservedUntil &&
    token.reservedUntil > Date.now() &&
    !isSameAccount(token.reservedBy, requesterJid)
  ) {
    throw new Error("Este token ya está siendo utilizado para una vinculación.");
  }

  token.reservedBy = requesterJid;
  token.reservedUntil = Date.now() + MAX_RESERVATION_MS;
  writeStore(store);
  return token;
}

export function releasePremiumTokenReservation(
  id: string,
  requester: string,
): void {
  const tokenId = normalizeTokenId(id);
  const store = readStore();
  const token = store[tokenId];
  if (!token || !isSameAccount(token.reservedBy ?? "", requester)) {
    return;
  }
  delete token.reservedBy;
  delete token.reservedUntil;
  writeStore(store);
}

export function claimPremiumToken(
  id: string,
  requester: string,
  accountJid: string,
): boolean {
  const tokenId = normalizeTokenId(id);
  const store = readStore();
  const token = store[tokenId];
  const requesterJid = normalizeJid(requester);
  const account = normalizeJid(accountJid);
  if (!token || !account) return false;
  if (token.inUse || token.claimedBy) {
    return isSameAccount(token.claimedBy ?? "", account);
  }
  if (
    !isSameAccount(token.reservedBy ?? "", requesterJid) ||
    !token.reservedUntil ||
    token.reservedUntil <= Date.now()
  ) {
    return false;
  }

  const expiresAt = token.duration
    ? parsePremiumDuration(token.duration)
    : token.durationMs
      ? Date.now() + token.durationMs
      : token.expiresAt;
  if (expiresAt <= Date.now()) return false;
  token.expiresAt = expiresAt;
  token.inUse = true;
  token.claimedBy = account;
  delete token.duration;
  delete token.durationMs;
  delete token.reservedBy;
  delete token.reservedUntil;
  writeStore(store);
  return true;
}

export function isPremiumTokenValidForAccount(
  id: string,
  accountJid: string,
): boolean {
  const token = readStore()[normalizeTokenId(id)];
  return Boolean(
    token &&
      token.expiresAt > Date.now() &&
      token.inUse &&
      token.claimedBy &&
      isSameAccount(token.claimedBy, accountJid),
  );
}

export function getPremiumTokens(): PremiumToken[] {
  return Object.values(readStore());
}
