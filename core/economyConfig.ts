import { db } from "../database/AuraDB.ts";
import { formatMoney as formatNumberMoney, formatDuration } from "../utils/formatter.ts";
import { getFileBytes } from "./downloadUtils.ts";
import { NOT_HAVE_COINS } from "./socketText.ts";
import type {
  CommandContext,
  EconomyUser,
  CooldownRows,
} from "../types/index.d.ts";

export type { EconomyUser, CooldownRows };

const DEFAULT_ECONOMY_USER: EconomyUser = {
  bolsillo: 100000,
  banco: 10000,
  coins: 100000,
  bank: 10000,
};

const COOLDOWNS: CooldownRows = {
  roulete: 1 * 60 * 1000,
  cf: 1 * 60 * 1000,
  ppt: 1 * 60 * 1000,
  work: 3 * 60 * 1000,
  mine: 30 * 60 * 1000,
  hunt: 30 * 60 * 1000,
  crime: 60 * 60 * 1000,
  slut: 60 * 60 * 1000,
  steal: 60 * 60 * 1000,
  adventure: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  fortnightly: 15 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  aura: 3 * 60 * 1000,
};

export function formTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  return formatDuration(totalSeconds);
}

function parseJidAndDefaults(
  arg1: string,
  arg2?: string | Partial<EconomyUser>,
  arg3?: Partial<EconomyUser>,
): { userJid: string; defaults: Partial<EconomyUser> } {
  if (typeof arg2 === "string") {
    return { userJid: arg2, defaults: arg3 || {} };
  }
  return { userJid: arg1, defaults: (arg2 as Partial<EconomyUser>) || {} };
}

export function getEconomyUser(
  arg1: string,
  arg2?: string | Partial<EconomyUser>,
  arg3?: Partial<EconomyUser>,
): EconomyUser {
  const { userJid, defaults } = parseJidAndDefaults(arg1, arg2, arg3);
  const dbUser = db.getUser(userJid);
  const userData = (dbUser.data || {}) as Record<string, unknown>;
  const economyData = (userData.economy || {}) as Record<string, unknown>;

  const merged: EconomyUser = {
    ...DEFAULT_ECONOMY_USER,
    ...defaults,
    ...userData,
    ...economyData,
  };

  const savedCoins =
    economyData.bolsillo ??
    economyData.coins ??
    userData.bolsillo ??
    userData.coins ??
    (dbUser as Record<string, unknown>).coins ??
    (dbUser as Record<string, unknown>).bolsillo;

  const savedBank =
    economyData.banco ??
    economyData.bank ??
    userData.banco ??
    userData.bank ??
    (dbUser as Record<string, unknown>).bank ??
    (dbUser as Record<string, unknown>).banco;

  const rawCoins = Number(
    savedCoins !== undefined && savedCoins !== null
      ? savedCoins
      : defaults.bolsillo !== undefined && defaults.bolsillo !== 0
        ? defaults.bolsillo
        : defaults.coins !== undefined && defaults.coins !== 0
          ? defaults.coins
          : DEFAULT_ECONOMY_USER.bolsillo ?? 100000,
  );

  const rawBank = Number(
    savedBank !== undefined && savedBank !== null
      ? savedBank
      : defaults.banco !== undefined && defaults.banco !== 0
        ? defaults.banco
        : defaults.bank !== undefined && defaults.bank !== 0
          ? defaults.bank
          : DEFAULT_ECONOMY_USER.banco ?? 10000,
  );

  merged.bolsillo = rawCoins;
  merged.coins = rawCoins;
  merged.banco = rawBank;
  merged.bank = rawBank;

  return merged;
}

export function setEconomyUser(
  arg1: string,
  arg2?: string | Partial<EconomyUser>,
  arg3?: Partial<EconomyUser>,
): EconomyUser {
  let userJid: string;
  let data: Partial<EconomyUser>;

  if (typeof arg2 === "string") {
    userJid = arg2;
    data = (arg3 as Partial<EconomyUser>) || {};
  } else {
    userJid = arg1;
    data = (arg2 as Partial<EconomyUser>) || {};
  }

  const current = getEconomyUser(userJid);
  const updated = { ...current, ...data };

  const finalCoins = Number(
    data.bolsillo ?? data.coins ?? updated.bolsillo ?? updated.coins ?? 100000,
  );
  const finalBank = Number(
    data.banco ?? data.bank ?? updated.banco ?? updated.bank ?? 10000,
  );

  updated.bolsillo = finalCoins;
  updated.coins = finalCoins;
  updated.banco = finalBank;
  updated.bank = finalBank;

  const dbUser = db.getUser(userJid);
  const userData = (dbUser.data || {}) as Record<string, unknown>;
  const currentEconomy = (userData.economy || {}) as Record<string, unknown>;

  const nextEconomy = {
    ...currentEconomy,
    ...updated,
    bolsillo: finalCoins,
    coins: finalCoins,
    banco: finalBank,
    bank: finalBank,
  };

  const nextData = {
    ...userData,
    economy: nextEconomy,
    bolsillo: finalCoins,
    coins: finalCoins,
    banco: finalBank,
    bank: finalBank,
  };

  db.setUser(userJid, {
    ...nextData,
    coins: finalCoins,
    bank: finalBank,
  });

  return updated;
}

