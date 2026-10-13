import type { CommandContext } from "../../types/index.d.ts";
import {
  downloadContentFromMessage,
  type MediaType,
  type AnyMessageContent,
  type GroupParticipant,
} from "@whiskeysockets/baileys";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["tag", "tg"],
  category: "group",
  description: t("cmd_mencion_invisible_para_texto_y_9615ae45"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    const quotedContext = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = quotedContext?.quotedMessage;
    const participants = Array.isArray(ctx.groupMeta?.participants)
      ? ctx.groupMeta.participants
      : [];
    const mentions = participants
      .map((participant: GroupParticipant) => participant.id)
      .filter(Boolean);
    const customText = ctx.args.join(" ").trim();
    if (quotedMessage) {
      const type = Object.keys(quotedMessage)[0];
      if (
        [
          "imageMessage",
          "videoMessage",
          "stickerMessage",
          "audioMessage",
          "documentMessage",
        ].includes(type)
      ) {
        const media = quotedMessage[
          type as keyof typeof quotedMessage
        ] as import("../../types/index.d.ts").QuotedMediaItem;
        const stream = await downloadContentFromMessage(
          media as Parameters<typeof downloadContentFromMessage>[0],
          type.replace("Message", "") as MediaType,
        );
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const payload: Record<string, unknown> = { mentions };
        const buffer = Buffer.concat(chunks);
        if (type === "imageMessage") {
          payload.image = buffer;
          payload.caption = customText || media.caption || "";
        } else if (type === "videoMessage") {
          payload.video = buffer;
          payload.caption = customText || media.caption || "";
          payload.gifPlayback = media.gifPlayback || false;
        } else if (type === "stickerMessage") payload.sticker = buffer;
        else if (type === "audioMessage") {
          payload.audio = buffer;
          payload.mimetype = media.mimetype || "audio/mp4";
          payload.ptt = media.ptt || false;
        } else {
          payload.document = buffer;
          payload.mimetype = media.mimetype;
          payload.fileName = media.fileName || "documento";
          payload.caption = customText || media.caption || "";
        }
        return ctx.sock.sendMessage(ctx.from, payload as AnyMessageContent);
      }
    }
    const quotedText =
      quotedMessage?.conversation ||
      quotedMessage?.extendedTextMessage?.text ||
      "";
    const finalText = customText || quotedText;
    if (!finalText)
      return ctx.reply({
        text: t("cmd_value0_value1_debes_escribir_u_0b09f3e8", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_mensaje_dba5d803")), value2: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    return ctx.reply({ text: finalText, mentions });
  },
};
