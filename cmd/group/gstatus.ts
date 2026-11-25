import type { proto, AnyMessageContent, WAMessage } from "baileys";
import {
  areJidsSameUser,
  downloadMediaMessage,
  normalizeMessageContent,
} from "baileys";
import { setDefaultResultOrder } from "node:dns";
import type { CommandContext } from "../../types/commands.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";
import { CONVERT_AUDIO_TO_OGG } from "../../utils/converter.ts";

const DEFAULT_STATUS_BACKGROUND = "#ff0000";

const COLOR_PALETTE: Record<string, string> = {
  rojo: "#ff0000",
  red: "#ff0000",
  azul: "#0000ff",
  blue: "#0000ff",
  azuloscuro: "#0D47A1",
  darkblue: "#0D47A1",
  celeste: "#03A9F4",
  sky: "#03A9F4",
  cian: "#00ffff",
  cyan: "#00ffff",
  turquesa: "#009688",
  teal: "#009688",
  verde: "#00ff00",
  green: "#00ff00",
  verdeoscuro: "#1B5E20",
  darkgreen: "#1B5E20",
  lima: "#8BC34A",
  lime: "#8BC34A",
  menta: "#26A69A",
  mint: "#26A69A",
  morado: "#9C27B0",
  purple: "#9C27B0",
  violeta: "#673AB7",
  violet: "#673AB7",
  lila: "#AB47BC",
  lavanda: "#7E57C2",
  indigo: "#3F51B5",
  rosa: "#E91E63",
  pink: "#E91E63",
  fucsia: "#D81B60",
  magenta: "#C2185B",
  coral: "#FF7043",
  naranja: "#FF5722",
  orange: "#FF5722",
  amarillo: "#ffff00",
  yellow: "#ffff00",
  dorado: "#FFB300",
  gold: "#FFB300",
  vino: "#880E4F",
  wine: "#880E4F",
  cafe: "#795548",
  marron: "#795548",
  brown: "#795548",
  gris: "#607D8B",
  gray: "#607D8B",
  plata: "#9E9E9E",
  silver: "#9E9E9E",
  negro: "#000000",
  black: "#000000",
  blanco: "#FFFFFF",
  white: "#FFFFFF",
  neon: "#00E676",
};

const RANDOM_COLORS = [
  "#FF0000",
  "#E91E63",
  "#9C27B0",
  "#673AB7",
  "#3F51B5",
  "#0000ff",
  "#00ffff",
  "#009688",
  "#00ff00",
  "#FF9800",
  "#FF5722",
  "#795548",
  "#607D8B",
  "#000000",
];

const GROUP_STATUS_MEDIA = [
  "imageMessage",
  "videoMessage",
  "ptvMessage",
  "audioMessage",
  "documentMessage",
  "stickerMessage",
] as const;

function resolveColorToken(rawColor: string): string | null {
  const clean = rawColor.trim().toLowerCase();
  if (!clean) return null;

  if (clean === "random" || clean === "aleatorio" || clean === "azar") {
    return RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)];
  }

  if (COLOR_PALETTE[clean]) {
    return COLOR_PALETTE[clean];
  }

  const normalizedNoAccents = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (COLOR_PALETTE[normalizedNoAccents]) {
    return COLOR_PALETTE[normalizedNoAccents];
  }

  if (/^#?(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(clean)) {
    const hex = clean.replace(/^#/, "");
    const expanded =
      hex.length === 3
        ? [...hex].map((d) => `${d}${d}`).join("")
        : hex;
    return `#${expanded.toUpperCase()}`;
  }

  return null;
}

