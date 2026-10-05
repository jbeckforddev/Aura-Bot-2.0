import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  type proto,
} from "@whiskeysockets/baileys";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../core/subbotManager.ts";
// import { getActivePremBots } from "../../core/prembotManager.ts"; // Uncomment if you have a function to get active premium bots
import type { CommandContext } from "../../types/index.d.ts";
import { formatDuration, formatFileSize } from "../../utils/formatter.ts";

const mediaCacheMap = new Map<string, any>();

function getServerName(): string {
  const envName =
    process.env.SERVER_NAME ||
    process.env.P_SERVER_LOCATION ||
    process.env.P_SERVER_NAME;
  if (envName) return envName;

  const host = os.hostname();
  if (
    host.includes("-") ||
    host.length > 20 ||
    /^[a-f0-9]+$/i.test(host)
  ) {
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
    if (
      fs.existsSync("/sys/fs/cgroup/memory.max") &&
      fs.existsSync("/sys/fs/cgroup/memory.current")
    ) {
      const total = readNumber("/sys/fs/cgroup/memory.max");
      const used = readNumber("/sys/fs/cgroup/memory.current");
      if (total !== null && total > 0 && used !== null && used >= 0) {
        return { total, used, source: "contenedor" };
      }
    }

    if (fs.existsSync("/sys/fs/cgroup/memory/memory.limit_in_bytes")) {
      const total = readNumber("/sys/fs/cgroup/memory/memory.limit_in_bytes");
      const used = readNumber("/sys/fs/cgroup/memory/memory.usage_in_bytes");
      if (
        total !== null &&
        total > 0 &&
        total < 9223372036854771712 &&
        used !== null &&
        used >= 0
      ) {
        return { total, used, source: "contenedor" };
      }
    }
  } catch {
    // Algunos sistemas no permiten leer los archivos virtuales de cgroups.
  }

  return {
    total: os.totalmem(),
    used: process.memoryUsage().rss,
    source: "host",
  };
}

function countCommandFiles(dirPath: string): number {
  let total = 0;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        total += countCommandFiles(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        total += 1;
      }
    }
  } catch {
    return total;
  }

  return total;
}

