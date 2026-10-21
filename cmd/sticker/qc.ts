import {
  createCanvas,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import type { proto } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { applyStickerMetadata, toSticker } from "../../core/stickerUtils.ts";
import { QC_CONFIG } from "../../src/controller/qcConfig.ts";

type TextLayout = {
  lines: string[];
  fontSize: number;
  lineHeight: number;
};

function getMessageText(message?: proto.IMessage | null): string {
  if (!message) return "";

  const nested =
    message.ephemeralMessage?.message ??
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.documentWithCaptionMessage?.message;
  if (nested) return getMessageText(nested);

  const content =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    (message.imageMessage
      ? "[Imagen]"
      : message.videoMessage
        ? "[Video]"
        : message.stickerMessage
          ? "[Sticker]"
          : message.audioMessage
            ? "[Audio]"
            : message.documentMessage
              ? "[Documento]"
              : "");
  return typeof content === "string" ? content.trim() : "";
}

function splitLongWord(
  context: SKRSContext2D,
  word: string,
  maxWidth: number,
): string[] {
  const chunks: string[] = [];
  let chunk = "";

  for (const character of Array.from(word)) {
    const candidate = chunk + character;
    if (chunk && context.measureText(candidate).width > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapText(
  context: SKRSContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) lines.push(line);
      const chunks = splitLongWord(context, word, maxWidth);
      line = chunks.pop() ?? "";
      lines.push(...chunks);
    }
    if (line) lines.push(line);
  }

  return lines.length ? lines : [""];
}

function fitText(
  context: SKRSContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  maxLines: number,
  bold: boolean,
): TextLayout {
  let fontSize = startSize;
  let lines: string[] = [];

  while (fontSize > minSize) {
    context.font = `${bold ? "bold " : ""}${fontSize}px ${QC_CONFIG.font.family}`;
    lines = wrapText(context, text, maxWidth);
    if (lines.length <= maxLines) break;
    fontSize -= 2;
  }

  context.font = `${bold ? "bold " : ""}${fontSize}px ${QC_CONFIG.font.family}`;
  lines = wrapText(context, text, maxWidth);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let lastLine = lines[maxLines - 1];
    while (
      lastLine &&
      context.measureText(`${lastLine}…`).width > maxWidth
    ) {
      lastLine = Array.from(lastLine).slice(0, -1).join("");
    }
    lines[maxLines - 1] = `${lastLine}…`;
  }

  return {
    lines,
    fontSize,
    lineHeight: Math.ceil(fontSize * QC_CONFIG.font.lineSpacing),
  };
}

function fitLabel(
  context: SKRSContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  bold = false,
): string {
  context.font = `${bold ? "bold " : ""}${fontSize}px ${QC_CONFIG.font.family}`;
  if (context.measureText(text).width <= maxWidth) return text;

  let label = text;
  while (label && context.measureText(`${label}…`).width > maxWidth) {
    label = Array.from(label).slice(0, -1).join("");
  }
  return `${label}…`;
}

function naturalTextWidth(
  context: SKRSContext2D,
  text: string,
  fontSize: number,
  maxWidth: number,
  bold = false,
): number {
  context.font = `${bold ? "bold " : ""}${fontSize}px ${QC_CONFIG.font.family}`;
  return Math.max(
    ...wrapText(context, text, maxWidth).map((line) =>
      context.measureText(line).width,
    ),
  );
}

function drawLines(
  context: SKRSContext2D,
  layout: TextLayout,
  x: number,
  y: number,
  color: string,
  bold = false,
) {
  context.font = `${bold ? "bold " : ""}${layout.fontSize}px ${QC_CONFIG.font.family}`;
  context.fillStyle = color;
  context.textBaseline = "top";
  layout.lines.forEach((line, index) => {
    context.fillText(line, x, y + index * layout.lineHeight);
  });
}

