import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { generateWAMessageFromContent, prepareWAMessageMedia, type proto } from "baileys";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import { resolveBotType } from "../../core/botType.ts";
import { getPlugins } from "../../core/cmdLoader.ts";
import type { CommandContext } from "../../types/index.d.ts";
import { formatDuration, formatFileSize } from "../../utils/formatter.ts";
import { t } from "../../src/langs/index.ts";

const mediaCacheMap: Map<string, any> =
  (globalThis as unknown as { __infobotMediaCache?: Map<string, any> })
    .__infobotMediaCache ??
  ((
    globalThis as unknown as {
      __infobotMediaCache?: Map<string, any>;
    }
  ).__infobotMediaCache = new Map<string, any>());

export function clearInfoBotMediaCache(): void {
  mediaCacheMap.clear();
  (
    globalThis as unknown as {
      __infobotMediaCache?: Map<string, any>;
    }
  ).__infobotMediaCache?.clear();
}

function getServerName(): string {
  const envName =
    process.env.SERVER_NAME ||
    process.env.P_SERVER_LOCATION ||
    process.env.P_SERVER_NAME;
  if (envName) return envName;

  const host = os.hostname();
  if (host.includes("-") || host.length > 20 || /^[a-f0-9]+$/i.test(host)) {
    return "LOCALHOST";
  }

  return host;
}

