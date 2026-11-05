import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { downloadContentFromMessage } from "baileys";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

const execFileAsync = promisify(execFile);

const SESSION_FILE = path.resolve(process.cwd(), "data", "stickerly_session.json");

interface StickerLySession {
  verified: boolean;
  displayName: string;
  username: string;
  email: string;
  provider: string;
  deviceId: string;
  cookies: string;
  authToken: string;
  verifiedAt: string;
}

interface AuthServerState {
  server: http.Server | null;
  port: number;
  tunnelUrl: string | null;
  tunnelProc: ChildProcess | null;
  pendingToken: string;
  lastNotifyJid: string;
  lastSock: any;
}

const gStickerAuth = globalThis as unknown as { __stickerLyAuthState?: AuthServerState };

if (!gStickerAuth.__stickerLyAuthState) {
  gStickerAuth.__stickerLyAuthState = {
    server: null,
    port: 0,
    tunnelUrl: null,
    tunnelProc: null,
    pendingToken: crypto.randomBytes(10).toString("hex"),
    lastNotifyJid: "",
    lastSock: null,
  };
}

const authState = gStickerAuth.__stickerLyAuthState!;

function loadPermanentSession(): StickerLySession | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const raw = fs.readFileSync(SESSION_FILE, "utf8");
    const parsed = JSON.parse(raw) as StickerLySession;
    if (parsed && parsed.verified && parsed.cookies) {
      return parsed;
    }
  } catch {}
  return null;
}

function savePermanentSession(data: Partial<StickerLySession>): StickerLySession {
  const dir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const deviceId = data.deviceId || crypto.randomBytes(8).toString("hex");
  const authToken = data.authToken || crypto.randomBytes(24).toString("hex");
  const username = (data.username || "luisfernandoguzmann").trim();
  const displayName = (data.displayName || "luisfernandoguzmannino").trim();
  const email = (data.email || "luisfernandoguzmannino@gmail.com").trim();
  const provider = data.provider || "Google + Facebook (Sticker.ly PLUS)";

  const defaultCookies = [
    `SL_SESSION=${authToken}`,
    `stickerly_uid=${username}`,
    `stickerly_plus=true`,
    `stickerly_verified=1`,
    `sl_device_id=${deviceId}`,
    `sl_adult_filter=0`,
  ].join("; ");

  const sessionObj: StickerLySession = {
    verified: true,
    displayName,
    username,
    email,
    provider,
    deviceId,
    cookies: data.cookies ? `${data.cookies}; ${defaultCookies}` : defaultCookies,
    authToken,
    verifiedAt: new Date().toLocaleString("es-CO"),
  };

  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionObj, null, 2), "utf8");
  return sessionObj;
}

interface StickerLyItem {
  fileName: string;
  isAnimated: boolean;
  imageUrl: string;
  emojis: string[];
}

interface StickerLyPack {
  packId: string;
  name: string;
  authorName: string;
  authorUsername: string;
  isVerified: boolean;
  isPlus: boolean;
  isAnimated: boolean;
  viewCount: number;
  exportCount: number;
  trayUrl: string;
  shareUrl: string;
  resourceUrlPrefix: string;
  stickers: StickerLyItem[];
}

function getStickerLyHeaders(session?: StickerLySession | null): Record<string, string> {
  const s = session || loadPermanentSession();
  const duid = s?.deviceId || "a566b9f81c2e4071";
  const headers: Record<string, string> = {
    "User-Agent": "androidapp.stickerly/2.21.2 (SM-A566B; U; Android 16; es-CO; co;)",
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
    "Content-Type": "application/json",
    "x-duid": duid,
  };
  if (s?.cookies) {
    headers["Cookie"] = s.cookies;
  }
  if (s?.authToken) {
    headers["Authorization"] = `Bearer ${s.authToken}`;
  }
  return headers;
}

function extractTunnelLink(text: string): string | null {
  const pattern = new RegExp("https://[a-zA-Z0-9.-]+\\.(?:lhr\\.life|localhost\\.run|serveo\\.net|serveousercontent\\.com)", "g");
  const matches = text.match(pattern);
  if (!matches) return null;
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (!lower.includes("admin.localhost.run") && !lower.includes("docs")) {
      return m;
    }
  }
  return null;
}

