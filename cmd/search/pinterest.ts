import type {
  CommandContext,
  PinterestSearchResponse,
  PinterestItem,
} from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { downloadToCache, requestJson } from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import { sendAlbumMessage } from "../../core/mediaSendUtils.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
  getBotCurrency,
} from "../../core/economyConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["pin", "pinterest"],
  category: "search",
  description: t("cmd_busca_imagenes_en_pinterest_803082be"),
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg } = ctx;
    const query = args.join(" ").trim();
    if (!query)
      return reply(t("cmd_proporciona_una_consulta_para__2d2b1b70"));
    await react("🔍");
    try {
      const api = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
      const response = await requestJson<PinterestSearchResponse>(
        `${api}/search/pinterest?query=${encodeURIComponent(query)}&key=${DL_CONFIG.alya.API_KEY}`,
      );
      const results = Array.isArray(response?.data)
        ? response.data.slice(0, 6)
        : [];
      const urls = results
        .map((item: string | PinterestItem) =>
          typeof item === "string" ? item : item.hd || item.mini || item.image,
        )
        .filter(
          (url: unknown): url is string =>
            typeof url === "string" && /^https?:\/\//.test(url),
        );
      if (!response?.status || !urls.length)
        throw new Error("Sin imágenes válidas.");
      const files: string[] = [];
      let cost = 0;
      for (const imageUrl of urls) {
        const file = await downloadToCache(imageUrl, 60000);
        cost = (await prepareDownloadCharge(ctx, "image", file)).cost;
        files.push(file);
      }
      const caption = `╭━━〔 ${fytBold(t("cmd_pinterest_search_4ead7460"))} 〕━━⬣\n┃ 🔍 Pin: ${query}\n┃ 💰 ${getBotCurrency(ctx).name}: ${formatMoney(cost, ctx)}\n┃ ⚙️ Motor: › Alya Core\n╰〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))} 〕⬣`;
      const album = files.map((file, index) => ({
        image: { url: file },
        caption: index === 0 ? caption : "",
      }));
      if (album.length === 1) await reply(album[0]);
      else await sendAlbumMessage(sock, from, album, msg);
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_error_value0_a4bb764e", { value0: error instanceof Error ? error.message : String(error) || "No se encontraron imágenes." }),
      });
    }
  },
};
