import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { Agent, interceptors, request } from "undici";
import { formatCount as baseFormatCount } from "../utils/formatter.ts";
import type { SearchItem } from "../types/index.d.ts";

const REQUEST_AGENT = new Agent().compose(
  interceptors.redirect({ maxRedirections: 1 }),
);

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Cache-Control": "no-cache, no-store",
  Pragma: "no-cache",
};

export async function requestJson<T = Record<string, unknown>>(
  url: string,
  timeout = 30000,
): Promise<T> {
  let lastError: unknown;
  let requestUrl = url;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request(requestUrl, {
        dispatcher: REQUEST_AGENT,
        headers: HEADERS,
        signal: AbortSignal.timeout(timeout),
      });
      if (response.statusCode === 304) {
        await response.body.dump();
        requestUrl = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}-${attempt}`;
        throw new Error("HTTP 304");
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`HTTP ${response.statusCode}`);
      }
      return (await response.body.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Solicitud fallida.");
}

const CACHE_DIR = path.resolve(process.env.GLOBAL_CUSTOM_TMP || "./cache");

export async function getFileBytes(filePath: string): Promise<number> {
  const info = await stat(filePath);
  if (!Number.isFinite(info.size) || info.size <= 0) {
    throw new Error("El archivo descargado está vacío.");
  }
  return info.size;
}

export async function downloadToCache(
  url: string,
  timeout = 180000,
  headers: Record<string, string> = {},
): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cacheKey = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const filePath = path.join(CACHE_DIR, `download-${cacheKey}.bin`);

  try {
    const cached = await stat(filePath);
    if (cached.size > 0) return filePath;
  } catch {
    // El archivo aún no existe o quedó incompleto.
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const partialPath = path.join(
      CACHE_DIR,
      `.download-${cacheKey}-${process.pid}-${randomBytes(4).toString("hex")}.part`,
    );
    try {
      const response = await fetch(url, {
        headers: { ...HEADERS, ...headers },
        signal: AbortSignal.timeout(timeout),
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`Descarga HTTP ${response.status}`);
      if (!response.body) throw new Error("La descarga no devolvió contenido.");
      await pipeline(
        Readable.fromWeb(
          response.body as import("node:stream/web").ReadableStream,
        ),
        createWriteStream(partialPath),
      );
      await rename(partialPath, filePath);
      return filePath;
    } catch (error) {
      lastError = error;
      await rm(partialPath, { force: true }).catch(() => {});
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Descarga fallida.");
}

export function safeFileName(value: unknown, fallback: string): string {
  return (
    String(value || fallback)
      .replace(/[<>:"/\\|?*\r\n]/g, "")
      .trim()
      .slice(0, 100) || fallback
  );
}

export function pickSearchResult<T extends SearchItem = SearchItem>(
  results: unknown,
  query: string,
): T | null {
  if (!Array.isArray(results)) return null;

  const terms = String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  return (
    results
      .filter((result: unknown): result is T =>
        Boolean(result && typeof result === "object" && "url" in result),
      )
      .map((result: T, index: number) => {
        const searchable = [
          result.title,
          result.desc,
          result.description,
          result.author?.nickname,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const score = terms.reduce(
          (total, term) => total + (searchable.includes(term) ? 1 : 0),
          0,
        );
        return { result, index, score };
      })
      .sort(
        (left, right) => right.score - left.score || left.index - right.index,
      )[0]?.result || null
  );
}

export function formatCount(value: unknown): string {
  return baseFormatCount(value);
}
