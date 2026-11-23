import { fytBold } from "./socketText.ts";
import { t } from "../src/langs/index.ts";

export type OwnerFilePanelKind = "info" | "success" | "error";

function safeLine(value: string): string {
  return String(value).replace(/[\r\n\0-\x1f]/g, " ").slice(0, 600);
}

/**
 * Formato utilizado por los comandos SYSTEM de Aura Reed:
 * encabezado estilizado, bloque de información y pie del sistema.
 */
export function ownerFilePanel(
  command: "SAVEFILE" | "GETCODE",
  heading: string,
  lines: string[],
  kind: OwnerFilePanelKind = "info",
): string {
  const symbol = kind === "success" ? "✅" : kind === "error" ? "❌" : "📁";
  return [
    `╭〔 ${symbol} *${fytBold(t("cmd_aura_reed_95dcfb15"))}* 〕━⬣`,
    `┃ 🗂️ ${fytBold(command)} // ${fytBold(heading)}`,
    "╰━━━━━━━━━━━━⬣",
    "",
    `╭─〔 ${symbol} *${fytBold(heading)}* 〕`,
    ...lines.map((line) => line ? `┃ ${safeLine(line)}` : "┃"),
    "╰─────────────────────",
    `╰〔 ⚡ ${fytBold(t("cmd_system_info_1a78a0cb"))} 〕⬣`,
  ].join("\n");
}

export function ownerFileBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
