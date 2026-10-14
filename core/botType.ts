export type BotType = "Principal" | "Prem-Bot" | "Sub-Bot";

export function resolveBotType(botType: unknown, isSubBot = false): BotType {
  const normalized = String(botType ?? "").trim().toLowerCase();

  if (isSubBot || normalized.includes("sub")) return "Sub-Bot";
  if (normalized.includes("prem")) return "Prem-Bot";
  return "Principal";
}
