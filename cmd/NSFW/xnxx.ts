import { rm } from "node:fs/promises";
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
import { t } from "../../src/langs/index.ts";


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
  description: t("cmd_busca_videos_de_xnxx_y_descarg_daa326fb"),

  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const query = args.join(" ").trim();

    if (!query) {
      return reply({
        text: t("cmd_value0_value1_proporciona_una__534fe98a", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_busqueda_7c18b4d5")), value2: fytBold(t("cmd_system_29d43743")) }),
      });
    }

    await react("⏳").catch(() => undefined);

    if (isXnxxUrl(query)) {
      let downloadedFile = "";
      try {
        const data = await requestJson<XnxxDownloadResponse>(
          `${API}/nsfw/dl/xnxx?url=${encodeURIComponent(query)}&key=${KEY}`,
          90000,
        );

        const videoUrl = pickVideoUrl(data?.resultado?.videos);

        if (!data?.status || !videoUrl) {
          throw new Error("La API no devolvió un video descargable.");
        }

        downloadedFile = await downloadToCache(videoUrl, 180000);
        const { cost } = await prepareDownloadCharge(ctx, "video", downloadedFile);

        const caption = DL_TEMPLATE({
          bold: fytBold,
          label: t("cmd_xnxx_a0300bd7"),
          icon: t("cmd_text_174a5aaa"),
          type: t("cmd_video_mp4_1275e211"),
          cost: formatMoney(cost, ctx),
          url: query,
          showType: true,
          loadingText: t("cmd_video_listo_d647ff77"),
        });

        await reply({
          video: { url: downloadedFile },
          mimetype: "video/mp4",
          fileName: "xnxx.mp4",
          caption,
        });

        confirmDownloadCharge(ctx);
        await react("✅").catch(() => undefined);
      } catch (error: unknown) {
        await react("❌").catch(() => undefined);
        return reply({
          text: t("cmd_value0_value1_value2_value3_569f9d3d", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_error_de_descarga_3b9d228e")), value2: error instanceof Error ? error.message : "No se pudo descargar el video.", value3: fytBold(t("cmd_system_29d43743")) }),
        }).catch(() => undefined);
      } finally {
        // Garantiza que el video se borre del disco duro para no saturar el VPS
        if (downloadedFile) {
          await rm(downloadedFile, { force: true }).catch(() => undefined);
        }
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
        label: t("cmd_xnxx_search_a7fca36c"),
        icon: t("cmd_text_174a5aaa"),
        query,
        engine: t("cmd_xnxx_api_a6c9c61a"),
        results: results.slice(0, 5).map((result) => ({
          title: result.title || t("cmd_sin_titulo_fd8beeee"),
          duration: result.duration,
          url: result.url,
        })),
      });

      await react("✅").catch(() => undefined);
      return reply({ text: searchCaption });
    } catch (error: unknown) {
      await react("❌").catch(() => undefined);
      return reply({
        text: t("cmd_value0_value1_value2_value3_569f9d3d", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sin_resultados_aafe1c07")), value2: error instanceof Error ? error.message : `No se encontraron resultados para "${query}".`, value3: fytBold(t("cmd_system_29d43743")) }),
      }).catch(() => undefined);
    }
  },
};
