import type { CommandContext } from "../../types/index.d.ts";
import { request } from "undici";
import { fytBold } from "../../core/socketText.ts";
import { DL_CONFIG } from "../../config.ts";
import { applyStickerMetadata, toSticker } from "../../core/stickerUtils.ts";

async function getSticker(url: URL): Promise<Buffer> {
  const response = await request(url, { signal: AbortSignal.timeout(60000) });
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(`HTTP ${response.statusCode}`);
  const raw = Buffer.from(await response.body.arrayBuffer());
  const text = raw.toString("utf8").trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    const data = JSON.parse(text);
    const payload = data.image || data.result || data.data || data.sticker;
    if (!payload) throw new Error("La API no devolvió una imagen válida.");
    return Buffer.from(String(payload).replace(/^data:[^,]+,/, ""), "base64");
  }
  return raw;
}

export default {
  name: ["bratv", "bratvid", "bratvideo", "bratstickervideo"],
  category: "sticker",
  description: "Convierte texto en sticker estilo brat.",
  async run({ args, msg, db, sender, react, reply }: CommandContext) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText =
      quoted?.conversation || quoted?.extendedTextMessage?.text || "";
    const text = args.join(" ").trim() || quotedText;
    if (!text) {
      return reply({
        text: `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA TEXTO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Escribe un texto o responde a un mensaje.\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
      });
    }
    await react("⏳");
    try {
      const api = DL_CONFIG.faaApi.BASE_URL.replace(/\/+$/, "");
      const url = new URL(`${api}/faa/bratvid`);
      url.searchParams.set("text", text);
      const output = await toSticker(await getSticker(url), true);
      const finalSticker = await applyStickerMetadata(
        output,
        db,
        sender,
        msg.pushName,
      );
      await react("✅");
      return reply({ sticker: finalSticker, mimetype: "image/webp" });
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ERROR AL CREAR STICKER\n╰━━━━━━━━━━━━⬣\n\n┃ > ${error instanceof Error ? error.message : String(error) || "No se pudo generar el sticker."}\n╰〔 ⚡ SYSTEM 〕⬣`,
      });
    }
  },
};
