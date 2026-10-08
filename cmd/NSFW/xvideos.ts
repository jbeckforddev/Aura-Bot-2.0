import type { CommandContext } from "../../types/commands";
import { fytBold } from "../../core/socketText.ts";
import { DL_CONFIG } from "../../config.ts";
import { downloadToCache, requestJson } from "../../core/downloadUtils.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { DL_TEMPLATE, SEARCH_RESULTS_TEMPLATE } from "../../utils/template.ts";

const API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const KEY = DL_CONFIG.alya.API_KEY;

/** Respuesta del endpoint de búsqueda / descarga */
interface XvideosResult {
  title?: string;
  resolution?: string;
  duration?: string;
  artist?: string;
  cover?: string;
  url?: string;
}

interface XvideosApiResponse {
  status?: boolean;
  creator?: string;
  /** Resultado único al descargar por URL */
  result?: XvideosResult;
  /** Lista de resultados al buscar */
  resultados?: XvideosResult[];
  /** URL directa del video mp4 (descarga) */
  download?: string;
  url?: string;
}

/** Devuelve true si el string es una URL válida de xvideos */
function isXvideosUrl(text: string): boolean {
  return /^https?:\/\/(www\.)?xvideos\.com\//i.test(text.trim());
}

export default {
  name: ["xv", "xvideos", "xvid"],
  category: "nsfw",
  description: "Busca videos de XVideos y descarga por enlace.",
  premiumOnly: true,

  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const query = args.join(" ").trim();

    if (!query) {
      return reply({
        text: `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA BÚSQUEDA")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Proporciona una búsqueda o\n┃ > un enlace de XVideos.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
      });
    }

    await react("⏳");

    if (isXvideosUrl(query)) {
      try {
        const data = await requestJson<XvideosApiResponse>(
          `${API}/nsfw/dl/xvideos?url=${encodeURIComponent(query)}&key=${KEY}`,
          90000,
        );

        const videoUrl = data?.download || data?.url || data?.result?.url;

        if (!data?.status || !videoUrl) {
          throw new Error("La API no devolvió un video descargable.");
        }

        const info = data.result ?? {};
        const title = info.title || "Video XVideos";
        const artist = info.artist || "Desconocido";
        const resolution = info.resolution?.replace(/(.+)\1/, "$1") || "HD";
        const duration = info.duration || "";

        const file = await downloadToCache(videoUrl, 180000);
        const { cost } = await prepareDownloadCharge(ctx, "video", file);

        const caption = DL_TEMPLATE({
          bold: fytBold,
          label: "XVIDEOS",
          icon: "🎥",
          title,
          author: artist,
          quality: resolution,
          duration,
          cost: formatMoney(cost, ctx),
          url: query,
          showAuthor: true,
          showQuality: true,
          showDuration: Boolean(duration),
          loadingText: "✅ Video listo",
        });

        await reply({
          video: { url: file },
          mimetype: "video/mp4",
          fileName: "xvideos.mp4",
          caption,
        });

        confirmDownloadCharge(ctx);
        await react("✅");
      } catch (error: unknown) {
        await react("❌");
        return reply({
          text: `${error instanceof Error ? error.message : "No se pudo descargar el video."}`,
        });
      }
      return;
    }

    try {
      const searchData = await requestJson<XvideosApiResponse>(
        `${API}/nsfw/search/xvideos?query=${encodeURIComponent(query)}&key=${KEY}`,
        60000,
      ).catch(() => null);

      const results: XvideosResult[] = Array.isArray(searchData?.resultados)
        ? searchData.resultados
        : [];

      if (results.length === 0) {
        throw new Error(`No se encontraron resultados para "${query}".`);
      }

      const searchCaption = SEARCH_RESULTS_TEMPLATE({
        bold: fytBold,
        label: "XVIDEOS SEARCH",
        icon: "🔞",
        query,
        engine: "XVideos API",
        results: results.slice(0, 5).map((result) => ({
          title: result.title || "Sin título",
          artist: result.artist,
          duration: result.duration,
          url: result.url,
        })),
      });

      await react("✅");
      return reply({ text: searchCaption });
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("SIN RESULTADOS")}\n╰━━━━━━━━━━━━⬣\n\n┃ > ${error instanceof Error ? error.message : `No se encontraron resultados para "${query}".`}\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
      });
    }
  },
};
