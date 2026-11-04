import { DL_CONFIG } from "../../config.ts";
import { requestJson } from "../../core/downloadUtils.ts";

const API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");

export function getPrompt(args: unknown): string {
  return Array.isArray(args)
    ? args.join(" ").trim()
    : String(args || "").trim();
}

export function extractText(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const fields = ["result", "text", "response", "message", "reply", "answer"];
  for (const field of fields) {
    if (typeof record[field] === "string" && (record[field] as string).trim()) {
      return (record[field] as string).trim();
    }
  }

  if (record.data && typeof record.data === "object") {
    return extractText(record.data);
  }
  if (typeof record.data === "string" && record.data.trim()) {
    return record.data.trim();
  }
  return null;
}

export async function askAlya(path: string, prompt: string): Promise<string> {
  const url = `${API}${path}?text=${encodeURIComponent(prompt)}&key=${DL_CONFIG.alya.API_KEY}`;
  const response = await requestJson(url, 20000);
  const text = extractText(response);
  if (!text) throw new Error("La API no devolvió una respuesta válida.");
  return text;
}

export function aiError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
