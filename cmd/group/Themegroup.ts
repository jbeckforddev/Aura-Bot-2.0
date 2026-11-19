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

const activeSniffers = new Map<string, () => void>();

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

function safeJson(obj: unknown): string {
  return JSON.stringify(
    obj,
    (_k, v) => {
      if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
        return `<Bytes(${v.length}) ${Buffer.from(v).toString("base64").slice(0, 24)}...>`;
      }
      if (typeof v === "bigint") {
        return v.toString();
      }
      return v;
    },
    2,
  );
}

function inspectWireTypes(ctor: any): string {
  if (!ctor || typeof ctor.encode !== "function") return "sin encode";
  const src = String(ctor.encode);
  const lines: string[] = [];
  const regex =
    /message\.([a-zA-Z0-9_]+)[\s\S]{0,180}?(?:writer\.uint32\((\d+)\)\.([a-zA-Z0-9_]+)\(|([a-zA-Z0-9_$.]+)\.encode\(message\.\1)/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = regex.exec(src)) !== null) {
    const field = m[1];
    if (seen.has(field)) continue;
    seen.add(field);
    const wire = m[3] ? `${m[3]} (tag=${Number(m[2]) >>> 3})` : m[4].replace(/^\$root\.proto\./, "");
    lines.push(`  - ${field}: ${wire}`);
  }
  return lines.join("\n") || src.slice(0, 500);
}

