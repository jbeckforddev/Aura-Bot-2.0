import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "sega_cache");
const ENGINE_CACHE_FILE = path.join(CACHE_DIR, "luferos_genesis_v52.js.gz");
const DEMO_ROM_FILE = path.join(CACHE_DIR, "SegaDemo.bin");
const MAX_INLINE_COMBINED_B64 = 780000;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

for (const oldFile of [
  "luferos_genesis_v50.js.gz",
  "luferos_genesis_v51.js.gz",
  "Genesis.min.js",
]) {
  const oldPath = path.join(CACHE_DIR, oldFile);
  if (fs.existsSync(oldPath)) {
    try {
      fs.unlinkSync(oldPath);
    } catch {}
  }
}

const GENESIS_ENGINE_URLS = [
  "https://cdn.jsdelivr.net/gh/lrusso/Genesis@main/Genesis.min.js",
  "https://raw.githubusercontent.com/lrusso/Genesis/main/Genesis.min.js",
];

const GENESIS_DEMO_URLS = [
  "https://cdn.jsdelivr.net/gh/lrusso/Genesis@main/DEMO.bin",
  "https://raw.githubusercontent.com/lrusso/Genesis/main/DEMO.bin",
];

let cachedEngineGzipB64 = "";

function patchGenesisEngineCode(rawCode: string): string {
  let code = rawCode;
  const marker = "Error. This emulator can not be used from a different origin.";
  let searchPos = 0;

  while (true) {
    const idx = code.indexOf(marker, searchPos);
    if (idx === -1) break;

    const lookBehind = code.slice(Math.max(0, idx - 120), idx);
    const elseMatch = /}\s*else\s*\{?\s*throw\s+(?:new\s+)?Error\s*\(\s*["']$/i.exec(lookBehind);

    if (elseMatch) {
      const closeBracePos = idx - elseMatch[0].length;
      let depth = 0;
      let openBracePos = -1;
      for (let i = closeBracePos; i >= 0; i--) {
        const ch = code[i];
        if (ch === "}") depth++;
        else if (ch === "{") {
          depth--;
          if (depth === 0) {
            openBracePos = i;
            break;
          }
        }
      }

      if (openBracePos !== -1) {
        let p = openBracePos - 1;
        while (p >= 0 && /\s/.test(code[p])) p--;
        if (code[p] === ")") {
          let pDepth = 0;
          let openParenPos = -1;
          for (let j = p; j >= 0; j--) {
            if (code[j] === ")") pDepth++;
            else if (code[j] === "(") {
              pDepth--;
              if (pDepth === 0) {
                openParenPos = j;
                break;
              }
            }
          }
          if (openParenPos !== -1) {
            code =
              code.slice(0, openParenPos) +
              "(true)" +
              code.slice(p + 1);
          }
        }
      }
    }

    searchPos = idx + marker.length;
  }

  code = code
    .replace(
      /if\s*\([^{;]{1,260}\)\s*\{?\s*throw\s+(?:new\s+)?Error\s*\(\s*["']Error\.\s*This emulator can not be used from a different origin\.["']\s*\)\s*;?\s*\}?\s*else/g,
      "if(true)",
    )
    .replace(
      /throw\s+(?:new\s+)?Error\s*\(\s*["']Error\.\s*This emulator can not be used from a different origin\.["']\s*\)/g,
      "void 0",
    )
    .replace(
      /throw\s*["']Error\.\s*This emulator can not be used from a different origin\.["']/g,
      "void 0",
    )
    .replace(/window\.top/g, "window.self")
    .replace(/window\.parent/g, "window.self");

  code += "\n;if(typeof embedGenesis!=='undefined'){window.embedGenesis=embedGenesis;}\n";
  return code;
}

function isZipBuffer(buf: Buffer): boolean {
  return (
    Buffer.isBuffer(buf) &&
    buf.length > 30 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    buf[2] === 0x03 &&
    buf[3] === 0x04
  );
}

function isValidSegaRom(buf: Buffer): boolean {
  return Buffer.isBuffer(buf) && buf.length >= 16384 && !isZipBuffer(buf);
}

function convertSmdToBinIfNeeded(buf: Buffer, fileName: string): Buffer {
  const isSmdExt = fileName.toLowerCase().endsWith(".smd");
  const hasSmdHeader =
    buf.length > 512 &&
    (buf.length - 512) % 16384 === 0 &&
    buf[8] === 0xaa &&
    buf[9] === 0xbb;

  if ((!isSmdExt && !hasSmdHeader) || (buf.length - 512) % 16384 !== 0) {
    return buf;
  }

  const out = Buffer.alloc(buf.length - 512);
  const blocks = (buf.length - 512) / 16384;
  for (let b = 0; b < blocks; b++) {
    const srcOffset = 512 + b * 16384;
    const dstOffset = b * 16384;
    for (let i = 0; i < 8192; i++) {
      out[dstOffset + i * 2] = buf[srcOffset + 8192 + i];
      out[dstOffset + i * 2 + 1] = buf[srcOffset + i];
    }
  }
  return out;
}

function extractSegaFromZipBuffer(zipBuf: Buffer): { buffer: Buffer; fileName: string } | null {
  let eocdOffset = -1;
  const minEocdPos = Math.max(0, zipBuf.length - 65557);

  for (let i = zipBuf.length - 22; i >= minEocdPos; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
    const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
    let ptr = cdOffset;

    for (let i = 0; i < totalEntries && ptr + 46 <= zipBuf.length; i++) {
      if (zipBuf.readUInt32LE(ptr) !== 0x02014b50) break;

      const method = zipBuf.readUInt16LE(ptr + 10);
      const compSize = zipBuf.readUInt32LE(ptr + 20);
      const uncompSize = zipBuf.readUInt32LE(ptr + 24);
      const fnLen = zipBuf.readUInt16LE(ptr + 28);
      const extraLen = zipBuf.readUInt16LE(ptr + 30);
      const commentLen = zipBuf.readUInt16LE(ptr + 32);
      const localOffset = zipBuf.readUInt32LE(ptr + 42);
      const entryName = zipBuf.toString("utf8", ptr + 46, ptr + 46 + fnLen);

      ptr += 46 + fnLen + extraLen + commentLen;

      if (entryName.endsWith("/") || localOffset + 30 > zipBuf.length) continue;
      if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) continue;

      const lFnLen = zipBuf.readUInt16LE(localOffset + 26);
      const lExtraLen = zipBuf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lFnLen + lExtraLen;
      const dataEnd = dataStart + compSize;

      if (compSize === 0 || dataEnd > zipBuf.length || uncompSize > 16 * 1024 * 1024) continue;

      const slice = zipBuf.subarray(dataStart, dataEnd);
      const low = entryName.toLowerCase();

      if (/\.(bin|md|gen|smd|32x)$/i.test(low) || uncompSize >= 16384) {
        try {
          const rawOut = method === 0 ? Buffer.from(slice) : zlib.inflateRawSync(slice);
          if (isValidSegaRom(rawOut)) {
            return {
              buffer: convertSmdToBinIfNeeded(rawOut, entryName),
              fileName: path.basename(entryName),
            };
          }
        } catch {}
      }
    }
  }

  let offset = 0;
  while (offset + 30 <= zipBuf.length) {
    if (zipBuf.readUInt32LE(offset) !== 0x04034b50) break;

    const method = zipBuf.readUInt16LE(offset + 8);
    const compSize = zipBuf.readUInt32LE(offset + 18);
    const uncompSize = zipBuf.readUInt32LE(offset + 22);
    const fnLen = zipBuf.readUInt16LE(offset + 26);
    const extraLen = zipBuf.readUInt16LE(offset + 28);
    const entryName = zipBuf.toString("utf8", offset + 30, offset + 30 + fnLen);
    const dataStart = offset + 30 + fnLen + extraLen;
    const dataEnd = dataStart + compSize;

    if (compSize === 0 || dataEnd > zipBuf.length || uncompSize > 16 * 1024 * 1024) break;

    const slice = zipBuf.subarray(dataStart, dataEnd);
    try {
      const rawOut = method === 0 ? Buffer.from(slice) : zlib.inflateRawSync(slice);
      if (isValidSegaRom(rawOut)) {
        return {
          buffer: convertSmdToBinIfNeeded(rawOut, entryName),
          fileName: path.basename(entryName || "game.bin"),
        };
      }
    } catch {}

    offset = dataEnd;
  }

  return null;
}

function extractSegaFromAnyBuffer(rawBuf: Buffer, originalName = "game.bin"): { buffer: Buffer; fileName: string } | null {
  if (isZipBuffer(rawBuf)) return extractSegaFromZipBuffer(rawBuf);
  if (isValidSegaRom(rawBuf)) {
    return { buffer: convertSmdToBinIfNeeded(rawBuf, originalName), fileName: originalName };
  }
  return null;
}

function repairCachedSegaRomsOnDisk() {
  if (!fs.existsSync(CACHE_DIR)) return;
  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(bin|md|gen|smd|32x)$/i.test(f));
  for (const f of files) {
    const fullPath = path.join(CACHE_DIR, f);
    try {
      const raw = fs.readFileSync(fullPath);
      if (isZipBuffer(raw)) {
        const extracted = extractSegaFromZipBuffer(raw);
        if (extracted && isValidSegaRom(extracted.buffer)) {
          fs.writeFileSync(fullPath, extracted.buffer);
        }
      }
    } catch {}
  }
}

async function fetchBufferWithTimeout(url: string, timeoutMs = 18000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function getGzippedGenesisEngineB64(): Promise<string> {
  if (cachedEngineGzipB64) return cachedEngineGzipB64;

  if (fs.existsSync(ENGINE_CACHE_FILE) && fs.statSync(ENGINE_CACHE_FILE).size > 30000) {
    cachedEngineGzipB64 = fs.readFileSync(ENGINE_CACHE_FILE).toString("base64");
    return cachedEngineGzipB64;
  }

  for (const url of GENESIS_ENGINE_URLS) {
    try {
      const buf = await fetchBufferWithTimeout
async function getGzippedGenesisEngineB64(): Promise<string> {
  if (cachedEngineGzipB64) return cachedEngineGzipB64;

  if (fs.existsSync(ENGINE_CACHE_FILE) && fs.statSync(ENGINE_CACHE_FILE).size > 30000) {
    cachedEngineGzipB64 = fs.readFileSync(ENGINE_CACHE_FILE).toString("base64");
    return cachedEngineGzipB64;
  }

  for (const url of GENESIS_ENGINE_URLS) {
    try {
      const buf = await fetchBufferWithTimeout(url, 20000);
      const code = buf.toString("utf8");
      if (code.includes("embedGenesis") && code.length > 50000) {
        const gz = zlib.gzipSync(Buffer.from(code, "utf8"), { level: 9 });
        fs.writeFileSync(ENGINE_CACHE_FILE, gz);
        cachedEngineGzipB64 = gz.toString("base64");
        return cachedEngineGzipB64;
      }
    } catch {}
  }

  throw new Error("No se pudo descargar el núcleo SEGA Genesis.");
}

async function ensureDefaultDemoRom(): Promise<Buffer | null> {
  if (fs.existsSync(DEMO_ROM_FILE) && fs.statSync(DEMO_ROM_FILE).size > 16384) {
    return fs.readFileSync(DEMO_ROM_FILE);
  }
  for (const url of GENESIS_DEMO_URLS) {
    try {
      const buf = await fetchBufferWithTimeout(url, 15000);
      if (isValidSegaRom(buf)) {
        fs.writeFileSync(DEMO_ROM_FILE, buf);
        return buf;
      }
    } catch {}
  }
  return null;
}

function getStoredSegaByName(nameKey: string): { buffer: Buffer; realName: string } | null {
  repairCachedSegaRomsOnDisk();
  const cleanKey = nameKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanKey || !fs.existsSync(CACHE_DIR)) return null;

  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(bin|md|gen|smd|32x)$/i.test(f));

  for (const f of files) {
    const baseName = f.replace(/\.(bin|md|gen|smd|32x)$/i, "");
    const cleanBase = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanBase === cleanKey || cleanBase.includes(cleanKey) || cleanKey.includes(cleanBase)) {
      const buf = fs.readFileSync(path.join(CACHE_DIR, f));
      if (isValidSegaRom(buf)) return { buffer: buf, realName: baseName };
    }
  }
  return null;
}

function checkForDuplicateSegaRom(newBuf: Buffer): string | null {
  repairCachedSegaRomsOnDisk();
  if (!fs.existsSync(CACHE_DIR)) return null;
  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(bin|md|gen|smd|32x)$/i.test(f));

  for (const f of files) {
    try {
      const existingBuf = fs.readFileSync(path.join(CACHE_DIR, f));
      if (existingBuf.length === newBuf.length && existingBuf.equals(newBuf)) {
        return f.replace(/\.(bin|md|gen|smd|32x)$/i, "");
      }
    } catch {}
  }
  return null;
}

async function downloadQuotedDocumentBuffer(msg: any): Promise<{ buffer: Buffer; fileName: string } | null> {
  const ctxInfo = msg?.message?.extendedTextMessage?.contextInfo;
  const quoted = ctxInfo?.quotedMessage;
  const doc =
    quoted?.documentMessage ||
    quoted?.documentWithCaptionMessage?.message?.documentMessage ||
    msg?.message?.documentMessage;

  if (!doc) return null;

  const bMod: any = await import("baileys");
  if (typeof bMod.downloadContentFromMessage === "function") {
    const stream = await bMod.downloadContentFromMessage(doc, "document");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    if (buffer.length > 512) {
      return { buffer, fileName: String(doc.fileName || "game.bin") };
    }
  }
  return null;
}

function buildSegaConsoleHtml(options: {
  engineGzipB64: string;
  romGzipB64: string;
  romFileName: string;
  bezelTitle: string;
}): string {
  const html = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none}
html,body{width:100%;min-height:100%;background:#05060a;color:#f4f4f5;font-family:monospace;overflow-x:hidden;overflow-y:auto}
body{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center}
#sega-case{width:min(98vw,540px);margin:0 auto;background:linear-gradient(165deg,#18181b 0%,#09090b 100%);border:3px solid #27272a;border-radius:22px 22px 46px 22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 48px rgba(0,0,0,.92)}
#sega-top-bar{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:linear-gradient(90deg,#7f1d1d,#dc2626 50%,#7f1d1d);border-bottom:2px solid #facc15;font-size:11px;font-weight:900;color:#fff}
.sega-ver{background:#09090b;color:#facc15;border:1px solid #facc15;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:900}
#lens-outer{width:100%;padding:8px 12px 6px;display:flex;flex-direction:column;align-items:center}
#lens-bezel{width:100%;background:#121215;border:3px solid #3f3f46;border-radius:14px;padding:7px 10px 8px;display:flex;flex-direction:column;align-items:center}
#lens-top{width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
.pwr-wrap{display:flex;align-items:center;gap:5px}
#status-led{width:8px;height:8px;border-radius:50%;background:#facc15;box-shadow:0 0 8px #facc15}
#status-led.on{background:#ef4444;box-shadow:0 0 10px #ef4444}
#status-led.err{background:#f97316;box-shadow:0 0 9px #f97316}
.pwr-txt{font-size:8px;font-weight:900;color:#d4d4d8}
.rom-tag{font-size:8.5px;font-weight:900;color:#60a5fa;text-transform:uppercase;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#screen-container{position:relative;width:96%;aspect-ratio:320/224;background:#000;border:2.5px solid #dc2626;border-radius:6px;overflow:hidden;display:flex;justify-content:center;align-items:center}
#game{width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:center}
#game canvas,canvas#boot-cv{width:100%!important;height:100%!important;object-fit:fill!important;display:block!important;position:absolute!important;inset:0!important;image-rendering:pixelated}
canvas#boot-cv{z-index:3;pointer-events:none}
#lens-logo{margin-top:6px;display:flex;align-items:center;justify-content:space-between;width:96%}
.md-gold{font-size:12px;font-style:italic;color:#facc15;font-weight:900}
.sega-blue{font-size:12px;font-weight:900;letter-spacing:2px;color:#3b82f6}
#debug-wrap{width:94%;margin:2px auto 4px;background:#06080f;border:1.5px solid #3b82f6;border-radius:8px;overflow:hidden}
#debug-head{background:#1e3a8a;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#93c5fd;font-weight:900}
#telemetry-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:#030508;padding:3px 6px;font-size:8.5px;color:#bfdbfe;text-align:center}
.t-cell{background:rgba(255,255,255,.04);padding:2px 3px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#debug-panel.collapsed{display:none}
#debug-log{height:70px;overflow-y:auto;padding:5px 7px;font-size:9px;line-height:1.35;color:#4ade80;background:#04060b;touch-action:pan-y;user-select:text}
#debug-actions{display:flex;justify-content:flex-end;gap:6px;padding:3px 6px;background:#070a12}
.dbg-mini-btn{background:#1e293b;color:#60a5fa;border:1px solid #2563eb;border-radius:4px;padding:2px 7px;font-size:8px;font-weight:900;cursor:pointer}
.log-line{margin-bottom:1px;word-break:break-all}
.log-warn{color:#facc15}.log-err{color:#f87171;font-weight:900}.log-sys{color:#60a5fa;font-weight:900}.log-ok{color:#4ade80;font-weight:900}
#pad-area{width:100%;padding:6px 14px 16px;display:flex;flex-direction:column;gap:10px}
#top-pad-row{width:100%;display:flex;justify-content:center;align-items:center;gap:28px}
.sega-pill{min-width:82px;height:26px;border-radius:14px;border:1.5px solid #09090b;font-size:10px;font-weight:900;cursor:pointer;box-shadow:0 3px 0 #000}
#btn-mode{background:#3f3f46;color:#e4e4e7}
#btn-start{background:#dc2626;color:#fff}
.sega-pill.touching{transform:translateY(2px);filter:brightness(1.25)}
#main-controls{width:100%;display:flex;justify-content:space-between;align-items:center;padding:2px 4px}
#dpad{position:relative;width:132px;height:132px;border-radius:50%;background:#18181b;border:2px solid #3f3f46;flex-shrink:0}
.dpad-btn{position:absolute;width:42px;height:42px;border:1.5px solid #09090b;background:#27272a;color:#f4f4f5;font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:8px;box-shadow:0 3px 0 #000}
.dpad-btn.touching{background:#dc2626;color:#fff;transform:translateY(2px)}
#u{left:43px;top:5px}#d{left:43px;bottom:5px}#l{left:5px;top:43px}#r{right:5px;top:43px}
#dpad-center{position:absolute;left:50px;top:50px;width:28px;height:28px;border-radius:50%;background:#09090b}
#sega-buttons{display:flex;flex-direction:column;gap:8px;align-items:center;background:rgba(255,255,255,.03);padding:10px 12px;border-radius:26px;border:1.5px solid rgba(255,255,255,.08);transform:rotate(-14deg)}
.xyz-row,.abc-row{display:flex;gap:10px;align-items:center}
.xyz-btn{width:38px;height:38px;border-radius:50%;border:2px solid #09090b;background:#3f3f46;color:#d4d4d8;font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 3px 0 #000;transform:rotate(14deg)}
.abc-btn{width:46px;height:46px;border-radius:50%;border:2px solid #09090b;background:#2563eb;color:#fff;font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 0 #000;transform:rotate(14deg)}
.xyz-btn.touching,.abc-btn.touching{background:#ef4444;color:#fff;transform:rotate(14deg) translateY(2px) scale(.94)}
#bottom-tools{width:100%;display:flex;justify-content:center;flex-wrap:wrap;gap:6px}
.tool-btn{border:1.5px solid #27272a;border-radius:7px;background:#18181b;color:#facc15;padding:5px 10px;font-weight:900;font-size:9.5px;cursor:pointer}
.tool-btn:active,.tool-btn.active{background:#dc2626;color:#fff;border-color:#facc15}
</style>
<body>
<div id="sega-case">
  <div id="sega-top-bar">
    <span>★ LuferOS SEGA GENESIS 16-BIT ★</span>
    <span class="sega-ver">V: 5.0</span>
  </div>
  <div id="lens-outer">
    <div id="lens-bezel">
      <div id="lens-top">
        <div class="pwr-wrap">
          <div id="status-led"></div>
          <span class="pwr-txt" id="status-text">BOOT</span>
        </div>
        <div class="rom-tag">__BEZEL_TITLE__</div>
      </div>
      <div id="screen-container">
        <div id="game"></div>
        <canvas id="boot-cv" width="320" height="224"></canvas>
      </div>
      <div id="lens-logo">
        <span class="md-gold">16-BIT MEGA DRIVE</span>
        <span class="sega-blue">SEGA</span>
      </div>
    </div>
  </div>
  <div id="debug-wrap">
    <div id="debug-head">
      <span id="dbg-state">⚡ M68000 + Z80 INIT...</span>
      <span id="dbg-cart">ROM: ---</span>
    </div>
    <div id="telemetry-bar">
      <div class="t-cell" id="t-fps">FPS: 0</div>
      <div class="t-cell" id="t-cpu">M68K: 7.67MHz</div>
      <div class="t-cell" id="t-hdr">SYS: GENESIS</div>
      <div class="t-cell" id="t-pad">PAD: IDLE</div>
    </div>
    <div id="debug-panel">
      <div id="debug-log"></div>
      <div id="debug-actions">
        <button class="dbg-mini-btn" id="btn-copy-log">📋 COPIAR LOG</button>
        <button class="dbg-mini-btn" id="btn-clear-log">🧹 LIMPIAR</button>
      </div>
    </div>
  </div>
  <div id="pad-area">
    <div id="top-pad-row">
      <button class="sega-pill" id="btn-mode" data-key="mode">MODE</button>
      <button class="sega-pill" id="btn-start" data-key="start">START</button>
    </div>
    <div id="main-controls">
      <div id="dpad">
        <div id="dpad-center"></div>
        <button class="dpad-btn" id="u" data-key="up">▲</button>
        <button class="dpad-btn" id="l" data-key="left">◀</button>
        <button class="dpad-btn" id="r" data-key="right">▶</button>
        <button class="dpad-btn" id="d" data-key="down">▼</button>
      </div>
      <div id="sega-buttons">
        <div class="xyz-row">
          <button class="xyz-btn" data-key="x">X</button>
          <button class="xyz-btn" data-key="y">Y</button>
          <button class="xyz-btn" data-key="z">Z</button>
        </div>
        <div class="abc-row">
          <button class="abc-btn" data-key="a">A</button>
          <button class="abc-btn" data-key="b">B</button>
          <button class="abc-btn" data-key="c">C</button>
        </div>
      </div>
    </div>
    <div id="bottom-tools">
      <button class="tool-btn active" id="dbg-toggle-btn">📟 LOGS (ON)</button>
      <button class="tool-btn" id="sound-btn">🔊 SONIDO</button>
      <button class="tool-btn" id="reset-btn">🔄 REINICIAR</button>
    </div>
  </div>
</div>
<script>__SEGA_SCRIPT__</script>
</body>`;

  const script = `
(function(){
  const ENGINE_GZIP_B64 = "${options.engineGzipB64}";
  const ROM_GZIP_B64 = "${options.romGzipB64}";
  const ROM_FILE_NAME = "${options.romFileName}";

  const bootCv = document.getElementById("boot-cv");
  const bootCtx = bootCv.getContext("2d");
  const statusLed = document.getElementById("status-led");
  const statusTxt = document.getElementById("status-text");
  const dbgState = document.getElementById("dbg-state");
  const dbgCart = document.getElementById("dbg-cart");
  const dbgPanel = document.getElementById("debug-panel");
  const dbgLog = document.getElementById("debug-log");
  const tFps = document.getElementById("t-fps");
  const tHdr = document.getElementById("t-hdr");
  const tPad = document.getElementById("t-pad");

  const logHistory = [];
  const bootLines = [];
  let emuReady = false;
  const activeKeys = new Set();

  function logSys(msg, cls) {
    const now = new Date();
    const ts = String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0") + "." + String(now.getMilliseconds()).padStart(3, "0").slice(0, 2);
    const fullLine = "[" + ts + "] " + msg;
    logHistory.push(fullLine);
    if (logHistory.length > 100) logHistory.shift();

    const div = document.createElement("div");
    div.className = "log-line " + (cls || "");
    div.textContent = fullLine;
    dbgLog.appendChild(div);
    while (dbgLog.childNodes.length > 60) dbgLog.removeChild(dbgLog.firstChild);
    dbgLog.scrollTop = dbgLog.scrollHeight;

    if (!emuReady && bootCtx) {
      bootLines.push(msg.slice(0, 38));
      if (bootLines.length > 9) bootLines.shift();
      bootCtx.fillStyle = "#050710";
      bootCtx.fillRect(0, 0, 320, 224);
      bootCtx.fillStyle = "#3b82f6";
      bootCtx.font = "bold 11px monospace";
      bootCtx.fillText("SEGA MEGA DRIVE • LUFEROS V5.0", 12, 24);
      bootCtx.fillStyle = "#facc15";
      bootCtx.font = "bold 9px monospace";
      bootCtx.fillText("MOTOROLA 68000 + Z80 + YM2612 BIOS", 12, 40);
      bootCtx.fillStyle = "#4ade80";
      bootCtx.font = "9px monospace";
      for (let i = 0; i < bootLines.length; i++) {
        bootCtx.fillText("> " + bootLines[i], 10, 60 + i * 16);
      }
    }
  }

  window.addEventListener("error", function(e) {
    statusLed.className = "err";
    statusTxt.textContent = "FAULT";
    dbgState.textContent = "❌ 68000 EXCEPTION";
    logSys("ERR: " + (e.message || "Error desconocido"), "log-err");
  });

  async function gunzipBase64ToBytes(b64) {
    const bin = atob(b64);
    const compressed = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) compressed[i] = bin.charCodeAt(i);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }

  function parseSegaHeader(u8) {
    let consoleType = "SEGA GENESIS";
    let domesticName = "";
    if (u8.length >= 0x200) {
      let sysRaw = "";
      for (let i = 0x100; i < 0x110; i++) {
        if (u8[i] >= 32 && u8[i] <= 126) sysRaw += String.fromCharCode(u8[i]);
      }
      if (sysRaw.trim()) consoleType = sysRaw.trim();
      for (let i = 0x150; i < 0x180; i++) {
        if (u8[i] >= 32 && u8[i] <= 126) domesticName += String.fromCharCode(u8[i]);
      }
    }
    return {
      consoleType: consoleType.slice(0, 16),
      gameTitle: domesticName.trim() || ROM_FILE_NAME,
      sizeKb: Math.round(u8.length / 1024)
    };
  }

  const KEY_SPEC = {
    up: { code: "ArrowUp", key: "ArrowUp", keyCode: 38 },
    down: { code: "ArrowDown", key: "ArrowDown", keyCode: 40 },
    left: { code: "ArrowLeft", key: "ArrowLeft", keyCode: 37 },
    right: { code: "ArrowRight", key: "ArrowRight", keyCode: 39 },
    start: { code: "Enter", key: "Enter", keyCode: 13 },
    mode: { code: "KeyZ", key: "z", keyCode: 90 },
    a: { code: "KeyA", key: "a", keyCode: 65 },
    b: { code: "KeyS", key: "s", keyCode: 83 },
    c: { code: "KeyD", key: "d", keyCode: 68 },
    x: { code: "KeyQ", key: "q", keyCode: 81 },
    y: { code: "KeyW", key: "w", keyCode: 87 },
    z: { code: "KeyE", key: "e", keyCode: 69 }
  };

  function dispatchSyntheticKey(type, spec) {
    try {
      const ev = new KeyboardEvent(type, {
        key: spec.key,
        code: spec.code,
        keyCode: spec.keyCode,
        which: spec.keyCode,
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(ev, "keyCode", { get: function() { return spec.keyCode; } });
      Object.defineProperty(ev, "which", { get: function() { return spec.keyCode; } });
      document.dispatchEvent(ev);
      window.dispatchEvent(ev);
    } catch (e) {}
  }

  function updatePadTelemetry() {
    const list = Array.from(activeKeys);
    tPad.textContent = list.length ? "PAD: " + list.join("+").toUpperCase() : "PAD: IDLE";
  }

  function setupControls() {
    document.querySelectorAll("[data-key]").forEach(function(btn) {
      const k = btn.getAttribute("data-key");
      const spec = KEY_SPEC[k];
      if (!spec) return;
      const onDown = function(e) {
        if (e && e.cancelable) e.preventDefault();
        btn.classList.add("touching");
        activeKeys.add(k);
        updatePadTelemetry();
        dispatchSyntheticKey("keydown", spec);
      };
      const onUp = function(e) {
        if (e && e.cancelable) e.preventDefault();
        btn.classList.remove("touching");
        activeKeys.delete(k);
        updatePadTelemetry();
        dispatchSyntheticKey("keyup", spec);
      };
      btn.addEventListener("touchstart", onDown, { passive: false });
      btn.addEventListener("touchend", onUp, { passive: false });
      btn.addEventListener("touchcancel", onUp, { passive: false });
      btn.addEventListener("mousedown", onDown);
      btn.addEventListener("mouseup", onUp);
      btn.addEventListener("mouseleave", onUp);
    });

    const dbgBtn = document.getElementById("dbg-toggle-btn");
    dbgBtn.addEventListener("click", function(e) {
      e.preventDefault();
      const hidden = dbgPanel.classList.toggle("collapsed");
      dbgBtn.classList.toggle("active", !hidden);
      dbgBtn.textContent = hidden ? "📟 LOGS (OFF)" : "📟 LOGS (ON)";
    });

    document.getElementById("btn-clear-log").addEventListener("click", function(e) {
      e.preventDefault();
      dbgLog.innerHTML = "";
      logSys("Consola de logs limpiada.", "log-sys");
    });

    document.getElementById("btn-copy-log").addEventListener("click", function(e) {
      e.preventDefault();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(logHistory.join("\\n")).then(function() {
          logSys("Logs copiados OK.", "log-ok");
        }).catch(function() {});
      }
    });

    document.getElementById("sound-btn").addEventListener("click", function(e) {
      e.preventDefault();
      if (typeof window.toggleSoundGenesis === "function") {
        window.toggleSoundGenesis();
        logSys("Audio YM2612 conmutado.", "log-sys");
      }
    });

    document.getElementById("reset-btn").addEventListener("click", function(e) {
      e.preventDefault();
      if (typeof window.resetGenesis === "function") {
        window.resetGenesis();
        logSys("Reset M68000 ejecutado OK.", "log-warn");
      }
    });
  }

  let rafFrames = 0;
  let lastFpsStamp = performance.now();

  function startFpsMonitor() {
    function tick(now) {
      requestAnimationFrame(tick);
      rafFrames++;
      if (now - lastFpsStamp >= 500) {
        const fps = Math.min(60, Math.round((rafFrames * 1000) / (now - lastFpsStamp)));
        rafFrames = 0;
        lastFpsStamp = now;
        if (emuReady) tFps.textContent = "FPS: " + fps;
      }
    }
    requestAnimationFrame(tick);
  }

  async function bootSegaSystem() {
    try {
      logSys("Iniciando LuferOS SEGA Genesis 16-Bit V: 5.0", "log-sys");
      setupControls();
      startFpsMonitor();

      logSys("Descomprimiendo núcleo PicoDrive M68K/Z80...", "");
      const engineBytes = await gunzipBase64ToBytes(ENGINE_GZIP_B64);
      const engineJsText = new TextDecoder("utf-8").decode(engineBytes);
      const scriptEl = document.createElement("script");
      scriptEl.text = engineJsText;
      document.head.appendChild(scriptEl);

      if (typeof window.embedGenesis !== "function") {
        throw new Error("El núcleo embedGenesis no se registró en window.");
      }
      logSys("Núcleo PicoDrive cargado (" + Math.round(engineBytes.length / 1024) + " KB).", "log-ok");

      logSys("Descomprimiendo cartucho SEGA...", "");
      const romBytes = await gunzipBase64ToBytes(ROM_GZIP_B64);
      const hdr = parseSegaHeader(romBytes);
      dbgCart.textContent = hdr.gameTitle.slice(0, 18) + " (" + hdr.sizeKb + "KB)";
      tHdr.textContent = hdr.consoleType.slice(0, 12);
      logSys("Cartucho: [" + hdr.gameTitle + "] | " + hdr.sizeKb + "KB | " + hdr.consoleType, "log-sys");

      const romArrayBuffer = romBytes.buffer.slice(romBytes.byteOffset, romBytes.byteOffset + romBytes.byteLength);

      window.embedGenesis({
        container: "game",
        name: ROM_FILE_NAME,
        rom: romArrayBuffer,
        soundEnabled: true,
        showMobileControls: false,
        backText: "BACK",
        soundText: "SOUND",
        loadText: "LOAD",
        saveText: "SAVE",
        player1: {
          up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
          start: "Enter", mode: "KeyZ",
          a: "KeyA", b: "KeyS", c: "KeyD", x: "KeyQ", y: "KeyW", z: "KeyE"
        },
        player2: {
          up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL",
          start: "KeyH", mode: "KeyV",
          a: "KeyB", b: "KeyN", c: "KeyM", x: "KeyU", y: "KeyO", z: "KeyP"
        },
        cbStarted: function() {
          emuReady = true;
          bootCv.style.display = "none";
          statusLed.className = "on";
          statusTxt.textContent = "16-BIT ON";
          dbgState.textContent = "🟢 SEGA 68000 • CORRIENDO";
          logSys("[READY] ¡Emulación SEGA Genesis activa a 60 FPS!", "log-ok");
        }
      });
    } catch (err) {
      statusLed.className = "err";
      statusTxt.textContent = "ERROR";
      dbgState.textContent = "❌ FALLO EN ARRANQUE";
      logSys("ERROR FATAL: " + (err && err.message ? err.message : String(err)), "log-err");
    }
  }

  bootSegaSystem();
})();`;

  return html
    .replace("__BEZEL_TITLE__", () => options.bezelTitle)
    .replace("__SEGA_SCRIPT__", () => script);
}

export default {
  name: ["sega", "genesis", "megadrive", "md", "sonic"],
  category: "group",
  description: "Emulador LuferOS SEGA Genesis / Mega Drive 16-Bit V: 5.0 con soporte .bin, .md, .smd, .gen y .zip.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    await react("🦔").catch(() => undefined);

    try {
      repairCachedSegaRomsOnDisk();

      const isInlineFallback = args.some((a) =>
        ["inline", "lite", "burbuja"].includes(a.toLowerCase()),
      );
      const cleanArgs = args.filter(
        (a) => !["inline", "lite", "burbuja"].includes(a.toLowerCase()),
      );
      const subCommand = String(cleanArgs[0] || "").toLowerCase();

      if (subCommand === "list" || subCommand === "lista") {
        const savedFiles = fs
          .readdirSync(CACHE_DIR)
          .filter((f) => /\.(bin|md|gen|smd|32x)$/i.test(f));

        if (!savedFiles.length) {
          return reply(
            `📂 No hay juegos de SEGA guardados aún. Responde a un archivo \`.bin\`, \`.md\`, \`.gen\` o \`.zip\` con \`${prefix}sega save <Nombre>\` o ejecuta \`${prefix}sega\` para cargar la ROM de demostración.`,
          );
        }

        const listTxt = savedFiles
          .map((f, idx) => {
            const sizeKb = Math.ceil(fs.statSync(path.join(CACHE_DIR, f)).size / 1024);
            return `${idx + 1}. \`${f.replace(/\.(bin|md|gen|smd|32x)$/i, "")}\` (${sizeKb} KB)`;
          })
          .join("\n");

        return reply(
          `╭〔 🦔 ${fytBold("LuferOS SEGA Genesis 16-Bit V: 5.0")} 〕⬣\n` +
            `${listTxt}\n` +
            `╰━━━━━━━━━━━━⬣\n` +
            `• Pantalla completa: \`${prefix}sega <Nombre>\`\n` +
            `• Modo compatible grupos: \`${prefix}sega inline <Nombre>\``,
        );
      }

      const engineGzipB64 = await getGzippedGenesisEngineB64();
      let romBuffer: Buffer | null = null;
      let romFileName = "game.bin";
      let displayTitle = "SEGA MEGA DRIVE";
      let customSaveName = "";
      let duplicateNotice = "";

      const quotedDoc = await downloadQuotedDocumentBuffer(msg);

      if (subCommand === "save" && cleanArgs[1]) {
        customSaveName = cleanArgs.slice(1).join(" ").trim();
      } else if (quotedDoc && cleanArgs.length > 0 && subCommand !== "save") {
        customSaveName = cleanArgs.join(" ").trim();
      }

      if (quotedDoc) {
        const extracted = extractSegaFromAnyBuffer(quotedDoc.buffer, quotedDoc.fileName);
        if (!extracted) {
          throw new Error(
            "El archivo adjunto no contiene una ROM de SEGA Genesis (.bin/.md/.gen/.smd) válida.",
          );
        }
        romBuffer = extracted.buffer;

        const originalBaseName = extracted.fileName.replace(/\.(bin|md|gen|smd|32x|zip)$/i, "").trim();
        const requestedName = customSaveName || originalBaseName;

        const duplicateRealName = checkForDuplicateSegaRom(romBuffer);
        if (duplicateRealName && duplicateRealName.toLowerCase() !== requestedName.toLowerCase()) {
          duplicateNotice = `⚠️ *LuferOS SEGA V: 5.0:* Este juego ya existe en memoria bajo el nombre \`${duplicateRealName}\`.`;
          displayTitle = `${duplicateRealName.toUpperCase()} • SEGA`;
          romFileName = `${duplicateRealName}.bin`;
        } else {
          const safeFileName = requestedName.replace(/[^a-zA-Z0-9._-]/g, "_") + ".bin";
          fs.writeFileSync(path.join(CACHE_DIR, safeFileName), romBuffer);
          displayTitle = `${requestedName.toUpperCase()} • SEGA`;
          romFileName = safeFileName;
        }
      } else if (subCommand === "save" && !quotedDoc) {
        return reply(
          `⚠️ Responde a un archivo \`.bin\`, \`.md\`, \`.gen\` o \`.zip\` con \`${prefix}sega save <Nombre>\` para guardarlo.`,
        );
      } else {
        const searchName = (customSaveName || cleanArgs.join(" ")).trim();
        const found = searchName ? getStoredSegaByName(searchName) : null;

        if (found) {
          romBuffer = found.buffer;
          displayTitle = `${found.realName.toUpperCase()} • SEGA`;
          romFileName = `${found.realName}.bin`;
        } else {
          let savedRoms = fs
            .readdirSync(CACHE_DIR)
            .filter((f) => /\.(bin|md|gen|smd|32x)$/i.test(f));

          if (!savedRoms.length) {
            await ensureDefaultDemoRom();
            savedRoms = fs
              .readdirSync(CACHE_DIR)
              .filter((f) => /\.(bin|md|gen|smd|32x)$/i.test(f));
          }

          if (!searchName && savedRoms.length > 0) {
            const preferred =
              savedRoms.find((f) => f.toLowerCase().includes("sonic")) || savedRoms[0];
            romBuffer = fs.readFileSync(path.join(CACHE_DIR, preferred));
            displayTitle = `${preferred.replace(/\.(bin|md|gen|smd|32x)$/i, "").toUpperCase()} • SEGA`;
            romFileName = preferred.replace(/\.(md|gen|smd)$/i, ".bin");
          } else {
            const available =
              savedRoms.map((f) => `\`${f.replace(/\.(bin|md|gen|smd|32x)$/i, "")}\``).join(", ") || "Ninguno";
            throw new Error(
              `No se encontró el juego "${searchName}".\n• *Juegos guardados:* ${available}\n• O responde a un archivo \`.zip\` / \`.bin\` / \`.md\` con \`${prefix}sega save <Nombre>\`.`,
            );
          }
        }
      }

      if (duplicateNotice) {
        await reply(duplicateNotice).catch(() => undefined);
      }

      const romGzipB64 = zlib.gzipSync(romBuffer, { level: 9 }).toString("base64");

      const HTML = buildSegaConsoleHtml({
        engineGzipB64,
        romGzipB64,
        romFileName,
        bezelTitle: displayTitle,
      });

      const uniqueResponseId = `LuferOS_SEGA_${randomUUID().replace(/-/g, "")}`;

      const data = isInlineFallback
        ? {
            response_id: uniqueResponseId,
            sections: [
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
                    trusted_sources: [],
                    payload: HTML,
                  },
                },
              },
            ],
          }
        : {
            response_id: uniqueResponseId,
            sections: [
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "GenAITextPrimitive",
                    text: `🦔 *LuferOS SEGA Genesis 16-Bit V: 5.0* • ${displayTitle}\n_Pulsa el botón inferior para abrir la consola SEGA. Si tu WhatsApp no muestra el botón, escribe:_ \`${prefix}sega inline ${cleanArgs.join(" ") || ""}\``,
                  },
                },
              },
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "GenAIBotProgressStatusPrimitive",
                    title: `🦔 LuferOS SEGA V: 5.0 (${displayTitle})`,
                    is_in_progress: true,
                  },
                },
              },
            ],
            embedded_screens: [
              {
                title: `LuferOS SEGA V: 5.0`,
                content: [
                  {
                    __typename: "FOAIDNixelButtonSheets",
                    tabs: [
                      {
                        id: "tab_0",
                        tab_header: "LuferOS SEGA V: 5.0",
                        sections: [
                          {
                            __typename: "GenAIUnifiedResponseSection",
                            view_model: {
                              __typename: "GenAISingleLayoutViewModel",
                              primitive: {
                                __typename: "GenAIaeacdsnwHtmlPrimitive",
                                payload: HTML,
                                url: "https://whatsapp.com",
                                trusted_sources: ["whatsapp.com", "example.com"],
                              },
                            },
                          },
                        ],
                        step_entries: [],
                      },
                    ],
                  },
                ],
              },
            ],
          };

      const msgId =
        typeof (sock as any).generateMessageTag === "function"
          ? await (sock as any).generateMessageTag()
          : randomUUID();

      await sock.relayMessage(
        from,
        {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: {
              messageDisclaimerText: "LuferOS SEGA Genesis 16-Bit Sys V: 5.0",
              richResponseSourcesMetadata: {},
            },
          },
          botForwardedMessage: {
            message: {
              richResponseMessage: {
                messageType: 1,
                unifiedResponse: {
                  data: Buffer.from(JSON.stringify(data)).toString("base64"),
                },
                contextInfo: {
                  forwardingScore: 1,
                  isForwarded: true,
                  forwardedAiBotMessageInfo: {
                    botJid: "13135550002@s.whatsapp.net",
                  },
                  forwardOrigin: 4,
                },
              },
            },
          },
        } as any,
        {
          messageId: msgId,
        },
      );

      await react("✅").catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(
        `❌ ${fytBold("LuferOS SEGA V: 5.0:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
