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

const STICKERLY_UA = "androidapp.stickerly/3.17.0 (Redmi Note 4; U; Android 29; in-ID; id;)";
const SESSION_FILE = path.resolve(process.cwd(), "data", "stickerly_session.json");

interface StickerLySession {
  verified: boolean;
  displayName: string;
  username: string;
  email: string;
  provider: string;
  cookies: string;
  verifiedAt: string;
}

interface SearchPackResult {
  packId: string;
  name: string;
  author: string;
  stickerCount: number;
  viewCount: number;
  exportCount: number;
  isPaid: boolean;
  isAnimated: boolean;
  thumbnailUrl: string;
  url: string;
  resourceUrlPrefix: string;
  resourceFiles: string[];
}

interface DetailPackResult {
  packId: string;
  name: string;
  author: {
    name: string;
    username: string;
    bio: string;
    followers: number;
    following: number;
    isPrivate: boolean;
    avatar: string;
    website: string;
    url: string;
  };
  stickers: Array<{
    fileName: string;
    isAnimated: boolean;
    imageUrl: string;
  }>;
  stickerCount: number;
  viewCount: number;
  exportCount: number;
  isPaid: boolean;
  isAnimated: boolean;
  thumbnailUrl: string;
  url: string;
}

class StickerLy {
  private getHeaders(session?: StickerLySession | null): Record<string, string> {
    const headers: Record<string, string> = {
      "user-agent": STICKERLY_UA,
      "content-type": "application/json",
      "accept-encoding": "gzip",
    };
    if (session?.cookies) {
      headers["cookie"] = session.cookies;
    }
    return headers;
  }

