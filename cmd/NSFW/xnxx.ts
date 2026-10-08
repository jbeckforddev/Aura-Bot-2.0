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

interface XnxxSearchResult {
  title?: string;
  views?: string;
  resolution?: string;
  duration?: string;
  cover?: string;
  url?: string;
}

interface XnxxSearchResponse {
  status?: boolean;
  creator?: string;
  resultados?: XnxxSearchResult[];
}

interface XnxxDownloadResponse {
  status?: boolean;
  creator?: string;
  resultado?: {
    videos?: {
      low?: string;
      high?: string;
      HLS?: string;
    };
    thumb?: string;
  };
}

// ─── Helpers ─────

/** Devuelve true si el texto es una URL válida de xnxx */
function isXnxxUrl(text: string): boolean {
  return /^https?:\/\/(www\.)?xnxx\.com\//i.test(text.trim());
}

/** Elige la mejor URL de video disponible (high > low > HLS) */
function pickVideoUrl(
  videos?: XnxxDownloadResponse["resultado"]["videos"],
): string {
  return videos?.high || videos?.low || videos?.HLS || "";
}

// ─── Comando ───────

export default {
  name: ["xnxx", "xn"],
  category: "nsfw",
  description: "Busca videos de XNXX y descarga por enlace.",

  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const query = args.join(" ").trim();

    if (!query) {
      return reply({
        text: `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA BÚSQUEDA")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Proporciona una búsqueda o\n┃ > un enlace de XNXX.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
      });
    }

    await react("⏳");

    if (isXnxxUrl(query)) {
      try {
        const data = await requestJson<XnxxDownloadResponse>(
          `${API}/nsfw/dl/xnxx?url=${encodeURIComponent(query)}&key=${KEY}`,
          90000,
        );

        const videoUrl = pickVideoUrl(data?.resultado?.videos);

        if (!data?.status || !videoUrl) {
          throw new Error("La API no devolvió un video descargable.");
        }

        const file = await downloadToCache(videoUrl, 180000);
        const { cost } = await prepareDownloadCharge(ctx, "video", file);

        const caption = DL_TEMPLATE({
          bold: fytBold,
          label: "XNXX",
          icon: "🎥",
          type: "Video MP4",
          cost: formatMoney(cost, ctx),
          url: query,
          showType: true,
          loadingText: "✅ Video listo",
        });

        await reply({
          video: { url: file },
          mimetype: "video/mp4",
          fileName: "xnxx.mp4",
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
      const searchData = await requestJson<XnxxSearchResponse>(
        `${API}/nsfw/search/xnxx?query=${encodeURIComponent(query)}&key=${KEY}`,
        60000,
      ).catch(() => null);

      const results: XnxxSearchResult[] = Array.isArray(searchData?.resultados)
        ? searchData.resultados
        : [];

      if (results.length === 0) {
        throw new Error(`No se encontraron resultados para "${query}".`);
      }

      const searchCaption = SEARCH_RESULTS_TEMPLATE({
        bold: fytBold,
        label: "XNXX SEARCH",
        icon: "🔞",
        query,
        engine: "XNXX API",
        results: results.slice(0, 5).map((result) => ({
          title: result.title || "Sin título",
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
