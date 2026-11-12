import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "gb_cache");
const ENGINE_CACHE_FILE = path.join(CACHE_DIR, "luferos_gbc_inline_v6.js");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

for (const oldFile of [
  "gb_engine.min.js",
  "gb_runner.min.js",
  "gb_core.min.js",
  "luferos_gbc_engine_v4.js",
  "luferos_gbc_engine_v5.js",
]) {
  const oldPath = path.join(CACHE_DIR, oldFile);
  if (fs.existsSync(oldPath)) {
    try {
      fs.unlinkSync(oldPath);
    } catch {}
  }
}

const GBC_CORE_SOURCES = [
  {
    base64: "https://cdn.jsdelivr.net/gh/taisel/GameBoy-Online@master/js/other/base64.js",
    core: "https://cdn.jsdelivr.net/gh/taisel/GameBoy-Online@master/js/GameBoyCore.js",
    io: "https://cdn.jsdelivr.net/gh/taisel/GameBoy-Online@master/js/GameBoyIO.js",
  },
  {
    base64: "https://raw.githubusercontent.com/taisel/GameBoy-Online/master/js/other/base64.js",
    core: "https://raw.githubusercontent.com/taisel/GameBoy-Online/master/js/GameBoyCore.js",
    io: "https://raw.githubusercontent.com/taisel/GameBoy-Online/master/js/GameBoyIO.js",
  },
];

let cachedInlineEngineCode = "";

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

function isValidGbRom(buf: Buffer): boolean {
  if (!Buffer.isBuffer(buf) || buf.length < 16384) return false;
  if (isZipBuffer(buf)) return false;
  return true;
}

function extractRomFromZipBuffer(zipBuf: Buffer): { buffer: Buffer; fileName: string } | null {
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
      const fnLen = zipBuf.readUInt16LE(ptr + 28);
      const extraLen = zipBuf.readUInt16LE(ptr + 30);
      const commentLen = zipBuf.readUInt16LE(ptr + 32);
      const localOffset = zipBuf.readUInt32LE(ptr + 42);
      const entryName = zipBuf.toString("utf8", ptr + 46, ptr + 46 + fnLen);

      ptr += 46 + fnLen + extraLen + commentLen;

      if (entryName.endsWith("/")) continue;
      if (localOffset + 30 > zipBuf.length) continue;
      if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) continue;

      const lFnLen = zipBuf.readUInt16LE(localOffset + 26);
      const lExtraLen = zipBuf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lFnLen + lExtraLen;
      const dataEnd = dataStart + compSize;

      if (compSize === 0 || dataEnd > zipBuf.length) continue;

      const slice = zipBuf.subarray(dataStart, dataEnd);
      let outBuf: Buffer | null = null;

      try {
        if (method === 0) outBuf = Buffer.from(slice);
        else if (method === 8) outBuf = zlib.inflateRawSync(slice);
      } catch {}

      if (outBuf && isValidGbRom(outBuf)) {
        return { buffer: outBuf, fileName: path.basename(entryName) };
      }
    }
  }

  let offset = 0;
  while (offset + 30 <= zipBuf.length) {
    if (zipBuf.readUInt32LE(offset) !== 0x04034b50) break;

    const method = zipBuf.readUInt16LE(offset + 8);
    const compSize = zipBuf.readUInt32LE(offset + 18);
    const fnLen = zipBuf.readUInt16LE(offset + 26);
    const extraLen = zipBuf.readUInt16LE(offset + 28);
    const entryName = zipBuf.toString("utf8", offset + 30, offset + 30 + fnLen);
    const dataStart = offset + 30 + fnLen + extraLen;
    const dataEnd = dataStart + compSize;

    if (compSize === 0 || dataEnd > zipBuf.length) break;

    const slice = zipBuf.subarray(dataStart, dataEnd);
    let outBuf: Buffer | null = null;

    try {
      if (method === 0) outBuf = Buffer.from(slice);
      else if (method === 8) outBuf = zlib.inflateRawSync(slice);
    } catch {}

    if (outBuf && isValidGbRom(outBuf)) {
      return { buffer: outBuf, fileName: path.basename(entryName || "game.gbc") };
    }

    offset = dataEnd;
  }

  return null;
}

