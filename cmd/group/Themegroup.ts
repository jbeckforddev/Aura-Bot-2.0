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
  rojo: "#FFF44336",
  red: "#FFF44336",
  azul: "#FF2196F3",
  blue: "#FF2196F3",
  azuloscuro: "#FF0D47A1",
  celeste: "#FF03A9F4",
  cian: "#FF00BCD4",
  cyan: "#FF00BCD4",
  turquesa: "#FF009688",
  verde: "#FF25D366",
  green: "#FF25D366",
  verdeoscuro: "#FF1B5E20",
  morado: "#FF9C27B0",
  purple: "#FF9C27B0",
  violeta: "#FF673AB7",
  indigo: "#FF3F51B5",
  rosa: "#FFE91E63",
  pink: "#FFE91E63",
  naranja: "#FFFF5722",
  orange: "#FFFF5722",
  amarillo: "#FFFFC107",
  yellow: "#FFFFC107",
  dorado: "#FFFFB300",
  vino: "#FF880E4F",
  cafe: "#FF795548",
  gris: "#FF607D8B",
  negro: "#FF121212",
  black: "#FF121212",
  blanco: "#FFFFFFFF",
  white: "#FFFFFFFF",
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

function resolveArgbHex(token: string): string | null {
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
    hex = `FF${[...hex].map((c) => `${c}${c}`).join("")}`;
  } else if (hex.length === 6) {
    hex = `FF${hex}`;
  }
  return `#${hex}`;
}