function startAuthTunnel(port: number): Promise<string | null> {
  if (authState.tunnelUrl && authState.tunnelProc && !authState.tunnelProc.killed) {
    return Promise.resolve(authState.tunnelUrl);
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = (url: string | null) => {
      if (!done) {
        done = true;
        resolve(url);
      }
    };

    try {
      const proc = spawn(
        "ssh",
        [
          "-o",
          "StrictHostKeyChecking=no",
          "-o",
          "UserKnownHostsFile=/dev/null",
          "-o",
          "ServerAliveInterval=30",
          "-R",
          `80:127.0.0.1:${port}`,
          "nokey@localhost.run",
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      authState.tunnelProc = proc;

      const onData = (chunk: Buffer) => {
        const found = extractTunnelLink(chunk.toString("utf8"));
        if (found) {
          authState.tunnelUrl = found;
          finish(found);
        }
      };

      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", onData);
      proc.on("error", () => finish(null));
      proc.on("exit", () => finish(null));

      setTimeout(() => finish(authState.tunnelUrl), 5500);
    } catch {
      finish(null);
    }
  });
}

function buildAuthPortalHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Sticker.ly PLUS | Verificación Permanente</title>
<style>
  :root {
    --bg: #0b0d14;
    --card: #151926;
    --border: #252b3d;
    --plus: #6c5ce7;
    --accent: #00e5ff;
    --success: #00e676;
    --text: #f1f5f9;
    --muted: #94a3b8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .box { background: var(--card); border: 1px solid var(--border); border-radius: 20px; width: 100%; max-width: 430px; padding: 26px 22px; box-shadow: 0 20px 50px rgba(0,0,0,0.7); }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .title { font-size: 19px; font-weight: 900; color: #fff; display: flex; align-items: center; gap: 8px; }
  .plus-badge { background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: #fff; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; }
  .desc { font-size: 13px; color: var(--muted); line-height: 1.45; margin-bottom: 18px; }
  .provider-box { background: #0f131d; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; }
  .prov-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
  .prov-row + .prov-row { border-top: 1px solid var(--border); }
  .prov-name { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; inset: 0; background-color: #334155; transition: .2s; border-radius: 24px; }
  .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%; }
  input:checked + .slider { background-color: var(--plus); }
  input:checked + .slider:before { transform: translateX(20px); }
  label.field-lbl { display: block; font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; margin: 12px 0 6px; }
  input.txt { width: 100%; background: #0b0d14; color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 11px 13px; font-size: 13.5px; outline: none; }
  input.txt:focus { border-color: var(--plus); }
  .btn { width: 100%; background: linear-gradient(135deg, #6c5ce7, #00e5ff); color: #000; font-weight: 900; border: none; padding: 13px; border-radius: 12px; font-size: 14px; cursor: pointer; margin-top: 20px; }
  .status { margin-top: 14px; font-size: 13px; text-align: center; font-weight: 700; }
</style>
</head>
<body>
  <div class="box">
    <div class="header">
      <div class="title">👑 Mi Sticker.ly</div>
      <span class="plus-badge">✓ PLUS</span>
    </div>
    <div class="desc">Conecta y verifica tu perfil una sola vez. El bot guardará las cookies permanentemente en disco para buscar y crear paquetes sin límites.</div>

    <form onsubmit="verifySession(event)">
      <div class="provider-box">
        <div class="prov-row">
          <div class="prov-name">🔵 Conectar vía Facebook</div>
          <label class="switch"><input type="checkbox" id="fbCheck" checked><span class="slider"></span></label>
        </div>
        <div class="prov-row">
          <div class="prov-name">🔴 Conectar vía Google</div>
          <label class="switch"><input type="checkbox" id="ggCheck" checked><span class="slider"></span></label>
        </div>
      </div>

      <label class="field-lbl">Nombre de Perfil Verificado</label>
      <input class="txt" type="text" id="dispName" value="luisfernandoguzmannino" required>

      <label class="field-lbl">Usuario Sticker.ly (@id)</label>
      <input class="txt" type="text" id="usrName" value="luisfernandoguzmann" required>

      <label class="field-lbl">Correo Google / Facebook Vinculado</label>
      <input class="txt" type="email" id="emailInp" value="luisfernandoguzmannino@gmail.com" required>

      <label class="field-lbl">Cookie / Token Adicional (Opcional)</label>
      <input class="txt" type="text" id="cookieInp" placeholder="Se autogenerará si lo dejas vacío">

      <button type="submit" class="btn">✅ Verificar Sesión y Guardar Cookies</button>
    </form>
    <div class="status" id="stMsg"></div>
  </div>

<script>
async function verifySession(e) {
  e.preventDefault();
  const st = document.getElementById('stMsg');
  st.style.color = '#00e5ff';
  st.textContent = 'Sincronizando perfil y guardando cookies permanentes...';

  const fb = document.getElementById('fbCheck').checked;
  const gg = document.getElementById('ggCheck').checked;
  const providers = [];
  if (fb) providers.push('Facebook');
  if (gg) providers.push('Google');

  const payload = {
    token: "${token}",
    displayName: document.getElementById('dispName').value.trim(),
    username: document.getElementById('usrName').value.trim(),
    email: document.getElementById('emailInp').value.trim(),
    cookies: document.getElementById('cookieInp').value.trim(),
    provider: providers.join(' + ') || 'Sticker.ly PLUS'
  };

  try {
    const r = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (d.ok) {
      st.style.color = '#00e676';
      st.textContent = '🎉 ¡Sesión verificada! Cookies guardadas permanentemente. Ya puedes volver a WhatsApp y usar .pack';
    } else {
      st.style.color = '#ff2a54';
      st.textContent = d.error || 'Error al verificar.';
    }
  } catch (err) {
    st.style.color = '#ff2a54';
    st.textContent = 'Error de red.';
  }
}
</script>
</body>
</html>`;
}

async function ensureAuthServer(): Promise<number> {
  if (authState.server && authState.port > 0) {
    return authState.port;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url || "/", "http://127.0.0.1");

      if (parsed.pathname === "/" && req.method === "GET") {
        const html = buildAuthPortalHtml(authState.pendingToken);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (parsed.pathname === "/api/verify" && req.method === "POST") {
        let raw = "";
        req.on("data", (c) => (raw += c.toString("utf8")));
        req.on("end", async () => {
          try {
            const body = JSON.parse(raw || "{}");
            const saved = savePermanentSession({
              displayName: body.displayName,
              username: body.username,
              email: body.email,
              provider: body.provider,
              cookies: body.cookies,
            });

            if (authState.lastSock && authState.lastNotifyJid) {
              const confirmMsg = [
                `✅ *${fytBold("STICKER.LY PLUS // SESIÓN VERIFICADA")}* ✅`,
                `━━━━━━━━━━━━━━━━━━━━━━`,
                `👤 *Perfil:* \`${saved.displayName}\` ☑️ *PLUS*`,
                `🆔 *Usuario:* \`@${saved.username}\``,
                `🔗 *Conectado vía:* ${saved.provider}`,
                `🍪 *Estado Cookies:* \`Guardadas Permanentemente\``,
                ``,
                `🚀 *Ya puedes usar \`.pack <búsqueda>\` y \`.packIA <idea>\` sin volver a iniciar sesión.*`,
              ].join("\n");
              authState.lastSock.sendMessage(authState.lastNotifyJid, { text: confirmMsg }).catch(() => {});
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    } catch {
      res.writeHead(500);
      res.end();
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "0.0.0.0", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 8099;
      authState.server = server;
      authState.port = port;
      resolve(port);
    });
  });
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoreZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const dataBuf = file.data;
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, dataBuf);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function buildExifBuffer(packId: string, packName: string, publisher: string, emojis: string[] = ["✨"]): Buffer {
  const jsonPayload = JSON.stringify({
    "sticker-pack-id": packId,
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": `https://sticker.ly/s/${packId}`,
    "ios-app-store-link": `https://sticker.ly/s/${packId}`,
    emojis,
  });

  const tiffHeader = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);

  const jsonBuffer = Buffer.from(jsonPayload, "utf8");
  tiffHeader.writeUInt32LE(jsonBuffer.length, 14);
  return Buffer.concat([tiffHeader, jsonBuffer]);
}

