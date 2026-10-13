import { downloadMediaMessage, type proto } from "@whiskeysockets/baileys";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import WebP from "node-webpmux";
import { fytBold } from "./socketText.ts";
import type {
  ExtendedWASocket,
  UnwrappedMediaMessage,
  IDatabase,
} from "../types/index.d.ts";
import { t } from "../src/langs/index.ts";


const execFileAsync = promisify(execFile);
const STICKER_MAX_SIZE = 1_000_000;
const STICKER_TARGET_SIZE = 950_000;

// ============ UTILIDADES EXISTENTES ============

export function unwrapMediaMessage(
  message: proto.IMessage | UnwrappedMediaMessage | null | undefined,
): UnwrappedMediaMessage | null {
  if (!message) return null;
  const msg = message as UnwrappedMediaMessage;
  if (
    msg.imageMessage ||
    msg.videoMessage ||
    msg.documentMessage ||
    msg.stickerMessage
  )
    return msg;
  if (msg.viewOnceMessageV2?.message)
    return unwrapMediaMessage(
      msg.viewOnceMessageV2.message as UnwrappedMediaMessage,
    );
  if (msg.viewOnceMessage?.message)
    return unwrapMediaMessage(
      msg.viewOnceMessage.message as UnwrappedMediaMessage,
    );
  if (msg.documentWithCaptionMessage?.message)
    return unwrapMediaMessage(
      msg.documentWithCaptionMessage.message as UnwrappedMediaMessage,
    );
  return null;
}

export async function downloadTargetMedia(
  sock: ExtendedWASocket,
  message: proto.IWebMessageInfo,
  quotedMessage: proto.IMessage | null | undefined,
  remoteJid: string,
): Promise<Buffer> {
  const quotedInfo = message.message?.extendedTextMessage?.contextInfo;
  const target = quotedMessage
    ? {
        key: {
          remoteJid: quotedInfo?.remoteJid || remoteJid,
          id: quotedInfo?.stanzaId,
          participant: quotedInfo?.participant,
        },
        message: quotedMessage,
      }
    : message;
  return Buffer.from(
    await downloadMediaMessage(
      target as import("@whiskeysockets/baileys").WAMessage,
      "buffer",
      {},
      {
        logger: console as unknown as Parameters<
          typeof downloadMediaMessage
        >[3]["logger"],
        reuploadRequest: async (
          mediaMessage: import("@whiskeysockets/baileys").WAMessage,
        ) =>
          (sock?.updateMediaMessage?.(mediaMessage) ||
            mediaMessage) as import("@whiskeysockets/baileys").WAMessage,
      },
    ),
  );
}

export function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

/**
 * Detecta si un buffer WebP es animado, revisando el bit de animación del
 * chunk VP8X y/o la presencia de los chunks ANIM/ANMF.
 */
export function isAnimatedWebp(buffer: Buffer): boolean {
  if (!isWebp(buffer)) return false;
  let offset = 12;
  while (offset < buffer.length - 8) {
    const tag = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (tag === "VP8X" && (buffer[offset + 8] & 0x02) !== 0) return true;
    if (tag === "ANIM" || tag === "ANMF") return true;
    offset += 8 + size + (size % 2);
  }
  return false;
}

export async function toSticker(
  input: Buffer,
  animated: boolean,
  maxDuration = 20,
): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("FFmpeg no está disponible.");
  const directory = process.env.TMPDIR || path.resolve("./cache");
  await mkdir(directory, { recursive: true });
  const id = randomUUID();
  const inputPath = path.join(directory, `aura-sticker-${id}.input`);
  const outputPath = path.join(directory, `aura-sticker-${id}.webp`);

  try {
    await writeFile(inputPath, input);

    const attempts = animated
      ? [
          { fps: 30, quality: 60, duration: Math.min(maxDuration, 20) },
          { fps: 25, quality: 30, duration: Math.min(maxDuration, 15) },
          { fps: 25, quality: 25, duration: Math.min(maxDuration, 15) },
          { fps: 20, quality: 20, duration: Math.min(maxDuration, 10) },
          { fps: 15, quality: 10, duration: Math.min(maxDuration, 8) },
        ]
      : [
          { fps: 0, quality: 80, duration: 0 },
          { fps: 0, quality: 60, duration: 0 },
          { fps: 0, quality: 40, duration: 0 },
          { fps: 0, quality: 20, duration: 0 },
        ];

    for (const attempt of attempts) {
      const filter = animated
        ? `format=rgba,scale=512:512:force_original_aspect_ratio=decrease,fps=${attempt.fps},pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x000000@0`
        : "format=rgba,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x000000@0";
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-vf",
        filter,
        "-c:v",
        "libwebp",
        "-an",
        "-q:v",
        String(attempt.quality),
      ];
      if (animated) {
        args.push("-loop", "0", "-t", String(attempt.duration), "-vsync", "0");
      }
      args.push(outputPath);

      await execFileAsync(ffmpegPath, args, { timeout: 120000 });
      const result = await readFile(outputPath);
      if (result.length <= STICKER_TARGET_SIZE) return result;
      await unlink(outputPath).catch(() => undefined);
    }

    throw new Error(
      `El sticker supera el límite máximo de ${STICKER_MAX_SIZE / 1_000_000} MB.`,
    );
  } finally {
    await Promise.all([
      unlink(inputPath).catch(() => undefined),
      unlink(outputPath).catch(() => undefined),
    ]);
  }
}

