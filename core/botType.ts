import { isPremiumTokenValidForAccount } from "./premiumTokens.ts";

export type BotType = "Principal" | "Prem-Bot" | "Sub-Bot";

export function resolveBotType(botType: unknown, isSubBot = false): BotType {
  const normalized = String(botType ?? "").trim().toLowerCase();

  if (normalized.includes("prem")) return "Prem-Bot";
  if (isSubBot || normalized.includes("sub")) return "Sub-Bot";
  return "Principal";
}

export function resolveAccountBotType({
  botType,
  isMain,
  isSubBot,
  premiumToken,
  jid,
}: {
  botType?: unknown;
  isMain?: unknown;
  isSubBot?: boolean;
  premiumToken?: unknown;
  jid?: string | null;
}): BotType {
  if (Number(isMain) === 1 || isSubBot === false) return "Principal";
  if (
    jid &&
    isPremiumTokenValidForAccount(String(premiumToken ?? ""), jid)
  ) {
    return "Prem-Bot";
  }
  if (isSubBot || resolveBotType(botType) !== "Principal") {
    return "Sub-Bot";
  }
  return "Principal";
}
