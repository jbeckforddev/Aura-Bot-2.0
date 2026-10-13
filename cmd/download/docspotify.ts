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


export default {
  name: ["spotifydoc", "docsplay", "dsp", "dspdl"],
  category: "download",
  description: t("cmd_descarga_spotify_como_document_62b1cd61"),
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply(t("cmd_ingresa_una_cancion_o_enlace_d_76145d63"));
    await react("🎵");
    try {
      const api = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
      const isUrl = query.includes("open.spotify.com/");
      const endpoint = isUrl ? "/dl/spotify" : "/dl/spotifyplay";
      const param = isUrl
        ? `url=${encodeURIComponent(query.split("?")[0])}`
        : `query=${encodeURIComponent(query)}`;
      const response = await requestJson<SpotifyResponse>(
        `${api}${endpoint}?${param}&key=${DL_CONFIG.alya.API_KEY}`,
      );
      const song = response?.data;
      const download = typeof song?.dl === "string" ? song.dl : song?.dl?.mp3;
      if (!response?.status || !download)
        throw new Error("No se pudo obtener el audio.");
      const title = song.title || "Spotify";
      const originalUrl =
        song.url ||
        (isUrl
          ? query.split("?")[0]
          : `https://open.spotify.com/search/${encodeURIComponent(title)}`);
      const file = await downloadToCache(download);
      const { cost } = await prepareDownloadCharge(ctx, "document", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_spotify_document_d91332a9"),
        icon: t("cmd_text_71ceeba5"),
        title,
        artist: globalThis.DEFAULT_BOT_AUTHOR,
        album: song.album,
        type: t("cmd_documento_mp3_f18c11dc"),
        cost: formatMoney(cost, ctx),
        url: originalUrl,
        showArtist: Boolean(song.artist),
        showAlbum: Boolean(song.album),
        showType: true,
        loadingText: t("cmd_descargando_documento_2572aa2f"),
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
            author: song.artist || "Spotify",
            sender,
          })
        : false;
      if (!hasPreview) await reply({ text: caption });
      await reply({
        document: { url: file },
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
          : "No se pudo descargar Spotify.";
      return reply({
        text: t("cmd_value0_bb624cd4", { value0: message }),
      });
    }
  },
};
