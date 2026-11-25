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

let solidColorPatched = false;

function patchSolidColorProto() {
  if (solidColorPatched) return;
  const p = proto as any;
  const ctor = p?.Message?.ChatSolidColorWallpaper;
  if (!ctor || typeof ctor.encode !== "function") return;

  const origEncode = ctor.encode.bind(ctor);

  ctor.fromObject = (d: Record<string, any>) => {
    if (!d || typeof d !== "object") return {};
    return {
      backgroundLightArgb: d.backgroundLightArgb,
      backgroundDarkArgb: d.backgroundDarkArgb,
      isDoodleEnabled: d.isDoodleEnabled,
      doodleLightArgb: d.doodleLightArgb,
      doodleDarkArgb: d.doodleDarkArgb,
    };
  };

  ctor.create = (d: Record<string, any>) => ctor.fromObject(d);

  ctor.encode = (m: Record<string, any>, w?: any) => {
    const writer = w || origEncode({});
    if (m.backgroundLightArgb != null) {
      writer.uint32(13).fixed32(m.backgroundLightArgb >>> 0);
    }
    if (m.backgroundDarkArgb != null) {
      writer.uint32(21).fixed32(m.backgroundDarkArgb >>> 0);
    }
    if (m.isDoodleEnabled != null) {
      writer.uint32(24).bool(Boolean(m.isDoodleEnabled));
    }
    if (m.doodleLightArgb != null) {
      writer.uint32(37).fixed32(m.doodleLightArgb >>> 0);
    }
    if (m.doodleDarkArgb != null) {
      writer.uint32(45).fixed32(m.doodleDarkArgb >>> 0);
    }
    return writer;
  };

  solidColorPatched = true;
}

patchSolidColorProto();

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

function resolveRgbHex(token: string): string | null {
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
  let hex = m[1].toUpperCase();
  if (hex.length === 3) {
    hex = [...hex].map((c) => `${c}${c}`).join("");
  } else if (hex.length === 8) {
    hex = hex.slice(2);
  }
  return `#${hex}`;
}

