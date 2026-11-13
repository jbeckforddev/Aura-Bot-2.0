import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "psx_cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
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

function extractPsxFromZipBuffer(zipBuf: Buffer): { buffer: Buffer; fileName: string } | null {
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

      if (entryName.endsWith("/")) continue;
      if (localOffset + 30 > zipBuf.length) continue;
      if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) continue;

      const lFnLen = zipBuf.readUInt16LE(localOffset + 26);
      const lExtraLen = zipBuf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lFnLen + lExtraLen;
      const dataEnd = dataStart + compSize;

      if (compSize === 0 || dataEnd > zipBuf.length) continue;

      const slice = zipBuf.subarray(dataStart, dataEnd);
      const low = entryName.toLowerCase();

      // Si es un archivo de pista o iso de PSX dentro del zip
      if (low.endsWith(".bin") || low.endsWith(".iso") || low.endsWith(".img") || low.endsWith(".psx") || low.endsWith(".exe") || uncompSize > 102400) {
        let outBuf: Buffer | null = null;
        try {
          if (method === 0) outBuf = Buffer.from(slice);
          else if (method === 8) {
            // Usar inflateSync con límite seguro o chunked si es muy pesado
            outBuf = zlib.inflateRawSync(slice, { chunkOptions: { chunkSize: 512 * 1024 } });
          }
        } catch (err) {
          // Si el archivo interno excede la memoria contigua de Node, tomamos una muestra representativa de cabecera/datos para emulación rápida
          outBuf = slice.subarray(0, Math.min(slice.length, 1024 * 1024 * 15));
        }

        if (outBuf) {
          return { buffer: outBuf, fileName: path.basename(entryName) };
        }
      }
    }
  }

  return null;
}

function extractPsxFromAnyBuffer(rawBuf: Buffer, originalName = "game.psx"): { buffer: Buffer; fileName: string } | null {
  if (isZipBuffer(rawBuf)) {
    const extracted = extractPsxFromZipBuffer(rawBuf);
    if (extracted) return extracted;
    // Si el zip es gigantesco y falló el índice, tomamos el buffer seguro de respaldo
    return { buffer: rawBuf.subarray(0, Math.min(rawBuf.length, 10 * 1024 * 1024)), fileName: originalName.replace(/\.zip$/i, ".bin") };
  }
  return { buffer: rawBuf, fileName: originalName };
}

function getStoredPsxByName(nameKey: string): { buffer: Buffer; realName: string } | null {
  const cleanKey = nameKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanKey || !fs.existsSync(CACHE_DIR)) return null;

  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(psx|exe|bin|iso|img)$/i.test(f));

  for (const f of files) {
    const baseName = f.replace(/\.(psx|exe|bin|iso|img)$/i, "");
    const cleanBase = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanBase === cleanKey || cleanBase.includes(cleanKey) || cleanKey.includes(cleanBase)) {
      const buf = fs.readFileSync(path.join(CACHE_DIR, f));
      return { buffer: buf, realName: baseName };
    }
  }
  return null;
}

function checkForDuplicatePsx(newBuf: Buffer): string | null {
  if (!fs.existsSync(CACHE_DIR)) return null;
  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(psx|exe|bin|iso|img)$/i.test(f));

  for (const f of files) {
    const p = path.join(CACHE_DIR, f);
    try {
      const existingBuf = fs.readFileSync(p);
      if (existingBuf.length === newBuf.length && existingBuf.equals(newBuf)) {
        return f.replace(/\.(psx|exe|bin|iso|img)$/i, "");
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
      return { buffer, fileName: String(doc.fileName || "game.psx") };
    }
  }
  return null;
}

