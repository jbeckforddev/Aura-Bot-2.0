import type {
  CommandContext,
} from "../../types/index.d.ts";
import { readFile } from "node:fs/promises";
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { fytBold } from "../../core/socketText.ts";
import { createLinkPreviewWithoutChannel } from "../../core/LinkPreview.ts";
import { downloadToCache } from "../../core/downloadUtils.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { formatCount, formatDuration } from "../../utils/formatter.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import {
  searchYouTubeVideo,
  type YouTubeSearchVideo,
} from "../../src/api/youtubeSearch.ts";
import { downloadYouTube } from "../../src/api/youtubeDownloader.ts";

function getYouTubeVideoId(value: string): string | null {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(
      /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`,
    );
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(
      hostname,
    )
  )
    return null;

  let videoId = "";
  if (hostname === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  } else if (parsed.pathname === "/watch") {
    videoId = parsed.searchParams.get("v") || "";
  } else {
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (["embed", "v", "shorts", "live"].includes(parts[0] || "")) {
      videoId = parts[1] || "";
    }
  }

  return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
}

function isYouTubeUrl(value: string): boolean {
  return /^(?:https?:\/\/)?(?:www\.)?(?:m\.|music\.)?(?:youtube\.com|youtu\.be)\//i.test(
    value.trim(),
  );
}

export default {
  name: ["play", "ytmp3", "ytaudio", "playaudio", "playmp3", "ytmusic", "yta"],
  description: "Busca y descarga audio de YouTube.",
  category: "download",
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query)
      return reply(
        "⚠️ Escribe el nombre de una canción o pega un enlace de YouTube.",
      );

    await react("🎵");
    try {
      let result: YouTubeSearchVideo | null = null;
      let finalUrl = query;

      if (!isYouTubeUrl(query)) {
        result = await searchYouTubeVideo(query);
        finalUrl = result.url;
      } else {
        const videoId = getYouTubeVideoId(query);
        if (!videoId) throw new Error("URL de YouTube no válida.");
        finalUrl = `https://youtu.be/${videoId}`;
      }

      const audio = await downloadYouTube(
        finalUrl,
        "audio",
        128,
        result || undefined,
      );
      const title = String(audio.title || result?.title || "audio").trim();
      const author = audio.author || result?.author || "Desconocido";
      const duration = audio.duration || result?.duration || "??";
      const views = audio.views ?? result?.views ?? "0";
      const likes = audio.likes ?? result?.likes;
      const quality = audio.quality || "128k";
      const videoId = audio.videoId;
      const youtubeUrl = videoId
        ? `https://youtu.be/${videoId}`
        : result?.url || finalUrl;
      if (!audio.dl_url) throw new Error("No se pudo obtener el audio.");
      const file = await downloadToCache(audio.dl_url);
      const { cost } = await prepareDownloadCharge(ctx, "audio", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "YOUTUBE PLAY",
        icon: "🎵",
        title,
        channel: author,
        duration: formatDuration(duration),
        views: formatCount(views),
        likes: likes === undefined ? undefined : formatCount(likes),
        videoId,
        source: audio.winner,
        quality,
        cost: formatMoney(cost, ctx),
        url: youtubeUrl,
        showChannel: true,
        showDuration: Boolean(duration && duration !== "??"),
        showViews: views !== undefined,
        showLikes: likes !== undefined,
        showVideoId: Boolean(videoId),
        showSource: true,
        showQuality: Boolean(quality),
        loadingText: "Descargando audio...",
        loadingIcon: "⏳",
      });

      const thumbnail = String(
        videoId
          ? audio.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          : audio.thumbnail || result?.thumbnail || "",
      );
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
        if (prepared.imageMessage) {
          const preview = createLinkPreviewWithoutChannel({
            textOriginal: caption,
            link: youtubeUrl,
            author: globalThis.DEFAULT_BOT_AUTHOR,
            title,
            banner: prepared.imageMessage,
            mentionedJid: [sender],
            isForwarded: false,
            forwardingScore: 0,
          });
          const previewMessage = generateWAMessageFromContent(from, preview, {
            quoted: msg as unknown as WAMessage,
            userJid: sock.user?.id || from,
          });
          if (previewMessage.message) {
            await sock.relayMessage(from, previewMessage.message, {
              messageId: previewMessage.key.id || undefined,
            });
          } else {
            await reply({ text: caption });
          }
        } else {
          await reply({ text: caption });
        }
      } else {
        await reply({ text: caption });
      }
      await reply({
        audio: { url: file },
        mimetype: "audio/mpeg",
        fileName: `${title.replace(/[<>:"/\\|?*]/g, "").slice(0, 100) || "youtube"}.mp3`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `${error instanceof Error ? error.message : String(error) || "No se pudo descargar el audio."}`,
      });
    }
  },
};
