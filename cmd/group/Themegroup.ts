import type { WAMessage, proto as ProtoType } from "baileys";
import {
  areJidsSameUser,
  downloadMediaMessage,
  generateWAMessageFromContent,
  normalizeMessageContent,
  prepareWAMessageMedia,
  proto,
} from "baileys";
import type { CommandContext } from "../../types/commands.d.ts";
import { fytBold } from "../../core/socketText.ts";

const COLORES: Record<string, string> = {
  rojo: "#F44336",
  red: "#F44336",
  azul: "#2196F3",
  blue: "#2196F3",
  azuloscuro: "#0D47A1",
  celeste: "#03A9F4",
  cian: "#00BCD4",
  cyan: "#00BCD4",
  turquesa: "#009688",
  verde: "#25D366",
  green: "#25D366",
  verdeoscuro: "#1B5E20",
  morado: "#9C27B0",
  purple: "#9C27B0",
  violeta: "#673AB7",
  indigo: "#3F51B5",
  rosa: "#E91E63",
  pink: "#E91E63",
  naranja: "#FF5722",
  orange: "#FF5722",
  amarillo: "#FFC107",
  yellow: "#FFC107",
  dorado: "#FFB300",
  vino: "#880E4F",
  cafe: "#795548",
  gris: "#607D8B",
  negro: "#121212",
  black: "#121212",
  blanco: "#FFFFFF",
  white: "#FFFFFF",
};

const RANDOM_HEX = Object.values(COLORES);

const TEMAS_TONALES: Record<string, string> = {
  azul: "Royal-Blue@Tonal",
  "royal-blue": "Royal-Blue@Tonal",
  royalblue: "Royal-Blue@Tonal",
  rojo: "Crimson@Tonal",
  crimson: "Crimson@Tonal",
  verde: "Emerald@Tonal",
  emerald: "Emerald@Tonal",
  morado: "Violet@Tonal",
  violet: "Violet@Tonal",
  rosa: "Rose@Tonal",
  rose: "Rose@Tonal",
  naranja: "Sunset@Tonal",
  sunset: "Sunset@Tonal",
  negro: "Graphite@Tonal",
  graphite: "Graphite@Tonal",
};

function resolveHexColor(token: string): string | null {
  const clean = token
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!clean) return null;
  if (clean === "random" || clean === "aleatorio") {
    return RANDOM_HEX[Math.floor(Math.random() * RANDOM_HEX.length)];
  }
  if (COLORES[clean]) return COLORES[clean];

  const m = clean.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) {
    hex = [...hex].map((c) => `${c}${c}`).join("");
  }
  return `#${hex.toUpperCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const offset = clean.length === 8 ? 2 : 0;
  return [
    parseInt(clean.slice(offset, offset + 2), 16),
    parseInt(clean.slice(offset + 2, offset + 4), 16),
    parseInt(clean.slice(offset + 4, offset + 6), 16),
  ];
}

function shiftHex(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const clamp = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r * factor)}${clamp(g * factor)}${clamp(b * factor)}`.toUpperCase();
}

function normalizeColorScheme(raw: string): string {
  const trimmed = raw.trim();
  const baseKey = trimmed.replace(/@.*$/, "").toLowerCase();
  const mapped = TEMAS_TONALES[baseKey];
  if (mapped) return mapped;
  return trimmed.includes("@") ? trimmed : `${trimmed}@Tonal`;
}

function extractContextInfo(message: ProtoType.IMessage | null | undefined) {
  if (!message) return undefined;
  return (
    message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo ||
    message.documentMessage?.contextInfo ||
    undefined
  );
}

function isParticipantSelf(
  participant: string | null | undefined,
  sock: CommandContext["sock"],
): boolean {
  if (!participant) return false;
  const botId = sock.user?.id;
  const botLid = (sock.user as { lid?: string } | undefined)?.lid;
  return Boolean(
    (botId && areJidsSameUser(participant, botId)) ||
      (botLid && areJidsSameUser(participant, botLid)),
  );
}

