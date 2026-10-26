import type { proto, AnyMessageContent, WAMessage } from "baileys";
import { downloadMediaMessage, normalizeMessageContent } from "baileys";
import { setDefaultResultOrder } from "node:dns";
import type { CommandContext } from "../../types/commands.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";
import { CONVERT_AUDIO_TO_OGG } from "../../utils/converter.ts";

const DEFAULT_STATUS_BACKGROUND = "#f00";
const GROUP_STATUS_MEDIA = [
  "imageMessage",
  "videoMessage",
  "ptvMessage",
  "audioMessage",
  "documentMessage",
  "stickerMessage",
] as const;

function getTextStatus(input: string) {
  const separatorIndex = input.indexOf("|");
  const colorInput =
    separatorIndex === -1 ? "" : input.slice(0, separatorIndex).trim();
  const text =
    separatorIndex === -1
      ? input.trim()
      : input.slice(separatorIndex + 1).trim();

  if (
    colorInput &&
    !/^#?(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(colorInput)
  ) {
    throw new Error(
      "Color inválido. Usa un color hexadecimal, por ejemplo #123456.",
    );
  }

  const color = colorInput.replace(/^#/, "");
  return {
    backgroundColor: color
      ? `#${color.replace(/^[0-9a-f]{3}$/i, (shortHex) =>
          [...shortHex].map((digit) => `${digit}${digit}`).join(""),
        )}`
      : DEFAULT_STATUS_BACKGROUND,
    text,
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
      logger: console as unknown as Parameters<
        typeof downloadMediaMessage
      >[3]["logger"],
      reuploadRequest: sock.updateMediaMessage as (
        mediaMessage: WAMessage,
      ) => Promise<WAMessage>,
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

    const inputContent = args.join(t("cmd_text_b858cb28")).trim();

    try {
      const currentMessage = normalizeMessageContent(msg.message);
      const quotedCtx = currentMessage?.extendedTextMessage?.contextInfo;
      const quotedMsg = normalizeMessageContent(quotedCtx?.quotedMessage);
      const quotedMediaType = GROUP_STATUS_MEDIA.find(
        (type) => quotedMsg?.[type],
      );

      if (quotedMsg) {
        if (quotedMediaType) {
          if (!quotedCtx?.stanzaId) {
            throw new Error("No se pudo identificar el medio citado.");
          }
          const quotedMessage = {
            key: {
              remoteJid: quotedCtx.remoteJid || remoteJid,
              id: quotedCtx.stanzaId,
              participant: quotedCtx.participant || undefined,
              fromMe: quotedCtx.participant === sock.user?.id,
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
              },
              { backgroundColor: DEFAULT_STATUS_BACKGROUND },
            );
          } else {
            const messageToForward: WAMessage = {
              ...quotedMessage,
              message: inputContent
                ? replaceMediaCaption(quotedMsg, inputContent)
                : quotedMsg,
            };
            const forwardContent = {
              forward: messageToForward,
              groupStatus: true,
            } as Extract<AnyMessageContent, { forward: WAMessage }> & {
              groupStatus: true;
            };
            await sock.sendMessage(remoteJid, forwardContent);
          }

          if (inputContent && (quotedAudio || quotedMsg.stickerMessage)) {
            await sock.sendMessage(
              remoteJid,
              { text: inputContent, groupStatus: true },
              { backgroundColor: DEFAULT_STATUS_BACKGROUND },
            );
          }
        } else {
          const quotedText =
            quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || "";
          const { backgroundColor, text: statusText } = inputContent
            ? getTextStatus(inputContent)
            : {
                backgroundColor: DEFAULT_STATUS_BACKGROUND,
                text: quotedText.trim(),
              };

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
            { text: statusText, groupStatus: true },
            { backgroundColor },
          );
        }
      } else {
        const { backgroundColor, text } = getTextStatus(inputContent);
        if (!text) {
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
          { text, groupStatus: true },
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
