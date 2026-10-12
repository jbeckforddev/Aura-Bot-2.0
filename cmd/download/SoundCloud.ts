import type {
  CommandContext,
  SoundCloudTrack,
  SoundCloudTranscoding,
  SoundCloudSearchResponse,
} from "../../types/index.d.ts";
import { request } from "undici";
import { readFile } from "node:fs/promises";
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { downloadToCache } from "../../core/downloadUtils.ts";
import { formatCount, formatDuration } from "../../utils/formatter.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { createLinkPreviewWithoutChannel } from "../../core/LinkPreview.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";

let cachedClientId: string | null = null;
let cachedAt = 0;

const SOUNDCloud_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  Origin: "https://soundcloud.com",
  Referer: "https://soundcloud.com/",
};

class SoundCloudHttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, body = "") {
    super(
      `SoundCloud respondió HTTP ${statusCode}${body ? `: ${body.slice(0, 160)}` : ""}`,
    );
    this.name = "SoundCloudHttpError";
    this.statusCode = statusCode;
  }
}

async function fetchText(
  url: string,
  init: { headers?: Record<string, string> } = {},
): Promise<string> {
  const response = await request(url, {
    headers: { ...SOUNDCloud_HEADERS, ...init.headers },
    signal: AbortSignal.timeout(10000),
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new SoundCloudHttpError(
      response.statusCode,
      await response.body.text(),
    );
  }
  return response.body.text();
}

async function requestJson<T = unknown>(
  url: URL | string,
  timeout = 10000,
): Promise<T> {
  const response = await request(url, {
    headers: SOUNDCloud_HEADERS,
    signal: AbortSignal.timeout(timeout),
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new SoundCloudHttpError(
      response.statusCode,
      await response.body.text(),
    );
  }
  return (await response.body.json()) as T;
}

async function getClientId(): Promise<string> {
  if (cachedClientId && Date.now() - cachedAt < 60 * 60 * 1000)
    return cachedClientId;

  const html = await fetchText("https://soundcloud.com", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const scripts = [
    ...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g),
  ].map((match) => match[1]);

  for (const scriptUrl of scripts.slice(-5)) {
    try {
      const script = await fetchText(scriptUrl);
      const matches = [
        script.match(/client_id\s*[:=]\s*["']([a-zA-Z0-9_-]+)["']/),
        script.match(/["']client_id["']\s*:\s*["']([a-zA-Z0-9_-]+)["']/),
        script.match(/client_id=([a-zA-Z0-9_-]+)/),
      ].filter(Boolean) as RegExpMatchArray[];
      if (matches[0]?.[1]) {
        cachedClientId = matches[0][1];
        cachedAt = Date.now();
        return cachedClientId;
      }
    } catch {
      // Prueba el siguiente bundle de SoundCloud.
    }
  }

  throw new Error("No se pudo obtener el client_id de SoundCloud.");
}

async function resolveTrack(
  query: string,
  clientId: string,
): Promise<SoundCloudTrack> {
  let url = query;
  if (!query.includes("soundcloud.com/")) {
    const searchUrl = new URL("https://api-v2.soundcloud.com/search/tracks");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("client_id", clientId);
    searchUrl.searchParams.set("limit", "1");
    const searchData = await requestJson<SoundCloudSearchResponse>(searchUrl);
    const result = searchData.collection?.[0];
    if (!result)
      throw new Error("No se encontraron resultados para tu búsqueda.");
    url = result.permalink_url || result.uri || "";
  }

  const resolveUrl = new URL("https://api-v2.soundcloud.com/resolve");
  resolveUrl.searchParams.set("url", url);
  resolveUrl.searchParams.set("client_id", clientId);
  const track = await requestJson<SoundCloudTrack>(resolveUrl);
  if (!track || track.kind !== "track")
    throw new Error("No se encontró un track válido.");
  return track;
}

export default {
  name: ["scplay", "scdl", "sc", "soundcloud"],
  description: "Descarga canciones de SoundCloud.",
  category: "download",

  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query) {
      return reply({
        text: `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA BÚSQUEDA")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Indica un enlace o nombre de SoundCloud.\n\n╰〔 ⚡ SYSTEM 〕⬣`,
      });
    }

    await react("🎵");
    try {
      let clientId = await getClientId();
      let track: SoundCloudTrack;
      try {
        track = await resolveTrack(query, clientId);
      } catch (error: unknown) {
        if ((error as { statusCode?: number })?.statusCode !== 401) throw error;
        cachedClientId = null;
        cachedAt = 0;
        clientId = await getClientId();
        track = await resolveTrack(query, clientId);
      }
      const transcoding = track.media?.transcodings?.find(
        (item: SoundCloudTranscoding) =>
          item.format?.mime_type === "audio/mpeg" &&
          item.format?.protocol === "progressive",
      );
      if (!transcoding)
        throw new Error("Este track no tiene un stream MP3 descargable.");

      const streamUrl = new URL(transcoding.url);
      streamUrl.searchParams.set("client_id", clientId);
      const safeTitle =
        String(track.title || "soundcloud")
          .replace(/[<>:"/\\|?*]/g, "")
          .slice(0, 100) || "soundcloud";
      const streamData = await requestJson<{ url?: string }>(streamUrl, 30000);
      const audioUrl = streamData?.url;
      if (!audioUrl)
        throw new Error("SoundCloud no devolvió una URL de audio válida.");

      const file = await downloadToCache(audioUrl);
      const { cost } = await prepareDownloadCharge(ctx, "audio", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "SOUNDCLOUD PLAY",
        icon: "🎵",
        title: track.title || "Sin título",
        artist: track.user?.username,
        duration: formatDuration(Math.floor(Number(track.duration || 0) / 1000)),
        views: formatCount(track.playback_count),
        likes: formatCount(track.likes_count),
        type: "Audio MP3",
        cost: formatMoney(cost, ctx),
        url: track.permalink_url || query,
        showArtist: Boolean(track.user?.username),
        showDuration: Boolean(track.duration),
        showViews: track.playback_count !== undefined && track.playback_count !== null,
        showLikes: track.likes_count !== undefined && track.likes_count !== null,
        showType: true,
        loadingText: "Descargando audio...",
        loadingIcon: "⏳",
      });

      const thumbnail = track.artwork_url?.replace("large", "t500x500");
      if (thumbnail) {
        const thumbnailBuffer = await readFile(
          await downloadToCache(thumbnail, 30000),
        );
        const prepared = await prepareWAMessageMedia(
          { image: thumbnailBuffer },
          {
            upload: sock.waUploadToServer,
            mediaTypeOverride: "thumbnail-link",
          },
        );
        const preview = createLinkPreviewWithoutChannel({
          textOriginal: caption,
          link: track.permalink_url || query,
          author: globalThis.DEFAULT_BOT_AUTHOR,
          title: track.title || "SoundCloud",
          banner: prepared.imageMessage,
          mentionedJid: sender ? [sender] : [],
          isForwarded: false,
          forwardingScore: 0,
        });
        const previewMessage = generateWAMessageFromContent(from, preview, {
          quoted: msg as unknown as WAMessage,
          userJid: sock.user?.id,
        });
        await sock.relayMessage(from, previewMessage.message, {
          messageId: previewMessage.key.id,
        });
      } else {
        await reply({ text: caption });
      }

      await reply({
        audio: { url: file },
        mimetype: "audio/mpeg",
        fileName: `${safeTitle}.mp3`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      await reply({
        text: `${error instanceof Error ? error.message : String(error) || "No se pudo descargar el audio."}`,
      });
    }
  },
};
