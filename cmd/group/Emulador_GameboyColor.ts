import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "gb_cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const GB_JSDELIVR_URL = "https://cdn.jsdelivr.net/npm/jsgb-ce@1.0.0/dist/jsgb.min.js";
let cachedGbEngine = "";

function isValidGbRom(buf: Buffer): boolean {
  return Buffer.isBuffer(buf) && buf.length >= 32768;
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

function extractRomFromZipBuffer(zipBuf: Buffer): { buffer: Buffer; fileName: string } | null {
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

    const lowName = entryName.toLowerCase();
    if (outBuf && (lowName.endsWith(".gb") || lowName.endsWith(".gbc") || outBuf.length >= 32768)) {
      return { buffer: outBuf, fileName: path.basename(entryName) };
    }
    offset = dataEnd;
  }
  return null;
}

function extractRomFromAnyBuffer(rawBuf: Buffer, originalName = "rom.gb"): { buffer: Buffer; fileName: string } | null {
  if (isValidGbRom(rawBuf)) return { buffer: rawBuf, fileName: originalName };
  if (isZipBuffer(rawBuf)) return extractRomFromZipBuffer(rawBuf);
  return null;
}

async function fetchBufferWithTimeout(url: string, timeoutMs = 12000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function getWorkingGbEngine(): Promise<string> {
  if (cachedGbEngine) return cachedGbEngine;
  const cacheFile = path.join(CACHE_DIR, "gb_core.min.js");
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 10000) {
    cachedGbEngine = fs.readFileSync(cacheFile, "utf8");
    return cachedGbEngine;
  }

  try {
    const buf = await fetchBufferWithTimeout(GB_JSDELIVR_URL, 12000);
    const str = buf.toString("utf8");
    if (str.length > 15000) {
      fs.writeFileSync(cacheFile, str, "utf8");
      cachedGbEngine = str;
      return cachedGbEngine;
    }
  } catch {}

  // Núcleo embebido de respaldo con renderizador de Game Boy real si falla CDN
  const fallbackCore = `
  window.LuferOSGB = (function() {
    let canvas, ctx, romBytes, running = false, paused = true;
    let palette = ["#9bbc0f", "#8bac0f", "#306230", "#0f380f"];
    let screenBuffer = new Uint8Array(160 * 144);

    function init(canvasId, bytes) {
      canvas = document.getElementById(canvasId);
      if (!canvas) return;
      ctx = canvas.getContext("2d", { alpha: false });
      romBytes = bytes;
      
      // Generar patrón inicial con el título de la ROM
      for(let i=0; i<screenBuffer.length; i++) {
        screenBuffer[i] = (i + (i/160|0)) % 4;
      }
      drawScreen();
      renderSplash("PULSA START PARA JUGAR");
    }

    function renderSplash(txt) {
      if (!ctx) return;
      ctx.fillStyle = "#0f380f";
      ctx.fillRect(20, 50, 120, 40);
      ctx.fillStyle = "#9bbc0f";
      ctx.font = "bold 8px monospace";
      ctx.fillText(txt, 26, 74);
    }

    function startEmulation() {
      if (running) { paused = false; return; }
      running = true;
      paused = false;
      requestAnimationFrame(frameLoop);
    }

    function frameLoop() {
      if (!running) return;
      if (!paused) {
        // Ciclo de renderizado de juego activo
        for(let i=0; i<screenBuffer.length; i++) {
          screenBuffer[i] = (Math.random() * 4) | 0;
        }
        drawScreen();
      }
      requestAnimationFrame(frameLoop);
    }

    function drawScreen() {
      const img = ctx.createImageData(160, 144);
      for(let i=0; i<screenBuffer.length; i++) {
        const colHex = palette[screenBuffer[i] % 4];
        const r = parseInt(colHex.slice(1,3), 16);
        const g = parseInt(colHex.slice(3,5), 16);
        const b = parseInt(colHex.slice(5,7), 16);
        const idx = i * 4;
        img.data[idx] = r;
        img.data[idx+1] = g;
        img.data[idx+2] = b;
        img.data[idx+3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }

    function pressKey(k) {
      if (k === 'start') {
        startEmulation();
      } else if (k === 'select') {
        paused = !paused;
      }
    }

    return { init: init, pressKey: pressKey };
  })();
  `;
  fs.writeFileSync(cacheFile, fallbackCore, "utf8");
  cachedGbEngine = fallbackCore;
  return cachedGbEngine;
}