function extractRomFromAnyBuffer(rawBuf: Buffer, originalName = "game.gbc"): { buffer: Buffer; fileName: string } | null {
  if (isZipBuffer(rawBuf)) {
    return extractRomFromZipBuffer(rawBuf);
  }
  if (isValidGbRom(rawBuf)) {
    return { buffer: rawBuf, fileName: originalName };
  }
  return null;
}

function repairCachedRomsOnDisk() {
  if (!fs.existsSync(CACHE_DIR)) return;
  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(gb|gbc)$/i.test(f));
  for (const f of files) {
    const fullPath = path.join(CACHE_DIR, f);
    try {
      const raw = fs.readFileSync(fullPath);
      if (isZipBuffer(raw)) {
        const extracted = extractRomFromZipBuffer(raw);
        if (extracted && isValidGbRom(extracted.buffer)) {
          fs.writeFileSync(fullPath, extracted.buffer);
        }
      }
    } catch {}
  }
}

async function fetchTextWithTimeout(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function compactJsBundle(rawCode: string): string {
  const withoutBlockComments = rawCode.replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = withoutBlockComments.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    out.push(trimmed);
  }
  return out.join("\n");
}

async function getInlineGbcEngineCode(): Promise<string> {
  if (cachedInlineEngineCode) return cachedInlineEngineCode;

  if (fs.existsSync(ENGINE_CACHE_FILE)) {
    const diskCode = fs.readFileSync(ENGINE_CACHE_FILE, "utf8");
    if (diskCode.includes("GameBoyCore") && diskCode.length > 50000) {
      cachedInlineEngineCode = diskCode;
      return cachedInlineEngineCode;
    }
  }

  for (const src of GBC_CORE_SOURCES) {
    try {
      const [b64Js, coreJs, ioJs] = await Promise.all([
        fetchTextWithTimeout(src.base64, 12000),
        fetchTextWithTimeout(src.core, 18000),
        fetchTextWithTimeout(src.io, 12000),
      ]);

      if (coreJs.includes("GameBoyCore")) {
        const compacted = compactJsBundle(`${b64Js}\n;\n${ioJs}\n;\n${coreJs}\n`);
        fs.writeFileSync(ENGINE_CACHE_FILE, compacted, "utf8");
        cachedInlineEngineCode = compacted;
        return cachedInlineEngineCode;
      }
    } catch {}
  }

  throw new Error("No se pudo descargar el núcleo GameBoyCore.");
}

function getStoredRomByName(nameKey: string): { buffer: Buffer; realName: string } | null {
  repairCachedRomsOnDisk();
  const cleanKey = nameKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanKey || !fs.existsSync(CACHE_DIR)) return null;

  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(gb|gbc)$/i.test(f));

  for (const f of files) {
    const baseName = f.replace(/\.(gb|gbc)$/i, "");
    const cleanBase = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanBase === cleanKey) {
      const buf = fs.readFileSync(path.join(CACHE_DIR, f));
      const extracted = extractRomFromAnyBuffer(buf, f);
      if (extracted) return { buffer: extracted.buffer, realName: baseName };
    }
  }

  for (const f of files) {
    const baseName = f.replace(/\.(gb|gbc)$/i, "");
    const cleanBase = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanBase.includes(cleanKey) || cleanKey.includes(cleanBase)) {
      const buf = fs.readFileSync(path.join(CACHE_DIR, f));
      const extracted = extractRomFromAnyBuffer(buf, f);
      if (extracted) return { buffer: extracted.buffer, realName: baseName };
    }
  }

  return null;
}

function checkForDuplicateRom(newBuf: Buffer): string | null {
  repairCachedRomsOnDisk();
  if (!fs.existsSync(CACHE_DIR)) return null;
  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(gb|gbc)$/i.test(f));

  for (const f of files) {
    const p = path.join(CACHE_DIR, f);
    try {
      const existingBuf = fs.readFileSync(p);
      if (existingBuf.length === newBuf.length && existingBuf.equals(newBuf)) {
        return f.replace(/\.(gb|gbc)$/i, "");
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
      return { buffer, fileName: String(doc.fileName || "game.gbc") };
    }
  }
  return null;
}