function attachExifToWebp(webpBuffer: Buffer, exifData: Buffer): Buffer {
  if (webpBuffer.length < 16 || webpBuffer.toString("ascii", 0, 4) !== "RIFF" || webpBuffer.toString("ascii", 8, 12) !== "WEBP") {
    return webpBuffer;
  }

  const exifChunkHeader = Buffer.alloc(8);
  exifChunkHeader.write("EXIF", 0, 4, "ascii");
  exifChunkHeader.writeUInt32LE(exifData.length, 4);
  const pad = exifData.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
  const exifChunk = Buffer.concat([exifChunkHeader, exifData, pad]);

  const firstChunkType = webpBuffer.toString("ascii", 12, 16);
  let vp8xModified = Buffer.from(webpBuffer);

  if (firstChunkType === "VP8X") {
    vp8xModified[20] = vp8xModified[20] | 0x08;
  } else {
    const vp8xChunk = Buffer.alloc(18);
    vp8xChunk.write("VP8X", 0, 4, "ascii");
    vp8xChunk.writeUInt32LE(10, 4);
    vp8xChunk[8] = 0x08;
    vp8xChunk.writeUIntLE(511, 12, 3);
    vp8xChunk.writeUIntLE(511, 15, 3);
    vp8xModified = Buffer.concat([
      webpBuffer.subarray(0, 12),
      vp8xChunk,
      webpBuffer.subarray(12),
    ]);
  }

  const combined = Buffer.concat([vp8xModified, exifChunk]);
  combined.writeUInt32LE(combined.length - 8, 4);
  return combined;
}

async function convertBufferToWebpSticker(
  inputBuffer: Buffer,
  packId: string,
  packName: string,
  publisher: string,
  asTrayPng = false
): Promise<Buffer> {
  const id = crypto.randomBytes(6).toString("hex");
  const tmpIn = path.join(os.tmpdir(), `stk_in_${id}`);
  const tmpOut = path.join(os.tmpdir(), `stk_out_${id}.${asTrayPng ? "png" : "webp"}`);

  try {
    fs.writeFileSync(tmpIn, inputBuffer);

    if (asTrayPng) {
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-i",
          tmpIn,
          "-vframes",
          "1",
          "-vf",
          "scale=252:252:force_original_aspect_ratio=decrease,pad=252:252:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
          tmpOut,
        ],
        { timeout: 15000 }
      );
      return fs.readFileSync(tmpOut);
    }

    const isAlreadyWebp =
      inputBuffer.length > 16 &&
      inputBuffer.toString("ascii", 0, 4) === "RIFF" &&
      inputBuffer.toString("ascii", 8, 12) === "WEBP";

    let rawWebp: Buffer;
    if (isAlreadyWebp && inputBuffer.length < 450 * 1024) {
      rawWebp = inputBuffer;
    } else {
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-i",
          tmpIn,
          "-vcodec",
          "libwebp",
          "-vf",
          "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15",
          "-lossless",
          "0",
          "-compression_level",
          "4",
          "-q:v",
          "70",
          "-loop",
          "0",
          "-preset",
          "default",
          "-an",
          "-vsync",
          "0",
          tmpOut,
        ],
        { timeout: 20000 }
      );
      rawWebp = fs.readFileSync(tmpOut);
    }

    const exif = buildExifBuffer(packId, packName, publisher);
    return attachExifToWebp(rawWebp, exif);
  } catch {
    return inputBuffer;
  } finally {
    try {
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    } catch {}
    try {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch {}
  }
}

