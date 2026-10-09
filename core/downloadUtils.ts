import { createHash, randomBytes } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Agent, interceptors, request } from "undici";
import { formatCount as baseFormatCount } from "../utils/formatter.ts";
import type { SearchItem } from "../types/index.d.ts";

const REQUEST_AGENT = new Agent().compose(
  interceptors.redirect({ maxRedirections: 1 }),
);
const TEXT_REQUEST_AGENT = new Agent().compose(
  interceptors.redirect({ maxRedirections: 5 }),
);

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache, no-store",
  Pragma: "no-cache",
  DNT: "1",
  Connection: "keep-alive",
};

function resolveRequestHeaders(
  url: string,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
  const hostname = new URL(url).hostname.toLowerCase();
  const isFacebookHost =
    hostname.includes("facebook") || hostname.includes("fbcdn");

  if (!isFacebookHost) {
    return { ...HEADERS, ...extraHeaders };
  }

  return {
    ...HEADERS,
    ...extraHeaders,
    Accept: "video/*,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    Origin: "https://www.facebook.com",
    Referer: "https://www.facebook.com/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Sec-Fetch-Dest": "video",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
  };
}

export async function requestJson<T = Record<string, unknown>>(
  url: string,
  timeout = 30000,
  headers: Record<string, string> = {},
): Promise<T> {
  let lastError: unknown;
  let requestUrl = url;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request(requestUrl, {
        dispatcher: REQUEST_AGENT,
        headers: { ...HEADERS, ...headers },
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

export async function requestText(
  url: string,
  timeout = 30000,
  headers: Record<string, string> = {},
): Promise<string> {
  const response = await request(url, {
    dispatcher: TEXT_REQUEST_AGENT,
    headers: { ...HEADERS, ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP ${response.statusCode}`);
  }
  return response.body.text();
}

const CACHE_DIR = path.resolve(process.env.GLOBAL_CUSTOM_TMP || "./cache");
const MAX_CONCURRENT_DOWNLOADS = 2;
const MAX_QUEUED_DOWNLOADS_BEFORE_NOTICE = 3;
let activeDownloads = 0;
const queuedDownloads: Array<() => void> = [];

export function getDownloadQueueStatus() {
  const waiting = queuedDownloads.length;
  const message =
    activeDownloads >= MAX_CONCURRENT_DOWNLOADS
      ? "El bot está ocupando 2 descargas simultáneas. Inténtalo en unos segundos."
      : waiting > 0
        ? `Hay ${waiting} descarga(s) esperando en cola. El bot va a procesarlas en orden.`
        : null;

  return {
    active: activeDownloads,
    waiting,
    maxConcurrent: MAX_CONCURRENT_DOWNLOADS,
    message,
  };
}

function queueDownload<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeDownloads += 1;
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeDownloads -= 1;
          const next = queuedDownloads.shift();
          if (next) next();
        });
    };

    if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
      run();
      return;
    }

    if (queuedDownloads.length >= MAX_QUEUED_DOWNLOADS_BEFORE_NOTICE) {
      reject(
        new Error(
          "El bot está saturado: ya hay 2 descargas activas y varias en cola. Inténtalo en unos segundos.",
        ),
      );
      return;
    }

    queuedDownloads.push(run);
  });
}

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
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<string> {
  return queueDownload(async () => {
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
        const requestHeaders = resolveRequestHeaders(url, headers);
        const response = await fetch(url, {
          headers: requestHeaders,
          signal: AbortSignal.timeout(timeout),
          redirect: "follow",
        });
        if (!response.ok) throw new Error(`Descarga HTTP ${response.status}`);

        const contentLength = response.headers.get("content-length");
        if (contentLength) {
          const length = Number(contentLength);
          if (Number.isFinite(length) && length > maxBytes) {
            throw new Error(
              `El archivo excede el máximo permitido (${formatBytes(maxBytes)}).`,
            );
          }
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length) throw new Error("La descarga no devolvió contenido.");
        if (buffer.length > maxBytes) {
          throw new Error(
            `El archivo excede el máximo permitido (${formatBytes(maxBytes)}).`,
          );
        }

        await writeFile(partialPath, buffer);
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
  });
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "sin límite";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
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