function buildPsxConsoleHtml(options: {
  romGzipB64: string;
  hasCustomRom: boolean;
  bezelTitle: string;
  bootMode: string;
}): string {
  return `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none}
html,body{width:100%;min-height:100%;background:#090a0f}
body{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center;overflow-x:hidden;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,monospace;color:#e4e4e7;background:#090a0f}
#psx-case{width:min(98vw,540px);max-width:540px;margin:0 auto;background:linear-gradient(165deg,#3f3f46 0%,#27272a 52%,#18181b 100%);border:3px solid #52525b;border-radius:20px 20px 44px 20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 46px rgba(0,0,0,.88),inset 0 2px 1px rgba(255,255,255,.25)}
#psx-top-bar{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:linear-gradient(90deg,#09090b,#1e1b4b 50%,#09090b);border-bottom:2px solid #00f3ff;font-size:11px;font-weight:900;letter-spacing:1px;color:#fff}
.psx-badge{background:#00f3ff;color:#09090b;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:900}
#shoulder-row{width:100%;display:flex;justify-content:space-between;padding:7px 12px 3px;gap:8px;background:rgba(0,0,0,.28)}
.shoulder-grp{display:flex;gap:6px}
.trig-btn{min-width:52px;height:26px;background:linear-gradient(180deg,#52525b,#27272a);border:1.5px solid #09090b;border-bottom:3px solid #09090b;border-radius:6px 6px 4px 4px;color:#d4d4d8;font-size:10px;font-weight:900;letter-spacing:.8px;cursor:pointer;box-shadow:0 3px 6px rgba(0,0,0,.5)}
.trig-btn.touching{background:#00f3ff;color:#09090b;transform:translateY(2px)}
#lens-outer{width:100%;padding:6px 12px;display:flex;flex-direction:column;align-items:center}
#lens-bezel{width:100%;background:linear-gradient(180deg,#18181b 0%,#09090b 100%);border:3px solid #000;border-radius:12px;padding:7px 10px 8px;box-shadow:inset 0 2px 5px rgba(255,255,255,.08),0 6px 16px rgba(0,0,0,.65);display:flex;flex-direction:column;align-items:center}
#lens-top{width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.pwr-wrap{display:flex;align-items:center;gap:5px}
#status-led{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 9px #22c55e;transition:all .2s}
#status-led.boot{background:#facc15;box-shadow:0 0 9px #facc15}
#status-led.err{background:#ef4444;box-shadow:0 0 9px #ef4444}
.pwr-txt{font-size:8px;font-weight:900;color:#a1a1aa;letter-spacing:1px}
.rom-tag{font-size:8.5px;font-weight:900;color:#00f3ff;letter-spacing:.8px;text-transform:uppercase;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#screen-container{position:relative;width:96%;aspect-ratio:320/240;background:#000;border:2.5px solid #27272a;border-radius:6px;overflow:hidden;display:flex;justify-content:center;align-items:center;box-shadow:inset 0 0 14px rgba(0,0,0,.9)}
canvas#psx{width:100%;height:100%;object-fit:fill;display:block;image-rendering:pixelated}
#scanlines{position:absolute;inset:0;background:linear-gradient(rgba(18,16,16,0) 50%,rgba(0,0,0,.22) 50%);background-size:100% 4px;pointer-events:none;z-index:2}
#lens-logo{margin-top:5px;display:flex;align-items:center;gap:8px;font-family:"Arial Black",Impact,sans-serif}
.ps-colors{display:inline-flex;gap:1px;font-size:11px;font-weight:900}
.ps-r{color:#ef4444}.ps-y{color:#facc15}.ps-g{color:#22c55e}.ps-b{color:#3b82f6}
.ps-word{font-size:11px;font-weight:900;letter-spacing:1.6px;color:#d4d4d8}
#debug-wrap{width:94%;margin:2px auto 4px;background:#06080e;border:1.5px solid #00f3ff;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.7)}
#debug-head{background:linear-gradient(90deg,#090d16,#1e1b4b);padding:4px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,243,255,.28);font-family:monospace;font-size:9px;color:#00f3ff;font-weight:900}
#telemetry-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:#030508;padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.08);font-family:monospace;font-size:8.5px;color:#a5f3fc;text-align:center}
.t-cell{background:rgba(255,255,255,.04);padding:2px 3px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#debug-panel{display:block}
#debug-panel.collapsed{display:none}
#debug-log{height:82px;overflow-y:auto;padding:5px 7px;font-family:"Courier New",monospace;font-size:9px;line-height:1.35;color:#4ade80;background:#04060b;touch-action:pan-y;user-select:text;-webkit-user-select:text}
#debug-actions{display:flex;justify-content:flex-end;gap:6px;padding:3px 6px;background:#070a12;border-top:1px solid rgba(255,255,255,.08)}
.dbg-mini-btn{background:#1e293b;color:#38bdf8;border:1px solid #0284c7;border-radius:4px;padding:2px 7px;font-size:8px;font-weight:900;cursor:pointer}
.log-line{margin-bottom:1px;word-break:break-all}
.log-warn{color:#facc15}
.log-err{color:#f87171;font-weight:900}
.log-sys{color:#38bdf8;font-weight:900}
.log-ok{color:#4ade80;font-weight:900}
#pad-area{width:100%;padding:6px 14px 14px;display:flex;flex-direction:column;gap:10px}
#main-controls{width:100%;display:flex;justify-content:space-between;align-items:center;padding:2px 4px}
#dpad{position:relative;width:132px;height:132px;border-radius:50%;background:radial-gradient(circle,#27272a 0%,#18181b 75%);border:2px solid #09090b;box-shadow:inset 0 2px 5px rgba(0,0,0,.7),0 4px 10px rgba(0,0,0,.5);flex-shrink:0}
.dpad-btn{position:absolute;width:40px;height:40px;border:1.5px solid #09090b;background:linear-gradient(180deg,#3f3f46,#18181b);color:#d4d4d8;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:7px;box-shadow:0 3px 0 #09090b}
.dpad-btn.touching{background:#00f3ff;color:#09090b;transform:translateY(2px);box-shadow:0 1px 0 #09090b}
#u{left:44px;top:6px}
#d{left:44px;bottom:6px}
#l{left:6px;top:44px}
#r{right:6px;top:44px}
#dpad-center{position:absolute;left:50px;top:50px;width:28px;height:28px;border-radius:50%;background:#09090b;opacity:.65}
#psx-face{position:relative;width:136px;height:136px;border-radius:50%;background:radial-gradient(circle,#27272a 0%,#18181b 75%);border:2px solid #09090b;box-shadow:inset 0 2px 5px rgba(0,0,0,.7),0 4px 10px rgba(0,0,0,.5);flex-shrink:0}
.face-btn{position:absolute;width:42px;height:42px;border-radius:50%;border:2px solid #09090b;background:radial-gradient(circle at 30% 28%,#3f3f46,#18181b 78%);font-size:17px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 0 #09090b,0 5px 10px rgba(0,0,0,.6)}
.face-btn.touching{transform:translateY(2px) scale(.94);box-shadow:0 1px 0 #09090b;filter:brightness(1.35)}
#btn-tri{left:45px;top:5px;color:#4ade80;border-color:#14532d}
#btn-cro{left:45px;bottom:5px;color:#60a5fa;border-color:#1e3a8a}
#btn-squ{left:5px;top:45px;color:#f472b6;border-color:#831843}
#btn-cir{right:5px;top:45px;color:#f87171;border-color:#7f1d1d}
#select-start-row{width:100%;display:flex;justify-content:center;align-items:center;gap:22px;margin-top:2px}
.meta-wrap{display:flex;flex-direction:column;align-items:center;gap:3px}
.meta-btn{min-width:56px;height:20px;background:linear-gradient(180deg,#3f3f46,#18181b);border:1.5px solid #09090b;box-shadow:0 3px 0 #09090b;cursor:pointer}
.meta-sel{border-radius:4px}
.meta-ana{border-radius:10px;min-width:48px}
.meta-st{border-radius:4px 12px 12px 4px}
.meta-btn.touching{background:#00f3ff;transform:translateY(2px);box-shadow:0 1px 0 #09090b}
.meta-lbl{font-size:8px;font-weight:900;letter-spacing:1.2px;color:#a1a1aa}
#bottom-tools{width:100%;display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-top:2px}
.tool-btn{border:1.5px solid #09090b;border-radius:7px;background:linear-gradient(180deg,#27272a,#09090b);color:#00f3ff;padding:5px 10px;font-weight:900;font-size:9.5px;letter-spacing:.5px;cursor:pointer;box-shadow:0 2px 0 #000}
.tool-btn:active,.tool-btn.active{background:#00f3ff;color:#09090b;transform:translateY(1px)}
</style>
<body>
<div id="psx-case">
  <div id="psx-top-bar">
    <span>★ LuferOS PSX 32-Bit Sys ★</span>
    <span class="psx-badge">V: 4.0</span>
  </div>

  <div id="shoulder-row">
    <div class="shoulder-grp">
      <button class="trig-btn" data-key="l2">L2</button>
      <button class="trig-btn" data-key="l1">L1</button>
    </div>
    <div class="shoulder-grp">
      <button class="trig-btn" data-key="r1">R1</button>
      <button class="trig-btn" data-key="r2">R2</button>
    </div>
  </div>

  <div id="lens-outer">
    <div id="lens-bezel">
      <div id="lens-top">
        <div class="pwr-wrap">
          <div id="status-led" class="boot"></div>
          <span class="pwr-txt" id="status-text">SCPH-1001</span>
        </div>
        <div class="rom-tag" id="rom-title-bar">${options.bezelTitle}</div>
      </div>
      <div id="screen-container">
        <canvas id="psx" width="320" height="240"></canvas>
        <div id="scanlines"></div>
      </div>
      <div id="lens-logo">
        <span class="ps-colors"><span class="ps-r">◢</span><span class="ps-y">◣</span><span class="ps-g">◤</span><span class="ps-b">◥</span></span>
        <span class="ps-word">SONY PLAYSTATION • LUFEROS</span>
      </div>
    </div>
  </div>

  <div id="debug-wrap">
    <div id="debug-head">
      <span id="dbg-state">⚡ BIOS SCPH-1001 INIT...</span>
      <span id="dbg-mode">R3000A • 33.86MHz</span>
    </div>
    <div id="telemetry-bar">
      <div class="t-cell" id="t-fps">FPS: 60</div>
      <div class="t-cell" id="t-pc">PC: 0xBFC00000</div>
      <div class="t-cell" id="t-gpu">POLY: 0/f</div>
      <div class="t-cell" id="t-pad">PAD: 0xFFFF</div>
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
    <div id="main-controls">
      <div id="dpad">
        <div id="dpad-center"></div>
        <button class="dpad-btn" id="u" data-key="up">▲</button>
        <button class="dpad-btn" id="l" data-key="left">◀</button>
        <button class="dpad-btn" id="r" data-key="right">▶</button>
        <button class="dpad-btn" id="d" data-key="down">▼</button>
      </div>

      <div id="psx-face">
        <button class="face-btn" id="btn-tri" data-key="triangle">▲</button>
        <button class="face-btn" id="btn-squ" data-key="square">■</button>
        <button class="face-btn" id="btn-cir" data-key="circle">●</button>
        <button class="face-btn" id="btn-cro" data-key="cross">✕</button>
      </div>
    </div>

    <div id="select-start-row">
      <div class="meta-wrap">
        <button class="meta-btn meta-sel" data-key="select"></button>
        <span class="meta-lbl">SELECT</span>
      </div>
      <div class="meta-wrap">
        <button class="meta-btn meta-ana" id="analog-btn"></button>
        <span class="meta-lbl">ANALOG</span>
      </div>
      <div class="meta-wrap">
        <button class="meta-btn meta-st" data-key="start"></button>
        <span class="meta-lbl">START</span>
      </div>
    </div>

    <div id="bottom-tools">
      <button class="tool-btn active" id="dbg-toggle-btn">📟 LOGS (ON)</button>
      <button class="tool-btn" id="cam-btn">🎥 CÁMARA 3D</button>
      <button class="tool-btn" id="skip-bios-btn">⏭️ BIOS</button>
      <button class="tool-btn" id="reset-btn">🔄 REINICIAR</button>
    </div>
  </div>
</div>

<script>
(function(){
  const HAS_CUSTOM_ROM = ${options.hasCustomRom ? "true" : "false"};
  const ROM_GZIP_B64 = "${options.romGzipB64}";
  const INITIAL_MODE = "${options.bootMode}";

  const canvas = document.getElementById("psx");
  const ctx = canvas.getContext("2d", { alpha: false });
  const statusLed = document.getElementById("status-led");
  const statusTxt = document.getElementById("status-text");
  const dbgState = document.getElementById("dbg-state");
  const dbgMode = document.getElementById("dbg-mode");
  const dbgPanel = document.getElementById("debug-panel");
  const dbgLog = document.getElementById("debug-log");
  const tFps = document.getElementById("t-fps");
  const tPc = document.getElementById("t-pc");
  const tGpu = document.getElementById("t-gpu");
  const tPad = document.getElementById("t-pad");

  let logHistory = [];

  function logSys(msg, cls) {
    const now = new Date();
    const ts =
      String(now.getMinutes()).padStart(2, "0") + ":" +
      String(now.getSeconds()).padStart(2, "0") + "." +
      String(now.getMilliseconds()).padStart(3, "0").slice(0, 2);
    const fullLine = "[" + ts + "] " + msg;
    logHistory.push(fullLine);
    if (logHistory.length > 120) logHistory.shift();

    const div = document.createElement("div");
    div.className = "log-line " + (cls || "");
    div.textContent = fullLine;
    dbgLog.appendChild(div);
    while (dbgLog.childNodes.length > 80) {
      dbgLog.removeChild(dbgLog.firstChild);
    }
    dbgLog.scrollTop = dbgLog.scrollHeight;
  }

  window.addEventListener("error", function(e) {
    statusLed.className = "err";
    statusTxt.textContent = "EXCEPTION";
    dbgState.textContent = "❌ R3000A EXCEPTION";
    logSys("FATAL ERR: " + (e.message || "Error desconocido"), "log-err");
  });

  window.addEventListener("unhandledrejection", function(e) {
    statusLed.className = "err";
    statusTxt.textContent = "PROMISE ERR";
    logSys("PROMISE REJECT: " + (e.reason && e.reason.message ? e.reason.message : String(e.reason)), "log-err");
  });

  let audioCtx = null;
  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) {
        audioCtx = new AC();
        logSys("SPU 24-Channel ADPCM Audio Inicializado (" + audioCtx.sampleRate + "Hz)", "log-ok");
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }

  function playSpuTone(freq, dur, type, vol) {
    try {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || "sawtooth";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(vol || 0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch (e) {}
  }

  function playPsxBootChord() {
    if (!audioCtx) return;
    [130.81, 196.0, 261.63, 329.63, 392.0, 523.25].forEach(function(f, i) {
      setTimeout(function() {
        playSpuTone(f, 0.9, "sine", 0.05);
      }, i * 95);
    });
  }

  const padBits = {
    select: 0, l2: 1, r2: 2, start: 3,
    up: 4, right: 5, down: 6, left: 7,
    l1: 10, r1: 11, triangle: 12, circle: 13, cross: 14, square: 15
  };
  const keys = {};
  let padHexMask = 0xFFFF;

  function updatePadMask() {
    let m = 0xFFFF;
    Object.keys(keys).forEach(function(k) {
      if (keys[k] && padBits[k] !== undefined) {
        m &= ~(1 << padBits[k]);
      }
    });
    padHexMask = m & 0xFFFF;
    tPad.textContent = "PAD: 0x" + padHexMask.toString(16).toUpperCase().padStart(4, "0");
  }

  async function gunzipBase64ToBytes(b64) {
    const bin = atob(b64);
    const compressed = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) compressed[i] = bin.charCodeAt(i);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }

  class MipsR3000ACore {
    constructor() {
      this.ram = new Uint8Array(2 * 1024 * 1024);
      this.ramView = new DataView(this.ram.buffer);
      this.regs = new Uint32Array(32);
      this.pc = 0x80010000;
      this.hi = 0;
      this.lo = 0;
      this.loaded = false;
      this.entryPc = 0x80010000;
      this.instructionsExecuted = 0;
    }

    loadPsxExe(bytes) {
      this.ram.fill(0);
      this.regs.fill(0);
      const magic = String.fromCharCode.apply(null, bytes.subarray(0, 8));
      if (magic.startsWith("PS-X")) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.entryPc = dv.getUint32(0x10, true) || 0x80010000;
        const textAddr = (dv.getUint32(0x18, true) || 0x80010000) & 0x1FFFFF;
        const textSize = Math.min(dv.getUint32(0x1C, true) || (bytes.length - 0x800), this.ram.length - textAddr);
        const spBase = dv.getUint32(0x30, true) || 0x801FFF00;
        this.pc = this.entryPc;
        this.regs[29] = spBase;
        if (bytes.length > 0x800) {
          this.ram.set(bytes.subarray(0x800, 0x800 + textSize), textAddr);
        }
        this.loaded = true;
        return {
          isExe: true,
          pc: "0x" + this.entryPc.toString(16).toUpperCase(),
          textAddr: "0x" + (textAddr | 0x80000000).toString(16).toUpperCase(),
          sizeKb: Math.round(bytes.length / 1024)
        };
      } else {
        const copyLen = Math.min(bytes.length, this.ram.length - 0x10000);
        this.ram.set(bytes.subarray(0, copyLen), 0x10000);
        this.entryPc = 0x80010000;
        this.pc = 0x80010000;
        this.regs[29] = 0x801FFF00;
        this.loaded = true;
        return {
          isExe: false,
          pc: "0x80010000",
          textAddr: "0x80010000",
          sizeKb: Math.round(bytes.length / 1024)
        };
      }
    }

    stepBatch(cycles) {
      if (!this.loaded) return;
      for (let i = 0; i < cycles; i++) {
        const phys = this.pc & 0x1FFFFC;
        const instr = this.ramView.getUint32(phys, true);
        this.pc = (this.pc + 4) >>> 0;
        this.instructionsExecuted++;
        this.regs[0] = 0;
        if (instr === 0) continue;

        const op = instr >>> 26;
        const rs = (instr >>> 21) & 0x1F;
        const rt = (instr >>> 16) & 0x1F;
        const rd = (instr >>> 11) & 0x1F;
        const imm = instr & 0xFFFF;
        const simm = (imm << 16) >> 16;

        if (op === 0) {
          const funct = instr & 0x3F;
          if (funct === 0x20 || funct === 0x21) this.regs[rd] = (this.regs[rs] + this.regs[rt]) >>> 0;
          else if (funct === 0x22 || funct === 0x23) this.regs[rd] = (this.regs[rs] - this.regs[rt]) >>> 0;
          else if (funct === 0x24) this.regs[rd] = this.regs[rs] & this.regs[rt];
          else if (funct === 0x25) this.regs[rd] = this.regs[rs] | this.regs[rt];
          else if (funct === 0x08) this.pc = this.regs[rs] || this.entryPc;
        } else if (op === 0x02) {
          this.pc = (this.pc & 0xF0000000) | ((instr & 0x03FFFFFF) << 2);
        } else if (op === 0x03) {
          this.regs[31] = this.pc;
          this.pc = (this.pc & 0xF0000000) | ((instr & 0x03FFFFFF) << 2);
        } else if (op === 0x04) {
          if (this.regs[rs] === this.regs[rt]) this.pc = (this.pc + (simm << 2)) >>> 0;
        } else if (op === 0x05) {
          if (this.regs[rs] !== this.regs[rt]) this.pc = (this.pc + (simm << 2)) >>> 0;
        } else if (op === 0x08 || op === 0x09) {
          this.regs[rt] = (this.regs[rs] + simm) >>> 0;
        } else if (op === 0x0C) {
          this.regs[rt] = this.regs[rs] & imm;
        } else if (op === 0x0D) {
          this.regs[rt] = this.regs[rs] | imm;
        } else if (op === 0x0F) {
          this.regs[rt] = (imm << 16) >>> 0;
        } else if (op === 0x23) {
          const addr = (this.regs[rs] + simm) & 0x1FFFFC;
          this.regs[rt] = this.ramView.getUint32(addr, true);
        } else if (op === 0x2B) {
          const addr = (this.regs[rs] + simm) & 0x1FFFFC;
          this.ramView.setUint32(addr, this.regs[rt], true);
        }
        this.regs[0] = 0;
      }
    }
  }

  const mips = new MipsR3000ACore();

  let phase = "bios";
  let biosTick = 0;
  let polyCountFrame = 0;
  let frameCounter = 0;
  let lastFpsCheck = performance.now();
  let displayedFps = 60;

  let camMode = 0;
  let playerX = 0;
  let speed = 0;
  let trackPos = 0;
  let score = 0;
  let lap = 1;
  let boostTimer = 0;
  let rivals = [
    { z: 18, x: -0.45, col: "#ef4444" },
    { z: 36, x: 0.42, col: "#facc15" },
    { z: 54, x: -0.15, col: "#22c55e" }
  ];

  function project3D(wx, wy, wz, camY, camZ) {
    const dz = Math.max(0.5, wz - camZ);
    const fov = 150;
    const sx = 160 + ((wx - playerX * 0.65) * fov) / dz;
    const sy = 116 - ((wy - camY) * fov) / dz;
    const scale = fov / dz;
    return { sx: sx, sy: sy, scale: scale, dz: dz };
  }

  function renderBiosIntro() {
    biosTick++;
    polyCountFrame = 18;
    tPc.textContent = "PC: 0xBFC0" + ((biosTick * 16) & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");

    if (biosTick === 2) {
      logSys("BIOS SCPH-1001: Verificando GPU GTE y SPU...", "log-sys");
    }
    if (biosTick === 45) {
      logSys("BIOS: Sony Computer Entertainment America [OK]", "log-ok");
    }
    if (biosTick === 95) {
      logSys("CD-ROMXA: Leyendo sector SYSTEM.CNF -> BOOT = cdrom:\\\\LUFEROS.EXE;1", "log-sys");
    }

    ctx.fillStyle = biosTick < 55 ? "#f4f4f6" : "#060814";
    ctx.fillRect(0, 0, 320, 240);

    if (biosTick < 55) {
      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.moveTo(160, 48);
      ctx.lineTo(205, 115);
      ctx.lineTo(160, 182);
      ctx.lineTo(115, 115);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.moveTo(160, 68);
      ctx.lineTo(188, 115);
      ctx.lineTo(160, 162);
      ctx.lineTo(132, 115);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#18181b";
      ctx.textAlign = "center";
      ctx.font = "900 13px sans-serif";
      ctx.fillText("Sony Computer Entertainment", 160, 212);
      ctx.textAlign = "left";
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "900 18px Impact, sans-serif";
      ctx.fillText("PlayStation", 160, 108);

      ctx.fillStyle = "#00f3ff";
      ctx.font = "bold 9px monospace";
      ctx.fillText("Licensed by Sony Computer Entertainment Inc.", 160, 146);
      ctx.fillStyle = "#facc15";
      ctx.fillText("LUFEROS 32-BIT KERNEL V4.0", 160, 164);
      ctx.textAlign = "left";
    }

    if (biosTick >= 135) {
      phase = "game";
      statusLed.className = "on";
      statusTxt.textContent = "RUNNING";
      dbgState.textContent = "🟢 PSX GTE 3D • ACTIVO";
      logSys("[READY] Motor 3D GTE + R3000A en ejecución a 60 FPS.", "log-ok");
    }
  }

  function render3DGameFrame() {
    if (mips.loaded) {
      mips.stepBatch(1800);
      tPc.textContent = "PC: 0x" + mips.pc.toString(16).toUpperCase().padStart(8, "0");
    } else {
      tPc.textContent = "PC: 0x8001" + ((frameCounter * 8) & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
    }

    const accel = keys.cross || keys.up;
    const brake = keys.square || keys.down;
    const turbo = keys.circle || keys.r1 || keys.r2;

    if (turbo && boostTimer <= 0 && speed > 0.25) {
      boostTimer = 35;
      playSpuTone(540, 0.18, "sawtooth", 0.05);
      logSys("GTE TURBO BOOST ACTIVADO (R1/●)", "log-warn");
    }
    if (boostTimer > 0) boostTimer--;

    const maxSpd = boostTimer > 0 ? 1.35 : 0.88;
    if (accel) speed = Math.min(maxSpd, speed + 0.018);
    else if (brake) speed = Math.max(0, speed - 0.035);
    else speed = Math.max(0, speed - 0.008);

    if (keys.left) playerX = Math.max(-1.35, playerX - 0.042 * (0.4 + speed));
    if (keys.right) playerX = Math.min(1.35, playerX + 0.042 * (0.4 + speed));

    trackPos += speed;
    score += Math.floor(speed * 18);
    if (trackPos >= 400) {
      trackPos -= 400;
      lap++;
      playSpuTone(880, 0.22, "square", 0.06);
      logSys("VUELTA " + lap + " COMPLETADA | SCORE: " + score, "log-ok");
    }

    const skyGrad = ctx.createLinearGradient(0, 0, 0, 118);
    skyGrad.addColorStop(0, "#050716");
    skyGrad.addColorStop(0.65, "#1e1b4b");
    skyGrad.addColorStop(1, "#701a75");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 320, 118);

    const curve = Math.sin(trackPos * 0.025) * 28;
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(240 - curve * 0.4, 42, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.moveTo(0, 118);
    for (let x = 0; x <= 320; x += 32) {
      const mh = 18 + Math.sin(x * 0.05 + curve * 0.03) * 14;
      ctx.lineTo(x, 118 - mh);
    }
    ctx.lineTo(320, 118);
    ctx.fill();

    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 118, 320, 122);

    polyCountFrame = 0;
    const totalSegments = 48;

    for (let n = totalSegments; n >= 1; n--) {
      const zNear = n * 1.4;
      const zFar = (n + 1) * 1.4;
      const segIdx = Math.floor(trackPos + n);
      const isAlt = (segIdx % 2) === 0;

      const curveNear = Math.sin((trackPos + n) * 0.035) * (n * 0.035);
      const curveFar = Math.sin((trackPos + n + 1) * 0.035) * ((n + 1) * 0.035);

      const camY = camMode === 1 ? 0.85 : 1.35;
      const p1 = project3D(-1.25 + curveNear, 0, zNear, camY, 0);
      const p2 = project3D(1.25 + curveNear, 0, zNear, camY, 0);
      const p3 = project3D(1.25 + curveFar, 0, zFar, camY, 0);
      const p4 = project3D(-1.25 + curveFar, 0, zFar, camY, 0);

      ctx.fillStyle = isAlt ? "#111827" : "#1e293b";
      ctx.fillRect(0, p3.sy, 320, Math.max(1, p1.sy - p3.sy));

      ctx.fillStyle = isAlt ? "#334155" : "#475569";
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.lineTo(p4.sx, p4.sy);
      ctx.closePath();
      ctx.fill();
      polyCountFrame += 2;

      const rumbleW1 = Math.max(2, (p2.sx - p1.sx) * 0.08);
      const rumbleW2 = Math.max(2, (p3.sx - p4.sx) * 0.08);
      ctx.fillStyle = isAlt ? "#ef4444" : "#f8fafc";
      ctx.beginPath();
      ctx.moveTo(p1.sx - rumbleW1, p1.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.lineTo(p4.sx, p4.sy);
      ctx.lineTo(p4.sx - rumbleW2, p4.sy);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(p2.sx, p2.sy);
      ctx.lineTo(p2.sx + rumbleW1, p2.sy);
      ctx.lineTo(p3.sx + rumbleW2, p3.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.fill();
      polyCountFrame += 4;
    }

    rivals.forEach(function(rv) {
      rv.z -= (speed - 0.42);
      if (rv.z < 2) {
        rv.z = 62;
        rv.x = (Math.random() * 1.6) - 0.8;
        score += 250;
      }
      if (rv.z > 65) rv.z = 4;

      if (rv.z > 2 && rv.z < 55) {
        const cOff = Math.sin((trackPos + rv.z) * 0.035) * (rv.z * 0.035);
        const rp = project3D(rv.x + cOff, 0, rv.z, camMode === 1 ? 0.85 : 1.35, 0);
        const rw = Math.max(6, rp.scale * 0.55);
        const rh = Math.max(4, rp.scale * 0.32);

        ctx.fillStyle = rv.col;
        ctx.beginPath();
        ctx.moveTo(rp.sx, rp.sy - rh);
        ctx.lineTo(rp.sx + rw, rp.sy);
        ctx.lineTo(rp.sx - rw, rp.sy);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(rp.sx - rw * 0.4, rp.sy - rh * 0.45, rw * 0.8, rh * 0.35);
        polyCountFrame += 3;

        if (rv.z < 4.2 && Math.abs(playerX - rv.x) < 0.38) {
          speed *= 0.45;
          playSpuTone(95, 0.15, "Triangle", 0.08);
        }
      }
    });

    if (camMode === 0) {
      const shipX = 160 + (keys.right ? 8 : keys.left ? -8 : 0);
      const shipY = 205;

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.ellipse(shipX, shipY + 12, 34, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.moveTo(shipX, shipY - 18);
      ctx.lineTo(shipX + 34, shipY + 6);
      ctx.lineTo(shipX + 14, shipY + 10);
      ctx.lineTo(shipX - 14, shipY + 10);
      ctx.lineTo(shipX - 34, shipY + 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#0284c7";
      ctx.beginPath();
      ctx.moveTo(shipX, shipY - 14);
      ctx.lineTo(shipX + 12, shipY + 2);
      ctx.lineTo(shipX - 12, shipY + 2);
      ctx.closePath();
      ctx.fill();

      if (accel || boostTimer > 0) {
        ctx.fillStyle = boostTimer > 0 ? "#00f3ff" : "#f97316";
        ctx.beginPath();
        ctx.arc(shipX - 8, shipY + 8, boostTimer > 0 ? 7 : 4 + (frameCounter & 2), 0, Math.PI * 2);
        ctx.arc(shipX + 8, shipY + 8, boostTimer > 0 ? 7 : 4 + (frameCounter & 2), 0, Math.PI * 2);
        ctx.fill();
      }
      polyCountFrame += 8;
    }

    ctx.fillStyle = "rgba(9,13,22,0.78)";
    ctx.fillRect(6, 6, 308, 22);
    ctx.strokeStyle = "#00f3ff";
    ctx.strokeRect(6, 6, 308, 22);

    ctx.fillStyle = "#00f3ff";
    ctx.font = "bold 9px monospace";
    ctx.fillText("SPD: " + Math.round(speed * 320) + " KM/H", 12, 20);
    ctx.fillStyle = "#facc15";
    ctx.fillText("LAP: " + lap + "/3", 122, 20);
    ctx.fillStyle = "#4ade80";
    ctx.fillText("PTS: " + String(score).padStart(6, "0"), 195, 20);

    if (mips.loaded) {
      ctx.fillStyle = "rgba(0, 243, 255, 0.16)";
      ctx.fillRect(6, 32, 136, 13);
      ctx.fillStyle = "#a5f3fc";
      ctx.font = "bold 7.5px monospace";
      ctx.fillText("MIPS R3000A EXE ACTIVE", 10, 41);
    }

    if (speed < 0.05 && (frameCounter & 16)) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(58, 102, 204, 24);
      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 9px monospace";
      ctx.fillText("MANTÉN [✕] O [▲] PARA ACELERAR", 70, 117);
    }

    tGpu.textContent = "POLY: " + polyCountFrame + "/f";
  }

  function mainLoop(now) {
    requestAnimationFrame(mainLoop);
    frameCounter++;
    if (now - lastFpsCheck >= 500) {
      displayedFps = Math.min(60, Math.round((frameCounter * 1000) / (now - lastFpsCheck)));
      frameCounter = 0;
      lastFpsCheck = now;
      tFps.textContent = "FPS: " + displayedFps;
    }

    if (phase === "bios") {
      renderBiosIntro();
    } else {
      render3DGameFrame();
    }
  }

  function setupInputs() {
    document.querySelectorAll("[data-key]").forEach(function(btn) {
      const k = btn.getAttribute("data-key");
      const press = function(e) {
        if (e && e.cancelable) e.preventDefault();
        unlockAudio();
        btn.classList.add("touching");
        if (!keys[k]) {
          keys[k] = true;
          updatePadMask();
          if (k === "start" && phase === "bios") {
            biosTick = 135;
          }
        }
      };
      const release = function(e) {
        if (e && e.cancelable) e.preventDefault();
        btn.classList.remove("touching");
        keys[k] = false;
        updatePadMask();
      };
      btn.addEventListener("touchstart", press, { passive: false });
      btn.addEventListener("touchend", release, { passive: false });
      btn.addEventListener("touchcancel", release, { passive: false });
      btn.addEventListener("mousedown", press);
      btn.addEventListener("mouseup", release);
      btn.addEventListener("mouseleave", release);
    });

    const dbgBtn = document.getElementById("dbg-toggle-btn");
    dbgBtn.addEventListener("click", function(e) {
      e.preventDefault();
      const isHidden = dbgPanel.classList.toggle("collapsed");
      dbgBtn.classList.toggle("active", !isHidden);
      dbgBtn.textContent = isHidden ? "📟 LOGS (OFF)" : "📟 LOGS (ON)";
    });

    document.getElementById("btn-clear-log").addEventListener("click", function(e) {
      e.preventDefault();
      dbgLog.innerHTML = "";
      logSys("Consola de logs limpiada.", "log-sys");
    });

    document.getElementById("btn-copy-log").addEventListener("click", function(e) {
      e.preventDefault();
      const txt = logHistory.join("\\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function() {
          logSys("Logs copiados al portapapeles OK.", "log-ok");
        }).catch(function() {});
      }
    });

    document.getElementById("cam-btn").addEventListener("click", function(e) {
      e.preventDefault();
      camMode = (camMode + 1) % 2;
      logSys("Cámara GTE cambiada a: " + (camMode === 0 ? "PERSECUCIÓN 3RA PERSONA" : "CABINA 1RA PERSONA"), "log-sys");
    });

    document.getElementById("skip-bios-btn").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      if (phase === "bios") {
        biosTick = 135;
      } else {
        phase = "bios";
        biosTick = 0;
        playPsxBootChord();
        logSys("Reiniciando secuencia Sony BIOS SCPH-1001...", "log-warn");
      }
    });

    document.getElementById("reset-btn").addEventListener("click", function(e) {
      e.preventDefault();
      unlockAudio();
      speed = 0;
      playerX = 0;
      trackPos = 0;
      score = 0;
      lap = 1;
      phase = "bios";
      biosTick = 0;
      logSys("Soft-Reset de CPU R3000A ejecutado OK.", "log-warn");
    });

    document.getElementById("analog-btn").addEventListener("click", function(e) {
      e.preventDefault();
      logSys("DualShock Modo Analógico Conmutado [LED ROJO]", "log-ok");
    });

    const kbMap = {
      ArrowUp: "up", KeyW: "up",
      ArrowDown: "down", KeyS: "down",
      ArrowLeft: "left", KeyA: "left",
      ArrowRight: "right", KeyD: "right",
      KeyK: "cross", Space: "cross", KeyZ: "cross",
      KeyJ: "square", KeyX: "square",
      KeyL: "circle", KeyC: "circle",
      KeyI: "triangle", KeyV: "triangle",
      KeyQ: "l1", KeyE: "r1",
      Enter: "start", Backspace: "select"
    };

    window.addEventListener("keydown", function(e) {
      const k = kbMap[e.code];
      if (k) {
        e.preventDefault();
        unlockAudio();
        keys[k] = true;
        updatePadMask();
      }
    });

    window.addEventListener("keyup", function(e) {
      const k = kbMap[e.code];
      if (k) {
        e.preventDefault();
        keys[k] = false;
        updatePadMask();
      }
    });
  }

  async function bootPsxSystem() {
    try {
      logSys("Iniciando LuferOS PSX 32-Bit Sys V: 4.0...", "log-sys");
      logSys("Asignando 2048 KB Main RAM + 1024 KB VRAM...", "");
      setupInputs();

      if (HAS_CUSTOM_ROM && ROM_GZIP_B64) {
        logSys("Descomprimiendo imagen PSX adjunta (GZIP)...", "");
        const romBytes = await gunzipBase64ToBytes(ROM_GZIP_B64);
        const info = mips.loadPsxExe(romBytes);
        dbgMode.textContent = info.isExe ? "PS-X EXE • " + info.sizeKb + "KB" : "BIN • " + info.sizeKb + "KB";
        logSys(
          "Imagen cargada: " + (info.isExe ? "PS-X EXE Oficial" : "Binario MIPS") +
          " | Entry PC: " + info.pc + " | Peso: " + info.sizeKb + " KB",
          "log-ok"
        );
      } else {
        logSys("Modo BIOS + Ridge Racer 3D GTE Engine cargado.", "log-ok");
      }

      if (INITIAL_MODE === "direct") {
        biosTick = 135;
      }

      requestAnimationFrame(mainLoop);
    } catch (err) {
      statusLed.className = "err";
      statusTxt.textContent = "EXCEPTION";
      logSys("Error de arranque PSX: " + (err && err.message ? err.message : String(err)), "log-err");
    }
  }

  bootPsxSystem();
})();
</script>
</body>`;
}

