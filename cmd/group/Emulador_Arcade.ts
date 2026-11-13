import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "arcade_cache");
const MAX_SAFE_ROM_BYTES = 160000;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface RomChipEntry {
  name: string;
  size: number;
  crc: string;
}

function computeCrc32Hex(buf: Buffer): string {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, "0");
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

function detectArcadeCoreType(title: string, chips: RomChipEntry[]): string {
  const joined = (title + " " + chips.map((c) => c.name).join(" ")).toLowerCase();
  if (
    joined.includes("pac") ||
    joined.includes("puck") ||
    joined.includes("namco") ||
    joined.includes("pm1_") ||
    joined.includes(".6e") ||
    joined.includes(".6f") ||
    joined.includes(".5e")
  ) {
    return "pacman";
  }
  if (
    joined.includes("galaga") ||
    joined.includes("galax") ||
    joined.includes("invader") ||
    joined.includes("1942") ||
    joined.includes("1943") ||
    joined.includes("xevious")
  ) {
    return "galaga";
  }
  if (
    joined.includes("slug") ||
    joined.includes("mslug") ||
    joined.includes("contra") ||
    joined.includes("cadillac") ||
    joined.includes("dino") ||
    joined.includes("punisher") ||
    joined.includes("final")
  ) {
    return "slug";
  }
  return "fighter";
}

function inspectAndExtractArcadeZip(
  zipBuf: Buffer,
  fallbackName: string,
): {
  payload: Buffer;
  gameName: string;
  chips: RomChipEntry[];
} {
  const chips: RomChipEntry[] = [];
  let mainPayload: Buffer | null = null;
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
      const crcRaw = zipBuf.readUInt32LE(ptr + 16);
      const compSize = zipBuf.readUInt32LE(ptr + 20);
      const uncompSize = zipBuf.readUInt32LE(ptr + 24);
      const fnLen = zipBuf.readUInt16LE(ptr + 28);
      const extraLen = zipBuf.readUInt16LE(ptr + 30);
      const commentLen = zipBuf.readUInt16LE(ptr + 32);
      const localOffset = zipBuf.readUInt32LE(ptr + 42);
      const entryName = zipBuf.toString("utf8", ptr + 46, ptr + 46 + fnLen);

      ptr += 46 + fnLen + extraLen + commentLen;

      if (entryName.endsWith("/")) continue;

      if (chips.length < 8) {
        chips.push({
          name: path.basename(entryName).toUpperCase().slice(0, 16),
          size: uncompSize || compSize,
          crc: crcRaw.toString(16).toUpperCase().padStart(8, "0"),
        });
      }

      if (
        !mainPayload &&
        localOffset + 30 <= zipBuf.length &&
        zipBuf.readUInt32LE(localOffset) === 0x04034b50
      ) {
        const lFnLen = zipBuf.readUInt16LE(localOffset + 26);
        const lExtraLen = zipBuf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lFnLen + lExtraLen;
        const dataEnd = dataStart + compSize;

        if (compSize > 0 && dataEnd <= zipBuf.length && uncompSize <= 8 * 1024 * 1024) {
          const slice = zipBuf.subarray(dataStart, dataEnd);
          try {
            const out = method === 0 ? Buffer.from(slice) : zlib.inflateRawSync(slice);
            if (out.length >= 256) {
              mainPayload = out.subarray(0, Math.min(out.length, MAX_SAFE_ROM_BYTES));
            }
          } catch {}
        }
      }
    }
  }

  if (!mainPayload) {
    mainPayload = zipBuf.subarray(0, Math.min(zipBuf.length, MAX_SAFE_ROM_BYTES));
  }

  if (chips.length === 0) {
    chips.push({
      name: fallbackName.toUpperCase().slice(0, 14) + ".6E",
      size: mainPayload.length,
      crc: computeCrc32Hex(mainPayload),
    });
  }

  return {
    payload: mainPayload,
    gameName: fallbackName.replace(/\.(zip|bin|rom)$/i, "").toUpperCase(),
    chips,
  };
}

function createDefaultPacmanRom(): { payload: Buffer; chips: RomChipEntry[] } {
  const buf = Buffer.alloc(16384, 0);
  buf.write("NAMCO-PACMAN-Z80-LUFEROS-V1.2", 0, "ascii");
  for (let i = 32; i < buf.length; i++) {
    buf[i] = ((i * 73) ^ (i >> 2) ^ 0x3c) & 0xff;
  }
  const chips: RomChipEntry[] = [
    { name: "PACMAN.6E", size: 4096, crc: computeCrc32Hex(buf.subarray(0, 4096)) },
    { name: "PACMAN.6F", size: 4096, crc: computeCrc32Hex(buf.subarray(4096, 8192)) },
    { name: "PACMAN.6H", size: 4096, crc: computeCrc32Hex(buf.subarray(8192, 12288)) },
    { name: "PACMAN.6J", size: 4096, crc: computeCrc32Hex(buf.subarray(12288, 16384)) },
    { name: "PACMAN.5E", size: 4096, crc: "0C944964" },
    { name: "PACMAN.5F", size: 4096, crc: "958FEDF9" },
  ];
  return { payload: buf, chips };
}

async function downloadQuotedDocumentBuffer(
  msg: any,
): Promise<{ buffer: Buffer; fileName: string } | null> {
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
    if (buffer.length > 64) {
      return { buffer, fileName: String(doc.fileName || "puckman.zip") };
    }
  }
  return null;
}

function getStoredArcadeRom(query: string): { buffer: Buffer; fileName: string } | null {
  const cleanKey = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanKey || !fs.existsSync(CACHE_DIR)) return null;

  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(zip|bin|rom)$/i.test(f));
  for (const f of files) {
    const base = f.replace(/\.(zip|bin|rom)$/i, "");
    const cleanBase = base.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanBase === cleanKey || cleanBase.includes(cleanKey) || cleanKey.includes(cleanBase)) {
      return { buffer: fs.readFileSync(path.join(CACHE_DIR, f)), fileName: f };
    }
  }
  return null;
}

function buildArcadeCabinetHtml(options: {
  romGzipB64: string;
  chipsJson: string;
  gameTitle: string;
  initialCore: string;
}): string {
  const html = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none}
