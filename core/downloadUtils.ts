import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { link, copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Agent, interceptors, request } from "undici";
import { formatCount as baseFormatCount } from "../utils/formatter.ts";
import type { SearchItem } from "../types/index.d.ts";
import { t } from "../src/langs/index.ts";

const BASE_AGENT_OPTIONS = {
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 50,
  pipelining: 1,
};

const REQUEST_AGENT = new Agent(BASE_AGENT_OPTIONS).compose(
  interceptors.redirect({ maxRedirections: 2 }),
);
const TEXT_REQUEST_AGENT = new Agent(BASE_AGENT_OPTIONS).compose(
  interceptors.redirect({ maxRedirections: 5 }),
);
const DOWNLOAD_AGENT = new Agent({
  ...BASE_AGENT_OPTIONS,
  connections: 64,
}).compose(interceptors.redirect({ maxRedirections: 5 }));

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache, no-store",
  Pragma: "no-cache",
  DNT: "1",
  Connection: "keep-alive",
};

const CACHE_DIR = path.resolve(
  process.env.GLOBAL_CUSTOM_TMP || process.env.TMPDIR || "./cache",
);
let cacheDirReady: Promise<string | undefined> | null = null;

function ensureCacheDir() {
  if (!cacheDirReady) {
    cacheDirReady = mkdir(CACHE_DIR, { recursive: true }).catch((err) => {
      cacheDirReady = null;
      throw err;
    });
  }
  return cacheDirReady;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

function resolveRequestHeaders(
  url: string,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {}

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
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  let requestUrl = url;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const requestSignal = signal
        ? AbortSignal.any([AbortSignal.timeout(timeout), signal])
        : AbortSignal.timeout(timeout);

      const response = await request(requestUrl, {
        dispatcher: REQUEST_AGENT,
        headers: { ...HEADERS, ...headers },
        signal: requestSignal,
      });

      if (response.statusCode === 304) {
        await response.body.dump().catch(() => undefined);
        requestUrl = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}-${attempt}`;
        throw new Error("HTTP 304");
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.body.dump().catch(() => undefined);
        throw new Error(`HTTP ${response.statusCode}`);
      }

      return (await response.body.json()) as T;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt < 2) {
        await sleep(400 * 2 ** attempt);
      }
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
    await response.body.dump().catch(() => undefined);
    throw new Error(`HTTP ${response.statusCode}`);
  }

  return response.body.text();
}

const MAX_CONCURRENT_DOWNLOADS = 8;
const MAX_QUEUED_DOWNLOADS_BEFORE_NOTICE = 50;
let activeDownloads = 0;
const queuedDownloads: Array<() => void> = [];

export function getDownloadQueueStatus() {
  const waiting = queuedDownloads.length;
  const message =
    activeDownloads >= MAX_CONCURRENT_DOWNLOADS
      ? `El bot está procesando ${MAX_CONCURRENT_DOWNLOADS} descargas simultáneas. Inténtalo en unos segundos.`
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
          "El bot está saturado con demasiadas descargas en cola. Inténtalo en unos segundos.",
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

async function streamBodyToFile(
  body: Readable,
  destPath: string,
  maxBytes: number,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let totalBytes = 0;
    let settled = false;

    const writer = createWriteStream(destPath, { highWaterMark: 256 * 1024 });

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      body.destroy();
      writer.destroy();
      reject(err);
    };

    body.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        fail(
          new Error(
            `El archivo excede el máximo permitido (${formatBytes(maxBytes)}).`,
          ),
        );
        return;
      }
      if (!writer.write(chunk)) {
        body.pause();
      }
    });

    writer.on("drain", () => {
      if (!settled) body.resume();
    });

    body.on("end", () => {
      if (!settled) writer.end();
    });

    body.on("error", (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });

    writer.on("error", (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });

    writer.on("finish", () => {
      if (settled) return;
      settled = true;
      if (totalBytes <= 0) {
        reject(new Error("La descarga no devolvió contenido."));
        return;
      }
      resolve(totalBytes);
    });
  });
}

export async function downloadToCache(
  url: string,
  timeout = 180000,
  headers: Record<string, string> = {},
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<string> {
  return queueDownload(async () => {
    await ensureCacheDir();
    const cacheKey = createHash("sha256").update(url).digest("hex").slice(0, 24);
    const uniqueSuffix = randomBytes(4).toString("hex");
    const baseFilePath = path.join(CACHE_DIR, `download-${cacheKey}.bin`);
    const isolatedPath = path.join(
      CACHE_DIR,
      `download-${cacheKey}-${uniqueSuffix}.bin`,
    );

    try {
      const cached = await stat(baseFilePath);
      if (cached.size > 0 && cached.size <= maxBytes) {
        try {
          await link(baseFilePath, isolatedPath);
          return isolatedPath;
        } catch {
          await copyFile(baseFilePath, isolatedPath);
          return isolatedPath;
        }
      }
    } catch {}

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const partialPath = path.join(
        CACHE_DIR,
        `.download-${cacheKey}-${process.pid}-${uniqueSuffix}-${attempt}.part`,
      );

      try {
        const requestHeaders = resolveRequestHeaders(url, headers);
        const response = await request(url, {
          dispatcher: DOWNLOAD_AGENT,
          headers: requestHeaders,
          signal: AbortSignal.timeout(timeout),
        });

        if (response.statusCode < 200 || response.statusCode >= 300) {
          await response.body.dump().catch(() => undefined);
          throw new Error(`Descarga HTTP ${response.statusCode}`);
        }

        const contentLengthHeader = response.headers["content-length"];
        const rawLength = Array.isArray(contentLengthHeader)
          ? contentLengthHeader[0]
          : contentLengthHeader;

        if (rawLength) {
          const length = Number(rawLength);
          if (Number.isFinite(length) && length > maxBytes) {
            await response.body.dump().catch(() => undefined);
            throw new Error(
              `El archivo excede el máximo permitido (${formatBytes(maxBytes)}).`,
            );
          }
        }

        await streamBodyToFile(
          response.body as unknown as Readable,
          partialPath,
          maxBytes,
        );

        await rename(partialPath, isolatedPath);
        return isolatedPath;
      } catch (error) {
        lastError = error;
        await rm(partialPath, { force: true }).catch(() => undefined);
        if (attempt < 2) {
          await sleep(500 * 2 ** attempt);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Descarga fallida.");
  });
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return t("core_sin_limite_141ae2eb");
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
  if (!Array.isArray(results) || results.length === 0) return null;

  const terms = String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  let bestResult: T | null = null;
  let bestScore = -1;

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (!item || typeof item !== "object" || !("url" in item)) continue;

    const candidate = item as T;
    if (terms.length === 0) return candidate;

    const searchable = [
      candidate.title,
      candidate.desc,
      candidate.description,
      candidate.author?.nickname,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    let score = 0;
    for (let j = 0; j < terms.length; j++) {
      if (searchable.includes(terms[j])) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestResult = candidate;
    }
  }

  return bestResult;
}

export function formatCount(value: unknown): string {
  return baseFormatCount(value);
}
