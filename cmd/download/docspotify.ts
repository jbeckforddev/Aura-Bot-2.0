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

export default {
  name: ["spotifydoc", "docsplay", "dsp", "dspdl"],
  category: "download",
  description: "Descarga Spotify como documento MP3.",
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply("⚠️ Ingresa una canción o enlace de Spotify.");
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
        label: "SPOTIFY DOCUMENT",
        icon: "🎵",
        title,
        artist: globalThis.DEFAULT_BOT_AUTHOR,
        album: song.album,
        type: "Documento MP3",
        cost: formatMoney(cost, ctx),
        url: originalUrl,
        showArtist: Boolean(song.artist),
        showAlbum: Boolean(song.album),
        showType: true,
        loadingText: "Descargando documento...",
        loadingIcon: "⏳",
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
        text: `${message}`,
      });
    }
  },
};
