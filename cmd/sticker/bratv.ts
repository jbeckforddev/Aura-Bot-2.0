import type { CommandContext } from "../../types/index.d.ts";
import { request } from "undici";
import { fytBold } from "../../core/socketText.ts";
import { DL_CONFIG } from "../../config.ts";
import { applyStickerMetadata, toSticker } from "../../core/stickerUtils.ts";
import { t } from "../../src/langs/index.ts";


async function getSticker(url: URL): Promise<Buffer> {
  const response = await request(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Cache-Control": "no-cache, no-store",
      Pragma: "no-cache",
    },
    signal: AbortSignal.timeout(60000),
  });
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
  description: t("cmd_convierte_texto_en_sticker_est_83567fb0"),
  async run({ args, msg, db, sender, react, reply }: CommandContext) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText =
      quoted?.conversation || quoted?.extendedTextMessage?.text || "";
    const text = args.join(" ").trim() || quotedText;
    if (!text) {
      return reply({
        text: t("cmd_value0_value1_escribe_un_texto_e5c7f80c", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_texto_c2677da2")), value2: fytBold(t("cmd_system_29d43743")) }),
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
        text: t("cmd_value0_error_al_crear_sticker__fc8ff0d0", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: error instanceof Error ? error.message : String(error) || "No se pudo generar el sticker." }),
      });
    }
  },
};
