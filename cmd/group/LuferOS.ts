import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "os_cache");

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

function extractFileFromZipBuffer(zipBuf: Buffer): { buffer: Buffer; fileName: string } | null {
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

      if (compSize === 0 || dataEnd > zipBuf.length || uncompSize > 512 * 1024) continue;

      const slice = zipBuf.subarray(dataStart, dataEnd);
      try {
        const outBuf = method === 0 ? Buffer.from(slice) : zlib.inflateRawSync(slice);
        if (outBuf.length > 0) {
          return { buffer: outBuf, fileName: path.basename(entryName) };
        }
      } catch {}
    }
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
    if (buffer.length > 0) {
      return { buffer, fileName: String(doc.fileName || "PROG.COM") };
    }
  }
  return null;
}

function getStoredProgramByName(nameKey: string): { buffer: Buffer; realName: string } | null {
  const cleanKey = nameKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanKey || !fs.existsSync(CACHE_DIR)) return null;

  const files = fs.readdirSync(CACHE_DIR);
  for (const f of files) {
    const baseName = path.parse(f).name;
    const cleanBase = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanBase === cleanKey || cleanBase.includes(cleanKey) || cleanKey.includes(cleanBase)) {
      return { buffer: fs.readFileSync(path.join(CACHE_DIR, f)), realName: f.toUpperCase() };
    }
  }
  return null;
}

function buildLuferOsHtml(options: {
  mountedFileName: string;
  mountedFileGzipB64: string;
  bezelTitle: string;
}): string {
  const html = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:manipulation}
