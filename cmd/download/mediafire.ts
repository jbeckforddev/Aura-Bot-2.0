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
  description: "Descarga archivos de MediaFire.",
  async run(ctx: CommandContext) {
    const { args, reply, react } = ctx;
    const url = args.join(" ").trim();
    if (!url) return reply("⚠️ Proporciona un enlace de MediaFire.");
    await react("⏳");
    try {
      const data = await resolveMediaFire(url);
      const file = await downloadToCache(data.download, 180000);
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
        label: "MEDIAFIRE DL",
        icon: "📦",
        title: name,
        size: data.size,
        extension,
        type: "Archivo",
        cost: formatMoney(cost, ctx),
        url,
        showSize: Boolean(data.size && data.size !== "N/A"),
        showExtension: true,
        showType: true,
        loadingText: "Descargando archivo...",
        loadingIcon: "⏳",
      });
      await reply({ text: caption });
      await reply({ document: { url: file }, mimetype: mime, fileName: name });
      confirmDownloadCharge(ctx);
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `${error instanceof Error ? error.message : String(error) || "No se pudo descargar el archivo."}`,
      });
    }
  },
};
