import type { CommandContext } from "../../types/index.d.ts";
import { listOwnerSources, readOwnerSource } from "../../core/ownerFileWorkspace.ts";

export default {
  name: ["getcode", "getfile", "gc"],
  category: "system",
  description: "Envía código autorizado como archivo o lista una carpeta de fuentes.",
  usage: "getcode <ruta> (o getcode staged/<ruta> para archivos preparados)",
  ownerOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.isOwner) {
      return ctx.reply("✖ Solo los owners pueden consultar código.");
    }
    const prefix = ctx.usedPrefix || ctx.prefix || ".";
    const requested = String(ctx.rawText || ctx.args?.join(" ") || "").trim();
    if (!requested) {
      return ctx.reply([
        "*GETCODE · Consulta segura*",
        "Uso: " + prefix + "getcode cmd/system/ping.ts",
        "Carpeta: " + prefix + "getcode cmd/system",
        "Preparados: " + prefix + "getcode staged/cmd/system/ejemplo.ts",
        "Solo admite código y documentación. Nunca muestra sesiones, secretos o archivos de configuración sensibles.",
      ].join("\n"));
    }
    let fileError: unknown;
    try {
      const source = readOwnerSource(requested);
      return ctx.reply({
        document: source.content,
        fileName: source.filename,
        mimetype: "text/plain",
        caption: "Código: " + requested + "\nTamaño: " + source.bytes + " bytes",
      });
    } catch (error) { fileError = error; }
    try {
      const entries = listOwnerSources(requested);
      return ctx.reply([
        "Carpeta: " + requested,
        entries.length ? "Archivos y subcarpetas autorizados:" : "Sin archivos de código autorizados.",
        ...entries.map(name => "• " + name),
        "Usa " + prefix + "getcode " + requested.replace(/\/$/, "") + "/<archivo>",
      ].join("\n"));
    } catch {
      return ctx.reply("✖ Getcode: " + (fileError instanceof Error ? fileError.message : "Ruta no disponible."));
    }
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