function rgbHexToArgbUint32(rgbHex: string, alpha = 255): number {
  const clean = rgbHex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (((alpha & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
}

function shiftArgbUint32(rgbHex: string, factor: number, alpha = 255): number {
  const clean = rgbHex.replace(/^#/, "");
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(clean.slice(0, 2), 16) * factor);
  const g = clamp(parseInt(clean.slice(2, 4), 16) * factor);
  const b = clamp(parseInt(clean.slice(4, 6), 16) * factor);
  return (((alpha & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
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

function toBytes(val: unknown): Uint8Array {
  if (val instanceof Uint8Array) return val;
  if (typeof val === "string") return Buffer.from(val, "base64");
  return new Uint8Array();
}

async function relayChatTheme(
  sock: CommandContext["sock"],
  jid: string,
  chatThemeSetting: Record<string, any>,
) {
  patchSolidColorProto();
  const p = proto as any;
  const typeEnum = p?.Message?.ProtocolMessage?.Type?.CHAT_THEME_SETTING ?? 34;

  const protocolMessage: Record<string, any> = {
    type: typeEnum,
    chatThemeSetting: {
      settingTimestampMs: Date.now(),
      ...chatThemeSetting,
    },
  };

  const waMessage = generateWAMessageFromContent(
    jid,
    {
      protocolMessage,
    } as any,
    {
      userJid: sock.user?.id || jid,
    },
  );

  await sock.relayMessage(jid, waMessage.message!, {
    messageId: waMessage.key.id!,
  });
}

export default {
  name: ["fondo", "tema", "wallpaper", "chattheme", "setfondo"],
  get command() {
    return this.name;
  },
  get alias() {
    return this.name;
  },
  get aliases() {
    return this.name;
  },
  description: "Cambia el fondo de pantalla y tema del chat sincronizado para todos.",
  category: "group",
  adminOnly: false,
  groupOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix } = ctx;
    const prefix = usedPrefix || ".";
    const sub = (args[0] || "").toLowerCase();

    try {
      await sock.sendMessage(from, {
        react: { text: "⏳", key: msg.key },
      });

      const targetImage = extractTargetImage(msg, from, sock);

      if (
        targetImage &&
        !["tema", "theme", "animado", "live", "reset", "clear", "default"].includes(sub)
      ) {
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

        const img = uploaded.imageMessage;
        if (!img?.directPath || !img.mediaKey || !img.fileEncSha256 || !img.fileSha256) {
          throw new Error("No se obtuvieron las llaves cifradas al subir la imagen.");
        }

        const dimArg = args.find((a) => /^0?\.\d+$|^1(\.0+)?$|^0$/.test(a));
        const dimLevel = dimArg ? Math.max(0, Math.min(1, parseFloat(dimArg))) : 0.25;

        const themeIdx = args.findIndex((a) => a === "-t" || a === "--tema");
        const colorSchemeId =
          themeIdx !== -1 && args[themeIdx + 1]
            ? normalizeColorScheme(args[themeIdx + 1])
            : undefined;

        const chatThemeSetting: Record<string, any> = {
          customImage: {
            directPath: img.directPath,
            mediaKey: toBytes(img.mediaKey),
            fileEncSha256: toBytes(img.fileEncSha256),
            fileSha256: toBytes(img.fileSha256),
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
            `• *Foto propia:* Responde a una foto con \`${prefix}fondo\`\n` +
            `• *Color sólido:* \`${prefix}fondo rojo\` o \`${prefix}fondo #1A1A2E -nodoodle\`\n` +
            `• *Tema tonal:* \`${prefix}fondo tema Royal-Blue\`\n` +
            `• *Predeterminado:* \`${prefix}fondo default\`\n` +
            `• *Quitar fondo:* \`${prefix}fondo reset\`\n` +
            `╰━━━━━━━━━━━━⬣`,
        });
      }

      if (sub === "reset" || sub === "clear" || sub === "quitar") {
        await relayChatTheme(sock, from, { clearTheme: true });
        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await ctx.reply({ text: `✅ Tema y fondo restablecidos.` });
      }

      if (sub === "default" || sub === "predeterminado") {
        const isDoodleEnabled = !args.some((a) =>
          ["-nodoodle", "--nodoodle", "sindoodle"].includes(a.toLowerCase()),
        );
        await relayChatTheme(sock, from, {
          defaultWallpaper: { isDoodleEnabled },
        });
        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await ctx.reply({ text: `✅ Fondo predeterminado aplicado.` });
      }

      if (sub === "tema" || sub === "theme") {
        const rawTheme = args.slice(1).join(" ").trim();
        if (!rawTheme) {
          throw new Error(`Indica el tema. Ejemplo: ${prefix}fondo tema Royal-Blue`);
        }
        const colorSchemeId = normalizeColorScheme(rawTheme);
        await relayChatTheme(sock, from, { colorSchemeId });
        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await ctx.reply({ text: `✅ Tema aplicado: \`${colorSchemeId}\`` });
      }

      const rgbLight = resolveRgbHex(args[0] || "");
      if (!rgbLight) {
        throw new Error(`Color no reconocido: "${args[0]}".`);
      }

      const isDoodleEnabled = !args.some((a) =>
        ["-nodoodle", "--nodoodle", "sindoodle"].includes(a.toLowerCase()),
      );

      const darkFlagIdx = args.findIndex((a) => a === "-dark" || a === "--dark");
      const rgbDark =
        darkFlagIdx !== -1 && args[darkFlagIdx + 1]
          ? resolveRgbHex(args[darkFlagIdx + 1])
          : null;

      const backgroundLightArgb = rgbHexToArgbUint32(rgbLight, 255);
      const backgroundDarkArgb = rgbDark
        ? rgbHexToArgbUint32(rgbDark, 255)
        : shiftArgbUint32(rgbLight, 0.35, 255);
      const doodleLightArgb = shiftArgbUint32(rgbLight, 0.82, 255);
      const doodleDarkArgb = rgbDark
        ? shiftArgbUint32(rgbDark, 1.35, 255)
        : shiftArgbUint32(rgbLight, 0.55, 255);

      const themeIdx = args.findIndex((a) => a === "-t" || a === "--tema");
      const colorSchemeId =
        themeIdx !== -1 && args[themeIdx + 1]
          ? normalizeColorScheme(args[themeIdx + 1])
          : undefined;

      const chatThemeSetting: Record<string, any> = {
        solidColor: {
          backgroundLightArgb,
          backgroundDarkArgb,
          isDoodleEnabled,
          doodleLightArgb,
          doodleDarkArgb,
        },
      };

      if (colorSchemeId) {
        chatThemeSetting.colorSchemeId = colorSchemeId;
      }

      await relayChatTheme(sock, from, chatThemeSetting);

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      return await ctx.reply({
        text: `✅ Fondo sólido \`${rgbLight}\` aplicado (fixed32 ARGB).`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      return await ctx.reply({
        text: `⚠️ Error:\n\`\`\`${message}\`\`\``,
      });
    }
  },
};