async function relayChatTheme(
  sock: CommandContext["sock"],
  jid: string,
  chatThemeSetting: Record<string, any>,
) {
  const p = proto as any;
  const typeEnum = p?.Message?.ProtocolMessage?.Type?.CHAT_THEME_SETTING ?? 34;

  const payload: Record<string, any> = {
    settingTimestampMs: Date.now(),
    ...chatThemeSetting,
  };

  const protocolMessage: Record<string, any> = {
    type: typeEnum,
    chatThemeSetting: payload,
  };

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
        const msgNs = p?.Message;
        const text =
          `╭〔 🧪 ${fytBold("Tipos Wire WAProto")} 〕⬣\n` +
          `*ChatThemeSetting:*\n${inspectWireTypes(msgNs?.ChatThemeSetting)}\n\n` +
          `*ChatSolidColorWallpaper:*\n${inspectWireTypes(msgNs?.ChatSolidColorWallpaper)}\n\n` +
          `*ChatCustomImageWallpaper:*\n${inspectWireTypes(msgNs?.ChatCustomImageWallpaper)}\n\n` +
          `*ChatAnimatedWallpaper:*\n${inspectWireTypes(msgNs?.ChatAnimatedWallpaper)}\n` +
          `╰━━━━━━━━━━━━⬣`;

        return await ctx.reply({ text });
      }

      if (sub === "sniff") {
        const prev = activeSniffers.get(from);
        if (prev) {
          prev();
          activeSniffers.delete(from);
          return await ctx.reply({ text: "🛑 Sniffer detenido en este grupo." });
        }

        const handler = async ({ messages }: { messages: WAMessage[] }) => {
          for (const incoming of messages) {
            if (incoming.key.remoteJid !== from) continue;
            const norm = normalizeMessageContent(incoming.message);
            const pm = norm?.protocolMessage as any;
            if (!pm) continue;
            if (pm.type === 34 || pm.chatThemeSetting) {
              const dump = safeJson({
                key: incoming.key,
                protocolMessage: pm,
              });
              await sock.sendMessage(from, {
                text: `📡 *Captura ChatThemeSetting:*\n\`\`\`${dump}\`\`\``,
              });
            }
          }
        };

        sock.ev.on("messages.upsert", handler);
        const timer = setTimeout(() => {
          sock.ev.off("messages.upsert", handler);
          activeSniffers.delete(from);
        }, 90_000);

        activeSniffers.set(from, () => {
          clearTimeout(timer);
          sock.ev.off("messages.upsert", handler);
        });

        return await ctx.reply({
          text: "📡 Sniffer activo por 90s. Haz que el otro bot cambie el fondo y capturaré el JSON exacto.",
        });
      }

      await sock.sendMessage(from, {
        react: { text: "⏳", key: msg.key },
      });

      const targetImage = extractTargetImage(msg, from, sock);

      if (
        targetImage &&
        !["tema", "theme", "animado", "live", "solid", "stock", "reset", "clear", "default"].includes(sub)
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

        const dimArg = args.find((a) => /^\d+(\.\d+)?$/.test(a));
        const dimLevel = dimArg ? parseFloat(dimArg) : 0;

        const themeIdx = args.findIndex((a) => a === "-t" || a === "--tema");
        const colorSchemeId =
          themeIdx !== -1 && args[themeIdx + 1]
            ? normalizeColorScheme(args[themeIdx + 1])
            : undefined;

        const chatThemeSetting: Record<string, any> = {
          customImage: {
            directPath: img.directPath,
            mediaKey: img.mediaKey,
            fileEncSha256: img.fileEncSha256,
            fileSha256: img.fileSha256,
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
            `• *Color sólido:* \`${prefix}fondo morado\` o \`${prefix}fondo #1A1A2E -nodoodle\`\n` +
            `• *Tema tonal:* \`${prefix}fondo tema Royal-Blue\`\n` +
            `• *Fondo animado:* \`${prefix}fondo animado wallpaper-1 0.2\`\n` +
            `• *Fondo stock:* \`${prefix}fondo stock <id> 0\`\n` +
            `• *Predeterminado:* \`${prefix}fondo default\`\n` +
            `• *Quitar fondo:* \`${prefix}fondo reset\`\n` +
            `• *Capturar otro bot:* \`${prefix}fondo sniff\`\n` +
            `╰━━━━━━━━━━━━⬣`,
        });
      }

      if (sub === "reset" || sub === "clear" || sub === "quitar") {
        await relayChatTheme(sock, from, { clearTheme: true });
        await sock.sendMessage(from, {
          react: { text: "✅", key: msg.key },
        });
        return await ctx.reply({
          text: `✅ Tema y fondo restablecidos en el grupo.`,
        });
      }

      if (sub === "default" || sub === "predeterminado") {
        const isDoodleEnabled = !args.some((a) =>
          ["-nodoodle", "--nodoodle", "sindoodle"].includes(a.toLowerCase()),
        );
        await relayChatTheme(sock, from, {
          defaultWallpaper: { isDoodleEnabled },
        });
        await sock.sendMessage(from, {
          react: { text: "✅", key: msg.key },
        });
        return await ctx.reply({
          text: `✅ Fondo predeterminado aplicado (garabatos: ${isDoodleEnabled ? "sí" : "no"}).`,
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
        const animatedWallpaperId = args[1] || "wallpaper-1";
        const parsedDim = args[2] ? parseFloat(args[2]) : 0;
        const dimLevel = Number.isFinite(parsedDim) ? parsedDim : 0;

        const schemeArg = args[3] ? normalizeColorScheme(args[3]) : undefined;
        const chatThemeSetting: Record<string, any> = {
          animatedWallpaper: {
            animatedWallpaperId,
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
          text: `✅ Fondo animado \`${animatedWallpaperId}\` aplicado (opacidad \`${dimLevel}\`).`,
        });
      }

      if (sub === "stock") {
        const stockImageId = args[1];
        if (!stockImageId) {
          throw new Error(`Indica el ID del fondo stock. Ejemplo: ${prefix}fondo stock 1`);
        }
        const parsedDim = args[2] ? parseFloat(args[2]) : 0;
        const dimLevel = Number.isFinite(parsedDim) ? parsedDim : 0;

        await relayChatTheme(sock, from, {
          stockImage: {
            stockImageId,
            dimLevel,
          },
        });

        await sock.sendMessage(from, {
          react: { text: "✅", key: msg.key },
        });
        return await ctx.reply({
          text: `✅ Fondo stock \`${stockImageId}\` aplicado.`,
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

      await relayChatTheme(sock, from, {
        solidColor: {
          colorLight,
          colorDark,
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
