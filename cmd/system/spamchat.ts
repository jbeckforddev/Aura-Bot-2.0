import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import { downloadContentFromMessage } from "baileys";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

async function extractMediaBuffer(msg: any): Promise<{ buffer: Buffer; mimetype: string; isSticker: boolean } | null> {
  const root =
    msg?.message?.ephemeralMessage?.message ||
    msg?.message?.viewOnceMessage?.message ||
    msg?.message;

  const ctxInfo = root?.extendedTextMessage?.contextInfo || null;
  const targetMsg = ctxInfo?.quotedMessage ? (ctxInfo.quotedMessage.ephemeralMessage?.message || ctxInfo.quotedMessage) : root;

  let mediaNode = null;
  let mediaType: "image" | "video" | "sticker" | "document" | null = null;

  if (targetMsg?.imageMessage) {
    mediaNode = targetMsg.imageMessage;
    mediaType = "image";
  } else if (targetMsg?.videoMessage) {
    mediaNode = targetMsg.videoMessage;
    mediaType = "video";
  } else if (targetMsg?.stickerMessage) {
    mediaNode = targetMsg.stickerMessage;
    mediaType = "sticker";
  } else if (targetMsg?.documentMessage) {
    mediaNode = targetMsg.documentMessage;
    mediaType = "document";
  }

  if (!mediaNode || !mediaType) return null;

  try {
    const stream = await downloadContentFromMessage(mediaNode, mediaType === "sticker" ? "sticker" : mediaType);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) return null;
    return {
      buffer,
      mimetype: mediaNode.mimetype || (mediaType === "image" ? "image/jpeg" : mediaType === "video" ? "video/mp4" : "image/webp"),
      isSticker: mediaType === "sticker",
    };
  } catch {
    return null;
  }
}

