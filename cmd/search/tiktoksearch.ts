import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { formatCount, requestJson } from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import { SEARCH_RESULTS_TEMPLATE } from "../../utils/template.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["ttsearch", "tiktoksearch", "tts"],
  category: "search",
  description: t("cmd_busca_videos_en_tiktok_51853c10"),
  async run({ args, reply, react, sock, from, msg, sender }: CommandContext) {
    const query = args.join(" ").trim();
    if (!query)
      return reply(t("cmd_proporciona_un_termino_de_busq_d4f8bbb9"));
    await react("🔍");
    try {
      const api = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
      const response = await requestJson(
        `${api}/search/tiktok?query=${encodeURIComponent(query)}&key=${DL_CONFIG.alya.API_KEY}`,
      );
      const results = Array.isArray(response?.data)
        ? response.data.slice(0, 5)
        : [];
      if (!response?.status || !results.length)
        throw new Error("No se encontraron resultados en TikTok.");
      const text = SEARCH_RESULTS_TEMPLATE({
        bold: fytBold,
        label: t("cmd_tiktok_search_90afa0bb"),
        icon: t("cmd_text_71ceeba5"),
        query,
        engine: t("cmd_alya_core_44fc62cc"),
        results: results.map((video) => ({
          title: video.title || t("cmd_sin_titulo_fd8beeee"),
          artist: t("cmd_value0_value1_5c867ac4", { value0: video.author?.unique_id || "desconocido", value1: video.author?.nickname || "Sin nombre" }),
          duration: t("cmd_value0_value1_187f370d", { value0: formatCount(video.stats?.plays), value1: formatCount(video.stats?.likes) }),
          url: video.url || t("cmd_no_disponible_9def5fe2"),
        })),
      });
      const firstVideo = results[0];
      const title = firstVideo.title || "Resultado de TikTok";
      const link =
        firstVideo.url ||
        `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
      const hasPreview = firstVideo.cover
        ? await sendDownloadPreview({
            sock,
            from,
            msg,
            thumbnail: firstVideo.cover,
            caption: text,
            link,
            title,
            author: firstVideo.author?.nickname || "TikTok",
            sender,
          })
        : false;
      if (!hasPreview) await reply({ text });
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_error_value0_a4bb764e", { value0: error instanceof Error ? error.message : String(error) || "No se pudo buscar en TikTok." }),
      });
    }
  },
};
