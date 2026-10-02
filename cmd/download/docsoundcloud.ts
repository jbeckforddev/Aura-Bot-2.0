import type {
  CommandContext,
  SoundCloudTrack,
  SoundCloudTranscoding,
  SoundCloudSearchResponse,
} from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { downloadToCache, safeFileName } from "../../core/downloadUtils.ts";
import { request } from "undici";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";

let cachedClientId = "";
let cachedAt = 0;

async function text(url: string): Promise<string> {
  const response = await request(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30000),
  });
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(`HTTP ${response.statusCode}`);
  return response.body.text();
}

async function json<T = unknown>(url: string): Promise<T> {
  const response = await request(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30000),
  });
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(`HTTP ${response.statusCode}`);
  return (await response.body.json()) as T;
}

async function clientId(): Promise<string> {
  if (cachedClientId && Date.now() - cachedAt < 3600000) return cachedClientId;
  const html = await text("https://soundcloud.com");
  const scripts = [
    ...html.matchAll(
      /src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"\s]+\.js)"/g,
    ),
  ].map((match) => match[1]);
  for (const script of scripts.slice(-5)) {
    const source = await text(script).catch(() => "");
    const match = source.match(/client_id["':=]+(["'])([A-Za-z0-9_-]+)\1/);
    if (match?.[2]) {
      cachedClientId = match[2];
      cachedAt = Date.now();
      return cachedClientId;
    }
  }
  throw new Error("No se pudo obtener el client_id de SoundCloud.");
}

export default {
  name: ["dscplay", "dscdl", "dsc", "docsoundcloud"],
  category: "download",
  description: "Descarga SoundCloud como documento MP3.",
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query)
      return reply("⚠️ Proporciona una búsqueda o enlace de SoundCloud.");
    await react("🎵");
    try {
      const id = await clientId();
      let url = query;
      if (!query.includes("soundcloud.com/")) {
        const search = await json<SoundCloudSearchResponse>(
          `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${id}&limit=1`,
        );
        url = search.collection?.[0]?.permalink_url || "";
      }
      if (!url) throw new Error("No se encontró ningún track.");
      const track = await json<SoundCloudTrack>(
        `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${id}`,
      );
      const transcoding = track.media?.transcodings?.find(
        (item: SoundCloudTranscoding) =>
          item.format?.mime_type === "audio/mpeg" &&
          item.format?.protocol === "progressive",
      );
      if (!transcoding)
        throw new Error("Este track no tiene un stream MP3 descargable.");
      const stream = await json<{ url?: string }>(
        `${transcoding.url}?client_id=${id}`,
      );
      if (!stream?.url) throw new Error("SoundCloud no devolvió el audio.");
      const title = track.title || "SoundCloud";
      const file = await downloadToCache(stream.url);
      const { cost } = await prepareDownloadCharge(ctx, "document", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "SOUNDCLOUD DOCUMENT",
        icon: "🎵",
        title,
        artist: track.user?.username,
        type: "Documento MP3",
        cost: formatMoney(cost, ctx),
        url,
        showArtist: Boolean(track.user?.username),
        showType: true,
        loadingText: "Descargando documento...",
      });
      const thumbnail = track.artwork_url?.replace("large", "t500x500");
      const hasPreview = thumbnail
        ? await sendDownloadPreview({
            sock,
            from,
            msg,
            thumbnail,
            caption,
            link: url,
            title,
            author: globalThis.DEFAULT_BOT_AUTHOR,
            sender,
          })
        : false;
      if (!hasPreview) await reply({ text: caption });
      await reply({
        document: { url: file },
        mimetype: "audio/mpeg",
        fileName: `${safeFileName(title, "soundcloud")}.mp3`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `${error instanceof Error ? error.message : String(error) || "No se pudo descargar SoundCloud."}`,
      });
    }
  },
};
