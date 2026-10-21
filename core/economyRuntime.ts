import { jidNormalizedUser, type proto } from "baileys";
import {
  addAura,
  formatMoney,
  getBotCurrency,
  getEconomyUser,
  setBotCurrency,
  setEconomyUser,
} from "./economyConfig.ts";
import type { CommandContext, EconomyUser } from "../types/index.d.ts";

export async function economyTarget(ctx: CommandContext): Promise<string> {
  const message = ctx.msg?.message ?? {};
  const infos = Object.values(message)
    .map(
      (value: unknown) =>
        (value as { contextInfo?: proto.IContextInfo })?.contextInfo,
    )
    .filter(Boolean) as proto.IContextInfo[];
  const target =
    infos.flatMap((info) => info.mentionedJid ?? [])[0] ??
    (infos.find((info) => info.quotedMessage) as proto.IContextInfo | undefined)
      ?.participant ??
    ctx.sender;
  const normalized = jidNormalizedUser(target);
  if (normalized.endsWith("@lid") && typeof ctx.resolveLid === "function") {
    return jidNormalizedUser((await ctx.resolveLid(normalized)) || normalized);
  }
  return normalized;
}

export function economyUser(
  ctx: CommandContext,
  jid = ctx.sender,
): EconomyUser {
  return getEconomyUser(ctx.from, jid);
}

export function saveEconomy(
  ctx: CommandContext,
  jid: string,
  user: EconomyUser,
) {
  return setEconomyUser(ctx.from, jid, user);
}

export function addEconomyXp(jid: string, amount: number) {
  return addAura(jid, amount);
}

export function amountArg(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const amount = Number.parseInt(String(value), 10);
  return Number.isFinite(amount) ? amount : 0;
}

export {
  formatMoney,
  getBotCurrency,
  setBotCurrency,
  getEconomyUser,
  setEconomyUser,
};