function shiftArgbHex(argb: string, factor: number): string {
  const clean = argb.replace(/^#/, "");
  const a = clean.slice(0, 2);
  const r = parseInt(clean.slice(2, 4), 16);
  const g = parseInt(clean.slice(4, 6), 16);
  const b = parseInt(clean.slice(6, 8), 16);
  const clamp = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${a}${clamp(r * factor)}${clamp(g * factor)}${clamp(b * factor)}`.toUpperCase();
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

function safeJson(obj: unknown): string {
  return JSON.stringify(
    obj,
    (_k, v) => {
      if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
        return `<Bytes(${v.length}) ${Buffer.from(v).toString("base64").slice(0, 28)}>`;
      }
      if (typeof v === "bigint") {
        return v.toString();
      }
      return v;
    },
    2,
  );
}

function dumpEncodeRaw(ctor: any, filterRegex?: RegExp): string {
  if (!ctor || typeof ctor.encode !== "function") return "sin encode";
  const lines = String(ctor.encode)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("if (!writer)") && !l.startsWith("return writer"));
  if (!filterRegex) {
    return lines.slice(1, 25).join("\n");
  }
  const matched: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (filterRegex.test(lines[i])) {
      matched.push(lines[i]);
      if (lines[i + 1]) matched.push(`  ${lines[i + 1]}`);
    }
  }
  return matched.join("\n") || "sin coincidencias";
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
      if (sub === "proto" || sub === "debug") {
        const p = proto as any;
        const msgNs = p?.Message;
        const text =
          `╭〔 🧪 ${fytBold("Encode Real WAProto")} 〕⬣\n` +
          `*ProtocolMessage (theme):*\n\`\`\`${dumpEncodeRaw(msgNs?.ProtocolMessage, /theme|wallpaper/i)}\`\`\`\n\n` +
          `*ChatThemeSetting:*\n\`\`\`${dumpEncodeRaw(msgNs?.ChatThemeSetting)}\`\`\`\n\n` +
          `*ChatSolidColorWallpaper:*\n\`\`\`${dumpEncodeRaw(msgNs?.ChatSolidColorWallpaper)}\`\`\`\n\n` +
          `*ChatCustomImageWallpaper:*\n\`\`\`${dumpEncodeRaw(msgNs?.ChatCustomImageWallpaper)}\`\`\`\n` +
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

        const recentStanzas = new Map<string, Record<string, any>>();

        const wsMsgHandler = (node: any) => {
          if (node?.attrs?.from !== from) return;
          const id = node?.attrs?.id;
          if (!id) return;
          const childTags = Array.isArray(node.content)
            ? node.content.map((c: any) => ({ tag: c?.tag, attrs: c?.attrs }))
            : [];
          recentStanzas.set(id, { attrs: node.attrs, children: childTags });
          if (recentStanzas.size > 50) {
            const firstKey = recentStanzas.keys().next().value;
            if (firstKey) recentStanzas.delete(firstKey);
          }
        };

        const wsNotifHandler = async (node: any) => {
          if (node?.attrs?.from !== from) return;
          const dump = safeJson({ tag: node.tag, attrs: node.attrs, content: node.content });
          await sock.sendMessage(from, {
            text: `📡 *Notificación XML:*\n\`\`\`${dump.slice(0, 3500)}\`\`\``,
          });
        };

        const msgHandler = async ({ messages }: { messages: WAMessage[] }) => {
          for (const incoming of messages) {
            if (incoming.key.remoteJid !== from) continue;
            const norm = normalizeMessageContent(incoming.message);
            if (!norm) continue;
            if (norm.protocolMessage) {
              const stanza = incoming.key.id ? recentStanzas.get(incoming.key.id) : undefined;
              const dump = safeJson({
                stanza,
                key: incoming.key,
                protocolMessage: norm.protocolMessage,
              });
              await sock.sendMessage(from, {
                text: `📡 *ProtocolMessage capturado:*\n\`\`\`${dump.slice(0, 3500)}\`\`\``,
              });
            }
          }
        };

        const wsAny = (sock as any).ws;
        if (wsAny && typeof wsAny.on === "function") {
          wsAny.on("CB:message", wsMsgHandler);
          wsAny.on("CB:notification", wsNotifHandler);
        }
        sock.ev.on("messages.upsert", msgHandler);

        const cleanup = () => {
          if (wsAny && typeof wsAny.off === "function") {
            wsAny.off("CB:message", wsMsgHandler);
            wsAny.off("CB:notification", wsNotifHandler);
          }
          sock.ev.off("messages.upsert", msgHandler);
          activeSniffers.delete(from);
        };

        const timer = setTimeout(cleanup, 120_000);
        activeSniffers.set(from, () => {
          clearTimeout(timer);
          cleanup();
        });

        return await ctx.reply({
          text: "📡 Sniffer total activo por 2 min (ProtocolMessage + XML + notificaciones). Haz que el otro bot cambie el fondo ahora.",
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
            `• *Color sólido:* \`${prefix}fondo morado\` o \`${prefix}fondo rojo -t Crimson\`\n` +
            `• *Tema tonal:* \`${prefix}fondo tema Royal-Blue\`\n` +
            `• *Fondo animado:* \`${prefix}fondo animado wallpaper-1 0.25\`\n` +
            `• *Predeterminado:* \`${prefix}fondo default\`\n` +
            `• *Quitar fondo:* \`${prefix}fondo reset\`\n` +
            `• *Inspeccionar proto:* \`${prefix}fondo proto\`\n` +
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
        const parsedDim = args[2] ? parseFloat(args[2]) : 0.25;
        const dimLevel = Number.isFinite(parsedDim) ? parsedDim : 0.25;

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

      const rawColorToken = sub === "solid" ? args[1] || "" : args[0] || "";
      const argbLight = resolveArgbHex(rawColorToken);
      if (!argbLight) {
        throw new Error(
          `Color no reconocido: "${rawColorToken}". Usa un nombre (rojo, morado, negro, random) o hex (#123456).`,
        );
      }

      const isDoodleEnabled = !args.some((a) =>
        ["-nodoodle", "--nodoodle", "sindoodle"].includes(a.toLowerCase()),
      );

      const darkFlagIdx = args.findIndex((a) => a === "-dark" || a === "--dark");
      const argbDark =
        darkFlagIdx !== -1 && args[darkFlagIdx + 1]
          ? resolveArgbHex(args[darkFlagIdx + 1]) || shiftArgbHex(argbLight, 0.35)
          : shiftArgbHex(argbLight, 0.35);

      const themeIdx = args.findIndex((a) => a === "-t" || a === "--tema");
      const colorSchemeId =
        themeIdx !== -1 && args[themeIdx + 1]
          ? normalizeColorScheme(args[themeIdx + 1])
          : undefined;

      const chatThemeSetting: Record<string, any> = {
        solidColor: {
          colorLight: argbLight,
          colorDark: argbDark,
          isDoodleEnabled,
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
        text: `✅ Fondo sólido \`${argbLight}\` sincronizado (garabatos: ${isDoodleEnabled ? "sí" : "no"}).`,
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
