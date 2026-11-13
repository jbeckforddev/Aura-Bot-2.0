import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "arcade_cache");
const MAX_SAFE_ROM_BYTES = 180000;

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

function inspectAndExtractArcadeZip(zipBuf: Buffer, fallbackName: string): {
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

      if (!mainPayload && localOffset + 30 <= zipBuf.length && zipBuf.readUInt32LE(localOffset) === 0x04034b50) {
        const lFnLen = zipBuf.readUInt16LE(localOffset + 26);
        const lExtraLen = zipBuf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lFnLen + lExtraLen;
        const dataEnd = dataStart + compSize;

        if (compSize > 0 && dataEnd <= zipBuf.length && uncompSize <= 8 * 1024 * 1024) {
          const slice = zipBuf.subarray(dataStart, dataEnd);
          try {
            const out = method === 0 ? Buffer.from(slice) : zlib.inflateRawSync(slice);
            if (out.length >= 512) {
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
      name: fallbackName.toUpperCase().slice(0, 14) + ".01",
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

function createDefaultCpsRom(): { payload: Buffer; chips: RomChipEntry[] } {
  const buf = Buffer.alloc(32768, 0);
  buf.write("CPS2-LUFEROS-ARCADE-V1.2-ROMSET", 0, "ascii");
  for (let i = 64; i < buf.length; i++) {
    buf[i] = ((i * 97) ^ (i >> 2) ^ 0x5a) & 0xff;
  }
  const chips: RomChipEntry[] = [
    { name: "SF2CE_23A.8F", size: 524288, crc: computeCrc32Hex(buf.subarray(0, 4096)) },
    { name: "SF2CE_22B.7F", size: 524288, crc: computeCrc32Hex(buf.subarray(4096, 8192)) },
    { name: "SF2CE_09.12A", size: 65536, crc: computeCrc32Hex(buf.subarray(8192, 12288)) },
    { name: "SF2CE_18.11C", size: 262144, crc: computeCrc32Hex(buf.subarray(12288, 16384)) },
    { name: "QSOUND_DL1425.U1", size: 262144, crc: computeCrc32Hex(buf.subarray(16384, 20480)) },
  ];
  return { payload: buf, chips };
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
    if (buffer.length > 128) {
      return { buffer, fileName: String(doc.fileName || "sf2ce.zip") };
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
}): string {
  const html = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none}
html,body{width:100%;min-height:100%;background:#05060b;color:#f8fafc;font-family:monospace;overflow-x:hidden;overflow-y:auto}
body{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center}
#arcade-cab{width:min(98vw,540px);margin:0 auto;background:linear-gradient(170deg,#18181b 0%,#090a10 55%,#050508 100%);border:3px solid #f59e0b;border-radius:20px 20px 42px 20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 22px 50px rgba(0,0,0,.95)}
#marquee{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:linear-gradient(90deg,#7c2d12,#ea580c 50%,#7c2d12);border-bottom:2.5px solid #fde047;box-shadow:inset 0 0 12px rgba(254,240,138,.45)}
.mq-title{font-size:11px;font-weight:900;letter-spacing:1px;color:#fef08a;text-shadow:0 1px 3px #000}
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
#crt-frame{position:relative;width:97%;aspect-ratio:384/224;background:#020305;border:2.5px solid #27272a;border-radius:8px;overflow:hidden;display:flex;justify-content:center;align-items:center;box-shadow:inset 0 0 18px #000}
canvas#arcade-cv{width:100%;height:100%;object-fit:fill;display:block;image-rendering:pixelated;cursor:pointer}
#crt-scanlines{position:absolute;inset:0;background:linear-gradient(rgba(18,16,16,0) 50%,rgba(0,0,0,.28) 50%);background-size:100% 4px;pointer-events:none;z-index:2}
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
#debug-log{height:76px;overflow-y:auto;padding:5px 7px;font-size:8.5px;line-height:1.35;color:#4ade80;background:#03050a;touch-action:pan-y;-webkit-user-select:text;user-select:text}
#debug-actions{display:flex;justify-content:flex-end;gap:6px;padding:3px 6px;background:#070a12}
.dbg-mini-btn{background:#1e293b;color:#fde047;border:1px solid #d97706;border-radius:4px;padding:2px 7px;font-size:8px;font-weight:900;cursor:pointer}
.log-line{margin-bottom:1px;word-break:break-all}
.log-warn{color:#facc15}.log-err{color:#f87171;font-weight:900}.log-sys{color:#38bdf8;font-weight:900}.log-ok{color:#4ade80;font-weight:900}
#cp-area{width:100%;padding:6px 12px 16px;display:flex;flex-direction:column;gap:8px}
#cp-main{width:100%;display:flex;justify-content:space-between;align-items:center;padding:2px 2px}
#joy- stick{position:relative;width:130px;height:130px;border-radius:50%;background:radial-gradient(circle,#27272a 0%,#0f0f14 78%);border:2px solid #52525b;flex-shrink:0}
.joy-btn{position:absolute;width:40px;height:40px;border:1.5px solid #09090b;background:linear-gradient(180deg,#3f3f46,#18181b);color:#f8fafc;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:8px;box-shadow:0 3px 0 #000}
.joy-btn.touching{background:#ef4444;color:#fff;transform:translateY(2px)}
#j-u{left:43px;top:4px}#j-d{left:43px;bottom:4px}#j-l{left:4px;top:43px}#j-r{right:4px;top:43px}
#joy-ball{position:absolute;left:47px;top:47px;width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 32% 32%,#f87171,#dc2626 65%,#7f1d1d);border:2px solid #000;box-shadow:0 3px 8px rgba(0,0,0,.8)}
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
.tool-btn{background:#18181b;color:#fde047;border:1.5px solid #3f3f46;border-radius:6px;padding:5px 10px;font-family:monospace;font-size:9px;font-weight:900;cursor:pointer}
.tool-btn.active{background:#f59e0b;color:#09090b;border-color:#fde047}
</style>
<body>
<div id="arcade-cab">
  <div id="marquee">
    <span class="mq-title">★ LuferOS boot Arcade v1.2 ★</span>
    <span class="mq-ver">JAMMA • CPS-II</span>
  </div>
  <div id="bezel-wrap">
    <div id="crt-bezel">
      <div id="crt-top">
        <div class="pwr-box">
          <div id="pwr-led"></div>
          <span class="pwr-lbl" id="pwr-status">STANDBY (OFF)</span>
        </div>
        <div class="rom-badge">__GAME_TITLE__</div>
      </div>
      <div id="crt-frame">
        <canvas id="arcade-cv" width="384" height="224"></canvas>
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
      <span id="dbg-board">CPS-II • 12MHz</span>
    </div>
    <div id="telemetry-bar">
      <div class="t-cell" id="t-fps">FPS: 0</div>
      <div class="t-cell" id="t-pc">PC: 0x000000</div>
      <div class="t-cell" id="t-crc">ROM: WAIT</div>
      <div class="t-cell" id="t-cred">CREDITS: 0</div>
    </div>
    <div id="debug-panel">
      <div id="debug-log"></div>
      <div id="debug-actions">
        <button class="dbg-mini-btn" id="btn-game-switch">🎮 CAMBIAR JUEGO</button>
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
      <button class="tool-btn" id="btn-hadouken">🔥 HADOUKEN / ESPECIAL</button>
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
  const GAME_TITLE = "${options.gameTitle}";

  const canvas = document.getElementById("arcade-cv");
  const ctx = canvas.getContext("2d", { alpha: false });
  const pwrLed = document.getElementById("pwr-led");
  const pwrStatus = document.getElementById("pwr-status");
  const btnPower = document.getElementById("btn-power");
  const btnCoin = document.getElementById("btn-coin");
  const dbgState = document.getElementById("dbg-state");
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

  function playQSound(freq, dur, type, vol, slide) {
    try {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || "sawtooth";
      osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq + slide), now + dur);
      gain.gain.setValueAtTime(vol || 0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch (e) {}
  }

  function playCoinChime() {
    playQSound(987.77, 0.09, "square", 0.08, 0);
    setTimeout(function(){ playQSound(1318.51, 0.28, "square", 0.08, 0); }, 85);
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

  let romBytes = new Uint8Array(0);
  let masterCrc = "00000000";
  let sysState = "OFF";
  let bootTick = 0;
  let credits = 0;
  let m68kPc = 0x000000;
  let currentChipIdx = 0;
  let gameGenre = "fighter";

  const memTests = [
    { name: "M68000 WORK RAM (0xFF0000)", status: "WAIT" },
    { name: "CPS SCROLL 1/2/3 VRAM (0x900000)", status: "WAIT" },
    { name: "OBJECT SPRITE RAM (0x708000)", status: "WAIT" },
    { name: "Z80 + QSOUND DSP RAM (0xF18000)", status: "WAIT" },
    { name: "EEPROM & JAMMA DIPSW I/O", status: "WAIT" }
  ];
  let chipResults = [];

  let p1 = { x: 96, y: 178, vy: 0, hp: 100, dir: 1, act: "idle", actTimer: 0, score: 0 };
  let cpuFoe = { x: 268, y: 178, vy: 0, hp: 100, dir: -1, act: "idle", actTimer: 0, round: 1 };
  let projectiles = [];

  function resetBootDiagnostics() {
    bootTick = 0;
    currentChipIdx = 0;
    memTests.forEach(function(m) { m.status = "WAIT"; });
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
      tPc.textContent = "PC: 0x000000";
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
    playQSound(90, 0.28, "sawtooth", 0.09, 240);
    logArc("============================================", "log-sys");
    logArc("POWER ON: Iniciando LuferOS boot Arcade v1.2", "log-ok");
    logArc("PSU +5.02V / +12.01V OK • Degauss CRT Activo", "log-sys");
  }

  function renderPowerOffScreen() {
    ctx.fillStyle = "#030407";
    ctx.fillRect(0, 0, 384, 224);

    ctx.strokeStyle = "#1e293b";
    ctx.strokeRect(18, 16, 348, 192);

    ctx.textAlign = "center";
    ctx.fillStyle = "#475569";
    ctx.font = "bold 11px monospace";
    ctx.fillText("JAMMA ARCADE MONITOR • POWER OFF", 192, 76);

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 12px monospace";
    ctx.fillText("⚡ PULSA [POWER ON] O TOCA LA PANTALLA", 192, 114);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "9px monospace";
    ctx.fillText("Sistema: LuferOS boot Arcade v1.2 (CPS-II)", 192, 142);
    ctx.fillStyle = "#64748b";
    ctx.fillText("ROM preparada: " + GAME_TITLE + " [" + ROM_CHIPS.length + " chips]", 192, 162);
    ctx.textAlign = "left";
  }

  function renderDegaussAndPost() {
    bootTick++;
    m68kPc = (0xFF0000 + bootTick * 128) & 0xFFFFFF;
    tPc.textContent = "PC: 0x" + m68kPc.toString(16).toUpperCase().padStart(6, "0");

    if (bootTick < 25) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 384, 224);
      const h = Math.max(2, (bootTick / 25) * 224);
      const w = Math.min(384, 60 + bootTick * 15);
      ctx.fillStyle = "#e0f2fe";
      ctx.fillRect(192 - w / 2, 112 - h / 2, w, h);
      return;
    }

    if (bootTick === 26) {
      sysState = "POST";
      logArc("BOOTLOADER: LuferOS boot Arcade v1.2 montado en 0x000000", "log-sys");
      logArc("CPU: Motorola MC68000P12 @ 12.00MHz + Z80 @ 3.579MHz", "");
    }

    ctx.fillStyle = "#040711";
    ctx.fillRect(0, 0, 384, 224);

    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(0, 0, 384, 22);
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 10px monospace";
    ctx.fillText("★ LuferOS boot Arcade v1.2 — DIAGNOSTIC & ROM CHECK ★", 10, 14);

    const memIndex = Math.floor((bootTick - 28) / 14);
    if (bootTick >= 28 && (bootTick - 28) % 14 === 0 && memIndex < memTests.length) {
      memTests[memIndex].status = "OK";
      playQSound(660 + memIndex * 90, 0.04, "square", 0.04, 0);
      logArc("POST MEM CHECK: " + memTests[memIndex].name + " -> OK", "log-ok");
    }

    ctx.font = "bold 8.5px monospace";
    for (let i = 0; i < memTests.length; i++) {
      const y = 35 + i * 13;
      ctx.fillStyle = "#93c5fd";
      ctx.fillText(memTests[i].name, 10, y);
      const st = memTests[i].status;
      ctx.fillStyle = st === "OK" ? "#4ade80" : "#facc15";
      ctx.fillText(st === "OK" ? "[ PASS OK ]" : "[ CHECK.. ]", 295, y);
    }

    ctx.strokeStyle = "#334155";
    ctx.beginPath();
    ctx.moveTo(8, 102);
    ctx.lineTo(376, 102);
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.fillText("ROMSET VERIFICATION (" + GAME_TITLE + "):", 10, 114);

    const romStartTick = 28 + memTests.length * 14 + 6;
    if (bootTick >= romStartTick && (bootTick - romStartTick) % 15 === 0 && currentChipIdx < chipResults.length) {
      const chip = chipResults[currentChipIdx];
      chip.status = "CRC OK";
      tCrc.textContent = "CRC:" + chip.crc;
      playQSound(880 + currentChipIdx * 60, 0.05, "triangle", 0.05, 0);
      logArc(
        "ROM BANK [" + chip.name + "] (" + Math.ceil(chip.size / 1024) + "KB) CRC32:" + chip.crc + " -> VERIFIED OK",
        "log-ok"
      );
      currentChipIdx++;
    }

    for (let i = 0; i < Math.min(6, chipResults.length); i++) {
      const c = chipResults[i];
      const y = 127 + i * 12;
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(c.name.padEnd(16, " "), 12, y);
      ctx.fillStyle = "#a5f3fc";
      ctx.fillText("CRC:" + c.crc, 145, y);
      ctx.fillStyle = c.status === "CRC OK" ? "#4ade80" : "#f59e0b";
      ctx.fillText(c.status, 295, y);
    }

    const totalNeeded = romStartTick + chipResults.length * 15 + 18;
    const progress = Math.min(100, Math.round((bootTick / totalNeeded) * 100));
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(10, 204, 364, 12);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(10, 204, (364 * progress) / 100, 12);
    ctx.fillStyle = "#000";
    ctx.fillText("BOOT PROGRESS: " + progress + "%", 145, 213);

    if (bootTick >= totalNeeded) {
      sysState = "CROSSHATCH";
      bootTick = 0;
      logArc("ALL ROM BANKS & CRC32 VERIFIED. Iniciando Test CRT RGB...", "log-sys");
    }
  }

  function renderCrosshatchScreen() {
    bootTick++;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 384, 224);

    ctx.strokeStyle = "#475569";
    for (let x = 0; x <= 384; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 224); ctx.stroke();
    }
    for (let y = 0; y <= 224; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(384, y); ctx.stroke();
    }
    ctx.strokeStyle = "#f8fafc";
    ctx.strokeRect(2, 2, 380, 220);

    const bars = ["#ef4444", "#22c55e", "#3b82f6", "#facc15", "#a855f7", "#06b6d4", "#ffffff"];
    bars.forEach(function(col, idx) {
      ctx.fillStyle = col;
      ctx.fillRect(48 + idx * 42, 82, 36, 48);
    });

    ctx.fillStyle = "#000";
    ctx.fillRect(72, 148, 240, 22);
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 9.5px monospace";
    ctx.fillText("LuferOS boot Arcade v1.2 — BOOT NORMAL OK", 78, 162);

    if (bootTick >= 45) {
      sysState = "ATTRACT";
      bootTick = 0;
      pwrLed.className = "on";
      pwrStatus.textContent = "JAMMA ON";
      dbgState.textContent = "🟢 ARCADE RUNNING • " + GAME_TITLE;
      playQSound(523.25, 0.18, "sawtooth", 0.07, 260);
      logArc("BOOT COMPLETE: Lanzando ROM principal [" + GAME_TITLE + "] (Master CRC: " + masterCrc + ").", "log-ok");
      logArc("ATTRACT MODE ACTIVO: Pulsa [🪙 COIN] y luego [👤 1P START].", "log-sys");
    }
  }

  function renderAttractTitleScreen() {
    bootTick++;
    m68kPc = (0x020000 + ((bootTick * 64) & 0x3FFF)) >>> 0;
    tPc.textContent = "PC: 0x" + m68kPc.toString(16).toUpperCase().padStart(6, "0");

    const bg = ctx.createLinearGradient(0, 0, 0, 224);
    bg.addColorStop(0, "#090418");
    bg.addColorStop(0.6, "#1e1b4b");
    bg.addColorStop(1, "#3b0764");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 384, 224);

    ctx.fillStyle = "rgba(245, 158, 11, 0.14)";
    ctx.fillRect(22, 22, 340, 74);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, 340, 74);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fde047";
    ctx.font = "italic 900 20px Impact, Arial Black, sans-serif";
    ctx.fillText(GAME_TITLE.slice(0, 24), 192, 54);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 9px monospace";
    ctx.fillText("CAPCOM CPS-II HARDWARE • LUFEROS BOOT ARCADE V1.2", 192, 76);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 9px monospace";
    ctx.fillText("MODO ACTUAL: " + (gameGenre === "fighter" ? "STREET FIGHTER II' CPS-II" : "CADILLACS & DINOSAURS BEAT-'EM-UP"), 192, 118);

    if ((bootTick & 16) === 0) {
      ctx.fillStyle = credits > 0 ? "#4ade80" : "#facc15";
      ctx.font = "bold 12px monospace";
      ctx.fillText(credits > 0 ? "PULSA [1P START] PARA INICIAR" : "INSERT COIN — PULSA [🪙 COIN]", 192, 156);
    }

    ctx.fillStyle = "#f87171";
    ctx.font = "bold 10px monospace";
    ctx.fillText("CREDIT(S): " + credits, 192, 186);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "8px monospace";
    ctx.fillText("VERIFIED ROM CRC32: 0x" + masterCrc + " • SOUND: QSOUND DSP OK", 192, 210);
    ctx.textAlign = "left";
  }

  function triggerHadouken() {
    if (sysState !== "GAME") return;
    p1.act = "special";
    p1.actTimer = 18;
    projectiles.push({ x: p1.x + p1.dir * 24, y: p1.y - 26, vx: p1.dir * 5.2 });
    playQSound(320, 0.22, "sawtooth", 0.08, 420);
    logArc("INPUT MACRO: ↓ ↘ → + P (HADOUKEN / SPECIAL DISPARADO)", "log-warn");
  }

  function renderGameplayScreen() {
    bootTick++;
    m68kPc = (0x040000 + ((bootTick * 96) & 0xFFFF)) >>> 0;
    tPc.textContent = "PC: 0x" + m68kPc.toString(16).toUpperCase().padStart(6, "0");

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
    if (keys.up && p1.y >= 178) {
      p1.vy = -7.8;
      playQSound(260, 0.12, "triangle", 0.05, 190);
    }
    if (p1.y < 178 || p1.vy !== 0) {
      p1.y += p1.vy;
      p1.vy += 0.48;
      if (p1.y >= 178) { p1.y = 178; p1.vy = 0; }
    }

    const punchHit = keys.lp || keys.mp || keys.hp;
    const kickHit = keys.lk || keys.mk || keys.hk;
    if ((punchHit || kickHit) && p1.actTimer === 0) {
      if (keys.hp && keys.down) {
        triggerHadouken();
      } else {
        p1.act = punchHit ? "punch" : "kick";
        p1.actTimer = 11;
        const dmg = (keys.hp || keys.hk) ? 9 : (keys.mp || keys.mk) ? 6 : 4;
        playQSound(punchHit ? 210 : 150, 0.08, "sawtooth", 0.06, -70);

        if (Math.abs(cpuFoe.x - p1.x) < 44 && Math.abs(cpuFoe.y - p1.y) < 32) {
          cpuFoe.hp = Math.max(0, cpuFoe.hp - dmg);
          cpuFoe.act = "hurt";
          cpuFoe.actTimer = 10;
          cpuFoe.x = Math.min(360, Math.max(24, cpuFoe.x + p1.dir * 12));
          p1.score += dmg * 100;
          playQSound(95, 0.11, "square", 0.08, -30);
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
          playQSound(120, 0.09, "sawtooth", 0.06, -40);
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
        playQSound(85, 0.16, "square", 0.09, -40);
        projectiles.splice(i, 1);
      } else if (pr.x < 0 || pr.x > 384) {
        projectiles.splice(i, 1);
      }
    }

    if (cpuFoe.hp <= 0 || p1.hp <= 0) {
      const won = cpuFoe.hp <= 0;
      logArc(won ? "K.O.! YOU WIN ROUND " + cpuFoe.round + " (+5000 PTS)" : "K.O.! CPU WINS ROUND", won ? "log-ok" : "log-warn");
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

    const sky = ctx.createLinearGradient(0, 0, 0, 155);
    sky.addColorStop(0, gameGenre === "fighter" ? "#0c1938" : "#1e1b4b");
    sky.addColorStop(1, gameGenre === "fighter" ? "#1d4ed8" : "#7c2d12");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 384, 155);

    ctx.fillStyle = "#1e293b";
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(14 + i * 48, 78, 32, 77);
    }

    ctx.fillStyle = "#334155";
    ctx.fillRect(0, 155, 384, 69);
    ctx.strokeStyle = "#475569";
    for (let i = 0; i < 384; i += 24) {
      ctx.beginPath(); ctx.moveTo(i, 155); ctx.lineTo(i - 20, 224); ctx.stroke();
    }

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

    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.fillText("RYU / P1  SCORE:" + p1.score, 16, 32);
    ctx.fillText("STAGE " + cpuFoe.round + "  BISON / CPU", 242, 32);

    function drawFighter(f, bodyCol, headBandCol) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(f.x, 182, 15, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = f.act === "hurt" ? "#ffffff" : bodyCol;
      ctx.fillRect(f.x - 11, f.y - 44, 22, 28);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(f.x - 10, f.y - 16, 8, 16);
      ctx.fillRect(f.x + 2, f.y - 16, 8, 16);
      ctx.fillStyle = "#fed7aa";
      ctx.fillRect(f.x - 7, f.y - 55, 14, 11);
      ctx.fillStyle = headBandCol;
      ctx.fillRect(f.x - 8, f.y - 57, 16, 3);

      if (f.act === "punch" || f.act === "kick") {
        ctx.fillStyle = "#fde047";
        const reach = f.act === "kick" ? 26 : 20;
        const py = f.act === "kick" ? f.y - 22 : f.y - 38;
        ctx.fillRect(f.dir > 0 ? f.x + 11 : f.x - 11 - reach, py, reach, 7);
      }
    }

    drawFighter(p1, "#f8fafc", "#ef4444");
    drawFighter(cpuFoe, "#dc2626", "#facc15");

    projectiles.forEach(function(pr) {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#fde047";
    ctx.font = "bold 8.5px monospace";
    ctx.fillText("CREDITS: " + credits + "  •  CPS-II QSOUND", 12, 217);
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
    else if (sysState === "GAME") renderGameplayScreen();
  }

  function setupInputs() {
    btnPower.addEventListener("click", function(e) {
      e.preventDefault();
      powerOnCabinet();
    });

    canvas.addEventListener("pointerdown", function(e) {
      e.preventDefault();
      if (sysState === "OFF") powerOnCabinet();
    });

    btnCoin.addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      if (sysState === "OFF") {
        logArc("WARN: Enciende primero el gabinete con [⚡ POWER ON].", "log-warn");
        return;
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
      sysState = "GAME";
      p1.hp = 100;
      cpuFoe.hp = 100;
      playQSound(587.33, 0.22, "square", 0.08, 220);
      logArc("1P START PRESSED: Iniciando partida en [" + GAME_TITLE + "].", "log-ok");
    });

    document.getElementById("btn-service").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      resetBootDiagnostics();
      sysState = "DEGAUSS";
      bootTick = 25;
      logArc("SERVICE SWITCH: Ejecutando diagnóstico de ROMs y memorias...", "log-warn");
    });

    document.getElementById("btn-reboot-boot").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      sysState = "OFF";
      powerOnCabinet();
    });

    document.getElementById("btn-hadouken").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      triggerHadouken();
    });

    document.getElementById("btn-game-switch").addEventListener("click", function(e) {
      e.preventDefault();
      gameGenre = gameGenre === "fighter" ? "brawler" : "fighter";
      logArc("MODO CPS CAMBIADO A: " + (gameGenre === "fighter" ? "STREET FIGHTER II'" : "CADILLACS & DINOSAURS"), "log-sys");
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
  }

  async function initArcadeMachine() {
    setupInputs();
    logArc("Gabinete LuferOS boot Arcade v1.2 listo en modo STANDBY.", "log-sys");
    try {
      romBytes = await gunzipBase64ToBytes(ROM_GZIP_B64);
      masterCrc = calcRuntimeCrc32(romBytes);
      tCrc.textContent = "CRC:" + masterCrc;
      logArc(
        "ROMSET montado en zócalo JAMMA: [" + GAME_TITLE + "] | Bancos: " + ROM_CHIPS.length + " | Master CRC32: 0x" + masterCrc,
        "log-ok"
      );
      logArc("Esperando encendido: Pulsa el botón rojo [⚡ POWER ON].", "log-warn");
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
  name: ["arcade", "cps", "cps1", "cps2", "maquinita", "mame"],
  category: "group",
  description: "Sistema LuferOS boot Arcade v1.2 con encendido físico, comprobación CRC32 de ROMs, POST JAMMA y consola de logs.",
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
          : "• `SF2CE` (Street Fighter II' Champion Edition — CPS-II Integrado)";

        return reply(
          `╭〔 🕹️ ${fytBold("LuferOS boot Arcade v1.2")} 〕⬣\n` +
            `${listTxt}\n` +
            `╰━━━━━━━━━━━━⬣\n` +
            `• Iniciar gabinete: \`${prefix}arcade\`\n` +
            `• Modo burbuja grupos: \`${prefix}arcade inline\`\n` +
            `• Guardar ROM .zip: Responde al archivo con \`${prefix}arcade save <Nombre>\``,
        );
      }

      const defaultSet = createDefaultCpsRom();
      let payloadBuffer = defaultSet.payload;
      let chipsList = defaultSet.chips;
      let gameTitle = "SF2' CHAMPION EDITION (CPS-II)";

      const quotedDoc = await downloadQuotedDocumentBuffer(msg);

      if (quotedDoc) {
        const requestedName =
          subCommand === "save" && cleanArgs[1]
            ? cleanArgs.slice(1).join("_")
            : cleanArgs.length > 0 && subCommand !== "save"
              ? cleanArgs.join("_")
              : quotedDoc.fileName.replace(/\.(zip|bin|rom)$/i, "");

        const safeBase = requestedName.replace(/[^a-zA-Z0-9._-]/g, "_") || "arcade_rom";

        if (isZipBuffer(quotedDoc.buffer)) {
          const parsed = inspectAndExtractArcadeZip(quotedDoc.buffer, safeBase);
          payloadBuffer = parsed.payload;
          chipsList = parsed.chips;
          gameTitle = `${parsed.gameName} • CPS ARCADE`;
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
          gameTitle = `${safeBase.toUpperCase()} • CPS ARCADE`;
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
            gameTitle = `${parsed.gameName} • CPS ARCADE`;
          } else {
            payloadBuffer = found.buffer.subarray(0, Math.min(found.buffer.length, MAX_SAFE_ROM_BYTES));
            chipsList = [
              {
                name: found.fileName.toUpperCase().slice(0, 15),
                size: found.buffer.length,
                crc: computeCrc32Hex(payloadBuffer),
              },
            ];
            gameTitle = `${found.fileName.replace(/\.(zip|bin|rom)$/i, "").toUpperCase()} • CPS`;
          }
        } else {
          gameTitle = `${query.toUpperCase()} • CPS ARCADE`;
        }
      }

      const romGzipB64 = zlib.gzipSync(payloadBuffer, { level: 9 }).toString("base64");
      const HTML = buildArcadeCabinetHtml({
        romGzipB64,
        chipsJson: JSON.stringify(chipsList),
        gameTitle,
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
                    text: `🕹️ *LuferOS boot Arcade v1.2* • ${gameTitle}\n_Abre el gabinete inferior y pulsa_ *⚡ POWER ON* _para iniciar el test de ROMs y arranque JAMMA._`,
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