export function checkCooldown(
  groupJid: string,
  userJid: string,
  key: keyof CooldownRows,
) {
  const user = getEconomyUser(groupJid, userJid);
  const lastKey = `last${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  const last = Number(user[lastKey] ?? 0);
  const cooldown = COOLDOWNS[key];
  const diff = Date.now() - last;

  if (!cooldown) {
    return { ready: true };
  }

  if (diff < cooldown) {
    return { ready: false, remaining: cooldown - diff };
  }

  return { ready: true };
}

export function setCooldown(
  groupJid: string,
  userJid: string,
  key: keyof CooldownRows,
) {
  const lastKey = `last${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  setEconomyUser(groupJid, userJid, { [lastKey]: Date.now() });
}

export function addBolsillo(groupJid: string, userJid: string, amount: number) {
  const user = getEconomyUser(groupJid, userJid);
  const current = Number(user.bolsillo ?? user.coins ?? 0);
  const next = current + amount;
  setEconomyUser(groupJid, userJid, { bolsillo: next, coins: next });
}

export function getAuraLevel(points: number): number {
  const aura = Math.max(0, Number(points) || 0);
  if (aura < 100) return 1;
  if (aura < 200) return 2;
  if (aura < 400) return 3;
  return 4;
}

export function getBolsillo(groupJid: string, userJid?: string): number {
  const user = getEconomyUser(groupJid, userJid);
  return Number(user.bolsillo ?? user.coins ?? 0);
}

export function addAura(jid: string, amount: number) {
  const user = db.getUser(jid);
  const aura = Math.max(
    0,
    Number(
      (user.data as Record<string, unknown> | undefined)?.aura ??
        (user as Record<string, unknown>).aura ??
        0,
    ) + amount,
  );
  db.setUser(jid, { aura, auraXp: aura, level: getAuraLevel(aura) });
  return aura;
}

export function transferBolsillo(
  groupJid: string,
  from: string,
  to: string,
  amount: number,
): boolean {
  const value = Math.floor(Number(amount));
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    from === to ||
    getBolsillo(groupJid, from) < value
  )
    return false;

  addBolsillo(groupJid, from, -value);
  addBolsillo(groupJid, to, value);
  return true;
}

export function getGroupEconomyUsers(
  _groupJid?: string,
): Record<string, EconomyUser> {
  const allUsers = db.getAllUsers();
  const map: Record<string, EconomyUser> = {};
  for (const user of allUsers) {
    if (user.jid) {
      map[user.jid] = getEconomyUser(user.jid);
    }
  }
  return map;
}

export function formatCoins(value: number): string {
  return formatNumberMoney(Math.max(0, Math.floor(Number(value) || 0)));
}

export const DEFAULT_BOT_CURRENCY: BotCurrency = {
  name: "AuraCoins",
  symbol: "₡",
};

export type BotCurrency = {
  name: string;
  symbol: string;
};

export type CurrencySource =
  | CommandContext
  | string
  | BotCurrency
  | null
  | undefined;

function isBotCurrency(value: unknown): value is BotCurrency {
  return Boolean(
    value &&
      typeof value === "object" &&
      "name" in value &&
      "symbol" in value &&
      !("botJid" in value),
  );
}

export function getBotCurrency(source?: CurrencySource): BotCurrency {
  if (isBotCurrency(source)) {
    const name = String(source.name || "").trim() || DEFAULT_BOT_CURRENCY.name;
    const symbol =
      String(source.symbol || "").trim() || DEFAULT_BOT_CURRENCY.symbol;
    return { name, symbol };
  }

  const botJid =
    typeof source === "string"
      ? source
      : source && typeof source === "object"
        ? source.botJid
        : "";
  if (!botJid) return { ...DEFAULT_BOT_CURRENCY };

  const bot = db.getBot(botJid);
  const data = (bot.data || {}) as Record<string, unknown>;
  const name =
    String(bot.currency ?? data.currency ?? DEFAULT_BOT_CURRENCY.name).trim() ||
    DEFAULT_BOT_CURRENCY.name;
  const symbol =
    String(
      bot.currencySymbol ??
        data.currencySymbol ??
        DEFAULT_BOT_CURRENCY.symbol,
    ).trim() || DEFAULT_BOT_CURRENCY.symbol;
  return { name, symbol };
}

export function setBotCurrency(
  botJid: string,
  name: string,
  symbol = DEFAULT_BOT_CURRENCY.symbol,
): BotCurrency {
  const currency: BotCurrency = {
    name: name.trim() || DEFAULT_BOT_CURRENCY.name,
    symbol: symbol.trim() || DEFAULT_BOT_CURRENCY.symbol,
  };
  db.setBot(botJid, {
    currency: currency.name,
    currencySymbol: currency.symbol,
    data: {
      ...(db.getBot(botJid).data || {}),
      currency: currency.name,
      currencySymbol: currency.symbol,
    },
  });
  return currency;
}

