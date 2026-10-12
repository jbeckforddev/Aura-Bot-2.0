import type { CommandContext } from "../../types/index.d.ts";
import { readFile, stat } from "node:fs/promises";
import { downloadToCache, safeFileName } from "../../core/downloadUtils.ts";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_CODE_MESSAGE_SIZE = 12000;
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
  if (headerName)
    return safeFileName(decodeURIComponent(headerName), `archivo.${extension}`);
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
  description: "Descarga y envía contenido desde una URL.",
  async run({ args, reply, react }: CommandContext) {
    const url = args.join(" ").trim();
    if (!/^https?:\/\//i.test(url))
      return reply({
        text: "❌ Proporciona una URL válida. Ejemplo: .get https://sitio.com/archivo",
      });
    await react("⬇️");
    try {
      let response: Response | null = null;
      try {
        response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(30000),
          headers: { "User-Agent": "Mozilla/5.0 AuraReedBot" },
        });
      } catch {
        // Algunos servidores no implementan HEAD; la descarga real valida el estado.
      }
      const length = Number(response?.headers.get("content-length") || 0);
      if (response && !response.ok) throw new Error(`HTTP ${response.status}`);
      if (length > MAX_FILE_SIZE) throw new Error("El archivo supera 50 MB.");
      const filePath = await downloadToCache(url, 180000);
      const fileSize = (await stat(filePath)).size;
      if (fileSize > MAX_FILE_SIZE) throw new Error("El archivo supera 50 MB.");
      const headerMime = (response?.headers.get("content-type") || "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      const fileName = fileNameFromResponse(
        url,
        response?.headers.get("content-disposition") || null,
        extensionFromMime(headerMime),
      );
      const mimeType =
        headerMime && headerMime !== "application/octet-stream"
          ? headerMime
          : mimeFromExtension(fileName);
      let payload: import("../../types/index.d.ts").ReplyContent;
      if (isCode(mimeType, fileName) && fileSize <= MAX_CODE_MESSAGE_SIZE) {
        const source = await readFile(filePath, "utf8");
        payload = { text: `*${fileName}*\n\n\`\`\`\n${source}\n\`\`\`` };
      } else if (mimeType.startsWith("image/") && mimeType !== "image/gif")
        payload = {
          image: { url: filePath },
          mimetype: mimeType,
          caption: fileName,
        };
      else if (mimeType.startsWith("video/"))
        payload = { video: { url: filePath }, mimetype: mimeType, fileName };
      else if (mimeType.startsWith("audio/"))
        payload = { audio: { url: filePath }, mimetype: mimeType, fileName };
      else
        payload = { document: { url: filePath }, mimetype: mimeType, fileName };
      await reply(payload);
      await react("✅");
    } catch (error: unknown) {
      console.error(
        "[get] Error:",
        error instanceof Error ? error.message : String(error) || error,
      );
      await react("❌");
      return reply({
        text: `❌ No se pudo descargar el contenido: ${error instanceof Error ? error.message : String(error) || "respuesta inválida"}`,
      });
    }
  },
};