export async function imageToWebp(
  buffer: Buffer,
  animated = false,
): Promise<Buffer> {
  try {
    if (animated && isAnimatedWebp(buffer)) {
      return await sharp(buffer, { animated: true, limitInputPixels: false })
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80, lossless: false, alphaQuality: 100, loop: 0 })
        .toBuffer();
    }
    return await sharp(
      buffer,
      animated
        ? { animated: true, limitInputPixels: false }
        : { limitInputPixels: false },
    )
      .resize(512, 512, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({
        quality: 80,
        lossless: false,
        alphaQuality: 100,
        loop: animated ? 0 : undefined,
      })
      .toBuffer();
  } catch {
    return await toSticker(buffer, animated);
  }
}

export function extractEmojis(text: string): string[] {
  return text.match(/\p{Extended_Pictographic}/gu) || [];
}

export async function applyStickerMetadata(
  buffer: Buffer,
  db: IDatabase,
  sender: string,
  fallbackAuthor?: string,
): Promise<Buffer> {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new Error("El sticker generado no es un buffer válido.");
  }

  if (!isWebp(buffer)) {
    throw new Error("El archivo generado no es un WebP válido.");
  }

  const user = db?.getUser?.(sender);
  const userData = user?.data;

  const packName = String(
    user?.stickerPackName || userData?.stickerPackName || "Aura Reed",
  ).trim();

  const author = String(
    user?.stickerPackAuthor ||
      userData?.stickerPackAuthor ||
      fallbackAuthor ||
      "Aura Reed",
  ).trim();

  const json = {
    "sticker-pack-id": "com.aurareed.tech.aura",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": author,
    emojis: ["✨"],
  };

  const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");

  const exifHeader = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);

  const exifBuffer = Buffer.concat([exifHeader, jsonBuffer]);
  exifBuffer.writeUInt32LE(jsonBuffer.length, 14);

  const img = new WebP.Image();
  await img.load(buffer);
  img.exif = exifBuffer;
  const result = await img.save(null);

  if (!Buffer.isBuffer(result) || !isWebp(result)) {
    throw new Error(
      "node-webpmux generó un WebP inválido después de aplicar metadata.",
    );
  }

  return result;
}

// ============ EFECTOS Y FORMAS (NUEVO) ============

const SHAPE_ARGS: Record<string, string> = {
  "-c": "circle",
  "-t": "triangle",
  "-s": "star",
  "-r": "roundrect",
  "-h": "hexagon",
  "-d": "diamond",
  "-f": "frame",
  "-b": "border",
  "-w": "wave",
  "-m": "mirror",
  "-o": "octagon",
  "-y": "pentagon",
  "-e": "ellipse",
  "-z": "cross",
  "-v": "heart",
  "-x": "cover",
  "-i": "contain",
};

const EFFECT_ARGS: Record<string, string> = {
  "-blur": "blur",
  "-sepia": "sepia",
  "-sharpen": "sharpen",
  "-brighten": "brighten",
  "-darken": "darken",
  "-invert": "invert",
  "-grayscale": "grayscale",
  "-rotate90": "rotate90",
  "-rotate180": "rotate180",
  "-flip": "flip",
  "-flop": "flop",
  "-normalize": "normalize",
  "-negate": "negate",
  "-tint": "tint",
};

export interface StickerEffect {
  type: "shape" | "effect";
  value: string;
}

export function parseStickerArguments(args: string[]): StickerEffect[] {
  const effects: StickerEffect[] = [];
  for (const arg of args) {
    if (SHAPE_ARGS[arg]) {
      effects.push({ type: "shape", value: SHAPE_ARGS[arg] });
    } else if (EFFECT_ARGS[arg]) {
      effects.push({ type: "effect", value: EFFECT_ARGS[arg] });
    }
  }
  return effects;
}