function extractTargetImage(
  msg: WAMessage,
  remoteJid: string,
  sock: CommandContext["sock"],
): WAMessage | null {
  const current = normalizeMessageContent(msg.message);
  if (current?.imageMessage) {
    return msg;
  }

  const quotedCtx = extractContextInfo(current);
  const quotedMsg = normalizeMessageContent(quotedCtx?.quotedMessage);
  if (quotedMsg?.imageMessage && quotedCtx?.stanzaId) {
    return {
      key: {
        remoteJid: quotedCtx.remoteJid || remoteJid,
        id: quotedCtx.stanzaId,
        participant: quotedCtx.participant || undefined,
        fromMe: isParticipantSelf(quotedCtx.participant, sock),
      },
      message: quotedMsg,
    } as unknown as WAMessage;
  }

  return null;
}

function getChatThemeProtoCtor(): any {
  const p = proto as any;
  return (
    p?.Message?.ChatThemeSetting ||
    p?.ChatThemeSetting ||
    p?.Message?.ProtocolMessage?.ChatThemeSetting ||
    null
  );
}

function getProtoKeys(ctor: any): string[] {
  if (!ctor) return [];
  const keys = new Set<string>();
  try {
    if (ctor.prototype) {
      for (const k of Object.keys(ctor.prototype)) {
        if (k !== "toJSON" && !k.startsWith("$")) keys.add(k);
      }
    }
    if (typeof ctor.create === "function") {
      const sample = ctor.create();
      for (const k of Object.keys(sample || {})) {
        keys.add(k);
      }
    }
  } catch {}
  return Array.from(keys);
}

