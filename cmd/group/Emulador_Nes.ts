import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "nes_cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const JSNES_URLS = [
  "https://unpkg.com/jsnes@1.2.1/dist/jsnes.min.js",
  "https://cdn.jsdelivr.net/npm/jsnes@1.2.1/dist/jsnes.min.js",
];

let cachedJsnesCode = "";

function isValidNesRom(buf: Buffer): boolean {
  return (
    Buffer.isBuffer(buf) &&
    buf.length > 4096 &&
    buf[0] === 0x4e &&
    buf[1] === 0x45 &&
    buf[2] === 0x53 &&
    buf[3] === 0x1a
  );
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

function extractNesFromZipBuffer(zipBuf: Buffer): { buffer: Buffer; fileName: string } | null {
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

      if (dataEnd > zipBuf.length) continue;

      const slice = zipBuf.subarray(dataStart, dataEnd);
      let outBuf: Buffer | null = null;

      try {
        if (method === 0) {
          outBuf = Buffer.from(slice);
        } else if (method === 8) {
          outBuf = zlib.inflateRawSync(slice);
        }
      } catch {}

      if (outBuf && isValidNesRom(outBuf)) {
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

    if (outBuf && isValidNesRom(outBuf)) {
      return { buffer: outBuf, fileName: path.basename(entryName || "rom.nes") };
    }

    offset = dataEnd;
  }

  return null;
}

function extractNesFromAnyBuffer(rawBuf: Buffer, originalName = "rom.nes"): { buffer: Buffer; fileName: string } | null {
  if (isValidNesRom(rawBuf)) {
    return { buffer: rawBuf, fileName: originalName };
  }
  if (isZipBuffer(rawBuf)) {
    return extractNesFromZipBuffer(rawBuf);
  }
  return null;
}

async function fetchBufferWithTimeout(url: string, timeoutMs = 14000): Promise<Buffer> {
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

async function getJsnesEngineCode(): Promise<string> {
  if (cachedJsnesCode) return cachedJsnesCode;
  const localCache = path.join(CACHE_DIR, "jsnes.min.js");
  if (fs.existsSync(localCache) && fs.statSync(localCache).size > 10000) {
    cachedJsnesCode = fs.readFileSync(localCache, "utf8");
    return cachedJsnesCode;
  }
  for (const url of JSNES_URLS) {
    try {
      const buf = await fetchBufferWithTimeout(url, 10000);
      const str = buf.toString("utf8");
      if (str.includes("jsnes")) {
        fs.writeFileSync(localCache, str, "utf8");
        cachedJsnesCode = str;
        return cachedJsnesCode;
      }
    } catch {}
  }
  throw new Error("No se pudo descargar el motor JSNES.");
}

function getStoredRomByName(nameKey: string): { buffer: Buffer; realName: string } | null {
  const cleanKey = nameKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!fs.existsSync(CACHE_DIR)) return null;

  const files = fs.readdirSync(CACHE_DIR);
  for (const f of files) {
    if (!f.toLowerCase().endsWith(".nes")) continue;
    const baseName = f.slice(0, -4);
    const cleanBase = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanBase === cleanKey || cleanBase.includes(cleanKey) || cleanKey.includes(cleanBase)) {
      const p = path.join(CACHE_DIR, f);
      const buf = fs.readFileSync(p);
      if (isValidNesRom(buf)) {
        return { buffer: buf, realName: baseName };
      }
    }
  }
  return null;
}

function checkForDuplicateRom(newBuf: Buffer): string | null {
  if (!fs.existsSync(CACHE_DIR)) return null;
  const files = fs.readdirSync(CACHE_DIR);
  for (const f of files) {
    if (!f.toLowerCase().endsWith(".nes")) continue;
    const p = path.join(CACHE_DIR, f);
    const existingBuf = fs.readFileSync(p);
    if (existingBuf.length === newBuf.length && existingBuf.equals(newBuf)) {
      return f.slice(0, -4);
    }
  }
  return null;
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
    if (buffer.length > 512) {
      return { buffer, fileName: String(doc.fileName || "game.nes") };
    }
  }
  return null;
}

