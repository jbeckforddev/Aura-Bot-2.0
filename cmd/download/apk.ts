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
import { t } from "../../src/langs/index.ts";

const API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");

export default {
  name: ["apk", "apkdl", "apkd", "apks", "apkdownload", "androidapp", "app"],
  category: "download",
  description: t("cmd_descarga_archivos_apk_de_andro_307c0878"),
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg, sender } = ctx;
    const query = args.join(" ").trim();
    if (!query) return reply(t("cmd_proporciona_el_nombre_de_la_ap_b8200239"));
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
        label: t("cmd_apk_downloader_6df2079b"),
        icon: t("cmd_text_32e21cc3"),
        title: name,
        packageName: data.package,
        size: data.size,
        version: data.lastUpdated,
        type: t("cmd_aplicacion_apk_f42ea680"),
        cost: formatMoney(cost, ctx),
        showPackage: Boolean(data.package),
        showSize: Boolean(data.size),
        showVersion: Boolean(data.lastUpdated),
        showType: true,
        loadingText: t("cmd_descargando_apk_763e24f0"),
        loadingIcon: t("cmd_text_7a2ad7a6"),
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
        text: t("cmd_value0_bb624cd4", { value0: message }),
      });
    }
  },
};