function inspectEncodeSchema(ctor: any): string[] {
  if (!ctor || typeof ctor.encode !== "function") return [];
  const src = String(ctor.encode);
  const results: string[] = [];
  const blockRegex =
    /message\.([a-zA-Z0-9_]+)\s*!=\s*null[\s\S]{0,220}?(?:writer\.uint32\(\d+\)\.([a-zA-Z0-9_]+)\(|([a-zA-Z0-9_$.]+)\.encode\()/g;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((match = blockRegex.exec(src)) !== null) {
    const field = match[1];
    const kind = match[2] || match[3] || "unknown";
    const entry = `${field}: ${kind.replace(/^\$root\.proto\./, "")}`;
    if (!seen.has(field)) {
      seen.add(field);
      results.push(entry);
    }
  }
  return results;
}

function collectThemeSchemas(): string {
  const p = proto as any;
  const lines: string[] = [];
  const namespaces: Array<[string, any]> = [
    ["proto", p],
    ["proto.Message", p?.Message],
    ["proto.Message.ProtocolMessage", p?.Message?.ProtocolMessage],
  ];

  const visited = new Set<any>();

  for (const [nsName, ns] of namespaces) {
    if (!ns) continue;
    for (const key of Object.keys(ns)) {
      if (!/theme|wallpaper/i.test(key)) continue;
      const ctor = ns[key];
      if (!ctor || visited.has(ctor)) continue;
      visited.add(ctor);
      const schema = inspectEncodeSchema(ctor);
      const fallbackKeys = getProtoKeys(ctor);
      lines.push(
        `*${nsName}.${key}*:\n${schema.length ? schema.map((s) => `  - ${s}`).join("\n") : `  - ${fallbackKeys.join(", ") || "sin campos"}`}`,
      );
    }
  }

  return lines.join("\n\n") || "No se encontraron definiciones de Theme/Wallpaper.";
}

function detectCustomImageField(themeKeys: string[]): string {
  const candidates = [
    "userImage",
    "customImage",
    "customWallpaper",
    "imageWallpaper",
    "photoWallpaper",
    "mediaWallpaper",
    "imageMessage",
    "wallpaperImage",
  ];
  for (const name of candidates) {
    if (themeKeys.includes(name)) return name;
  }
  const fuzzy = themeKeys.find((k) => /image|photo|custom|user|media/i.test(k) && !/stock/i.test(k));
  return fuzzy || "userImage";
}

function assertThemeProtoSupported(protocolMessage: Record<string, any>) {
  const p = proto as any;
  const protoMsgCtor = p?.Message?.ProtocolMessage;
  if (!protoMsgCtor || typeof protoMsgCtor.encode !== "function") {
    throw new Error("No se encontró proto.Message.ProtocolMessage en tu versión de Baileys.");
  }

  const encoded = protoMsgCtor.encode(protoMsgCtor.create(protocolMessage)).finish();
  if (encoded.length <= 4) {
    throw new Error(
      "Tu WAProto actual no serializó chatThemeSetting (ProtocolMessage tipo 34).",
    );
  }
}

async function relayChatTheme(
  sock: CommandContext["sock"],
  jid: string,
  chatThemeSetting: Record<string, any>,
) {
  const p = proto as any;
  const typeEnum = p?.Message?.ProtocolMessage?.Type?.CHAT_THEME_SETTING ?? 34;

  const protocolMessage: Record<string, any> = {
    type: typeEnum,
    chatThemeSetting,
  };

  assertThemeProtoSupported(protocolMessage);

  const waMessage = generateWAMessageFromContent(
    jid,
    {
      protocolMessage,
    } as any,
    {
      userJid: sock.user?.id,
    },
  );

  await sock.relayMessage(jid, waMessage.message!, {
    messageId: waMessage.key.id!,
  });
}

const COMMAND_NAMES = ["fondo", "tema", "wallpaper", "chattheme", "setfondo"];

export default {
  name: COMMAND_NAMES,
  command: COMMAND_NAMES,
  alias: COMMAND_NAMES,
  aliases: COMMAND_NAMES,
  description: "Cambia el fondo de pantalla y tema del chat sincronizado para todos.",
  category: "group",
  adminOnly: false,
  groupOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix } = ctx;
    const prefix = usedPrefix || ".";
    const sub = (args[0] || "").toLowerCase();

    try {
      if (sub === "proto" || sub === "check" || sub === "debug") {
        const p = proto as any;
        const hasType = p?.Message?.ProtocolMessage?.Type?.CHAT_THEME_SETTING;
        const protoSchema = inspectEncodeSchema(p?.Message?.ProtocolMessage).filter((s) =>
          /theme|wallpaper/i.test(s),
        );
        const detail = collectThemeSchemas();

        return await ctx.reply({
          text:
            `╭〔 🧪 ${fytBold("Esquema WAProto")} 〕⬣\n` +
            `• *Type CHAT_THEME_SETTING:* \`${hasType ?? "NO EXISTE"}\`\n` +
            `• *ProtocolMessage:* \`${protoSchema.join(", ") || "ninguno"}\`\n\n` +
            `${detail}\n` +
            `╰━━━━━━━━━━━━⬣`,
        });
      }

      await sock.sendMessage(from, {
        react: { text: "⏳", key: msg.key },
      });

      const targetImage = extractTargetImage(msg, from, sock);

      if (targetImage && sub !== "tema" && sub !== "animado" && sub !== "solid") {
        const imageBuffer = await downloadMediaMessage(
          targetImage,
          "buffer",
          {},
          {
            logger: console as any,
            reuploadRequest: sock.updateMediaMessage as (m: WAMessage) => Promise<WAMessage>,
          },
        );

        const uploaded = await prepareWAMessageMedia(
          { image: imageBuffer as Buffer },
          { upload: sock.waUploadToServer },
        );

        if (!uploaded.imageMessage) {
          throw new Error("No se pudo subir la imagen cifrada a los servidores de WhatsApp.");
        }

        const dimArg = args.find((a) => /^0?\.\d+$|^1(\.0+)?$|^0$/.test(a));
        const dimLevel = dimArg ? Math.max(0, Math.min(1, parseFloat(dimArg))) : 0;

        const themeIdx = args.findIndex((a) => a === "-t" || a === "--tema");
        const colorSchemeId =
          themeIdx !== -1 && args[themeIdx + 1]
            ? normalizeColorScheme(args[themeIdx + 1])
            : undefined;

        const themeKeys = getProtoKeys(getChatThemeProtoCtor());
        const imgField = detectCustomImageField(themeKeys);

        const chatThemeSetting: Record<string, any> = {
          [imgField]: {
            ...uploaded.imageMessage,
            dimLevel,
          },
        };

        if (colorSchemeId) {
          chatThemeSetting.colorSchemeId = colorSchemeId;
        }

        await relayChatTheme(sock, from, chatThemeSetting);

        await sock.sendMessage(from, {
          react: { text: "✅", key: msg.key },
        });
        return await ctx.reply({
          text: `✅ ${fytBold("Fondo personalizado sincronizado")} para todo el grupo.`,
        });
      }

      if (!args.length) {
        await sock.sendMessage(from, {
          react: { text: "❓", key: msg.key },
        });
        return await ctx.reply({
          text:
            `╭〔 🎨 ${fytBold("Fondo y Tema de Grupo")} 〕⬣\n` +
            `• *Foto propia:* Responde a una imagen con \`${prefix}fondo\` (opcional brillo \`0.25\`)\n` +
            `• *Color sólido:* \`${prefix}fondo morado\` o \`${prefix}fondo #1A1A2E -nodoodle\`\n` +
            `• *Tema tonal:* \`${prefix}fondo tema Royal-Blue\`\n` +
            `• *Fondo animado:* \`${prefix}fondo animado wallpaper-1 0.25\`\n` +
            `• *Ver esquema WAProto:* \`${prefix}fondo proto\`\n` +
            `╰━━━━━━━━━━━━⬣`,
        });
      }

      if (sub === "tema" || sub === "theme") {
        const rawTheme = args.slice(1).join(" ").trim();
        if (!rawTheme) {
          throw new Error(`Indica el tema. Ejemplo: ${prefix}fondo tema Royal-Blue`);
        }

        const colorSchemeId = normalizeColorScheme(rawTheme);
        await relayChatTheme(sock, from, { colorSchemeId });

        await sock.sendMessage(from, {
          react: { text: "✅", key: msg.key },
        });
        return await ctx.reply({
          text: `✅ Tema aplicado al grupo: \`${colorSchemeId}\``,
        });
      }

      if (sub === "animado" || sub === "live") {
        const animatedWallpaperID = args[1] || "wallpaper-1";
        const parsedDim = args[2] ? parseFloat(args[2]) : 0.2;
        const dimLevel = Number.isFinite(parsedDim)
          ? Math.max(0, Math.min(1, parsedDim))
          : 0.2;

        const schemeArg = args[3] ? normalizeColorScheme(args[3]) : undefined;
        const chatThemeSetting: Record<string, any> = {
          animatedWallpaper: {
            animatedWallpaperID,
            dimLevel,
          },
        };
        if (schemeArg) {
          chatThemeSetting.colorSchemeId = schemeArg;
        }

        await relayChatTheme(sock, from, chatThemeSetting);

        await sock.sendMessage(from, {
          react: { text: "✅", key: msg.key },
        });
        return await ctx.reply({
          text: `✅ Fondo animado \`${animatedWallpaperID}\` aplicado (opacidad \`${dimLevel}\`).`,
        });
      }

      const rawColorToken = sub === "solid" ? args[1] || "" : args[0] || "";
      const hex = resolveHexColor(rawColorToken);
      if (!hex) {
        throw new Error(
          `Color no reconocido: "${rawColorToken}". Usa un nombre (rojo, morado, negro, random) o hex (#123456).`,
        );
      }

      const isDoodleEnabled = !args.some((a) =>
        ["-nodoodle", "--nodoodle", "sindoodle"].includes(a.toLowerCase()),
      );

      const darkFlagIdx = args.findIndex((a) => a === "-dark" || a === "--dark");
      const darkHex =
        darkFlagIdx !== -1 && args[darkFlagIdx + 1]
          ? resolveHexColor(args[darkFlagIdx + 1]) || hex
          : null;

      const colorLight = hex;
      const colorDark = darkHex || shiftHex(hex, 0.35);
      const doodleColorLight = shiftHex(hex, 0.82);
      const doodleColorDark = darkHex ? shiftHex(darkHex, 1.3) : shiftHex(hex, 0.55);

      await relayChatTheme(sock, from, {
        solidColor: {
          colorLight,
          colorDark,
          doodleColorLight,
          doodleColorDark,
          isDoodleEnabled,
        },
      });

      await sock.sendMessage(from, {
        react: { text: "✅", key: msg.key },
      });
      return await ctx.reply({
        text: `✅ Fondo sólido \`${hex}\` sincronizado (garabatos: ${isDoodleEnabled ? "sí" : "no"}).`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await sock.sendMessage(from, {
        react: { text: "❌", key: msg.key },
      });
      return await ctx.reply({
        text: `⚠️ Error al cambiar el fondo:\n\`\`\`${message}\`\`\``,
      });
    }
  },
};