function readNumber(filePath: string): number | null {
  try {
    const value = fs.readFileSync(filePath, "utf8").trim();
    if (value === "max" || !value) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

function getMemoryInfo() {
  try {
    if (fs.existsSync("/sys/fs/cgroup/memory.max") && fs.existsSync("/sys/fs/cgroup/memory.current")) {
      const total = readNumber("/sys/fs/cgroup/memory.max");
      const used = readNumber("/sys/fs/cgroup/memory.current");
      if (total !== null && total > 0 && used !== null && used >= 0) {
        return { total, used, source: "contenedor" };
      }
    }

    if (fs.existsSync("/sys/fs/cgroup/memory/memory.limit_in_bytes")) {
      const total = readNumber("/sys/fs/cgroup/memory/memory.limit_in_bytes");
      const used = readNumber("/sys/fs/cgroup/memory/memory.usage_in_bytes");
      if (total !== null && total > 0 && total < 9223372036854771712 && used !== null && used >= 0) {
        return { total, used, source: "contenedor" };
      }
    }
  } catch {}

  return {
    total: os.totalmem(),
    used: process.memoryUsage().rss,
    source: "host",
  };
}

export default {
  name: ["infobot", "botinfo"],
  category: "system",
  description: t("cmd_muestra_informacion_detallada__77ed83a2"),

  async run(ctx: CommandContext) {
    const { sock, from, msg, db } = ctx;
    const remoteJid = from;
    const pushName = msg?.pushName || "Usuario";
    const botRecord = db.getBot?.(sock.user?.id || "");
    const botName = String(botRecord?.bot_name || "Aura Reed").trim() || "Aura Reed";
    const botType = resolveBotType(
      botRecord?.bot_type ?? botRecord?.data?.bot_type,
      sock.isSubBot,
    );

    const botVersion = "2.5";
    const serverHost = getServerName();
    const platform = `${os.platform()} (${os.arch()})`;
    const memory = getMemoryInfo();
    const ramPercent = memory.total > 0 ? ((memory.used / memory.total) * 100).toFixed(1) : "0.0";

    // Conteo de comandos hiper-rápido desde la memoria
    const pluginsMap = getPlugins();
    const uniqueCommands = new Set(pluginsMap.values()).size;
    const activeSubBots = getActiveSubBots().length;
    const chanellink = "https://aetheryx.xyz/";
    const tituloEstilizado = fytBold(t("cmd_value0_bot_088975d3", { value0: botName.toUpperCase() }));

    let textoInfo = t("cmd_value0_8aed6a3b", { value0: tituloEstilizado });
    textoInfo += t("cmd_value0_value1_afc10284", { value0: fytBold(t("cmd_usuario_bad48a23")), value1: pushName });
    textoInfo += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_bot_e38c4284")), value1: botType });
    textoInfo += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_version_f3cde000")), value1: botVersion });
    textoInfo += t("cmd_value0_jeriel_b_b207a1a0", { value0: fytBold(t("cmd_owner_50a94e9c")) });
    textoInfo += t("cmd_value0_value1_a6fe40aa", { value0: fytBold(t("cmd_prefix_9a21b442")), value1: ctx.usedPrefix ?? ctx.prefix ?? "." });
    textoInfo += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_fecha_51334726")), value1: new Date().toLocaleDateString("es-CR") });
    textoInfo += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_sub_bots_7c3aeed5")), value1: activeSubBots });
    textoInfo += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_url_b7547cc8")), value1: chanellink });
    textoInfo += t("cmd_text_14518c16");

    textoInfo += t("cmd_value0_a58a457f", { value0: fytBold(t("cmd_info_del_sistema_64dff60c")) });
    textoInfo += t("cmd_value0_value1_f1c8b5eb", { value0: fytBold(t("cmd_servidor_host_f0d7e4b9")), value1: serverHost });
    textoInfo += t("cmd_value0_value1_f1c8b5eb", { value0: fytBold(t("cmd_sistema_operativo_efbd5769")), value1: platform });
    textoInfo += t("cmd_value0_value1_f1c8b5eb", { value0: fytBold(t("cmd_tiempo_activo_bot_caedf41c")), value1: formatDuration(process.uptime()) });
    textoInfo += t("cmd_value0_value1_value2_125497aa", { value0: fytBold(t("cmd_ram_servidor_caf7accc")), value1: formatFileSize(memory.total), value2: ramPercent });
    textoInfo += t("cmd_value0_value1_f1c8b5eb", { value0: fytBold(t("cmd_ram_bot_ed77971e")), value1: formatFileSize(process.memoryUsage().rss) });
    textoInfo += t("cmd_value0_value1_f1c8b5eb", { value0: fytBold(t("cmd_comandos_c2e2164e")), value1: uniqueCommands });
    textoInfo += t("cmd_value0_value1_f1c8b5eb", { value0: fytBold(t("cmd_instancia_18cddcba")), value1: botType });
    textoInfo += t("cmd_value0_92601e2c", { value0: fytBold(t("cmd_reed_system_1fddbc0f")) });

    let isGif = false;
    let bannerSourcePath = path.resolve("./assets/img/BotBanner.jpg");
    
    const dataDir = path.resolve(globalThis.DATA_BASE_DIR || "./data");
    const bannerFileName = String(botRecord?.currentBanner || botRecord?.data?.currentBanner || "").trim();
    
    const customBannerPath = bannerFileName ? path.join(dataDir, path.basename(bannerFileName)) : "";
    const customBannerBuffer = botRecord?.data?.customBanner?.base64 ? Buffer.from(botRecord.data.customBanner.base64, "base64") : null;
    
    let cacheKey = bannerSourcePath;

    if (customBannerPath && fs.existsSync(customBannerPath)) {
        bannerSourcePath = customBannerPath;
        cacheKey = customBannerPath;
        isGif = customBannerPath.endsWith(".gif");
    } else if (customBannerBuffer) {
        cacheKey = crypto.createHash("md5").update(customBannerBuffer).digest("hex");
        isGif = botRecord?.data?.customBanner?.mimetype?.includes("gif") || false;
    }

    let imgBanner = mediaCacheMap.get(cacheKey);

    if (!imgBanner && (customBannerBuffer || fs.existsSync(bannerSourcePath))) {
      try {
        const mediaPayload = customBannerBuffer || fs.createReadStream(bannerSourcePath);
        const mediaType = isGif ? { video: mediaPayload } : { image: mediaPayload };

        const prepared = await prepareWAMessageMedia(mediaType, {
          upload: sock.waUploadToServer,
          mediaTypeOverride: "thumbnail-link",
        });

        imgBanner = isGif ? prepared.videoMessage : prepared.imageMessage;
        if (imgBanner) mediaCacheMap.set(cacheKey, imgBanner);
      } catch (error) {
        console.error("[infobot] Error al preparar media del banner:", error);
      }
    }

    const getTs = (ts: unknown) => typeof ts === "object" && ts !== null && "low" in ts ? Number((ts as { low?: number }).low || 0) : Number(ts || 0);

    const content = {
      extendedTextMessage: {
        text: textoInfo,
        matchedText: chanellink,
        canonicalUrl: chanellink,
        description: globalThis.DEFAULT_BOT_AUTHOR || "Powered by Jeriel B.",
        title: `${botName.toUpperCase()} BOT - SYSTEM INFO`,
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
          forwardingScore: 2,
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
      quoted: msg as any,
    });

    await sock.relayMessage(remoteJid, waMsg.message, {
      messageId: waMsg.key.id,
    });
  },
};
