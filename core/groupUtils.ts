import type { CommandContext } from "../types/index.d.ts";
import type { DatabaseGroup } from "../types/index.d.ts";
import { t } from "../src/langs/index.ts";


export function cleanJid(value: unknown): string {
  return String(value || "")
    .trim()
    .split(":")[0];
}

export function getTargetJids(ctx: CommandContext): string[] {
  const context = Object.values(ctx.msg?.message ?? {})
    .map((value) => (value as Record<string, unknown>)?.contextInfo)
    .find(Boolean) as Record<string, unknown> | undefined;
  const mentioned = Array.isArray(context?.mentionedJid)
    ? (context.mentionedJid as string[])
    : [];
  const quoted = context?.participant ? [String(context.participant)] : [];
  return [...new Set([...mentioned, ...quoted].filter(Boolean))];
}

export function groupStatus(value: unknown): string {
  return value ? t("core_activado_2e624c72") : t("core_desactivado_7cc5cccc");
}

export function parseToggle(value: unknown): boolean | null {
  const normalized = String(value || "").toLowerCase();
  if (["on", "1", "true", "activar", "enable"].includes(normalized))
    return true;
  if (["off", "0", "false", "desactivar", "disable"].includes(normalized))
    return false;
  return null;
}

export function getGroupData(ctx: CommandContext): DatabaseGroup {
  return ctx.db.getGroup(ctx.from);
}

export function saveGroupData(
  ctx: CommandContext,
  data: Record<string, unknown>,
): DatabaseGroup {
  ctx.db.setGroup(ctx.from, data);
  return ctx.db.getGroup(ctx.from);
}

export function groupFrame(title: string, icon = "⚙️"): string {
  return t("core_value0_value1_5d5b6d7e", { value0: icon, value1: title });
}

export function groupFooter(label = "SYSTEM INFO"): string {
  return t("core_value0_d225103c", { value0: label });
}