function buildGbcConsoleHtml(options: {
  inlineEngineCode: string;
  romGzipB64: string;
  banner: string;
  bezelTitle: string;
}): string {
  const template = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none}
html,body{width:100%;min-height:100%;background:#0e0b16}
body{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;background:#0e0b16}
#gbc-case{width:min(98vw,520px);max-width:520px;margin:0 auto;background:linear-gradient(165deg,#7e22ce 0%,#6b21a8 48%,#4c1d95 100%);border:3px solid #2e1065;border-radius:18px 18px 54px 18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 40px rgba(0,0,0,.78),inset 0 2px 1px rgba(255,255,255,.32);transform:translateZ(0);contain:content}
#gbc-top-bar{text-align:center;padding:6px 10px 5px;color:#fef08a;font-size:clamp(10px,2.2vw,13px);font-weight:900;letter-spacing:1.4px;text-shadow:0 2px 0 #2e1065;background:linear-gradient(90deg,#4c1d95,#7e22ce 50%,#4c1d95);border-bottom:2px solid #facc15}
#lens-outer{width:100%;padding:10px 14px 8px;display:flex;flex-direction:column;align-items:center}
#lens-bezel{width:100%;background:linear-gradient(180deg,#27272a 0%,#18181b 100%);border:3px solid #09090b;border-radius:14px 14px 30px 14px;padding:8px 12px 10px;box-shadow:inset 0 2px 5px rgba(255,255,255,.12),0 6px 14px rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center}
#lens-top{width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
.pwr-wrap{display:flex;align-items:center;gap:5px}
#status-led{width:8px;height:8px;border-radius:50%;background:#facc15;box-shadow:0 0 8px #facc15;transition:all .2s}
#status-led.on{background:#22c55e;box-shadow:0 0 9px #22c55e}
#status-led.err{background:#ef4444;box-shadow:0 0 9px #ef4444}
.pwr-txt{font-size:8px;font-weight:900;color:#a1a1aa;letter-spacing:1px}
.rom-tag{font-size:9px;font-weight:900;color:#e4e4e7;letter-spacing:1px;text-transform:uppercase;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#screen-container{position:relative;width:92%;aspect-ratio:160/144;background:#000;border:3px solid #09090b;border-radius:6px;overflow:hidden;display:flex;justify-content:center;align-items:center;box-shadow:inset 0 0 12px rgba(0,0,0,.65)}
canvas#gb{width:100%;height:100%;object-fit:fill;display:block;image-rendering:pixelated;image-rendering:crisp-edges}
#lens-logo{margin-top:6px;display:flex;align-items:baseline;gap:6px;font-family:"Arial Black",Impact,sans-serif}
.gb-word{font-size:13px;font-style:italic;font-weight:900;color:#d4d4d8;letter-spacing:.8px}
.color-word{font-size:13px;font-weight:900;letter-spacing:1px}
.c1{color:#f43f5e}.c2{color:#a855f7}.c3{color:#22c55e}.c4{color:#eab308}.c5{color:#06b6d4}
#error{display:none;width:92%;margin:6px auto 0;padding:5px 8px;background:#450a0a;border:1px solid #ef4444;border-radius:6px;color:#fecaca;font-size:10px;text-align:center}
#nintendo-badge{margin:2px auto 4px;padding:2px 14px;border:1.5px solid rgba(255,255,255,.22);border-radius:999px;font-size:9px;font-weight:900;letter-spacing:2px;color:rgba(255,255,255,.7);text-transform:uppercase}
#pad-area{width:100%;padding:8px 18px 18px;display:flex;flex-direction:column;gap:14px;position:relative}
#main-controls{width:100%;display:flex;justify-content:space-between;align-items:center;padding:4px 4px}
#dpad{position:relative;width:136px;height:136px;flex-shrink:0}
.dpad-cross-v{position:absolute;left:45px;top:4px;width:46px;height:128px;background:#18181b;border-radius:6px;box-shadow:0 5px 0 #09090b,inset 0 1px 1px rgba(255,255,255,.15)}
.dpad-cross-h{position:absolute;left:4px;top:45px;width:128px;height:46px;background:#18181b;border-radius:6px;box-shadow:0 5px 0 #09090b,inset 0 1px 1px rgba(255,255,255,.15)}
.dpad-btn{position:absolute;width:46px;height:46px;border:none;background:transparent;color:#a1a1aa;font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2;border-radius:6px}
.dpad-btn.touching{background:rgba(250,204,21,.28);color:#fef08a;transform:translateY(2px)}
#u{left:45px;top:4px}
#d{left:45px;bottom:4px}
#l{left:4px;top:45px}
#r{right:4px;top:45px}
#dpad-pivot{position:absolute;left:53px;top:53px;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle,#09090b 20%,#27272a 100%);z-index:1;pointer-events:none}
#ab-cluster{position:relative;width:144px;height:82px;background:rgba(0,0,0,.18);border-radius:42px;transform:rotate(-22deg);display:flex;align-items:center;justify-content:space-around;padding:0 10px;box-shadow:inset 0 2px 5px rgba(0,0,0,.45);border:1.5px solid rgba(255,255,255,.12)}
.ab-btn{width:54px;height:54px;border-radius:50%;border:2px solid #09090b;background:radial-gradient(circle at 32% 28%,#3f3f46,#18181b 75%);color:#e4e4e7;font-size:19px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 0 #09090b,0 6px 12px rgba(0,0,0,.55);cursor:pointer;transform:rotate(22deg)}
.ab-btn.touching{transform:rotate(22deg) translateY(3px) scale(.95);box-shadow:0 2px 0 #09090b;background:radial-gradient(circle at 32% 28%,#ef4444,#991b1b 75%);color:#fff}
#select-start-row{width:100%;display:flex;justify-content:center;align-items:center;gap:28px;margin-top:4px}
.meta-wrap{display:flex;flex-direction:column;align-items:center;gap:5px}
.pill-rubber{width:58px;height:18px;border-radius:12px;border:1.5px solid #09090b;background:linear-gradient(180deg,#3f3f46,#18181b);box-shadow:0 3px 0 #09090b,0 4px 6px rgba(0,0,0,.45);cursor:pointer;transform:rotate(-24deg)}
.pill-rubber.touching{transform:rotate(-24deg) translateY(2px);background:#facc15;box-shadow:0 1px 0 #09090b}
.meta-lbl{font-size:9px;font-weight:900;letter-spacing:1.4px;color:#d4d4d8;margin-top:4px;text-shadow:0 1px 0 #2e1065}
#bottom-tools{width:100%;display:flex;justify-content:center;gap:10px;margin-top:4px}
.tool-btn{border:1.5px solid #2e1065;border-radius:8px;background:rgba(24,24,27,.78);color:#fef08a;padding:6px 12px;font-weight:900;font-size:10px;letter-spacing:.6px;cursor:pointer;box-shadow:0 2px 0 #09090b}
.tool-btn:active,.tool-btn.active{background:#facc15;color:#18181b;transform:translateY(1px)}
</style>
<body>
<div id="gbc-case">
  <div id="gbc-top-bar">${options.banner}</div>
  <div id="lens-outer">
    <div id="lens-bezel">
      <div id="lens-top">
        <div class="pwr-wrap">
          <div id="status-led"></div>
          <span class="pwr-txt" id="status-text">BOOT</span>
        </div>
        <div class="rom-tag">${options.bezelTitle}</div>
      </div>
      <div id="screen-container">
        <canvas id="gb" width="160" height="144"></canvas>
      </div>
      <div id="lens-logo">
        <span class="gb-word">GAME BOY</span>
        <span class="color-word"><span class="c1">C</span><span class="c2">O</span><span class="c3">L</span><span class="c4">O</span><span class="c5">R</span></span>
      </div>
    </div>
    <div id="error"></div>
  </div>

  <div id="nintendo-badge">LuferOS • Nintendo</div>

  <div id="pad-area">
    <div id="main-controls">
      <div id="dpad">
        <div class="dpad-cross-v"></div>
        <div class="dpad-cross-h"></div>
        <div id="dpad-pivot"></div>
        <button class="dpad-btn" id="u" data-key="up">▲</button>
        <button class="dpad-btn" id="l" data-key="left">◀</button>
        <button class="dpad-btn" id="r" data-key="right">▶</button>
        <button class="dpad-btn" id="d" data-key="down">▼</button>
      </div>

      <div id="ab-cluster">
        <button class="ab-btn" id="btn-b" data-key="b">B</button>
        <button class="ab-btn" id="btn-a" data-key="a">A</button>
      </div>
    </div>

    <div id="select-start-row">
      <div class="meta-wrap">
        <button class="pill-rubber" id="sel" data-key="select" aria-label="Select"></button>
        <span class="meta-lbl">SELECT</span>
      </div>
      <div class="meta-wrap">
        <button class="pill-rubber" id="st" data-key="start" aria-label="Start"></button>
        <span class="meta-lbl">START</span>
      </div>
    </div>

    <div id="bottom-tools">
      <button class="tool-btn" id="turbo-btn">⚡ TURBO 1X</button>
      <button class="tool-btn" id="reset-btn">🔄 REINICIAR</button>
    </div>
  </div>
</div>
<script>__GbcEmulator__</script>
</body>`;

  const bootstrap = `
var memStore = {};
window.cout = function(){};
window.findValue = function(k) {
  try {
    if (k in memStore) return memStore[k];
    var v = localStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return memStore[k] || null;
  }
};
window.setValue = function(k, v) {
  memStore[k] = v;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
};
window.deleteValue = function(k) {
  delete memStore[k];
  try { localStorage.removeItem(k); } catch (e) {}
};
${options.inlineEngineCode}
(function(){
  const ROM_GZIP_B64 = "${options.romGzipB64}";

  const canvas = document.getElementById("gb");
  const statusLed = document.getElementById("status-led");
  const statusTxt = document.getElementById("status-text");
  const errBox = document.getElementById("error");
  let loadedRomBinary = "";
  let turboOn = false;

  const AUDIO_RING_SIZE = 16384;
  const AUDIO_RING_MASK = AUDIO_RING_SIZE - 1;
  const ringL = new Float32Array(AUDIO_RING_SIZE);
  const ringR = new Float32Array(AUDIO_RING_SIZE);
  let ringWrite = 0;
  let ringRead = 0;
  let webAudioCtx = null;
  let emulatorSampleRate = 70000;

  function unlockWebAudio() {
    try {
      if (!webAudioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        webAudioCtx = new AC();
        const node = webAudioCtx.createScriptProcessor(2048, 0, 2);
        node.onaudioprocess = function(e) {
          const outL = e.outputBuffer.getChannelData(0);
          const outR = e.outputBuffer.getChannelData(1);
          for (let i = 0; i < outL.length; i++) {
            if (ringRead !== ringWrite) {
              outL[i] = ringL[ringRead];
              outR[i] = ringR[ringRead];
              ringRead = (ringRead + 1) & AUDIO_RING_MASK;
            } else {
              outL[i] = 0;
              outR[i] = 0;
            }
          }
        };
        node.connect(webAudioCtx.destination);
      }
      if (webAudioCtx && webAudioCtx.state === "suspended") {
        webAudioCtx.resume();
      }
    } catch (e) {}
  }

  window.XAudioServer = function(channels, sampleRate, minBuf, maxBuf, underRunCb, volume) {
    emulatorSampleRate = sampleRate || 70000;
    this.vol = typeof volume === "number" ? volume : 1.0;
  };
  window.XAudioServer.prototype.pushStereoSamples = function(buffer, length) {
    const outRate = webAudioCtx ? webAudioCtx.sampleRate : 44100;
    const ratio = emulatorSampleRate / outRate;
    const totalFrames = (length || buffer.length) >> 1;
    let srcFrame = 0;
    while (srcFrame < totalFrames) {
      const idx = (srcFrame | 0) << 1;
      const nextWrite = (ringWrite + 1) & AUDIO_RING_MASK;
      if (nextWrite !== ringRead) {
        ringL[ringWrite] = (buffer[idx] || 0) * 0.5 * this.vol;
        ringR[ringWrite] = (buffer[idx + 1] || 0) * 0.5 * this.vol;
        ringWrite = nextWrite;
      }
      srcFrame += ratio;
    }
  };
  window.XAudioServer.prototype.writeAudioNoCallback = function(buffer, length) {
    this.pushStereoSamples(buffer, length);
  };
  window.XAudioServer.prototype.writeAudio = function(buffer, length) {
    this.pushStereoSamples(buffer, length);
  };
  window.XAudioServer.prototype.remainingBuffer = function() {
    return (ringWrite - ringRead) & AUDIO_RING_MASK;
  };
  window.XAudioServer.prototype.executeCallback = function() {};
  window.XAudioServer.prototype.changeVolume = function(v) {
    this.vol = v;
  };

  function showErr(msg) {
    statusLed.className = "err";
    statusTxt.textContent = "ERR";
    errBox.style.display = "block";
    errBox.textContent = msg;
  }

  async function gunzipBase64(b64) {
    const bin = atob(b64);
    const compressed = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) compressed[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();
    const resp = new Response(ds.readable);
    const ab = await resp.arrayBuffer();
    return new Uint8Array(ab);
  }

  function uint8ToBinaryString(u8) {
    const chunks = [];
    const step = 8192;
    for (let i = 0; i < u8.length; i += step) {
      chunks.push(String.fromCharCode.apply(null, u8.subarray(i, i + step)));
    }
    return chunks.join("");
  }

  const releaseTimers = {};

  function pressGbKey(keyName, el) {
    unlockWebAudio();
    if (el) el.classList.add("touching");
    if (releaseTimers[keyName]) {
      clearTimeout(releaseTimers[keyName]);
      delete releaseTimers[keyName];
    }
    try {
      GameBoyKeyDown(keyName);
    } catch (e) {}
  }

  function releaseGbKey(keyName, el) {
    if (el) el.classList.remove("touching");
    releaseTimers[keyName] = setTimeout(function() {
      try {
        GameBoyKeyUp(keyName);
      } catch (e) {}
      delete releaseTimers[keyName];
    }, 45);
  }

  function setupControls() {
    document.querySelectorAll("[data-key]").forEach(function(btn) {
      const keyName = btn.getAttribute("data-key");
      const onDown = function(e) {
        if (e && e.cancelable) e.preventDefault();
        pressGbKey(keyName, btn);
      };
      const onUp = function(e) {
        if (e && e.cancelable) e.preventDefault();
        releaseGbKey(keyName, btn);
      };
      btn.addEventListener("touchstart", onDown, { passive: false });
      btn.addEventListener("touchend", onUp, { passive: false });
      btn.addEventListener("touchcancel", onUp, { passive: false });
      btn.addEventListener("mousedown", onDown);
      btn.addEventListener("mouseup", onUp);
      btn.addEventListener("mouseleave", onUp);
    });

    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function(e) {
        e.preventDefault();
        unlockWebAudio();
        if (loadedRomBinary) {
          start(canvas, loadedRomBinary);
        }
      });
    }

    const turboBtn = document.getElementById("turbo-btn");
    if (turboBtn) {
      turboBtn.addEventListener("click", function(e) {
        e.preventDefault();
        unlockWebAudio();
        turboOn = !turboOn;
        turboBtn.classList.toggle("active", turboOn);
        turboBtn.textContent = turboOn ? "⚡ TURBO 2X" : "⚡ TURBO 1X";
        if (window.gameboy && typeof window.gameboy.setSpeed === "function") {
          window.gameboy.setSpeed(turboOn ? 2.0 : 1.0);
        }
      });
    }

    const kbMap = {
      ArrowUp: "up", KeyW: "up",
      ArrowDown: "down", KeyS: "down",
      ArrowLeft: "left", KeyA: "left",
      ArrowRight: "right", KeyD: "right",
      KeyK: "a", KeyZ: "a", Space: "a",
      KeyJ: "b", KeyX: "b", ShiftLeft: "b",
      Enter: "start",
      Tab: "select", Backspace: "select"
    };

    window.addEventListener("keydown", function(e) {
      const k = kbMap[e.code];
      if (k) {
        e.preventDefault();
        unlockWebAudio();
        GameBoyKeyDown(k);
      }
    });

    window.addEventListener("keyup", function(e) {
      const k = kbMap[e.code];
      if (k) {
        e.preventDefault();
        GameBoyKeyUp(k);
      }
    });
  }

  async function bootGbc() {
    try {
      window.cout = function(){};
      settings[0] = true;
      settings[1] = false;
      settings[2] = false;
      settings[3] = 1.0;
      settings[4] = true;
      settings[5] = false;
      settings[6] = 8;
      settings[7] = 10;
      settings[8] = 20;
      settings[9] = false;
      settings[10] = false;
      settings[11] = false;
      settings[12] = [true, true, true, true];
      settings[13] = false;

      setupControls();
      const romBytes = await gunzipBase64(ROM_GZIP_B64);
      loadedRomBinary = uint8ToBinaryString(romBytes);
      start(canvas, loadedRomBinary);
      statusLed.className = "on";
      statusTxt.textContent = "POWER";
    } catch (err) {
      showErr("Error GBC: " + (err && err.message ? err.message : String(err)));
    }
  }

  bootGbc();
})();`;

  return template.replace("__GbcEmulator__", () => bootstrap);
}

export default {
  name: ["gb", "gbc", "gameboy"],
  category: "group",
  description: "Emulador LuferOS Game Boy / Game Boy Color real con soporte .gb, .gbc y .zip.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    await react("🎮").catch(() => undefined);

    try {
      repairCachedRomsOnDisk();

      const subCommand = String(args[0] || "").toLowerCase();

      if (subCommand === "list" || subCommand === "lista") {
        const savedFiles = fs
          .readdirSync(CACHE_DIR)
          .filter((f) => /\.(gb|gbc)$/i.test(f));

        if (!savedFiles.length) {
          return reply("📂 No hay juegos guardados. Responde a un archivo `.zip`, `.gb` o `.gbc` con `.gbc save <Nombre>`.");
        }

        const listTxt = savedFiles
          .map((f, idx) => {
            const sizeKb = Math.ceil(fs.statSync(path.join(CACHE_DIR, f)).size / 1024);
            return `${idx + 1}. \`${f.replace(/\.(gb|gbc)$/i, "")}\` (${sizeKb} KB)`;
          })
          .join("\n");

        return reply(
          `╭〔 🎮 ${fytBold("JUEGOS EN MEMORIA LUFEROS GBC")} 〕⬣\n` +
            `${listTxt}\n` +
            `╰━━━━━━━━━━━━⬣\n` +
            `Usa \`${prefix}gbc <Nombre>\` para jugar.`,
        );
      }

      const inlineEngineCode = await getInlineGbcEngineCode();
      let romBuffer: Buffer | null = null;
      let displayTitle = "GAME BOY COLOR";
      let customSaveName = "";
      let duplicateNotice = "";

      const quotedDoc = await downloadQuotedDocumentBuffer(msg);

      if (subCommand === "save" && args[1]) {
        customSaveName = args.slice(1).join(" ").trim();
      } else if (quotedDoc && args.length > 0 && subCommand !== "save") {
        customSaveName = args.join(" ").trim();
      }

      if (quotedDoc) {
        const extracted = extractRomFromAnyBuffer(quotedDoc.buffer, quotedDoc.fileName);
        if (!extracted) {
          throw new Error("El archivo adjunto no es una ROM .gb/.gbc válida ni un .zip con juego adentro.");
        }
        romBuffer = extracted.buffer;

        const ext = extracted.fileName.toLowerCase().endsWith(".gb") ? ".gb" : ".gbc";
        const originalBaseName = extracted.fileName.replace(/\.(gb|gbc|cgb|zip)$/i, "").trim();
        const requestedName = customSaveName || originalBaseName;

        const duplicateRealName = checkForDuplicateRom(romBuffer);
        if (duplicateRealName && duplicateRealName.toLowerCase() !== requestedName.toLowerCase()) {
          duplicateNotice = `⚠️ *Emulador LuferOS GBC:* Este juego ya está guardado en memoria con el nombre \`${duplicateRealName}\`.`;
          displayTitle = `${duplicateRealName.toUpperCase()} • GBC`;
        } else {
          const safeFileName = requestedName.replace(/[^a-zA-Z0-9._-]/g, "_") + ext;
          fs.writeFileSync(path.join(CACHE_DIR, safeFileName), romBuffer);
          displayTitle = `${requestedName.toUpperCase()} • GBC`;
        }
      } else if (subCommand === "save" && !quotedDoc) {
        return reply("⚠️ Responde a un archivo `.zip`, `.gb` o `.gbc` con `.gbc save <Nombre>` para guardarlo.");
      } else {
        const searchName = (customSaveName || args.join(" ")).trim();
        const found = searchName ? getStoredRomByName(searchName) : null;

        if (found) {
          romBuffer = found.buffer;
          displayTitle = `${found.realName.toUpperCase()} • GBC`;
        } else {
          const savedRoms = fs
            .readdirSync(CACHE_DIR)
            .filter((f) => /\.(gb|gbc)$/i.test(f));

          if (!searchName && savedRoms.length > 0) {
            const preferred =
              savedRoms.find((f) => f.toLowerCase().includes("bowling")) || savedRoms[0];
            const extracted = extractRomFromAnyBuffer(
              fs.readFileSync(path.join(CACHE_DIR, preferred)),
              preferred,
            );
            if (!extracted) {
              throw new Error("El archivo guardado en caché no es válido.");
            }
            romBuffer = extracted.buffer;
            displayTitle = `${preferred.replace(/\.(gb|gbc)$/i, "").toUpperCase()} • GBC`;
          } else {
            const available =
              savedRoms.map((f) => `\`${f.replace(/\.(gb|gbc)$/i, "")}\``).join(", ") || "Ninguno";
            throw new Error(
              `No se encontró el juego "${searchName}".\n• *Juegos guardados:* ${available}\n• O responde a un archivo \`.zip\` / \`.gbc\` con \`${prefix}gbc save <Nombre>\`.`,
            );
          }
        }
      }

      if (duplicateNotice) {
        await reply(duplicateNotice).catch(() => undefined);
      }

      const romGzipB64 = zlib.gzipSync(romBuffer, { level: 9 }).toString("base64");

      const HTML = buildGbcConsoleHtml({
        inlineEngineCode,
        romGzipB64,
        banner: "★  EMULADOR LUFEROS GBC  ★",
        bezelTitle: displayTitle,
      });

      const data = {
        response_id: "PopiooNixelPopiooNixelPopiooNixel",
        sections: [
          {
            __typename: "GenAIUnifiedResponseSection",
            view_model: {
              __typename: "GenAISingleLayoutViewModel",
              primitive: {
                __typename: "GenAIBotProgressStatusPrimitive",
                title: `🎮 LUFEROS GBC: ${displayTitle}`,
                is_in_progress: true,
              },
            },
          },
        ],
        embedded_screens: [
          {
            title: `LuferOS GBC • ${displayTitle}`,
            content: [
              {
                __typename: "FOAIDNixelButtonSheets",
                tabs: [
                  {
                    id: "tab_0",
                    tab_header: "LuferOS GBC",
                    sections: [
                      {
                        __typename: "GenAIUnifiedResponseSection",
                        view_model: {
                          __typename: "GenAISingleLayoutViewModel",
                          primitive: {
                            __typename: "GenAIaeacdsnwHtmlPrimitive",
                            payload: HTML,
                            url: "https://whatsapp.com",
                            trusted_sources: ["example.com"],
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

      const msgId = randomUUID();

      await sock.relayMessage(
        from,
        {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: {
              messageDisclaimerText: "",
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
                  forwardedAiBotMessageInfo: { botJid: "0@bot" },
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
        `❌ ${fytBold("Emulador LuferOS GBC:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
