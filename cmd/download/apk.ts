import { fytBold } from "../../core/socketText.ts";
import {
  downloadToCache,
  requestJson,
  safeFileName,
} from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import { sendDownloadPreview } from "../../core/downloadPreview.ts";
import type {
  CommandContext,
  ApkDownloadResponse,
} from "../../types/index.d.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
const API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");

export default {
  name: ["apk", "apkdl", "apkd", "apks", "apkdownload", "androidapp", "app"],
  category: "download",
  description: "Descarga archivos APK de Android.",
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply("⚠️ Proporciona el nombre de la aplicación APK.");
    await react("⏳");
    try {
      const response = await requestJson<ApkDownloadResponse>(
        `${API}/search/apk?query=${encodeURIComponent(query)}&key=${DL_CONFIG.alya.API_KEY}`,
      );
      const data = response?.data;
      if (!response?.status || !data?.dl)
        throw new Error("No se encontró una aplicación descargable.");
      const name = String(data.name || "Aplicación Android");
      const file = await downloadToCache(data.dl);
      const { cost } = await prepareDownloadCharge(ctx, "document", file);
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: "APK DOWNLOADER",
        icon: "🤖",
        title: name,
        packageName: data.package,
        size: data.size,
        version: data.lastUpdated,
        type: "Aplicación (APK)",
        cost: formatMoney(cost, ctx),
        showPackage: Boolean(data.package),
        showSize: Boolean(data.size),
        showVersion: Boolean(data.lastUpdated),
        showType: true,
        loadingText: "Descargando APK...",
      });
      const hasPreview = data.banner
        ? await sendDownloadPreview({
            sock,
            from,
            msg,
            thumbnail: data.banner,
            caption,
            link: data.dl,
            title: name,
            author: globalThis.DEFAULT_BOT_AUTHOR,
            sender,
          })
        : false;
      if (!hasPreview) await reply({ text: caption });
      await reply({
        document: { url: file },
        mimetype: "application/vnd.android.package-archive",
        fileName: `${safeFileName(name, "application")}.apk`,
      });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      const message =
        error instanceof Error ? error.message : "No se pudo descargar el APK.";
      return reply({
        text: `${message}`,
      });
    }
  },
};
