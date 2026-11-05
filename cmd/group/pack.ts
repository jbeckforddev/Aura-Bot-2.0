import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { downloadContentFromMessage } from "baileys";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

const execFileAsync = promisify(execFile);

const OWNER_PROFILE = {
  displayName: "luisfernandoguzmannino",
  username: "luisfernandoguzmann",
  badge: "✓ PLUS",
  defaultPacks: ["Mis pegatinas", "ANYA"],
};

interface StickerLyItem {
  fileName: string;
  isAnimated: boolean;
  imageUrl: string;
  emojis: string[];
}

interface StickerLyPack {
  packId: string;
  name: string;
  authorName: string;
  authorUsername: string;
  isVerified: boolean;
  isPlus: boolean;
  isAnimated: boolean;
  viewCount: number;
  exportCount: number;
  trayUrl: string;
  shareUrl: string;
  resourceUrlPrefix: string;
  stickers: StickerLyItem[];
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoreZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const dataBuf = file.data;
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, dataBuf);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function buildExifBuffer(packId: string, packName: string, publisher: string, emojis: string[] = ["✨"]): Buffer {
  const jsonPayload = JSON.stringify({
    "sticker-pack-id": packId,
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": `https://sticker.ly/s/${packId}`,
    "ios-app-store-link": `https://sticker.ly/s/${packId}`,
    emojis,
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
  if (webpBuffer.length < 16 || webpBuffer.toString("ascii", 0, 4) !== "RIFF" || webpBuffer.toString("ascii", 8, 12) !== "WEBP") {
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

async function convertBufferToWebpSticker(
  inputBuffer: Buffer,
  packId: string,
  packName: string,
  publisher: string,
  asTrayPng = false
): Promise<Buffer> {
  const id = crypto.randomBytes(6).toString("hex");
  const tmpIn = path.join(os.tmpdir(), `stk_in_${id}`);
  const tmpOut = path.join(os.tmpdir(), `stk_out_${id}.${asTrayPng ? "png" : "webp"}`);

  try {
    fs.writeFileSync(tmpIn, inputBuffer);

    if (asTrayPng) {
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-i",
          tmpIn,
          "-vframes",
          "1",
          "-vf",
          "scale=252:252:force_original_aspect_ratio=decrease,pad=252:252:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
          tmpOut,
        ],
        { timeout: 15000 }
      );
      return fs.readFileSync(tmpOut);
    }

    const isAlreadyWebp =
      inputBuffer.length > 16 &&
      inputBuffer.toString("ascii", 0, 4) === "RIFF" &&
      inputBuffer.toString("ascii", 8, 12) === "WEBP";

    let rawWebp: Buffer;
    if (isAlreadyWebp && inputBuffer.length < 450 * 1024) {
      rawWebp = inputBuffer;
    } else {
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
          "-preset",
          "default",
          "-an",
          "-vsync",
          "0",
          tmpOut,
        ],
        { timeout: 20000 }
      );
      rawWebp = fs.readFileSync(tmpOut);
    }

    const exif = buildExifBuffer(packId, packName, publisher);
    return attachExifToWebp(rawWebp, exif);
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

async function fetchBufferWithTimeout(url: string, timeoutMs = 8000): Promise<Buffer | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "androidapp.stickerly/2.18.0 (SM-A566B; U; Android 16; es-CO; co;)",
        Accept: "*/*",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeStickerLyPack(raw: any): StickerLyPack | null {
  if (!raw || typeof raw !== "object") return null;
  const packId = String(raw.packId || raw.id || raw.code || "").trim();
  if (!packId) return null;

  const resourceUrlPrefix = String(
    raw.resourceUrlPrefix ||
      raw.resourceUrl ||
      `https://stickerly.pstatic.net/sticker_pack/${packId}/`
  );

  const rawFiles: any[] = Array.isArray(raw.stickers)
    ? raw.stickers
    : Array.isArray(raw.resourceFiles)
    ? raw.resourceFiles
    : [];

  const stickers: StickerLyItem[] = rawFiles
    .map((item: any) => {
      if (typeof item === "string") {
        const fullUrl = item.startsWith("http")
          ? item
          : `${resourceUrlPrefix.replace(/\/?$/, "/")}${item}`;
        return {
          fileName: item,
          isAnimated: Boolean(raw.isAnimated || raw.animated),
          imageUrl: fullUrl,
          emojis: ["✨"],
        };
      }
      const fName = String(item?.fileName || item?.url || item?.resourceUrl || "");
      if (!fName) return null;
      const fullUrl = fName.startsWith("http")
        ? fName
        : `${resourceUrlPrefix.replace(/\/?$/, "/")}${fName}`;
      return {
        fileName: fName,
        isAnimated: Boolean(item?.isAnimated ?? raw.isAnimated),
        imageUrl: fullUrl,
        emojis: Array.isArray(item?.emojis) && item.emojis.length ? item.emojis : ["✨"],
      };
    })
    .filter((x): x is StickerLyItem => Boolean(x));

  const trayFile = String(raw.trayIconUrl || raw.trayImageFile || raw.thumbUrl || "");
  const trayUrl = trayFile.startsWith("http")
    ? trayFile
    : trayFile
    ? `${resourceUrlPrefix.replace(/\/?$/, "/")}${trayFile}`
    : stickers[0]?.imageUrl || "";

  const authorRaw = String(raw.authorName || raw.user?.displayName || raw.user?.userName || OWNER_PROFILE.displayName);
  const userRaw = String(raw.user?.userName || raw.authorId || OWNER_PROFILE.username);
  const isOwnerMatch =
    authorRaw.toLowerCase().includes("luisfernandoguzman") ||
    userRaw.toLowerCase().includes("luisfernandoguzman");

  return {
    packId,
    name: String(raw.name || raw.title || `Pack ${packId}`),
    authorName: isOwnerMatch ? OWNER_PROFILE.displayName : authorRaw,
    authorUsername: isOwnerMatch ? OWNER_PROFILE.username : userRaw,
    isVerified: Boolean(isOwnerMatch || raw.isVerified || raw.user?.isVerified || raw.isOfficial),
    isPlus: Boolean(isOwnerMatch || raw.isPlus || raw.isPaid || raw.user?.isPlus || true),
    isAnimated: Boolean(raw.isAnimated || raw.animated),
    viewCount: Number(raw.viewCount || raw.exposeCount || 0),
    exportCount: Number(raw.exportCount || raw.downloadCount || 0),
    trayUrl,
    shareUrl: String(raw.shareUrl || `https://sticker.ly/s/${packId}`),
    resourceUrlPrefix,
    stickers,
  };
}

async function fetchStickerLyPackDetails(packId: string): Promise<StickerLyPack | null> {
  const cleanCode = packId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!cleanCode) return null;

  const endpoints = [
    `https://api.sticker.ly/v4/stickerPack/${cleanCode}?needRelation=true`,
    `http://api.sticker.ly/v3.1/stickerPack/${cleanCode}`,
  ];

  for (const ep of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(ep, {
        headers: {
          "User-Agent": "androidapp.stickerly/2.18.0 (SM-A566B; U; Android 16; es-CO; co;)",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = (await res.json()) as any;
      const packObj = json?.result?.stickerPack || json?.result || json?.data;
      const normalized = normalizeStickerLyPack(packObj);
      if (normalized && normalized.stickers.length > 0) {
        return normalized;
      }
    } catch {
      clearTimeout(timer);
    }
  }
  return null;
}

async function searchStickerLyPacks(query: string, limit = 3): Promise<StickerLyPack[]> {
  const results: StickerLyPack[] = [];
  const seenIds = new Set<string>();

  const directCodeMatch = query.match(/(?:sticker\.ly\/s\/|^\[?)([A-Z0-9]{6})(?:\]?$)/i);
  if (directCodeMatch && directCodeMatch[1]) {
    const directPack = await fetchStickerLyPackDetails(directCodeMatch[1]);
    if (directPack) {
      results.push(directPack);
      seenIds.add(directPack.packId);
    }
  }

  const searchQueries = [query.trim()];
  if (
    query.toLowerCase().includes("perfil") ||
    query.toLowerCase().includes("mio") ||
    query.toLowerCase().includes("plus") ||
    query.toLowerCase().includes("lufer")
  ) {
    searchQueries.unshift(OWNER_PROFILE.displayName, OWNER_PROFILE.username, "ANYA");
  }

  for (const q of searchQueries) {
    if (results.length >= limit) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch("https://api.sticker.ly/v4/stickerPack/smartSearch", {
        method: "POST",
        headers: {
          "User-Agent": "androidapp.stickerly/2.18.0 (SM-A566B; U; Android 16; es-CO; co;)",
          "Content-Type": "application/json",
          Host: "api.sticker.ly",
        },
        body: JSON.stringify({
          keyword: q,
          enabledKeywordSearch: true,
          filter: {
            extendSearchResult: true,
            sort: "POPULAR",
            animated: null,
            nsfw: false,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as any;
        const rawList: any[] =
          data?.result?.stickerPacks ||
          data?.result?.packs ||
          (Array.isArray(data?.result) ? data.result : []);

        for (const rawPack of rawList) {
          if (results.length >= limit) break;
          let pack = normalizeStickerLyPack(rawPack);
          if (!pack || seenIds.has(pack.packId)) continue;

          if (pack.stickers.length < 4) {
            const hydrated = await fetchStickerLyPackDetails(pack.packId);
            if (hydrated && hydrated.stickers.length > 0) {
              pack = hydrated;
            }
          }

          if (pack.stickers.length > 0) {
            seenIds.add(pack.packId);
            results.push(pack);
          }
        }
      }
    } catch {
      clearTimeout(timer);
    }
  }

  return results.slice(0, limit);
}

async function dispatchWhatsAppStickerPack(
  sock: any,
  jid: string,
  quotedMsg: any,
  pack: StickerLyPack,
  webpBuffers: Buffer[],
  trayPngBuffer: Buffer
): Promise<boolean> {
  const formattedTitle = `${pack.name} [${pack.packId}]`;
  const publisherLabel = `${pack.authorName} (${OWNER_PROFILE.displayName} ${OWNER_PROFILE.badge})`;

  if (typeof sock.sendStickerPack === "function") {
    try {
      await sock.sendStickerPack(
        jid,
        {
          name: formattedTitle,
          publisher: publisherLabel,
          cover: trayPngBuffer,
          stickers: webpBuffers,
        },
        { quoted: quotedMsg }
      );
      return true;
    } catch {}
  }

  try {
    const bMod: any = await import("baileys").catch(() => null);
    if (bMod && typeof bMod.waUploadToServer === "function" && typeof sock.relayMessage === "function") {
      const zipEntries: Array<{ name: string; data: Buffer }> = [];
      const protoStickers: any[] = [];

      const trayFileName = `${pack.packId}.png`;
      zipEntries.push({ name: trayFileName, data: trayPngBuffer });

      for (let i = 0; i < webpBuffers.length; i++) {
        const sBuf = webpBuffers[i];
        const shaHex = crypto.createHash("sha256").update(sBuf).digest("base64").replace(/\//g, "_").replace(/\+/g, "-");
        const fName = `${shaHex}.webp`;
        zipEntries.push({ name: fName, data: sBuf });
        protoStickers.push({
          fileName: fName,
          isAnimated: Boolean(pack.stickers[i]?.isAnimated),
          emojis: pack.stickers[i]?.emojis || ["✨"],
          accessibilityLabel: pack.name,
          isLottie: false,
          mimetype: "image/webp",
        });
      }

      const zipBuf = createStoreZip(zipEntries);

      if (typeof bMod.getEncryptedStream === "function" || typeof bMod.encryptedStream === "function") {
        const encFn = bMod.getEncryptedStream || bMod.encryptedStream;
        const [packEnc, thumbEnc] = await Promise.all([
          encFn(zipBuf, "sticker-pack"),
          encFn(trayPngBuffer, "sticker-pack"),
        ]);

        const uploadFn = sock.waUploadToServer || bMod.waUploadToServer;
        if (typeof uploadFn === "function") {
          const [packUp, thumbUp] = await Promise.all([
            uploadFn(packEnc.encFilePath, { mediaType: "sticker-pack", fileEncSha256B64: packEnc.fileEncSha256.toString("base64") }),
            uploadFn(thumbEnc.encFilePath, { mediaType: "sticker-pack", fileEncSha256B64: thumbEnc.fileEncSha256.toString("base64") }),
          ]);

          const stickerPackMessage = {
            stickerPackId: pack.packId,
            name: formattedTitle,
            publisher: publisherLabel,
            stickers: protoStickers,
            fileLength: zipBuf.length,
            fileSha256: packEnc.fileSha256,
            fileEncSha256: packEnc.fileEncSha256,
            mediaKey: packEnc.mediaKey,
            directPath: packUp.directPath,
            packDescription: `Sticker.ly PLUS • ${OWNER_PROFILE.displayName}`,
            mediaKeyTimestamp: Math.floor(Date.now() / 1000),
            trayIconFileName: trayFileName,
            thumbnailDirectPath: thumbUp.directPath,
            thumbnailSha256: thumbEnc.fileSha256,
            thumbnailEncSha256: thumbEnc.fileEncSha256,
            thumbnailHeight: 252,
            thumbnailWidth: 252,
            imageDataHash: crypto.createHash("sha256").update(trayPngBuffer).digest("hex"),
            stickerPackSize: zipBuf.reduce((acc) => acc, zipBuf.length),
            stickerPackOrigin: 1,
          };

          await sock.relayMessage(jid, { stickerPackMessage }, {});
          return true;
        }
      }
    }
  } catch {}

  return false;
}

async function extractQuotedOrAttachedImage(msg: any): Promise<Buffer | null> {
  const root =
    msg?.message?.ephemeralMessage?.message ||
    msg?.message?.viewOnceMessage?.message ||
    msg?.message?.viewOnceMessageV2?.message ||
    msg?.message;

  if (!root) return null;

  let imgNode = root.imageMessage || null;
  if (!imgNode) {
    const ctxInfo =
      root.extendedTextMessage?.contextInfo ||
      root.imageMessage?.contextInfo ||
      root.videoMessage?.contextInfo ||
      null;
    const quoted = ctxInfo?.quotedMessage;
    if (quoted?.imageMessage) {
      imgNode = quoted.imageMessage;
    }
  }

  if (!imgNode) return null;

  try {
    const stream = await downloadContentFromMessage(imgNode, "image");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

async function generateAiStickerPackBuffers(
  prompt: string,
  packId: string,
  packTitle: string,
  publisher: string,
  count = 6
): Promise<{ webpList: Buffer[]; coverBuffer: Buffer | null }> {
  const variations = [
    `${prompt}, expressive happy pose, die-cut sticker style, thick white outline, isolated on solid dark background, vibrant vector art, high quality`,
    `${prompt}, laughing funny expression, die-cut sticker style, thick white border, isolated, 4k illustration`,
    `${prompt}, cool confident pose with sunglasses, die-cut sticker style, vector art, no watermark`,
    `${prompt}, shocked surprised expression, die-cut sticker style, expressive anime/cartoon sticker art`,
    `${prompt}, angry dramatic fire aura, die-cut sticker style, bold clean lines, isolated sticker`,
    `${prompt}, thumbs up celebration pose, die-cut sticker style, ultra detailed HD sticker`,
  ].slice(0, count);

  const rawBuffers = await Promise.all(
    variations.map(async (vPrompt, idx) => {
      const seed = Math.floor(10000 + Math.random() * 900000) + idx;
      const encoded = encodeURIComponent(vPrompt);
      const urls = [
        `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&seed=${seed}&nologo=true&model=flux`,
        `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&seed=${seed}&nologo=true`,
      ];
      for (const u of urls) {
        const b = await fetchBufferWithTimeout(u, 14000);
        if (b && b.length > 1024) return b;
      }
      return null;
    })
  );

  const validRaw = rawBuffers.filter((b): b is Buffer => Boolean(b));
  const webpList: Buffer[] = [];

  for (const rBuf of validRaw) {
    const webp = await convertBufferToWebpSticker(rBuf, packId, packTitle, publisher, false);
    if (webp && webp.length > 0) {
      webpList.push(webp);
    }
  }

  let coverBuffer: Buffer | null = null;
  if (validRaw[0]) {
    coverBuffer = await convertBufferToWebpSticker(validRaw[0], packId, packTitle, publisher, true);
  }

  return { webpList, coverBuffer };
}

export default {
  name: ["pack", "packs", "stickerly", "packia", "iapack", "creapack"],
  category: "group",
  description: "Busca y envía 3 paquetes de stickers desde Sticker.ly PLUS o genera paquetes nuevos con IA.",
  groupOnly: false,
  ownerOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, sock, msg, from, args } = ctx;

    const rawBody =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      "";

    const invokedCmd = String((ctx as any).cmdName || rawBody.trim().split(/\s+/)[0] || "")
      .replace(/^[.#/!]/, "")
      .toLowerCase();

    const isAiMode =
      invokedCmd === "packia" ||
      invokedCmd === "iapack" ||
      invokedCmd === "creapack" ||
      String(args[0] || "").toLowerCase() === "ia";

    const cleanQuery = (
      String(args[0] || "").toLowerCase() === "ia" ? args.slice(1).join(" ") : args.join(" ")
    ).trim();

    if (isAiMode) {
      const attachedImg = await extractQuotedOrAttachedImage(msg);
      if (!cleanQuery && !attachedImg) {
        return reply(
          `✨ *${fytBold("STICKER.LY PLUS // CREA CON IA")}* ✨\n\n` +
            `Describe qué paquete deseas crear o responde a una foto con tu idea.\n\n` +
            `📌 *Ejemplos:*\n` +
            `• \`.packIA gato hacker estilo cyberpunk\`\n` +
            `• \`.packIA anime bakugo explosivo\`\n` +
            `• \`.packIA soldado táctico chibi\``
        );
      }

      await react("🪄").catch(() => undefined);

      const packCode = crypto.randomBytes(3).toString("hex").toUpperCase();
      const promptText = cleanQuery || "personaje estilo sticker expresivo HD";
      const packTitle = `✨ ${promptText.slice(0, 22)} [${packCode}]`;
      const publisher = `${OWNER_PROFILE.displayName} ${OWNER_PROFILE.badge}`;

      await reply(
        `🪄 *${fytBold("CREANDO PACK CON IA (MODO PLUS)")}*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 *Perfil PLUS:* \`${OWNER_PROFILE.displayName}\` ${OWNER_PROFILE.badge}\n` +
          `🎨 *Prompt:* ${promptText}\n` +
          `🆔 *Código Pack:* \`[${packCode}]\`\n` +
          `⏳ *Generando stickers en alta resolución sin marca de agua...*`
      );

      const { webpList, coverBuffer } = await generateAiStickerPackBuffers(
        promptText,
        packCode,
        packTitle,
        publisher,
        6
      );

      if (attachedImg) {
        const editedFromPhoto = await convertBufferToWebpSticker(
          attachedImg,
          packCode,
          packTitle,
          publisher,
          false
        );
        if (editedFromPhoto) {
          webpList.unshift(editedFromPhoto);
        }
      }

      if (webpList.length === 0) {
        await react("❌").catch(() => undefined);
        return reply("❌ No se pudieron generar los stickers con IA en este momento. Intenta con otra descripción.");
      }

      const aiPackObj: StickerLyPack = {
        packId: packCode,
        name: promptText.slice(0, 24),
        authorName: OWNER_PROFILE.displayName,
        authorUsername: OWNER_PROFILE.username,
        isVerified: true,
        isPlus: true,
        isAnimated: false,
        viewCount: 1,
        exportCount: 1,
        trayUrl: "",
        shareUrl: `https://sticker.ly/s/${packCode}`,
        resourceUrlPrefix: "",
        stickers: webpList.map((_, i) => ({
          fileName: `ai_${i}.webp`,
          isAnimated: false,
          imageUrl: "",
          emojis: ["✨", "🔥"],
        })),
      };

      const sentAsNativePack =
        coverBuffer &&
        (await dispatchWhatsAppStickerPack(sock, from, msg, aiPackObj, webpList, coverBuffer));

      if (!sentAsNativePack) {
        for (const webp of webpList) {
          await sock.sendMessage(from, { sticker: webp }, { quoted: msg as any });
        }
      }

      await react("✅").catch(() => undefined);
      return;
    }

    const searchKeyword = cleanQuery || OWNER_PROFILE.displayName;
    await react("🔎").catch(() => undefined);

    let packs = await searchStickerLyPacks(searchKeyword, 3);
    if (packs.length === 0 && cleanQuery) {
      packs = await searchStickerLyPacks(`${cleanQuery} anime`, 3);
    }

    if (packs.length === 0) {
      await react("❌").catch(() => undefined);
      return reply(
        `❌ *No se encontraron paquetes para:* \`${searchKeyword}\`\n\n` +
          `💡 Usa \`.packIA ${searchKeyword}\` para generar un paquete nuevo con Inteligencia Artificial desde tu cuenta PLUS.`
      );
    }

    const summaryLines: string[] = [
      `👑 *${fytBold("STICKER.LY PLUS // BUSCADOR INTELIGENTE")}* 👑`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Cuenta Vinculada:* \`${OWNER_PROFILE.displayName}\` ${OWNER_PROFILE.badge}`,
      `🆔 *Usuario:* \`@${OWNER_PROFILE.username}\``,
      `🔎 *Búsqueda:* \`${searchKeyword}\``,
      `📦 *Paquetes encontrados:* \`${packs.length} relacionados\``,
      ``,
    ];

    packs.forEach((p, idx) => {
      summaryLines.push(
        `╭─〔 📦 *PACK #${idx + 1}: ${p.name}* \`[${p.packId}]\` 〕`,
        `┃ 👤 *Autor:* ${p.authorName} ${p.isVerified ? "☑️" : ""} ${p.isPlus ? "👑 PLUS" : ""}`,
        `┃ 🏷️ *Stickers:* \`${p.stickers.length}\` (${p.isAnimated ? "Animados ✨" : "Estáticos HD"})`,
        `┃ 👁️ *Vistas:* \`${p.viewCount.toLocaleString("es-CO")}\` | 📥 *Descargas:* \`${p.exportCount.toLocaleString("es-CO")}\``,
        `┃ 🔗 *Enlace:* ${p.shareUrl}`,
        `╰─────────────────────`
      );
    });

    const firstTrayBuf = await fetchBufferWithTimeout(packs[0].trayUrl || packs[0].stickers[0]?.imageUrl);
    if (firstTrayBuf) {
      await sock
        .sendMessage(
          from,
          {
            image: firstTrayBuf,
            caption: summaryLines.join("\n"),
          },
          { quoted: msg as any }
        )
        .catch(() => reply(summaryLines.join("\n")));
    } else {
      await reply(summaryLines.join("\n"));
    }

    for (let i = 0; i < packs.length; i++) {
      const pack = packs[i];
      const maxStickersPerPack = Math.min(pack.stickers.length, 8);
      const selectedItems = pack.stickers.slice(0, maxStickersPerPack);

      const downloadedBuffers = await Promise.all(
        selectedItems.map((item) => fetchBufferWithTimeout(item.imageUrl, 8000))
      );

      const validInputs = downloadedBuffers.filter((b): b is Buffer => Boolean(b && b.length > 0));
      if (validInputs.length === 0) continue;

      const publisherTag = `${pack.authorName} • ${OWNER_PROFILE.displayName} ${OWNER_PROFILE.badge}`;
      const packHeaderName = `${pack.name} [${pack.packId}]`;

      const webpStickers = await Promise.all(
        validInputs.map((buf) =>
          convertBufferToWebpSticker(buf, pack.packId, packHeaderName, publisherTag, false)
        )
      );

      const traySource = (await fetchBufferWithTimeout(pack.trayUrl, 5000)) || validInputs[0];
      const trayPng = await convertBufferToWebpSticker(
        traySource,
        pack.packId,
        packHeaderName,
        publisherTag,
        true
      );

      const dispatchedNative = await dispatchWhatsAppStickerPack(
        sock,
        from,
        msg,
        pack,
        webpStickers,
        trayPng
      );

      if (!dispatchedNative) {
        await sock.sendMessage(
          from,
          {
            text: `📦 *${fytBold(`PACK #${i + 1}: ${pack.name}`)}* \`[${pack.packId}]\`\n🔗 ${pack.shareUrl}`,
          },
          { quoted: msg as any }
        );

        for (const stkBuf of webpStickers.slice(0, 4)) {
          await sock.sendMessage(from, { sticker: stkBuf }, { quoted: msg as any });
        }
      }
    }

    await react("✅").catch(() => undefined);
  },
};