function parseStatusInput(
  input: string,
  hasTargetContext: boolean,
): { backgroundColor: string; text: string; hasExplicitColor: boolean } {
  let working = input.trim();
  let explicitColor: string | null = null;

  const flagMatch = working.match(/^(?:-c|--color)\s+(\S+)(?:\s+([\s\S]*))?$/i);
  if (flagMatch) {
    const resolved = resolveColorToken(flagMatch[1]);
    if (!resolved) {
      throw new Error(
        `Color inválido "${flagMatch[1]}". Usa un nombre (rojo, azul, morado, verde, random) o código hexadecimal (#123456).`,
      );
    }
    explicitColor = resolved;
    working = (flagMatch[2] || "").trim();
    return {
      backgroundColor: explicitColor,
      text: working,
      hasExplicitColor: true,
    };
  }

  const separatorIndex = working.indexOf("|");
  if (separatorIndex !== -1) {
    const colorCandidate = working.slice(0, separatorIndex).trim();
    const textPart = working.slice(separatorIndex + 1).trim();

    if (colorCandidate) {
      const resolved = resolveColorToken(colorCandidate);
      if (!resolved) {
        throw new Error(
          `Color inválido "${colorCandidate}". Usa un nombre (rojo, azul, morado, verde, random) o código hexadecimal (#123456).`,
        );
      }
      explicitColor = resolved;
    }

    return {
      backgroundColor: explicitColor || DEFAULT_STATUS_BACKGROUND,
      text: textPart,
      hasExplicitColor: Boolean(explicitColor),
    };
  }

  if (working && !/\s/.test(working)) {
    const singleTokenColor = resolveColorToken(working);
    if (singleTokenColor && (hasTargetContext || working.startsWith("#"))) {
      return {
        backgroundColor: singleTokenColor,
        text: "",
        hasExplicitColor: true,
      };
    }
  }

  return {
    backgroundColor: DEFAULT_STATUS_BACKGROUND,
    text: working,
    hasExplicitColor: false,
  };
}

function replaceMediaCaption(message: proto.IMessage, caption: string) {
  const copy = { ...message };
  if (copy.imageMessage) {
    copy.imageMessage = { ...copy.imageMessage, caption };
  } else if (copy.videoMessage) {
    copy.videoMessage = { ...copy.videoMessage, caption };
  } else if (copy.ptvMessage) {
    copy.ptvMessage = { ...copy.ptvMessage, caption };
  } else if (copy.documentMessage) {
    copy.documentMessage = { ...copy.documentMessage, caption };
  }
  return copy;
}