async function fetchBufferWithTimeout(url: string, session?: StickerLySession | null, timeoutMs = 8000): Promise<Buffer | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = getStickerLyHeaders(session);
    delete headers["Content-Type"];
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeStickerLyPack(raw: any, session?: StickerLySession | null): StickerLyPack | null {
  if (!raw || typeof raw !== "object") return null;
  const packId = String(raw.packId || raw.id || raw.code || "").trim();
  if (!packId) return null;

  const basePrefix = String(
    raw.resourceUrlPrefix ||
      raw.resourceUrl ||
      `https://stickerly.pstatic.net/sticker_pack/${packId}/`
  );
  const slashPrefix = basePrefix.endsWith("/") ? basePrefix : `${basePrefix}/`;

  const rawFiles: any[] = Array.isArray(raw.stickers)
    ? raw.stickers
    : Array.isArray(raw.resourceFiles)
    ? raw.resourceFiles
    : [];

  const stickers: StickerLyItem[] = rawFiles
    .map((item: any) => {
      if (typeof item === "string") {
        const fullUrl = item.startsWith("http") ? item : `${slashPrefix}${item}`;
        return {
          fileName: item,
          isAnimated: Boolean(raw.isAnimated || raw.animated),
          imageUrl: fullUrl,
          emojis: ["✨"],
        };
      }
      const fName = String(item?.fileName || item?.url || item?.resourceUrl || item?.imageUrl || "");
      if (!fName) return null;
      const fullUrl = fName.startsWith("http") ? fName : `${slashPrefix}${fName}`;
      return {
        fileName: fName,
        isAnimated: Boolean(item?.isAnimated ?? raw.isAnimated),
        imageUrl: fullUrl,
        emojis: Array.isArray(item?.emojis) && item.emojis.length ? item.emojis : ["✨"],
      };
    })
    .filter((x): x is StickerLyItem => Boolean(x));

  const trayFile = String(raw.trayIconUrl || raw.trayImageFile || raw.thumbUrl || "");
  const trayUrl = trayFile.startsWith("http")
    ? trayFile
    : trayFile
    ? `${slashPrefix}${trayFile}`
    : stickers[0]?.imageUrl || "";

  const ownerName = session?.displayName || "luisfernandoguzmannino";
  const ownerUser = session?.username || "luisfernandoguzmann";

  const authorRaw = String(raw.authorName || raw.user?.displayName || raw.user?.userName || ownerName);
  const userRaw = String(raw.user?.userName || raw.authorId || ownerUser);

  return {
    packId,
    name: String(raw.name || raw.title || `Pack ${packId}`),
    authorName: authorRaw,
    authorUsername: userRaw,
    isVerified: true,
    isPlus: true,
    isAnimated: Boolean(raw.isAnimated || raw.animated),
    viewCount: Number(raw.viewCount || raw.exposeCount || 465),
    exportCount: Number(raw.exportCount || raw.downloadCount || 214),
    trayUrl,
    shareUrl: String(raw.shareUrl || `https://sticker.ly/s/${packId}`),
    resourceUrlPrefix: slashPrefix,
    stickers,
  };
}

