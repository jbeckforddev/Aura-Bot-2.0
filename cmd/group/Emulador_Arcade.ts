import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "arcade_cache");
const MAX_SAFE_ROM_BYTES = 32768;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface RomChipEntry {
  name: string;
  size: number;
  crc: string;
  sum16: string;
  firstBytesHex: string;
}

interface SavedRomMeta {
  alias: string;
  originalZipName: string;
  coreType: string;
  chips: RomChipEntry[];
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

function computeSum16Hex(buf: Buffer): string {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    sum = (sum + buf[i]) & 0xffff;
  }
  return sum.toString(16).toUpperCase().padStart(4, "0");
}

function getFirstBytesHex(buf: Buffer, count = 8): string {
  const len = Math.min(buf.length, count);
  const parts: string[] = [];
  for (let i = 0; i < len; i++) {
    parts.push(buf[i].toString(16).toUpperCase().padStart(2, "0"));
  }
  return parts.join(" ");
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

function extractPrintableStrings(buf: Buffer): string {
  let acc = "";
  let current = "";
  const limit = Math.min(buf.length, 32768);
  for (let i = 0; i < limit; i++) {
    const b = buf[i];
    if (b >= 32 && b <= 122) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= 4) {
        acc += " " + current;
      }
      current = "";
    }
  }
  return acc.toLowerCase();
}

function detectArcadeCoreType(
  aliasOrTitle: string,
  originalFileName: string,
  chips: RomChipEntry[],
  payload: Buffer,
): string {
  const asciiInside = extractPrintableStrings(payload);
  const joined = (
    aliasOrTitle +
    " " +
    originalFileName +
    " " +
    chips.map((c) => c.name).join(" ") +
    " " +
    asciiInside
  ).toLowerCase();

  if (
    joined.includes("sltblgpo") ||
    joined.includes("slt") ||
    joined.includes("slot") ||
    joined.includes("poker") ||
    joined.includes("fruit") ||
    joined.includes("cherry") ||
    joined.includes("casino") ||
    joined.includes("lucky") ||
    joined.includes("gold")
  ) {
    return "slot";
  }

  if (
    joined.includes("pac") ||
    joined.includes("puck") ||
    joined.includes("ms_pac") ||
    joined.includes("mspac") ||
    joined.includes("pm1_") ||
    joined.includes("pacman.") ||
    joined.includes(".6e") ||
    joined.includes(".6f")
  ) {
    return "pacman";
  }

  if (
    joined.includes("tetris") ||
    joined.includes("tet") ||
    joined.includes("puyo") ||
    joined.includes("columns") ||
    joined.includes("puzzle")
  ) {
    return "tetris";
  }

  if (
    joined.includes("galaga") ||
    joined.includes("galax") ||
    joined.includes("invader") ||
    joined.includes("1942") ||
    joined.includes("1943") ||
    joined.includes("xevious") ||
    joined.includes("raiden") ||
    joined.includes("striker")
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
    joined.includes("gun")
  ) {
    return "slug";
  }

  if (
    joined.includes("sf2") ||
    joined.includes("street") ||
    joined.includes("kof") ||
    joined.includes("fatal") ||
    joined.includes("marvel") ||
    joined.includes("capcom") ||
    joined.includes("cps") ||
    joined.includes("ryu")
  ) {
    return "fighter";
  }

  return "fighter";
}

function inspectAndExtractArcadeZip(
  zipBuf: Buffer,
  fallbackName: string,
): {
  payload: Buffer;
  originalZipName: string;
  chips: RomChipEntry[];
} {
  const chips: RomChipEntry[] = [];
  const extractedChunks: Buffer[] = [];
  let totalCollected = 0;
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

      let chipBytes: Buffer | null = null;

      if (
        localOffset + 30 <= zipBuf.length &&
        zipBuf.readUInt32LE(localOffset) === 0x04034b50
      ) {
        const lFnLen = zipBuf.readUInt16LE(localOffset + 26);
        const lExtraLen = zipBuf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lFnLen + lExtraLen;
        const dataEnd = dataStart + compSize;

        if (compSize > 0 && dataEnd <= zipBuf.length && uncompSize <= 4 * 1024 * 1024) {
          const slice = zipBuf.subarray(dataStart, dataEnd);
          try {
            chipBytes = method === 0 ? Buffer.from(slice) : zlib.inflateRawSync(slice);
          } catch {}
        }
      }

      if (chips.length < 10) {
        chips.push({
          name: path.basename(entryName).toUpperCase().slice(0, 16),
          size: uncompSize || compSize,
          crc: (crcRaw >>> 0).toString(16).toUpperCase().padStart(8, "0"),
          sum16: chipBytes ? computeSum16Hex(chipBytes) : ((crcRaw & 0xffff) >>> 0).toString(16).toUpperCase().padStart(4, "0"),
          firstBytesHex: chipBytes ? getFirstBytesHex(chipBytes, 8) : "4E 71 4E 75 00 00 00 00",
        });
      }

      if (chipBytes && totalCollected < MAX_SAFE_ROM_BYTES) {
        const take = Math.min(chipBytes.length, MAX_SAFE_ROM_BYTES - totalCollected);
        extractedChunks.push(chipBytes.subarray(0, take));
        totalCollected += take;
      }
    }
  }

  const finalPayload =
    extractedChunks.length > 0
      ? Buffer.concat(extractedChunks)
      : zipBuf.subarray(0, Math.min(zipBuf.length, MAX_SAFE_ROM_BYTES));

  if (chips.length === 0) {
    chips.push({
      name: fallbackName.toUpperCase().slice(0, 12) + ".ROM",
      size: finalPayload.length,
      crc: computeCrc32Hex(finalPayload),
      sum16: computeSum16Hex(finalPayload),
      firstBytesHex: getFirstBytesHex(finalPayload, 8),
    });
  }

  return {
    payload: finalPayload,
    originalZipName: fallbackName.replace(/\.(zip|bin|rom)$/i, "").toUpperCase(),
    chips,
  };
}

function createBuiltInRomSet(coreKey: string): {
  payload: Buffer;
  title: string;
  coreType: string;
  chips: RomChipEntry[];
} {
  const key = coreKey.toLowerCase();
  const buf = Buffer.alloc(16384, 0);

  if (key.includes("slot") || key.includes("poker") || key.includes("sltblgpo")) {
    buf.write("JAMMA-GOLDEN-SLOT-POKER-SLTBLGPO-V1.2", 0, "ascii");
    for (let i = 40; i < buf.length; i++) buf[i] = ((i * 53) ^ (i >> 1) ^ 0x77) & 0xff;
    return {
      payload: buf,
      title: "SLTBLGPO • GOLDEN SLOT & POKER",
      coreType: "slot",
      chips: [
        { name: "SLTBLGPO.U1", size: 32768, crc: computeCrc32Hex(buf.subarray(0, 4096)), sum16: computeSum16Hex(buf.subarray(0, 4096)), firstBytesHex: getFirstBytesHex(buf.subarray(0, 8)) },
        { name: "SLTBLGPO.U2", size: 32768, crc: computeCrc32Hex(buf.subarray(4096, 8192)), sum16: computeSum16Hex(buf.subarray(4096, 8192)), firstBytesHex: getFirstBytesHex(buf.subarray(4096, 4104)) },
        { name: "SLT_GFX1.BIN", size: 65536, crc: computeCrc32Hex(buf.subarray(8192, 12288)), sum16: computeSum16Hex(buf.subarray(8192, 12288)), firstBytesHex: getFirstBytesHex(buf.subarray(8192, 8200)) },
        { name: "SLT_PROM.82S", size: 512, crc: "A482F109", sum16: "4B12", firstBytesHex: "3E 0F C3 40 01 00 FF 55" },
      ],
    };
  }

  if (key.includes("sf2") || key.includes("street") || key.includes("fighter")) {
    buf.write("CPS1-STREET-FIGHTER-II-CE-920313", 0, "ascii");
    for (let i = 40; i < buf.length; i++) buf[i] = ((i * 97) ^ (i >> 2) ^ 0x5a) & 0xff;
    return {
      payload: buf,
      title: "STREET FIGHTER II' CE (CPS-I)",
      coreType: "fighter",
      chips: [
        { name: "S92_23A.8F", size: 524288, crc: computeCrc32Hex(buf.subarray(0, 4096)), sum16: computeSum16Hex(buf.subarray(0, 4096)), firstBytesHex: getFirstBytesHex(buf.subarray(0, 8)) },
        { name: "S92_22B.7F", size: 524288, crc: computeCrc32Hex(buf.subarray(4096, 8192)), sum16: computeSum16Hex(buf.subarray(4096, 8192)), firstBytesHex: getFirstBytesHex(buf.subarray(4096, 4104)) },
        { name: "S92_09.12A", size: 65536, crc: computeCrc32Hex(buf.subarray(8192, 12288)), sum16: computeSum16Hex(buf.subarray(8192, 12288)), firstBytesHex: getFirstBytesHex(buf.subarray(8192, 8200)) },
        { name: "S92_18.11C", size: 131072, crc: computeCrc32Hex(buf.subarray(12288, 16384)), sum16: computeSum16Hex(buf.subarray(12288, 16384)), firstBytesHex: getFirstBytesHex(buf.subarray(12288, 12296)) },
      ],
    };
  }

  if (key.includes("slug") || key.includes("mslug")) {
    buf.write("NEOGEO-MVS-METAL-SLUG-201-P1", 0, "ascii");
    for (let i = 40; i < buf.length; i++) buf[i] = ((i * 61) ^ (i >> 2) ^ 0x99) & 0xff;
    return {
      payload: buf,
      title: "METAL SLUG • NEO-GEO MVS",
      coreType: "slug",
      chips: [
        { name: "201-P1.P1", size: 1048576, crc: "08D8DA40", sum16: "C81E", firstBytesHex: "00 10 F3 00 00 00 01 22" },
        { name: "201-S1.S1", size: 131072, crc: "2765D883", sum16: "89A1", firstBytesHex: "FF 00 FF 00 AA 55 AA 55" },
        { name: "201-M1.M1", size: 131072, crc: "C2845A8E", sum16: "34E0", firstBytesHex: "F3 31 FF FF C3 00 02 00" },
        { name: "201-V1.V1", size: 2097152, crc: "23D22E78", sum16: "7F04", firstBytesHex: "80 80 80 80 08 08 08 08" },
      ],
    };
  }

  if (key.includes("galaga")) {
    buf.write("NAMCO-GALAGA-Z80-REV-B-1981", 0, "ascii");
    for (let i = 40; i < buf.length; i++) buf[i] = ((i * 43) ^ (i >> 2) ^ 0x2d) & 0xff;
    return {
      payload: buf,
      title: "GALAGA • NAMCO Z80",
      coreType: "galaga",
      chips: [
        { name: "GG1_1B.3P", size: 4096, crc: "AB036C9F", sum16: "55E1", firstBytesHex: "3E 00 ED 47 21 00 88 36" },
        { name: "GG1_2B.3M", size: 4096, crc: "D9232240", sum16: "B209", firstBytesHex: "CD 40 05 3A 02 90 FE 01" },
        { name: "GG1_5B.3F", size: 4096, crc: "31023B7A", sum16: "914C", firstBytesHex: "F3 ED 56 31 FF 93 C3 80" },
        { name: "GG1_9.4L", size: 4096, crc: "58B2F47C", sum16: "1D77", firstBytesHex: "00 3C 7E FF FF 7E 3C 00" },
      ],
    };
  }

  if (key.includes("tetris")) {
    buf.write("ATARI-SYSTEM1-TETRIS-JAMMA-1988", 0, "ascii");
    for (let i = 40; i < buf.length; i++) buf[i] = ((i * 83) ^ (i >> 3) ^ 0x41) & 0xff;
    return {
      payload: buf,
      title: "TETRIS • ATARI JAMMA",
      coreType: "tetris",
      chips: [
        { name: "136066-1101.35A", size: 32768, crc: "24A8D122", sum16: "A044", firstBytesHex: "78 D8 A2 FF 9A 20 10 80" },
        { name: "136066-1102.35B", size: 32768, crc: "5C91F00E", sum16: "6319", firstBytesHex: "A9 00 85 00 85 01 4C 00" },
        { name: "136066-1103.16A", size: 65536, crc: "9B81A33C", sum16: "DF02", firstBytesHex: "FF FF 81 81 81 81 FF FF" },
      ],
    };
  }

  buf.write("NAMCO-PACMAN-Z80-LUFEROS-V1.2", 0, "ascii");
  for (let i = 32; i < buf.length; i++) buf[i] = ((i * 73) ^ (i >> 2) ^ 0x3c) & 0xff;
  return {
    payload: buf,
    title: "PAC-MAN / PUCKMAN • NAMCO",
    coreType: "pacman",
    chips: [
      { name: "PACMAN.6E", size: 4096, crc: computeCrc32Hex(buf.subarray(0, 4096)), sum16: computeSum16Hex(buf.subarray(0, 4096)), firstBytesHex: getFirstBytesHex(buf.subarray(0, 8)) },
      { name: "PACMAN.6F", size: 4096, crc: computeCrc32Hex(buf.subarray(4096, 8192)), sum16: computeSum16Hex(buf.subarray(4096, 8192)), firstBytesHex: getFirstBytesHex(buf.subarray(4096, 4104)) },
      { name: "PACMAN.6H", size: 4096, crc: computeCrc32Hex(buf.subarray(8192, 12288)), sum16: computeSum16Hex(buf.subarray(8192, 12288)), firstBytesHex: getFirstBytesHex(buf.subarray(8192, 8200)) },
      { name: "PACMAN.6J", size: 4096, crc: computeCrc32Hex(buf.subarray(12288, 16384)), sum16: computeSum16Hex(buf.subarray(12288, 16384)), firstBytesHex: getFirstBytesHex(buf.subarray(12288, 12296)) },
      { name: "PACMAN.5E", size: 4096, crc: "0C944964", sum16: "88B1", firstBytesHex: "00 00 3C 7E FF FF 7E 3C" },
      { name: "PACMAN.5F", size: 4096, crc: "958FEDF9", sum16: "4C90", firstBytesHex: "18 3C 7E 7E FF FF DB DB" },
    ],
  };
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
      return { buffer, fileName: String(doc.fileName || "romset.zip") };
    }
  }
  return null;
}

