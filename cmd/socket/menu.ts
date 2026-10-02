import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { proto } from "@whiskeysockets/baileys";
import type { CommandPlugin } from "../../types/commands.d.ts";
import {
  prepareWAMessageMedia,
  generateWAMessageFromContent,
} from "@whiskeysockets/baileys";
import { getPlugins } from "../../core/cmdLoader.ts";
import { fytBold } from "../../core/socketText.ts";

type CachedMediaMessage =
  proto.Message.IImageMessage | proto.Message.IVideoMessage;

const mediaCacheMap = new Map<string, CachedMediaMessage>();

export function clearMenuMediaCache() {
  mediaCacheMap.clear();
}

function getCommandCategories() {
  const dirs = readdirSync(path.resolve("./cmd"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name.toLowerCase());

  const pluginCategories = [...getPlugins().values()]
    .map((plugin) => String(plugin?.category || "general").toLowerCase())
    .filter(Boolean);

  return [...new Set([...dirs, ...pluginCategories])].sort();
}

export default {
  name: ["menu", "help", "h", "menú"],
  description: "Catalogo de Comandos",
  category: "socket",
  ownerOnly: false,
  modOnly: false,
  adminOnly: false,
  premiumOnly: false,
  groupOnly: false,
  privateOnly: false,
  botUserOnly: false,

  async run({ sock, from, msg, args, prefix, usedPrefix, db: runtimeDb }) {
    const activePrefix =
      prefix ?? usedPrefix ?? globalThis.DEFAULT_PREFIXES?.[0] ?? ".";
    const remoteJid = from;
    const pushName = msg?.pushName || "Usuario";
    const botName = runtimeDb?.getBot?.(sock.user?.id)?.bot_name || "Aura Reed";
    const botType = sock.isSubBot ? "Sub-Bot" : "Principal";
    const tituloEstilizado = fytBold(`${String(botName).toUpperCase()}`);
    const chanellink = "https://aetheryx.xyz/";
    const requested = args && args[0] ? args[0].toLowerCase() : null;
    const AutorBot = globalThis.DEFAULT_BOT_AUTHOR;

    const categories = getCommandCategories();
    const categoryAliases: Record<string, string> = {
      ayuda: "system",
      comandos: "system",
      general: "system",
      socket: "socket",
      soporte: "system",
      download: "download",
      media: "download",
      system: "system",
      admin: "admin",
      administrador: "admin",
      owner: "owner",
      propietario: "owner",
    };

    let requestedCategory: string | null = null;
    if (requested) {
      requestedCategory = categoryAliases[requested] || requested;
    }

    let textoMenu = `╭━━〔 ${tituloEstilizado} 〕━━⬣\n`;
    textoMenu += `┃ > ${fytBold("Usuario:")} ${pushName}\n`;
    textoMenu += `┃ > ${fytBold("Bot:")} ${botType}\n`;
    textoMenu += `┃ > ${fytBold("Version:")} 2.5\n`;
    textoMenu += `┃ > ${fytBold("Owner:")} Jeriel B.\n`;
    textoMenu += `┃ > ${fytBold("Prefix:")} [ ${activePrefix} ]\n`;
    textoMenu += `┃ > ${fytBold("Fecha:")} ${new Date().toLocaleDateString("es-CR")}\n`;
    textoMenu += `┃ > ${fytBold("Url:")} ${chanellink}\n`;
    textoMenu += `╰━━━━━━━━━━━━━⬣\n\n`;

    const pluginMap = getPlugins();
    const plugins = [
      ...new Map(
        [...pluginMap.values()].map((plugin) => [plugin, plugin]),
      ).values(),
    ].filter((plugin) => plugin && typeof plugin.run === "function");

    const pluginsByCategory = new Map<string, CommandPlugin[]>();
    for (const plugin of plugins) {
      const categoryKey = String(plugin.category || "general").toLowerCase();
      const entry = pluginsByCategory.get(categoryKey) || [];
      entry.push(plugin);
      pluginsByCategory.set(categoryKey, entry);
    }

    const catsToShow = requestedCategory ? [requestedCategory] : categories;

    if (requestedCategory && !categories.includes(requestedCategory)) {
      let textErr = `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n`;
      textErr += `┃ ❌ ${fytBold("CATEGORÍA NO ENCONTRADA")}\n`;
      textErr += `╰━━━━━━━━━━━━⬣\n\n`;
      textErr += `> Categorías disponibles:\n`;
      textErr += `${categories.join("\n")}\n\n`;
      textErr += `╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`;
      return await sock.sendMessage(
        remoteJid,
        { text: textErr },
        { quoted: msg },
      );
    }

    for (const cat of catsToShow) {
      const group = pluginsByCategory.get(cat) || [];
      if (!group.length) continue;

      textoMenu += `┏━━〔 ${fytBold(String(cat).charAt(0).toUpperCase() + String(cat).slice(1))} 〕━━⬣\n`;

      for (const cmd of group.sort((a, b) =>
        String(a.name?.[0] ?? "").localeCompare(String(b.name?.[0] ?? "")),
      )) {
        const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
        const visibleNames = cmd.showAllNames ? names : names.slice(0, 1);

        for (const alias of visibleNames) {
          textoMenu += `┃ ➪ ${fytBold(`${activePrefix}${String(alias)}`)}\n`;

          if (Array.isArray(cmd.description)) {
            const description = cmd.description[names.indexOf(alias)];
            if (description) textoMenu += `┃ ✦ ${description}\n\n`;
          }
        }

        if (typeof cmd.description === "string" && cmd.description) {
          textoMenu += `┃ ✦ ${cmd.description}\n\n`;
        }
      }
    }

    if (!requestedCategory) {
      textoMenu += `┏━━〔 ${fytBold("OTROS COMANDOS")} 〕━━⬣\n`;
      textoMenu += `┃ ➪ ${fytBold(`${activePrefix}menu <categoría>`)}\n`;
      textoMenu += `┃ ✦ Muestra el menú de una categoría específica.\n\n`;
    }

    textoMenu += `╰〔 ⚡ ${fytBold(String(botName).toUpperCase() + " BOT")} 〕⬣`;

    let bannerPath = path.resolve("./assets/img/BotBanner.jpg");
    let isGif = false;

    const botRecord = runtimeDb?.getBot?.(sock.user?.id);
    const dataDir = path.resolve(globalThis.DATA_BASE_DIR || "./data");
    const bannerFileName = String(
      botRecord?.currentBanner || botRecord?.data?.currentBanner || "",
    ).trim();
    const audioFileName = String(
      botRecord?.currentAudio || botRecord?.data?.currentAudio || "",
    ).trim();
    const storedBannerPath = bannerFileName
      ? path.join(dataDir, path.basename(bannerFileName))
      : "";
    const storedAudioPath = audioFileName
      ? path.join(dataDir, path.basename(audioFileName))
      : "";
    const customBanner =
      (storedBannerPath && existsSync(storedBannerPath)
        ? { path: storedBannerPath }
        : null) ??
      botRecord?.data?.customBanner ??
      botRecord?.customBanner ??
      runtimeDb?.customBanner ??
      null;
    const customAudio =
      (storedAudioPath && existsSync(storedAudioPath)
        ? { path: storedAudioPath }
        : null) ??
      botRecord?.data?.customAudio ??
      botRecord?.customAudio ??
      runtimeDb?.customAudio ??
      null;
    const customBannerBuffer = customBanner?.base64
      ? Buffer.from(customBanner.base64, "base64")
      : null;
    const resolvedCustomPath = customBanner?.path
      ? path.resolve(customBanner.path)
      : null;
    if (
      (resolvedCustomPath && existsSync(resolvedCustomPath)) ||
      customBannerBuffer?.length
    ) {
      bannerPath =
        resolvedCustomPath ||
        `database-banner-${customBanner.base64.slice(0, 32)}`;
      isGif = Boolean(
        customBanner.mimetype?.includes("gif") || bannerPath.endsWith(".gif"),
      );
    }

    let imgBanner: CachedMediaMessage | undefined =
      mediaCacheMap.get(bannerPath);
    if (!imgBanner && (customBannerBuffer?.length || existsSync(bannerPath))) {
      try {
        const mediaType = isGif
          ? { video: customBannerBuffer || readFileSync(bannerPath) }
          : { image: customBannerBuffer || readFileSync(bannerPath) };

        const prepared = await prepareWAMessageMedia(mediaType, {
          upload: sock.waUploadToServer,
          mediaTypeOverride: "thumbnail-link",
        });

        imgBanner = isGif ? prepared.videoMessage : prepared.imageMessage;
        if (imgBanner) {
          if (mediaCacheMap.size >= 10) mediaCacheMap.clear();
          mediaCacheMap.set(bannerPath, imgBanner);
        }
      } catch (error) {
        console.error("[menu] Error al preparar media del banner:", error);
      }
    }

    const getTs = (ts: unknown) =>
      typeof ts === "object" && ts !== null && "low" in ts
        ? Number((ts as { low?: number }).low || 0)
        : Number(ts || 0);

    const content = {
      extendedTextMessage: {
        text: textoMenu,
        matchedText: chanellink,
        canonicalUrl: chanellink,
        description: AutorBot,
        title: `${String(botName).toUpperCase()}`,
        previewType: 1,
        jpegThumbnail: imgBanner?.jpegThumbnail,
        thumbnailDirectPath: imgBanner?.directPath,
        thumbnailSha256: imgBanner?.fileSha256,
        thumbnailEncSha256: imgBanner?.fileEncSha256,
        mediaKey: imgBanner?.mediaKey,
        mediaKeyTimestamp: imgBanner ? getTs(imgBanner.mediaKeyTimestamp) : 0,
        thumbnailHeight: imgBanner?.height || 1080,
        thumbnailWidth: imgBanner?.width || 1920,
        inviteLinkGroupTypeV2: 0,
        contextInfo: {
          mentionedJid: [msg?.key?.participant || remoteJid],
          isForwarded: true,
          forwardingScore: 1,
          forwardedNewsletterMessageInfo: {
            newsletterJid: "120363424808187278@newsletter",
            newsletterName: "⋆ Aura Reed Channel Official ⋆",
            serverMessageId: -1,
          },
        },
      },
    } as proto.IMessage;

    const waMsg = generateWAMessageFromContent(remoteJid, content, {
      userJid: sock.user?.id,
      quoted: msg,
    });

    await sock.relayMessage(remoteJid, waMsg.message, {
      messageId: waMsg.key.id,
    });

    if (customAudio?.path && existsSync(customAudio.path)) {
      await sock.sendMessage(
        remoteJid,
        {
          audio: readFileSync(customAudio.path),
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        },
        { quoted: msg },
      );
    } else if (customAudio?.base64) {
      await sock.sendMessage(
        remoteJid,
        {
          audio: Buffer.from(customAudio.base64, "base64"),
          mimetype: customAudio.mimetype || "audio/ogg; codecs=opus",
          ptt: customAudio.ptt ?? true,
        },
        { quoted: msg },
      );
    }
  },
};