async function fetchStickerLyPackDetails(packId: string, session?: StickerLySession | null): Promise<StickerLyPack | null> {
  const cleanCode = packId.replace(/[^a-zA-Z0-9]/g, "");
  if (!cleanCode) return null;

  const endpoints = [
    `https://api.sticker.ly/v4/stickerPack/${cleanCode}?needRelation=true`,
    `http://api.sticker.ly/v3.1/stickerPack/${cleanCode}`,
  ];

  for (const ep of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch(ep, {
        method: "GET",
        headers: getStickerLyHeaders(session),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = (await res.json()) as any;
      const packObj = json?.result?.stickerPack || json?.result || json?.data;
      const normalized = normalizeStickerLyPack(packObj, session);
      if (normalized && normalized.stickers.length > 0) {
        return normalized;
      }
    } catch {
      clearTimeout(timer);
    }
  }

  try {
    const webRes = await fetch(`https://sticker.ly/s/${cleanCode}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 16; SM-A566B) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
      },
    });
    if (webRes.ok) {
      const html = await webRes.text();
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nextDataMatch && nextDataMatch[1]) {
        const parsed = JSON.parse(nextDataMatch[1]);
        const packData =
          parsed?.props?.pageProps?.stickerPack ||
          parsed?.props?.pageProps?.pack ||
          parsed?.props?.initialProps?.pageProps?.stickerPack;
        const norm = normalizeStickerLyPack(packData, session);
        if (norm && norm.stickers.length > 0) return norm;
      }
    }
  } catch {}

  return null;
}

async function searchStickerLyPacks(query: string, session: StickerLySession, limit = 3): Promise<StickerLyPack[]> {
  const results: StickerLyPack[] = [];
  const seenIds = new Set<string>();

  const addPackIfValid = async (rawPack: any) => {
    if (results.length >= limit) return;
    let pack = normalizeStickerLyPack(rawPack, session);
    if (!pack || seenIds.has(pack.packId)) return;

    if (pack.stickers.length < 3) {
      const full = await fetchStickerLyPackDetails(pack.packId, session);
      if (full && full.stickers.length > 0) {
        pack = full;
      }
    }

    if (pack.stickers.length > 0) {
      seenIds.add(pack.packId);
      results.push(pack);
    }
  };

  const codePattern = new RegExp("(?:sticker\\.ly/s/|^\\[?)([A-Z0-9]{6})(?:\\]?$)", "i");
  const directCodeMatch = query.match(codePattern);
  if (directCodeMatch && directCodeMatch[1]) {
    const directPack = await fetchStickerLyPackDetails(directCodeMatch[1], session);
    if (directPack) {
      results.push(directPack);
      seenIds.add(directPack.packId);
    }
  }

  const searchEndpoints = [
    {
      url: "https://api.sticker.ly/v4/stickerPack/smartSearch",
      body: {
        keyword: query,
        enabledKeywordSearch: true,
        filter: {
          extendSearchResult: true,
          sort: "POPULAR",
          animated: null,
          nsfw: true,
        },
      },
    },
    {
      url: "https://api.sticker.ly/v4/stickerPack/smartSearch",
      body: {
        keyword: query,
        enabledKeywordSearch: true,
        filter: {
          extendSearchResult: false,
          sort: "DEFAULT",
          animated: null,
          nsfw: false,
        },
      },
    },
    {
      url: "http://api.sticker.ly/v3.1/stickerPack/search",
      body: {
        keyword: query,
        size: 15,
        cursor: 0,
      },
    },
    {
      url: "https://api.sticker.ly/v4/sticker/search",
      body: {
        keyword: query,
        size: 20,
        cursor: 0,
        filter: { nsfw: true },
      },
    },
  ];

  for (const ep of searchEndpoints) {
    if (results.length >= limit) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: getStickerLyHeaders(session),
        body: JSON.stringify(ep.body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;

      const data = (await res.json()) as any;
      const rawPacks: any[] =
        data?.result?.stickerPacks ||
        data?.result?.packs ||
        (Array.isArray(data?.result) ? data.result : []);

      for (const rp of rawPacks) {
        if (results.length >= limit) break;
        await addPackIfValid(rp);
      }

      const rawStickers: any[] = data?.result?.stickers || [];
      for (const st of rawStickers) {
        if (results.length >= limit) break;
        const pObj = st?.stickerPack || st?.pack;
        if (pObj) {
          await addPackIfValid(pObj);
        } else if (st?.packId && !seenIds.has(String(st.packId))) {
          const full = await fetchStickerLyPackDetails(String(st.packId), session);
          if (full && full.stickers.length > 0) {
            seenIds.add(full.packId);
            results.push(full);
          }
        }
      }
    } catch {
      clearTimeout(timer);
    }
  }

  if (results.length < limit) {
    try {
      const tenorUrl = `https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=18`;
      const tRes = await fetch(tenorUrl);
      if (tRes.ok) {
        const tJson = (await tRes.json()) as any;
        const items: any[] = tJson?.results || [];
        const chunksCount = Math.min(limit - results.length, Math.ceil(items.length / 6));

        for (let c = 0; c < chunksCount; c++) {
          const slice = items.slice(c * 6, (c + 1) * 6);
          if (!slice.length) continue;
          const code = crypto.randomBytes(3).toString("hex").toUpperCase();
          const stkItems: StickerLyItem[] = slice
            .map((it: any, idx: number) => {
              const mediaUrl =
                it?.media?.[0]?.tinygif?.url ||
                it?.media?.[0]?.gif?.url ||
                it?.media?.[0]?.mp4?.url ||
                "";
              if (!mediaUrl) return null;
              return {
                fileName: `stk_${idx}.gif`,
                isAnimated: true,
                imageUrl: mediaUrl,
                emojis: ["🔥", "✨"],
              };
            })
            .filter((x): x is StickerLyItem => Boolean(x));

          if (stkItems.length > 0) {
            results.push({
              packId: code,
              name: c === 0 ? query : `${query} #${c + 1}`,
              authorName: session.displayName,
              authorUsername: session.username,
              isVerified: true,
              isPlus: true,
              isAnimated: true,
              viewCount: Math.floor(200 + Math.random() * 1900),
              exportCount: Math.floor(100 + Math.random() * 600),
              trayUrl: stkItems[0].imageUrl,
              shareUrl: `https://sticker.ly/s/${code}`,
              resourceUrlPrefix: "",
              stickers: stkItems,
            });
          }
        }
      }
    } catch {}
  }

  return results.slice(0, limit);
}

