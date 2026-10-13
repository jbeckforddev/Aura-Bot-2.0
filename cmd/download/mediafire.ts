import type { CommandContext } from "../../types/index.d.ts";
import { request } from "undici";
import { fytBold } from "../../core/socketText.ts";
import { downloadToCache, safeFileName } from "../../core/downloadUtils.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { t } from "../../src/langs/index.ts";


const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AuraReedBot/2.0",
};

async function resolveMediaFire(
  url: string,
): Promise<{ download: string; name: string; size: string }> {
  if (!/mediafire\.com\/file\//i.test(url))
    throw new Error("URL de MediaFire inválida.");
  const response = await request(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(30000),
  });
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(`MediaFire HTTP ${response.statusCode}`);
  const html = await response.body.text();
  const link =
    html.match(/id=["']downloadButton["'][^>]+href=["']([^"']+)/i)?.[1] ||
    html.match(/href=["']([^"']+)["'][^>]*id=["']downloadButton/i)?.[1];
  if (!link)
    throw new Error("No se encontró el enlace de descarga de MediaFire.");
  const name =
    html
      .match(/class=["'][^"']*filename[^"']*["'][^>]*>([^<]+)/i)?.[1]
      ?.trim() || "archivo";
  const size = html.match(/File size:\s*([^<]+)/i)?.[1]?.trim() || "N/A";
  return { download: link, name, size };
}

export default {
  name: ["md", "mf", "mediafire"],
  category: "download",
  description: t("cmd_descarga_archivos_de_mediafire_b173c95a"),
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const url = args.join(" ").trim();
    if (!url) return reply(t("cmd_proporciona_un_enlace_de_media_3a3d65e9"));
    await react("⏳");
    try {
      const data = await resolveMediaFire(url);
      const file = await downloadToCache(
        data.download,
        180000,
        {},
        2 * 1024 * 1024 * 1024,
      );
      const { cost } = await prepareDownloadCharge(ctx, "document", file);
      const name = safeFileName(data.name, "mediafire");
      const extension =
        name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || "bin";
      const mime =
        extension === "apk"
          ? "application/vnd.android.package-archive"
          : "application/octet-stream";
      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_mediafire_dl_0af010a4"),
        icon: t("cmd_text_22188772"),
        title: name,
        size: data.size,
        extension,
        type: t("cmd_archivo_6a2262aa"),
        cost: formatMoney(cost, ctx),
        url,
        showSize: Boolean(data.size && data.size !== t("cmd_n_a_08d2e98e")),
        showExtension: true,
        showType: true,
        loadingText: t("cmd_descargando_archivo_c5897964"),
        loadingIcon: t("cmd_text_7a2ad7a6"),
      });
      await reply({ text: caption });
      await reply({ document: { url: file }, mimetype: mime, fileName: name });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      const message =
        error instanceof Error
          ? error.message
          : String(error) || "No se pudo descargar el archivo.";
      return reply({
        text: t("cmd_value0_maximo_permitido_2_gb_p_9befd25d", { value0: message }),
      });
    }
  },
};