async function getAvatar(
  sock: CommandContext["sock"],
  jid: string,
): Promise<Image | null> {
  try {
    const url = await sock.profilePictureUrl(jid, "image");
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

function drawAvatar(
  context: SKRSContext2D,
  avatar: Image | null,
  x: number,
  y: number,
  size: number,
  name: string,
) {
  context.save();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.clip();

  if (avatar) {
    context.drawImage(avatar, x, y, size, size);
  } else {
    context.fillStyle = QC_CONFIG.colors.fallbackAvatar;
    context.fillRect(x, y, size, size);
    context.font = `bold 44px ${QC_CONFIG.font.family}`;
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(Array.from(name)[0]?.toUpperCase() || "?", x + size / 2, y + size / 2);
    context.textAlign = "start";
  }
  context.restore();
}

function renderQuoteSticker(
  text: string,
  username: string,
  quote?: { text: string; username: string },
  avatar: Image | null = null,
): Buffer {
  const {
    canvasSize,
    minBubbleWidth,
    maxBubbleWidth,
    avatarSize,
    tailSize,
    horizontalPadding,
    colors,
    font,
    maxLines,
    quote: quoteStyle,
  } = QC_CONFIG;
  const canvas = createCanvas(canvasSize, canvasSize);
  const context = canvas.getContext("2d");
  const maxContentWidth = maxBubbleWidth - horizontalPadding * 2;
  const minContentWidth = minBubbleWidth - horizontalPadding * 2;
  const labelWidth = Math.max(
    naturalTextWidth(context, username, font.username, maxContentWidth),
    quote
      ? naturalTextWidth(
          context,
          quote.username,
          font.quotedUsername,
          maxContentWidth,
        ) + quoteStyle.horizontalPadding * 2
      : 0,
  );
  const messageWidth = Math.max(
    naturalTextWidth(context, text, font.main, maxContentWidth, true),
    quote
      ? naturalTextWidth(
          context,
          quote.text,
          font.quoted,
          maxContentWidth - quoteStyle.horizontalPadding * 2,
          true,
        ) +
          quoteStyle.horizontalPadding * 2
      : 0,
  );
  const contentWidth = Math.max(
    minContentWidth,
    Math.min(maxContentWidth, Math.max(labelWidth, messageWidth)),
  );
  const bubbleWidth = contentWidth + horizontalPadding * 2;
  const bubbleX = Math.round(
    (canvasSize + avatarSize + 8 - bubbleWidth) / 2,
  ) + 20;
  const usernameSize = font.username;
  const usernameLineHeight = Math.ceil(usernameSize * font.lineSpacing);
  const mainLayout = fitText(
    context,
    text,
    contentWidth,
    font.main,
    font.mainMinimum,
    maxLines.main,
    true,
  );

  const quoteLayout = quote
    ? fitText(
        context,
        quote.text,
        contentWidth - quoteStyle.horizontalPadding * 2,
        font.quoted,
        font.quotedMinimum,
        maxLines.quoted,
        true,
      )
    : null;
  const quoteUsernameSize = font.quotedUsername;
  const quoteUsernameLineHeight = Math.ceil(
    quoteUsernameSize * font.lineSpacing,
  );
  const quoteBoxHeight = quoteLayout
    ? quoteStyle.verticalPadding +
      quoteUsernameLineHeight +
      5 +
      quoteLayout.lineHeight * quoteLayout.lines.length +
      quoteStyle.verticalPadding
    : 0;

  const topPadding = 30;
  const gapAfterQuote = quoteLayout ? 24 : 0;
  const gapAfterUsername = 20;
  const bottomPadding = 34;
  const bubbleHeight = Math.max(
    204,
    topPadding +
      quoteBoxHeight +
      gapAfterQuote +
      usernameLineHeight +
      gapAfterUsername +
      mainLayout.lineHeight * mainLayout.lines.length +
      bottomPadding,
  );
  const bubbleY = Math.round((canvasSize - bubbleHeight) / 2);
  const avatarX = bubbleX - avatarSize - 50;
  const avatarY = bubbleY - Math.round(avatarSize / 2) + 50;

  context.fillStyle = colors.bubble;
  context.beginPath();
  context.moveTo(bubbleX - tailSize, bubbleY);
  context.lineTo(bubbleX + bubbleWidth - 34, bubbleY);
  context.quadraticCurveTo(
    bubbleX + bubbleWidth,
    bubbleY,
    bubbleX + bubbleWidth,
    bubbleY + 34,
  );
  context.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - 34);
  context.quadraticCurveTo(
    bubbleX + bubbleWidth,
    bubbleY + bubbleHeight,
    bubbleX + bubbleWidth - 34,
    bubbleY + bubbleHeight,
  );
  context.lineTo(bubbleX + 34, bubbleY + bubbleHeight);
  context.quadraticCurveTo(
    bubbleX,
    bubbleY + bubbleHeight,
    bubbleX,
    bubbleY + bubbleHeight - 34,
  );
  context.lineTo(bubbleX, bubbleY + tailSize);
  context.closePath();
  context.fill();

  drawAvatar(
    context,
    avatar,
    avatarX,
    avatarY,
    avatarSize,
    username.replace(/^@/, ""),
  );

  let contentY = bubbleY + topPadding;
  if (quote && quoteLayout) {
    const quoteX = bubbleX + horizontalPadding;
    const quoteY = contentY;
    const quoteWidth = contentWidth;
    context.fillStyle = colors.quotedBubble;
    context.beginPath();
    context.roundRect(
      quoteX,
      quoteY,
      quoteWidth,
      quoteBoxHeight,
      quoteStyle.borderRadius,
    );
    context.fill();

    context.save();
    context.beginPath();
    context.roundRect(
      quoteX,
      quoteY,
      quoteWidth,
      quoteBoxHeight,
      quoteStyle.borderRadius,
    );
    context.clip();
    context.fillStyle = colors.quoteAccent;
    context.fillRect(quoteX, quoteY, quoteStyle.accentWidth, quoteBoxHeight);
    context.restore();

    const quoteContentX = quoteX + quoteStyle.horizontalPadding;
    let quoteContentY = quoteY + quoteStyle.verticalPadding;
    context.font = `${quoteUsernameSize}px ${font.family}`;
    context.fillStyle = colors.username;
    context.textBaseline = "top";
    context.fillText(
      fitLabel(
        context,
        quote.username,
        quoteWidth - quoteStyle.horizontalPadding * 2,
        quoteUsernameSize,
      ),
      quoteContentX,
      quoteContentY,
    );
    quoteContentY += quoteUsernameLineHeight + 0;
    drawLines(
      context,
      quoteLayout,
      quoteContentX,
      quoteContentY,
      colors.text,
      true,
    );
    contentY += quoteBoxHeight + gapAfterQuote;
  }

  context.font = `${usernameSize}px ${font.family}`;
  context.fillStyle = colors.username;
  context.textBaseline = "top";
  context.fillText(
    fitLabel(context, username, contentWidth, usernameSize),
    bubbleX + horizontalPadding,
    contentY,
  );
  contentY += usernameLineHeight + gapAfterUsername;
  drawLines(
    context,
    mainLayout,
    bubbleX + horizontalPadding,
    contentY,
    colors.text,
    true,
  );

  return canvas.toBuffer("image/png");
}

function formatUsername(name: string | null | undefined, fallback: string) {
  const value = (name || fallback).trim().replace(/^@/, "");
  return `@${value || "Usuario"}`;
}

export default {
  name: ["qc"],
  category: "sticker",
  description: "Convierte un texto en un sticker de cita.",
  hideCmd: true,
  async run({ args, msg, sock, sender, from, db, react, reply }: CommandContext) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = contextInfo?.quotedMessage;
    const quotedText = getMessageText(quotedMessage);
    const commandText = args.join(" ").trim();
    const text = commandText || quotedText;

    if (!text) {
      return reply("Escribe un texto o responde a un mensaje con .qc.");
    }

    await react("⏳");
    try {
      const senderName = formatUsername(msg.pushName, sender.split("@")[0]);
      const quote =
        commandText && quotedText
          ? {
              text: quotedText,
              username: formatUsername(
                contextInfo?.participant
                  ? db.getUser(contextInfo.participant).username
                  : !from.endsWith("@g.us")
                    ? db.getUser(from).username
                    : null,
                "Usuario citado",
              ),
            }
          : undefined;
      const avatar = await getAvatar(sock, sender);
      const image = renderQuoteSticker(text, senderName, quote, avatar);
      const sticker = await toSticker(image, false);
      const stickerWithMetadata = await applyStickerMetadata(
        sticker,
        db,
        sender,
        msg.pushName,
      );
      await react("✅");
      return reply({ sticker: stickerWithMetadata, mimetype: "image/webp" });
    } catch (error: unknown) {
      await react("❌");
      return reply(
        `No se pudo crear el sticker: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