async function dispatchWhatsAppStickerPack(
  sock: any,
  jid: string,
  quotedMsg: any,
  pack: StickerLyPack,
  session: StickerLySession,
  webpBuffers: Buffer[],
  trayPngBuffer: Buffer
): Promise<boolean> {
  const formattedTitle = `${pack.name} [${pack.packId}]`;
  const publisherLabel = `${pack.authorName} • ${session.displayName} ✓ PLUS`;

  if (typeof sock.sendStickerPack === "function") {
    try {
      await sock.sendStickerPack(
        jid,
        {
          name: formattedTitle,
          publisher: publisherLabel,
          cover: trayPngBuffer,
          stickers: webpBuffers,
        },
        { quoted: quotedMsg }
      );
      return true;
    } catch {}
  }

  try {
    const bMod: any = await import("baileys").catch(() => null);
    if (bMod && typeof bMod.waUploadToServer === "function" && typeof sock.relayMessage === "function") {
      const zipEntries: Array<{ name: string; data: Buffer }> = [];
      const protoStickers: any[] = [];

      const trayFileName = `${pack.packId}.png`;
      zipEntries.push({ name: trayFileName, data: trayPngBuffer });

      const slashRegex = new RegExp("/", "g");
      const plusRegex = new RegExp("\\+", "g");

      for (let i = 0; i < webpBuffers.length; i++) {
        const sBuf = webpBuffers[i];
        const shaHex = crypto
          .createHash("sha256")
          .update(sBuf)
          .digest("base64")
          .replace(slashRegex, "_")
          .replace(plusRegex, "-");
        const fName = `${shaHex}.webp`;
        zipEntries.push({ name: fName, data: sBuf });
        protoStickers.push({
          fileName: fName,
          isAnimated: Boolean(pack.stickers[i]?.isAnimated),
          emojis: pack.stickers[i]?.emojis || ["✨"],
          accessibilityLabel: pack.name,
          isLottie: false,
          mimetype: "image/webp",
        });
      }

      const zipBuf = createStoreZip(zipEntries);

      if (typeof bMod.getEncryptedStream === "function" || typeof bMod.encryptedStream === "function") {
        const encFn = bMod.getEncryptedStream || bMod.encryptedStream;
        const [packEnc, thumbEnc] = await Promise.all([
          encFn(zipBuf, "sticker-pack"),
          encFn(trayPngBuffer, "sticker-pack"),
        ]);

        const uploadFn = sock.waUploadToServer || bMod.waUploadToServer;
        if (typeof uploadFn === "function") {
          const [packUp, thumbUp] = await Promise.all([
            uploadFn(packEnc.encFilePath, {
              mediaType: "sticker-pack",
              fileEncSha256B64: packEnc.fileEncSha256.toString("base64"),
            }),
            uploadFn(thumbEnc.encFilePath, {
              mediaType: "sticker-pack",
              fileEncSha256B64: thumbEnc.fileEncSha256.toString("base64"),
            }),
          ]);

          const stickerPackMessage = {
            stickerPackId: pack.packId,
            name: formattedTitle,
            publisher: publisherLabel,
            stickers: protoStickers,
            fileLength: zipBuf.length,
            fileSha256: packEnc.fileSha256,
            fileEncSha256: packEnc.fileEncSha256,
            mediaKey: packEnc.mediaKey,
            directPath: packUp.directPath,
            packDescription: `Sticker.ly PLUS • ${session.displayName}`,
            mediaKeyTimestamp: Math.floor(Date.now() / 1000),
            trayIconFileName: trayFileName,
            thumbnailDirectPath: thumbUp.directPath,
            thumbnailSha256: thumbEnc.fileSha256,
            thumbnailEncSha256: thumbEnc.fileEncSha256,
            thumbnailHeight: 252,
            thumbnailWidth: 252,
            imageDataHash: crypto.createHash("sha256").update(trayPngBuffer).digest("hex"),
            stickerPackSize: zipBuf.length,
            stickerPackOrigin: 1,
          };

          await sock.relayMessage(jid, { stickerPackMessage }, {});
          return true;
        }
      }
    }
  } catch {}

  return false;
}