function buildFFmpegFilters(
  effects: StickerEffect[],
  animated: boolean,
): string {
  const W = 512,
    H = 512;
  const filters: string[] = [];
  const shape = effects.find((e) => e.type === "shape")?.value;
  const effectList = effects
    .filter((e) => e.type === "effect")
    .map((e) => e.value);

  // Escalado base según la forma
  if (shape === "cover") {
    filters.push(
      `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
    );
  } else {
    filters.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x000000@0`);
  }

  filters.push("format=rgba");

  // Aplicar efectos visuales
  for (const effect of effectList) {
    switch (effect) {
      case "blur":
        filters.push("gblur=sigma=5");
        break;
      case "sepia":
        filters.push(
          "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
        );
        break;
      case "sharpen":
        filters.push("unsharp=5:5:1.0:5:5:0.0");
        break;
      case "brighten":
        filters.push("eq=brightness=0.05");
        break;
      case "darken":
        filters.push("eq=brightness=-0.05");
        break;
      case "invert":
      case "negate":
        filters.push("negate");
        break;
      case "grayscale":
        filters.push("hue=s=0");
        break;
      case "rotate90":
        filters.push("transpose=1");
        break;
      case "rotate180":
        filters.push("rotate=PI");
        break;
      case "flip":
        filters.push("hflip");
        break;
      case "flop":
        filters.push("vflip");
        break;
      case "normalize":
        filters.push("normalize");
        break;
      case "tint":
        filters.push("colorchannelmixer=1:0:0:0:0:0.5:0:0:0:0:0.5");
        break;
    }
  }

  if (shape === "mirror") filters.push("hflip");

  // Aplicar máscaras alfa para las formas
  if (
    shape &&
    !["cover", "contain", "mirror", "border", "frame"].includes(shape)
  ) {
    const cx = W / 2,
      cy = H / 2,
      r = Math.min(W, H) / 2;
    let alphaExpr = "";

    switch (shape) {
      case "circle":
        alphaExpr = `if(lte((X-${cx})*(X-${cx})+(Y-${cy})*(Y-${cy}),${r * r}),255,0)`;
        break;
      case "triangle":
        alphaExpr = `if(gte(Y,${H * 0.1})*lte(Y,${H * 0.9})*lte(abs(X-${cx}),((${H * 0.9} - Y) * 0.6)),255,0)`;
        break;
      case "star":
        alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W * 0.25} + ${W * 0.1} * cos(5 * atan2(Y-${cy},X-${cx}))),255,0)`;
        break;
      case "roundrect": {
        const rad = 50;
        alphaExpr = `if(lte(if(gte(X,${rad})*lte(X,${W - rad})*gte(Y,0)*lte(Y,${H}),0,if(gte(Y,${rad})*lte(Y,${H - rad})*gte(X,0)*lte(X,${W}),0,if(lte(X,${rad})*lte(Y,${rad}),(X-${rad})*(X-${rad})+(Y-${rad})*(Y-${rad}),if(gte(X,${W - rad})*lte(Y,${rad}),(X-${W - rad})*(X-${W - rad})+(Y-${rad})*(Y-${rad}),if(lte(X,${rad})*gte(Y,${H - rad}),(X-${rad})*(X-${rad})+(Y-${H - rad})*(Y-${H - rad}),(X-${W - rad})*(X-${W - rad})+(Y-${H - rad})*(Y-${H - rad})))))),${rad * rad}),255,0)`;
        break;
      }
      case "hexagon":
        alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W * 0.4} * cos(PI/6) / cos(mod(atan2(Y-${cy},X-${cx}),PI/3) - PI/6)),255,0)`;
        break;
      case "diamond":
        alphaExpr = `if(lte(abs(X-${cx}) + abs(Y-${cy}),${r}),255,0)`;
        break;
      case "wave":
        alphaExpr = `if(lte(abs(Y-(${cy} + ${H * 0.05} * sin(X * 0.05))),${H * 0.4}),255,0)`;
        break;
      case "octagon":
        alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W * 0.4} * cos(PI/8) / cos(mod(atan2(Y-${cy},X-${cx}),PI/4) - PI/8)),255,0)`;
        break;
      case "pentagon":
        alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W * 0.4} * cos(PI/5) / cos(mod(atan2(Y-${cy},X-${cx}),2*PI/5) - PI/5)),255,0)`;
        break;
      case "ellipse":
        alphaExpr = `if(lte(((X-${cx})*(X-${cx}))/(${W * 0.45 * W * 0.45}) + ((Y-${cy})*(Y-${cy}))/(${H * 0.4 * H * 0.4}),1),255,0)`;
        break;
      case "cross":
        alphaExpr = `if(gt(lte(abs(X-${cx}),${W * 0.15})*lte(abs(Y-${cy}),${H * 0.45}) + lte(abs(Y-${cy}),${H * 0.15})*lte(abs(X-${cx}),${W * 0.45}),0),255,0)`;
        break;
      case "heart":
        alphaExpr = `if(lte(pow((X-${cx})/(${W * 0.3})*(X-${cx})/(${W * 0.3}) + (Y-${cy})/(${H * 0.3})*(Y-${cy})/(${H * 0.3}) - 1, 3) - ((X-${cx})/(${W * 0.3})*(X-${cx})/(${W * 0.3})) * pow((Y-${cy})/(${H * 0.3}), 3), 0), 255, 0)`;
        break;
    }

    if (alphaExpr)
      filters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaExpr}'`);
  }

  if (shape === "border")
    filters.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=white@0.9:t=10`);
  if (shape === "frame")
    filters.push(
      `drawbox=x=15:y=15:w=${W - 30}:h=${H - 30}:color=white@0.7:t=8`,
    );

  filters.push("format=yuva420p");
  return filters.join(",");
}

/**
 * Versión de toSticker que acepta efectos y formas.
 * Si no hay efectos, usa el comportamiento original optimizado.
 */
export async function toStickerWithEffects(
  input: Buffer,
  animated: boolean,
  effects: StickerEffect[] = [],
  maxDuration = 20,
): Promise<Buffer> {
  // Si no hay efectos, usar comportamiento original
  if (effects.length === 0) {
    return await toSticker(input, animated, maxDuration);
  }

  if (!ffmpegPath) throw new Error("FFmpeg no está disponible.");
  const directory = process.env.TMPDIR || path.resolve("./cache");
  await mkdir(directory, { recursive: true });
  const id = randomUUID();
  const inputPath = path.join(directory, `aura-sticker-${id}.input`);
  const outputPath = path.join(directory, `aura-sticker-${id}.webp`);

  try {
    await writeFile(inputPath, input);

    const filter = buildFFmpegFilters(effects, animated);

    const attempts = animated
      ? [
          { fps: 30, quality: 60, duration: Math.min(maxDuration, 20) },
          { fps: 25, quality: 40, duration: Math.min(maxDuration, 15) },
          { fps: 20, quality: 30, duration: Math.min(maxDuration, 10) },
          { fps: 15, quality: 20, duration: Math.min(maxDuration, 8) },
        ]
      : [
          { fps: 0, quality: 80, duration: 0 },
          { fps: 0, quality: 60, duration: 0 },
          { fps: 0, quality: 40, duration: 0 },
        ];

    for (const attempt of attempts) {
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-vf",
        filter,
        "-c:v",
        animated ? "libwebp_anim" : "libwebp",
        "-an",
        "-q:v",
        String(attempt.quality),
      ];
      if (animated) {
        args.push("-loop", "0", "-t", String(attempt.duration), "-vsync", "0");
      }
      args.push(outputPath);

      await execFileAsync(ffmpegPath, args, { timeout: 120000 });
      const result = await readFile(outputPath);
      if (result.length <= STICKER_TARGET_SIZE) return result;
      await unlink(outputPath).catch(() => undefined);
    }

    throw new Error(
      `El sticker supera el límite máximo de ${STICKER_MAX_SIZE / 1_000_000} MB.`,
    );
  } finally {
    await Promise.all([
      unlink(inputPath).catch(() => undefined),
      unlink(outputPath).catch(() => undefined),
    ]);
  }
}

export function generateStickerHelp(prefix: string): string {
  return (
    `╭━━〔 🎨 ${fytBold(t("core_sticker_8ea21826"))} 〕━━⬣\n` +
    `┃\n` +
    `┃ 🔷 ${fytBold(t("core_formas_10bc2582"))}\n` +
    `┃ -c círculo | -v corazón | -s estrella\n` +
    `┃ -h hexágono | -d diamante | -t triángulo\n` +
    `┃ -o octágono | -y pentágono | -e elipse\n` +
    `┃ -z cruz | -w onda | -r redondeado\n` +
    `┃ -b borde | -f marco | -m espejo\n` +
    `┃ -x cover | -i contain\n` +
    `┃\n` +
    `┃ ✨ ${fytBold(t("core_efectos_4bd57fbe"))}\n` +
    `┃ -blur | -sepia | -sharpen | -grayscale\n` +
    `┃ -invert | -negate | -tint | -normalize\n` +
    `┃ -brighten | -darken | -rotate90 | -rotate180\n` +
    `┃ -flip | -flop\n` +
    `┃\n` +
    `┃ 💡 ${fytBold(t("core_ejemplos_bfb84ce8"))}\n` +
    `┃ ➪ ${prefix}s -c -blur\n` +
    `┃ ➪ ${prefix}s -v -sepia\n` +
    `┃\n` +
    `╰━━〔 ⚡ ${fytBold(t("core_aura_reed_95dcfb15"))} ⚡ 〕━━⬣`
  );
}
