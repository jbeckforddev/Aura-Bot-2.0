import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { formatCount, requestJson } from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import { SEARCH_RESULTS_TEMPLATE } from "../../utils/template.ts";

export default {
  name: ["ttsearch", "tiktoksearch", "tts"],
  category: "search",
  description: "Busca videos en TikTok.",
  async run({ args, reply, react, sock, from, msg, sender }: CommandContext) {
    const query = args.join(" ").trim();
    if (!query)
      return reply("⚠️ Proporciona un término de búsqueda para TikTok.");
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
        label: "TIKTOK SEARCH",
        icon: "🎵",
        query,
        engine: "Alya Core",
        results: results.map((video) => ({
          title: video.title || "Sin título",
          artist: `@${video.author?.unique_id || "desconocido"} (${video.author?.nickname || "Sin nombre"})`,
          duration: `${formatCount(video.stats?.plays)} / ${formatCount(video.stats?.likes)}`,
          url: video.url || "No disponible",
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
        text: `❌ Error: ${error instanceof Error ? error.message : String(error) || "No se pudo buscar en TikTok."}`,
      });
    }
  },
};