function buildConsoleHtml(options: {
  jsnesCode: string;
  romGzipBase64: string;
  romRawBase64: string;
  isGzipped: boolean;
  banner: string;
  bezelTitle: string;
}): string {
  const template = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none}
html,body{width:100%;min-height:100%;background:#08111d}
body{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;background:#08111d}
#gb-case{width:min(98vw,720px);max-width:720px;margin:0 auto;background:linear-gradient(180deg,#e83d32 0%,#c91f27 46%,#9f1820 100%);border:3px solid #731016;border-radius:20px 20px 42px 20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 16px 34px rgba(0,0,0,.68),inset 0 2px 0 rgba(255,255,255,.35);transform:translateZ(0);contain:content}
#gb-case:before{content:"${options.banner}";display:block;text-align:center;padding:6px 10px 5px;color:#fff5d0;font-size:clamp(10px,2vw,14px);font-weight:900;letter-spacing:1.5px;text-shadow:0 2px 0 #841017,0 0 8px rgba(255,230,90,.3);background:linear-gradient(90deg,#b61723,#ef4235 50%,#b61723);border-bottom:2px solid #f0c83e}
#screen-wrap{width:100%;background:linear-gradient(180deg,#4aa9e8 0%,#2383c7 55%,#17649e 100%);border-bottom:3px solid #71202a;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;padding:clamp(8px,1.5vw,12px) clamp(6px,1.8vw,14px) clamp(10px,2vw,14px);contain:paint layout}
#bezel-top{width:94%;display:flex;align-items:center;justify-content:space-between;margin-bottom:clamp(5px,1vw,8px)}
.stripe-line{flex:1;height:3px;margin:0 6px;background:linear-gradient(90deg,#ffe04b,#fff7bd,#ffe04b);box-shadow:0 1px 0 #18456e}
.bezel-title{font-size:clamp(7px,1.5vw,10px);font-weight:900;letter-spacing:1.2px;color:#fff2a4;text-transform:uppercase;text-shadow:0 1px 0 #7b171d}
#screen-container{position:relative;width:96%;height:auto;aspect-ratio:256/240;background:#000;border:clamp(2px,.5vw,4px) solid #6e1118;border-radius:10px;overflow:hidden;display:flex;justify-content:center;align-items:center;box-shadow:inset 0 0 16px rgba(0,0,0,.88),0 0 0 2px #f1c943;contain:paint layout;will-change:transform;transform:translateZ(0)}
canvas#nes{width:100%;height:100%;object-fit:fill;display:block;image-rendering:pixelated;image-rendering:crisp-edges;will-change:contents;transform:translateZ(0)}
#status-ind{position:absolute;left:8px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;z-index:2;cursor:pointer;padding:4px}
#status-led{width:7px;height:7px;border-radius:50%;background:#4cff57;box-shadow:0 0 7px #4cff57;transition:background .15s,box-shadow .15s}.status-connecting #status-led{background:#ffd21f;box-shadow:0 0 8px #ffd21f;animation:statusPulse 1s ease-in-out infinite}.status-loading #status-led{background:#a0a0a0;box-shadow:0 0 8px #a0a0a0;animation:statusPulse 1.2s ease-in-out infinite}.status-active #status-led{background:#4cff57;box-shadow:0 0 8px #4cff57}.status-error #status-led{background:#ff3030;box-shadow:0 0 9px #ff3030}@keyframes statusPulse{0%,100%{opacity:.45;transform:scale(.82)}50%{opacity:1;transform:scale(1.25)}}
#status-text{font-size:5px;font-weight:900;color:#fff;letter-spacing:.5px;text-shadow:0 1px 0 #671018}
#error{display:none;width:94%;margin:8px auto 0;padding:6px 8px;background:#4a0f14;border:1px solid #c63d45;border-radius:6px;color:#ffdfe1;font-size:10px;line-height:1.3}
#pad{width:100%;padding:clamp(10px,2vw,18px) clamp(5px,2.5vw,22px) max(18px,env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,#2f8dcc 0%,#155e9c 100%);display:flex;flex-direction:column;gap:0;position:relative}
#top-ctrl{width:100%;padding:0;margin:0 0 clamp(28px,8vw,56px);display:flex;justify-content:center;align-items:center;gap:clamp(34px,12vw,88px);position:relative}
#top-ctrl button{width:clamp(72px,14vw,108px);height:clamp(30px,5.5vw,42px);margin:0;border:2px solid #6f1017;border-radius:9px;background:linear-gradient(180deg,#f04435,#b91d27);color:#ffe04b;box-shadow:0 3px 0 #6d1118,inset 0 1px 2px rgba(255,255,255,.3);cursor:pointer;font-size:clamp(10px,1.8vw,14px);font-weight:900;letter-spacing:1px;display:flex;align-items:center;justify-content:center;transition:transform .06s,background .06s}
#top-ctrl button:active,#top-ctrl button.touching{transform:translateY(2px);background:#941820;box-shadow:0 1px 0 #4d0b10}
#main-row{width:100%;padding:clamp(4px,1vw,10px) 0 0;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;column-gap:clamp(18px,8vw,64px)}
#dpad{flex:0 0 auto;display:grid;grid-template-columns:repeat(3,clamp(45px,11.5vw,78px));grid-template-rows:repeat(3,clamp(45px,11.5vw,78px));gap:clamp(3px,.7vw,5px);padding:clamp(10px,2vw,15px);background:linear-gradient(145deg,#68b8eb,#2d7bb4);border:2px solid #15537e;border-radius:50%;box-shadow:0 5px 13px rgba(0,0,0,.48),inset 0 2px 4px rgba(255,255,255,.28)}
#main-row #dpad{grid-column:1;justify-self:start}
#dpad button{border:none;border-radius:clamp(7px,1.3vw,10px);background:linear-gradient(180deg,#2d6fb0 0%,#17477b 100%);color:#fff;font-size:clamp(17px,3.5vw,25px);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 0 #0a2947,inset 0 1px 1px rgba(255,255,255,.2);cursor:pointer}
#dpad button:active,#dpad button.touching{background:#e02e34!important;color:#fff;transform:scale(.94) translateY(2px);box-shadow:0 0 0 #000}
#dpad-center{background:#ffd83d!important;border:2px solid #c49d13;border-radius:50%!important}
#act{flex:0 0 auto;display:flex;gap:clamp(12px,3vw,28px);padding:clamp(10px,2vw,16px) clamp(14px,3vw,28px);background:linear-gradient(145deg,#6ec0ef,#2d7cb5);border:2px solid #15537e;border-radius:36px;align-items:center;box-shadow:0 5px 13px rgba(0,0,0,.48),inset 0 2px 4px rgba(255,255,255,.28)}
#main-row #act{grid-column:3;justify-self:end}
#act button{width:clamp(52px,10vw,72px);height:clamp(52px,10vw,72px);border-radius:50%;border:3px solid;color:#fff;font-size:clamp(16px,3vw,22px);font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 0 rgba(55,16,24,.55),inset 0 2px 3px rgba(255,255,255,.34);transition:transform .06s}
#btn-a{background:linear-gradient(180deg,#f34b3f,#be1d27);border-color:#ffc1bb;text-shadow:0 2px 0 #861017}
#btn-b{background:linear-gradient(180deg,#ffd94b,#e1ae22);border-color:#fff0a2;color:#5b3d00;text-shadow:none}
#act button:active,#act button.touching{transform:scale(.94) translateY(2px)}
#reset-btn{border:1px solid #6f1017;border-radius:8px;background:linear-gradient(180deg,#f04435,#b91d27);color:#ffe04b;padding:8px 14px;font-weight:900;font-size:11px;letter-spacing:.5px;cursor:pointer;box-shadow:0 2px 0 #6d1118;margin:18px auto 0;display:block}
</style>
<body>
<div id="gb-case">
    <div id="screen-wrap">
        <div id="bezel-top">
            <div class="stripe-line"></div>
            <div class="bezel-title" id="game-name">${options.bezelTitle}</div>
            <div class="stripe-line"></div>
        </div>
        <div id="screen-container">
            <div id="status-ind" class="status-loading">
                <div id="status-led"></div>
                <div id="status-text">LOADING</div>
            </div>
            <canvas id="nes" width="256" height="240" role="img" aria-label="NES"></canvas>
        </div>
        <div id="error"></div>
    </div>
    <div id="pad" role="group" aria-label="Controles del juego">
        <div id="top-ctrl">
            <button id="sel" aria-label="Select">SELECT</button>
            <button id="st" aria-label="Start">START</button>
        </div>
        <div id="main-row">
            <div id="dpad" role="group" aria-label="Cruz direccional">
                <div></div>
                <button id="u" aria-label="Arriba">▲</button>
                <div></div>
                <button id="l" aria-label="Izquierda">◀</button>
                <div id="dpad-center"></div>
                <button id="r" aria-label="Derecha">▶</button>
                <div></div>
                <button id="d" aria-label="Abajo">▼</button>
                <div></div>
            </div>
            <div id="act" role="group" aria-label="Botones de acción">
                <button id="btn-b" aria-label="Botón B">B</button>
                <button id="btn-a" aria-label="Botón A">A</button>
            </div>
        </div>
        <button id="reset-btn">REINICIAR</button>
    </div>
</div>
<script>__NessEmulator__</script>
</body>`;

  const emulatorBootstrap = `
${options.jsnesCode}
(function(){
  const IS_GZIP = ${options.isGzipped ? "true" : "false"};
  const ROM_GZIP_B64 = "${options.romGzipBase64}";
  const ROM_RAW_B64 = "${options.romRawBase64}";

  const canvas = document.getElementById("nes");
  const ctx = canvas.getContext("2d", { alpha: false });
  const imgData = ctx.createImageData(256, 240);
  const buf32 = new Uint32Array(imgData.data.buffer);
  const statusInd = document.getElementById("status-ind");
  const statusTxt = document.getElementById("status-text");
  const errBox = document.getElementById("error");

  function setStatus(cls, text) {
    statusInd.className = "status-" + cls;
    statusTxt.textContent = text;
  }

  function showError(msg) {
    setStatus("error", "ERROR");
    errBox.style.display = "block";
    errBox.textContent = msg;
  }

  const AUDIO_BUF_SIZE = 8192;
  const AUDIO_MASK = AUDIO_BUF_SIZE - 1;
  const audioL = new Float32Array(AUDIO_BUF_SIZE);
  const audioR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWrite = 0;
  let audioRead = 0;
  let audioCtx = null;

  function unlockAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
        const proc = audioCtx.createScriptProcessor(2048, 0, 2);
        proc.onaudioprocess = function(e) {
          const outL = e.outputBuffer.getChannelData(0);
          const outR = e.outputBuffer.getChannelData(1);
          for (let i = 0; i < outL.length; i++) {
            if (audioRead !== audioWrite) {
              outL[i] = audioL[audioRead];
              outR[i] = audioR[audioRead];
              audioRead = (audioRead + 1) & AUDIO_MASK;
            } else {
              outL[i] = 0;
              outR[i] = 0;
            }
          }
        };
        proc.connect(audioCtx.destination);
      }
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
      }
    } catch (e) {}
  }

  let nes = null;
  let running = false;
  let loadedRomBinary = "";

  function initNesInstance() {
    nes = new jsnes.NES({
      onFrame: function(frameBuffer) {
        for (let i = 0; i < 61440; i++) {
          buf32[i] = 0xFF000000 | frameBuffer[i];
        }
        ctx.putImageData(imgData, 0, 0);
      },
      onAudioSample: function(left, right) {
        const nextWrite = (audioWrite + 1) & AUDIO_MASK;
        if (nextWrite !== audioRead) {
          audioL[audioWrite] = left * 0.65;
          audioR[audioWrite] = right * 0.65;
          audioWrite = nextWrite;
        }
      }
    });
  }

  async function decodeRomBytes() {
    if (IS_GZIP && typeof DecompressionStream !== "undefined" && ROM_GZIP_B64) {
      const bin = atob(ROM_GZIP_B64);
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
    const rawBin = atob(ROM_RAW_B64);
    const out = new Uint8Array(rawBin.length);
    for (let i = 0; i < rawBin.length; i++) out[i] = rawBin.charCodeAt(i);
    return out;
  }

  function uint8ToBinaryString(u8) {
    const chunks = [];
    const step = 8192;
    for (let i = 0; i < u8.length; i += step) {
      chunks.push(String.fromCharCode.apply(null, u8.subarray(i, i + step)));
    }
    return chunks.join("");
  }

  let lastFrameTime = performance.now();
  const FRAME_INTERVAL = 1000 / 60.098;

  function frameLoop(now) {
    requestAnimationFrame(frameLoop);
    if (!running || !nes) return;
    const elapsed = now - lastFrameTime;
    if (elapsed >= FRAME_INTERVAL) {
      lastFrameTime = now - (elapsed % FRAME_INTERVAL);
      try {
        nes.frame();
      } catch (err) {}
    }
  }

  function bindButton(elId, btnConst) {
    const el = document.getElementById(elId);
    if (!el) return;
    const press = function(e) {
      if (e && e.cancelable) e.preventDefault();
      unlockAudio();
      el.classList.add("touching");
      if (nes) nes.buttonDown(1, btnConst);
    };
    const release = function(e) {
      if (e && e.cancelable) e.preventDefault();
      el.classList.remove("touching");
      if (nes) nes.buttonUp(1, btnConst);
    };
    el.addEventListener("touchstart", press, { passive: false });
    el.addEventListener("touchend", release, { passive: false });
    el.addEventListener("touchcancel", release, { passive: false });
    el.addEventListener("mousedown", press);
    el.addEventListener("mouseup", release);
    el.addEventListener("mouseleave", release);
  }

  function setupInputs() {
    const C = jsnes.Controller;
    bindButton("u", C.BUTTON_UP);
    bindButton("d", C.BUTTON_DOWN);
    bindButton("l", C.BUTTON_LEFT);
    bindButton("r", C.BUTTON_RIGHT);
    bindButton("btn-a", C.BUTTON_A);
    bindButton("btn-b", C.BUTTON_B);
    bindButton("sel", C.BUTTON_SELECT);
    bindButton("st", C.BUTTON_START);

    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function(e) {
        e.preventDefault();
        unlockAudio();
        if (nes && loadedRomBinary) {
          nes.reset();
          nes.loadROM(loadedRomBinary);
        }
      });
    }

    const keyMap = {
      ArrowUp: C.BUTTON_UP, KeyW: C.BUTTON_UP,
      ArrowDown: C.BUTTON_DOWN, KeyS: C.BUTTON_DOWN,
      ArrowLeft: C.BUTTON_LEFT, KeyA: C.BUTTON_LEFT,
      ArrowRight: C.BUTTON_RIGHT, KeyD: C.BUTTON_RIGHT,
      KeyK: C.BUTTON_A, KeyZ: C.BUTTON_A, Space: C.BUTTON_A,
      KeyJ: C.BUTTON_B, KeyX: C.BUTTON_B, ShiftLeft: C.BUTTON_B,
      Enter: C.BUTTON_START,
      Tab: C.BUTTON_SELECT, Backspace: C.BUTTON_SELECT
    };

    window.addEventListener("keydown", function(e) {
      if (keyMap[e.code] !== undefined && nes) {
        e.preventDefault();
        unlockAudio();
        nes.buttonDown(1, keyMap[e.code]);
      }
    });
    window.addEventListener("keyup", function(e) {
      if (keyMap[e.code] !== undefined && nes) {
        e.preventDefault();
        nes.buttonUp(1, keyMap[e.code]);
      }
    });
  }

  async function boot() {
    try {
      setStatus("connecting", "DECODING");
      initNesInstance();
      setupInputs();
      const romBytes = await decodeRomBytes();
      loadedRomBinary = uint8ToBinaryString(romBytes);
      nes.loadROM(loadedRomBinary);
      running = true;
      setStatus("active", "ACTIVE");
      requestAnimationFrame(frameLoop);
    } catch (err) {
      showError("Error cargando ROM: " + (err && err.message ? err.message : String(err)));
    }
  }

  boot();
})();`;

  return template.replace("__NessEmulator__", () => emulatorBootstrap);
}

export default {
  name: ["nes", "mario", "mario3", "mario1", "contra", "tetris", "pacman", "save"],
  category: "group",
  description: "Emulador LuferOS NES: emula cualquier juego con sistema .nes save <Nombre> y detección de duplicados.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".nes";

    const rawBody =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      msg?.message?.imageMessage?.caption ||
      msg?.message?.videoMessage?.caption ||
      "";
    const invokedCmd = rawBody
      .trim()
      .slice(prefix.length)
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();

    await react("🍄").catch(() => undefined);

    try {
      const jsnesCode = await getJsnesEngineCode();
      let romBuffer: Buffer | null = null;
      let displayTitle = "Super Mario Bros • NESS";
      let customSaveName = "";

      const quotedDoc = await downloadQuotedDocumentBuffer(msg);
      const subCommand = String(args[0] || "").toLowerCase();

      if (subCommand === "save" && args[1]) {
        customSaveName = args.slice(1).join(" ").trim();
      }

      if (quotedDoc) {
        const extracted = extractNesFromAnyBuffer(quotedDoc.buffer, quotedDoc.fileName);
        if (!extracted) {
          throw new Error(`El archivo adjunto no es una ROM .nes válida ni un .zip con un archivo .nes dentro.`);
        }
        romBuffer = extracted.buffer;

        const originalBaseName = extracted.fileName.replace(/\.(nes|zip)$/i, "").trim();
        const finalNameKey = customSaveName || originalBaseName;

        const duplicateRealName = checkForDuplicateRom(romBuffer);
        if (duplicateRealName && duplicateRealName.toLowerCase() !== finalNameKey.toLowerCase()) {
          await react("⚠️").catch(() => undefined);
          return reply(
            `⚠️ *Emulador LuferOS*\nEste juego ya está guardado en la memoria con el nombre: \`${duplicateRealName}\`. No se requiere duplicarlo.`,
          );
        }

        const safeFileName = finalNameKey.replace(/[^a-zA-Z0-9._-]/g, "_") + ".nes";
        fs.writeFileSync(path.join(CACHE_DIR, safeFileName), romBuffer);
        displayTitle = `${finalNameKey.toUpperCase()} • NESS`;
      } else if (subCommand === "save" && !quotedDoc) {
        return reply("⚠️ Por favor, responde a un documento `.nes` o `.zip` con `.nes save <nombre>` para guardarlo.");
      } else {
        const searchName = (customSaveName || args.join(" ")).trim() || invokedCmd;
        const found = getStoredRomByName(searchName);
        if (found) {
          romBuffer = found.buffer;
          displayTitle = `${found.realName.toUpperCase()} • NESS`;
        } else {
          const fallback = getStoredRomByName("mario") || getStoredRomByName("contra") || getStoredRomByName("tetris");
          if (fallback) {
            romBuffer = fallback.buffer;
            displayTitle = `${fallback.realName.toUpperCase()} • NESS`;
          } else {
            throw new Error(
              `No se encontró ningún juego guardado con el nombre "${searchName}". Envía un archivo .nes o .zip al chat y respóndele con .nes save <nombre> para guardarlo en memoria.`,
            );
          }
        }
      }

      const gzipped = zlib.gzipSync(romBuffer, { level: 9 });
      const useGzip = romBuffer.length > 65536;

      const HTML = buildConsoleHtml({
        jsnesCode,
        romGzipBase64: useGzip ? gzipped.toString("base64") : "",
        romRawBase64: useGzip ? "" : romBuffer.toString("base64"),
        isGzipped: useGzip,
        banner: `★  EMULADOR LUFEROS NES  ★`,
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
                title: `🎮 EMULADOR LUFEROS NES: ${displayTitle}`,
                is_in_progress: true,
              },
            },
          },
        ],
        embedded_screens: [
          {
            title: `LuferOS NES • ${displayTitle}`,
            content: [
              {
                __typename: "FOAIDNixelButtonSheets",
                tabs: [
                  {
                    id: "tab_0",
                    tab_header: "LuferOS NES",
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
        `❌ ${fytBold("Emulador LuferOS:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
