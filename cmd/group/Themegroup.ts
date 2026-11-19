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

const OWNER_DM = "573118353868@s.whatsapp.net";
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

function toArgb(rgbHex: string): string {
  const clean = rgbHex.replace(/^#/, "");
  return clean.length === 8 ? `#${clean}` : `#FF${clean}`;
}

function shiftRgbHex(rgbHex: string, factor: number): string {
  const clean = rgbHex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
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
        return `<Bytes(${v.length}) b64=${Buffer.from(v).toString("base64")}>`;
      }
      if (typeof v === "bigint") {
        return v.toString();
      }
      return v;
    },
    2,
  );
}

function waitForStanzaAck(
  sock: CommandContext["sock"],
  messageId: string,
  timeoutMs = 4000,
): Promise<Record<string, any> | null> {
  return new Promise((resolve) => {
    const wsAny = (sock as any).ws;
    if (!wsAny || typeof wsAny.on !== "function") {
      resolve(null);
      return;
    }

    const onAck = (node: any) => {
      if (node?.attrs?.id !== messageId) return;
      clearTimeout(timer);
      wsAny.off("CB:ack", onAck);
      resolve(node.attrs || {});
    };

    const timer = setTimeout(() => {
      wsAny.off("CB:ack", onAck);
      resolve(null);
    }, timeoutMs);

    wsAny.on("CB:ack", onAck);
  });
}

async function relayChatTheme(
  sock: CommandContext["sock"],
  jid: string,
  chatThemeSetting: Record<string, any>,
  extraOptions?: {
    additionalAttributes?: Record<string, string>;
    additionalNodes?: any[];
  },
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

  const messageId = waMessage.key.id!;
  const encodedLen = p.Message.encode(waMessage.message).finish().length;
  const ackPromise = waitForStanzaAck(sock, messageId, 4000);

  await sock.relayMessage(jid, waMessage.message!, {
    messageId,
    ...(extraOptions || {}),
  } as any);

  const ack = await ackPromise;
  return { messageId, encodedLen, ack };
}

