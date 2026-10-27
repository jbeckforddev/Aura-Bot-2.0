import { existsSync, readdirSync, createReadStream } from "node:fs";
import path from "node:path";
import type { proto } from "baileys";
import type { CommandPlugin } from "../../types/commands.d.ts";
import type { CommandContext } from "../../types/commands.d.ts";
import {
  prepareWAMessageMedia,
  generateWAMessageFromContent,
} from "baileys";
import { getPlugins } from "../../core/cmdLoader.ts";
import { resolveBotType } from "../../core/botType.ts";
import { sendWithRecordingPresence } from "../../core/mediaSendUtils.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

type CachedMediaMessage =
  proto.Message.IImageMessage | proto.Message.IVideoMessage;

const mediaCacheMap: Map<string, CachedMediaMessage> =
  (globalThis as unknown as { __menuMediaCache?: Map<string, CachedMediaMessage> })
    .__menuMediaCache ??
  ((
    globalThis as unknown as {
      __menuMediaCache?: Map<string, CachedMediaMessage>;
    }
  ).__menuMediaCache = new Map<string, CachedMediaMessage>());

export function clearMenuMediaCache() {
  mediaCacheMap.clear();
  (
    globalThis as unknown as {
      __menuMediaCache?: Map<string, CachedMediaMessage>;
    }
  ).__menuMediaCache?.clear();
}

export async function preloadMenuBanner(sock: { waUploadToServer?: any }) {
  const bannerPath = path.resolve("./assets/img/BotBanner.jpg");
  if (mediaCacheMap.has(bannerPath) || !existsSync(bannerPath) || !sock?.waUploadToServer) return;
  try {
    const prepared = await prepareWAMessageMedia(
      { image: createReadStream(bannerPath) },
      {
        upload: sock.waUploadToServer,
        mediaTypeOverride: "thumbnail-link",
      },
    );
    if (prepared.imageMessage) {
      mediaCacheMap.set(bannerPath, prepared.imageMessage);
    }
  } catch {}
}