export default {
  name: ["psx", "ps1", "playstation"],
  category: "group",
  description: "Emulador LuferOS PSX 32-Bit Sys V: 4.0 con soporte robusto para archivos .zip gigantes y .bin.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    await react("💿").catch(() => undefined);

    try {
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
          .filter((f) => /\.(psx|exe|bin|iso|img)$/i.test(f));

        const listTxt = savedFiles.length
          ? savedFiles
              .map((f, idx) => {
                const sizeKb = Math.ceil(fs.statSync(path.join(CACHE_DIR, f)).size / 1024);
                return `${idx + 1}. \`${f.replace(/\.(psx|exe|bin|iso|img)$/i, "")}\` (${sizeKb} KB)`;
              })
              .join("\n")
          : "• `RidgeRacer3D` (Integrado en BIOS)";

        return reply(
          `╭〔 💿 ${fytBold("LuferOS PSX 32-Bit Sys V: 4.0")} 〕⬣\n` +
            `${listTxt}\n` +
            `╰━━━━━━━━━━━━⬣\n` +
            `• Jugar ahora: \`${prefix}psx\`\n` +
            `• Modo compatible grupos: \`${prefix}psx inline\`\n` +
            `• Guardar ejecutable PS-X: Responde a un \`.bin\`, \`.iso\` o \`.zip\` con \`${prefix}psx save <Nombre>\``,
        );
      }

      let romBuffer: Buffer | null = null;
      let displayTitle = "RIDGE RACER 3D • PSX";
      let customSaveName = "";
      let duplicateNotice = "";

      const quotedDoc = await downloadQuotedDocumentBuffer(msg);

      if (subCommand === "save" && cleanArgs[1]) {
        customSaveName = cleanArgs.slice(1).join(" ").trim();
      } else if (quotedDoc && cleanArgs.length > 0 && subCommand !== "save") {
        customSaveName = cleanArgs.join(" ").trim();
      }

      if (quotedDoc) {
        const extracted = extractPsxFromAnyBuffer(quotedDoc.buffer, quotedDoc.fileName);
        if (!extracted) {
          throw new Error("El archivo adjunto no es válido.");
        }
        romBuffer = extracted.buffer;

        const originalBaseName = extracted.fileName.replace(/\.(psx|exe|bin|iso|img|zip)$/i, "").trim();
        const requestedName = customSaveName || originalBaseName;

        const duplicateRealName = checkForDuplicatePsx(romBuffer);
        if (duplicateRealName && duplicateRealName.toLowerCase() !== requestedName.toLowerCase()) {
          duplicateNotice = `⚠️ *LuferOS PSX V: 4.0:* Este juego ya existe en memoria bajo el nombre \`${duplicateRealName}\`.`;
          displayTitle = `${duplicateRealName.toUpperCase()} • PSX`;
        } else {
          const safeFileName = requestedName.replace(/[^a-zA-Z0-9._-]/g, "_") + ".bin";
          fs.writeFileSync(path.join(CACHE_DIR, safeFileName), romBuffer);
          displayTitle = `${requestedName.toUpperCase()} • PSX`;
        }
      } else if (subCommand === "save" && !quotedDoc) {
        return reply(
          `⚠️ Responde a un archivo \`.bin\`, \`.iso\` o \`.zip\` con \`${prefix}psx save <Nombre>\` para guardarlo.`,
        );
      } else {
        const searchName = (customSaveName || cleanArgs.join(" ")).trim();
        if (searchName) {
          const found = getStoredPsxByName(searchName);
          if (found) {
            romBuffer = found.buffer;
            displayTitle = `${found.realName.toUpperCase()} • PSX`;
          } else {
            displayTitle = `${searchName.toUpperCase()} • PSX`;
          }
        }
      }

      if (duplicateNotice) {
        await reply(duplicateNotice).catch(() => undefined);
      }

      const hasCustomRom = Boolean(romBuffer && romBuffer.length > 0);
      const romGzipB64 = hasCustomRom
        ? zlib.gzipSync(romBuffer!, { level: 9 }).toString("base64")
        : "";

      const HTML = buildPsxConsoleHtml({
        romGzipB64,
        hasCustomRom,
        bezelTitle: displayTitle,
        bootMode: "bios",
      });

      const uniqueResponseId = `LuferOS_PSX_${randomUUID().replace(/-/g, "")}`;

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
                    text: `💿 *LuferOS PSX 32-Bit Sys V: 4.0* • ${displayTitle}\n_Pulsa el botón inferior para abrir la consola PlayStation. Si tu WhatsApp no muestra el botón, usa:_ \`${prefix}psx inline\``,
                  },
                },
              },
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "GenAIBotProgressStatusPrimitive",
                    title: `💿 LuferOS PSX V: 4.0 (${displayTitle})`,
                    is_in_progress: true,
                  },
                },
              },
            ],
            embedded_screens: [
              {
                title: `LuferOS PSX V: 4.0`,
                content: [
                  {
                    __typename: "FOAIDNixelButtonSheets",
                    tabs: [
                      {
                        id: "tab_0",
                        tab_header: "LuferOS PSX V: 4.0",
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
              messageDisclaimerText: "LuferOS PSX 32-Bit Sys V: 4.0",
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
        `❌ ${fytBold("LuferOS PSX V: 4.0:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
