import type { CommandContext, ReplyContent } from "../../types/index.d.ts";
import { readFile, stat, rm } from "node:fs/promises";
import { downloadToCache, safeFileName } from "../../core/downloadUtils.ts";
import { t } from "../../src/langs/index.ts";

const MAX_FILE_SIZE = 800 * 1024 * 1024;
const MAX_CODE_MESSAGE_SIZE = 12000;
const CLEANUP_DELAY_MS = 60_000;

const CODE_EXTENSIONS = new Set([
  "c",
  "cpp",
  "cs",
  "css",
  "go",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "md",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

function extensionFromMime(mime: string): string {
  return (
    (
      {
        "application/pdf": "pdf",
        "application/zip": "zip",
        "application/json": "json",
        "text/plain": "txt",
        "text/html": "html",
      } as Record<string, string>
    )[mime] ||
    mime.split("/")[1] ||
    "bin"
  );
}

function mimeFromExtension(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return (
    (
      {
        avif: "image/avif",
        gif: "image/gif",
        jpeg: "image/jpeg",
        jpg: "image/jpeg",
        m4a: "audio/mp4",
        mp3: "audio/mpeg",
        mp4: "video/mp4",
        ogg: "audio/ogg",
        opus: "audio/ogg",
        png: "image/png",
        wav: "audio/wav",
        webm: "video/webm",
        webp: "image/webp",
        zip: "application/zip",
      } as Record<string, string>
    )[ext || ""] || "application/octet-stream"
  );
}

function fileNameFromResponse(
  url: string,
  disposition: string | null,
  extension: string,
): string {
  const headerName = disposition?.match(
    /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i,
  )?.[1];
  if (headerName) {
    try {
      return safeFileName(decodeURIComponent(headerName), `archivo.${extension}`);
    } catch {
      return safeFileName(headerName, `archivo.${extension}`);
    }
  }
  try {
    const name = decodeURIComponent(
      new URL(url).pathname.split("/").pop() || "",
    );
    if (name.includes(".")) return safeFileName(name, `archivo.${extension}`);
  } catch {
    return `archivo.${extension}`;
  }
  return `archivo.${extension}`;
}

function isCode(mime: string, name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return (
    (mime.startsWith("text/") && mime !== "text/html") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("xml") ||
    CODE_EXTENSIONS.has(ext || "")
  );
}

export default {
  name: ["get", "fetch", "download"],
  category: "utils",
  description: t("cmd_descarga_y_envia_contenido_des_fbc1ca27"),
  async run({ args, reply, react }: CommandContext) {
    const url = args.join(" ").trim();
    if (!/^https?:\/\//i.test(url)) {
      return reply({
        text: t("cmd_proporciona_una_url_valida_eje_c2dd8ec7"),
      });
    }

    await react("⬇️").catch(() => undefined);
    let filePath = "";

    try {
      let response: Response | null = null;
      try {
        const headRes = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "Mozilla/5.0 AuraReedBot" },
        });
        if (headRes.ok) response = headRes;
      } catch {}

      const length = Number(response?.headers.get("content-length") || 0);
      if (length > MAX_FILE_SIZE) {
        throw new Error("El archivo supera el límite de 800 MB.");
      }

      filePath = await downloadToCache(url, 600000);
      const fileSize = (await stat(filePath)).size;

      if (fileSize > MAX_FILE_SIZE) {
        await rm(filePath, { force: true }).catch(() => undefined);
        filePath = "";
        throw new Error("El archivo supera el límite de 800 MB.");
      }

      const headerMime = (response?.headers.get("content-type") || "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();

      const disposition =
        response?.headers.get("content-disposition") ||
        response?.headers.get(t("cmd_content_disposition_911721d6")) ||
        null;

      const fileName = fileNameFromResponse(
        url,
        disposition,
        extensionFromMime(headerMime),
      );

      const mimeType =
        headerMime && headerMime !== "application/octet-stream"
          ? headerMime
          : mimeFromExtension(fileName);

      let payload: ReplyContent;

      if (isCode(mimeType, fileName) && fileSize <= MAX_CODE_MESSAGE_SIZE) {
        const source = await readFile(filePath, "utf8");
        payload = { text: `*${fileName}*\n\n\`\`\`\n${source}\n\`\`\`` };
      } else if (mimeType.startsWith("image/") && mimeType !== "image/gif") {
        payload = {
          image: { url: filePath },
          mimetype: mimeType,
          caption: fileName,
        };
      } else if (mimeType.startsWith("video/")) {
        payload = { video: { url: filePath }, mimetype: mimeType, fileName };
      } else if (mimeType.startsWith("audio/")) {
        payload = { audio: { url: filePath }, mimetype: mimeType, fileName };
      } else {
        payload = { document: { url: filePath }, mimetype: mimeType, fileName };
      }

      await reply(payload);
      await react("✅").catch(() => undefined);
    } catch (error: unknown) {
      await react("❌").catch(() => undefined);
      return reply({
        text: t("cmd_no_se_pudo_descargar_el_conten_4fccb4df", {
          value0:
            error instanceof Error
              ? error.message
              : String(error) || "respuesta inválida",
        }),
      }).catch(() => undefined);
    } finally {
      if (filePath) {
        const targetToDelete = filePath;
        const timer = setTimeout(() => {
          void rm(targetToDelete, { force: true }).catch(() => undefined);
        }, CLEANUP_DELAY_MS);
        timer.unref?.();
      }
    }
  },
};
