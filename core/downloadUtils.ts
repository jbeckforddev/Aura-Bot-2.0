import { createHash, randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { BlockList, isIP } from "node:net";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { Agent, request } from "undici";
import { formatCount as baseFormatCount } from "../utils/formatter.ts";
import type { SearchItem } from "../types/index.d.ts";

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

const blockedNetworks = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedNetworks.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
  ["3fff::", 20],
] as const) {
  blockedNetworks.addSubnet(network, prefix, "ipv6");
}

function getAllowLocalhost(): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.DOWNLOAD_ALLOW_LOCALHOST === "true"
  );
}

function normalizeIpLiteral(value: string): string {
  const trimmed = value.trim().replace(/^\[|\]$/g, "");
  if (!trimmed) return trimmed;
  if (trimmed.includes("%")) {
    return trimmed.split("%", 1)[0];
  }
  if (trimmed.includes(":") && isIP(trimmed) === 6 && trimmed.startsWith("::ffff:")) {
    const tail = trimmed.slice(7);
    if (tail.includes(".")) {
      const ipv4 = tail;
      if (isIP(ipv4) === 4) return ipv4;
    }

    const segments = tail.split(":").filter(Boolean);
    if (segments.length >= 2) {
      const hi = segments[segments.length - 2] ?? "0";
      const lo = segments[segments.length - 1] ?? "0";
      const hiValue = Number.parseInt(hi, 16);
      const loValue = Number.parseInt(lo, 16);
      if (Number.isFinite(hiValue) && Number.isFinite(loValue)) {
        const octet1 = (hiValue >> 8) & 0xff;
        const octet2 = hiValue & 0xff;
        const octet3 = (loValue >> 8) & 0xff;
        const octet4 = loValue & 0xff;
        const ipv4 = `${octet1}.${octet2}.${octet3}.${octet4}`;
        if (isIP(ipv4) === 4) return ipv4;
      }
    }
  }
  return trimmed;
}

function isBlockedIpv4(address: string): boolean {
  const ipv4 = normalizeIpLiteral(address);
  return isIP(ipv4) === 4 && blockedNetworks.check(ipv4, "ipv4");
}

function isBlockedIpv6(address: string): boolean {
  const ipv6 = normalizeIpLiteral(address);
  return isIP(ipv6) === 6 && blockedNetworks.check(ipv6, "ipv6");
}

function isBlockedAddress(address: string): boolean {
  const normalized = normalizeIpLiteral(address);
  if (isIP(normalized) === 4) return isBlockedIpv4(normalized);
  if (isIP(normalized) === 6) return isBlockedIpv6(normalized);
  return false;
}

function isBlockedHostname(hostname: string, allowLocalhost = getAllowLocalhost()): boolean {
  const host = normalizeIpLiteral(hostname).toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return !allowLocalhost;
  if (host === "local" || host.endsWith(".local")) return !allowLocalhost;
  if (isIP(host) === 4 || isIP(host) === 6) {
    if (allowLocalhost) return false;
    return isBlockedAddress(host);
  }
  return false;
}

async function resolveHostnameAddresses(
  hostname: string,
  allowLocalhost = getAllowLocalhost(),
): Promise<string[]> {
  const normalizedHostname = normalizeIpLiteral(hostname);

  if (isIP(normalizedHostname) === 4 || isIP(normalizedHostname) === 6) {
    if (!allowLocalhost && isBlockedAddress(normalizedHostname)) {
      throw new Error(
        `La dirección del destino es privada o reservada: ${normalizedHostname}`,
      );
    }
    return [normalizedHostname];
  }

  const resolved = await dnsLookup(normalizedHostname, {
    all: true,
    verbatim: false,
  });
  const addresses = resolved.map((item) => normalizeIpLiteral(item.address));

  if (addresses.length === 0) {
    throw new Error("La resolución DNS del destino no devolvió direcciones válidas.");
  }

  if (!allowLocalhost) {
    const blocked = addresses.filter((address) => isBlockedAddress(address));
    if (blocked.length > 0) {
      throw new Error(
        `La resolución DNS del destino apunta a una dirección privada o reservada: ${blocked.join(", ")}`,
      );
    }
  }

  return addresses;
}

type ValidatedDestination = {
  url: URL;
  address: string;
  family: 4 | 6;
};

