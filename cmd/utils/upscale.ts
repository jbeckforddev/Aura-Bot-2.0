import type { CommandContext } from "../../types/index.d.ts";
import { downloadMediaMessage } from "baileys";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["hd", "remini", "upscale", "enhance"],
  category: "utils",
  description: t("cmd_mejora_la_calidad_de_una_image_98411212"),
  async run(ctx: CommandContext) {
    const { msg, args, reply, react } = ctx;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const source = msg.message?.imageMessage || quoted?.imageMessage;
    if (!source)
      return reply({
        text: t("cmd_responde_a_una_imagen_o_envia__027c69b5"),
      });
    const scale = Number(args[0]) === 4 ? 4 : 2;
    await react("⏳");
    try {
      const mediaMessage = quoted?.imageMessage
        ? { key: msg.key, message: { imageMessage: quoted.imageMessage } }
        : msg;
      const buffer = await downloadMediaMessage(
        mediaMessage as unknown as import("baileys").WAMessage,
        "buffer",
        {},
        {
          logger: console as unknown as Parameters<
            typeof import("baileys").downloadMediaMessage
          >[3]["logger"],
          reuploadRequest: ctx.sock.updateMediaMessage,
        },
      );
      const form = new FormData();
      form.append("method", "local");
      form.append("scale", String(scale));
      form.append(
        "file",
        new Blob([Uint8Array.from(buffer).buffer as ArrayBuffer], {
          type: source.mimetype || "image/jpeg",
        }),
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
        caption: t("cmd_value0_x_d72a94dd", { value0: scale }),
      });
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_no_se_pudo_procesar_la_imagen__73d5d0e0", { value0: error instanceof Error ? error.message : String(error) || "error desconocido" }),
      });
    }
  },
};