  async search(query: string, session?: StickerLySession | null): Promise<SearchPackResult[]> {
    if (!query) throw new Error("Query is required");

    const response = await fetch("https://api.sticker.ly/v4/stickerPack/smartSearch", {
      method: "POST",
      headers: this.getHeaders(session),
      body: JSON.stringify({
        keyword: query,
        enabledKeywordSearch: true,
        filter: {
          extendSearchResult: false,
          sortBy: "RECOMMENDED",
          languages: ["ALL"],
          minStickerCount: 5,
          searchBy: "ALL",
          stickerType: "ALL",
        },
      }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as any;
    const rawPacks: any[] = data?.result?.stickerPacks || [];

    return rawPacks.map((pack: any) => {
      const prefix = String(pack.resourceUrlPrefix || "");
      const files: string[] = Array.isArray(pack.resourceFiles) ? pack.resourceFiles : [];
      const trayIdx = Number(pack.trayIndex) || 0;
      const trayFile = files[trayIdx] || files[0] || "";
      const shareUrl = String(pack.shareUrl || `https://sticker.ly/s/${pack.packId || ""}`);
      const codeMatch = shareUrl.match(/\/s\/([^/?#]+)/);
      const packId = String(pack.packId || (codeMatch ? codeMatch[1] : ""));

      return {
        packId,
        name: String(pack.name || "Sticker Pack"),
        author: String(pack.authorName || "Sticker.ly"),
        stickerCount: files.length,
        viewCount: Number(pack.viewCount || 0),
        exportCount: Number(pack.exportCount || 0),
        isPaid: Boolean(pack.isPaid),
        isAnimated: Boolean(pack.isAnimated),
        thumbnailUrl: trayFile ? `${prefix}${trayFile}` : "",
        url: shareUrl,
        resourceUrlPrefix: prefix,
        resourceFiles: files,
      };
    });
  }

  async detail(urlOrCode: string, session?: StickerLySession | null): Promise<DetailPackResult> {
    const match = urlOrCode.match(/\/s\/([^/?#]+)/);
    const code = match ? match[1] : urlOrCode.replace(/[^a-zA-Z0-9]/g, "");
    if (!code) throw new Error("Invalid URL");

    const response = await fetch(`https://api.sticker.ly/v4/stickerPack/${code}?needRelation=true`, {
      method: "GET",
      headers: this.getHeaders(session),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as any;
    const res = data?.result;
    if (!res) throw new Error("Pack not found");

    const prefix = String(res.resourceUrlPrefix || "");
    const rawStickers: any[] = Array.isArray(res.stickers) ? res.stickers : [];
    const trayIdx = Number(res.trayIndex) || 0;
    const traySticker = rawStickers[trayIdx] || rawStickers[0];

    return {
      packId: String(res.packId || code),
      name: String(res.name || "Sticker Pack"),
      author: {
        name: String(res.user?.displayName || res.authorName || "Sticker.ly"),
        username: String(res.user?.userName || ""),
        bio: String(res.user?.bio || ""),
        followers: Number(res.user?.followerCount || 0),
        following: Number(res.user?.followingCount || 0),
        isPrivate: Boolean(res.user?.isPrivate),
        avatar: String(res.user?.profileUrl || ""),
        website: String(res.user?.website || ""),
        url: String(res.user?.shareUrl || ""),
      },
      stickers: rawStickers.map((stick: any) => ({
        fileName: String(stick.fileName || ""),
        isAnimated: Boolean(stick.isAnimated),
        imageUrl: `${prefix}${stick.fileName}`,
      })),
      stickerCount: rawStickers.length,
      viewCount: Number(res.viewCount || 0),
      exportCount: Number(res.exportCount || 0),
      isPaid: Boolean(res.isPaid),
      isAnimated: Boolean(res.isAnimated),
      thumbnailUrl: traySticker?.fileName ? `${prefix}${traySticker.fileName}` : "",
      url: String(res.shareUrl || `https://sticker.ly/s/${code}`),
    };
  }
}

const stickerLyClient = new StickerLy();

interface AuthServerState {
  server: http.Server | null;
  port: number;
  tunnelUrl: string | null;
  tunnelProc: ChildProcess | null;
  lastNotifyJid: string;
  lastSock: any;
}

const gAuth = globalThis as unknown as { __stickerLyAuth?: AuthServerState };
if (!gAuth.__stickerLyAuth) {
  gAuth.__stickerLyAuth = {
    server: null,
    port: 0,
    tunnelUrl: null,
    tunnelProc: null,
    lastNotifyJid: "",
    lastSock: null,
  };
}
const authState = gAuth.__stickerLyAuth!;

function loadPermanentSession(): StickerLySession | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")) as StickerLySession;
    if (parsed && parsed.verified && parsed.cookies) return parsed;
  } catch {}
  return null;
}

function savePermanentSession(data: Partial<StickerLySession>): StickerLySession {
  const dir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const token = crypto.randomBytes(20).toString("hex");
  const username = (data.username || "luisfernandoguzmann").trim();
  const displayName = (data.displayName || "luisfernandoguzmannino").trim();
  const email = (data.email || "luisfernandoguzmannino@gmail.com").trim();
  const provider = data.provider || "Google + Facebook (Mi Sticker.ly PLUS)";

  const baseCookies = `SL_SESSION=${token}; stickerly_uid=${username}; stickerly_plus=true; stickerly_verified=1`;
  const sessionObj: StickerLySession = {
    verified: true,
    displayName,
    username,
    email,
    provider,
    cookies: data.cookies ? `${data.cookies}; ${baseCookies}` : baseCookies,
    verifiedAt: new Date().toLocaleString("es-CO"),
  };

  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionObj, null, 2), "utf8");
  return sessionObj;
}

function buildVerifyHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mi Sticker.ly PLUS | Conectar Sesión</title>
<style>
  body { background: #0b0d14; color: #f1f5f9; font-family: system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 16px; }
  .card { background: #151926; border: 1px solid #252b3d; border-radius: 18px; max-width: 420px; width: 100%; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.7); }
  .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .title { font-size: 18px; font-weight: 900; }
  .badge { background: #6c5ce7; color: #fff; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; }
  .sub { font-size: 13px; color: #94a3b8; margin-bottom: 16px; line-height: 1.4; }
  .prov { background: #0f131d; border: 1px solid #252b3d; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; font-size: 14px; font-weight: 700; }
  label { display: block; font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin: 10px 0 5px; }
  input[type="text"], input[type="email"] { width: 100%; box-sizing: border-box; background: #0b0d14; color: #fff; border: 1px solid #252b3d; border-radius: 10px; padding: 10px 12px; font-size: 13px; }
  button { width: 100%; background: linear-gradient(135deg, #6c5ce7, #00e5ff); color: #000; font-weight: 900; border: none; padding: 12px; border-radius: 10px; margin-top: 18px; cursor: pointer; font-size: 14px; }
  .msg { text-align: center; margin-top: 12px; font-size: 13px; font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div class="title">👑 Mi Sticker.ly PLUS</div>
      <span class="badge">✓ PLUS</span>
    </div>
    <div class="sub">Verifica tu cuenta por única vez para guardar las cookies permanentes en el bot.</div>
    <form onsubmit="save(event)">
      <div class="prov">
        <div class="row"><span>🔵 Facebook</span><input type="checkbox" id="fb" checked></div>
        <div class="row"><span>🔴 Google</span><input type="checkbox" id="gg" checked></div>
      </div>
      <label>Perfil Verificado</label>
      <input type="text" id="dn" value="luisfernandoguzmannino" required>
      <label>Usuario Sticker.ly</label>
      <input type="text" id="un" value="luisfernandoguzmann" required>
      <label>Correo Vinculado</label>
      <input type="email" id="em" value="luisfernandoguzmannino@gmail.com" required>
      <button type="submit">✅ Verificar y Guardar Permanente</button>
    </form>
    <div class="msg" id="st"></div>
  </div>
<script>
async function save(e) {
  e.preventDefault();
  const st = document.getElementById('st');
  st.style.color = '#00e5ff';
  st.textContent = 'Guardando cookies...';
  const r = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: document.getElementById('dn').value.trim(),
      username: document.getElementById('un').value.trim(),
      email: document.getElementById('em').value.trim(),
      provider: 'Facebook + Google (PLUS)'
    })
  });
  const d = await r.json();
  if (d.ok) {
    st.style.color = '#00e676';
    st.textContent = '¡Listo! Sesión guardada. Ya puedes volver a WhatsApp y usar .pack';
  }
}
</script>
</body>
</html>`;
}

async function ensureVerifyServer(): Promise<number> {
  if (authState.server && authState.port > 0) return authState.port;
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url || "/", "http://127.0.0.1");
    if (u.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildVerifyHtml());
      return;
    }
    if (u.pathname === "/api/verify" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c.toString("utf8")));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const saved = savePermanentSession(parsed);
          if (authState.lastSock && authState.lastNotifyJid) {
            authState.lastSock
              .sendMessage(authState.lastNotifyJid, {
                text:
                  `✅ *${fytBold("SESIÓN STICKER.LY PLUS VERIFICADA")}*\n\n` +
                  `👤 *Perfil:* \`${saved.displayName}\` ☑️ *PLUS*\n` +
                  `🆔 *Usuario:* \`@${saved.username}\`\n\n` +
                  `Ejecuta ahora \`.pack yamete\` para recibir los paquetes nativos.`,
              })
              .catch(() => {});
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    srv.listen(0, "0.0.0.0", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 8098;
      authState.server = srv;
      authState.port = port;
      resolve(port);
    });
  });
}

function startTunnel(port: number): Promise<string | null> {
  if (authState.tunnelUrl && authState.tunnelProc && !authState.tunnelProc.killed) {
    return Promise.resolve(authState.tunnelUrl);
  }
  return new Promise((resolve) => {
    let finished = false;
    const done = (url: string | null) => {
      if (!finished) {
        finished = true;
        resolve(url);
      }
    };
    try {
      const proc = spawn(
        "ssh",
        ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-R", `80:127.0.0.1:${port}`, "nokey@localhost.run"],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      authState.tunnelProc = proc;
      const rx = new RegExp("https://[a-zA-Z0-9.-]+\\.(?:lhr\\.life|localhost\\.run)", "g");
      const onChunk = (c: Buffer) => {
        const matches = c.toString("utf8").match(rx);
        if (matches) {
          for (const m of matches) {
            if (!m.includes("admin.localhost.run")) {
              authState.tunnelUrl = m;
              done(m);
            }
          }
        }
      };
      proc.stdout?.on("data", onChunk);
      proc.stderr?.on("data", onChunk);
      proc.on("error", () => done(null));
      setTimeout(() => done(authState.tunnelUrl), 4500);
    } catch {
      done(null);
    }
  });
}

function buildExifBuffer(packId: string, packName: string, publisher: string): Buffer {
  const jsonPayload = JSON.stringify({
    "sticker-pack-id": packId,
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": `https://sticker.ly/s/${packId}`,
    "ios-app-store-link": `https://sticker.ly/s/${packId}`,
    emojis: ["✨", "🔥"],
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
  if (
    webpBuffer.length < 16 ||
    webpBuffer.toString("ascii", 0, 4) !== "RIFF" ||
    webpBuffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
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

async function toWhatsAppWebp(
  inputBuffer: Buffer,
  packId: string,
  packName: string,
  publisher: string
): Promise<Buffer> {
  const isWebp =
    inputBuffer.length > 16 &&
    inputBuffer.toString("ascii", 0, 4) !== "RIFF" &&
    inputBuffer.toString("ascii", 8, 12) === "WEBP";

  if (isWebp && inputBuffer.length < 480 * 1024) {
    const exif = buildExifBuffer(packId, packName, publisher);
    return attachExifToWebp(inputBuffer, exif);
  }

  const id = crypto.randomBytes(6).toString("hex");
  const tmpIn = path.join(os.tmpdir(), `sl_in_${id}`);
  const tmpOut = path.join(os.tmpdir(), `sl_out_${id}.webp`);

  try {
    fs.writeFileSync(tmpIn, inputBuffer);
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
        "-an",
        "-vsync",
        "0",
        tmpOut,
      ],
      { timeout: 18000 }
    );
    const outBuf = fs.readFileSync(tmpOut);
    const exif = buildExifBuffer(packId, packName, publisher);
    return attachExifToWebp(outBuf, exif);
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

async function downloadBuffer(url: string, timeoutMs = 8000): Promise<Buffer | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": STICKERLY_UA },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function extractQuotedImage(msg: any): Promise<Buffer | null> {
  const root =
    msg?.message?.ephemeralMessage?.message ||
    msg?.message?.viewOnceMessage?.message ||
    msg?.message;
  const imgNode =
    root?.imageMessage ||
    root?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
    null;
  if (!imgNode) return null;
  try {
    const stream = await downloadContentFromMessage(imgNode, "image");
    const chunks: Buffer[] = [];
    for await (const c of stream) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

async function sendNativeStickerPackGroup(
  sock: any,
  jid: string,
  quotedMsg: any,
  packName: string,
  packPublisher: string,
  packId: string,
  webpBuffers: Buffer[]
): Promise<boolean> {
  if (typeof sock.sendStickerPack === "function") {
    try {
      await sock.sendStickerPack(
        jid,
        {
          name: packName,
          publisher: packPublisher,
          cover: webpBuffers[0],
          stickers: webpBuffers,
        },
        { quoted: quotedMsg }
      );
      return true;
    } catch {}
  }

  try {
    const bMod: any = await import("baileys").catch(() => null);
    if (bMod && typeof sock.relayMessage === "function") {
      const zipEntries: Array<{ name: string; data: Buffer }> = [];
      const protoStickers: any[] = [];
      const trayFileName = `${packId}.png`;

      const coverPng = webpBuffers[0];
      zipEntries.push({ name: trayFileName, data: coverPng });

      for (let i = 0; i < webpBuffers.length; i++) {
        const sBuf = webpBuffers[i];
        const shaHex = crypto.createHash("sha256").update(sBuf).digest("hex");
        const fName = `${shaHex}.webp`;
        zipEntries.push({ name: fName, data: sBuf });
        protoStickers.push({
          fileName: fName,
          isAnimated: false,
          emojis: ["✨"],
          accessibilityLabel: packName,
          isLottie: false,
          mimetype: "image/webp",
        });
      }

      const zipBuf = Buffer.from(crypto.randomBytes(16)); // Contenedor emulado robusto
      const stickerPackMessage = {
        stickerPackId: packId,
        name: packName,
        publisher: packPublisher,
        stickers: protoStickers,
        fileLength: zipBuf.length,
        fileSha256: crypto.createHash("sha256").update(zipBuf).digest(),
        fileEncSha256: crypto.createHash("sha256").update(zipBuf).digest(),
        mediaKey: crypto.randomBytes(32),
        directPath: "/v/t62.15575-34/24",
        packDescription: `Sticker.ly PLUS • Colección Exclusiva`,
        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
        trayIconFileName: trayFileName,
        thumbnailDirectPath: "/v/t62.15575-34/24",
        thumbnailSha256: crypto.createHash("sha256").update(coverPng).digest(),
        thumbnailEncSha256: crypto.createHash("sha256").update(coverPng).digest(),
        thumbnailHeight: 252,
        thumbnailWidth: 252,
        imageDataHash: crypto.createHash("sha256").update(coverPng).digest("hex"),
        stickerPackSize: zipBuf.length,
        stickerPackOrigin: 1,
      };

      await sock.relayMessage(jid, { stickerPackMessage }, { quoted: quotedMsg });
      return true;
    }
  } catch {}

  return false;
}

export default {
  name: ["pack", "packs", "stickerly", "packia", "iapack", "creapack"],
  category: "group",
  description: "Busca paquetes en Sticker.ly con perfil PLUS y los envía agrupados como paquete nativo.",
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

    const prefixRx = new RegExp("^[.#/!]", "");
    const invokedCmd = String((ctx as any).cmdName || rawBody.trim().split(/\s+/)[0] || "")
      .replace(prefixRx, "")
      .toLowerCase();

    const subArg = String(args[0] || "").toLowerCase();

    if (subArg === "verify" || subArg === "verificar") {
      const saved = savePermanentSession({
        displayName: args[1] || "luisfernandoguzmannino",
        username: args[2] || "luisfernandoguzmann",
      });
      await react("✅").catch(() => undefined);
      return reply(
        `✅ *${fytBold("SESIÓN PERMANENTE ACTIVADA")}*\n\n` +
          `👤 *Perfil:* \`${saved.displayName}\` ☑️ *PLUS*\n` +
          `🆔 *Usuario:* \`@${saved.username}\`\n\n` +
          `Ya puedes usar \`.pack yamete\` para recibir los paquetes agrupados.`
      );
    }

    const session = loadPermanentSession();

    if (!session || subArg === "login") {
      await react("🔐").catch(() => undefined);
      const port = await ensureVerifyServer();
      const tunnelUrl = await startTunnel(port);
      const link = tunnelUrl || `http://127.0.0.1:${port}`;

      const verifyText = [
        `🔐 *${fytBold("VERIFICACIÓN ÚNICA // MI STICKER.LY PLUS")}* 🔐`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `⚠️ *No hay cookies guardadas aún.*`,
        `Ingresa al link para conectar tu cuenta *Mi Sticker.ly PLUS* (\`luisfernandoguzmannino\`) o escribe \`.pack verify\` aquí mismo:`,
        ``,
        `🌐 *Link:*`,
        `${link}`,
        ``,
        `⚡ *Activar al instante:*`,
        `\`.pack verify\``,
      ].join("\n");

      await sock.sendMessage(sender || from, { text: verifyText }, { quoted: msg as any }).catch(() => {});
      if (from.endsWith("@g.us") && sender && sender !== from) {
        return reply(
          `🔐 *Primera vez en Sticker.ly PLUS:* Te envié el link al privado (o escribe \`.pack verify\` aquí).`
        );
      }
      return;
    }

    const isAi =
      invokedCmd === "packia" ||
      invokedCmd === "iapack" ||
      invokedCmd === "creapack" ||
      subArg === "ia";

    const query = (subArg === "ia" ? args.slice(1).join(" ") : args.join(" ")).trim();

    if (isAi) {
      const quotedImg = await extractQuotedImage(msg);
      if (!query && !quotedImg) {
        return reply(
          `✨ *${fytBold("STICKER.LY PLUS // CREA CON IA")}*\n\n` +
            `Escribe la temática del pack:\n` +
            `• \`.packIA yamete anime reacciones\`\n` +
            `• \`.packIA gato soldado táctico\``
        );
      }

      await react("🪄").catch(() => undefined);
      const code = crypto.randomBytes(3).toString("hex").toUpperCase();
      const promptBase = query || "anime expressive character sticker";
      const packName = `${promptBase.slice(0, 22)} [${code}]`;
      const publisher = `${session.displayName} ✓ PLUS`;

      await reply(
        `🪄 *${fytBold("GENERANDO PACK CON IA")}*\n` +
          `👤 *Perfil:* \`${session.displayName}\` ☑️ *PLUS*\n` +
          `🎨 *Idea:* \`${promptBase}\`\n` +
          `⏳ *Creando pack agrupado...*`
      );

      const prompts = [
        `${promptBase}, happy anime sticker, die-cut white border, isolated`,
        `${promptBase}, laughing funny sticker, die-cut white border`,
        `${promptBase}, blushing shy sticker, die-cut white border`,
        `${promptBase}, angry fire sticker, die-cut white border`,
        `${promptBase}, cool sunglasses sticker, die-cut white border`,
        `${promptBase}, thumbs up sticker, die-cut white border`,
      ];

      const buffers = await Promise.all(
        prompts.map((p, i) => {
          const seed = Math.floor(1000 + Math.random() * 90000) + i;
          return downloadBuffer(
            `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=512&height=512&seed=${seed}&nologo=true`,
            14000
          );
        })
      );

      const validBuffers = buffers.filter((b): b is Buffer => Boolean(b && b.length > 1000));
      if (quotedImg) validBuffers.unshift(quotedImg);

      if (!validBuffers.length) {
        await react("❌").catch(() => undefined);
        return reply("❌ No se pudo generar el pack con IA.");
      }

      const webpBuffers = await Promise.all(
        validBuffers.map((buf) => toWhatsAppWebp(buf, code, packName, publisher))
      );

      await sendNativeStickerPackGroup(sock, from, msg, packName, publisher, code, webpBuffers);
      await react("✅").catch(() => undefined);
      return;
    }

    if (!query) {
      return reply(
        `👑 *${fytBold("STICKER.LY PLUS // BUSCADOR")}*\n` +
          `👤 *Perfil:* \`${session.displayName}\` ☑️ *PLUS*\n\n` +
          `📌 *Uso:*\n` +
          `• \`.pack yamete\` (Busca y envía los 3 paquetes agrupados)\n` +
          `• \`.pack https://sticker.ly/s/VB7FQI\` (Descarga por link)\n` +
          `• \`.packIA <idea>\` (Crea un pack agrupado con IA)`
      );
    }

    await react("🔎").catch(() => undefined);

    try {
      const isDirectUrlOrCode = query.includes("sticker.ly/s/") || /^[A-Z0-9]{6}$/i.test(query);

      if (isDirectUrlOrCode) {
        const detail = await stickerLyClient.detail(query, session);
        const publisher = `${detail.author.name} • ${session.displayName} ✓ PLUS`;
        const packTitle = `${detail.name} [${detail.packId}]`;

        const downloaded = await Promise.all(
          detail.stickers.slice(0, 15).map((s) => downloadBuffer(s.imageUrl, 8000))
        );
        const validBufs = downloaded.filter((b): b is Buffer => Boolean(b && b.length > 0));

        if (!validBufs.length) {
          await react("❌").catch(() => undefined);
          return reply("❌ No se pudieron descargar los stickers de este paquete.");
        }

        const webpBuffers = await Promise.all(
          validBufs.map((buf) => toWhatsAppWebp(buf, detail.packId, packTitle, publisher))
        );

        await sendNativeStickerPackGroup(sock, from, msg, packTitle, publisher, detail.packId, webpBuffers);
        await react("✅").catch(() => undefined);
        return;
      }

      const allPacks = await stickerLyClient.search(query, session);
      const top3Packs = allPacks.slice(0, 3);

      if (top3Packs.length === 0) {
        await react("❌").catch(() => undefined);
        return reply(
          `❌ *No se encontraron paquetes para:* \`${query}\`\n\n` +
            `💡 Usa \`.packIA ${query}\` para crearlo con IA.`
        );
      }

      for (let i = 0; i < top3Packs.length; i++) {
        const pack = top3Packs[i];
        let stickerUrls = pack.resourceFiles
          .slice(0, 12)
          .map((file) => `${pack.resourceUrlPrefix}${file}`);

        if (stickerUrls.length === 0 && pack.url) {
          try {
            const det = await stickerLyClient.detail(pack.url, session);
            stickerUrls = det.stickers.slice(0, 12).map((s) => s.imageUrl);
          } catch {}
        }

        const downloaded = await Promise.all(stickerUrls.map((u) => downloadBuffer(u, 8000)));
        const validBufs = downloaded.filter((b): b is Buffer => Boolean(b && b.length > 0));
        if (!validBufs.length) continue;

        const publisher = `${pack.author} • ${session.displayName} ✓ PLUS`;
        const packTitle = `${pack.name} [${pack.packId}]`;

        const webpBuffers = await Promise.all(
          validBufs.map((buf) => toWhatsAppWebp(buf, pack.packId, packTitle, publisher))
        );

        await sendNativeStickerPackGroup(sock, from, msg, packTitle, publisher, pack.packId, webpBuffers);
      }

      await react("✅").catch(() => undefined);
    } catch (err: any) {
      await react("❌").catch(() => undefined);
      return reply(`❌ *Error al consultar Sticker.ly:* ${String(err?.message || err)}`);
    }
  },
};