export default {
  name: ["spamchat", "spam", "masspam", "multispam"],
  category: "system",
  description: "Envía spam masivo a un número usando todas las instancias del clúster de subbots con control de repetición y flags.",
  groupOnly: false,
  ownerOnly: false,
  premiumOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, msg, args, isOwner, sender, db } = ctx;

    const rawSender = String(sender || msg.key?.participant || "");
    const cleanNum = rawSender.split("@")[0].split(":")[0].replace(/\D/g, "");
    const dbAny = db as any;
    const authorized =
      Boolean(isOwner) ||
      Boolean(msg.key?.fromMe) ||
      cleanNum === "573118353868" ||
      Boolean(dbAny?.hasRole?.(rawSender, "owner")) ||
      Boolean(cleanNum && dbAny?.hasRole?.(`${cleanNum}@s.whatsapp.net`, "owner"));

    if (!authorized) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ *Acceso denegado:* Este comando es exclusivo para los propietarios del bot.");
    }

    if (args.length === 0) {
      return reply(
        `🚨 *${fytBold("USO INCORRECTO DEL COMANDO SPAM")}* 🚨\n\n` +
          `📌 *Sintaxis:* \`.spam <número> <mensaje> [flags]\`\n\n` +
          `🛠️ *Flags disponibles:*\n` +
          `• \`-n <número>\` : Repite el envío N veces por cada subbot (Ej: \`-n 5\`).\n` +
          `• \`-delay <ms>\` : Retraso en milisegundos entre cada mensaje (Ej: \`-delay 1000\`).\n` +
          `• \`-all\` : Usa tanto el bot principal como todos los subbots activos.\n` +
          `• \`-subonly\` : Omite el bot principal y usa únicamente los subbots.\n\n` +
          `📌 *Ejemplo:* \`.spam +573114191302 Hola bro -n 10 -delay 500 -all\``
      );
    }

    const rawTarget = String(args[0] || "").trim();
    const cleanPhone = rawTarget.replace(/\D/g, "");

    if (cleanPhone.length < 7) {
      await react("❌").catch(() => undefined);
      return reply("❌ *Número inválido:* Debes especificar un número con prefijo de país (Ej: +573114191302).");
    }

    const targetJid = `${cleanPhone}@s.whatsapp.net`;
    const remainingArgs = args.slice(1);

    let count = 1;
    let delayMs = 300;
    let useMain = true;
    let useSubs = true;
    const textWords: string[] = [];

    for (let i = 0; i < remainingArgs.length; i++) {
      const arg = remainingArgs[i];
      if (arg === "-n" && remainingArgs[i + 1]) {
        const parsed = parseInt(remainingArgs[i + 1], 10);
        if (!isNaN(parsed) && parsed > 0) count = Math.min(50, parsed);
        i++;
      } else if (arg === "-delay" && remainingArgs[i + 1]) {
        const parsed = parseInt(remainingArgs[i + 1], 10);
        if (!isNaN(parsed) && parsed >= 0) delayMs = Math.min(10000, parsed);
        i++;
      } else if (arg === "-all") {
        useMain = true;
        useSubs = true;
      } else if (arg === "-subonly") {
        useMain = false;
        useSubs = true;
      } else {
        textWords.push(arg);
      }
    }

    const messageText = textWords.join(" ").trim();
    const mediaInfo = await extractMediaBuffer(msg);

    if (!messageText && !mediaInfo) {
      return reply("❌ Debes incluir un mensaje de texto o responder/adjuntar una imagen, video o sticker para hacer spam.");
    }

    await react("🚀").catch(() => undefined);

    let subBots: any[] = [];
    try {
      if (typeof getActiveSubBots === "function") {
        subBots = getActiveSubBots() || [];
      }
    } catch {
      subBots = [];
    }

    const activeSockets: Array<{ sock: any; label: string }> = [];
    if (useMain && sock) {
      activeSockets.push({ sock, label: "MainBot" });
    }
    if (useSubs && subBots.length > 0) {
      subBots.forEach((s, idx) => {
        if (s && typeof s.sendMessage === "function") {
          activeSockets.push({ sock: s, label: `SubBot #${idx + 1}` });
        }
      });
    }

    if (activeSockets.length === 0) {
      await react("❌").catch(() => undefined);
      return reply("❌ No hay ninguna instancia de bot activa (ni Main ni Subbots) para ejecutar el spam.");
    }

    let totalSent = 0;
    let totalErrors = 0;

    for (let c = 0; c < count; c++) {
      for (const instance of activeSockets) {
        try {
          if (mediaInfo) {
            const payload = mediaInfo.isSticker
              ? { sticker: mediaInfo.buffer }
              : mediaInfo.mimetype.startsWith("video/")
              ? { video: mediaInfo.buffer, caption: messageText || undefined, mimetype: mediaInfo.mimetype }
              : { image: mediaInfo.buffer, caption: messageText || undefined, mimetype: mediaInfo.mimetype };

            await instance.sock.sendMessage(targetJid, payload);
          } else if (messageText) {
            await instance.sock.sendMessage(targetJid, { text: messageText });
          }
          totalSent++;
        } catch {
          totalErrors++;
        }

        if (delayMs > 0) {
          await new Promise((res) => setTimeout(res, delayMs));
        }
      }
    }

    await react("✅").catch(() => undefined);
    return reply(
      `🚀 *${fytBold("REPORTE DE SPAM ENVIADO")}* 🚀\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 *Objetivo:* \`+${cleanPhone}\`\n` +
        `🤖 *Instancias usadas:* \`${activeSockets.length}\` (Main + Subbots)\n` +
        `🔄 *Rondas / Ciclos (-n):* \`${count}\`\n` +
        `⏱️ *Retardo (-delay):* \`${delayMs} ms\`\n` +
        `📤 *Mensajes exitosos:* \`${totalSent}\`\n` +
        `❌ *Fallidos:* \`${totalErrors}\``
    );
  },
};
