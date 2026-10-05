import type { CommandContext } from "../../types/index.d.ts";
import { downloadMediaMessage } from "@whiskeysockets/baileys";

export default {
  name: ["hd", "remini", "upscale", "enhance"],
  category: "utils",
  description: "Mejora la calidad de una imagen.",
  async run(ctx: CommandContext) {
    const { msg, args, reply, react } = ctx;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const source = msg.message?.imageMessage || quoted?.imageMessage;
    if (!source)
      return reply({
        text: "❌ Responde a una imagen o envía una imagen con .hd [2 o 4].",
      });
    const scale = Number(args[0]) === 4 ? 4 : 2;
    await react("⏳");
    try {
      const mediaMessage = quoted?.imageMessage
        ? { key: msg.key, message: { imageMessage: quoted.imageMessage } }
        : msg;
      const buffer = await downloadMediaMessage(
        mediaMessage as unknown as import("@whiskeysockets/baileys").WAMessage,
        "buffer",
        {},
        {
          logger: console as unknown as Parameters<
            typeof import("@whiskeysockets/baileys").downloadMediaMessage
          >[3]["logger"],
          reuploadRequest: ctx.sock.updateMediaMessage,
        },
      );
      const form = new FormData();
      form.append("method", "local");
      form.append("scale", String(scale));
      form.append(
        "file",
        new Blob([buffer], { type: source.mimetype || "image/jpeg" }),
        source.mimetype?.includes("png") ? "image.png" : "image.jpg",
      );
      const response = await fetch(
        "https://api.alyacore.xyz/tools/upscale?key=AURA-BOT-JERIELB",
        { method: "POST", body: form, signal: AbortSignal.timeout(120000) },
      );
      if (!response.ok) {
        const details = (await response.text()).slice(0, 300);
        throw new Error(
          response.status === 504
            ? "AlyaCore agotó el tiempo de procesamiento (504). Prueba nuevamente o con escala 2x."
            : `AlyaCore respondió HTTP ${response.status}: ${details}`,
        );
      }
      const result = Buffer.from(await response.arrayBuffer());
      if (response.headers.get("content-type")?.includes("application/json"))
        throw new Error("AlyaCore devolvió una respuesta JSON en vez de una imagen.");
      await reply({
        image: result,
        caption: `╭━━━━〔 ✨ 𝐈𝐌𝐀𝐆𝐄𝐍 𝐇𝐃 〕━━━⬣\n\n┃ ➥ 𝐄𝐬𝐜𝐚𝐥𝐚 › ${scale}x\n\n╰━━〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐀𝐂𝐓𝐈𝐕𝐄 〕━━⬣`,
      });
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `❌ No se pudo procesar la imagen: ${error instanceof Error ? error.message : String(error) || "error desconocido"}`,
      });
    }
  },
};