async function resolveValidatedDestination(
  rawUrl: string,
): Promise<ValidatedDestination> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("La URL de descarga no es válida.");
  }

  if (!/^(https?:)$/i.test(url.protocol)) {
    throw new Error("Solo se permiten URLs HTTP/HTTPS para descarga.");
  }
  if (url.username || url.password) {
    throw new Error("No se permiten credenciales incrustadas en la URL.");
  }

  const allowLocalhost = getAllowLocalhost();
  if (isBlockedHostname(url.hostname, allowLocalhost)) {
    throw new Error("La URL de descarga apunta a un destino local o privado no permitido.");
  }

  const addresses = await resolveHostnameAddresses(url.hostname, allowLocalhost);
  if (addresses.length === 0) {
    throw new Error("No se pudo resolver la dirección IP del destino.");
  }

  const address = addresses[0];
  return {
    url,
    address,
    family: isIP(address) === 4 ? 4 : 6,
  };
}

function createPinnedAgent(destination: ValidatedDestination): Agent {
  const { address, family } = destination;
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options.all) {
          (callback as unknown as (...args: unknown[]) => void)(null, [
            { address, family },
          ]);
          return;
        }
        callback(null, address, family);
      },
    },
  });
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getCacheDir(): string {
  return path.resolve(
    process.env.DOWNLOAD_CACHE_DIR || "./cache/downloads",
  );
}

function getDownloadConcurrency(): number {
  return parsePositiveInteger(
    process.env.DOWNLOAD_CONCURRENCY,
    2,
    1,
    5,
  );
}

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

function validateDownloadUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("La URL de descarga no es válida.");
  }

  if (!/^(https?:)$/i.test(url.protocol)) {
    throw new Error("Solo se permiten URLs HTTP/HTTPS para descarga.");
  }
  if (url.username || url.password) {
    throw new Error("No se permiten credenciales incrustadas en la URL.");
  }

  const allowLocalhost = getAllowLocalhost();
  if (!allowLocalhost && isBlockedHostname(url.hostname, allowLocalhost)) {
    throw new Error("La URL de descarga apunta a un destino local o privado no permitido.");
  }

  return url.toString();
}

function buildDownloadRequestKey(
  url: string,
  headers: Record<string, string> = {},
  maxBytes = Number.POSITIVE_INFINITY,
): string {
  const normalizedHeaders = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value || "")].join("="))
    .sort()
    .join("|");
  return createHash("sha256")
    .update(`${validateDownloadUrl(url)}|${normalizedHeaders}|${String(maxBytes)}`)
    .digest("hex");
}

const SAFE_CROSS_ORIGIN_HEADERS = new Set([
  "accept",
  "accept-language",
  "cache-control",
  "dnt",
  "pragma",
  "user-agent",
]);

type ValidatedRequest = {
  response: Awaited<ReturnType<typeof request>>;
  dispatcher: Agent;
};

function stripSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) =>
      SAFE_CROSS_ORIGIN_HEADERS.has(name.toLowerCase()),
    ),
  );
}

async function requestWithValidatedRedirects(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  maxRedirects = 3,
  method: "GET" | "HEAD" = "GET",
): Promise<ValidatedRequest> {
  let currentUrl = validateDownloadUrl(url);
  let currentHeaders = { ...headers };
  let redirectCount = 0;

  while (true) {
    if (signal.aborted) {
      throw new Error("La descarga fue cancelada.");
    }

    const destination = await resolveValidatedDestination(currentUrl);
    const dispatcher = createPinnedAgent(destination);
    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(destination.url.toString(), {
        method,
        dispatcher,
        headers: currentHeaders,
        signal,
      });
    } catch (error) {
      await dispatcher.destroy().catch(() => undefined);
      throw error;
    }

    if (
      response.statusCode < 300 ||
      response.statusCode >= 400 ||
      response.statusCode === 304
    ) {
      return { response, dispatcher };
    }

    const location = response.headers.location;
    await response.body.dump().catch(() => undefined);
    await dispatcher.close().catch(() => undefined);
    if (typeof location !== "string" || !location) {
      throw new Error(`Redirección HTTP ${response.statusCode} sin ubicación.`);
    }
    if (redirectCount >= maxRedirects) {
      throw new Error("Se excedió el número máximo de redirecciones permitidas.");
    }

    const nextUrl = new URL(location, currentUrl);
    validateDownloadUrl(nextUrl.toString());
    if (nextUrl.origin !== new URL(currentUrl).origin) {
      currentHeaders = stripSensitiveHeaders(currentHeaders);
    }
    currentUrl = nextUrl.toString();
    redirectCount += 1;
  }
}