export function formatMoney(
  value: number,
  source?: CurrencySource,
): string {
  const currency = getBotCurrency(source);
  return `${currency.symbol}${formatCoins(value)} ${currency.name}`;
}

export function cooldownText(remaining: number): string {
  return formTime(Math.max(0, remaining));
}

export type DownloadMediaType = "audio" | "video" | "image" | "document";

export const DOWNLOAD_COST_RANGES: Record<
  DownloadMediaType,
  { min: number; max: number; refMinBytes: number; refMaxBytes: number }
> = {
  audio: {
    min: 1000,
    max: 2000,
    refMinBytes: 1 * 1024 * 1024,
    refMaxBytes: 150 * 1024 * 1024,
  },
  video: {
    min: 1500,
    max: 3500,
    refMinBytes: 2 * 1024 * 1024,
    refMaxBytes: 250 * 1024 * 1024,
  },
  image: {
    min: 1000,
    max: 1500,
    refMinBytes: 200 * 1024,
    refMaxBytes: 30 * 1024 * 1024,
  },
  document: {
    min: 550,
    max: 5000,
    refMinBytes: 1 * 1024,
    refMaxBytes: 2 * 1024 * 1024 * 1024,
  },
};

export function getDownloadCost(
  type: DownloadMediaType,
  sizeInBytes?: number,
): number {
  const range = DOWNLOAD_COST_RANGES[type] ?? DOWNLOAD_COST_RANGES.document;
  if (!sizeInBytes || sizeInBytes <= 0) return range.min;

  if (sizeInBytes <= range.refMinBytes) return range.min;
  if (sizeInBytes >= range.refMaxBytes) return range.max;

  const ratio =
    (sizeInBytes - range.refMinBytes) / (range.refMaxBytes - range.refMinBytes);
  const cost = Math.round(range.min + ratio * (range.max - range.min));
  return Math.min(range.max, Math.max(range.min, cost));
}

export function checkDownloadCoins(
  userJid: string,
  type: DownloadMediaType,
  sizeInBytes?: number,
): { allowed: boolean; cost: number; minCost: number; currentBalance: number } {
  const user = getEconomyUser(userJid);
  const range = DOWNLOAD_COST_RANGES[type] ?? DOWNLOAD_COST_RANGES.document;
  const cost = getDownloadCost(type, sizeInBytes);
  const currentBalance = Number(user.bolsillo ?? 0);
  return {
    allowed: currentBalance >= cost,
    cost,
    minCost: range.min,
    currentBalance,
  };
}

type DownloadChargeContext = CommandContext & {
  _downloadMediaType?: DownloadMediaType;
  _downloadSize?: number;
  _downloadSuccess?: boolean;
  downloadCharged?: boolean;
};

export async function prepareDownloadCharge(
  ctx: CommandContext,
  type: DownloadMediaType,
  filePath: string,
): Promise<{ cost: number; size: number }> {
  const size = await getFileBytes(filePath);
  const bag = ctx as DownloadChargeContext;
  bag._downloadMediaType = type;
  bag._downloadSize = Number(bag._downloadSize || 0) + size;
  const cost = getDownloadCost(type, bag._downloadSize);
  const currentBalance = getBolsillo(ctx.sender);
  if (currentBalance < cost) {
    bag._downloadSize = Math.max(0, Number(bag._downloadSize) - size);
    bag._downloadSuccess = false;
    const currency = getBotCurrency(ctx);
    const labels: Record<DownloadMediaType, string> = {
      audio: "Audios",
      video: "Videos",
      image: "Imágenes",
      document: "Documentos",
    };
    const requiredAmount = formatMoney(cost, currency);
    throw new Error(
      NOT_HAVE_COINS({
        userBalance: formatMoney(currentBalance, currency),
        typeMedia: labels[type],
        minAmount: requiredAmount,
        currencyName: currency.name,
        requiredAmount,
      }),
    );
  }
  return { cost, size };
}

export function confirmDownloadCharge(ctx: CommandContext): void {
  const bag = ctx as DownloadChargeContext;
  if (bag.downloadCharged) return;
  const size = Number(bag._downloadSize) || 0;
  if (size <= 0) return;
  chargeDownloadCost(
    ctx.sender,
    bag._downloadMediaType || "document",
    size,
  );
  bag._downloadSuccess = true;
  bag.downloadCharged = true;
}

export function chargeDownloadCost(
  userJid: string,
  type: DownloadMediaType,
  sizeInBytes?: number,
): { cost: number; remaining: number } {
  const cost = getDownloadCost(type, sizeInBytes);
  const user = getEconomyUser(userJid);
  const currentBalance = Number(user.bolsillo ?? 0);
  const newBalance = Math.max(0, currentBalance - cost);
  setEconomyUser(userJid, { bolsillo: newBalance, coins: newBalance });
  return { cost, remaining: newBalance };
}