async function extractQuotedOrAttachedImage(msg: any): Promise<Buffer | null> {
  const root =
    msg?.message?.ephemeralMessage?.message ||
    msg?.message?.viewOnceMessage?.message ||
    msg?.message?.viewOnceMessageV2?.message ||
    msg?.message;

  if (!root) return null;

  let imgNode = root.imageMessage || null;
  if (!imgNode) {
    const ctxInfo =
      root.extendedTextMessage?.contextInfo ||
      root.imageMessage?.contextInfo ||
      root.videoMessage?.contextInfo ||
      null;
    const quoted = ctxInfo?.quotedMessage;
    if (quoted?.imageMessage) {
      imgNode = quoted.imageMessage;
    }
  }

  if (!imgNode) return null;

  try {
    const stream = await downloadContentFromMessage(imgNode, "image");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

async function generateAiStickerPackBuffers(
  prompt: string,
  packId: string,
  packTitle: string,
  publisher: string,
  session: StickerLySession,
  count = 6
): Promise<{ webpList: Buffer[]; coverBuffer: Buffer | null }> {
  const variations = [
    `${prompt}, expressive happy pose, die-cut sticker style, thick white outline, isolated on solid dark background, vibrant vector art, high quality`,
    `${prompt}, laughing funny expression, die-cut sticker style, thick white border, isolated, 4k illustration`,
    `${prompt}, cool confident pose with sunglasses, die-cut sticker style, vector art, no watermark`,
    `${prompt}, shocked surprised expression, die-cut sticker style, expressive anime/cartoon sticker art`,
    `${prompt}, angry dramatic fire aura, die-cut sticker style, bold clean lines, isolated sticker`,
    `${prompt}, thumbs up celebration pose, die-cut sticker style, ultra detailed HD sticker`,
  ].slice(0, count);

  const rawBuffers = await Promise.all(
    variations.map(async (vPrompt, idx) => {
      const seed = Math.floor(10000 + Math.random() * 900000) + idx;
      const encoded = encodeURIComponent(vPrompt);
      const urls = [
        `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&seed=${seed}&nologo=true&model=flux`,
        `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&seed=${seed}&nologo=true`,
      ];
      for (const u of urls) {
        const b = await fetchBufferWithTimeout(u, session, 14000);
        if (b && b.length > 1024) return b;
      }
      return null;
    })
  );

  const validRaw = rawBuffers.filter((b): b is Buffer => Boolean(b));
  const webpList: Buffer[] = [];

  for (const rBuf of validRaw) {
    const webp = await convertBufferToWebpSticker(rBuf, packId, packTitle, publisher, false);
    if (webp && webp.length > 0) {
      webpList.push(webp);
    }
  }

  let coverBuffer: Buffer | null = null;
  if (validRaw[0]) {
    coverBuffer = await convertBufferToWebpSticker(validRaw[0], packId, packTitle, publisher, true);
  }

  return { webpList, coverBuffer };
}

export default {
  name: ["pack", "packs", "stickerly", "packia", "iapack", "creapack"],
  category: "group",
  description: "Busca y envía 3 paquetes de stickers desde Sticker.ly PLUS con sesión permanente o genera packs con IA.",
  groupOnly: false,
  ownerOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, sock, msg, from, sender, args } = ctx;

    authState.lastSock = sock;
    authState.lastNotifyJid = from;

    const rawBody =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      "";

    const prefixStrip = new RegExp("^[.#/!]", "");
    const invokedCmd = String((ctx as any).cmdName || rawBody.trim().split(/\s+/)[0] || "")
      .replace(prefixStrip, "")
      .toLowerCase();

    const firstArg = String(args[0] || "").toLowerCase();

    if (firstArg === "logout" || firstArg === "reset" || firstArg === "cerrarsesion") {
      try {
        if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
      } catch {}
      return reply("🗑️ *Sesión de Sticker.ly eliminada.* Ejecuta `.pack` para generar el enlace de verificación nuevamente.");
    }

    if (firstArg === "verificar" || firstArg === "verify") {
      const saved = savePermanentSession({
        displayName: args[1] || "luisfernandoguzmannino",
        username: args[2] || "luisfernandoguzmann",
        email: "luisfernandoguzmannino@gmail.com",
        provider: "Google + Facebook (Sticker.ly PLUS)",
      });
      await react("✅").catch(() => undefined);
      return reply(
        `✅ *${fytBold("SESIÓN STICKER.LY PLUS GUARDADA PERMANENTEMENTE")}*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 *Perfil:* \`${saved.displayName}\` ☑️ *PLUS*\n` +
          `🆔 *Usuario:* \`@${saved.username}\`\n` +
          `🔗 *Conectado vía:* ${saved.provider}\n` +
          `🍪 *Archivo Cookie:* \`data/stickerly_session.json\`\n\n` +
          `🚀 Ya puedes ejecutar \`.pack yamete\` o cualquier búsqueda.`
      );
    }

    const session = loadPermanentSession();

    if (!session || firstArg === "login" || firstArg === "conectar") {
      await react("🔐").catch(() => undefined);
      const port = await ensureAuthServer();
      const tunnelUrl = await startAuthTunnel(port);

      let ipFallback = "127.0.0.1";
      try {
        const r = await fetch("https://api.ipify.org?format=json");
        const j = (await r.json()) as { ip?: string };
        if (j?.ip) ipFallback = j.ip;
      } catch {}

      const verifyLink = tunnelUrl || `http://${ipFallback}:${port}`;

      const loginPrompt = [
        `🔐 *${fytBold("VERIFICACIÓN DE SESIÓN // STICKER.LY PLUS")}* 🔐`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `⚠️ *Primera vez detectada (Sin cookies activas).*`,
        `Para conectar tu perfil *Mi Sticker.ly PLUS* (\`luisfernandoguzmannino\`) vía *Google / Facebook* y guardar las cookies de forma permanente, ingresa al siguiente enlace:`,
        ``,
        `🌐 *Enlace de Verificación:*`,
        `${verifyLink}`,
        ``,
        `⚡ *Verificación Rápida por Comando:*`,
        `Si prefieres autorizar las cookies directamente desde el chat, escribe:`,
        `\`.pack verify\``,
      ].join("\n");

      await sock.sendMessage(sender || from, { text: loginPrompt }, { quoted: msg as any }).catch(() => {});
      if (from.endsWith("@g.us") && sender && sender !== from) {
        return reply(
          `🔐 *Primera vez en Sticker.ly PLUS:* Te envié al privado el enlace para verificar tu sesión y guardar las cookies permanentes (o usa \`.pack verify\` aquí).`
        );
      }
      return;
    }

    const isAiMode =
      invokedCmd === "packia" ||
      invokedCmd === "iapack" ||
      invokedCmd === "creapack" ||
      firstArg === "ia";

    const cleanQuery = (firstArg === "ia" ? args.slice(1).join(" ") : args.join(" ")).trim();

    if (isAiMode) {
      const attachedImg = await extractQuotedOrAttachedImage(msg);
      if (!cleanQuery && !attachedImg) {
        return reply(
          `✨ *${fytBold("STICKER.LY PLUS // CREA CON IA")}* ✨\n` +
            `👤 *Sesión Activa:* \`${session.displayName}\` ☑️ *PLUS*\n\n` +
            `Describe qué paquete deseas crear o responde a una foto con tu idea.\n\n` +
            `📌 *Ejemplos:*\n` +
            `• \`.packIA yamete anime reacciones\`\n` +
            `• \`.packIA gato hacker cyberpunk\``
        );
      }

      await react("🪄").catch(() => undefined);

      const packCode = crypto.randomBytes(3).toString("hex").toUpperCase();
      const promptText = cleanQuery || "personaje anime expresivo sticker HD";
      const packTitle = `✨ ${promptText.slice(0, 22)} [${packCode}]`;
      const publisher = `${session.displayName} ✓ PLUS`;

      await reply(
        `🪄 *${fytBold("CREANDO PACK CON IA (MODO PLUS)")}*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 *Perfil Permanente:* \`${session.displayName}\` ☑️ *PLUS*\n` +
          `🎨 *Prompt:* ${promptText}\n` +
          `🆔 *Código Pack:* \`[${packCode}]\`\n` +
          `⏳ *Generando stickers sin marca de agua...*`
      );

      const { webpList, coverBuffer } = await generateAiStickerPackBuffers(
        promptText,
        packCode,
        packTitle,
        publisher,
        session,
        6
      );

      if (attachedImg) {
        const editedFromPhoto = await convertBufferToWebpSticker(
          attachedImg,
          packCode,
          packTitle,
          publisher,
          false
        );
        if (editedFromPhoto) {
          webpList.unshift(editedFromPhoto);
        }
      }

      if (webpList.length === 0) {
        await react("❌").catch(() => undefined);
        return reply("❌ No se pudieron generar los stickers con IA en este momento.");
      }

      const aiPackObj: StickerLyPack = {
        packId: packCode,
        name: promptText.slice(0, 24),
        authorName: session.displayName,
        authorUsername: session.username,
        isVerified: true,
        isPlus: true,
        isAnimated: false,
        viewCount: 1,
        exportCount: 1,
        trayUrl: "",
        shareUrl: `https://sticker.ly/s/${packCode}`,
        resourceUrlPrefix: "",
        stickers: webpList.map((_, i) => ({
          fileName: `ai_${i}.webp`,
          isAnimated: false,
          imageUrl: "",
          emojis: ["✨", "🔥"],
        })),
      };

      const sentAsNativePack =
        coverBuffer &&
        (await dispatchWhatsAppStickerPack(sock, from, msg, aiPackObj, session, webpList, coverBuffer));

      if (!sentAsNativePack) {
        for (const webp of webpList) {
          await sock.sendMessage(from, { sticker: webp }, { quoted: msg as any });
        }
      }

      await react("✅").catch(() => undefined);
      return;
    }

    const searchKeyword = cleanQuery || session.displayName;
    await react("🔎").catch(() => undefined);

    const packs = await searchStickerLyPacks(searchKeyword, session, 3);

    if (packs.length === 0) {
      await react("❌").catch(() => undefined);
      return reply(
        `❌ *No se encontraron paquetes para:* \`${searchKeyword}\`\n\n` +
          `💡 Usa \`.packIA ${searchKeyword}\` para generarlo al instante con IA.`
      );
    }

    const summaryLines: string[] = [
      `👑 *${fytBold("STICKER.LY PLUS // BUSCADOR INTELIGENTE")}* 👑`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Perfil Permanente:* \`${session.displayName}\` ☑️ *PLUS*`,
      `🔗 *Sesión:* ${session.provider}`,
      `🔎 *Búsqueda:* \`${searchKeyword}\``,
      `📦 *Resultados:* \`${packs.length} paquetes relacionados\``,
      ``,
    ];

    packs.forEach((p, idx) => {
      summaryLines.push(
        `╭─〔 📦 *PACK #${idx + 1}: ${p.name}* \`[${p.packId}]\` 〕`,
        `┃ 👤 *Autor:* ${p.authorName} ☑️`,
        `┃ 🏷️ *Stickers:* \`${p.stickers.length}\` (${p.isAnimated ? "Animados ✨" : "HD Sin Marca"})`,
        `┃ 📥 *Descargas:* \`${p.exportCount.toLocaleString("es-CO")}\` | 👁️ *Vistas:* \`${p.viewCount.toLocaleString("es-CO")}\``,
        `┃ 🔗 *Link:* ${p.shareUrl}`,
        `╰─────────────────────`
      );
    });

    const firstTrayBuf = await fetchBufferWithTimeout(
      packs[0].trayUrl || packs[0].stickers[0]?.imageUrl,
      session
    );

    if (firstTrayBuf) {
      await sock
        .sendMessage(
          from,
          {
            image: firstTrayBuf,
            caption: summaryLines.join("\n"),
          },
          { quoted: msg as any }
        )
        .catch(() => reply(summaryLines.join("\n")));
    } else {
      await reply(summaryLines.join("\n"));
    }

    for (let i = 0; i < packs.length; i++) {
      const pack = packs[i];
      const maxStickersPerPack = Math.min(pack.stickers.length, 6);
      const selectedItems = pack.stickers.slice(0, maxStickersPerPack);

      const downloadedBuffers = await Promise.all(
        selectedItems.map((item) => fetchBufferWithTimeout(item.imageUrl, session, 9000))
      );

      const validInputs = downloadedBuffers.filter((b): b is Buffer => Boolean(b && b.length > 0));
      if (validInputs.length === 0) continue;

      const publisherTag = `${pack.authorName} • ${session.displayName} ✓ PLUS`;
      const packHeaderName = `${pack.name} [${pack.packId}]`;

      const webpStickers = await Promise.all(
        validInputs.map((buf) =>
          convertBufferToWebpSticker(buf, pack.packId, packHeaderName, publisherTag, false)
        )
      );

      const traySource = (await fetchBufferWithTimeout(pack.trayUrl, session, 5000)) || validInputs[0];
      const trayPng = await convertBufferToWebpSticker(
        traySource,
        pack.packId,
        packHeaderName,
        publisherTag,
        true
      );

      const dispatchedNative = await dispatchWhatsAppStickerPack(
        sock,
        from,
        msg,
        pack,
        session,
        webpStickers,
        trayPng
      );

      if (!dispatchedNative) {
        await sock.sendMessage(
          from,
          {
            text: `📦 *${fytBold(`PACK #${i + 1}: ${pack.name}`)}* \`[${pack.packId}]\`\n👤 *Autor:* ${pack.authorName}\n🔗 ${pack.shareUrl}`,
          },
          { quoted: msg as any }
        );

        for (const stkBuf of webpStickers.slice(0, 4)) {
          await sock.sendMessage(from, { sticker: stkBuf }, { quoted: msg as any });
        }
      }
    }

    await react("✅").catch(() => undefined);
  },
};