html,body{width:100%;min-height:100%;background:#05060b;color:#f8fafc;font-family:monospace;overflow-x:hidden;overflow-y:auto}
body{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center}
#arcade-cab{width:min(98vw,540px);margin:0 auto;background:linear-gradient(170deg,#18181b 0%,#090a10 55%,#050508 100%);border:3px solid #f59e0b;border-radius:20px 20px 42px 20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 22px 50px rgba(0,0,0,.95)}
#marquee{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:linear-gradient(90deg,#7c2d12,#ea580c 50%,#7c2d12);border-bottom:2.5px solid #fde047}
.mq-title{font-size:11px;font-weight:900;letter-spacing:1px;color:#fef08a}
.mq-ver{background:#09090b;color:#22d3ee;border:1px solid #22d3ee;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:900}
#bezel-wrap{width:100%;padding:8px 12px 4px;display:flex;flex-direction:column;align-items:center}
#crt-bezel{width:100%;background:linear-gradient(180deg,#1e1b24 0%,#09090d 100%);border:3px solid #3f3f46;border-radius:14px;padding:7px 10px 8px;display:flex;flex-direction:column;align-items:center}
#crt-top{width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
.pwr-box{display:flex;align-items:center;gap:6px}
#pwr-led{width:9px;height:9px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;transition:all .2s}
#pwr-led.boot{background:#facc15;box-shadow:0 0 10px #facc15}
#pwr-led.on{background:#22c55e;box-shadow:0 0 10px #22c55e}
.pwr-lbl{font-size:8.5px;font-weight:900;color:#cbd5e1}
.rom-badge{font-size:8.5px;font-weight:900;color:#fde047;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#crt-frame{position:relative;width:97%;aspect-ratio:384/264;background:#020305;border:2.5px solid #27272a;border-radius:8px;overflow:hidden;display:flex;justify-content:center;align-items:center;box-shadow:inset 0 0 18px #000}
canvas#arcade-cv{width:100%;height:100%;object-fit:fill;display:block;image-rendering:pixelated;cursor:pointer}
#crt-scanlines{position:absolute;inset:0;background:linear-gradient(rgba(18,16,16,0) 50%,rgba(0,0,0,.25) 50%);background-size:100% 4px;pointer-events:none;z-index:2}
#cab-bar{width:100%;display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:6px 12px 4px}
.cab-btn{border:1.5px solid #3f3f46;border-radius:7px;padding:6px 4px;font-family:monospace;font-size:9.5px;font-weight:900;cursor:pointer;text-align:center;box-shadow:0 3px 0 #000}
.cab-btn:active{transform:translateY(2px);box-shadow:0 1px 0 #000}
#btn-power{background:linear-gradient(180deg,#dc2626,#7f1d1d);color:#fff;border-color:#fca5a5}
#btn-power.powered{background:linear-gradient(180deg,#16a34a,#14532d);border-color:#86efac}
#btn-coin{background:linear-gradient(180deg,#f59e0b,#b45309);color:#09090b;border-color:#fde047}
#btn-start{background:linear-gradient(180deg,#2563eb,#1e3a8a);color:#fff;border-color:#93c5fd}
#btn-service{background:linear-gradient(180deg,#3f3f46,#18181b);color:#22d3ee;border-color:#06b6d4}
#debug-wrap{width:95%;margin:3px auto;background:#05070e;border:1.5px solid #f59e0b;border-radius:8px;overflow:hidden}
#debug-head{background:linear-gradient(90deg,#1e1b4b,#31102f);padding:4px 8px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#fde047;font-weight:900}
#telemetry-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:#030408;padding:3px 5px;font-size:8px;color:#67e8f9;text-align:center}
.t-cell{background:rgba(255,255,255,.04);padding:2px 3px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#debug-panel.collapsed{display:none}
#debug-log{height:72px;overflow-y:auto;padding:5px 7px;font-size:8.5px;line-height:1.35;color:#4ade80;background:#03050a;touch-action:pan-y;-webkit-user-select:text;user-select:text}
#debug-actions{display:flex;justify-content:flex-end;gap:6px;padding:3px 6px;background:#070a12}
.dbg-mini-btn{background:#1e293b;color:#fde047;border:1px solid #d97706;border-radius:4px;padding:2px 7px;font-size:8px;font-weight:900;cursor:pointer}
.log-line{margin-bottom:1px;word-break:break-all}
.log-warn{color:#facc15}.log-err{color:#f87171;font-weight:900}.log-sys{color:#38bdf8;font-weight:900}.log-ok{color:#4ade80;font-weight:900}
#cp-area{width:100%;padding:6px 12px 16px;display:flex;flex-direction:column;gap:8px}
#cp-main{width:100%;display:flex;justify-content:space-between;align-items:center;padding:2px}
.joy-btn{position:absolute;width:40px;height:40px;border:1.5px solid #09090b;background:linear-gradient(180deg,#3f3f46,#18181b);color:#f8fafc;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:8px;box-shadow:0 3px 0 #000}
.joy-btn.touching{background:#ef4444;color:#fff;transform:translateY(2px)}
#j-u{left:43px;top:4px}#j-d{left:43px;bottom:4px}#j-l{left:4px;top:43px}#j-r{right:4px;top:43px}
#joy-ball{position:absolute;left:47px;top:47px;width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 32% 32%,#f87171,#dc2626 65%,#7f1d1d);border:2px solid #000;box-shadow:0 3px 8px rgba(0,0,0,.8);pointer-events:none}
#six-buttons{display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,.03);padding:10px 12px;border-radius:18px;border:1.5px solid rgba(255,255,255,.08);transform:rotate(-8deg)}
.punch-row,.kick-row{display:flex;gap:9px}
.arc-btn{width:44px;height:44px;border-radius:50%;border:2px solid #09090b;font-size:11px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 0 #000;transform:rotate(8deg)}
.arc-btn.touching{transform:rotate(8deg) translateY(2px) scale(.94);box-shadow:0 1px 0 #000;filter:brightness(1.3)}
.b-lp{background:radial-gradient(circle at 30% 30%,#38bdf8,#0284c7)}
.b-mp{background:radial-gradient(circle at 30% 30%,#facc15,#ca8a04);color:#09090b}
.b-hp{background:radial-gradient(circle at 30% 30%,#f87171,#dc2626)}
.b-lk{background:radial-gradient(circle at 30% 30%,#4ade80,#16a34a);color:#09090b}
.b-mk{background:radial-gradient(circle at 30% 30%,#c084fc,#7e22ce)}
.b-hk{background:radial-gradient(circle at 30% 30%,#fb923c,#ea580c)}
#bottom-tools{width:100%;display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
.tool-btn{background:#18181b;color:#fde047;border:1.5px solid #3f3f46;border-radius:6px;padding:5px 9px;font-family:monospace;font-size:9px;font-weight:900;cursor:pointer}
.tool-btn.active{background:#f59e0b;color:#09090b;border-color:#fde047}
</style>
<body>
<div id="arcade-cab">
  <div id="marquee">
    <span class="mq-title">★ LuferOS boot Arcade v1.2 ★</span>
    <span class="mq-ver" id="mq-hw">NAMCO • JAMMA</span>
  </div>
  <div id="bezel-wrap">
    <div id="crt-bezel">
      <div id="crt-top">
        <div class="pwr-box">
          <div id="pwr-led"></div>
          <span class="pwr-lbl" id="pwr-status">STANDBY (OFF)</span>
        </div>
        <div class="rom-badge" id="rom-badge-lbl">__GAME_TITLE__</div>
      </div>
      <div id="crt-frame">
        <canvas id="arcade-cv" width="384" height="264"></canvas>
        <div id="crt-scanlines"></div>
      </div>
    </div>
  </div>
  <div id="cab-bar">
    <button class="cab-btn" id="btn-power">⚡ POWER ON</button>
    <button class="cab-btn" id="btn-coin">🪙 COIN (0)</button>
    <button class="cab-btn" id="btn-start">👤 1P START</button>
    <button class="cab-btn" id="btn-service">🛠️ TEST ROM</button>
  </div>
  <div id="debug-wrap">
    <div id="debug-head">
      <span id="dbg-state">🔌 GABINETE APAGADO (PULSA POWER ON)</span>
      <span id="dbg-board">Z80 • 3.07MHz</span>
    </div>
    <div id="telemetry-bar">
      <div class="t-cell" id="t-fps">FPS: 0</div>
      <div class="t-cell" id="t-pc">PC: 0x0000</div>
      <div class="t-cell" id="t-crc">ROM: WAIT</div>
      <div class="t-cell" id="t-cred">CREDITS: 0</div>
    </div>
    <div id="debug-panel">
      <div id="debug-log"></div>
      <div id="debug-actions">
        <button class="dbg-mini-btn" id="btn-game-switch">🎮 CAMBIAR ROM/PLACA</button>
        <button class="dbg-mini-btn" id="btn-copy-log">📋 COPIAR LOG</button>
        <button class="dbg-mini-btn" id="btn-clear-log">🧹 LIMPIAR</button>
      </div>
    </div>
  </div>
  <div id="cp-area">
    <div id="cp-main">
      <div id="joy-stick" style="position:relative;width:130px;height:130px;border-radius:50%;background:radial-gradient(circle,#27272a 0%,#0f0f14 78%);border:2px solid #52525b;flex-shrink:0">
        <button class="joy-btn" id="j-u" data-key="up">▲</button>
        <button class="joy-btn" id="j-l" data-key="left">◀</button>
        <button class="joy-btn" id="j-r" data-key="right">▶</button>
        <button class="joy-btn" id="j-d" data-key="down">▼</button>
        <div id="joy-ball"></div>
      </div>
      <div id="six-buttons">
        <div class="punch-row">
          <button class="arc-btn b-lp" data-key="lp">LP</button>
          <button class="arc-btn b-mp" data-key="mp">MP</button>
          <button class="arc-btn b-hp" data-key="hp">HP</button>
        </div>
        <div class="kick-row">
          <button class="arc-btn b-lk" data-key="lk">LK</button>
          <button class="arc-btn b-mk" data-key="mk">MK</button>
          <button class="arc-btn b-hk" data-key="hk">HK</button>
        </div>
      </div>
    </div>
    <div id="bottom-tools">
      <button class="tool-btn active" id="btn-logs-toggle">📟 LOGS (ON)</button>
      <button class="tool-btn" id="btn-action-macro">🍒 TURBO / ESPECIAL</button>
      <button class="tool-btn" id="btn-reboot-boot">🔄 REPETIR BOOT v1.2</button>
    </div>
  </div>
</div>
<script>__ARCADE_SCRIPT__</script>
</body>`;

  const script = `
(function(){
  const ROM_GZIP_B64 = "${options.romGzipB64}";
  const ROM_CHIPS = ${options.chipsJson};
  let GAME_TITLE = "${options.gameTitle}";
  let activeCore = "${options.initialCore}";

  const canvas = document.getElementById("arcade-cv");
  const ctx = canvas.getContext("2d", { alpha: false });
  const pwrLed = document.getElementById("pwr-led");
  const pwrStatus = document.getElementById("pwr-status");
  const btnPower = document.getElementById("btn-power");
  const btnCoin = document.getElementById("btn-coin");
  const dbgState = document.getElementById("dbg-state");
  const dbgBoard = document.getElementById("dbg-board");
  const mqHw = document.getElementById("mq-hw");
  const romBadgeLbl = document.getElementById("rom-badge-lbl");
  const dbgPanel = document.getElementById("debug-panel");
  const dbgLog = document.getElementById("debug-log");
  const tFps = document.getElementById("t-fps");
  const tPc = document.getElementById("t-pc");
  const tCrc = document.getElementById("t-crc");
  const tCred = document.getElementById("t-cred");

  const logHistory = [];
  const keys = {};

  function logArc(msg, cls) {
    const now = new Date();
    const ts = String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0") + "." + String(now.getMilliseconds()).padStart(3, "0").slice(0, 2);
    const line = "[" + ts + "] " + msg;
    logHistory.push(line);
    if (logHistory.length > 150) logHistory.shift();
    const div = document.createElement("div");
    div.className = "log-line " + (cls || "");
    div.textContent = line;
    dbgLog.appendChild(div);
    while (dbgLog.childNodes.length > 80) dbgLog.removeChild(dbgLog.firstChild);
    dbgLog.scrollTop = dbgLog.scrollHeight;
  }

  let audioCtx = null;
  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }

  function playWsgTone(freq, dur, type, vol, slide) {
    try {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
      gain.gain.setValueAtTime(vol || 0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch (e) {}
  }

  function playCoinChime() {
    playWsgTone(987.77, 0.08, "square", 0.08, 0);
    setTimeout(function(){ playWsgTone(1318.51, 0.25, "square", 0.08, 0); }, 80);
  }

  function playPacmanStartJingle() {
    const notes = [493.88, 987.77, 739.99, 622.25, 987.77, 739.99, 622.25, 523.25, 1046.5, 783.99, 659.25, 1046.5, 783.99, 659.25];
    notes.forEach(function(n, i) {
      setTimeout(function() {
        playWsgTone(n, 0.11, "square", 0.05, 0);
      }, i * 105);
    });
  }

  async function gunzipBase64ToBytes(b64) {
    const bin = atob(b64);
    const compressed = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) compressed[i] = bin.charCodeAt(i);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }

  function calcRuntimeCrc32(u8) {
    let crc = 0xFFFFFFFF;
    const step = Math.max(1, Math.floor(u8.length / 8192));
    for (let i = 0; i < u8.length; i += step) {
      crc ^= u8[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
      }
    }
    return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  function updateBoardLabels() {
    if (activeCore === "pacman") {
      mqHw.textContent = "NAMCO • Z80";
      dbgBoard.textContent = "NAMCO Z80 • 3.07MHz";
    } else if (activeCore === "galaga") {
      mqHw.textContent = "NAMCO • DUAL Z80";
      dbgBoard.textContent = "GALAGA Z80 • WSG";
    } else if (activeCore === "slug") {
      mqHw.textContent = "SNK • NEO-GEO MVS";
      dbgBoard.textContent = "68000 + Z80 • YM2610";
    } else {
      mqHw.textContent = "JAMMA • CPS-II";
      dbgBoard.textContent = "CPS-II • 12MHz";
    }
  }

  let romBytes = new Uint8Array(0);
  let masterCrc = "00000000";
  let sysState = "OFF";
  let bootTick = 0;
  let credits = 0;
  let cpuPc = 0x0000;
  let currentChipIdx = 0;

  let memTests = [];
  let chipResults = [];

  const PAC_RAW_MAP = [
    "1111111111111111111111111111",
    "1222222222222112222222222221",
    "1211112111112112111112111121",
    "1311112111112112111112111131",
    "1211112111112112111112111121",
    "1222222222222222222222222221",
    "1211112112111111112112111121",
    "1211112112111111112112111121",
    "1222222112222112222112222221",
    "1111112111110110111112111111",
    "0000012111110110111112100000",
    "0000012110000000000112100000",
    "1111112110111441110112111111",
    "0000002000100000010002000000",
    "1111112110111111110112111111",
    "0000012110000000000112100000",
    "0000012110111111110112100000",
    "1111112110111111110112111111",
    "1222222222222112222222222221",
    "1211112111112112111112111121",
    "1322112222222002222222112231",
    "1112112112111111112112112111",
    "1222222112222112222112222221",
    "1211111111112112111111111121",
    "1222222222222222222222222221",
    "1111111111111111111111111111"
  ];

  let pacGrid = [];
  let pacDotsRemaining = 0;
  let pacScore = 0;
  let pacHighScore = 10000;
  let pacLives = 3;
  let pacLevel = 1;
  let pacFrightTimer = 0;
  let pacComboGhost = 0;
  let pacPopup = { text: "", x: 0, y: 0, timer: 0 };
  let pacReadyTimer = 0;
  let pacFruitTimer = 0;
  let wakaToggle = false;

  let pacPlayer = {
    x: 13.5,
    y: 20,
    dx: -1,
    dy: 0,
    nextDx: -1,
    nextDy: 0,
    mouth: 0.2,
    mouthDir: 1
  };

  let pacGhosts = [];

  function initPacmanMaze(resetScore) {
    pacGrid = [];
    pacDotsRemaining = 0;
    for (let r = 0; r < PAC_RAW_MAP.length; r++) {
      const row = [];
      for (let c = 0; c < 28; c++) {
        const ch = PAC_RAW_MAP[r][c];
        const v = parseInt(ch, 10);
        row.push(v);
        if (v === 2 || v === 3) pacDotsRemaining++;
      }
      pacGrid.push(row);
    }
    if (resetScore) {
      pacScore = 0;
      pacLives = 3;
      pacLevel = 1;
    }
    resetPacmanPositions();
  }

  function resetPacmanPositions() {
    pacPlayer.x = 13.5;
    pacPlayer.y = 20;
    pacPlayer.dx = -1;
    pacPlayer.dy = 0;
    pacPlayer.nextDx = -1;
    pacPlayer.nextDy = 0;
    pacFrightTimer = 0;
    pacReadyTimer = 55;
    pacGhosts = [
      { name: "BLINKY", col: "#ef4444", x: 13.5, y: 11, dx: -1, dy: 0, scatX: 25, scatY: 0, state: "normal" },
      { name: "PINKY",  col: "#f472b6", x: 13.5, y: 13, dx: 0,  dy: -1, scatX: 2,  scatY: 0, state: "normal" },
      { name: "INKY",   col: "#22d3ee", x: 12.0, y: 13, dx: 0,  dy: -1, scatX: 27, scatY: 25, state: "normal" },
      { name: "CLYDE",  col: "#fb923c", x: 15.0, y: 13, dx: 0,  dy: -1, scatX: 0,  scatY: 25, state: "normal" }
    ];
  }

  function isPacWall(tx, ty, isGhost, ghostState) {
    if (ty < 0 || ty >= PAC_RAW_MAP.length) return true;
    const wrappedX = (tx + 28) % 28;
    const cell = pacGrid[ty][wrappedX];
    if (cell === 1) return true;
    if (cell === 4) {
      return !isGhost;
    }
    return false;
  }

  function updateAndRenderPacman() {
    bootTick++;
    cpuPc = (0x0038 + ((bootTick * 23) & 0x3FFF)) & 0xFFFF;
    tPc.textContent = "PC: 0x" + cpuPc.toString(16).toUpperCase().padStart(4, "0");

    if (keys.left)  { pacPlayer.nextDx = -1; pacPlayer.nextDy = 0; }
    if (keys.right) { pacPlayer.nextDx = 1;  pacPlayer.nextDy = 0; }
    if (keys.up)    { pacPlayer.nextDx = 0;  pacPlayer.nextDy = -1; }
    if (keys.down)  { pacPlayer.nextDx = 0;  pacPlayer.nextDy = 1; }

    if (pacReadyTimer > 0) {
      pacReadyTimer--;
    } else {
      if (pacFrightTimer > 0) pacFrightTimer--;
      if (pacPopup.timer > 0) pacPopup.timer--;
      if (pacFruitTimer > 0) pacFruitTimer--;
      if (bootTick % 350 === 180) pacFruitTimer = 240;

      const spd = 0.125;
      const cx = Math.round(pacPlayer.x);
      const cy = Math.round(pacPlayer.y);
      const nearCenter = Math.abs(pacPlayer.x - cx) < 0.19 && Math.abs(pacPlayer.y - cy) < 0.19;

      if (pacPlayer.nextDx === -pacPlayer.dx && pacPlayer.nextDy === -pacPlayer.dy && (pacPlayer.nextDx !== 0 || pacPlayer.nextDy !== 0)) {
        pacPlayer.dx = pacPlayer.nextDx;
        pacPlayer.dy = pacPlayer.nextDy;
      } else if (nearCenter && (pacPlayer.nextDx !== pacPlayer.dx || pacPlayer.nextDy !== pacPlayer.dy)) {
        if (!isPacWall(cx + pacPlayer.nextDx, cy + pacPlayer.nextDy, false, "")) {
          pacPlayer.x = cx;
          pacPlayer.y = cy;
          pacPlayer.dx = pacPlayer.nextDx;
          pacPlayer.dy = pacPlayer.nextDy;
        }
      }

      const nextX = pacPlayer.x + pacPlayer.dx * spd;
      const nextY = pacPlayer.y + pacPlayer.dy * spd;
      const checkTileX = Math.round(nextX + pacPlayer.dx * 0.36);
      const checkTileY = Math.round(nextY + pacPlayer.dy * 0.36);

      if (!isPacWall(checkTileX, checkTileY, false, "")) {
        pacPlayer.x = (nextX + 28) % 28;
        pacPlayer.y = nextY;
        pacPlayer.mouth += 0.04 * pacPlayer.mouthDir;
        if (pacPlayer.mouth >= 0.38) pacPlayer.mouthDir = -1;
        if (pacPlayer.mouth <= 0.03) pacPlayer.mouthDir = 1;
      } else {
        pacPlayer.x = Math.round(pacPlayer.x);
        pacPlayer.y = Math.round(pacPlayer.y);
      }

      const curTx = Math.round(pacPlayer.x) % 28;
      const curTy = Math.round(pacPlayer.y);
      if (pacGrid[curTy] && (pacGrid[curTy][curTx] === 2 || pacGrid[curTy][curTx] === 3)) {
        const isPower = pacGrid[curTy][curTx] === 3;
        pacGrid[curTy][curTx] = 0;
        pacDotsRemaining--;
        if (isPower) {
          pacScore += 50;
          pacFrightTimer = Math.max(120, 320 - pacLevel * 30);
          pacComboGhost = 0;
          pacGhosts.forEach(function(g) {
            if (g.state === "normal") {
              g.state = "fright";
              g.dx = -g.dx;
              g.dy = -g.dy;
            }
          });
          playWsgTone(680, 0.18, "sawtooth", 0.07, 240);
          logArc("POWER PELLET: ¡Fantasmas vulnerables (Modo Azul)!", "log-warn");
        } else {
          pacScore += 10;
          wakaToggle = !wakaToggle;
          playWsgTone(wakaToggle ? 290 : 410, 0.045, "triangle", 0.04, wakaToggle ? 90 : -90);
        }
        if (pacScore > pacHighScore) pacHighScore = pacScore;

        if (pacDotsRemaining <= 0) {
          pacLevel++;
          playWsgTone(880, 0.35, "square", 0.08, 320);
          logArc("STAGE CLEAR! Avanzando al Nivel " + pacLevel, "log-ok");
          initPacmanMaze(false);
          return;
        }
      }

      if (pacFruitTimer > 0 && Math.abs(pacPlayer.x - 13.5) < 0.9 && Math.abs(pacPlayer.y - 15) < 0.9) {
        pacFruitTimer = 0;
        const fruitPts = pacLevel * 200 + 100;
        pacScore += fruitPts;
        pacPopup = { text: String(fruitPts), x: 13.5, y: 15, timer: 45 };
        playWsgTone(587.33, 0.2, "square", 0.07, 420);
        logArc("BONUS FRUIT EATEN: +" + fruitPts + " PTS", "log-ok");
      }

      pacGhosts.forEach(function(g, gi) {
        if (pacFrightTimer === 0 && g.state === "fright") {
          g.state = "normal";
        }
        const gSpd = g.state === "eyes" ? 0.25 : g.state === "fright" ? 0.065 : 0.11;
        const gx = Math.round(g.x);
        const gy = Math.round(g.y);
        const atCenter = Math.abs(g.x - gx) < gSpd * 0.85 && Math.abs(g.y - gy) < gSpd * 0.85;

        if (atCenter) {
          g.x = gx;
          g.y = gy;
          if (g.state === "eyes" && Math.abs(gx - 13) <= 1 && Math.abs(gy - 13) <= 1) {
            g.state = "normal";
            g.dy = -1;
            g.dx = 0;
          }

          const dirs = [
            { dx: 0, dy: -1 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 1, dy: 0 }
          ];
          const valid = dirs.filter(function(d) {
            if (d.dx === -g.dx && d.dy === -g.dy) return false;
            return !isPacWall(gx + d.dx, gy + d.dy, true, g.state);
          });

          if (valid.length === 0) {
            g.dx = -g.dx;
            g.dy = -g.dy;
          } else {
            let targetX = pacPlayer.x;
            let targetY = pacPlayer.y;

            if (g.state === "eyes") {
              targetX = 13.5;
              targetY = 11;
            } else if (g.state === "fright") {
              const pick = valid[Math.floor(Math.random() * valid.length)];
              g.dx = pick.dx;
              g.dy = pick.dy;
            } else if (gy >= 12 && gy <= 14 && gx >= 11 && gx <= 16) {
              targetX = 13.5;
              targetY = 10;
            } else if ((bootTick % 420) < 90) {
              targetX = g.scatX;
              targetY = g.scatY;
            } else if (gi === 1) {
              targetX = pacPlayer.x + pacPlayer.dx * 4;
              targetY = pacPlayer.y + pacPlayer.dy * 4;
            } else if (gi === 2) {
              targetX = pacPlayer.x + pacPlayer.dx * 2;
              targetY = pacPlayer.y - pacPlayer.dy * 2;
            } else if (gi === 3) {
              const dist = Math.hypot(gx - pacPlayer.x, gy - pacPlayer.y);
              if (dist < 6) { targetX = g.scatX; targetY = g.scatY; }
            }

            if (g.state !== "fright") {
              let best = valid[0];
              let bestDist = 999999;
              valid.forEach(function(d) {
                const dist = Math.hypot((gx + d.dx) - targetX, (gy + d.dy) - targetY);
                if (dist < bestDist) {
                  bestDist = dist;
                  best = d;
                }
              });
              g.dx = best.dx;
              g.dy = best.dy;
            }
          }
        }

        g.x = (g.x + g.dx * gSpd + 28) % 28;
        g.y = g.y + g.dy * gSpd;

        const dPlayer = Math.hypot(g.x - pacPlayer.x, g.y - pacPlayer.y);
        if (dPlayer < 0.78) {
          if (g.state === "fright") {
            g.state = "eyes";
            pacComboGhost++;
            const pts = 200 * (1 << (pacComboGhost - 1));
            pacScore += pts;
            if (pacScore > pacHighScore) pacHighScore = pacScore;
            pacPopup = { text: String(pts), x: g.x, y: g.y, timer: 42 };
            playWsgTone(320, 0.22, "square", 0.08, 640);
            logArc("GHOST EATEN [" + g.name + "]: +" + pts + " PTS!", "log-ok");
          } else if (g.state === "normal") {
            pacLives--;
            playWsgTone(420, 0.45, "sawtooth", 0.08, -340);
            logArc("PAC-MAN CAUGHT BY " + g.name + "! Vidas restantes: " + pacLives, "log-warn");
            if (pacLives <= 0) {
              logArc("GAME OVER! Puntuación final: " + pacScore, "log-err");
              initPacmanMaze(true);
            } else {
              resetPacmanPositions();
            }
          }
        }
      });
    }

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 384, 264);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 9.5px monospace";
    ctx.fillText("1UP   " + String(pacScore).padStart(6, "0"), 14, 13);
    ctx.fillStyle = "#ef4444";
    ctx.fillText("HIGH SCORE", 136, 13);
    ctx.fillStyle = "#fde047";
    ctx.fillText(String(pacHighScore).padStart(6, "0"), 212, 13);
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("STAGE " + pacLevel, 318, 13);

    const ox = 68;
    const oy = 18;
    const ts = 9;

    for (let r = 0; r < PAC_RAW_MAP.length; r++) {
      for (let c = 0; c < 28; c++) {
        const v = pacGrid[r][c];
        const px = ox + c * ts;
        const py = oy + r * ts;
        if (v === 1) {
          ctx.fillStyle = "#1d4ed8";
          ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
          ctx.strokeStyle = "#3b82f6";
          ctx.strokeRect(px + 1.5, py + 1.5, ts - 3, ts - 3);
        } else if (v === 4) {
          ctx.fillStyle = "#f472b6";
          ctx.fillRect(px, py + 3, ts, 3);
        } else if (v === 2) {
          ctx.fillStyle = "#fed7aa";
          ctx.fillRect(px + 3, py + 3, 2.5, 2.5);
        } else if (v === 3 && (bootTick & 8) === 0) {
          ctx.fillStyle = "#fde047";
          ctx.beginPath();
          ctx.arc(px + 4.5, py + 4.5, 3.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (pacFruitTimer > 0) {
      const fx = ox + 13.5 * ts + 4;
      const fy = oy + 15 * ts + 4;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(fx - 2, fy + 1, 3.2, 0, Math.PI * 2);
      ctx.arc(fx + 2, fy + 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4ade80";
      ctx.beginPath();
      ctx.moveTo(fx - 2, fy - 1);
      ctx.lineTo(fx + 1, fy - 5);
      ctx.lineTo(fx + 2, fy);
      ctx.stroke();
    }

    const pScreenX = ox + pacPlayer.x * ts + 4.5;
    const pScreenY = oy + pacPlayer.y * ts + 4.5;
    let baseAngle = 0;
    if (pacPlayer.dx === 1) baseAngle = 0;
    else if (pacPlayer.dx === -1) baseAngle = Math.PI;
    else if (pacPlayer.dy === -1) baseAngle = -Math.PI / 2;
    else if (pacPlayer.dy === 1) baseAngle = Math.PI / 2;

    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.moveTo(pScreenX, pScreenY);
    ctx.arc(
      pScreenX,
      pScreenY,
      5.6,
      baseAngle + pacPlayer.mouth * Math.PI,
      baseAngle + (2 - pacPlayer.mouth) * Math.PI
    );
    ctx.closePath();
    ctx.fill();

    pacGhosts.forEach(function(g) {
      const gx = ox + g.x * ts + 4.5;
      const gy = oy + g.y * ts + 4.5;

      if (g.state !== "eyes") {
        const flashWhite = g.state === "fright" && pacFrightTimer < 70 && (bootTick & 4);
        ctx.fillStyle = g.state === "fright" ? (flashWhite ? "#f8fafc" : "#1d4ed8") : g.col;
        ctx.beginPath();
        ctx.arc(gx, gy - 1.5, 5.5, Math.PI, 0, false);
        ctx.lineTo(gx + 5.5, gy + 5);
        ctx.lineTo(gx + 2.8, gy + 3.2);
        ctx.lineTo(gx, gy + 5);
        ctx.lineTo(gx - 2.8, gy + 3.2);
        ctx.lineTo(gx - 5.5, gy + 5);
        ctx.closePath();
        ctx.fill();
      }

      if (g.state === "fright") {
        ctx.fillStyle = "#fde047";
        ctx.fillRect(gx - 2.5, gy - 2.5, 1.8, 1.8);
        ctx.fillRect(gx + 1, gy - 2.5, 1.8, 1.8);
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(gx - 2, gy - 1.5, 2, 0, Math.PI * 2);
        ctx.arc(gx + 2, gy - 1.5, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1d4ed8";
        ctx.beginPath();
        ctx.arc(gx - 2 + g.dx, gy - 1.5 + g.dy, 1, 0, Math.PI * 2);
        ctx.arc(gx + 2 + g.dx, gy - 1.5 + g.dy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    if (pacReadyTimer > 0) {
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 10px monospace";
      ctx.fillText("READY!", ox + 104, oy + 146);
    }

    if (pacPopup.timer > 0) {
      ctx.fillStyle = "#22d3ee";
      ctx.font = "bold 8.5px monospace";
      ctx.fillText(pacPopup.text, ox + pacPopup.x * ts - 4, oy + pacPopup.y * ts);
    }

    for (let i = 0; i < pacLives; i++) {
      const lx = 14 + i * 14;
      const ly = 254;
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.arc(lx, ly, 4.5, 0.25 * Math.PI, 1.75 * Math.PI);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 8px monospace";
    ctx.fillText("NAMCO PAC-MAN Z80  •  DOTS:" + pacDotsRemaining + "  •  CREDITS:" + credits, 128, 257);
  }

  let galPlayerX = 192;
  let galBullets = [];
  let galAliens = [];
  let galStars = [];
  let galScore = 0;

  function initGalagaStage() {
    galAliens = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c++) {
        galAliens.push({
          baseX: 68 + c * 34,
          baseY: 42 + r * 22,
          hp: 1,
          col: r === 0 ? "#facc15" : r === 1 ? "#ef4444" : "#38bdf8"
        });
      }
    }
    if (galStars.length === 0) {
      for (let i = 0; i < 40; i++) {
        galStars.push({ x: Math.random() * 384, y: Math.random() * 264, s: 1 + Math.random() * 2 });
      }
    }
  }

  function renderGalagaScreen() {
    bootTick++;
    cpuPc = (0x1000 + ((bootTick * 32) & 0x2FFF)) & 0xFFFF;
    tPc.textContent = "PC: 0x" + cpuPc.toString(16).toUpperCase().padStart(4, "0");

    if (galAliens.length === 0) initGalagaStage();

    if (keys.left) galPlayerX = Math.max(24, galPlayerX - 3.4);
    if (keys.right) galPlayerX = Math.min(360, galPlayerX + 3.4);

    if ((keys.lp || keys.mp || keys.hp || keys.lk) && bootTick % 9 === 0) {
      galBullets.push({ x: galPlayerX - 6, y: 224 });
      galBullets.push({ x: galPlayerX + 6, y: 224 });
      playWsgTone(880, 0.06, "square", 0.05, -420);
    }

    ctx.fillStyle = "#03040a";
    ctx.fillRect(0, 0, 384, 264);

    galStars.forEach(function(st) {
      st.y = (st.y + st.s) % 264;
      ctx.fillStyle = st.s > 2 ? "#facc15" : "#93c5fd";
      ctx.fillRect(st.x, st.y, 2, 2);
    });

    const sway = Math.sin(bootTick * 0.04) * 26;
    let alive = 0;
    galAliens.forEach(function(al) {
      if (al.hp <= 0) return;
      alive++;
      const ax = al.baseX + sway;
      const ay = al.baseY + Math.cos(bootTick * 0.05 + al.baseX) * 4;

      ctx.fillStyle = al.col;
      ctx.fillRect(ax - 9, ay - 6, 18, 12);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(ax - 5, ay - 3, 3, 3);
      ctx.fillRect(ax + 2, ay - 3, 3, 3);

      for (let bi = galBullets.length - 1; bi >= 0; bi--) {
        const b = galBullets[bi];
        if (Math.abs(b.x - ax) < 11 && Math.abs(b.y - ay) < 9) {
          al.hp = 0;
          galBullets.splice(bi, 1);
          galScore += 150;
          playWsgTone(240, 0.1, "sawtooth", 0.06, -120);
          break;
        }
      }
    });

    if (alive === 0) {
      galScore += 1000;
      initGalagaStage();
    }

    for (let i = galBullets.length - 1; i >= 0; i--) {
      galBullets[i].y -= 6.5;
      ctx.fillStyle = "#fde047";
      ctx.fillRect(galBullets[i].x - 1, galBullets[i].y, 2.5, 8);
      if (galBullets[i].y < 0) galBullets.splice(i, 1);
    }

    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.moveTo(galPlayerX, 218);
    ctx.lineTo(galPlayerX + 14, 240);
    ctx.lineTo(galPlayerX - 14, 240);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(galPlayerX - 4, 228, 8, 10);

    ctx.fillStyle = "#fde047";
    ctx.font = "bold 10px monospace";
    ctx.fillText("1UP: " + String(galScore).padStart(6, "0") + "   NAMCO GALAGA Z80", 14, 16);
  }

  let p1 = { x: 96, y: 210, vy: 0, hp: 100, dir: 1, act: "idle", actTimer: 0, score: 0 };
  let cpuFoe = { x: 268, y: 210, vy: 0, hp: 100, dir: -1, act: "idle", actTimer: 0, round: 1 };
  let projectiles = [];

  function triggerSpecialMove() {
    if (sysState !== "GAME") return;
    if (activeCore === "pacman") {
      pacFrightTimer = 280;
      pacGhosts.forEach(function(g) { g.state = "fright"; });
      playWsgTone(740, 0.2, "sawtooth", 0.07, 220);
      logArc("CHEAT / MACRO: Power Pellet Forzado en Pac-Man.", "log-warn");
      return;
    }
    p1.act = "special";
    p1.actTimer = 18;
    projectiles.push({ x: p1.x + p1.dir * 24, y: p1.y - 28, vx: p1.dir * 5.5 });
    playWsgTone(320, 0.22, "sawtooth", 0.08, 420);
    logArc("INPUT MACRO: ↓ ↘ → + P (SPECIAL / HEAVY MACHINE GUN)", "log-warn");
  }

  function renderFighterOrSlugScreen() {
    bootTick++;
    cpuPc = (0x040000 + ((bootTick * 96) & 0xFFFF)) >>> 0;
    tPc.textContent = "PC: 0x" + cpuPc.toString(16).toUpperCase().padStart(6, "0");

    if (p1.actTimer > 0) {
      p1.actTimer--;
      if (p1.actTimer === 0) p1.act = "idle";
    }
    if (cpuFoe.actTimer > 0) {
      cpuFoe.actTimer--;
      if (cpuFoe.actTimer === 0) cpuFoe.act = "idle";
    }

    if (keys.left) { p1.x = Math.max(28, p1.x - 2.8); p1.dir = -1; }
    if (keys.right) { p1.x = Math.min(356, p1.x + 2.8); p1.dir = 1; }
    if (keys.up && p1.y >= 210) {
      p1.vy = -8.2;
      playWsgTone(260, 0.12, "triangle", 0.05, 190);
    }
    if (p1.y < 210 || p1.vy !== 0) {
      p1.y += p1.vy;
      p1.vy += 0.48;
      if (p1.y >= 210) { p1.y = 210; p1.vy = 0; }
    }

    const punchHit = keys.lp || keys.mp || keys.hp;
    const kickHit = keys.lk || keys.mk || keys.hk;
    if ((punchHit || kickHit) && p1.actTimer === 0) {
      if (activeCore === "slug" || (keys.hp && keys.down)) {
        triggerSpecialMove();
      } else {
        p1.act = punchHit ? "punch" : "kick";
        p1.actTimer = 11;
        const dmg = (keys.hp || keys.hk) ? 9 : 6;
        playWsgTone(punchHit ? 210 : 150, 0.08, "sawtooth", 0.06, -70);

        if (Math.abs(cpuFoe.x - p1.x) < 44 && Math.abs(cpuFoe.y - p1.y) < 32) {
          cpuFoe.hp = Math.max(0, cpuFoe.hp - dmg);
          cpuFoe.act = "hurt";
          cpuFoe.actTimer = 10;
          cpuFoe.x = Math.min(360, Math.max(24, cpuFoe.x + p1.dir * 12));
          p1.score += dmg * 100;
          playWsgTone(95, 0.11, "square", 0.08, -30);
        }
      }
    }

    if (cpuFoe.act !== "hurt") {
      const dist = p1.x - cpuFoe.x;
      cpuFoe.dir = dist >= 0 ? 1 : -1;
      if (Math.abs(dist) > 36) {
        cpuFoe.x += cpuFoe.dir * 1.45;
      } else if (bootTick % 38 === 0) {
        cpuFoe.act = "punch";
        cpuFoe.actTimer = 12;
        if (Math.abs(p1.y - cpuFoe.y) < 25 && !keys.left) {
          p1.hp = Math.max(0, p1.hp - 6);
          playWsgTone(120, 0.09, "sawtooth", 0.06, -40);
        }
      }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.x += pr.vx;
      if (Math.abs(pr.x - cpuFoe.x) < 20 && Math.abs(pr.y - (cpuFoe.y - 24)) < 26) {
        cpuFoe.hp = Math.max(0, cpuFoe.hp - 14);
        cpuFoe.act = "hurt";
        cpuFoe.actTimer = 14;
        p1.score += 1200;
        playWsgTone(85, 0.16, "square", 0.09, -40);
        projectiles.splice(i, 1);
      } else if (pr.x < 0 || pr.x > 384) {
        projectiles.splice(i, 1);
      }
    }

    if (cpuFoe.hp <= 0 || p1.hp <= 0) {
      const won = cpuFoe.hp <= 0;
      logArc(won ? "K.O.! STAGE CLEAR (+5000 PTS)" : "K.O.! CONTINUE", won ? "log-ok" : "log-warn");
      if (won) {
        p1.score += 5000;
        cpuFoe.round++;
      }
      p1.hp = 100;
      cpuFoe.hp = 100;
      p1.x = 96;
      cpuFoe.x = 268;
      projectiles = [];
    }

    const sky = ctx.createLinearGradient(0, 0, 0, 185);
    sky.addColorStop(0, activeCore === "slug" ? "#1e1b4b" : "#0c1938");
    sky.addColorStop(1, activeCore === "slug" ? "#7c2d12" : "#1d4ed8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 384, 185);

    ctx.fillStyle = "#334155";
    ctx.fillRect(0, 185, 384, 79);

    ctx.fillStyle = "#090d16";
    ctx.fillRect(12, 8, 360, 26);
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(16, 14, 146, 11);
    ctx.fillRect(222, 14, 146, 11);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(16 + (100 - p1.hp) * 1.46, 14, p1.hp * 1.46, 11);
    ctx.fillRect(222, 14, cpuFoe.hp * 1.46, 11);

    ctx.fillStyle = "#fde047";
    ctx.font = "bold 11px monospace";
    ctx.fillText("KO", 185, 23);

    function drawFighter(f, bodyCol, headBandCol) {
      ctx.fillStyle = f.act === "hurt" ? "#ffffff" : bodyCol;
      ctx.fillRect(f.x - 11, f.y - 44, 22, 28);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(f.x - 10, f.y - 16, 8, 16);
      ctx.fillRect(f.x + 2, f.y - 16, 8, 16);
      ctx.fillStyle = "#fed7aa";
      ctx.fillRect(f.x - 7, f.y - 55, 14, 11);
      ctx.fillStyle = headBandCol;
      ctx.fillRect(f.x - 8, f.y - 57, 16, 3);
    }

    drawFighter(p1, activeCore === "slug" ? "#16a34a" : "#f8fafc", "#ef4444");
    drawFighter(cpuFoe, "#dc2626", "#facc15");

    projectiles.forEach(function(pr) {
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 7, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function resetBootDiagnostics() {
    bootTick = 0;
    currentChipIdx = 0;
    updateBoardLabels();
    if (activeCore === "pacman" || activeCore === "galaga") {
      memTests = [
        { name: "Z80 MAIN WORK RAM (0x4C00)", status: "WAIT" },
        { name: "NAMCO TILEMAP VRAM (0x4000)", status: "WAIT" },
        { name: "COLOR PROM & SPRITE RAM (0x4FF0)", status: "WAIT" },
        { name: "NAMCO WSG 3-VOICE SOUND (0x5040)", status: "WAIT" },
        { name: "DIP SWITCHES & COIN I/O (0x5000)", status: "WAIT" }
      ];
    } else {
      memTests = [
        { name: "M68000 WORK RAM (0xFF0000)", status: "WAIT" },
        { name: "CPS SCROLL 1/2/3 VRAM (0x900000)", status: "WAIT" },
        { name: "OBJECT SPRITE RAM (0x708000)", status: "WAIT" },
        { name: "Z80 + QSOUND DSP RAM (0xF18000)", status: "WAIT" },
        { name: "EEPROM & JAMMA DIPSW I/O", status: "WAIT" }
      ];
    }
    chipResults = ROM_CHIPS.map(function(c) {
      return { name: c.name, size: c.size, crc: c.crc, status: "WAIT" };
    });
  }

  function powerOnCabinet() {
    unlockAudio();
    if (sysState !== "OFF") {
      sysState = "OFF";
      pwrLed.className = "";
      pwrStatus.textContent = "STANDBY (OFF)";
      btnPower.classList.remove("powered");
      btnPower.textContent = "⚡ POWER ON";
      dbgState.textContent = "🔌 GABINETE APAGADO";
      tFps.textContent = "FPS: 0";
      tPc.textContent = "PC: 0x0000";
      logArc("POWER SWITCH: Gabinete Arcade desconectado (OFF).", "log-warn");
      return;
    }

    resetBootDiagnostics();
    sysState = "DEGAUSS";
    pwrLed.className = "boot";
    pwrStatus.textContent = "BOOT v1.2";
    btnPower.classList.add("powered");
    btnPower.textContent = "⚡ POWER OFF";
    dbgState.textContent = "⚡ LuferOS boot Arcade v1.2 INIT...";
    playWsgTone(90, 0.25, "sawtooth", 0.08, 220);
    logArc("============================================", "log-sys");
    logArc("POWER ON: Iniciando LuferOS boot Arcade v1.2", "log-ok");
    logArc("Placa detectada: " + activeCore.toUpperCase() + " [" + GAME_TITLE + "]", "log-sys");
  }

  function renderPowerOffScreen() {
    ctx.fillStyle = "#030407";
    ctx.fillRect(0, 0, 384, 264);
    ctx.strokeStyle = "#1e293b";
    ctx.strokeRect(18, 18, 348, 228);

    ctx.textAlign = "center";
    ctx.fillStyle = "#475569";
    ctx.font = "bold 11px monospace";
    ctx.fillText("JAMMA ARCADE MONITOR • POWER OFF", 192, 92);

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 12px monospace";
    ctx.fillText("⚡ PULSA [POWER ON] O TOCA LA PANTALLA", 192, 130);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "9px monospace";
    ctx.fillText("Sistema: LuferOS boot Arcade v1.2", 192, 160);
    ctx.fillStyle = "#4ade80";
    ctx.fillText("ROM Lista: " + GAME_TITLE + " (" + activeCore.toUpperCase() + ")", 192, 180);
    ctx.textAlign = "left";
  }

  function renderDegaussAndPost() {
    bootTick++;
    cpuPc = (bootTick * 128) & 0xFFFF;
    tPc.textContent = "PC: 0x" + cpuPc.toString(16).toUpperCase().padStart(4, "0");

    if (bootTick < 22) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 384, 264);
      const h = Math.max(2, (bootTick / 22) * 264);
      const w = Math.min(384, 60 + bootTick * 16);
      ctx.fillStyle = "#e0f2fe";
      ctx.fillRect(192 - w / 2, 132 - h / 2, w, h);
      return;
    }

    if (bootTick === 23) {
      sysState = "POST";
      logArc("BOOTLOADER: LuferOS boot Arcade v1.2 verificando ROMs...", "log-sys");
    }

    ctx.fillStyle = "#040711";
    ctx.fillRect(0, 0, 384, 264);

    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(0, 0, 384, 22);
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 10px monospace";
    ctx.fillText("★ LuferOS boot Arcade v1.2 — ROM & RAM CHECK ★", 12, 14);

    const memIndex = Math.floor((bootTick - 25) / 12);
    if (bootTick >= 25 && (bootTick - 25) % 12 === 0 && memIndex < memTests.length) {
      memTests[memIndex].status = "OK";
      playWsgTone(660 + memIndex * 90, 0.04, "square", 0.04, 0);
      logArc("POST MEM CHECK: " + memTests[memIndex].name + " -> OK", "log-ok");
    }

    ctx.font = "bold 8.5px monospace";
    for (let i = 0; i < memTests.length; i++) {
      const y = 36 + i * 14;
      ctx.fillStyle = "#93c5fd";
      ctx.fillText(memTests[i].name, 10, y);
      const st = memTests[i].status;
      ctx.fillStyle = st === "OK" ? "#4ade80" : "#facc15";
      ctx.fillText(st === "OK" ? "[ PASS OK ]" : "[ CHECK.. ]", 295, y);
    }

    ctx.fillStyle = "#38bdf8";
    ctx.fillText("ROMSET VERIFICATION (" + GAME_TITLE + "):", 10, 118);

    const romStartTick = 25 + memTests.length * 12 + 5;
    if (bootTick >= romStartTick && (bootTick - romStartTick) % 12 === 0 && currentChipIdx < chipResults.length) {
      const chip = chipResults[currentChipIdx];
      chip.status = "CRC OK";
      tCrc.textContent = "CRC:" + chip.crc;
      playWsgTone(880 + currentChipIdx * 60, 0.04, "triangle", 0.05, 0);
      logArc("ROM BANK [" + chip.name + "] CRC32:" + chip.crc + " -> VERIFIED OK", "log-ok");
      currentChipIdx++;
    }

    for (let i = 0; i < Math.min(6, chipResults.length); i++) {
      const c = chipResults[i];
      const y = 134 + i * 14;
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(c.name.padEnd(16, " "), 12, y);
      ctx.fillStyle = "#a5f3fc";
      ctx.fillText("CRC:" + c.crc, 145, y);
      ctx.fillStyle = c.status === "CRC OK" ? "#4ade80" : "#f59e0b";
      ctx.fillText(c.status, 295, y);
    }

    const totalNeeded = romStartTick + chipResults.length * 12 + 16;
    const progress = Math.min(100, Math.round((bootTick / totalNeeded) * 100));
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(10, 238, 364, 14);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(10, 238, (364 * progress) / 100, 14);
    ctx.fillStyle = "#000";
    ctx.fillText("BOOT PROGRESS: " + progress + "%", 142, 248);

    if (bootTick >= totalNeeded) {
      sysState = "CROSSHATCH";
      bootTick = 0;
      logArc("ALL ROM BANKS & CRC32 VERIFIED. Iniciando Test CRT RGB...", "log-sys");
    }
  }

  function renderCrosshatchScreen() {
    bootTick++;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 384, 264);

    ctx.strokeStyle = "#475569";
    for (let x = 0; x <= 384; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 264); ctx.stroke();
    }
    for (let y = 0; y <= 264; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(384, y); ctx.stroke();
    }

    const bars = ["#ef4444", "#22c55e", "#3b82f6", "#facc15", "#a855f7", "#06b6d4", "#ffffff"];
    bars.forEach(function(col, idx) {
      ctx.fillStyle = col;
      ctx.fillRect(48 + idx * 42, 92, 36, 56);
    });

    ctx.fillStyle = "#000";
    ctx.fillRect(72, 168, 240, 24);
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 9.5px monospace";
    ctx.fillText("LuferOS boot Arcade v1.2 — BOOT NORMAL OK", 78, 183);

    if (bootTick >= 38) {
      sysState = "ATTRACT";
      bootTick = 0;
      pwrLed.className = "on";
      pwrStatus.textContent = "JAMMA ON";
      dbgState.textContent = "🟢 ARCADE RUNNING • " + GAME_TITLE;
      logArc("BOOT COMPLETE: Lanzando [" + GAME_TITLE + "] en núcleo " + activeCore.toUpperCase() + ".", "log-ok");
      logArc("Pulsa [🪙 COIN] y luego [👤 1P START] para jugar.", "log-sys");
    }
  }

  function renderAttractTitleScreen() {
    bootTick++;
    ctx.fillStyle = "#04050c";
    ctx.fillRect(0, 0, 384, 264);

    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 18, 344, 66);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fde047";
    ctx.font = "italic 900 20px Impact, Arial Black, sans-serif";
    ctx.fillText(GAME_TITLE.slice(0, 24), 192, 48);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 9px monospace";
    ctx.fillText("LUFEROS BOOT ARCADE V1.2 • CORE: " + activeCore.toUpperCase(), 192, 70);

    if (activeCore === "pacman") {
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 10px monospace";
      ctx.fillText("CHARACTER  /  NICKNAME", 192, 104);
      const demoGhosts = [
        { c: "#ef4444", t: "-SHADOW    \"BLINKY\"" },
        { c: "#f472b6", t: "-SPEEDY    \"PINKY\"" },
        { c: "#22d3ee", t: "-BASHFUL   \"INKY\"" },
        { c: "#fb923c", t: "-POKEY     \"CLYDE\"" }
      ];
      ctx.textAlign = "left";
      demoGhosts.forEach(function(dg, idx) {
        const y = 122 + idx * 16;
        ctx.fillStyle = dg.c;
        ctx.fillRect(92, y - 8, 10, 10);
        ctx.fillText(dg.t, 114, y);
      });
      ctx.textAlign = "center";
    } else {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 10px monospace";
      ctx.fillText("ARQUITECTURA DE SALON RECREATIVO LISTA", 192, 136);
    }

    if ((bootTick & 16) === 0) {
      ctx.fillStyle = credits > 0 ? "#4ade80" : "#facc15";
      ctx.font = "bold 12px monospace";
      ctx.fillText(credits > 0 ? "PULSA [1P START] PARA JUGAR" : "INSERT COIN — PULSA [🪙 COIN]", 192, 212);
    }

    ctx.fillStyle = "#f87171";
    ctx.font = "bold 10px monospace";
    ctx.fillText("CREDIT(S): " + credits + "  •  CRC32: 0x" + masterCrc, 192, 242);
    ctx.textAlign = "left";
  }

  let frames = 0;
  let lastFpsStamp = performance.now();

  function mainLoop(now) {
    requestAnimationFrame(mainLoop);
    frames++;
    if (now - lastFpsStamp >= 500) {
      const fps = Math.min(60, Math.round((frames * 1000) / (now - lastFpsStamp)));
      frames = 0;
      lastFpsStamp = now;
      if (sysState !== "OFF") tFps.textContent = "FPS: " + fps;
    }

    if (sysState === "OFF") renderPowerOffScreen();
    else if (sysState === "DEGAUSS" || sysState === "POST") renderDegaussAndPost();
    else if (sysState === "CROSSHATCH") renderCrosshatchScreen();
    else if (sysState === "ATTRACT") renderAttractTitleScreen();
    else if (sysState === "GAME") {
      if (activeCore === "pacman") updateAndRenderPacman();
      else if (activeCore === "galaga") renderGalagaScreen();
      else renderFighterOrSlugScreen();
    }
  }

  function startSelectedGame() {
    sysState = "GAME";
    if (activeCore === "pacman") {
      initPacmanMaze(true);
      playPacmanStartJingle();
    } else if (activeCore === "galaga") {
      galScore = 0;
      initGalagaStage();
      playWsgTone(587.33, 0.2, "square", 0.07, 260);
    } else {
      p1.hp = 100;
      cpuFoe.hp = 100;
      playWsgTone(587.33, 0.2, "square", 0.07, 260);
    }
    logArc("1P START PRESSED: Ejecutando [" + GAME_TITLE + "] en modo " + activeCore.toUpperCase() + ".", "log-ok");
  }

  function setupInputs() {
    btnPower.addEventListener("click", function(e) {
      e.preventDefault();
      powerOnCabinet();
    });

    canvas.addEventListener("pointerdown", function(e) {
      e.preventDefault();
      if (sysState === "OFF") powerOnCabinet();
      else if (sysState === "ATTRACT") {
        if (credits <= 0) credits = 1;
        credits--;
        btnCoin.textContent = "🪙 COIN (" + credits + ")";
        tCred.textContent = "CREDITS: " + credits;
        startSelectedGame();
      }
    });

    btnCoin.addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      if (sysState === "OFF") {
        powerOnCabinet();
      }
      credits = Math.min(99, credits + 1);
      btnCoin.textContent = "🪙 COIN (" + credits + ")";
      tCred.textContent = "CREDITS: " + credits;
      playCoinChime();
      logArc("JAMMA COIN SWITCH #1: Crédito insertado (Total: " + credits + ")", "log-ok");
    });

    document.getElementById("btn-start").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      if (sysState === "OFF") {
        powerOnCabinet();
        return;
      }
      if (sysState === "DEGAUSS" || sysState === "POST" || sysState === "CROSSHATCH") {
        sysState = "ATTRACT";
        pwrLed.className = "on";
        pwrStatus.textContent = "JAMMA ON";
        logArc("BOOT FAST-SKIP: Saltando directo a Attract Mode.", "log-sys");
        return;
      }
      if (credits <= 0) {
        credits = 1;
        logArc("FREE PLAY AUTO-COIN: +1 Crédito asignado.", "log-sys");
      }
      credits--;
      btnCoin.textContent = "🪙 COIN (" + credits + ")";
      tCred.textContent = "CREDITS: " + credits;
      startSelectedGame();
    });

    document.getElementById("btn-service").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      resetBootDiagnostics();
      sysState = "DEGAUSS";
      bootTick = 22;
      logArc("SERVICE SWITCH: Ejecutando verificación de ROMs y RAM...", "log-warn");
    });

    document.getElementById("btn-reboot-boot").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      sysState = "OFF";
      powerOnCabinet();
    });

    document.getElementById("btn-action-macro").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      triggerSpecialMove();
    });

    document.getElementById("btn-game-switch").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      const order = ["pacman", "galaga", "slug", "fighter"];
      const titles = {
        pacman: "PAC-MAN / PUCKMAN (NAMCO)",
        galaga: "GALAGA '88 (NAMCO)",
        slug: "METAL SLUG X (NEO-GEO)",
        fighter: "STREET FIGHTER II' (CPS-II)"
      };
      const nextIdx = (order.indexOf(activeCore) + 1) % order.length;
      activeCore = order[nextIdx];
      GAME_TITLE = titles[activeCore];
      romBadgeLbl.textContent = GAME_TITLE;
      updateBoardLabels();
      if (sysState === "GAME") startSelectedGame();
      logArc("PLACA CONMUTADA A: " + GAME_TITLE, "log-ok");
    });

    const btnLogs = document.getElementById("btn-logs-toggle");
    btnLogs.addEventListener("click", function(e) {
      e.preventDefault();
      const hidden = dbgPanel.classList.toggle("collapsed");
      btnLogs.classList.toggle("active", !hidden);
      btnLogs.textContent = hidden ? "📟 LOGS (OFF)" : "📟 LOGS (ON)";
    });

    document.getElementById("btn-clear-log").addEventListener("click", function(e) {
      e.preventDefault();
      dbgLog.innerHTML = "";
      logArc("Consola de logs limpiada.", "log-sys");
    });

    document.getElementById("btn-copy-log").addEventListener("click", function(e) {
      e.preventDefault();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(logHistory.join("\\n")).then(function() {
          logArc("Logs copiados al portapapeles OK.", "log-ok");
        }).catch(function(){});
      }
    });

    const joyBall = document.getElementById("joy-ball");
    function updateStickVisual() {
      const dx = keys.left ? -10 : keys.right ? 10 : 0;
      const dy = keys.up ? -10 : keys.down ? 10 : 0;
      joyBall.style.transform = "translate(" + dx + "px," + dy + "px)";
    }

    document.querySelectorAll("[data-key]").forEach(function(btn) {
      const k = btn.getAttribute("data-key");
      const down = function(e) {
        if (e && e.cancelable) e.preventDefault();
        unlockAudio();
        btn.classList.add("touching");
        keys[k] = true;
        updateStickVisual();
      };
      const up = function(e) {
        if (e && e.cancelable) e.preventDefault();
        btn.classList.remove("touching");
        keys[k] = false;
        updateStickVisual();
      };
      btn.addEventListener("touchstart", down, { passive: false });
      btn.addEventListener("touchend", up, { passive: false });
      btn.addEventListener("touchcancel", up, { passive: false });
      btn.addEventListener("mousedown", down);
      btn.addEventListener("mouseup", up);
      btn.addEventListener("mouseleave", up);
    });

    const kbMap = {
      ArrowUp: "up", KeyW: "up",
      ArrowDown: "down", KeyS: "down",
      ArrowLeft: "left", KeyA: "left",
      ArrowRight: "right", KeyD: "right",
      KeyZ: "lp", KeyX: "mp", KeyC: "hp", Space: "lp"
    };
    window.addEventListener("keydown", function(e) {
      const k = kbMap[e.code];
      if (k) { e.preventDefault(); unlockAudio(); keys[k] = true; updateStickVisual(); }
    });
    window.addEventListener("keyup", function(e) {
      const k = kbMap[e.code];
      if (k) { e.preventDefault(); keys[k] = false; updateStickVisual(); }
    });
  }

  async function initArcadeMachine() {
    setupInputs();
    updateBoardLabels();
    initPacmanMaze(true);
    logArc("Gabinete LuferOS boot Arcade v1.2 en STANDBY.", "log-sys");
    try {
      romBytes = await gunzipBase64ToBytes(ROM_GZIP_B64);
      masterCrc = calcRuntimeCrc32(romBytes);
      tCrc.textContent = "CRC:" + masterCrc;
      logArc(
        "ROMSET montado: [" + GAME_TITLE + "] | Placa: " + activeCore.toUpperCase() + " | Chips: " + ROM_CHIPS.length + " | CRC32: 0x" + masterCrc,
        "log-ok"
      );
      logArc("Pulsa el botón [⚡ POWER ON] para arrancar el gabinete.", "log-warn");
    } catch (e) {
      logArc("ERR descomprimiendo ROM: " + (e && e.message ? e.message : String(e)), "log-err");
    }
    requestAnimationFrame(mainLoop);
  }

  initArcadeMachine();
})();`;

  return html
    .replace("__GAME_TITLE__", () => options.gameTitle)
    .replace("__ARCADE_SCRIPT__", () => script);
}

export default {
  name: ["arcade", "cps", "cps1", "cps2", "maquinita", "mame", "pacman"],
  category: "group",
  description:
    "Sistema LuferOS boot Arcade v1.2 con autodetección de ROMs (Pac-Man/PuckMan, Galaga, Metal Slug, SF2), POST CRC32 y consola de logs.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    await react("🕹️").catch(() => undefined);

    try {
      const isInlineFallback = args.some((a) =>
        ["inline", "lite", "burbuja"].includes(a.toLowerCase()),
      );
      const cleanArgs = args.filter(
        (a) => !["inline", "lite", "burbuja"].includes(a.toLowerCase()),
      );
      const subCommand = String(cleanArgs[0] || "").toLowerCase();

      if (subCommand === "list" || subCommand === "lista") {
        const saved = fs
          .readdirSync(CACHE_DIR)
          .filter((f) => /\.(zip|bin|rom)$/i.test(f));

        const listTxt = saved.length
          ? saved
              .map((f, i) => {
                const kb = Math.ceil(fs.statSync(path.join(CACHE_DIR, f)).size / 1024);
                return `${i + 1}. \`${f.replace(/\.(zip|bin|rom)$/i, "")}\` (${kb} KB)`;
              })
              .join("\n")
          : "• `pacman` (Pac-Man / PuckMan Namco Z80 Integrado)\n• `galaga` (Galaga Namco Integrado)\n• `slug` (Metal Slug Neo-Geo Integrado)\n• `sf2` (Street Fighter II' CPS-II Integrado)";

        return reply(
          `╭〔 🕹️ ${fytBold("LuferOS boot Arcade v1.2")} 〕⬣\n` +
            `${listTxt}\n` +
            `╰━━━━━━━━━━━━⬣\n` +
            `• Jugar Pac-Man: \`${prefix}arcade pacman\`\n` +
            `• Jugar Galaga: \`${prefix}arcade galaga\`\n` +
            `• Guardar ROM .zip: Responde al archivo con \`${prefix}arcade save <Nombre>\``,
        );
      }

      const defaultSet = createDefaultPacmanRom();
      let payloadBuffer = defaultSet.payload;
      let chipsList = defaultSet.chips;
      let gameTitle = "PAC-MAN / PUCKMAN • NAMCO";

      const quotedDoc = await downloadQuotedDocumentBuffer(msg);

      if (quotedDoc) {
        const requestedName =
          subCommand === "save" && cleanArgs[1]
            ? cleanArgs.slice(1).join("_")
            : cleanArgs.length > 0 && subCommand !== "save"
              ? cleanArgs.join("_")
              : quotedDoc.fileName.replace(/\.(zip|bin|rom)$/i, "");

        const safeBase = requestedName.replace(/[^a-zA-Z0-9._-]/g, "_") || "pacman";

        if (isZipBuffer(quotedDoc.buffer)) {
          const parsed = inspectAndExtractArcadeZip(quotedDoc.buffer, safeBase);
          payloadBuffer = parsed.payload;
          chipsList = parsed.chips;
          gameTitle = `${parsed.gameName} • ARCADE`;
          fs.writeFileSync(path.join(CACHE_DIR, `${safeBase}.zip`), quotedDoc.buffer);
        } else {
          payloadBuffer = quotedDoc.buffer.subarray(
            0,
            Math.min(quotedDoc.buffer.length, MAX_SAFE_ROM_BYTES),
          );
          chipsList = [
            {
              name: `${safeBase.toUpperCase().slice(0, 12)}.BIN`,
              size: quotedDoc.buffer.length,
              crc: computeCrc32Hex(payloadBuffer),
            },
          ];
          gameTitle = `${safeBase.toUpperCase()} • ARCADE`;
          fs.writeFileSync(path.join(CACHE_DIR, `${safeBase}.bin`), payloadBuffer);
        }
      } else if (subCommand === "save" && !quotedDoc) {
        return reply(
          `⚠️ Responde a un archivo ROM \`.zip\` o \`.bin\` con \`${prefix}arcade save <Nombre>\` para guardarlo en el gabinete.`,
        );
      } else if (cleanArgs.length > 0) {
        const query = cleanArgs.join(" ").trim();
        const found = getStoredArcadeRom(query);
        if (found) {
          if (isZipBuffer(found.buffer)) {
            const parsed = inspectAndExtractArcadeZip(found.buffer, found.fileName);
            payloadBuffer = parsed.payload;
            chipsList = parsed.chips;
            gameTitle = `${parsed.gameName} • ARCADE`;
          } else {
            payloadBuffer = found.buffer.subarray(
              0,
              Math.min(found.buffer.length, MAX_SAFE_ROM_BYTES),
            );
            chipsList = [
              {
                name: found.fileName.toUpperCase().slice(0, 15),
                size: found.buffer.length,
                crc: computeCrc32Hex(payloadBuffer),
              },
            ];
            gameTitle = `${found.fileName.replace(/\.(zip|bin|rom)$/i, "").toUpperCase()} • ARCADE`;
          }
        } else {
          gameTitle = `${query.toUpperCase()} • ARCADE`;
        }
      } else {
        const savedPacman = getStoredArcadeRom("pacman") || getStoredArcadeRom("puckman");
        if (savedPacman && isZipBuffer(savedPacman.buffer)) {
          const parsed = inspectAndExtractArcadeZip(savedPacman.buffer, savedPacman.fileName);
          payloadBuffer = parsed.payload;
          chipsList = parsed.chips;
          gameTitle = `${parsed.gameName} • ARCADE`;
        }
      }

      const initialCore = detectArcadeCoreType(gameTitle, chipsList);
      const romGzipB64 = zlib.gzipSync(payloadBuffer, { level: 9 }).toString("base64");
      const HTML = buildArcadeCabinetHtml({
        romGzipB64,
        chipsJson: JSON.stringify(chipsList),
        gameTitle,
        initialCore,
      });

      const uniqueResponseId = `LuferOS_ARCADE_${randomUUID().replace(/-/g, "")}`;

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
                    text: `🕹️ *LuferOS boot Arcade v1.2* • ${gameTitle}\n_Abre el gabinete inferior y pulsa_ *⚡ POWER ON* _para iniciar la comprobación de chips y arrancar el juego._`,
                  },
                },
              },
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "GenAIBotProgressStatusPrimitive",
                    title: `🕹️ LuferOS boot Arcade v1.2 (${gameTitle})`,
                    is_in_progress: true,
                  },
                },
              },
            ],
            embedded_screens: [
              {
                title: `LuferOS boot Arcade v1.2`,
                content: [
                  {
                    __typename: "FOAIDNixelButtonSheets",
                    tabs: [
                      {
                        id: "tab_0",
                        tab_header: "LuferOS boot Arcade v1.2",
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
              messageDisclaimerText: "LuferOS boot Arcade v1.2",
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
        `❌ ${fytBold("LuferOS boot Arcade v1.2:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