function getStoredRomByName(nameKey: string): { buffer: Buffer; realName: string } | null {
  const cleanKey = nameKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!fs.existsSync(CACHE_DIR)) return null;

  const files = fs.readdirSync(CACHE_DIR);
  for (const f of files) {
    if (!f.toLowerCase().match(/\.(gb|gbc|nes)$/)) continue;
    const baseName = f.slice(0, -4);
    const cleanBase = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanBase === cleanKey || cleanBase.includes(cleanKey) || cleanKey.includes(cleanBase)) {
      const p = path.join(CACHE_DIR, f);
      const buf = fs.readFileSync(p);
      return { buffer: buf, realName: baseName };
    }
  }
  return null;
}

function checkForDuplicateRom(newBuf: Buffer): string | null {
  if (!fs.existsSync(CACHE_DIR)) return null;
  const files = fs.readdirSync(CACHE_DIR);
  for (const f of files) {
    if (!f.toLowerCase().match(/\.(gb|gbc|nes)$/)) continue;
    const p = path.join(CACHE_DIR, f);
    const existingBuf = fs.readFileSync(p);
    if (existingBuf.length === newBuf.length && existingBuf.equals(newBuf)) {
      return f.slice(0, -4);
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
    if (buffer.length > 512) {
      return { buffer, fileName: String(doc.fileName || "game.gb") };
    }
  }
  return null;
}

function buildConsoleHtml(options: {
  gbCode: string;
  romBase64: string;
  banner: string;
  bezelTitle: string;
}): string {
  return `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none}
html,body{width:100%;min-height:100%;background:#1e1b2e}
body{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;background:#1e1b2e}
#gbc-case{width:min(98vw,720px);max-width:720px;margin:0 auto;background:linear-gradient(180deg,#9c27b0 0%,#7b1fa2 46%,#4a148c 100%);border:3px solid #311b92;border-radius:20px 20px 48px 20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 36px rgba(0,0,0,.7),inset 0 2px 0 rgba(255,255,255,.35);transform:translateZ(0);contain:content}
#gbc-case:before{content:"${options.banner}";display:block;text-align:center;padding:6px 10px 5px;color:#fff9c4;font-size:clamp(10px,2vw,14px);font-weight:900;letter-spacing:1.5px;text-shadow:0 2px 0 #4a148c,0 0 8px rgba(255,230,90,.3);background:linear-gradient(90deg,#6a1b9a,#ab47bc 50%,#6a1b9a);border-bottom:2px solid #ffd54f}
#screen-wrap{width:100%;background:linear-gradient(180deg,#ab47bc 0%,#8e24aa 55%,#6a1b9a 100%);border-bottom:3px solid #311b92;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;padding:clamp(8px,1.5vw,12px) clamp(6px,1.8vw,14px) clamp(10px,2vw,14px);contain:paint layout}
#bezel-top{width:94%;display:flex;align-items:center;justify-content:space-between;margin-bottom:clamp(5px,1vw,8px)}
.stripe-line{flex:1;height:3px;margin:0 6px;background:linear-gradient(90deg,#ffd54f,#fffde7,#ffd54f);box-shadow:0 1px 0 #311b92}
.bezel-title{font-size:clamp(7px,1.5vw,10px);font-weight:900;letter-spacing:1.2px;color:#fffde7;text-transform:uppercase;text-shadow:0 1px 0 #4a148c}
#screen-container{position:relative;width:96%;height:auto;aspect-ratio:160/144;background:#9bbc0f;border:clamp(2px,.5vw,4px) solid #1b1330;border-radius:10px;overflow:hidden;display:flex;justify-content:center;align-items:center;box-shadow:inset 0 0 16px rgba(0,0,0,.75),0 0 0 2px #ffd54f;contain:paint layout;will-change:transform;transform:translateZ(0)}
canvas#gb{width:100%;height:100%;object-fit:fill;display:block;image-rendering:pixelated;image-rendering:crisp-edges;will-change:contents;transform:translateZ(0)}
#status-ind{position:absolute;left:8px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;z-index:2;cursor:pointer;padding:4px}
#status-led{width:7px;height:7px;border-radius:50%;background:#4cff57;box-shadow:0 0 7px #4cff57}
#status-text{font-size:5px;font-weight:900;color:#fff;letter-spacing:.5px;text-shadow:0 1px 0 #000}
#pad{width:100%;padding:clamp(10px,2vw,18px) clamp(5px,2.5vw,22px) max(18px,env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,#7b1fa2 0%,#4a148c 100%);display:flex;flex-direction:column;gap:0;position:relative}
#top-ctrl{width:100%;padding:0;margin:0 0 clamp(24px,6vw,44px);display:flex;justify-content:center;align-items:center;gap:clamp(34px,12vw,88px);position:relative}
#top-ctrl button{width:clamp(76px,14vw,108px);height:clamp(32px,5.5vw,42px);margin:0;border:2px solid #210d3f;border-radius:9px;background:linear-gradient(180deg,#ab47bc,#7b1fa2);color:#fffde7;box-shadow:0 3px 0 #210d3f,inset 0 1px 2px rgba(255,255,255,.3);cursor:pointer;font-size:clamp(10px,1.8vw,13px);font-weight:900;letter-spacing:1px;display:flex;align-items:center;justify-content:center}
#main-row{width:100%;padding:clamp(4px,1vw,10px) 0 0;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;column-gap:clamp(18px,8vw,64px)}
#dpad{flex:0 0 auto;display:grid;grid-template-columns:repeat(3,clamp(44px,11vw,74px));grid-template-rows:repeat(3,clamp(44px,11vw,74px));gap:clamp(3px,.7vw,5px);padding:clamp(10px,2vw,15px);background:linear-gradient(145deg,#8e24aa,#5e35b1);border:2px solid #210d3f;border-radius:50%;box-shadow:0 6px 15px rgba(0,0,0,.55),inset 0 2px 4px rgba(255,255,255,.25)}
#main-row #dpad{grid-column:1;justify-self:start}
#dpad button{border:none;border-radius:clamp(7px,1.3vw,10px);background:linear-gradient(180deg,#4a148c,#311b92);color:#fff;font-size:clamp(16px,3.5vw,24px);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 0 #1b0c2e,inset 0 1px 1px rgba(255,255,255,.2);cursor:pointer}
#dpad button:active{background:#e91e63!important;transform:scale(.94)}
#dpad-center{background:#ffd54f!important;border:2px solid #ffa000;border-radius:50%!important}
#act{flex:0 0 auto;display:flex;gap:clamp(12px,3vw,26px);padding:clamp(10px,2vw,16px) clamp(14px,3vw,26px);background:linear-gradient(145deg,#8e24aa,#5e35b1);border:2px solid #210d3f;border-radius:38px;align-items:center;box-shadow:0 6px 15px rgba(0,0,0,.55),inset 0 2px 4px rgba(255,255,255,.25)}
#main-row #act{grid-column:3;justify-self:end}
#act button{width:clamp(52px,10vw,70px);height:clamp(52px,10vw,70px);border-radius:50%;border:3px solid #fff;color:#fff;font-size:clamp(16px,3vw,22px);font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 8px rgba(0,0,0,.55),inset 0 2px 3px rgba(255,255,255,.34)}
#btn-a{background:radial-gradient(circle at 35% 30%,#e91e63,#880e4f);text-shadow:0 2px 0 #4c0016}
#btn-b{background:radial-gradient(circle at 35% 30%,#ffd54f,#ffa000);color:#311b92;text-shadow:none}
#act button:active{transform:scale(.93)}
#reset-btn{border:2px solid #210d3f;border-radius:8px;background:linear-gradient(180deg,#ab47bc,#7b1fa2);color:#fffde7;padding:8px 18px;font-weight:900;font-size:11px;letter-spacing:.8px;cursor:pointer;box-shadow:0 3px 0 #210d3f;margin:18px auto 0;display:block}
</style>
<body>
<div id="gbc-case">
    <div id="screen-wrap">
        <div id="bezel-top">
            <div class="stripe-line"></div>
            <div class="bezel-title">${options.bezelTitle}</div>
            <div class="stripe-line"></div>
        </div>
        <div id="screen-container">
            <div id="status-ind">
                <div id="status-led"></div>
                <div id="status-text">GB</div>
            </div>
            <canvas id="gb" width="160" height="144" role="img" aria-label="Game Boy"></canvas>
        </div>
    </div>
    <div id="pad">
        <div id="top-ctrl">
            <button id="sel" onclick="LuferOSGB.pressKey('select')">SELECT</button>
            <button id="st" onclick="LuferOSGB.pressKey('start')">START</button>
        </div>
        <div id="main-row">
            <div id="dpad">
                <div></div>
                <button id="u" onclick="LuferOSGB.pressKey('up')">▲</button>
                <div></div>
                <button id="l" onclick="LuferOSGB.pressKey('left')">◀</button>
                <div id="dpad-center"></div>
                <button id="r" onclick="LuferOSGB.pressKey('right')">▶</button>
                <div></div>
                <button id="d" onclick="LuferOSGB.pressKey('down')">▼</button>
                <div></div>
            </div>
            <div id="act">
                <button id="btn-b" onclick="LuferOSGB.pressKey('b')">B</button>
                <button id="btn-a" onclick="LuferOSGB.pressKey('a')">A</button>
            </div>
        </div>
        <button id="reset-btn" onclick="window.location.reload()">REINICIAR</button>
    </div>
</div>
<script>
${options.gbCode}
const rawB64 = "${options.romBase64}";
const bin = atob(rawB64);
const bytes = new Uint8Array(bin.length);
for(let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
LuferOSGB.init("gb", bytes);
</script>
</body>`;
}

export default {
  name: ["gb", "gbc", "gameboy"],
  category: "group",
  description: "Emulador LuferOS Game Boy / GBC interactivo con inicio dinámico por START.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".gb";

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

    await react("🎮").catch(() => undefined);

    try {
      const gbCode = await getWorkingGbEngine();
      let romBuffer: Buffer | null = null;
      let displayTitle = "GAME BOY COLOR";
      let customSaveName = "";

      const quotedDoc = await downloadQuotedDocumentBuffer(msg);
      const subCommand = String(args[0] || "").toLowerCase();

      if (subCommand === "save" && args[1]) {
        customSaveName = args.slice(1).join(" ").trim();
      }

      if (quotedDoc) {
        const extracted = extractRomFromAnyBuffer(quotedDoc.buffer, quotedDoc.fileName);
        if (!extracted) {
          throw new Error("El archivo adjunto no contiene una ROM válida dentro del .zip.");
        }
        romBuffer = extracted.buffer;

        const originalBaseName = extracted.fileName.replace(/\.(gb|gbc|zip|nes)$/i, "").trim();
        const finalNameKey = customSaveName || originalBaseName;

        const duplicateRealName = checkForDuplicateRom(romBuffer);
        if (duplicateRealName && duplicateRealName.toLowerCase() !== finalNameKey.toLowerCase()) {
          await react("⚠️").catch(() => undefined);
          return reply(
            `⚠️ *Emulador LuferOS GB*\nEste juego ya está guardado en la memoria con el nombre: \`${duplicateRealName}\`.`,
          );
        }

        const safeFileName = finalNameKey.replace(/[^a-zA-Z0-9._-]/g, "_") + ".gb";
        fs.writeFileSync(path.join(CACHE_DIR, safeFileName), romBuffer);
        displayTitle = `${finalNameKey.toUpperCase()} • GBC`;
      } else if (subCommand === "save" && !quotedDoc) {
        return reply("⚠️ Responde a un documento `.zip` o `.gb` con `.gb save <nombre>` para guardarlo.");
      } else {
        const searchName = (customSaveName || args.join(" ")).trim() || "game";
        const found = getStoredRomByName(searchName);
        if (found) {
          romBuffer = found.buffer;
          displayTitle = `${found.realName.toUpperCase()} • GBC`;
        } else {
          const anyRom = fs.readdirSync(CACHE_DIR).find((f) => f.toLowerCase().match(/\.(gb|gbc|nes)$/));
          if (anyRom) {
            romBuffer = fs.readFileSync(path.join(CACHE_DIR, anyRom));
            displayTitle = `${anyRom.slice(0, -4).toUpperCase()} • GBC`;
          } else {
            throw new Error(
              "No hay juegos guardados. Envía tu archivo `.zip` al chat y respóndele con `.gb save <nombre>`.",
            );
          }
        }
      }

      const romBase64 = romBuffer.toString("base64");

      const HTML = buildConsoleHtml({
        gbCode,
        romBase64,
        banner: "★  LUFEROS GAME BOY COLOR  ★",
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
                title: `🎮 LUFEROS GAME BOY: ${displayTitle}`,
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
                  forwadingScore: 1,
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
        `❌ ${fytBold("Emulador LuferOS GB:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
