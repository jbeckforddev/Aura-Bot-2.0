import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { requestJson } from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import { formatDuration } from "../../utils/formatter.ts";
import { SEARCH_RESULTS_TEMPLATE } from "../../utils/template.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["spsearch", "spotifysearch", "sps"],
  category: "search",
  description: t("cmd_busca_canciones_en_spotify_e4146d8d"),
  async run({ args, reply, react, sock, from, msg, sender }: CommandContext) {
    const query = args.join(" ").trim();
    if (!query)
      return reply(t("cmd_proporciona_el_nombre_de_una_c_faeadcee"));
    await react("🔍");
    try {
      const api = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
      const data = await requestJson(
        `${api}/search/spotify?query=${encodeURIComponent(query)}&key=${DL_CONFIG.alya.API_KEY}`,
      );
      const tracks = Array.isArray(data?.data)
        ? data.data.slice(0, 10)
        : Array.isArray(data?.result)
          ? data.result.slice(0, 10)
          : [];
      if (!tracks.length)
        throw new Error("No se encontraron resultados en Spotify.");
      const text = SEARCH_RESULTS_TEMPLATE({
        bold: fytBold,
        label: t("cmd_spotify_search_bbdb3ee3"),
        icon: t("cmd_text_71ceeba5"),
        query,
        engine: t("cmd_alya_core_44fc62cc"),
        results: tracks.map((track) => ({
          title: track.title || t("cmd_sin_titulo_fd8beeee"),
          artist: track.artist || t("cmd_desconocido_452c8a12"),
          duration: formatDuration(track.duration) || t("cmd_n_a_08d2e98e"),
          url: track.url || t("cmd_no_disponible_9def5fe2"),
        })),
      });
      const cover = tracks[0].image || tracks[0].cover || tracks[0].coverHd;
      const firstTrack = tracks[0];
      const title = firstTrack.title || "Resultado de Spotify";
      const link =
        firstTrack.url ||
        `https://open.spotify.com/search/${encodeURIComponent(title)}`;
      const hasPreview = cover
        ? await sendDownloadPreview({
            sock,
            from,
            msg,
            thumbnail: cover,
            caption: text,
            link,
            title,
            author: firstTrack.artist || "Spotify",
            sender,
          })
        : false;
      if (!hasPreview) await reply({ text });
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_error_value0_a4bb764e", { value0: error instanceof Error ? error.message : String(error) || "No se pudo buscar en Spotify." }),
      });
    }
  },
};