function formatAck(ack: Record<string, any> | null): string {
  if (!ack) return "sin ACK (timeout)";
  if (ack.error) return `ERROR ${ack.error} (${JSON.stringify(ack)})`;
  return `OK (${JSON.stringify(ack)})`;
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
      if (sub === "sniff") {
        const prev = activeSniffers.get(from);
        if (prev) {
          prev();
          activeSniffers.delete(from);
          return await ctx.reply({ text: "🛑 Sniffer detenido en este grupo." });
        }

        const recentStanzas = new Map<string, Record<string, any>>();
        const sendToDm = async (title: string, payload: unknown) => {
          const text = `📡 *${title}*\n\`\`\`${safeJson(payload).slice(0, 3600)}\`\`\``;
          console.log(`[FONDO_SNIFF] ${title}\n`, safeJson(payload));
          await sock.sendMessage(OWNER_DM, { text }).catch(() => undefined);
        };

        const wsMsgHandler = (node: any) => {
          const id = node?.attrs?.id;
          if (!id) return;
          if (node?.attrs?.from !== from && node?.attrs?.to !== from) return;
          const children = Array.isArray(node.content)
            ? node.content.map((c: any) => ({ tag: c?.tag, attrs: c?.attrs }))
            : [];
          recentStanzas.set(id, { attrs: node.attrs, children });
          if (recentStanzas.size > 80) {
            const firstKey = recentStanzas.keys().next().value;
            if (firstKey) recentStanzas.delete(firstKey);
          }
        };

        const wsNotifHandler = async (node: any) => {
          const rawFrom = node?.attrs?.from;
          if (rawFrom !== from) return;
          await sendToDm("CB:notification", {
            tag: node.tag,
            attrs: node.attrs,
            content: node.content,
          });
        };

        const msgHandler = async ({ messages }: { messages: WAMessage[] }) => {
          for (const incoming of messages) {
            if (incoming.key.remoteJid !== from) continue;
            const norm = normalizeMessageContent(incoming.message);
            const keys = norm ? Object.keys(norm) : [];
            const isPlainText =
              keys.length > 0 &&
              keys.every((k) =>
                ["conversation", "extendedTextMessage", "messageContextInfo", "senderKeyDistributionMessage"].includes(k),
              );
            const isInteresting =
              Boolean(incoming.messageStubType) ||
              Boolean(norm?.protocolMessage) ||
              !isPlainText;

            if (isInteresting) {
              const stanza = incoming.key.id ? recentStanzas.get(incoming.key.id) : undefined;
              await sendToDm("Incoming Special Event", {
                stanza,
                key: incoming.key,
                messageStubType: incoming.messageStubType,
                messageStubParameters: incoming.messageStubParameters,
                rawKeys: incoming.message ? Object.keys(incoming.message) : [],
                message: norm,
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

        const timer = setTimeout(cleanup, 300_000);
        activeSniffers.set(from, () => {
          clearTimeout(timer);
          cleanup();
        });

        return await ctx.reply({
          text: "📡 Sniffer total activo por 5 min. Haz que el otro bot cambie el fondo y el paquete exacto llegará a tu privado.",
        });
      }

      if (sub === "test") {
        await sock.sendMessage(from, { react: { text: "🧪", key: msg.key } });
        const results: string[] = [];

        const r1 = await relayChatTheme(sock, from, {
          solidColor: {
            colorLight: "#FF2196F3",
            colorDark: "#FF0C3555",
            isDoodleEnabled: true,
          },
        });
        results.push(`1. Normal ARGB: ${formatAck(r1.ack)}`);

        await new Promise((r) => setTimeout(r, 1200));
        const r2 = await relayChatTheme(
          sock,
          from,
          {
            solidColor: {
              colorLight: "#2196F3",
              colorDark: "#0C3555",
              isDoodleEnabled: true,
            },
            colorSchemeId: "Royal-Blue@Tonal",
          },
          { additionalAttributes: { edit: "2" } },
        );
        results.push(`2. edit=2 + RGB6 + scheme: ${formatAck(r2.ack)}`);

        await new Promise((r) => setTimeout(r, 1200));
        const r3 = await relayChatTheme(
          sock,
          from,
          {
            solidColor: {
              colorLight: "#FF9C27B0",
              colorDark: "#FF350D3C",
              isDoodleEnabled: true,
            },
            colorSchemeId: "Violet@Tonal",
          },
          { additionalAttributes: { edit: "7" } },
        );
        results.push(`3. edit=7 + ARGB + scheme: ${formatAck(r3.ack)}`);

        await new Promise((r) => setTimeout(r, 1200));
        const r4 = await relayChatTheme(sock, from, {
          colorSchemeId: "Royal-Blue@Tonal",
          defaultWallpaper: { isDoodleEnabled: true },
        });
        results.push(`4. scheme + defaultWallpaper: ${formatAck(r4.ack)}`);

        return await ctx.reply({
          text: `╭〔 🧪 ${fytBold("Resultados ACK")} 〕⬣\n${results.join("\n")}\n╰━━━━━━━━━━━━⬣`,
        });
      }

      await sock.sendMessage(from, {
        react: { text: "⏳", key: msg.key },
      });

      const targetImage = extractTargetImage(msg, from, sock);

      if (
        targetImage &&
        ![
          "tema",
          "theme",
          "animado",
          "live",
          "solid6",
          "solid8",
          "reset",
          "clear",
          "default",
        ].includes(sub)
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

        const { encodedLen, ack } = await relayChatTheme(sock, from, chatThemeSetting);

        await sock.sendMessage(from, {
          react: { text: "✅", key: msg.key },
        });
        return await ctx.reply({
          text: `✅ ${fytBold("Fondo personalizado enviado")} (${encodedLen} bytes).\n• *ACK:* \`${formatAck(ack)}\``,
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
            `• *Color sólido:* \`${prefix}fondo rojo\` o \`${prefix}fondo solid6 rojo\`\n` +
            `• *Tema tonal:* \`${prefix}fondo tema Royal-Blue\`\n` +
            `• *Probar ACKs:* \`${prefix}fondo test\`\n` +
            `• *Capturar otro bot:* \`${prefix}fondo sniff\`\n` +
            `╰━━━━━━━━━━━━⬣`,
        });
      }

      if (sub === "reset" || sub === "clear" || sub === "quitar") {
        const { ack } = await relayChatTheme(sock, from, { clearTheme: true });
        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await ctx.reply({
          text: `✅ Reset enviado.\n• *ACK:* \`${formatAck(ack)}\``,
        });
      }

      if (sub === "tema" || sub === "theme") {
        const rawTheme = args.slice(1).join(" ").trim();
        if (!rawTheme) {
          throw new Error(`Indica el tema. Ejemplo: ${prefix}fondo tema Royal-Blue`);
        }
        const colorSchemeId = normalizeColorScheme(rawTheme);
        const { ack } = await relayChatTheme(sock, from, { colorSchemeId });
        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await ctx.reply({
          text: `✅ Tema enviado: \`${colorSchemeId}\`\n• *ACK:* \`${formatAck(ack)}\``,
        });
      }

      const useRgb6 = sub === "solid6";
      const rawColorToken = sub === "solid6" || sub === "solid8" ? args[1] || "" : args[0] || "";
      const rgbLight = resolveRgbHex(rawColorToken);
      if (!rgbLight) {
        throw new Error(`Color no reconocido: "${rawColorToken}".`);
      }

      const isDoodleEnabled = !args.some((a) =>
        ["-nodoodle", "--nodoodle", "sindoodle"].includes(a.toLowerCase()),
      );
      const rgbDark = shiftRgbHex(rgbLight, 0.35);
      const colorLight = useRgb6 ? rgbLight : toArgb(rgbLight);
      const colorDark = useRgb6 ? rgbDark : toArgb(rgbDark);

      const { encodedLen, ack } = await relayChatTheme(sock, from, {
        solidColor: {
          colorLight,
          colorDark,
          isDoodleEnabled,
        },
      });

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      return await ctx.reply({
        text: `✅ Fondo sólido \`${colorLight}\` enviado (${encodedLen} bytes).\n• *ACK:* \`${formatAck(ack)}\``,
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