export async function requestJson<T = Record<string, unknown>>(
  url: string,
  timeout = 30000,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const safeUrl = validateDownloadUrl(url);
  let lastError: unknown;
  let requestUrl = safeUrl;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (signal?.aborted) throw new Error("La descarga fue cancelada.");
      const requestSignal = signal
        ? AbortSignal.any([AbortSignal.timeout(timeout), signal])
        : AbortSignal.timeout(timeout);
      const result = await requestWithValidatedRedirects(
        requestUrl,
        { ...HEADERS, ...headers },
        requestSignal,
        1,
      );
      try {
        if (result.response.statusCode === 304) {
          await result.response.body.dump();
          requestUrl = `${safeUrl}${safeUrl.includes("?") ? "&" : "?"}_=${Date.now()}-${attempt}`;
          throw createHttpError(304);
        }
        if (result.response.statusCode < 200 || result.response.statusCode >= 300) {
          await result.response.body.dump();
          throw createHttpError(result.response.statusCode);
        }

        return (await result.response.body.json()) as T;
      } finally {
        await result.dispatcher.close().catch(() => undefined);
      }
    } catch (error) {
      if (error instanceof Error && /aborted|cancelled|timeout/i.test(error.message)) {
        throw error;
      }
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Solicitud fallida.");
}

export async function requestText(
  url: string,
  timeout = 30000,
  headers: Record<string, string> = {},
): Promise<string> {
  const result = await requestWithValidatedRedirects(
    url,
    { ...HEADERS, ...headers },
    AbortSignal.timeout(timeout),
    5,
  );
  try {
    if (result.response.statusCode < 200 || result.response.statusCode >= 300) {
      await result.response.body.dump();
      throw createHttpError(result.response.statusCode);
    }
    return await result.response.body.text();
  } finally {
    await result.dispatcher.close().catch(() => undefined);
  }
}

export async function requestHead(
  url: string,
  timeout = 30000,
  headers: Record<string, string> = {},
): Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
}> {
  const result = await requestWithValidatedRedirects(
    url,
    { ...HEADERS, ...headers },
    AbortSignal.timeout(timeout),
    5,
    "HEAD",
  );
  try {
    return {
      statusCode: result.response.statusCode,
      headers: result.response.headers,
    };
  } finally {
    await result.response.body.dump().catch(() => undefined);
    await result.dispatcher.close().catch(() => undefined);
  }
}

function createHttpError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

const MAX_QUEUED_DOWNLOADS_BEFORE_NOTICE = 3;
let activeDownloads = 0;
const queuedDownloads: Array<() => void> = [];
type InFlightDownload = {
  promise: Promise<string>;
  controller: AbortController;
  waiters: number;
  done: boolean;
};
const inFlightDownloads = new Map<string, InFlightDownload>();