function extractContextInfo(message: proto.IMessage | null | undefined) {
  if (!message) return undefined;
  return (
    message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo ||
    message.videoMessage?.contextInfo ||
    message.documentMessage?.contextInfo ||
    message.audioMessage?.contextInfo ||
    message.stickerMessage?.contextInfo ||
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

async function downloadAudioForStatus(
  message: WAMessage,
  sock: CommandContext["sock"],
): Promise<Buffer> {
  setDefaultResultOrder("ipv4first");

  return downloadMediaMessage(
    message,
    "buffer",
    {},
    {
      logger: sock.logger,
      reuploadRequest: (mediaMessage) => sock.updateMediaMessage(mediaMessage),
    },
  );
}

export default {
  name: ["swgc", "gstatus", "statusgrupo"],
  description: t("cmd_publica_un_estado_exclusivo_pa_0b04ead6"),
  category: "group",
  adminOnly: false,
  groupOnly: true,
  async run(ctx: CommandContext) {
    const { sock, from, msg, args } = ctx;
    const remoteJid = from;

    await sock.sendMessage(remoteJid, {
      react: { text: "⏳", key: msg.key },
    });

    const joinSeparator = t("cmd_text_b858cb28") || " ";
    const inputContent = args.join(joinSeparator).trim();

    try {
      const currentMessage = normalizeMessageContent(msg.message);
      const directMediaType = GROUP_STATUS_MEDIA.find(
        (type) => currentMessage?.[type],
      );

      const quotedCtx = extractContextInfo(currentMessage);
      const quotedMsg = normalizeMessageContent(quotedCtx?.quotedMessage);
      const quotedMediaType = GROUP_STATUS_MEDIA.find(
        (type) => quotedMsg?.[type],
      );

      const hasTargetContext = Boolean(quotedMsg || directMediaType);
      const {
        backgroundColor,
        text: parsedText,
      } = parseStatusInput(inputContent, hasTargetContext);

      if (directMediaType && currentMessage) {
        const directAudio =
          currentMessage.audioMessage ||
          (currentMessage.documentMessage?.mimetype?.startsWith("audio/")
            ? currentMessage.documentMessage
            : undefined);

        if (directAudio) {
          const audioBuffer = await downloadAudioForStatus(msg, sock);
          const playableAudio = await CONVERT_AUDIO_TO_OGG(audioBuffer);
          await sock.sendMessage(
            remoteJid,
            {
              audio: playableAudio,
              mimetype: "audio/ogg; codecs=opus",
              ptt: false,
              groupStatus: true,
            } as any,
            { backgroundColor },
          );
        } else {
          const messageToForward: WAMessage = {
            ...msg,
            message: replaceMediaCaption(currentMessage, parsedText),
          };
          const forwardContent = {
            forward: messageToForward,
            groupStatus: true,
          } as Extract<AnyMessageContent, { forward: WAMessage }> & {
            groupStatus: true,
          };
          await sock.sendMessage(remoteJid, forwardContent, {
            backgroundColor,
          });
        }
      } else if (quotedMsg) {
        if (quotedMediaType) {
          if (!quotedCtx?.stanzaId) {
            throw new Error("No se pudo identificar el medio citado.");
          }

          const quotedMessage = {
            key: {
              remoteJid: quotedCtx.remoteJid || remoteJid,
              id: quotedCtx.stanzaId,
              participant: quotedCtx.participant || undefined,
              fromMe: isParticipantSelf(quotedCtx.participant, sock),
            },
            message: quotedMsg,
          } as unknown as WAMessage;

          const quotedAudio =
            quotedMsg.audioMessage ||
            (quotedMsg.documentMessage?.mimetype?.startsWith("audio/")
              ? quotedMsg.documentMessage
              : undefined);

          if (quotedAudio) {
            const audioBuffer = await downloadAudioForStatus(
              quotedMessage,
              sock,
            );
            const playableAudio = await CONVERT_AUDIO_TO_OGG(audioBuffer);
            await sock.sendMessage(
              remoteJid,
              {
                audio: playableAudio,
                mimetype: "audio/ogg; codecs=opus",
                ptt: false,
                groupStatus: true,
              } as any,
              { backgroundColor },
            );
          } else {
            const messageToForward: WAMessage = {
              ...quotedMessage,
              message: parsedText
                ? replaceMediaCaption(quotedMsg, parsedText)
                : quotedMsg,
            };
            const forwardContent = {
              forward: messageToForward,
              groupStatus: true,
            } as Extract<AnyMessageContent, { forward: WAMessage }> & {
              groupStatus: true,
            };
            await sock.sendMessage(remoteJid, forwardContent, {
              backgroundColor,
            });
          }

          if (parsedText && (quotedAudio || quotedMsg.stickerMessage)) {
            await sock.sendMessage(
              remoteJid,
              { text: parsedText, groupStatus: true } as any,
              { backgroundColor },
            );
          }
        } else {
          const quotedText = (
            quotedMsg.conversation ||
            quotedMsg.extendedTextMessage?.text ||
            ""
          ).trim();

          const statusText = parsedText || quotedText;

          if (!statusText) {
            await sock.sendMessage(remoteJid, {
              react: { text: "❌", key: msg.key },
            });
            return await ctx.reply({
              text: t("cmd_value0_value1_el_mensaje_citad_e8b4deba", {
                value0: fytBold(t("cmd_aura_reed_95dcfb15")),
                value1: fytBold(t("cmd_error_de_estado_bb05d222")),
                value2: fytBold(t("cmd_system_alert_780bb6b6")),
              }),
            });
          }

          await sock.sendMessage(
            remoteJid,
            { text: statusText, groupStatus: true } as any,
            { backgroundColor },
          );
        }
      } else {
        if (!parsedText) {
          await sock.sendMessage(remoteJid, {
            react: { text: "❌", key: msg.key },
          });
          return await ctx.reply({
            text: t("cmd_value0_value1_ingresa_un_texto_2ac2de6e", {
              value0: fytBold(t("cmd_aura_reed_95dcfb15")),
              value1: fytBold(t("cmd_error_de_estado_bb05d222")),
              value2: fytBold(t("cmd_system_alert_780bb6b6")),
            }),
          });
        }

        await sock.sendMessage(
          remoteJid,
          { text: parsedText, groupStatus: true } as any,
          { backgroundColor },
        );
      }

      await sock.sendMessage(remoteJid, {
        react: { text: "✅", key: msg.key },
      });

      return await ctx.reply({
        text: t("cmd_value0_value1_el_estado_se_ha__e8493537", {
          value0: fytBold(t("cmd_aura_reed_95dcfb15")),
          value1: fytBold(t("cmd_estado_publicado_38971c44")),
          value2: fytBold(t("cmd_system_info_1a78a0cb")),
        }),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[gstatus]", error);
      await sock.sendMessage(remoteJid, {
        react: { text: "❌", key: msg.key },
      });

      return await ctx.reply({
        text: t("cmd_value0_value1_value2_value3_81a9f89e", {
          value0: fytBold(t("cmd_aura_reed_95dcfb15")),
          value1: fytBold(t("cmd_error_de_sistema_5c013aab")),
          value2: message,
          value3: fytBold(t("cmd_system_alert_780bb6b6")),
        }),
      });
    }
  },
};