function getCommandCategories() {
  const dirs = readdirSync(path.resolve("./cmd"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name.toLowerCase());

  const pluginCategories = [...getPlugins().values()]
    .filter((plugin) => !plugin.hideCmd)
    .map((plugin) => String(plugin?.category || "general").toLowerCase())
    .filter(Boolean);

  return [...new Set([...dirs, ...pluginCategories])].sort();
}

export default {
  name: ["menu", "help", "h", "menú"],
  description: t("socketMenuDescription"),
  category: "socket",
  ownerOnly: false,
  modOnly: false,
  adminOnly: false,
  premiumOnly: false,
  groupOnly: false,
  privateOnly: false,
  botUserOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args, prefix, usedPrefix, db: runtimeDb } = ctx;
    const quotedMessage = msg?.key ? { ...msg, key: msg.key } : undefined;
    const activePrefix =
      prefix ?? usedPrefix ?? globalThis.DEFAULT_PREFIXES?.[0] ?? ".";
    const remoteJid = from;
    const pushName = msg?.pushName || "Usuario";
    const botRecord = runtimeDb?.getBot?.(ctx.botJid || sock.user?.id);
    const botName = botRecord?.bot_name || "Aura Reed";
    const botType = resolveBotType(botRecord?.bot_type, sock.isSubBot);
    const tituloEstilizado = fytBold(t("cmd_value0_bb624cd4", { value0: String(botName).toUpperCase() }));
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

    let textoMenu = t("cmd_value0_8aed6a3b", { value0: tituloEstilizado });
    textoMenu += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("socketMenuUser")), value1: pushName });
    textoMenu += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("socketMenuInstance")), value1: botType });
    textoMenu += t("cmd_value0_2_5_ebc54376", { value0: fytBold(t("socketMenuVersion")) });
    textoMenu += t("cmd_value0_jeriel_b_b207a1a0", { value0: fytBold(t("socketMenuOwner")) });
    textoMenu += t("cmd_value0_value1_a6fe40aa", { value0: fytBold(t("socketMenuPrefix")), value1: activePrefix });
    textoMenu += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("socketMenuDate")), value1: new Date().toLocaleDateString("es-CR") });
    textoMenu += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("socketMenuUrl")), value1: chanellink });
    textoMenu += t("cmd_text_5710381e");

    const pluginMap = getPlugins();
    const plugins = [
      ...new Map(
        [...pluginMap.values()].map((plugin) => [plugin, plugin]),
      ).values(),
    ].filter(
      (plugin) =>
        plugin && !plugin.hideCmd && typeof plugin.run === "function",
    );

    const pluginsByCategory = new Map<string, CommandPlugin[]>();
    for (const plugin of plugins) {
      const categoryKey = String(plugin.category || "general").toLowerCase();
      const entry = pluginsByCategory.get(categoryKey) || [];
      entry.push(plugin);
      pluginsByCategory.set(categoryKey, entry);
    }

    const catsToShow = requestedCategory ? [requestedCategory] : categories;

    if (requestedCategory && !categories.includes(requestedCategory)) {
      let textErr = t("cmd_value0_b359fff7", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
      textErr += t("cmd_value0_45769653", { value0: fytBold(t("socketMenuCategoryNotFound")) });
      textErr += t("cmd_text_bdfd7fa0");
      textErr += t("cmd_value0_eb512a0e", { value0: t("socketMenuAvailableCategories") });
      textErr += t("cmd_value0_ffd81da9", { value0: categories.join("\n") });
      textErr += t("cmd_value0_92601e2c", { value0: fytBold(t("cmd_system_29d43743")) });
      return await sock.sendMessage(
        remoteJid,
        { text: textErr },
        { quoted: quotedMessage },
      );
    }

    for (const cat of catsToShow) {
      const group = pluginsByCategory.get(cat) || [];
      if (!group.length) continue;

      textoMenu += t("cmd_value0_a58a457f", { value0: fytBold(String(cat).charAt(0).toUpperCase() + String(cat).slice(1)) });

      for (const cmd of group.sort((a, b) =>
        String(a.name?.[0] ?? "").localeCompare(String(b.name?.[0] ?? "")),
      )) {
        const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
        const visibleNames = cmd.showAllNames ? names : names.slice(0, 1);

        for (const alias of visibleNames) {
          textoMenu += t("cmd_value0_5c5b5a03", { value0: fytBold(t("cmd_value0_value1_6bbfd3cf", { value0: activePrefix, value1: String(alias) })) });

          if (Array.isArray(cmd.description)) {
            const description = cmd.description[names.indexOf(alias)];
            if (description) textoMenu += t("cmd_value0_d9d88ac0", { value0: description });
          }
        }

        if (typeof cmd.description === "string" && cmd.description) {
          textoMenu += t("cmd_value0_d9d88ac0", { value0: cmd.description });
        }
      }
    }

    if (!requestedCategory) {
      textoMenu += t("cmd_value0_a58a457f", { value0: fytBold(t("socketMenuOtherCommands")) });
      textoMenu += t("cmd_value0_5c5b5a03", { value0: fytBold(t("cmd_value0_menu_categoria_804b40c1", { value0: activePrefix })) });
      textoMenu += t("cmd_value0_d9d88ac0", { value0: t("socketMenuCategoryUsage") });
    }

    textoMenu += t("cmd_value0_92601e2c", { value0: fytBold(String(botName).toUpperCase() + " BOT") });

    let bannerPath = path.resolve("./assets/img/BotBanner.jpg");
    let isGif = false;

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
      null;
    const customAudio =
      (storedAudioPath && existsSync(storedAudioPath)
        ? { path: storedAudioPath }
        : null) ??
      botRecord?.data?.customAudio ??
      null;
    const customBannerPath = customBanner?.base64
      ? Buffer.from(customBanner.base64, "base64")
      : null;
    const resolvedCustomPath = customBanner?.path
      ? path.resolve(customBanner.path)
      : null;
    if (
      (resolvedCustomPath && existsSync(resolvedCustomPath)) ||
      customBannerPath?.length
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
    if (!imgBanner && (customBannerPath?.length || existsSync(bannerPath))) {
      try {
        const mediaType = isGif
          ? { video: customBannerPath || createReadStream(bannerPath) }
          : { image: customBannerPath || createReadStream(bannerPath) };

        const prepared = await prepareWAMessageMedia(mediaType, {
          upload: sock.waUploadToServer,
          mediaTypeOverride: "thumbnail-link",
        });

        imgBanner =
          (isGif ? prepared.videoMessage : prepared.imageMessage) ?? undefined;
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
      userJid: sock.user?.id || remoteJid,
      ...(quotedMessage ? { quoted: quotedMessage } : {}),
    });

    await sock.relayMessage(remoteJid, waMsg.message, {
      messageId: waMsg.key.id,
    });

    if (customAudio?.path && existsSync(customAudio.path)) {
      await sendWithRecordingPresence(sock, remoteJid, () =>
        sock.sendMessage(
          remoteJid,
          {
            audio: createReadStream(customAudio.path),
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
          },
          quotedMessage ? { quoted: quotedMessage } : undefined,
        ),
      );
    } else if (customAudio?.base64) {
      await sendWithRecordingPresence(sock, remoteJid, () =>
        sock.sendMessage(
          remoteJid,
          {
            audio: Buffer.from(customAudio.base64, "base64"),
            mimetype: customAudio.mimetype || "audio/ogg; codecs=opus",
            ptt: customAudio.ptt ?? true,
          },
          quotedMessage ? { quoted: quotedMessage } : undefined,
        ),
      );
    }
  },
};