export function getDownloadQueueStatus() {
  const waiting = queuedDownloads.length;
  const maxConcurrent = getDownloadConcurrency();
  const message =
    activeDownloads >= maxConcurrent
      ? `El bot está ocupando ${maxConcurrent} descargas simultáneas. Inténtalo en unos segundos.`
      : waiting > 0
        ? `Hay ${waiting} descarga(s) esperando en cola. El bot va a procesarlas en orden.`
        : null;

  return {
    active: activeDownloads,
    waiting,
    maxConcurrent,
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

    const maxConcurrent = getDownloadConcurrency();
    if (activeDownloads < maxConcurrent) {
      run();
      return;
    }

    if (queuedDownloads.length >= MAX_QUEUED_DOWNLOADS_BEFORE_NOTICE) {
      reject(
        new Error(
          `El bot está saturado: ya hay ${maxConcurrent} descargas activas y varias en cola. Inténtalo en unos segundos.`,
        ),
      );
      return;
    }

    queuedDownloads.push(run);
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

async function statFileSafe(
  filePath: string,
): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

export async function getFileBytes(filePath: string): Promise<number> {
  const info = await statFileSafe(filePath);
  const fileSize = Number(info?.size ?? 0);
  if (!info || !Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error("El archivo descargado está vacío.");
  }
  return fileSize;
}

function waitForDownload(
  flight: InFlightDownload,
  timeout: number,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error("La descarga fue cancelada."));

  flight.waiters += 1;
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error("La descarga excedió el tiempo límite."));
    }, Math.max(0, timeout));
    const onAbort = () => finish(new Error("La descarga fue cancelada."));

    function finish(value: string | Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      flight.waiters -= 1;
      if (flight.waiters === 0 && !flight.done) flight.controller.abort();
      if (value instanceof Error) reject(value);
      else resolve(value);
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    flight.promise.then(
      (filePath) => finish(filePath),
      (error: unknown) => finish(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

export async function downloadToCache(
  url: string,
  timeout = 180000,
  headers: Record<string, string> = {},
  maxBytes = Number.POSITIVE_INFINITY,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new Error("La descarga fue cancelada.");
  const safeUrl = await resolveValidatedDestination(url);
  if (signal?.aborted) throw new Error("La descarga fue cancelada.");
  const safeUrlString = safeUrl.url.toString();
  const requestKey = buildDownloadRequestKey(safeUrlString, headers, maxBytes);
  let flight = inFlightDownloads.get(requestKey);
  if (!flight) {
    const controller = new AbortController();
    const cacheKey = requestKey.slice(0, 32);
    const filePath = path.join(getCacheDir(), `download-${cacheKey}.bin`);
    flight = {
      promise: Promise.resolve(filePath),
      controller,
      waiters: 0,
      done: false,
    };
    inFlightDownloads.set(requestKey, flight);

    const task = queueDownload(async () => {
      await mkdir(getCacheDir(), { recursive: true });
      const cached = await statFileSafe(filePath);
      if (cached && cached.size > 0 && cached.size <= maxBytes) return filePath;

      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (controller.signal.aborted) {
          throw new Error("La descarga fue cancelada.");
        }

        const partialPath = path.join(
          getCacheDir(),
          `.download-${cacheKey}-${process.pid}-${randomBytes(4).toString("hex")}.part`,
        );
        let result: ValidatedRequest | undefined;
        try {
          result = await requestWithValidatedRedirects(
            safeUrlString,
            resolveRequestHeaders(safeUrlString, headers),
            controller.signal,
            3,
          );
          if (result.response.statusCode < 200 || result.response.statusCode >= 300) {
            await result.response.body.dump();
            throw new Error(`Descarga HTTP ${result.response.statusCode}`);
          }

          const contentLength = Number(result.response.headers["content-length"] || 0);
          if (contentLength > maxBytes) {
            result.response.body.destroy();
            throw new Error(
              `El archivo excede el máximo permitido (${formatBytes(maxBytes)}).`,
            );
          }

          let bytesWritten = 0;
          const countingStream = new Transform({
            transform(chunk, _encoding, callback) {
              const input = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
              bytesWritten += input.length;
              if (Number.isFinite(maxBytes) && bytesWritten > maxBytes) {
                callback(
                  new Error(
                    `El archivo excede el máximo permitido (${formatBytes(maxBytes)}).`,
                  ),
                );
                return;
              }
              callback(null, input);
            },
          });

          await pipeline(
            result.response.body,
            countingStream,
            createWriteStream(partialPath),
            { signal: controller.signal },
          );

          const finalSize = await statFileSafe(partialPath);
          if (!finalSize || finalSize.size <= 0) {
            throw new Error("La descarga no devolvió contenido.");
          }
          if (finalSize.size > maxBytes) {
            throw new Error(
              `El archivo excede el máximo permitido (${formatBytes(maxBytes)}).`,
            );
          }

          await rename(partialPath, filePath);
          return filePath;
        } catch (error) {
          if (controller.signal.aborted) {
            throw new Error("La descarga fue cancelada.");
          }
          lastError = error;
          await rm(partialPath, { force: true }).catch(() => undefined);
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
          }
        } finally {
          if (result) await result.dispatcher.close().catch(() => undefined);
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Descarga fallida.");
    });

    flight.promise = task;
    task.then(
      () => {
        flight!.done = true;
      },
      () => {
        flight!.done = true;
      },
    ).finally(() => {
      if (inFlightDownloads.get(requestKey) === flight) {
        inFlightDownloads.delete(requestKey);
      }
    });
  }

  return waitForDownload(flight, timeout, signal);
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
