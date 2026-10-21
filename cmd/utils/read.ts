import type { CommandContext } from "../../types/index.d.ts";
import { downloadMediaMessage, type proto } from "baileys";
import { fytBold } from "../../core/socketText.ts";
import { sendMessageWithRateLimit } from "../../core/mediaSendUtils.ts";
import { t } from "../../src/langs/index.ts";


function unwrapMessage(
  message: proto.IMessage | null | undefined,
): proto.IMessage | null {
  if (!message) return null;
  if (
    message.imageMessage ||
    message.videoMessage ||
    message.documentMessage ||
    message.audioMessage
  )
    return message;
  if (message.viewOnceMessageV2?.message)
    return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage?.message)
    return unwrapMessage(message.viewOnceMessage.message);
  if (message.documentWithCaptionMessage?.message)
    return unwrapMessage(message.documentWithCaptionMessage.message);
  return null;
}

function getMediaCaption(message: proto.IMessage | null | undefined): string {
  return (
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    ""
  );
}

export default {
  name: ["read"],
  category: "utils",
  description: t("cmd_extrae_y_reenvia_medios_de_vis_cb89e41c"),
  async run({ sock, msg, from, reply, react }: CommandContext) {
    const context = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = context?.quotedMessage;
    const target = unwrapMessage(quotedMessage);
    if (!target)
      return reply({
        text: t("cmd_value0_value1_responde_a_una_i_d291d4e7", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_mensaje_valido_cefa950d")) }),
      });
    await react("⏳");
    try {
      const buffer = await downloadMediaMessage(
        {
          key: msg.key,
          message: target,
        } as import("baileys").WAMessage,
        "buffer",
        {},
        {
          logger: console as unknown as Parameters<
            typeof downloadMediaMessage
          >[3]["logger"],
          reuploadRequest: sock.updateMediaMessage,
        },
      );
      if (!buffer?.length) throw new Error("No se pudo descargar el medio.");
      const quoted = {
        key: {
          remoteJid: from,
          id: context?.stanzaId || msg.key.id,
          participant: context?.participant,
        },
        message: quotedMessage,
      };
      const originalCaption = getMediaCaption(target);
      const caption =
        originalCaption ||
        t("cmd_value0_8255ee52", { value0: fytBold(target.imageMessage ? "Aquí tienes la imagen" : "Aquí tienes el video") });
      if (target.imageMessage)
        await sendMessageWithRateLimit(
          sock,
          from,
          { image: buffer, caption },
          { quoted },
        );
      else if (target.videoMessage)
        await sendMessageWithRateLimit(
          sock,
          from,
          { video: buffer, caption },
          { quoted },
        );
      else throw new Error("Solo se admiten imágenes y videos.");
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_value0_6b94fc8b", { value0: error instanceof Error ? error.message : String(error) || "No pude extraer el medio." }),
      });
    }
  },
};
