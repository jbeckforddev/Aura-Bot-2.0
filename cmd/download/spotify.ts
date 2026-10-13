import { fytBold } from "../../core/socketText.ts";
import {
  downloadToCache,
  requestJson,
  safeFileName,
} from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import type { CommandContext, SpotifyResponse } from "../../types/index.d.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { t } from "../../src/langs/index.ts";


const API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const KEY = DL_CONFIG.alya.API_KEY;

export default {
  name: ["spotify", "splay", "sp", "spdl"],
  category: "download",
  description: t("cmd_descarga_canciones_de_spotify__71242820"),
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query)
      return reply(
        t("cmd_ingresa_el_nombre_de_una_canci_8d2c70c9"),
      );
    await react("🎵");
    try {
      const isUrl = query.includes("open.spotify.com/");
      const endpoint = isUrl ? "/dl/spotify" : "/dl/spotifyplay";
      const parameter = isUrl
        ? `url=${encodeURIComponent(query.split("?")[0])}`
        : `query=${encodeURIComponent(query)}`;
      const response = await requestJson<SpotifyResponse>(
        `${API}${endpoint}?${parameter}&key=${KEY}`,
      );
      const song = response?.data;
      const downloadUrl =
        typeof song?.dl === "string" ? song.dl : song?.dl?.mp3;
      if (!response?.status || !song || !downloadUrl)
        throw new Error("No se pudo obtener el audio.");
      const title = song.title || "Canción de Spotify";
      const originalUrl =
        song.url ||
        (isUrl
          ? query.split("?")[0]
          : `https://open.spotify.com/search/${encodeURIComponent(title)}`);
      const file = await downloadToCache(downloadUrl);
      const { cost } = await prepareDownloadCharge(ctx, "audio", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_spotify_play_b0a17463"),
        icon: t("cmd_text_71ceeba5"),
        title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        type: t("cmd_audio_mp3_45a98371"),
        cost: formatMoney(cost, ctx),
        url: originalUrl,
        showArtist: Boolean(song.artist),
        showAlbum: Boolean(song.album),
        showDuration: Boolean(song.duration),
        showType: true,
        loadingText: t("cmd_descargando_audio_b1e6524a"),
        loadingIcon: t("cmd_text_7a2ad7a6"),
      });
      const cover = song.coverHd || song.cover;
      const hasPreview = cover
        ? await sendDownloadPreview({
            sock,
            from,
            msg,
            thumbnail: cover,
            caption,
            link: originalUrl,
            title,
            author: globalThis.DEFAULT_BOT_AUTHOR,
            sender,
          })
        : false;
      if (!hasPreview) await reply({ text: caption });
      await reply({
        audio: { url: file },
        mimetype: "audio/mpeg",
        fileName: `${safeFileName(title, "spotify")}.mp3`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo descargar la canción.";
      return reply({
        text: t("cmd_value0_bb624cd4", { value0: message }),
      });
    }
  },
};
