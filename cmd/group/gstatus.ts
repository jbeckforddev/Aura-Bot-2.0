import type { proto } from "@whiskeysockets/baileys";
import {
  downloadMediaMessage,
  generateWAMessageContent,
  generateWAMessageFromContent,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/commands.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


type StatusType = "text" | "image" | "video" | "audio" | "document";

interface SendGroupStatusOptions {
  text?: string;
  media?: Buffer | Uint8Array | string | null;
  type?: StatusType;
  caption?: string;
  mimetype?: string;
  fileName?: string;
  ptt?: boolean;
  textArgb?: number;
  backgroundArgb?: number;
  font?: number;
  audienceType?: number;
  listName?: string;
  listEmoji?: string;
}

async function sendGroupStatus(
  sock: CommandContext["sock"],
  jid: string,
  options: SendGroupStatusOptions = {},
) {
  const {
    text,
    media,
    type = "text",
    caption = "",
    mimetype,
    fileName,
    ptt = false,
    textArgb = 4292401368,
    backgroundArgb = 4283453520,
    font = 5,
    audienceType = 2,
    listName = "Mejores Amigos",
    listEmoji = "⭐",
  } = options;

  if (!sock?.relayMessage) throw new Error("Socket no disponible");
  if (!jid) throw new Error("JID de grupo no recibido");

  const contextInfo = {
    statusSourceType: 0,
    statusAttributions: [{ AttributionData: null, type: 10 }],
    isGroupStatus: true,
    statusAudienceMetadata: { audienceType, listName, listEmoji },
  };

  let innerMessage: Record<string, unknown>;

  if (type === "text") {
    if (!text) throw new Error("Ingresa un texto para el estado");
    innerMessage = {
      extendedTextMessage: {
        text,
        textArgb,
        backgroundArgb,
        font,
        previewType: 0,
        contextInfo,
      },
    };
  } else {
    if (!sock?.waUploadToServer) throw new Error("Servidor de carga no disponible");
    if (!media) throw new Error("Se requiere un archivo multimedia");

    const contentInput: Record<string, unknown> = {
      [type]:
        typeof media === "string" ? { url: media } : media,
    };

    if (caption && ["image", "video"].includes(type)) {
      contentInput.caption = caption;
    }
    if (mimetype) contentInput.mimetype = mimetype;
    if (fileName && type === "document") contentInput.fileName = fileName;
    if (type === "audio") contentInput.ptt = ptt;

    const content = await generateWAMessageContent(contentInput as never, {
      upload: sock.waUploadToServer,
    });

    const messageKey = `${type}Message` as keyof typeof content;
    if (!content?.[messageKey]) {
      throw new Error(`No se pudo generar el mensaje de tipo ${type}`);
    }

    const mediaMessage = content[messageKey] as Record<string, unknown>;
    mediaMessage.contextInfo = contextInfo;
    innerMessage = { [messageKey]: mediaMessage };
  }

  const senderJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : undefined;
  const message = generateWAMessageFromContent(
    jid,
    { groupStatusMessageV2: { message: innerMessage } } as proto.IMessage,
    { userJid: senderJid },
  );

  await sock.relayMessage(jid, message.message, {
    messageId: message.key.id,
  });

  return message;
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

    const inputContent = args.join(t("cmd_text_b858cb28"));
    const quotedCtx =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = quotedCtx?.quotedMessage;

    try {
      if (quotedMsg) {
        const type = Object.keys(quotedMsg)[0];
        const mediaType = type.replace("Message", "").toLowerCase();

        if (["image", "video", "audio", "document"].includes(mediaType)) {
          const quotedMessage = {
            key: {
              remoteJid,
              id: quotedCtx.stanzaId,
              participant: quotedCtx.participant,
              fromMe: quotedCtx.participant === sock.user?.id,
            },
            message: quotedMsg,
          } as unknown as import("@whiskeysockets/baileys").WAMessage;

          const buffer = await downloadMediaMessage(
            quotedMessage,
            "buffer",
            {},
            {
              logger: console as unknown as Parameters<
                typeof downloadMediaMessage
              >[3]["logger"],
              reuploadRequest: sock.updateMediaMessage,
            },
          );

          const innerContent = quotedMsg[type] || {};

          await sendGroupStatus(sock, remoteJid, {
            type: mediaType as StatusType,
            media: buffer,
            caption: inputContent || innerContent.caption || "",
            mimetype: innerContent.mimetype,
            fileName: innerContent.fileName,
            ptt: innerContent.ptt || false,
          });
        } else {
          const statusText =
            inputContent ||
            quotedMsg.conversation ||
            quotedMsg.extendedTextMessage?.text;

          if (!statusText) {
            await sock.sendMessage(remoteJid, {
              react: { text: "❌", key: msg.key },
            });
            return await ctx.reply({
              text: t("cmd_value0_value1_el_mensaje_citad_e8b4deba", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_error_de_estado_bb05d222")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
            });
          }

          await sendGroupStatus(sock, remoteJid, {
            type: "text",
            text: statusText,
          });
        }
      } else {
        if (!inputContent) {
          await sock.sendMessage(remoteJid, {
            react: { text: "❌", key: msg.key },
          });
          return await ctx.reply({
            text: t("cmd_value0_value1_ingresa_un_texto_2ac2de6e", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_error_de_estado_bb05d222")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
          });
        }

        await sendGroupStatus(sock, remoteJid, {
          type: "text",
          text: inputContent,
        });
      }

      await sock.sendMessage(remoteJid, {
        react: { text: "✅", key: msg.key },
      });

      return await ctx.reply({
        text: t("cmd_value0_value1_el_estado_se_ha__e8493537", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_estado_publicado_38971c44")), value2: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[gstatus]", error);
      await sock.sendMessage(remoteJid, {
        react: { text: "❌", key: msg.key },
      });

      return await ctx.reply({
        text: t("cmd_value0_value1_value2_value3_81a9f89e", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_error_de_sistema_5c013aab")), value2: message, value3: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    }
  },
};