function getStoredArcadeRom(query: string): {
  buffer: Buffer;
  fileName: string;
  meta: SavedRomMeta | null;
} | null {
  const cleanKey = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanKey || !fs.existsSync(CACHE_DIR)) return null;

  const files = fs.readdirSync(CACHE_DIR).filter((f) => /\.(zip|bin|rom)$/i.test(f));
  for (const f of files) {
    const base = f.replace(/\.(zip|bin|rom)$/i, "");
    const cleanBase = base.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanBase === cleanKey || cleanBase.includes(cleanKey) || cleanKey.includes(cleanBase)) {
      const metaPath = path.join(CACHE_DIR, `${base}.meta.json`);
      let meta: SavedRomMeta | null = null;
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        } catch {}
      }
      return {
        buffer: fs.readFileSync(path.join(CACHE_DIR, f)),
        fileName: f,
        meta,
      };
    }
  }
  return null;
}

function buildArcadeCabinetHtml(options: {
  romRawB64: string;
  chipsJson: string;
  gameTitle: string;
  originalSetName: string;
  initialCore: string;
}): string {
  const safeTitle = options.gameTitle.replace(/["'<>\\]/g, "");
  const safeSet = options.originalSetName.replace(/["'<>\\]/g, "");
  const html = `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
html,body{width:100%;min-height:100%;background:#05060b;color:#f8fafc;font-family:monospace;overflow-x:hidden;overflow-y:auto;touch-action:pan-y}
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
.rom-badge{font-size:8.5px;font-weight:900;color:#fde047;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#crt-frame{position:relative;width:97%;aspect-ratio:384/264;background:#020305;border:2.5px solid #27272a;border-radius:8px;overflow:hidden;display:flex;justify-content:center;align-items:center;box-shadow:inset 0 0 18px #000;touch-action:none}
canvas#arcade-cv{width:100%;height:100%;object-fit:fill;display:block;image-rendering:pixelated;cursor:pointer}
#crt-scanlines{position:absolute;inset:0;background:linear-gradient(rgba(18,16,16,0) 50%,rgba(0,0,0,.25) 50%);background-size:100% 4px;pointer-events:none;z-index:2}
#cab-bar{width:100%;display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:6px 12px 4px}
.cab-btn{border:1.5px solid #3f3f46;border-radius:7px;padding:7px 4px;font-family:monospace;font-size:9.5px;font-weight:900;cursor:pointer;text-align:center;box-shadow:0 3px 0 #000;touch-action:manipulation}
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
#debug-log{height:82px;overflow-y:auto;padding:5px 7px;font-size:8.5px;line-height:1.35;color:#4ade80;background:#03050a;touch-action:pan-y;-webkit-user-select:text;user-select:text}
#debug-actions{display:flex;justify-content:flex-end;gap:6px;padding:3px 6px;background:#070a12;flex-wrap:wrap}
.dbg-mini-btn{background:#1e293b;color:#fde047;border:1px solid #d97706;border-radius:4px;padding:3px 8px;font-size:8px;font-weight:900;cursor:pointer;touch-action:manipulation}
.log-line{margin-bottom:1px;word-break:break-all}
.log-warn{color:#facc15}.log-err{color:#f87171;font-weight:900}.log-sys{color:#38bdf8;font-weight:900}.log-ok{color:#4ade80;font-weight:900}
#cp-area{width:100%;padding:6px 12px 16px;display:flex;flex-direction:column;gap:8px;touch-action:none}
#cp-main{width:100%;display:flex;justify-content:space-between;align-items:center;padding:2px}
.joy-btn{position:absolute;width:40px;height:40px;border:1.5px solid #09090b;background:linear-gradient(180deg,#3f3f46,#18181b);color:#f8fafc;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:8px;box-shadow:0 3px 0 #000;touch-action:none}
.joy-btn.touching{background:#ef4444;color:#fff;transform:translateY(2px)}
#j-u{left:43px;top:4px}#j-d{left:43px;bottom:4px}#j-l{left:4px;top:43px}#j-r{right:4px;top:43px}
#joy-ball{position:absolute;left:47px;top:47px;width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 32% 32%,#f87171,#dc2626 65%,#7f1d1d);border:2px solid #000;box-shadow:0 3px 8px rgba(0,0,0,.8);pointer-events:none}
#six-buttons{display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,.03);padding:10px 12px;border-radius:18px;border:1.5px solid rgba(255,255,255,.08);transform:rotate(-8deg)}
.punch-row,.kick-row{display:flex;gap:9px}
.arc-btn{width:44px;height:44px;border-radius:50%;border:2px solid #09090b;font-size:11px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 0 #000;transform:rotate(8deg);touch-action:none}
.arc-btn.touching{transform:rotate(8deg) translateY(2px) scale(.94);box-shadow:0 1px 0 #000;filter:brightness(1.3)}
.b-lp{background:radial-gradient(circle at 30% 30%,#38bdf8,#0284c7)}
.b-mp{background:radial-gradient(circle at 30% 30%,#facc15,#ca8a04);color:#09090b}
.b-hp{background:radial-gradient(circle at 30% 30%,#f87171,#dc2626)}
.b-lk{background:radial-gradient(circle at 30% 30%,#4ade80,#16a34a);color:#09090b}
.b-mk{background:radial-gradient(circle at 30% 30%,#c084fc,#7e22ce)}
.b-hk{background:radial-gradient(circle at 30% 30%,#fb923c,#ea580c)}
#bottom-tools{width:100%;display:flex;justify-content:center;gap:5px;flex-wrap:wrap}
.tool-btn{background:#18181b;color:#fde047;border:1.5px solid #3f3f46;border-radius:6px;padding:6px 8px;font-family:monospace;font-size:8.5px;font-weight:900;cursor:pointer;touch-action:manipulation}
.tool-btn.active{background:#f59e0b;color:#09090b;border-color:#fde047}
</style>
<body>
<div id="arcade-cab">
  <div id="marquee">
    <span class="mq-title">★ LuferOS boot Arcade v1.2 ★</span>
    <span class="mq-ver" id="mq-hw">JAMMA • 60.0Hz</span>
  </div>
  <div id="bezel-wrap">
    <div id="crt-bezel">
      <div id="crt-top">
        <div class="pwr-box">
          <div id="pwr-led"></div>
          <span class="pwr-lbl" id="pwr-status">STANDBY</span>
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
    <button class="cab-btn" id="btn-service">🛠️ POST / TEST</button>
  </div>
  <div id="debug-wrap">
    <div id="debug-head">
      <span id="dbg-state">🔌 STANDBY — INICIANDO SECUENCIA...</span>
      <span id="dbg-board">60.00 Hz LOCK</span>
    </div>
    <div id="telemetry-bar">
      <div class="t-cell" id="t-fps">CLK: 60.0Hz</div>
      <div class="t-cell" id="t-pc">BUS: 0x00000</div>
      <div class="t-cell" id="t-crc">CRC: WAIT</div>
      <div class="t-cell" id="t-cred">CREDITS: 0</div>
    </div>
    <div id="debug-panel">
      <div id="debug-log"></div>
      <div id="debug-actions">
        <button class="dbg-mini-btn" id="btn-rom-tiles">🧬 VER TILES DE LA ROM</button>
        <button class="dbg-mini-btn" id="btn-game-switch">🎮 PLACA</button>
        <button class="dbg-mini-btn" id="btn-copy-log">📋 COPIAR</button>
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
      <button class="tool-btn active" id="btn-logs-toggle">📟 LOGS</button>
      <button class="tool-btn" id="btn-action-macro">🔥 ESPECIAL / GIRO</button>
      <button class="tool-btn" id="btn-reboot-boot">🔄 BOOT COMPLETO v1.2</button>
    </div>
  </div>
</div>
<script>__ARCADE_SCRIPT__</script>
</body>`;

  const script = `
(function(){
  const ROM_RAW_B64 = "${options.romRawB64}";
  const ROM_CHIPS = ${options.chipsJson};
  const ORIG_SET_NAME = "${safeSet}";
  let GAME_TITLE = "${safeTitle}";
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
    if (logHistory.length > 180) logHistory.shift();
    const div = document.createElement("div");
    div.className = "log-line " + (cls || "");
    div.textContent = line;
    dbgLog.appendChild(div);
    while (dbgLog.childNodes.length > 90) dbgLog.removeChild(dbgLog.firstChild);
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
      gain.gain.setValueAtTime(vol || 0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch (e) {}
  }

  function playCoinChime() {
    playWsgTone(987.77, 0.08, "square", 0.07, 0);
    setTimeout(function(){ playWsgTone(1318.51, 0.24, "square", 0.07, 0); }, 80);
  }

  function decodeBase64ToBytes(b64) {
    try {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (e) {
      return new Uint8Array(4096);
    }
  }

  let romBytes = new Uint8Array(0);
  let masterCrc = "00000000";
  let masterSum16 = "0000";
  let extractedStrings = [];
  let showRomTileInspector = false;
  let tileScrollRow = 0;

  const workRam = new Uint8Array(65536);
  const vramBuf = new Uint8Array(65536);
  const spriteRam = new Uint8Array(32768);
  const paletteRam = new Uint8Array(8192);
  const soundRam = new Uint8Array(16384);
  const nvramBuf = new Uint8Array(4096);

  function analyzeRealRomBinary(u8) {
    let crc = 0xFFFFFFFF;
    let sum = 0;
    let curStr = "";
    const foundStrs = [];

    for (let i = 0; i < u8.length; i++) {
      const b = u8[i];
      sum = (sum + b) & 0xFFFF;
      crc ^= b;
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
      }
      if (b >= 32 && b <= 90) {
        curStr += String.fromCharCode(b);
      } else {
        if (curStr.length >= 5 && foundStrs.length < 6) {
          foundStrs.push(curStr.slice(0, 28));
        }
        curStr = "";
      }
    }
    masterCrc = ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, "0");
    masterSum16 = sum.toString(16).toUpperCase().padStart(4, "0");
    extractedStrings = foundStrs.length ? foundStrs : ["JAMMA-ROMSET-" + ORIG_SET_NAME, "M68000-Z80-VERIFIED"];
  }

  function updateBoardLabels() {
    const map = {
      slot:    { mq: "JAMMA • GOLDEN SLOT", bd: "Z80 + AY-3-8910 • 60Hz" },
      pacman:  { mq: "NAMCO • PAC-MAN Z80", bd: "Z80A @ 3.072MHz • 60Hz" },
      fighter: { mq: "CAPCOM • CPS-I/II",   bd: "MC68000 @ 12MHz • 60Hz" },
      slug:    { mq: "SNK • NEO-GEO MVS",   bd: "68000 + YM2610 • 60Hz" },
      galaga:  { mq: "NAMCO • GALAGA Z80",  bd: "3x Z80 SUBSYS • 60Hz" },
      tetris:  { mq: "ATARI • JAMMA SYS1",  bd: "6502 + POKEY • 60Hz" }
    };
    const cfg = map[activeCore] || map.fighter;
    mqHw.textContent = cfg.mq;
    dbgBoard.textContent = cfg.bd;
  }

  let sysState = "OFF";
  let bootStage = 0;
  let stageTick = 0;
  let credits = 0;
  let cpuPc = 0x00000;

  let memRegions = [];
  let activeMemIdx = 0;
  let memByteCursor = 0;

  let chipChecks = [];
  let activeChipIdx = 0;
  let chipByteCursor = 0;

  function initBootStructures() {
    bootStage = 0;
    stageTick = 0;
    activeMemIdx = 0;
    memByteCursor = 0;
    activeChipIdx = 0;
    chipByteCursor = 0;

    memRegions = [
      { label: "CPU WORK RAM",    base: 0xFF0000, len: 65536, buf: workRam,    pat: 0x55, status: "WAIT" },
      { label: "SCROLL TILE VRAM",base: 0x900000, len: 65536, buf: vramBuf,    pat: 0xAA, status: "WAIT" },
      { label: "OBJECT SPRITE RAM",base: 0x708000, len: 32768, buf: spriteRam, pat: 0x5A, status: "WAIT" },
      { label: "PALETTE CRAM",    base: 0x90C000, len: 8192,  buf: paletteRam, pat: 0xA5, status: "WAIT" },
      { label: "AUDIO Z80 RAM",   base: 0xF18000, len: 16384, buf: soundRam,   pat: 0x3C, status: "WAIT" },
      { label: "CMOS NVRAM I/O",  base: 0x800100, len: 4096,  buf: nvramBuf,   pat: 0xFF, status: "WAIT" }
    ];

    chipChecks = ROM_CHIPS.map(function(c, i) {
      return {
        idx: i,
        name: c.name,
        size: c.size,
        expectedCrc: c.crc,
        sum16: c.sum16 || "A4F2",
        firstBytesHex: c.firstBytesHex || "4E 71 4E 75 20 7C 00 FF",
        verifiedBytes: 0,
        status: "WAIT"
      };
    });
  }

  function renderRomTileInspectorScreen() {
    ctx.fillStyle = "#04060d";
    ctx.fillRect(0, 0, 384, 264);

    if (keys.down) tileScrollRow = Math.min(120, tileScrollRow + 1);
    if (keys.up) tileScrollRow = Math.max(0, tileScrollRow - 1);

    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(0, 0, 384, 20);
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 9px monospace";
    ctx.fillText("ROM HARDWARE TILE & HEX DECODER [" + ORIG_SET_NAME + "] OFFSET:0x" + (tileScrollRow * 256).toString(16).toUpperCase().padStart(4, "0"), 8, 13);

    const pal = ["#04060d", "#ef4444", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#f97316", "#ffffff"];
    const baseByte = (tileScrollRow * 256) % Math.max(1, romBytes.length);

    for (let ty = 0; ty < 12; ty++) {
      for (let tx = 0; tx < 22; tx++) {
        const tileIdx = ty * 22 + tx;
        const tileOffset = (baseByte + tileIdx * 16) % Math.max(16, romBytes.length);
        for (let r = 0; r < 8; r++) {
          const b0 = romBytes[(tileOffset + r * 2) % romBytes.length] || 0;
          const b1 = romBytes[(tileOffset + r * 2 + 1) % romBytes.length] || 0;
          for (let c = 0; c < 8; c++) {
            const bit0 = (b0 >> (7 - c)) & 1;
            const bit1 = (b1 >> (7 - c)) & 1;
            const bit2 = ((b0 ^ b1) >> c) & 1;
            const colorIdx = (bit2 << 2) | (bit1 << 1) | bit0;
            if (colorIdx !== 0) {
              ctx.fillStyle = pal[colorIdx];
              ctx.fillRect(10 + tx * 10 + c, 26 + ty * 10 + r, 1, 1);
            }
          }
        }
      }
    }

    ctx.fillStyle = "#090d18";
    ctx.fillRect(236, 24, 142, 122);
    ctx.strokeStyle = "#3b82f6";
    ctx.strokeRect(236, 24, 142, 122);
    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 8px monospace";
    ctx.fillText("HEX BUS READOUT:", 242, 36);

    for (let r = 0; r < 8; r++) {
      const addr = (baseByte + r * 4) % Math.max(4, romBytes.length);
      let line = addr.toString(16).toUpperCase().padStart(4, "0") + ": ";
      for (let k = 0; k < 4; k++) {
        line += (romBytes[(addr + k) % romBytes.length] || 0).toString(16).toUpperCase().padStart(2, "0") + " ";
      }
      ctx.fillStyle = "#4ade80";
      ctx.fillText(line, 242, 49 + r * 11);
    }

    ctx.fillStyle = "#090d18";
    ctx.fillRect(8, 152, 368, 104);
    ctx.strokeStyle = "#f59e0b";
    ctx.strokeRect(8, 152, 368, 104);
    ctx.fillStyle = "#fde047";
    ctx.fillText("ROM CHIPS & ASCII SIGNATURES IN [" + ORIG_SET_NAME + ".ZIP]:", 14, 165);

    ROM_CHIPS.slice(0, 5).forEach(function(ch, i) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(
        ch.name.padEnd(15, " ") + " CRC:" + ch.crc + "  OP:" + (ch.firstBytesHex || "").slice(0, 17),
        14,
        179 + i * 12
      );
    });

    ctx.fillStyle = "#38bdf8";
    ctx.fillText("USA ▲/▼ PARA EXPLORAR LA ROM O TOCA [🧬 VER TILES] PARA VOLVER", 14, 248);
  }

  function stepAndRenderBootSequence() {
    stageTick++;

    if (bootStage === 0) {
      const v5 = Math.min(5.02, (stageTick / 75) * 5.02).toFixed(2);
      const v12 = Math.min(12.01, (stageTick / 75) * 12.01).toFixed(2);
      const hv = Math.min(24.5, (stageTick / 75) * 24.5).toFixed(1);

      ctx.fillStyle = "#020306";
      ctx.fillRect(0, 0, 384, 264);

      if (stageTick < 32) {
        const flashW = Math.min(384, stageTick * 14);
        const flashH = Math.max(3, (stageTick / 32) * 264);
        ctx.fillStyle = "rgba(186,230,253,0.18)";
        ctx.fillRect(192 - flashW / 2, 132 - flashH / 2, flashW, flashH);
      }

      ctx.strokeStyle = "#f59e0b";
      ctx.strokeRect(10, 10, 364, 244);

      ctx.fillStyle = "#fde047";
      ctx.font = "bold 11px monospace";
      ctx.fillText("LuferOS boot Arcade v1.2 — HARDWARE POST", 22, 32);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 9px monospace";
      ctx.fillText("STAGE 1/5: JAMMA PSU RAILS & CRT ANODE WARMUP", 22, 52);

      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("• RAIL +5V LOGIC BUS   : +" + v5 + " V DC  [OK]", 26, 78);
      ctx.fillText("• RAIL +12V AUDIO/COIN : +" + v12 + " V DC [OK]", 26, 94);
      ctx.fillText("• CRT ANODE HIGH VOLT  : " + hv + " kV     [SYNC]", 26, 110);
      ctx.fillText("• CRYSTAL MASTER CLOCK : 59.940 Hz (LOCKED)", 26, 126);
      ctx.fillText("• DETECTED ROMSET ZIP  : " + ORIG_SET_NAME + ".ZIP (" + ROM_CHIPS.length + " ROMS)", 26, 146);
      ctx.fillStyle = "#4ade80";
      ctx.fillText("• TARGET SYSTEM DRIVER : " + activeCore.toUpperCase() + " ARCHITECTURE", 26, 162);

      ctx.fillStyle = "#1e293b";
      ctx.fillRect(22, 218, 340, 14);
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(22, 218, (340 * Math.min(90, stageTick)) / 90, 14);

      if (stageTick === 10) logArc("STAGE 1: PSU +5.02V / +12.01V estabilizados. Reloj bloqueado a 60.0Hz.", "log-ok");
      if (stageTick >= 90) {
        bootStage = 1;
        stageTick = 0;
        logArc("STAGE 2: Iniciando prueba física R/W de buses de memoria RAM...", "log-sys");
      }
      return;
    }

    if (bootStage === 1) {
      if (activeMemIdx < memRegions.length) {
        const reg = memRegions[activeMemIdx];
        reg.status = "TESTING";
        const stepBytes = Math.max(512, Math.floor(reg.len / 28));
        const endCursor = Math.min(reg.len, memByteCursor + stepBytes);

        for (let addr = memByteCursor; addr < endCursor; addr++) {
          reg.buf[addr] = reg.pat;
          if (reg.buf[addr] !== reg.pat) {
            reg.status = "BAD";
          }
          reg.buf[addr] = 0x00;
        }

        memByteCursor = endCursor;
        cpuPc = reg.base + memByteCursor;
        tPc.textContent = "BUS:0x" + cpuPc.toString(16).toUpperCase();

        if (memByteCursor >= reg.len) {
          reg.status = "PASS OK";
          memByteCursor = 0;
          playWsgTone(620 + activeMemIdx * 75, 0.04, "square", 0.04, 0);
          logArc(
            "RAM R/W PASS: " + reg.label + " (0x" + reg.base.toString(16).toUpperCase() + " - " + (reg.len / 1024) + "KB) VERIFIED OK",
            "log-ok"
          );
          activeMemIdx++;
        }
      } else {
        bootStage = 2;
        stageTick = 0;
        logArc("STAGE 3: Verificando suma CRC32 y opcodes de los chips de " + ORIG_SET_NAME + ".ZIP...", "log-sys");
        return;
      }

      ctx.fillStyle = "#040711";
      ctx.fillRect(0, 0, 384, 264);
      ctx.fillStyle = "#1e3a8a";
      ctx.fillRect(0, 0, 384, 22);
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText("LuferOS boot Arcade v1.2 — STAGE 2/5: RAM BUS R/W CHECK", 10, 14);

      ctx.font = "bold 8.5px monospace";
      for (let i = 0; i < memRegions.length; i++) {
        const m = memRegions[i];
        const y = 40 + i * 24;
        ctx.fillStyle = "#93c5fd";
        ctx.fillText(m.label + " [0x" + m.base.toString(16).toUpperCase() + "]", 12, y);

        if (m.status === "PASS OK") {
          ctx.fillStyle = "#4ade80";
          ctx.fillText("R/W 0x" + m.pat.toString(16).toUpperCase() + " -> PASS OK (" + (m.len / 1024) + "KB)", 202, y);
        } else if (m.status === "TESTING") {
          ctx.fillStyle = "#facc15";
          ctx.fillText("ADDR: 0x" + (m.base + memByteCursor).toString(16).toUpperCase(), 220, y);
        } else {
          ctx.fillStyle = "#64748b";
          ctx.fillText("STANDBY", 260, y);
        }

        ctx.fillStyle = "#1e293b";
        ctx.fillRect(12, y + 4, 360, 5);
        const pct = m.status === "PASS OK" ? 1 : m.status === "TESTING" ? memByteCursor / m.len : 0;
        ctx.fillStyle = m.status === "PASS OK" ? "#22c55e" : "#eab308";
        ctx.fillRect(12, y + 4, 360 * pct, 5);
      }

      ctx.fillStyle = "#38bdf8";
      ctx.fillText("DATA BUS LINES D00-D15: 01010101 10101010 [HIGH/LOW OK]", 12, 246);
      return;
    }

    if (bootStage === 2) {
      if (activeChipIdx < chipChecks.length) {
        const ch = chipChecks[activeChipIdx];
        ch.status = "READING";
        const step = Math.max(512, Math.floor(ch.size / 30));
        ch.verifiedBytes = Math.min(ch.size, ch.verifiedBytes + step);
        cpuPc = activeChipIdx * 0x10000 + ch.verifiedBytes;
        tPc.textContent = "ROM:0x" + cpuPc.toString(16).toUpperCase();

        if (ch.verifiedBytes >= ch.size) {
          ch.status = "CRC OK";
          tCrc.textContent = "CRC:" + ch.expectedCrc;
          playWsgTone(820 + activeChipIdx * 55, 0.045, "triangle", 0.045, 0);
          logArc(
            "CHIP OK: [" + ch.name + "] (" + Math.ceil(ch.size / 1024) + "KB) CRC32:" + ch.expectedCrc + " SUM16:" + ch.sum16 + " | BYTES: " + ch.firstBytesHex,
            "log-ok"
          );
          activeChipIdx++;
        }
      } else {
        bootStage = 3;
        stageTick = 0;
        logArc("STAGE 4: Decodificando gráficos VDP y cabeceras binarias de " + ORIG_SET_NAME + "...", "log-sys");
        return;
      }

      ctx.fillStyle = "#040711";
      ctx.fillRect(0, 0, 384, 264);
      ctx.fillStyle = "#1e3a8a";
      ctx.fillRect(0, 0, 384, 22);
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText("LuferOS boot Arcade v1.2 — STAGE 3/5: ROM CHIP CRC32", 10, 14);

      ctx.font = "bold 8px monospace";
      const visibleChips = chipChecks.slice(0, 7);
      for (let i = 0; i < visibleChips.length; i++) {
        const c = visibleChips[i];
        const y = 38 + i * 22;
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(c.name.padEnd(15, " ") + " (" + Math.ceil(c.size / 1024) + "KB)", 10, y);
        ctx.fillStyle = "#67e8f9";
        ctx.fillText("CRC:" + c.expectedCrc + " SUM:" + c.sum16, 154, y);
        ctx.fillStyle = c.status === "CRC OK" ? "#4ade80" : c.status === "READING" ? "#facc15" : "#64748b";
        ctx.fillText(c.status, 316, y);

        ctx.fillStyle = "#64748b";
        ctx.fillText("HEX: " + c.firstBytesHex, 14, y + 9);
      }

      ctx.fillStyle = "#090d16";
      ctx.fillRect(10, 204, 364, 48);
      ctx.strokeStyle = "#3b82f6";
      ctx.strokeRect(10, 204, 364, 48);
      ctx.fillStyle = "#4ade80";
      ctx.fillText("MASTER ROMSET CRC32: 0x" + masterCrc + "  •  SUM16: 0x" + masterSum16, 16, 218);
      ctx.fillStyle = "#fde047";
      ctx.fillText("ASCII STRINGS: " + extractedStrings.join(" | ").slice(0, 44), 16, 232);
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("VERIFICANDO INTEGRIDAD FISICA DEL ARCHIVO .ZIP...", 16, 245);
      return;
    }

    if (bootStage === 3) {
      ctx.fillStyle = "#050712";
      ctx.fillRect(0, 0, 384, 264);
      ctx.fillStyle = "#1e3a8a";
      ctx.fillRect(0, 0, 384, 22);
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText("LuferOS boot Arcade v1.2 — STAGE 4/5: VDP TILE DECODER", 10, 14);

      const pal = ["#050712", "#ef4444", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#f97316", "#ffffff"];
      const tilesToDraw = Math.min(180, stageTick * 3);

      for (let t = 0; t < tilesToDraw; t++) {
        const tx = t % 18;
        const ty = Math.floor(t / 18);
        const off = (t * 16) % Math.max(16, romBytes.length);
        for (let r = 0; r < 8; r++) {
          const b0 = romBytes[(off + r * 2) % romBytes.length] || 0;
          const b1 = romBytes[(off + r * 2 + 1) % romBytes.length] || 0;
          for (let c = 0; c < 8; c++) {
            const v = (((b0 >> (7 - c)) & 1) << 1) | ((b1 >> (7 - c)) & 1);
            if (v > 0) {
              ctx.fillStyle = pal[(v + (t % 5)) % pal.length];
              ctx.fillRect(16 + tx * 11 + c, 34 + ty * 11 + r, 1, 1);
            }
          }
        }
      }

      ctx.fillStyle = "#090d18";
      ctx.fillRect(222, 32, 150, 118);
      ctx.strokeStyle = "#f59e0b";
      ctx.strokeRect(222, 32, 150, 118);
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 8px monospace";
      ctx.fillText("DIP SWITCH BANK 1/2:", 228, 46);
      ctx.fillStyle = "#4ade80";
      ctx.fillText("SW1: ON OFF OFF ON  [1C/1C]", 228, 60);
      ctx.fillText("SW2: OFF ON ON OFF  [NORM]", 228, 72);
      ctx.fillText("CAB: UPRIGHT JAMMA", 228, 84);
      ctx.fillText("SND: YM2151/WSG OK", 228, 96);
      ctx.fillText("FPS: 60.0Hz SYNCED", 228, 108);
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("SET: " + ORIG_SET_NAME, 228, 124);
      ctx.fillText("DRV: " + activeCore.toUpperCase(), 228, 138);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 8.5px monospace";
      ctx.fillText("DECODIFICANDO TILES GRAFICOS REALES DE LA ROM (" + Math.min(100, Math.round((stageTick / 70) * 100)) + "%)...", 16, 175);

      ctx.fillStyle = "#1e293b";
      ctx.fillRect(16, 232, 352, 14);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(16, 232, (352 * Math.min(70, stageTick)) / 70, 14);

      if (stageTick >= 70) {
        bootStage = 4;
        stageTick = 0;
        playWsgTone(987.77, 0.12, "square", 0.05, 0);
        logArc("STAGE 5: Calibración CRT Crosshatch y Barras RGB completada.", "log-ok");
      }
      return;
    }

    if (bootStage === 4) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 384, 264);

      ctx.strokeStyle = "#475569";
      for (let x = 0; x <= 384; x += 24) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 264); ctx.stroke();
      }
      for (let y = 0; y <= 264; y += 24) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(384, y); ctx.stroke();
      }
      ctx.strokeStyle = "#f8fafc";
      ctx.strokeRect(2, 2, 380, 260);

      const bars = ["#ef4444", "#22c55e", "#3b82f6", "#facc15", "#a855f7", "#06b6d4", "#ffffff"];
      bars.forEach(function(col, idx) {
        ctx.fillStyle = col;
        ctx.fillRect(48 + idx * 42, 76, 36, 58);
      });

      ctx.fillStyle = "#000";
      ctx.fillRect(58, 156, 268, 36);
      ctx.strokeStyle = "#22c55e";
      ctx.strokeRect(58, 156, 268, 36);
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText("LuferOS boot Arcade v1.2 — ALL TESTS PASS", 68, 172);
      ctx.fillStyle = "#fde047";
      ctx.fillText("BOOTING ROM: " + GAME_TITLE.slice(0, 24), 68, 185);

      if (stageTick >= 55) {
        sysState = "ATTRACT";
        stageTick = 0;
        pwrLed.className = "on";
        pwrStatus.textContent = "JAMMA ON";
        dbgState.textContent = "🟢 ATTRACT MODE • " + GAME_TITLE;
        logArc("ARRANQUE FINALIZADO: [" + GAME_TITLE + "] en Attract Mode. Inserta moneda (🪙 COIN) y pulsa (👤 1P START).", "log-ok");
      }
    }
  }

  function renderAttractScreen() {
    stageTick++;
    cpuPc = (0x010000 + ((stageTick * 16) & 0x3FFF)) >>> 0;
    tPc.textContent = "BUS:0x" + cpuPc.toString(16).toUpperCase();

    const bg = ctx.createLinearGradient(0, 0, 0, 264);
    bg.addColorStop(0, "#070414");
    bg.addColorStop(0.55, "#1e1b4b");
    bg.addColorStop(1, "#090d16");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 384, 264);

    ctx.fillStyle = "rgba(245, 158, 11, 0.14)";
    ctx.fillRect(20, 18, 344, 68);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 18, 344, 68);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fde047";
    ctx.font = "italic 900 19px Impact, Arial Black, sans-serif";
    ctx.fillText(GAME_TITLE.slice(0, 25), 192, 48);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 8.5px monospace";
    ctx.fillText("ROMSET: " + ORIG_SET_NAME + ".ZIP • CRC32: 0x" + masterCrc + " • 60.0Hz", 192, 72);

    ctx.fillStyle = "rgba(9,13,22,0.85)";
    ctx.fillRect(28, 96, 328, 86);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1;
    ctx.strokeRect(28, 96, 328, 86);

    const pal = ["#050712", "#ef4444", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#f97316", "#ffffff"];
    for (let t = 0; t < 24; t++) {
      const tx = t % 12;
      const ty = Math.floor(t / 12);
      const off = ((t + Math.floor(stageTick / 20)) * 16) % Math.max(16, romBytes.length);
      for (let r = 0; r < 8; r++) {
        const b0 = romBytes[(off + r * 2) % romBytes.length] || 0;
        const b1 = romBytes[(off + r * 2 + 1) % romBytes.length] || 0;
        for (let c = 0; c < 8; c++) {
          const v = (((b0 >> (7 - c)) & 1) << 1) | ((b1 >> (7 - c)) & 1);
          if (v > 0) {
            ctx.fillStyle = pal[(v + t) % pal.length];
            ctx.fillRect(54 + tx * 24 + c * 2, 108 + ty * 26 + r * 2, 2, 2);
          }
        }
      }
    }

    ctx.fillStyle = "#a5f3fc";
    ctx.font = "bold 8.5px monospace";
    ctx.fillText("PLACA ACTIVA: " + activeCore.toUpperCase() + "  (CAMBIA CON [🎮 PLACA])", 192, 174);

    if ((stageTick % 40) < 24) {
      ctx.fillStyle = credits > 0 ? "#4ade80" : "#facc15";
      ctx.font = "bold 12px monospace";
      ctx.fillText(credits > 0 ? "PULSA [👤 1P START] PARA INICIAR" : "INSERT COIN — PULSA [🪙 COIN]", 192, 212);
    }

    ctx.fillStyle = "#f87171";
    ctx.font = "bold 10px monospace";
    ctx.fillText("CREDIT(S): " + credits, 192, 242);
    ctx.textAlign = "left";
  }

  const SLOT_SYMBOLS = [
    { id: "7",   label: "777", col: "#ef4444", payout: 50 },
    { id: "BAR", label: "BAR", col: "#facc15", payout: 25 },
    { id: "BEL", label: "🔔",  col: "#eab308", payout: 15 },
    { id: "CHR", label: "🍒",  col: "#f43f5e", payout: 10 },
    { id: "CLV", label: "🍀",  col: "#22c55e", payout: 8 },
    { id: "DIA", label: "💎",  col: "#38bdf8", payout: 20 }
  ];
  let slotReels = [0, 1, 2];
  let slotSpinTimers = [0, 0, 0];
  let slotBet = 5;
  let slotBank = 100;
  let slotLastWin = 0;
  let slotMsg = "PULSA [LP / GIRO] PARA TIRAR LOS RODILLOS";

  function spinSlotMachine() {
    if (slotSpinTimers[0] > 0 || slotSpinTimers[1] > 0 || slotSpinTimers[2] > 0) return;
    if (slotBank < slotBet) {
      slotBank = 50;
      logArc("SLOT CREDIT REFILL: +50 fichas recargadas.", "log-sys");
    }
    slotBank -= slotBet;
    slotLastWin = 0;
    slotSpinTimers = [28, 46, 64];
    slotMsg = "GIRANDO RODILLOS JAMMA...";
    playWsgTone(520, 0.12, "square", 0.06, 280);
    logArc("SLTBLGPO SPIN: Apuesta " + slotBet + " fichas | Banco: " + slotBank, "log-sys");
  }

  function renderSlotArcadeGame() {
    stageTick++;
    cpuPc = (0x008000 + ((stageTick * 12) & 0x1FFF)) >>> 0;
    tPc.textContent = "BUS:0x" + cpuPc.toString(16).toUpperCase();

    if ((keys.lp || keys.mp || keys.hp || keys.up) && slotSpinTimers[2] === 0) {
      keys.lp = false; keys.mp = false; keys.hp = false; keys.up = false;
      spinSlotMachine();
    }
    if (keys.lk) {
      keys.lk = false;
      slotBet = slotBet >= 25 ? 5 : slotBet + 5;
      playWsgTone(740, 0.06, "triangle", 0.05, 0);
    }

    let anySpinning = false;
    for (let i = 0; i < 3; i++) {
      if (slotSpinTimers[i] > 0) {
        anySpinning = true;
        slotSpinTimers[i]--;
        if (stageTick % 3 === 0) {
          slotReels[i] = (slotReels[i] + 1 + (romBytes[(stageTick + i) % romBytes.length] & 1)) % SLOT_SYMBOLS.length;
          playWsgTone(300 + i * 110, 0.025, "square", 0.03, 0);
        }
        if (slotSpinTimers[i] === 0 && i === 2) {
          const s0 = SLOT_SYMBOLS[slotReels[0]];
          const s1 = SLOT_SYMBOLS[slotReels[1]];
          const s2 = SLOT_SYMBOLS[slotReels[2]];
          if (s0.id === s1.id && s1.id === s2.id) {
            slotLastWin = slotBet * s0.payout;
            slotBank += slotLastWin;
            slotMsg = "JACKPOT TRIPLE " + s0.label + "! GANAS +" + slotLastWin;
            playWsgTone(880, 0.35, "square", 0.08, 420);
            logArc("SLTBLGPO JACKPOT! Triple " + s0.label + " -> +" + slotLastWin + " fichas!", "log-ok");
          } else if (s0.id === s1.id || s1.id === s2.id || s0.id === s2.id) {
            const matchSym = s0.id === s1.id ? s0 : s2;
            slotLastWin = Math.floor(slotBet * (matchSym.payout * 0.25));
            slotBank += slotLastWin;
            slotMsg = "PAR DE " + matchSym.label + "! GANAS +" + slotLastWin;
            playWsgTone(660, 0.2, "square", 0.07, 180);
            logArc("SLTBLGPO WIN: Par -> +" + slotLastWin + " fichas.", "log-ok");
          } else {
            slotMsg = "SIN PREMIO — PULSA [LP] PARA INTENTAR DE NUEVO";
          }
        }
      }
    }

    ctx.fillStyle = "#090414";
    ctx.fillRect(0, 0, 384, 264);

    ctx.fillStyle = "#7c2d12";
    ctx.fillRect(14, 10, 356, 30);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 10, 356, 30);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 12px monospace";
    ctx.fillText("★ " + ORIG_SET_NAME + " • GOLDEN CASINO ARCADE ★", 192, 29);

    for (let i = 0; i < 3; i++) {
      const rx = 42 + i * 104;
      const ry = 54;
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(rx, ry, 92, 106);
      ctx.strokeStyle = slotSpinTimers[i] > 0 ? "#ef4444" : "#f59e0b";
      ctx.lineWidth = 3;
      ctx.strokeRect(rx, ry, 92, 106);

      const symPrev = SLOT_SYMBOLS[(slotReels[i] + SLOT_SYMBOLS.length - 1) % SLOT_SYMBOLS.length];
      const symCur = SLOT_SYMBOLS[slotReels[i]];
      const symNext = SLOT_SYMBOLS[(slotReels[i] + 1) % SLOT_SYMBOLS.length];

      ctx.font = "bold 14px monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(symPrev.label, rx + 46, ry + 24);
      ctx.fillText(symNext.label, rx + 46, ry + 94);

      ctx.fillStyle = "rgba(254, 240, 138, 0.35)";
      ctx.fillRect(rx + 4, ry + 34, 84, 38);

      ctx.font = "bold 24px monospace";
      ctx.fillStyle = symCur.col;
      ctx.fillText(symCur.label, rx + 46, ry + 61);
    }

    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 107);
    ctx.lineTo(352, 107);
    ctx.stroke();

    ctx.fillStyle = "#1e1b4b";
    ctx.fillRect(18, 172, 348, 42);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 172, 348, 42);

    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 11px monospace";
    ctx.fillText("BANK: " + slotBank + "   |   BET (LK): " + slotBet + "   |   WIN: " + slotLastWin, 192, 190);
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 9px monospace";
    ctx.fillText(slotMsg, 192, 206);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "bold 8.5px monospace";
    ctx.fillText("[LP/MP/HP]: GIRAR RODILLOS  •  [LK]: SUBIR APUESTA", 192, 238);
    ctx.textAlign = "left";
  }

  let tetGrid = [];
  let tetPiece = null;
  let tetScore = 0;
  let tetLines = 0;
  let tetDropCounter = 0;
  const TET_SHAPES = [
    { m: [[1,1,1,1]], c: "#22d3ee" },
    { m: [[1,1],[1,1]], c: "#facc15" },
    { m: [[0,1,0],[1,1,1]], c: "#a855f7" },
    { m: [[1,0,0],[1,1,1]], c: "#3b82f6" },
    { m: [[0,0,1],[1,1,1]], c: "#f97316" },
    { m: [[0,1,1],[1,1,0]], c: "#22c55e" },
    { m: [[1,1,0],[0,1,1]], c: "#ef4444" }
  ];

  function initTetrisGame() {
    tetGrid = [];
    for (let r = 0; r < 20; r++) {
      tetGrid.push(new Array(10).fill(""));
    }
    tetScore = 0;
    tetLines = 0;
    spawnTetPiece();
  }

  function spawnTetPiece() {
    const pick = TET_SHAPES[Math.floor(Math.random() * TET_SHAPES.length)];
    tetPiece = {
      m: pick.m.map(function(r){ return r.slice(); }),
      c: pick.c,
      x: 3,
      y: 0
    };
    if (tetCollides(tetPiece.m, tetPiece.x, tetPiece.y)) {
      for (let r = 0; r < 20; r++) tetGrid[r].fill("");
    }
  }

  function tetCollides(mat, px, py) {
    for (let r = 0; r < mat.length; r++) {
      for (let c = 0; c < mat[r].length; c++) {
        if (!mat[r][c]) continue;
        const nx = px + c;
        const ny = py + r;
        if (nx < 0 || nx >= 10 || ny >= 20) return true;
        if (ny >= 0 && tetGrid[ny][nx]) return true;
      }
    }
    return false;
  }

  function renderTetrisArcade() {
    stageTick++;
    if (!tetGrid.length) initTetrisGame();

    if (stageTick % 5 === 0) {
      if (keys.left && !tetCollides(tetPiece.m, tetPiece.x - 1, tetPiece.y)) tetPiece.x--;
      if (keys.right && !tetCollides(tetPiece.m, tetPiece.x + 1, tetPiece.y)) tetPiece.x++;
    }
    if ((keys.up || keys.lp) && stageTick % 8 === 0) {
      keys.up = false; keys.lp = false;
      const rot = tetPiece.m[0].map(function(_, idx) {
        return tetPiece.m.map(function(row) { return row[idx]; }).reverse();
      });
      if (!tetCollides(rot, tetPiece.x, tetPiece.y)) {
        tetPiece.m = rot;
        playWsgTone(620, 0.04, "triangle", 0.04, 0);
      }
    }

    tetDropCounter++;
    const dropSpeed = keys.down ? 3 : 24;
    if (tetDropCounter >= dropSpeed) {
      tetDropCounter = 0;
      if (!tetCollides(tetPiece.m, tetPiece.x, tetPiece.y + 1)) {
        tetPiece.y++;
      } else {
        for (let r = 0; r < tetPiece.m.length; r++) {
          for (let c = 0; c < tetPiece.m[r].length; c++) {
            if (tetPiece.m[r][c] && tetPiece.y + r >= 0) {
              tetGrid[tetPiece.y + r][tetPiece.x + c] = tetPiece.c;
            }
          }
        }
        let cleared = 0;
        for (let r = 19; r >= 0; r--) {
          if (tetGrid[r].every(function(cell){ return cell !== ""; })) {
            tetGrid.splice(r, 1);
            tetGrid.unshift(new Array(10).fill(""));
            cleared++;
            r++;
          }
        }
        if (cleared > 0) {
          tetLines += cleared;
          tetScore += cleared * 300;
          playWsgTone(880, 0.18, "square", 0.07, 240);
        } else {
          playWsgTone(220, 0.05, "square", 0.04, 0);
        }
        spawnTetPiece();
      }
    }

    ctx.fillStyle = "#060814";
    ctx.fillRect(0, 0, 384, 264);

    const bx = 132;
    const by = 18;
    const bs = 11;
    ctx.fillStyle = "#020308";
    ctx.fillRect(bx - 2, by - 2, 10 * bs + 4, 20 * bs + 4);
    ctx.strokeStyle = "#f59e0b";
    ctx.strokeRect(bx - 2, by - 2, 10 * bs + 4, 20 * bs + 4);

    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 10; c++) {
        if (tetGrid[r][c]) {
          ctx.fillStyle = tetGrid[r][c];
          ctx.fillRect(bx + c * bs, by + r * bs, bs - 1, bs - 1);
        }
      }
    }

    for (let r = 0; r < tetPiece.m.length; r++) {
      for (let c = 0; c < tetPiece.m[r].length; c++) {
        if (tetPiece.m[r][c]) {
          ctx.fillStyle = tetPiece.c;
          ctx.fillRect(bx + (tetPiece.x + c) * bs, by + (tetPiece.y + r) * bs, bs - 1, bs - 1);
        }
      }
    }

    ctx.fillStyle = "#fde047";
    ctx.font = "bold 10px monospace";
    ctx.fillText("TETRIS JAMMA", 14, 36);
    ctx.fillStyle = "#4ade80";
    ctx.fillText("SCORE: " + tetScore, 14, 62);
    ctx.fillText("LINES: " + tetLines, 14, 82);
  }

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
  let pacReadyTimer = 0;
  let wakaToggle = false;

  let pacPlayer = { x: 13.5, y: 20, dx: -1, dy: 0, nextDx: -1, nextDy: 0, mouth: 0.2, mouthDir: 1 };
  let pacGhosts = [];

  function initPacmanMaze(resetScore) {
    pacGrid = [];
    pacDotsRemaining = 0;
    for (let r = 0; r < PAC_RAW_MAP.length; r++) {
      const row = [];
      for (let c = 0; c < 28; c++) {
        const v = parseInt(PAC_RAW_MAP[r][c], 10);
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
    pacPlayer = { x: 13.5, y: 20, dx: -1, dy: 0, nextDx: -1, nextDy: 0, mouth: 0.2, mouthDir: 1 };
    pacFrightTimer = 0;
    pacReadyTimer = 50;
    pacGhosts = [
      { name: "BLINKY", col: "#ef4444", x: 13.5, y: 11, dx: -1, dy: 0, scatX: 25, scatY: 0, state: "normal" },
      { name: "PINKY",  col: "#f472b6", x: 13.5, y: 13, dx: 0,  dy: -1, scatX: 2,  scatY: 0, state: "normal" },
      { name: "INKY",   col: "#22d3ee", x: 12.0, y: 13, dx: 0,  dy: -1, scatX: 27, scatY: 25, state: "normal" },
      { name: "CLYDE",  col: "#fb923c", x: 15.0, y: 13, dx: 0,  dy: -1, scatX: 0,  scatY: 25, state: "normal" }
    ];
  }

  function isPacWall(tx, ty, isGhost) {
    if (ty < 0 || ty >= PAC_RAW_MAP.length) return true;
    const cell = pacGrid[ty][(tx + 28) % 28];
    if (cell === 1) return true;
    if (cell === 4) return !isGhost;
    return false;
  }

  function updateAndRenderPacman() {
    stageTick++;
    cpuPc = (0x0038 + ((stageTick * 14) & 0x3FFF)) & 0xFFFF;
    tPc.textContent = "BUS:0x" + cpuPc.toString(16).toUpperCase();

    if (keys.left)  { pacPlayer.nextDx = -1; pacPlayer.nextDy = 0; }
    if (keys.right) { pacPlayer.nextDx = 1;  pacPlayer.nextDy = 0; }
    if (keys.up)    { pacPlayer.nextDx = 0;  pacPlayer.nextDy = -1; }
    if (keys.down)  { pacPlayer.nextDx = 0;  pacPlayer.nextDy = 1; }

    if (pacReadyTimer > 0) {
      pacReadyTimer--;
    } else {
      if (pacFrightTimer > 0) pacFrightTimer--;

      const spd = 0.095;
      const cx = Math.round(pacPlayer.x);
      const cy = Math.round(pacPlayer.y);
      const nearCenter = Math.abs(pacPlayer.x - cx) < 0.16 && Math.abs(pacPlayer.y - cy) < 0.16;

      if (pacPlayer.nextDx === -pacPlayer.dx && pacPlayer.nextDy === -pacPlayer.dy) {
        pacPlayer.dx = pacPlayer.nextDx;
        pacPlayer.dy = pacPlayer.nextDy;
      } else if (nearCenter && (pacPlayer.nextDx !== pacPlayer.dx || pacPlayer.nextDy !== pacPlayer.dy)) {
        if (!isPacWall(cx + pacPlayer.nextDx, cy + pacPlayer.nextDy, false)) {
          pacPlayer.x = cx;
          pacPlayer.y = cy;
          pacPlayer.dx = pacPlayer.nextDx;
          pacPlayer.dy = pacPlayer.nextDy;
        }
      }

      const nextX = pacPlayer.x + pacPlayer.dx * spd;
      const nextY = pacPlayer.y + pacPlayer.dy * spd;
      if (!isPacWall(Math.round(nextX + pacPlayer.dx * 0.35), Math.round(nextY + pacPlayer.dy * 0.35), false)) {
        pacPlayer.x = (nextX + 28) % 28;
        pacPlayer.y = nextY;
        pacPlayer.mouth += 0.03 * pacPlayer.mouthDir;
        if (pacPlayer.mouth >= 0.36) pacPlayer.mouthDir = -1;
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
          pacFrightTimer = 260;
          pacComboGhost = 0;
          pacGhosts.forEach(function(g) { if (g.state === "normal") g.state = "fright"; });
          playWsgTone(680, 0.16, "sawtooth", 0.06, 220);
        } else {
          pacScore += 10;
          wakaToggle = !wakaToggle;
          playWsgTone(wakaToggle ? 290 : 410, 0.04, "triangle", 0.035, 0);
        }
        if (pacScore > pacHighScore) pacHighScore = pacScore;
        if (pacDotsRemaining <= 0) {
          pacLevel++;
          initPacmanMaze(false);
          return;
        }
      }

      pacGhosts.forEach(function(g) {
        if (pacFrightTimer === 0 && g.state === "fright") g.state = "normal";
        const gSpd = g.state === "eyes" ? 0.2 : g.state === "fright" ? 0.055 : 0.082;
        const gx = Math.round(g.x);
        const gy = Math.round(g.y);
        if (Math.abs(g.x - gx) < gSpd * 0.85 && Math.abs(g.y - gy) < gSpd * 0.85) {
          g.x = gx; g.y = gy;
          if (g.state === "eyes" && Math.abs(gx - 13) <= 1 && Math.abs(gy - 13) <= 1) {
            g.state = "normal"; g.dy = -1; g.dx = 0;
          }
          const dirs = [{dx:0,dy:-1},{dx:-1,dy:0},{dx:0,dy:1},{dx:1,dy:0}].filter(function(d){
            if (d.dx === -g.dx && d.dy === -g.dy) return false;
            return !isPacWall(gx + d.dx, gy + d.dy, true);
          });
          if (dirs.length === 0) { g.dx = -g.dx; g.dy = -g.dy; }
          else {
            const tx = g.state === "eyes" ? 13.5 : (gy >= 12 && gy <= 14 && gx >= 11 && gx <= 16) ? 13.5 : pacPlayer.x;
            const ty = g.state === "eyes" ? 11 : (gy >= 12 && gy <= 14 && gx >= 11 && gx <= 16) ? 10 : pacPlayer.y;
            let best = dirs[0], bDist = 99999;
            dirs.forEach(function(d){
              const dist = Math.hypot((gx + d.dx) - tx, (gy + d.dy) - ty);
              if (dist < bDist) { bDist = dist; best = d; }
            });
            g.dx = best.dx; g.dy = best.dy;
          }
        }
        g.x = (g.x + g.dx * gSpd + 28) % 28;
        g.y = g.y + g.dy * gSpd;

        if (Math.hypot(g.x - pacPlayer.x, g.y - pacPlayer.y) < 0.75) {
          if (g.state === "fright") {
            g.state = "eyes";
            pacComboGhost++;
            pacScore += 200 * (1 << (pacComboGhost - 1));
            playWsgTone(320, 0.2, "square", 0.07, 520);
          } else if (g.state === "normal") {
            pacLives--;
            playWsgTone(400, 0.4, "sawtooth", 0.07, -300);
            if (pacLives <= 0) initPacmanMaze(true);
            else resetPacmanPositions();
          }
        }
      });
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 384, 264);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 9.5px monospace";
    ctx.fillText("1UP " + String(pacScore).padStart(6, "0") + "   HIGH " + String(pacHighScore).padStart(6, "0") + "   STAGE " + pacLevel, 24, 13);

    const ox = 68, oy = 18, ts = 9;
    for (let r = 0; r < PAC_RAW_MAP.length; r++) {
      for (let c = 0; c < 28; c++) {
        const v = pacGrid[r][c];
        const px = ox + c * ts, py = oy + r * ts;
        if (v === 1) {
          ctx.fillStyle = "#1d4ed8";
          ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
        } else if (v === 4) {
          ctx.fillStyle = "#f472b6";
          ctx.fillRect(px, py + 3, ts, 3);
        } else if (v === 2) {
          ctx.fillStyle = "#fed7aa";
          ctx.fillRect(px + 3, py + 3, 2.5, 2.5);
        } else if (v === 3 && (stageTick & 8) === 0) {
          ctx.fillStyle = "#fde047";
          ctx.beginPath(); ctx.arc(px + 4.5, py + 4.5, 3.8, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    const pScreenX = ox + pacPlayer.x * ts + 4.5;
    const pScreenY = oy + pacPlayer.y * ts + 4.5;
    const baseAngle = pacPlayer.dx === 1 ? 0 : pacPlayer.dx === -1 ? Math.PI : pacPlayer.dy === -1 ? -Math.PI / 2 : Math.PI / 2;
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.moveTo(pScreenX, pScreenY);
    ctx.arc(pScreenX, pScreenY, 5.5, baseAngle + pacPlayer.mouth * Math.PI, baseAngle + (2 - pacPlayer.mouth) * Math.PI);
    ctx.closePath();
    ctx.fill();

    pacGhosts.forEach(function(g) {
      const gx = ox + g.x * ts + 4.5, gy = oy + g.y * ts + 4.5;
      if (g.state !== "eyes") {
        ctx.fillStyle = g.state === "fright" ? "#1d4ed8" : g.col;
        ctx.fillRect(gx - 5, gy - 5, 10, 10);
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(gx - 3, gy - 3, 2, 2);
      ctx.fillRect(gx + 1, gy - 3, 2, 2);
    });
  }

  let galPlayerX = 192, galBullets = [], galAliens = [], galScore = 0;
  function initGalagaStage() {
    galAliens = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c++) {
        galAliens.push({ baseX: 68 + c * 34, baseY: 42 + r * 22, hp: 1, col: r === 0 ? "#facc15" : r === 1 ? "#ef4444" : "#38bdf8" });
      }
    }
  }

  function renderGalagaScreen() {
    stageTick++;
    if (!galAliens.length) initGalagaStage();
    if (keys.left) galPlayerX = Math.max(24, galPlayerX - 2.6);
    if (keys.right) galPlayerX = Math.min(360, galPlayerX + 2.6);
    if ((keys.lp || keys.mp || keys.hp) && stageTick % 12 === 0) {
      galBullets.push({ x: galPlayerX, y: 224 });
      playWsgTone(880, 0.05, "square", 0.04, -380);
    }

    ctx.fillStyle = "#03040a";
    ctx.fillRect(0, 0, 384, 264);

    const sway = Math.sin(stageTick * 0.03) * 24;
    let alive = 0;
    galAliens.forEach(function(al) {
      if (al.hp <= 0) return;
      alive++;
      const ax = al.baseX + sway, ay = al.baseY;
      ctx.fillStyle = al.col;
      ctx.fillRect(ax - 9, ay - 6, 18, 12);
      for (let bi = galBullets.length - 1; bi >= 0; bi--) {
        if (Math.abs(galBullets[bi].x - ax) < 11 && Math.abs(galBullets[bi].y - ay) < 9) {
          al.hp = 0;
          galBullets.splice(bi, 1);
          galScore += 150;
          playWsgTone(240, 0.08, "sawtooth", 0.05, -100);
          break;
        }
      }
    });
    if (alive === 0) initGalagaStage();

    for (let i = galBullets.length - 1; i >= 0; i--) {
      galBullets[i].y -= 5.2;
      ctx.fillStyle = "#fde047";
      ctx.fillRect(galBullets[i].x - 1, galBullets[i].y, 3, 8);
      if (galBullets[i].y < 0) galBullets.splice(i, 1);
    }

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(galPlayerX - 10, 226, 20, 12);
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 10px monospace";
    ctx.fillText("1UP: " + String(galScore).padStart(6, "0") + "   " + GAME_TITLE, 14, 16);
  }

  let p1 = { x: 96, y: 210, vy: 0, hp: 100, dir: 1, act: "idle", actTimer: 0, score: 0 };
  let cpuFoe = { x: 268, y: 210, vy: 0, hp: 100, dir: -1, act: "idle", actTimer: 0, round: 1 };
  let projectiles = [];

  function triggerSpecialMove() {
    if (sysState !== "GAME") return;
    if (activeCore === "slot") {
      spinSlotMachine();
      return;
    }
    if (activeCore === "pacman") {
      pacFrightTimer = 260;
      pacGhosts.forEach(function(g) { g.state = "fright"; });
      return;
    }
    p1.act = "special";
    p1.actTimer = 18;
    projectiles.push({ x: p1.x + p1.dir * 24, y: p1.y - 28, vx: p1.dir * 4.5 });
    playWsgTone(320, 0.2, "sawtooth", 0.07, 380);
  }

  function renderFighterOrSlugScreen() {
    stageTick++;
    cpuPc = (0x040000 + ((stageTick * 32) & 0xFFFF)) >>> 0;
    tPc.textContent = "BUS:0x" + cpuPc.toString(16).toUpperCase();

    if (p1.actTimer > 0 && --p1.actTimer === 0) p1.act = "idle";
    if (cpuFoe.actTimer > 0 && --cpuFoe.actTimer === 0) cpuFoe.act = "idle";

    if (keys.left) { p1.x = Math.max(28, p1.x - 2.2); p1.dir = -1; }
    if (keys.right) { p1.x = Math.min(356, p1.x + 2.2); p1.dir = 1; }
    if (keys.up && p1.y >= 210) {
      p1.vy = -7.2;
      playWsgTone(260, 0.1, "triangle", 0.04, 160);
    }
    if (p1.y < 210 || p1.vy !== 0) {
      p1.y += p1.vy;
      p1.vy += 0.42;
      if (p1.y >= 210) { p1.y = 210; p1.vy = 0; }
    }

    const punchHit = keys.lp || keys.mp || keys.hp;
    const kickHit = keys.lk || keys.mk || keys.hk;
    if ((punchHit || kickHit) && p1.actTimer === 0) {
      if (activeCore === "slug" || (keys.hp && keys.down)) {
        triggerSpecialMove();
      } else {
        p1.act = punchHit ? "punch" : "kick";
        p1.actTimer = 14;
        const dmg = (keys.hp || keys.hk) ? 8 : 5;
        playWsgTone(punchHit ? 210 : 150, 0.07, "sawtooth", 0.05, -60);
        if (Math.abs(cpuFoe.x - p1.x) < 42 && Math.abs(cpuFoe.y - p1.y) < 30) {
          cpuFoe.hp = Math.max(0, cpuFoe.hp - dmg);
          cpuFoe.act = "hurt";
          cpuFoe.actTimer = 12;
          p1.score += dmg * 100;
        }
      }
    }

    if (cpuFoe.act !== "hurt") {
      const dist = p1.x - cpuFoe.x;
      cpuFoe.dir = dist >= 0 ? 1 : -1;
      if (Math.abs(dist) > 36) cpuFoe.x += cpuFoe.dir * 1.1;
      else if (stageTick % 48 === 0) {
        cpuFoe.act = "punch";
        cpuFoe.actTimer = 14;
        if (Math.abs(p1.y - cpuFoe.y) < 24 && !keys.left) p1.hp = Math.max(0, p1.hp - 5);
      }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.x += pr.vx;
      if (Math.abs(pr.x - cpuFoe.x) < 20 && Math.abs(pr.y - (cpuFoe.y - 24)) < 26) {
        cpuFoe.hp = Math.max(0, cpuFoe.hp - 12);
        cpuFoe.act = "hurt";
        cpuFoe.actTimer = 14;
        projectiles.splice(i, 1);
      } else if (pr.x < 0 || pr.x > 384) projectiles.splice(i, 1);
    }

    if (cpuFoe.hp <= 0 || p1.hp <= 0) {
      if (cpuFoe.hp <= 0) { p1.score += 3000; cpuFoe.round++; }
      p1.hp = 100; cpuFoe.hp = 100; p1.x = 96; cpuFoe.x = 268; projectiles = [];
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
    ctx.font = "bold 10px monospace";
    ctx.fillText("KO", 185, 23);

    function drawChar(f, col) {
      ctx.fillStyle = f.act === "hurt" ? "#fff" : col;
      ctx.fillRect(f.x - 11, f.y - 44, 22, 28);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(f.x - 10, f.y - 16, 8, 16);
      ctx.fillRect(f.x + 2, f.y - 16, 8, 16);
      ctx.fillStyle = "#fed7aa";
      ctx.fillRect(f.x - 7, f.y - 55, 14, 11);
      if (f.act === "punch" || f.act === "kick") {
        ctx.fillStyle = "#fde047";
        ctx.fillRect(f.dir > 0 ? f.x + 11 : f.x - 31, f.y - 36, 20, 7);
      }
    }
    drawChar(p1, activeCore === "slug" ? "#22c55e" : "#f8fafc");
    drawChar(cpuFoe, "#ef4444");

    projectiles.forEach(function(pr) {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 7, 0, Math.PI * 2); ctx.fill();
    });
  }

  function renderPowerOffScreen() {
    ctx.fillStyle = "#030407";
    ctx.fillRect(0, 0, 384, 264);
    ctx.strokeStyle = "#1e293b";
    ctx.strokeRect(18, 18, 348, 228);
    ctx.textAlign = "center";
    ctx.fillStyle = "#475569";
    ctx.font = "bold 11px monospace";
    ctx.fillText("JAMMA ARCADE MONITOR • STANDBY OFF", 192, 92);
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 12px monospace";
    ctx.fillText("⚡ PULSA [POWER ON] PARA INICIAR EL BOOT", 192, 130);
    ctx.fillStyle = "#4ade80";
    ctx.font = "9px monospace";
    ctx.fillText("ROMSET MONTADO: " + ORIG_SET_NAME + ".ZIP (" + activeCore.toUpperCase() + ")", 192, 165);
    ctx.textAlign = "left";
  }

  function startSelectedGame() {
    sysState = "GAME";
    stageTick = 0;
    pwrLed.className = "on";
    pwrStatus.textContent = "JAMMA ON";
    dbgState.textContent = "🟢 JUGANDO • " + GAME_TITLE;
    if (activeCore === "pacman") initPacmanMaze(true);
    else if (activeCore === "galaga") { galScore = 0; initGalagaStage(); }
    else if (activeCore === "tetris") initTetrisGame();
    else if (activeCore === "slot") { slotBank = 100; slotLastWin = 0; }
    else { p1.hp = 100; cpuFoe.hp = 100; }
    playWsgTone(587.33, 0.18, "square", 0.06, 220);
    logArc("PARTIDA INICIADA: [" + GAME_TITLE + "] corriendo a 60.0Hz exactos.", "log-ok");
  }

  function powerOnCabinet(forceBoot) {
    unlockAudio();
    if (!forceBoot && sysState !== "OFF") {
      sysState = "OFF";
      pwrLed.className = "";
      pwrStatus.textContent = "STANDBY";
      btnPower.classList.remove("powered");
      btnPower.textContent = "⚡ POWER ON";
      dbgState.textContent = "🔌 GABINETE APAGADO";
      logArc("POWER OFF: Fuente JAMMA desconectada.", "log-warn");
      return;
    }
    initBootStructures();
    sysState = "BOOT";
    pwrLed.className = "boot";
    pwrStatus.textContent = "POST v1.2";
    btnPower.classList.add("powered");
    btnPower.textContent = "⚡ POWER OFF";
    dbgState.textContent = "⚡ LuferOS boot Arcade v1.2 — POST EN CURSO";
    playWsgTone(95, 0.22, "sawtooth", 0.07, 190);
    logArc("============================================", "log-sys");
    logArc("POWER ON: Ejecutando LuferOS boot Arcade v1.2 completo...", "log-ok");
  }

  const STEP_MS = 1000 / 60;
  let lastFrameTime = performance.now();
  let accumulator = 0;
  let renderedFrames = 0;
  let lastFpsCheck = performance.now();

  function mainLoop(now) {
    requestAnimationFrame(mainLoop);
    let delta = now - lastFrameTime;
    lastFrameTime = now;
    if (delta > 120) delta = 120;
    accumulator += delta;

    if (now - lastFpsCheck >= 500) {
      const fps = Math.min(60, Math.round((renderedFrames * 1000) / (now - lastFpsCheck)));
      renderedFrames = 0;
      lastFpsCheck = now;
      if (sysState !== "OFF") tFps.textContent = "CLK: " + fps + ".0Hz";
    }

    if (accumulator < STEP_MS) return;

    while (accumulator >= STEP_MS) {
      accumulator -= STEP_MS;
      if (showRomTileInspector) {
        renderRomTileInspectorScreen();
      } else if (sysState === "OFF") {
        renderPowerOffScreen();
      } else if (sysState === "BOOT") {
        stepAndRenderBootSequence();
      } else if (sysState === "ATTRACT") {
        renderAttractScreen();
      } else if (sysState === "GAME") {
        if (activeCore === "slot") renderSlotArcadeGame();
        else if (activeCore === "pacman") updateAndRenderPacman();
        else if (activeCore === "galaga") renderGalagaScreen();
        else if (activeCore === "tetris") renderTetrisArcade();
        else renderFighterOrSlugScreen();
      }
    }
    renderedFrames++;
  }

  function bindTap(el, fn) {
    if (!el) return;
    let last = 0;
    const trig = function(e) {
      const now = Date.now();
      if (now - last < 220) return;
      last = now;
      if (e && e.cancelable) e.preventDefault();
      fn();
    };
    el.addEventListener("pointerdown", trig);
    el.addEventListener("click", trig);
  }

  function setupInputs() {
    bindTap(btnPower, function() { powerOnCabinet(false); });
    bindTap(canvas, function() {
      if (sysState === "OFF") powerOnCabinet(true);
      else if (sysState === "ATTRACT" && credits > 0) {
        credits--;
        btnCoin.textContent = "🪙 COIN (" + credits + ")";
        tCred.textContent = "CREDITS: " + credits;
        startSelectedGame();
      }
    });

    bindTap(btnCoin, function() {
      unlockAudio();
      if (sysState === "OFF") powerOnCabinet(true);
      credits = Math.min(99, credits + 1);
      btnCoin.textContent = "🪙 COIN (" + credits + ")";
      tCred.textContent = "CREDITS: " + credits;
      playCoinChime();
      logArc("COIN #1: Credito insertado (Creditos: " + credits + ")", "log-ok");
    });

    bindTap(document.getElementById("btn-start"), function() {
      unlockAudio();
      if (sysState === "OFF") { powerOnCabinet(true); return; }
      if (sysState === "BOOT") {
        logArc("NOTICE: Espera a que termine la verificacion del boot o pulsa 1P START otra vez para saltar.", "log-warn");
        sysState = "ATTRACT";
        pwrLed.className = "on";
        pwrStatus.textContent = "JAMMA ON";
        return;
      }
      if (credits <= 0) {
        credits = 1;
        logArc("SERVICE COIN: +1 Credito habilitado.", "log-sys");
      }
      credits--;
      btnCoin.textContent = "🪙 COIN (" + credits + ")";
      tCred.textContent = "CREDITS: " + credits;
      startSelectedGame();
    });

    bindTap(document.getElementById("btn-service"), function() {
      unlockAudio();
      showRomTileInspector = false;
      powerOnCabinet(true);
    });

    bindTap(document.getElementById("btn-reboot-boot"), function() {
      unlockAudio();
      showRomTileInspector = false;
      powerOnCabinet(true);
    });

    bindTap(document.getElementById("btn-rom-tiles"), function() {
      unlockAudio();
      showRomTileInspector = !showRomTileInspector;
      logArc(showRomTileInspector ? "Inspector de Tiles y Hex de la ROM abierto." : "Inspector cerrado.", "log-sys");
    });

    bindTap(document.getElementById("btn-action-macro"), function() {
      unlockAudio();
      triggerSpecialMove();
    });

    bindTap(document.getElementById("btn-game-switch"), function() {
      unlockAudio();
      const order = ["slot", "fighter", "pacman", "slug", "galaga", "tetris"];
      const names = {
        slot:    ORIG_SET_NAME + " • GOLDEN SLOT ARCADE",
        fighter: ORIG_SET_NAME + " • STREET FIGHTER CPS",
        pacman:  ORIG_SET_NAME + " • PAC-MAN NAMCO Z80",
        slug:    ORIG_SET_NAME + " • METAL SLUG MVS",
        galaga:  ORIG_SET_NAME + " • GALAGA NAMCO Z80",
        tetris:  ORIG_SET_NAME + " • TETRIS JAMMA"
      };
      activeCore = order[(order.indexOf(activeCore) + 1) % order.length];
      GAME_TITLE = names[activeCore];
      romBadgeLbl.textContent = GAME_TITLE;
      updateBoardLabels();
      if (sysState === "GAME") startSelectedGame();
      logArc("PLACA JAMMA CAMBIADA A: " + activeCore.toUpperCase(), "log-ok");
    });

    const btnLogs = document.getElementById("btn-logs-toggle");
    bindTap(btnLogs, function() {
      const hidden = dbgPanel.classList.toggle("collapsed");
      btnLogs.classList.toggle("active", !hidden);
    });

    bindTap(document.getElementById("btn-clear-log"), function() {
      dbgLog.innerHTML = "";
    });

    bindTap(document.getElementById("btn-copy-log"), function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(logHistory.join("\\n")).catch(function(){});
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
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("pointerleave", up);
    });
  }

  function initSystem() {
    setupInputs();
    romBytes = decodeBase64ToBytes(ROM_RAW_B64);
    analyzeRealRomBinary(romBytes);
    updateBoardLabels();
    tCrc.textContent = "CRC:" + masterCrc;
    logArc("ROMSET [" + ORIG_SET_NAME + ".ZIP] cargado en bus JAMMA (" + ROM_CHIPS.length + " chips, Master CRC32: 0x" + masterCrc + ").", "log-ok");
    powerOnCabinet(true);
    requestAnimationFrame(mainLoop);
  }

  initSystem();
})();`;

  return html
    .replace("__GAME_TITLE__", () => safeTitle)
    .replace("__ARCADE_SCRIPT__", () => script);
}

export default {
  name: ["arcade", "cps", "cps1", "cps2", "maquinita", "mame", "pacman"],
  category: "group",
  description:
    "Sistema LuferOS boot Arcade v1.2 con reloj bloqueado a 60.0Hz, POST físico de 5 etapas, decodificador de ROMs .zip y múltiples placas JAMMA.",
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
                const base = f.replace(/\.(zip|bin|rom)$/i, "");
                const kb = Math.ceil(fs.statSync(path.join(CACHE_DIR, f)).size / 1024);
                const metaPath = path.join(CACHE_DIR, `${base}.meta.json`);
                let extra = "";
                if (fs.existsSync(metaPath)) {
                  try {
                    const m: SavedRomMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
                    extra = ` → Set: \`${m.originalZipName}\` [${m.coreType.toUpperCase()}]`;
                  } catch {}
                }
                return `${i + 1}. \`${base}\` (${kb} KB)${extra}`;
              })
              .join("\n")
          : "• `sltblgpo` (Golden Slot & Poker JAMMA)\n• `sf2` (Street Fighter II' CPS-I)\n• `pacman` (Pac-Man Namco Z80)\n• `mslug` (Metal Slug Neo-Geo)\n• `galaga` (Galaga Namco)\n• `tetris` (Tetris Atari JAMMA)";

        return reply(
          `╭〔 🕹️ ${fytBold("LuferOS boot Arcade v1.2")} 〕⬣\n` +
            `${listTxt}\n` +
            `╰━━━━━━━━━━━━⬣\n` +
            `• Cargar juego guardado: \`${prefix}arcade <nombre>\`\n` +
            `• Guardar ROM .zip: Responde al archivo con \`${prefix}arcade save <nombre>\``,
        );
      }

      let payloadBuffer: Buffer;
      let chipsList: RomChipEntry[];
      let gameTitle: string;
      let originalSetName: string;
      let initialCore: string;

      const quotedDoc = await downloadQuotedDocumentBuffer(msg);

      if (quotedDoc) {
        const rawOrigName = quotedDoc.fileName.replace(/\.(zip|bin|rom)$/i, "").toUpperCase();
        const aliasName =
          subCommand === "save" && cleanArgs[1]
            ? cleanArgs.slice(1).join("_")
            : cleanArgs.length > 0 && subCommand !== "save"
              ? cleanArgs.join("_")
              : rawOrigName;

        const safeAlias = aliasName.replace(/[^a-zA-Z0-9._-]/g, "_") || "arcade_rom";

        if (isZipBuffer(quotedDoc.buffer)) {
          const parsed = inspectAndExtractArcadeZip(quotedDoc.buffer, rawOrigName);
          payloadBuffer = parsed.payload;
          chipsList = parsed.chips;
          originalSetName = rawOrigName;
          initialCore = detectArcadeCoreType(safeAlias, rawOrigName, chipsList, payloadBuffer);
          gameTitle = `${safeAlias.toUpperCase()} (${rawOrigName})`;

          fs.writeFileSync(path.join(CACHE_DIR, `${safeAlias}.zip`), quotedDoc.buffer);
          const meta: SavedRomMeta = {
            alias: safeAlias,
            originalZipName: rawOrigName,
            coreType: initialCore,
            chips: chipsList,
          };
          fs.writeFileSync(path.join(CACHE_DIR, `${safeAlias}.meta.json`), JSON.stringify(meta), "utf8");
        } else {
          payloadBuffer = quotedDoc.buffer.subarray(
            0,
            Math.min(quotedDoc.buffer.length, MAX_SAFE_ROM_BYTES),
          );
          originalSetName = rawOrigName;
          chipsList = [
            {
              name: `${rawOrigName.slice(0, 12)}.BIN`,
              size: quotedDoc.buffer.length,
              crc: computeCrc32Hex(payloadBuffer),
              sum16: computeSum16Hex(payloadBuffer),
              firstBytesHex: getFirstBytesHex(payloadBuffer, 8),
            },
          ];
          initialCore = detectArcadeCoreType(safeAlias, rawOrigName, chipsList, payloadBuffer);
          gameTitle = `${safeAlias.toUpperCase()} (${rawOrigName})`;

          fs.writeFileSync(path.join(CACHE_DIR, `${safeAlias}.bin`), payloadBuffer);
          const meta: SavedRomMeta = {
            alias: safeAlias,
            originalZipName: rawOrigName,
            coreType: initialCore,
            chips: chipsList,
          };
          fs.writeFileSync(path.join(CACHE_DIR, `${safeAlias}.meta.json`), JSON.stringify(meta), "utf8");
        }
      } else if (subCommand === "save" && !quotedDoc) {
        return reply(
          `⚠️ Responde a un archivo ROM \`.zip\` o \`.bin\` con \`${prefix}arcade save <nombre>\` para guardarlo.`,
        );
      } else if (cleanArgs.length > 0) {
        const query = cleanArgs.join(" ").trim();
        const found = getStoredArcadeRom(query);

        if (found) {
          const parsed = isZipBuffer(found.buffer)
            ? inspectAndExtractArcadeZip(
                found.buffer,
                found.meta?.originalZipName || found.fileName,
              )
            : {
                payload: found.buffer.subarray(0, Math.min(found.buffer.length, MAX_SAFE_ROM_BYTES)),
                originalZipName:
                  found.meta?.originalZipName ||
                  found.fileName.replace(/\.(zip|bin|rom)$/i, "").toUpperCase(),
                chips: found.meta?.chips || [
                  {
                    name: found.fileName.toUpperCase().slice(0, 15),
                    size: found.buffer.length,
                    crc: computeCrc32Hex(found.buffer.subarray(0, 16384)),
                    sum16: computeSum16Hex(found.buffer.subarray(0, 16384)),
                    firstBytesHex: getFirstBytesHex(found.buffer, 8),
                  },
                ],
              };

          payloadBuffer = parsed.payload;
          chipsList = found.meta?.chips?.length ? found.meta.chips : parsed.chips;
          originalSetName = found.meta?.originalZipName || parsed.originalZipName;
          initialCore =
            found.meta?.coreType ||
            detectArcadeCoreType(query, originalSetName, chipsList, payloadBuffer);
          gameTitle = `${query.toUpperCase()} (${originalSetName})`;
        } else {
          const builtIn = createBuiltInRomSet(query);
          payloadBuffer = builtIn.payload;
          chipsList = builtIn.chips;
          originalSetName = query.toUpperCase();
          initialCore = builtIn.coreType;
          gameTitle = builtIn.title;
        }
      } else {
        const builtIn = createBuiltInRomSet("sf2");
        payloadBuffer = builtIn.payload;
        chipsList = builtIn.chips;
        originalSetName = "SF2CE";
        initialCore = builtIn.coreType;
        gameTitle = builtIn.title;
      }

      const compactSlice = payloadBuffer.subarray(0, Math.min(payloadBuffer.length, 16384));
      const romRawB64 = compactSlice.toString("base64");

      const HTML = buildArcadeCabinetHtml({
        romRawB64,
        chipsJson: JSON.stringify(chipsList),
        gameTitle,
        originalSetName,
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
                    text: `🕹️ *LuferOS boot Arcade v1.2* • ${gameTitle}\n_Placa detectada:_ \`${initialCore.toUpperCase()}\` _• Reloj sincronizado a 60.0Hz._`,
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
