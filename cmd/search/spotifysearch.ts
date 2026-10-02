import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { requestJson } from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import { formatDuration } from "../../utils/formatter.ts";
import { SEARCH_RESULTS_TEMPLATE } from "../../utils/template.ts";

export default {
  name: ["spsearch", "spotifysearch", "sps"],
  category: "search",
  description: "Busca canciones en Spotify.",
  async run({ args, reply, react, sock, from, msg, sender }: CommandContext) {
    const query = args.join(" ").trim();
    if (!query)
      return reply("⚠️ Proporciona el nombre de una canción o artista.");
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
        label: "SPOTIFY SEARCH",
        icon: "🎵",
        query,
        engine: "Alya Core",
        results: tracks.map((track) => ({
          title: track.title || "Sin título",
          artist: track.artist || "Desconocido",
          duration: formatDuration(track.duration) || "N/A",
          url: track.url || "No disponible",
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
        text: `❌ Error: ${error instanceof Error ? error.message : String(error) || "No se pudo buscar en Spotify."}`,
      });
    }
  },
};