html,body{width:100%;min-height:100%;background:#05070d;color:#e2e8f0;font-family:monospace;overflow-x:hidden;overflow-y:auto}
body{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center}
#os-case{width:min(98vw,560px);margin:0 auto;background:linear-gradient(165deg,#111827 0%,#090d16 60%,#05070c 100%);border:2.5px solid #00f3ff;border-radius:18px 18px 34px 18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 46px rgba(0,0,0,.92)}
#os-top-bar{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:linear-gradient(90deg,#090d16,#1e1b4b 50%,#090d16);border-bottom:2px solid #00f3ff;font-size:11px;font-weight:900;color:#fef08a}
.os-badge{background:#00f3ff;color:#090d16;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:900}
#lens-outer{width:100%;padding:8px 10px 4px;display:flex;flex-direction:column;align-items:center}
#lens-bezel{width:100%;background:#090c12;border:2.5px solid #1e293b;border-radius:12px;padding:6px 8px 8px;display:flex;flex-direction:column;align-items:center}
#lens-top{width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
.pwr-wrap{display:flex;align-items:center;gap:5px}
#status-led{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 9px #22c55e}
#status-led.busy{background:#facc15;box-shadow:0 0 9px #facc15}
#status-led.err{background:#ef4444;box-shadow:0 0 9px #ef4444}
.pwr-txt{font-size:8.5px;font-weight:900;color:#94a3b8}
.rom-tag{font-size:8.5px;font-weight:900;color:#00f3ff;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#screen-container{position:relative;width:100%;aspect-ratio:320/200;background:#000;border:2px solid #00f3ff;border-radius:6px;overflow:hidden;display:flex;justify-content:center;align-items:center;box-shadow:inset 0 0 14px rgba(0,0,0,.95)}
canvas#vga{width:100%;height:100%;object-fit:fill;display:block;image-rendering:pixelated;cursor:crosshair}
#cmd-bar{width:100%;display:flex;gap:5px;margin-top:6px;background:#050811;border:1.5px solid #1e293b;border-radius:6px;padding:4px 6px;align-items:center}
#cmd-prompt{color:#00f3ff;font-size:10px;font-weight:900;white-space:nowrap}
#cmd-input{flex:1;background:transparent;border:none;color:#4ade80;font-family:monospace;font-size:11px;outline:none;-webkit-user-select:text;user-select:text}
#cmd-send{background:#00f3ff;color:#050811;border:none;border-radius:4px;padding:4px 8px;font-weight:900;font-size:9.5px;cursor:pointer}
#debug-wrap{width:95%;margin:4px auto;background:#060912;border:1.5px solid #3b82f6;border-radius:8px;overflow:hidden}
#debug-head{background:linear-gradient(90deg,#0f172a,#1e3a8a);padding:4px 8px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#93c5fd;font-weight:900}
#telemetry-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:#030509;padding:3px 5px;font-size:8px;color:#a5f3fc;text-align:center}
.t-cell{background:rgba(255,255,255,.04);padding:2px 3px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#debug-panel.collapsed{display:none}
#debug-log{height:68px;overflow-y:auto;padding:4px 7px;font-size:8.5px;line-height:1.35;color:#4ade80;background:#04060b;touch-action:pan-y;-webkit-user-select:text;user-select:text}
#debug-actions{display:flex;justify-content:flex-end;gap:6px;padding:3px 6px;background:#070a12}
.dbg-mini-btn{background:#1e293b;color:#60a5fa;border:1px solid #2563eb;border-radius:4px;padding:2px 7px;font-size:8px;font-weight:900;cursor:pointer}
.log-line{margin-bottom:1px;word-break:break-all}
.log-warn{color:#facc15}.log-err{color:#f87171;font-weight:900}.log-sys{color:#38bdf8;font-weight:900}.log-ok{color:#4ade80;font-weight:900}
#controls-wrap{width:100%;padding:4px 10px 14px;display:flex;flex-direction:column;gap:6px}
.quick-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.q-btn{background:linear-gradient(180deg,#1e293b,#0f172a);color:#38bdf8;border:1.5px solid #0284c7;border-radius:6px;padding:6px 4px;font-family:monospace;font-size:9px;font-weight:900;cursor:pointer;text-align:center}
.q-btn:active{background:#00f3ff;color:#090d16;transform:translateY(1px)}
.q-btn.hot{color:#fef08a;border-color:#ca8a04}
.dpad-strip{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}
.k-btn{background:#18181b;color:#e2e8f0;border:1.5px solid #3f3f46;border-radius:6px;padding:6px 0;font-family:monospace;font-size:10px;font-weight:900;cursor:pointer;text-align:center}
.k-btn:active{background:#ef4444;color:#fff}
</style>
<body>
<div id="os-case">
  <div id="os-top-bar">
    <span>★ LuferOS x86 REAL-MODE PC OS ★</span>
    <span class="os-badge">KERNEL V6.0</span>
  </div>
  <div id="lens-outer">
    <div id="lens-bezel">
      <div id="lens-top">
        <div class="pwr-wrap">
          <div id="status-led"></div>
          <span class="pwr-txt" id="status-text">8086 REAL MODE</span>
        </div>
        <div class="rom-tag">__BEZEL_TITLE__</div>
      </div>
      <div id="screen-container">
        <canvas id="vga" width="320" height="200"></canvas>
      </div>
      <div id="cmd-bar">
        <span id="cmd-prompt">C:\\></span>
        <input id="cmd-input" type="text" placeholder="Comando o programa (HELP, DIR, PLASMA.COM, GUI, ASM)..." autocomplete="off" autocapitalize="off" spellcheck="false" />
        <button id="cmd-send">RUN ↵</button>
      </div>
    </div>
  </div>
  <div id="debug-wrap">
    <div id="debug-head">
      <span id="dbg-state">⚡ CPU 8086 + VGA BIOS ACTIVE</span>
      <span id="dbg-vmode">MODE 03h (TEXT)</span>
    </div>
    <div id="telemetry-bar">
      <div class="t-cell" id="t-ips">IPS: 0</div>
      <div class="t-cell" id="t-csip">CS:IP 1000:0100</div>
      <div class="t-cell" id="t-axbx">AX:0000 BX:0000</div>
      <div class="t-cell" id="t-cxdx">CX:0000 DX:0000</div>
    </div>
    <div id="debug-panel">
      <div id="debug-log"></div>
      <div id="debug-actions">
        <button class="dbg-mini-btn" id="btn-toggle-log">📟 LOGS</button>
        <button class="dbg-mini-btn" id="btn-copy-log">📋 COPIAR</button>
        <button class="dbg-mini-btn" id="btn-clear-log">🧹 LIMPIAR</button>
      </div>
    </div>
  </div>
  <div id="controls-wrap">
    <div class="quick-grid">
      <button class="q-btn hot" data-cmd="GUI">🪟 DESKTOP GUI</button>
      <button class="q-btn hot" data-cmd="PLASMA.COM">🌈 PLASMA.COM</button>
      <button class="q-btn hot" data-cmd="FIRE.COM">🔥 FIRE.COM</button>
      <button class="q-btn hot" data-cmd="MANDEL.COM">🌀 MANDEL.COM</button>
      <button class="q-btn" data-cmd="MATRIX.COM">🟩 MATRIX.COM</button>
      <button class="q-btn" data-cmd="SNAKE">🐍 SNAKE</button>
      <button class="q-btn" data-cmd="SYSINFO.COM">📊 SYSINFO.COM</button>
      <button class="q-btn" data-cmd="DIR">📂 DIR C:\\</button>
    </div>
    <div class="dpad-strip">
      <button class="k-btn" data-key="ArrowUp">▲</button>
      <button class="k-btn" data-key="ArrowDown">▼</button>
      <button class="k-btn" data-key="ArrowLeft">◀</button>
      <button class="k-btn" data-key="ArrowRight">▶</button>
      <button class="k-btn" data-key="Escape">ESC / STOP</button>
      <button class="k-btn" id="btn-reboot">🔄 REBOOT</button>
    </div>
  </div>
</div>
<script>__OS_SCRIPT__</script>
</body>`;

  const script = `
(function(){
  const MOUNTED_NAME = "${options.mountedFileName}";
  const MOUNTED_GZIP_B64 = "${options.mountedFileGzipB64}";

  const canvas = document.getElementById("vga");
  const ctx = canvas.getContext("2d", { alpha: false });
  const imgData = ctx.createImageData(320, 200);
  const frameBuf32 = new Uint32Array(imgData.data.buffer);

  const statusLed = document.getElementById("status-led");
  const statusTxt = document.getElementById("status-text");
  const dbgState = document.getElementById("dbg-state");
  const dbgVmode = document.getElementById("dbg-vmode");
  const dbgPanel = document.getElementById("debug-panel");
  const dbgLog = document.getElementById("debug-log");
  const tIps = document.getElementById("t-ips");
  const tCsIp = document.getElementById("t-csip");
  const tAxBx = document.getElementById("t-axbx");
  const tCxDx = document.getElementById("t-cxdx");
  const cmdInput = document.getElementById("cmd-input");
  const cmdSend = document.getElementById("cmd-send");

  const logHistory = [];
  function logKernel(msg, cls) {
    const now = new Date();
    const ts = String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0") + "." + String(now.getMilliseconds()).padStart(3, "0").slice(0, 2);
    const line = "[" + ts + "] " + msg;
    logHistory.push(line);
    if (logHistory.length > 120) logHistory.shift();
    const d = document.createElement("div");
    d.className = "log-line " + (cls || "");
    d.textContent = line;
    dbgLog.appendChild(d);
    while (dbgLog.childNodes.length > 70) dbgLog.removeChild(dbgLog.firstChild);
    dbgLog.scrollTop = dbgLog.scrollHeight;
  }

  let audioCtx = null;
  function pcBeep(freq, dur) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq || 880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (dur || 0.06));
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + (dur || 0.06));
    } catch (e) {}
  }

  const vgaPalette32 = new Uint32Array(256);
  const cga16 = [
    [0,0,0],[0,0,170],[0,170,0],[0,170,170],
    [170,0,0],[170,0,170],[170,85,0],[170,170,170],
    [85,85,85],[85,85,255],[85,255,85],[85,255,255],
    [255,85,85],[255,85,255],[255,255,85],[255,255,255]
  ];
  for (let i = 0; i < 16; i++) {
    const c = cga16[i];
    vgaPalette32[i] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
  }
  for (let i = 16; i < 256; i++) {
    const r = Math.round(127 + 127 * Math.sin(i * 0.065));
    const g = Math.round(127 + 127 * Math.sin(i * 0.065 + 2.094));
    const b = Math.round(127 + 127 * Math.sin(i * 0.065 + 4.188));
    vgaPalette32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }

  const TEXT_COLS = 40;
  const TEXT_ROWS = 25;
  const VRAM_M13 = 0xA0000;
  const VRAM_TXT = 0xB8000;

  const ram = new Uint8Array(1048576);
  const cpu = {
    ax: 0, bx: 0, cx: 0, dx: 0,
    si: 0, di: 0, bp: 0, sp: 0xFFFE,
    ip: 0x0100,
    cs: 0x1000, ds: 0x1000, es: 0x1000, ss: 0x1000,
    cf: 0, zf: 0, sf: 0, df: 0,
    runningProg: false,
    progName: "",
    videoMode: 0x03,
    cursorX: 0,
    cursorY: 0,
    textAttr: 0x0A,
    keyQueue: [],
    tickCount: 0,
    ipsCount: 0
  };

  function getReg8(id) {
    switch (id & 7) {
      case 0: return cpu.ax & 0xFF;
      case 1: return cpu.cx & 0xFF;
      case 2: return cpu.dx & 0xFF;
      case 3: return cpu.bx & 0xFF;
      case 4: return (cpu.ax >> 8) & 0xFF;
      case 5: return (cpu.cx >> 8) & 0xFF;
      case 6: return (cpu.dx >> 8) & 0xFF;
      case 7: return (cpu.bx >> 8) & 0xFF;
    }
    return 0;
  }

  function setReg8(id, val) {
    const v = val & 0xFF;
    switch (id & 7) {
      case 0: cpu.ax = (cpu.ax & 0xFF00) | v; break;
      case 1: cpu.cx = (cpu.cx & 0xFF00) | v; break;
      case 2: cpu.dx = (cpu.dx & 0xFF00) | v; break;
      case 3: cpu.bx = (cpu.bx & 0xFF00) | v; break;
      case 4: cpu.ax = (cpu.ax & 0x00FF) | (v << 8); break;
      case 5: cpu.cx = (cpu.cx & 0x00FF) | (v << 8); break;
      case 6: cpu.dx = (cpu.dx & 0x00FF) | (v << 8); break;
      case 7: cpu.bx = (cpu.bx & 0x00FF) | (v << 8); break;
    }
  }

  function getReg16(id) {
    switch (id & 7) {
      case 0: return cpu.ax;
      case 1: return cpu.cx;
      case 2: return cpu.dx;
      case 3: return cpu.bx;
      case 4: return cpu.sp;
      case 5: return cpu.bp;
      case 6: return cpu.si;
      case 7: return cpu.di;
    }
    return 0;
  }

  function setReg16(id, val) {
    const v = val & 0xFFFF;
    switch (id & 7) {
      case 0: cpu.ax = v; break;
      case 1: cpu.cx = v; break;
      case 2: cpu.dx = v; break;
      case 3: cpu.bx = v; break;
      case 4: cpu.sp = v; break;
      case 5: cpu.bp = v; break;
      case 6: cpu.si = v; break;
      case 7: cpu.di = v; break;
    }
  }

  function updateFlags8(res) {
    const r = res & 0xFF;
    cpu.zf = r === 0 ? 1 : 0;
    cpu.sf = (r & 0x80) ? 1 : 0;
    cpu.cf = (res > 0xFF || res < 0) ? 1 : 0;
  }

  function updateFlags16(res) {
    const r = res & 0xFFFF;
    cpu.zf = r === 0 ? 1 : 0;
    cpu.sf = (r & 0x8000) ? 1 : 0;
    cpu.cf = (res > 0xFFFF || res < 0) ? 1 : 0;
  }

  function readMem8(seg, off) {
    return ram[((seg << 4) + (off & 0xFFFF)) & 0xFFFFF];
  }

  function writeMem8(seg, off, val) {
    ram[((seg << 4) + (off & 0xFFFF)) & 0xFFFFF] = val & 0xFF;
  }

  function readMem16(seg, off) {
    const lo = readMem8(seg, off);
    const hi = readMem8(seg, (off + 1) & 0xFFFF);
    return lo | (hi << 8);
  }

  function writeMem16(seg, off, val) {
    writeMem8(seg, off, val & 0xFF);
    writeMem8(seg, (off + 1) & 0xFFFF, (val >> 8) & 0xFF);
  }

  function push16(val) {
    cpu.sp = (cpu.sp - 2) & 0xFFFF;
    writeMem16(cpu.ss, cpu.sp, val);
  }

  function pop16() {
    const v = readMem16(cpu.ss, cpu.sp);
    cpu.sp = (cpu.sp + 2) & 0xFFFF;
    return v;
  }

  function vramClearText(attr) {
    const a = typeof attr === "number" ? attr : cpu.textAttr;
    for (let i = 0; i < TEXT_COLS * TEXT_ROWS; i++) {
      ram[VRAM_TXT + i * 2] = 32;
      ram[VRAM_TXT + i * 2 + 1] = a;
    }
    cpu.cursorX = 0;
    cpu.cursorY = 0;
  }

  function vramScrollUp() {
    const rowBytes = TEXT_COLS * 2;
    for (let r = 0; r < TEXT_ROWS - 1; r++) {
      for (let c = 0; c < rowBytes; c++) {
        ram[VRAM_TXT + r * rowBytes + c] = ram[VRAM_TXT + (r + 1) * rowBytes + c];
      }
    }
    const lastRow = (TEXT_ROWS - 1) * rowBytes;
    for (let c = 0; c < TEXT_COLS; c++) {
      ram[VRAM_TXT + lastRow + c * 2] = 32;
      ram[VRAM_TXT + lastRow + c * 2 + 1] = cpu.textAttr;
    }
  }

  function vramPutChar(ch, attr) {
    const a = typeof attr === "number" ? attr : cpu.textAttr;
    if (ch === 13) {
      cpu.cursorX = 0;
      return;
    }
    if (ch === 10) {
      cpu.cursorX = 0;
      cpu.cursorY++;
      if (cpu.cursorY >= TEXT_ROWS) {
        cpu.cursorY = TEXT_ROWS - 1;
        vramScrollUp();
      }
      return;
    }
    if (ch === 8) {
      if (cpu.cursorX > 0) {
        cpu.cursorX--;
        const idx = (cpu.cursorY * TEXT_COLS + cpu.cursorX) * 2;
        ram[VRAM_TXT + idx] = 32;
      }
      return;
    }
    const idx = (cpu.cursorY * TEXT_COLS + cpu.cursorX) * 2;
    ram[VRAM_TXT + idx] = ch & 0xFF;
    ram[VRAM_TXT + idx + 1] = a;
    cpu.cursorX++;
    if (cpu.cursorX >= TEXT_COLS) {
      cpu.cursorX = 0;
      cpu.cursorY++;
      if (cpu.cursorY >= TEXT_ROWS) {
        cpu.cursorY = TEXT_ROWS - 1;
        vramScrollUp();
      }
    }
  }

  function vramPrint(str, attr) {
    for (let i = 0; i < str.length; i++) {
      vramPutChar(str.charCodeAt(i), attr);
    }
  }

  function vramPrintLn(str, attr) {
    vramPrint((str || "") + "\\r\\n", attr);
  }

  function buildRealMachineCodePrograms() {
    const plasmaCom = new Uint8Array([
      0xB8, 0x13, 0x00,
      0xCD, 0x10,
      0xB8, 0x00, 0xA0,
      0x8E, 0xC0,
      0x31, 0xFF,
      0xB9, 0x00, 0xFA,
      0x89, 0xF8,
      0x01, 0xD0,
      0x30, 0xE0,
      0x04, 0x10,
      0xAA,
      0xE2, 0xF5,
      0xFE, 0xC2,
      0xB4, 0x01,
      0xCD, 0x16,
      0x74, 0xE7,
      0xB8, 0x03, 0x00,
      0xCD, 0x10,
      0xCD, 0x20
    ]);

    const fireCom = new Uint8Array([
      0xB8, 0x13, 0x00,
      0xCD, 0x10,
      0xB8, 0x00, 0xA0,
      0x8E, 0xC0,
      0xB4, 0x04,
      0xCD, 0x10,
      0xB4, 0x01,
      0xCD, 0x16,
      0x74, 0xF6,
      0xB8, 0x03, 0x00,
      0xCD, 0x10,
      0xCD, 0x20
    ]);

    const mandelCom = new Uint8Array([
      0xB8, 0x13, 0x00,
      0xCD, 0x10,
      0xB4, 0x05,
      0xCD, 0x10,
      0xB4, 0x01,
      0xCD, 0x16,
      0x74, 0xF6,
      0xB8, 0x03, 0x00,
      0xCD, 0x10,
      0xCD, 0x20
    ]);

    const matrixCom = new Uint8Array([
      0xB8, 0x03, 0x00,
      0xCD, 0x10,
      0xB4, 0x06,
      0xCD, 0x10,
      0xB4, 0x01,
      0xCD, 0x16,
      0x74, 0xF6,
      0xB8, 0x03, 0x00,
      0xCD, 0x10,
      0xCD, 0x20
    ]);

    const msgBytes = Array.from("LuferOS x86 Real-Mode CPU OK!\\r\\nArquitectura: Intel 8086 16-Bit\\r\\nRAM: 1024 KB | Video: VGA 256K\\r\\n$").map(c => c.charCodeAt(0));
    const sysInfoCom = new Uint8Array([
      0xB4, 0x09,
      0xBA, 0x09, 0x01,
      0xCD, 0x21,
      0xCD, 0x20,
      ...msgBytes
    ]);

    return {
      "PLASMA.COM": plasmaCom,
      "FIRE.COM": fireCom,
      "MANDEL.COM": mandelCom,
      "MATRIX.COM": matrixCom,
      "SYSINFO.COM": sysInfoCom,
      "DEMO.ASM": new TextEncoder().encode(
        "MOV AX, 0013\\nINT 10\\nMOV AX, A000\\nMOV ES, AX\\nXOR DI, DI\\nMOV CX, FA00\\nMOV AL, 2A\\nREP STOSB\\nINT 20"
      ),
      "README.TXT": new TextEncoder().encode(
        "LuferOS x86 PC OS V6.0\\nEjecuta binarios .COM reales en CPU 8086.\\nUsa GUI, PLASMA.COM, FIRE.COM, MANDEL.COM, ASM, HEX."
      )
    };
  }

  const vfs = buildRealMachineCodePrograms();

  function handleBiosInt10() {
    const ah = (cpu.ax >> 8) & 0xFF;
    const al = cpu.ax & 0xFF;
    if (ah === 0x00) {
      cpu.videoMode = al;
      dbgVmode.textContent = al === 0x13 ? "MODE 13h (320x200x256)" : "MODE 03h (TEXT)";
      if (al === 0x13) {
        ram.fill(0, VRAM_M13, VRAM_M13 + 64000);
      } else {
        vramClearText(0x0A);
      }
      logKernel("INT 10h: Modo de video cambiado a 0x" + al.toString(16).toUpperCase(), "log-sys");
    } else if (ah === 0x0E) {
      vramPutChar(al, 0x0F);
    } else if (ah === 0x02) {
      cpu.cursorY = Math.min(TEXT_ROWS - 1, (cpu.dx >> 8) & 0xFF);
      cpu.cursorX = Math.min(TEXT_COLS - 1, cpu.dx & 0xFF);
    } else if (ah === 0x04) {
      for (let x = 0; x < 320; x++) {
        ram[VRAM_M13 + 199 * 320 + x] = (Math.random() > 0.42) ? 255 : 16;
      }
      for (let y = 30; y < 199; y++) {
        const row = VRAM_M13 + y * 320;
        for (let x = 1; x < 319; x++) {
          const avg = (
            ram[row + 320 + x - 1] +
            ram[row + 320 + x] +
            ram[row + 320 + x + 1] +
            ram[row + 640 + x]
          ) >> 2;
          ram[row + x] = avg > 2 ? avg - 2 : 0;
        }
      }
    } else if (ah === 0x05) {
      const t = cpu.tickCount * 0.03;
      const zoom = 0.012 - Math.min(0.008, t * 0.0005);
      for (let py = 0; py < 200; py++) {
        const ci = (py - 100) * zoom;
        for (let px = 0; px < 320; px++) {
          const cr = (px - 200) * zoom;
          let zr = 0, zi = 0, iter = 0;
          while (zr * zr + zi * zi <= 4 && iter < 36) {
            const tmp = zr * zr - zi * zi + cr;
            zi = 2 * zr * zi + ci;
            zr = tmp;
            iter++;
          }
          ram[VRAM_M13 + py * 320 + px] = iter === 36 ? 0 : (16 + ((iter * 6 + cpu.tickCount) & 0xDF));
        }
      }
    } else if (ah === 0x06) {
      for (let r = TEXT_ROWS - 1; r >= 1; r--) {
        for (let c = 0; c < TEXT_COLS; c++) {
          ram[VRAM_TXT + (r * TEXT_COLS + c) * 2] = ram[VRAM_TXT + ((r - 1) * TEXT_COLS + c) * 2];
          ram[VRAM_TXT + (r * TEXT_COLS + c) * 2 + 1] = 0x02;
        }
      }
      for (let c = 0; c < TEXT_COLS; c++) {
        ram[VRAM_TXT + c * 2] = Math.random() > 0.65 ? (33 + ((Math.random() * 90) | 0)) : 32;
        ram[VRAM_TXT + c * 2 + 1] = 0x0A;
      }
    }
  }

  function handleBiosInt16() {
    const ah = (cpu.ax >> 8) & 0xFF;
    if (ah === 0x00) {
      if (cpu.keyQueue.length > 0) {
        const k = cpu.keyQueue.shift();
        cpu.ax = k & 0xFFFF;
      } else {
        cpu.ip = (cpu.ip - 2) & 0xFFFF;
      }
    } else if (ah === 0x01) {
      if (cpu.keyQueue.length > 0) {
        cpu.zf = 0;
        cpu.ax = cpu.keyQueue.shift() & 0xFFFF;
      } else {
        cpu.zf = 1;
      }
    }
  }

  function stopRunningProgram(msg) {
    cpu.runningProg = false;
    cpu.videoMode = 0x03;
    dbgVmode.textContent = "MODE 03h (TEXT)";
    statusLed.className = "";
    statusTxt.textContent = "8086 REAL MODE";
    dbgState.textContent = "🟢 KERNEL IDLE • SHELL READY";
    if (msg) vramPrintLn(msg, 0x0E);
    vramPrint("C:\\\\> ", 0x0B);
    logKernel("Proceso finalizado. Control devuelto al Shell.", "log-ok");
  }

  function handleDosInt21() {
    const ah = (cpu.ax >> 8) & 0xFF;
    if (ah === 0x00 || ah === 0x4C) {
      stopRunningProgram("\\r\\n[Proceso x86 terminado con codigo 0]");
    } else if (ah === 0x02) {
      vramPutChar(cpu.dx & 0xFF, 0x0F);
    } else if (ah === 0x09) {
      let ptr = cpu.dx & 0xFFFF;
      let safety = 0;
      while (safety++ < 4096) {
        const ch = readMem8(cpu.ds, ptr);
        if (ch === 36 || ch === 0) break;
        vramPutChar(ch, 0x0F);
        ptr = (ptr + 1) & 0xFFFF;
      }
    }
  }

  function step8086(maxCycles) {
    let executed = 0;
    while (executed < maxCycles && cpu.runningProg) {
      const op = readMem8(cpu.cs, cpu.ip);
      cpu.ip = (cpu.ip + 1) & 0xFFFF;
      executed++;
      cpu.ipsCount++;

      if (op === 0x90) {
        continue;
      } else if (op >= 0xB0 && op <= 0xB7) {
        const imm8 = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        setReg8(op - 0xB0, imm8);
      } else if (op >= 0xB8 && op <= 0xBF) {
        const imm16 = readMem16(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 2) & 0xFFFF;
        setReg16(op - 0xB8, imm16);
      } else if (op === 0x8E) {
        const modrm = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        const sreg = (modrm >> 3) & 3;
        const val = getReg16(modrm & 7);
        if (sreg === 0) cpu.es = val;
        else if (sreg === 1) cpu.cs = val;
        else if (sreg === 2) cpu.ss = val;
        else if (sreg === 3) cpu.ds = val;
      } else if (op === 0x31) {
        const modrm = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        const src = (modrm >> 3) & 7;
        const dst = modrm & 7;
        const res = getReg16(dst) ^ getReg16(src);
        setReg16(dst, res);
        updateFlags16(res);
      } else if (op === 0x30) {
        const modrm = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        const src = (modrm >> 3) & 7;
        const dst = modrm & 7;
        const res = getReg8(dst) ^ getReg8(src);
        setReg8(dst, res);
        updateFlags8(res);
      } else if (op === 0x89) {
        const modrm = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        const src = (modrm >> 3) & 7;
        const dst = modrm & 7;
        setReg16(dst, getReg16(src));
      } else if (op === 0x01) {
        const modrm = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        const src = (modrm >> 3) & 7;
        const dst = modrm & 7;
        const res = getReg16(dst) + getReg16(src);
        setReg16(dst, res);
        updateFlags16(res);
      } else if (op === 0x04) {
        const imm8 = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        const res = (cpu.ax & 0xFF) + imm8;
        setReg8(0, res);
        updateFlags8(res);
      } else if (op === 0x2C) {
        const imm8 = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        const res = (cpu.ax & 0xFF) - imm8;
        setReg8(0, res);
        updateFlags8(res);
      } else if (op === 0xFE) {
        const modrm = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        const subop = (modrm >> 3) & 7;
        const reg = modrm & 7;
        const v = getReg8(reg) + (subop === 0 ? 1 : -1);
        setReg8(reg, v);
        updateFlags8(v);
      } else if (op >= 0x40 && op <= 0x47) {
        const r = op - 0x40;
        const v = getReg16(r) + 1;
        setReg16(r, v);
        updateFlags16(v);
      } else if (op >= 0x48 && op <= 0x4F) {
        const r = op - 0x48;
        const v = getReg16(r) - 1;
        setReg16(r, v);
        updateFlags16(v);
      } else if (op >= 0x50 && op <= 0x57) {
        push16(getReg16(op - 0x50));
      } else if (op >= 0x58 && op <= 0x5F) {
        setReg16(op - 0x58, pop16());
      } else if (op === 0xAA) {
        writeMem8(cpu.es, cpu.di, cpu.ax & 0xFF);
        cpu.di = (cpu.di + (cpu.df ? -1 : 1)) & 0xFFFF;
      } else if (op === 0xAB) {
        writeMem16(cpu.es, cpu.di, cpu.ax);
        cpu.di = (cpu.di + (cpu.df ? -2 : 2)) & 0xFFFF;
      } else if (op === 0xF3) {
        const nextOp = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        if (nextOp === 0xAA) {
          while (cpu.cx > 0) {
            writeMem8(cpu.es, cpu.di, cpu.ax & 0xFF);
            cpu.di = (cpu.di + 1) & 0xFFFF;
            cpu.cx = (cpu.cx - 1) & 0xFFFF;
          }
        }
      } else if (op === 0xE2) {
        const rel = (readMem8(cpu.cs, cpu.ip) << 24) >> 24;
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        cpu.cx = (cpu.cx - 1) & 0xFFFF;
        if (cpu.cx !== 0) {
          cpu.ip = (cpu.ip + rel) & 0xFFFF;
        }
      } else if (op === 0xEB) {
        const rel = (readMem8(cpu.cs, cpu.ip) << 24) >> 24;
        cpu.ip = (cpu.ip + 1 + rel) & 0xFFFF;
      } else if (op === 0x74) {
        const rel = (readMem8(cpu.cs, cpu.ip) << 24) >> 24;
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        if (cpu.zf === 1) {
          cpu.ip = (cpu.ip + rel) & 0xFFFF;
          break;
        }
      } else if (op === 0x75) {
        const rel = (readMem8(cpu.cs, cpu.ip) << 24) >> 24;
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        if (cpu.zf === 0) {
          cpu.ip = (cpu.ip + rel) & 0xFFFF;
          break;
        }
      } else if (op === 0xCD) {
        const intNum = readMem8(cpu.cs, cpu.ip);
        cpu.ip = (cpu.ip + 1) & 0xFFFF;
        if (intNum === 0x10) handleBiosInt10();
        else if (intNum === 0x16) { handleBiosInt16(); break; }
        else if (intNum === 0x20) { stopRunningProgram(); break; }
        else if (intNum === 0x21) handleDosInt21();
      } else if (op === 0xC3 || op === 0xF4) {
        stopRunningProgram();
        break;
      }
    }
  }

  function loadAndRunComBinary(name, bytes) {
    const seg = 0x1000;
    const basePhys = seg << 4;
    ram.fill(0, basePhys, basePhys + 65536);
    ram[basePhys] = 0xCD;
    ram[basePhys + 1] = 0x20;
    const copyLen = Math.min(bytes.length, 65000);
    ram.set(bytes.subarray(0, copyLen), basePhys + 0x0100);

    cpu.cs = seg;
    cpu.ds = seg;
    cpu.es = seg;
    cpu.ss = seg;
    cpu.ip = 0x0100;
    cpu.sp = 0xFFFE;
    cpu.ax = 0;
    cpu.bx = 0;
    cpu.cx = copyLen;
    cpu.dx = 0;
    cpu.si = 0x0100;
    cpu.di = 0xFFFE;
    cpu.keyQueue = [];
    cpu.progName = name;
    cpu.runningProg = true;
    guiMode = false;
    snakeMode = false;

    statusLed.className = "busy";
    statusTxt.textContent = "EXEC " + name;
    dbgState.textContent = "⚡ EJECUTANDO " + name + " EN 8086";
    logKernel("Binario " + name + " (" + copyLen + " bytes) cargado en 1000:0100.", "log-ok");
    pcBeep(960, 0.05);
  }

  function assembleX86Source(srcText) {
    const out = [];
    const lines = srcText.split(/\\r?\\n/);
    const reg16Map = { AX:0, CX:1, DX:2, BX:3, SP:4, BP:5, SI:6, DI:7 };
    const reg8Map = { AL:0, CL:1, DL:2, BL:3, AH:4, CH:5, DH:6, BH:7 };

    for (let raw of lines) {
      const line = raw.trim().toUpperCase();
      if (!line || line.startsWith(";")) continue;
      const parts = line.replace(/,/g, " ").split(/\\s+/);
      const mn = parts[0];

      if (mn === "NOP") out.push(0x90);
      else if (mn === "RET") out.push(0xC3);
      else if (mn === "STOSB") out.push(0xAA);
      else if (mn === "REP" && parts[1] === "STOSB") out.push(0xF3, 0xAA);
      else if (mn === "INT") {
        out.push(0xCD, parseInt(parts[1], 16) & 0xFF);
      } else if (mn === "MOV") {
        const dst = parts[1];
        const src = parts[2];
        if (dst === "ES" && reg16Map[src] !== undefined) {
          out.push(0x8E, 0xC0 | reg16Map[src]);
        } else if (reg16Map[dst] !== undefined) {
          const v = parseInt(src, 16) & 0xFFFF;
          out.push(0xB8 + reg16Map[dst], v & 0xFF, (v >> 8) & 0xFF);
        } else if (reg8Map[dst] !== undefined) {
          const v = parseInt(src, 16) & 0xFF;
          out.push(0xB0 + reg8Map[dst], v);
        }
      } else if (mn === "XOR" && reg16Map[parts[1]] !== undefined && reg16Map[parts[2]] !== undefined) {
        out.push(0x31, 0xC0 | (reg16Map[parts[2]] << 3) | reg16Map[parts[1]]);
      } else if (mn === "INC" && reg16Map[parts[1]] !== undefined) {
        out.push(0x40 + reg16Map[parts[1]]);
      } else if (mn === "DEC" && reg16Map[parts[1]] !== undefined) {
        out.push(0x48 + reg16Map[parts[1]]);
      } else if (mn === "DB") {
        for (let i = 1; i < parts.length; i++) {
          out.push(parseInt(parts[i], 16) & 0xFF);
        }
      }
    }
    return new Uint8Array(out);
  }

  let guiMode = false;
  let snakeMode = false;
  let pointerX = 160;
  let pointerY = 100;
  const guiWindows = [
    { title: "8086 CPU MONITOR", x: 10, y: 18, w: 146, h: 86 },
    { title: "FAT16 DISK C:\\\\", x: 164, y: 18, w: 146, h: 112 }
  ];

  let snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  let snakeDir = { x: 1, y: 0 };
  let snakeFood = { x: 18, y: 12 };
  let snakeScore = 0;

  function renderGuiDesktop() {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 320, 200);

    for (let y = 0; y < 182; y += 16) {
      for (let x = 0; x < 320; x += 16) {
        ctx.fillStyle = "rgba(56,189,248,0.06)";
        ctx.fillRect(x, y, 1, 1);
      }
    }

    guiWindows.forEach(function(w, idx) {
      ctx.fillStyle = "rgba(15,23,42,0.92)";
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = "#00f3ff";
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x, w.y, w.w, w.h);

      ctx.fillStyle = "#1e3a8a";
      ctx.fillRect(w.x, w.y, w.w, 13);
      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 7.5px monospace";
      ctx.fillText(w.title, w.x + 5, w.y + 9);

      if (idx === 0) {
        ctx.fillStyle = "#4ade80";
        ctx.font = "7.5px monospace";
        ctx.fillText("CS:IP " + cpu.cs.toString(16).toUpperCase() + ":" + cpu.ip.toString(16).toUpperCase().padStart(4,"0"), w.x + 6, w.y + 26);
        ctx.fillText("AX:" + cpu.ax.toString(16).toUpperCase().padStart(4,"0") + " BX:" + cpu.bx.toString(16).toUpperCase().padStart(4,"0"), w.x + 6, w.y + 38);
        ctx.fillText("CX:" + cpu.cx.toString(16).toUpperCase().padStart(4,"0") + " DX:" + cpu.dx.toString(16).toUpperCase().padStart(4,"0"), w.x + 6, w.y + 50);
        ctx.fillText("SP:" + cpu.sp.toString(16).toUpperCase().padStart(4,"0") + " RAM:1024K", w.x + 6, w.y + 62);
        ctx.fillStyle = "#38bdf8";
        ctx.fillText("[TOCA UN ARCHIVO ->]", w.x + 6, w.y + 76);
      } else {
        const files = Object.keys(vfs);
        files.slice(0, 7).forEach(function(fn, fi) {
          const fy = w.y + 18 + fi * 13;
          ctx.fillStyle = "rgba(59,130,246,0.18)";
          ctx.fillRect(w.x + 5, fy, w.w - 10, 11);
          ctx.fillStyle = fn.endsWith(".COM") ? "#facc15" : "#e2e8f0";
          ctx.font = "bold 7.5px monospace";
          ctx.fillText((fn.endsWith(".COM") ? "▶ " : "📄 ") + fn, w.x + 9, fy + 8);
        });
      }
    });

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 182, 320, 18);
    ctx.fillStyle = "#00f3ff";
    ctx.fillRect(4, 184, 54, 14);
    ctx.fillStyle = "#090d16";
    ctx.font = "bold 8px monospace";
    ctx.fillText("★ EXIT GUI", 8, 194);

    ctx.fillStyle = "#94a3b8";
    ctx.fillText("LuferOS x86 GUI • Toca un .COM para ejecutarlo", 66, 194);

    ctx.fillStyle = "#fef08a";
    ctx.beginPath();
    ctx.moveTo(pointerX, pointerY);
    ctx.lineTo(pointerX + 8, pointerY + 4);
    ctx.lineTo(pointerX + 4, pointerY + 9);
    ctx.closePath();
    ctx.fill();
  }

  function renderSnakeGame() {
    if (cpu.tickCount % 5 === 0) {
      const head = {
        x: (snake[0].x + snakeDir.x + 40) % 40,
        y: (snake[0].y + snakeDir.y + 22) % 22
      };
      if (head.x === snakeFood.x && head.y === snakeFood.y) {
        snakeScore += 10;
        pcBeep(1046, 0.05);
        snakeFood = { x: (Math.random() * 38) | 0, y: (Math.random() * 20) | 0 };
      } else {
        snake.pop();
      }
      snake.unshift(head);
    }

    ctx.fillStyle = "#050811";
    ctx.fillRect(0, 0, 320, 200);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 320, 16);
    ctx.fillStyle = "#00f3ff";
    ctx.font = "bold 9px monospace";
    ctx.fillText("LUFEROS SNAKE x86 • SCORE: " + snakeScore + " (ESC PARA SALIR)", 8, 11);

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(snakeFood.x * 8, 18 + snakeFood.y * 8, 7, 7);

    snake.forEach(function(seg, i) {
      ctx.fillStyle = i === 0 ? "#facc15" : "#4ade80";
      ctx.fillRect(seg.x * 8, 18 + seg.y * 8, 7, 7);
    });
  }

  function renderVgaFrame() {
    cpu.tickCount++;

    if (guiMode) {
      renderGuiDesktop();
      return;
    }

    if (snakeMode) {
      renderSnakeGame();
      return;
    }

    if (cpu.runningProg) {
      step8086(12000);
    }

    if (cpu.videoMode === 0x13) {
      for (let i = 0; i < 64000; i++) {
        frameBuf32[i] = vgaPalette32[ram[VRAM_M13 + i]];
      }
      ctx.putImageData(imgData, 0, 0);
      return;
    }

    ctx.fillStyle = "#05070e";
    ctx.fillRect(0, 0, 320, 200);
    ctx.font = "bold 9px 'Courier New', monospace";
    ctx.textBaseline = "top";

    const hexColors = [
      "#05070e","#2563eb","#16a34a","#0891b2",
      "#dc2626","#9333ea","#ca8a04","#cbd5e1",
      "#64748b","#60a5fa","#4ade80","#22d3ee",
      "#f87171","#c084fc","#facc15","#ffffff"
    ];

    for (let r = 0; r < TEXT_ROWS; r++) {
      for (let c = 0; c < TEXT_COLS; c++) {
        const idx = (r * TEXT_COLS + c) * 2;
        const ch = ram[VRAM_TXT + idx];
        const attr = ram[VRAM_TXT + idx + 1];
        const bg = (attr >> 4) & 0x0F;
        const fg = attr & 0x0F;
        if (bg !== 0) {
          ctx.fillStyle = hexColors[bg];
          ctx.fillRect(c * 8, r * 8, 8, 8);
        }
        if (ch > 32 && ch < 127) {
          ctx.fillStyle = hexColors[fg];
          ctx.fillText(String.fromCharCode(ch), c * 8 + 1, r * 8);
        }
      }
    }

    if ((cpu.tickCount & 16) === 0 && !cpu.runningProg) {
      ctx.fillStyle = "#00f3ff";
      ctx.fillRect(cpu.cursorX * 8, cpu.cursorY * 8 + 6, 7, 2);
    }
  }

  function executeShellCommand(raw) {
    const clean = raw.trim();
    if (!clean) return;

    if (cpu.runningProg) {
      stopRunningProgram();
    }
    guiMode = false;
    snakeMode = false;

    vramPrintLn(clean, 0x0F);
    logKernel("SHELL CMD: " + clean, "log-sys");
    pcBeep(820, 0.04);

    const parts = clean.split(/\\s+/);
    const cmd = parts[0].toUpperCase();
    const arg1 = (parts[1] || "").toUpperCase();

    if (vfs[cmd] && cmd.endsWith(".COM")) {
      loadAndRunComBinary(cmd, vfs[cmd]);
      return;
    }
    if (vfs[cmd + ".COM"]) {
      loadAndRunComBinary(cmd + ".COM", vfs[cmd + ".COM"]);
      return;
    }

    if (cmd === "HELP" || cmd === "?") {
      vramPrintLn("COMANDOS LUFEROS x86 KERNEL V6.0:", 0x0E);
      vramPrintLn(" DIR / LS      Lista archivos en C:\\\\", 0x0A);
      vramPrintLn(" GUI / WIN     Abre escritorio grafico", 0x0A);
      vramPrintLn(" PLASMA.COM    Demo 8086 VGA Mode 13h", 0x0A);
      vramPrintLn(" FIRE.COM      Demo Fuego VGA 8086", 0x0A);
      vramPrintLn(" MANDEL.COM    Fractal Mandelbrot x86", 0x0A);
      vramPrintLn(" MATRIX.COM    Lluvia VRAM 0xB8000", 0x0A);
      vramPrintLn(" SYSINFO.COM   Info de hardware 8086", 0x0A);
      vramPrintLn(" ASM <F.ASM>   Ensambla codigo x86 a .COM", 0x0A);
      vramPrintLn(" HEX <ARCH>    Volcado hexadecimal", 0x0A);
      vramPrintLn(" TYPE <ARCH>   Muestra contenido texto", 0x0A);
      vramPrintLn(" WRITE <F> <T> Crea archivo en disco", 0x0A);
      vramPrintLn(" REGS / MEM    Muestra registros CPU", 0x0A);
      vramPrintLn(" SNAKE / CLS   Juego Snake / Limpiar", 0x0A);
    } else if (cmd === "CLS" || cmd === "CLEAR") {
      vramClearText(0x0A);
    } else if (cmd === "DIR" || cmd === "LS") {
      vramPrintLn(" Unidad C: LUFEROS_FAT16 (1024 KB RAM)", 0x0E);
      Object.keys(vfs).forEach(function(fn) {
        const sz = String(vfs[fn].length).padStart(6, " ");
        vramPrintLn("  " + fn.padEnd(14, " ") + sz + " bytes", 0x0F);
      });
    } else if (cmd === "GUI" || cmd === "WIN" || cmd === "STARTX") {
      guiMode = true;
      dbgVmode.textContent = "GUI DESKTOP (320x200)";
      logKernel("Entorno grafico de ventanas iniciado.", "log-ok");
      return;
    } else if (cmd === "SNAKE") {
      snakeMode = true;
      snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
      snakeScore = 0;
      dbgVmode.textContent = "SNAKE x86 MODE";
      return;
    } else if (cmd === "REGS") {
      vramPrintLn("AX=" + cpu.ax.toString(16).padStart(4,"0") + " BX=" + cpu.bx.toString(16).padStart(4,"0") + " CX=" + cpu.cx.toString(16).padStart(4,"0") + " DX=" + cpu.dx.toString(16).padStart(4,"0"), 0x0E);
      vramPrintLn("CS=" + cpu.cs.toString(16).padStart(4,"0") + " DS=" + cpu.ds.toString(16).padStart(4,"0") + " ES=" + cpu.es.toString(16).padStart(4,"0") + " SS=" + cpu.ss.toString(16).padStart(4,"0"), 0x0E);
      vramPrintLn("IP=" + cpu.ip.toString(16).padStart(4,"0") + " SP=" + cpu.sp.toString(16).padStart(4,"0") + " FLAGS: Z=" + cpu.zf + " C=" + cpu.cf, 0x0B);
    } else if (cmd === "MEM" || cmd === "FREE") {
      vramPrintLn("Memoria Convencional: 640 KB OK", 0x0A);
      vramPrintLn("VRAM Text/VGA:        128 KB (A0000-BFFFF)", 0x0A);
      vramPrintLn("Memoria Total Bus:   1024 KB (20-bit Real)", 0x0E);
    } else if (cmd === "TYPE" || cmd === "CAT") {
      if (!vfs[arg1]) {
        vramPrintLn("Archivo no encontrado: " + arg1, 0x0C);
      } else {
        const txt = new TextDecoder().decode(vfs[arg1]);
        txt.split(/\\r?\\n/).forEach(function(l) { vramPrintLn(l, 0x0F); });
      }
    } else if (cmd === "HEX" || cmd === "DUMP") {
      const target = vfs[arg1] || vfs["PLASMA.COM"];
      const nameShown = vfs[arg1] ? arg1 : "PLASMA.COM";
      vramPrintLn("HEX DUMP [" + nameShown + "]:", 0x0E);
      for (let i = 0; i < Math.min(48, target.length); i += 8) {
        let hexLine = i.toString(16).padStart(4, "0").toUpperCase() + ": ";
        for (let j = 0; j < 8 && i + j < target.length; j++) {
          hexLine += target[i + j].toString(16).padStart(2, "0").toUpperCase() + " ";
        }
        vramPrintLn(hexLine, 0x0B);
      }
    } else if (cmd === "WRITE") {
      const fn = arg1 || "NOTE.TXT";
      const content = parts.slice(2).join(" ") || "Hola desde LuferOS";
      vfs[fn] = new TextEncoder().encode(content);
      vramPrintLn("Archivo guardado: " + fn + " (" + vfs[fn].length + "B)", 0x0A);
    } else if (cmd === "ASM") {
      const srcName = arg1 || "DEMO.ASM";
      if (!vfs[srcName]) {
        vramPrintLn("No existe " + srcName, 0x0C);
      } else {
        const srcTxt = new TextDecoder().decode(vfs[srcName]);
        const bin = assembleX86Source(srcTxt);
        const outName = srcName.replace(/\\.ASM$/i, "") + ".COM";
        vfs[outName] = bin;
        vramPrintLn("Ensamblado OK -> " + outName + " (" + bin.length + " bytes)", 0x0E);
        logKernel("x86 Assembler genero " + outName + " (" + bin.length + "B)", "log-ok");
      }
    } else if (cmd === "VER" || cmd === "UNAME") {
      vramPrintLn("LuferOS x86 Real-Mode Kernel V6.0 (8086 + VGA)", 0x0E);
    } else {
      vramPrintLn("Comando o binario desconocido: " + cmd, 0x0C);
    }

    if (!cpu.runningProg && !guiMode && !snakeMode) {
      vramPrint("C:\\\\> ", 0x0B);
    }
  }

  async function gunzipBase64ToBytes(b64) {
    const bin = atob(b64);
    const compressed = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) compressed[i] = bin.charCodeAt(i);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }

  function bootKernel() {
    vramClearText(0x0A);
    vramPrintLn("========================================", 0x0B);
    vramPrintLn("  LuferOS x86 REAL-MODE PC OS [V: 6.0]  ", 0x0E);
    vramPrintLn("  CPU: 8086 16-Bit | RAM: 1024KB | VGA  ", 0x0F);
    vramPrintLn("========================================", 0x0B);
    vramPrintLn("Escribe HELP o toca un boton inferior.", 0x0A);
    vramPrint("C:\\\\> ", 0x0B);
    logKernel("BIOS 8086 + IVT + VRAM 0xA0000/0xB8000 inicializados.", "log-ok");
  }

  canvas.addEventListener("pointerdown", function(e) {
    const rect = canvas.getBoundingClientRect();
    pointerX = Math.round(((e.clientX - rect.left) / rect.width) * 320);
    pointerY = Math.round(((e.clientY - rect.top) / rect.height) * 200);

    if (guiMode) {
      if (pointerX <= 62 && pointerY >= 180) {
        guiMode = false;
        dbgVmode.textContent = "MODE 03h (TEXT)";
        return;
      }
      const w = guiWindows[1];
      const files = Object.keys(vfs).slice(0, 7);
      files.forEach(function(fn, fi) {
        const fy = w.y + 18 + fi * 13;
        if (pointerX >= w.x + 5 && pointerX <= w.x + w.w - 5 && pointerY >= fy && pointerY <= fy + 11) {
          if (fn.endsWith(".COM")) {
            loadAndRunComBinary(fn, vfs[fn]);
          } else {
            guiMode = false;
            executeShellCommand("TYPE " + fn);
          }
        }
      });
    } else if (cpu.runningProg) {
      cpu.keyQueue.push(27);
    }
  });

  cmdSend.addEventListener("click", function() {
    const v = cmdInput.value;
    cmdInput.value = "";
    executeShellCommand(v);
  });

  cmdInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      const v = cmdInput.value;
      cmdInput.value = "";
      executeShellCommand(v);
    }
  });

  document.querySelectorAll("[data-cmd]").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      executeShellCommand(btn.getAttribute("data-cmd"));
    });
  });

  document.querySelectorAll("[data-key]").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      const k = btn.getAttribute("data-key");
      if (k === "Escape") {
        if (cpu.runningProg) cpu.keyQueue.push(27);
        if (guiMode || snakeMode) {
          guiMode = false;
          snakeMode = false;
          vramPrint("\\r\\nC:\\\\> ", 0x0B);
        }
      } else if (snakeMode) {
        if (k === "ArrowUp" && snakeDir.y === 0) snakeDir = { x: 0, y: -1 };
        if (k === "ArrowDown" && snakeDir.y === 0) snakeDir = { x: 0, y: 1 };
        if (k === "ArrowLeft" && snakeDir.x === 0) snakeDir = { x: -1, y: 0 };
        if (k === "ArrowRight" && snakeDir.x === 0) snakeDir = { x: 1, y: 0 };
      } else if (cpu.runningProg) {
        cpu.keyQueue.push(13);
      }
    });
  });

  document.getElementById("btn-reboot").addEventListener("click", function() {
    cpu.runningProg = false;
    guiMode = false;
    snakeMode = false;
    cpu.videoMode = 0x03;
    bootKernel();
  });

  document.getElementById("btn-toggle-log").addEventListener("click", function() {
    dbgPanel.classList.toggle("collapsed");
  });

  document.getElementById("btn-clear-log").addEventListener("click", function() {
    dbgLog.innerHTML = "";
    logKernel("Logs limpiados.", "log-sys");
  });

  document.getElementById("btn-copy-log").addEventListener("click", function() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(logHistory.join("\\n")).catch(function(){});
    }
  });

  setInterval(function() {
    tIps.textContent = "IPS: " + (cpu.ipsCount * 2);
    cpu.ipsCount = 0;
    tCsIp.textContent = "CS:IP " + cpu.cs.toString(16).toUpperCase() + ":" + cpu.ip.toString(16).toUpperCase().padStart(4, "0");
    tAxBx.textContent = "AX:" + cpu.ax.toString(16).toUpperCase().padStart(4, "0") + " BX:" + cpu.bx.toString(16).toUpperCase().padStart(4, "0");
    tCxDx.textContent = "CX:" + cpu.cx.toString(16).toUpperCase().padStart(4, "0") + " DX:" + cpu.dx.toString(16).toUpperCase().padStart(4, "0");
  }, 500);

  async function initSystem() {
    bootKernel();
    if (MOUNTED_NAME && MOUNTED_GZIP_B64) {
      try {
        const bytes = await gunzipBase64ToBytes(MOUNTED_GZIP_B64);
        vfs[MOUNTED_NAME] = bytes;
        logKernel("Imagen externa montada en C:\\\\" + MOUNTED_NAME + " (" + bytes.length + "B)", "log-ok");
        if (MOUNTED_NAME.endsWith(".COM")) {
          loadAndRunComBinary(MOUNTED_NAME, bytes);
        }
      } catch (e) {}
    }
    function loop() {
      requestAnimationFrame(loop);
      renderVgaFrame();
    }
    requestAnimationFrame(loop);
  }

  initSystem();
})();`;

  return html
    .replace("__BEZEL_TITLE__", () => options.bezelTitle)
    .replace("__OS_SCRIPT__", () => script);
}

export default {
  name: ["os", "dos", "msdos", "pc", "luferos"],
  category: "group",
  description: "Sistema Operativo LuferOS x86 Real-Mode con CPU 8086, VGA Mode 13h, ensamblador x86 y escritorio GUI.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    await react("💻").catch(() => undefined);

    try {
      const isInlineFallback = args.some((a) =>
        ["inline", "lite", "burbuja"].includes(a.toLowerCase()),
      );
      const cleanArgs = args.filter(
        (a) => !["inline", "lite", "burbuja"].includes(a.toLowerCase()),
      );
      const subCommand = String(cleanArgs[0] || "").toLowerCase();

      if (subCommand === "list" || subCommand === "lista") {
        const savedFiles = fs.readdirSync(CACHE_DIR);
        const listTxt = savedFiles.length
          ? savedFiles.map((f, i) => `${i + 1}. \`${f}\``).join("\n")
          : "• `PLASMA.COM`, `FIRE.COM`, `MANDEL.COM`, `MATRIX.COM`, `SYSINFO.COM` (Integrados en C:\\)";

        return reply(
          `╭〔 💻 ${fytBold("LuferOS x86 PC OS V: 6.0")} 〕⬣\n` +
            `${listTxt}\n` +
            `╰━━━━━━━━━━━━⬣\n` +
            `• Iniciar OS: \`${prefix}os\`\n` +
            `• Modo burbuja grupos: \`${prefix}os inline\`\n` +
            `• Montar binario .com/.asm/.zip: Responde al archivo con \`${prefix}os save <Nombre>\``,
        );
      }

      let mountedFileName = "";
      let mountedFileGzipB64 = "";
      let bezelTitle = "LUFEROS x86 KERNEL V6.0";

      const quotedDoc = await downloadQuotedDocumentBuffer(msg);

      if (quotedDoc) {
        const extracted = isZipBuffer(quotedDoc.buffer)
          ? extractFileFromZipBuffer(quotedDoc.buffer)
          : { buffer: quotedDoc.buffer, fileName: quotedDoc.fileName };

        if (extracted && extracted.buffer.length > 0) {
          const customName =
            subCommand === "save" && cleanArgs[1]
              ? cleanArgs.slice(1).join("_").toUpperCase()
              : extracted.fileName.toUpperCase();
          const finalFileName = customName.includes(".") ? customName : `${customName}.COM`;
          const safeDiskName = finalFileName.replace(/[^A-Z0-9._-]/g, "_");
          const sliced = extracted.buffer.subarray(0, Math.min(extracted.buffer.length, 65000));
          fs.writeFileSync(path.join(CACHE_DIR, safeDiskName), sliced);
          mountedFileName = safeDiskName;
          mountedFileGzipB64 = zlib.gzipSync(sliced, { level: 9 }).toString("base64");
          bezelTitle = `${safeDiskName} • x86 OS`;
        }
      } else if (cleanArgs.length > 0) {
        const searchName = cleanArgs.join(" ").trim();
        const found = getStoredProgramByName(searchName);
        if (found) {
          mountedFileName = found.realName;
          mountedFileGzipB64 = zlib.gzipSync(found.buffer, { level: 9 }).toString("base64");
          bezelTitle = `${found.realName} • x86 OS`;
        }
      }

      const HTML = buildLuferOsHtml({
        mountedFileName,
        mountedFileGzipB64,
        bezelTitle,
      });

      const uniqueResponseId = `LuferOS_X86_${randomUUID().replace(/-/g, "")}`;

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
                    text: `💻 *LuferOS x86 Real-Mode PC OS* • ${bezelTitle}\n_Pulsa el botón inferior para iniciar el sistema operativo. Si tu WhatsApp no muestra el botón, escribe:_ \`${prefix}os inline\``,
                  },
                },
              },
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "GenAIBotProgressStatusPrimitive",
                    title: `💻 LuferOS x86 OS (${bezelTitle})`,
                    is_in_progress: true,
                  },
                },
              },
            ],
            embedded_screens: [
              {
                title: `LuferOS x86 PC OS`,
                content: [
                  {
                    __typename: "FOAIDNixelButtonSheets",
                    tabs: [
                      {
                        id: "tab_0",
                        tab_header: "LuferOS x86 OS",
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
              messageDisclaimerText: "LuferOS x86 Real-Mode System",
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
        `❌ ${fytBold("LuferOS x86 OS:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