export default {
  name: ["infobot", "botinfo"],
  category: "system",
  description: "Muestra información detallada del bot, sesión y sistema.",

  async run(ctx: CommandContext) {
    const { sock, from, msg, db } = ctx;
    const remoteJid = from;
    const pushName = msg?.pushName || "Usuario";
    const botRecord = db.getBot?.(sock.user?.id);
    const botName = String(botRecord?.bot_name || "Aura Reed").trim() || "Aura Reed";
    const botType = sock.isSubBot
      ? "Sub-Bot"
      : String(botRecord?.bot_type ?? String(botRecord?.data?.bot_type ?? "")).toLowerCase().includes("prem") ||
          String(botRecord?.bot_type ?? String(botRecord?.data?.bot_type ?? "")).toLowerCase().includes("premium")
        ? "Prem-Bot"
        : "Principal";
    const botVersion = "2.5";
    const serverHost = getServerName();
    const platform = `${os.platform()} (${os.arch()})`;
    const memory = getMemoryInfo();
    const ramPercent =
      memory.total > 0
        ? ((memory.used / memory.total) * 100).toFixed(1)
        : "0.0";
    const totalCmds = countCommandFiles(path.resolve("./cmd"));
    const activeSubBots = getActiveSubBots().length;
    // const activePremBots = getActivePremBots().length; // Uncomment if you have a function to get active premium bots
    const chanellink = "https://aetheryx.xyz/";
    const tituloEstilizado = fytBold(`${botName.toUpperCase()} BOT`);

    let textoInfo = `╭━━〔 ${tituloEstilizado} 〕━━⬣\n`;
    textoInfo += `┃ > ${fytBold("Usuario: ")} @${pushName}\n`;
    textoInfo += `┃ > ${fytBold("Bot: ")} ${botType}\n`;
    textoInfo += `┃ > ${fytBold("Versión: ")} ${botVersion}\n`;
    textoInfo += `┃ > ${fytBold("Owner: ")} Jeriel B.\n`;
    textoInfo += `┃ > ${fytBold("Prefix: ")} [ ${ctx.usedPrefix ?? ctx.prefix ?? "."} ]\n`;
    textoInfo += `┃ > ${fytBold("Fecha: ")} ${new Date().toLocaleDateString("es-CR")}\n`;
    textoInfo += `┃ > ${fytBold("Sub-Bots: ")} ${activeSubBots}\n`;
    textoInfo += `┃ > ${fytBold("Prem-Bots: ")} 0 (No disponible)\n`;
    textoInfo += `┃ > ${fytBold("Url: ")} ${chanellink}\n`;
    textoInfo += `╰━━━━━━━━━━━━━━━━━━⬣\n\n`;

    textoInfo += `┏━━〔 ${fytBold("INFO DEL SISTEMA")} 〕━━⬣\n`;
    textoInfo += `┃ ➪ ${fytBold("Servidor / Host: ")} ${serverHost}\n`;
    textoInfo += `┃ ➪ ${fytBold("Sistema Operativo: ")} ${platform}\n`;
    textoInfo += `┃ ➪ ${fytBold("Tiempo Activo (Bot): ")} ${formatDuration(process.uptime())}\n`;
    textoInfo += `┃ ➪ ${fytBold("RAM Servidor: ")} ${formatFileSize(memory.total)} (${ramPercent}%)\n`;
    textoInfo += `┃ ➪ ${fytBold("RAM Bot: ")} ${formatFileSize(process.memoryUsage().rss)}\n`;
    textoInfo += `┃ ➪ ${fytBold("Comandos: ")} ${totalCmds}\n`;
    textoInfo += `┃ ➪ ${fytBold("Instancia: ")} ${botType}\n`;
    textoInfo += `╰〔 ⚡ ${fytBold("REED SYSTEM")} 〕⬣`;

    let bannerPath = path.resolve("./assets/img/BotBanner.jpg");
    let isGif = false;

    const dataDir = path.resolve(globalThis.DATA_BASE_DIR || "./data");
    const bannerFileName = String(
      botRecord?.currentBanner || botRecord?.data?.currentBanner || "",
    ).trim();
    const bannerSource = bannerFileName
      ? path.join(dataDir, path.basename(bannerFileName))
      : "";
    const customBanner =
      (bannerSource && fs.existsSync(bannerSource)
        ? { path: bannerSource }
        : null) ?? botRecord?.data?.customBanner ?? null;
    const customBannerBuffer = customBanner?.base64
      ? Buffer.from(customBanner.base64, "base64")
      : null;
    const resolvedCustomPath = customBanner?.path
      ? path.resolve(String(customBanner.path))
      : null;

    if (
      (resolvedCustomPath && fs.existsSync(resolvedCustomPath)) ||
      customBannerBuffer?.length
    ) {
      bannerPath = resolvedCustomPath || `database-banner-${String(customBanner.base64 || "").slice(0, 32)}`;
      isGif = Boolean(
        customBanner.mimetype?.includes("gif") || bannerPath.endsWith(".gif"),
      );
    }

    let imgBanner: any = mediaCacheMap.get(bannerPath);
    if (!imgBanner && (customBannerBuffer?.length || fs.existsSync(bannerPath))) {
      try {
        const mediaType = isGif
          ? { video: customBannerBuffer || fs.readFileSync(bannerPath) }
          : { image: customBannerBuffer || fs.readFileSync(bannerPath) };

        const prepared = await prepareWAMessageMedia(mediaType, {
          upload: sock.waUploadToServer,
          mediaTypeOverride: "thumbnail-link",
        });

        imgBanner = isGif ? prepared.videoMessage : prepared.imageMessage;
        if (imgBanner) {
          mediaCacheMap.set(bannerPath, imgBanner);
        }
      } catch (error) {
        console.error("[infobot] Error al preparar media del banner:", error);
      }
    }

    const getTs = (ts: unknown) =>
      typeof ts === "object" && ts !== null && "low" in ts
        ? Number((ts as { low?: number }).low || 0)
        : Number(ts || 0);

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
