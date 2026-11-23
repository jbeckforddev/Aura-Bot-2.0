import type { CommandContext } from "../../types/index.d.ts";
import {
  findOwnerSources,
  listOwnerSources,
  readOwnerSource,
} from "../../core/ownerFileWorkspace.ts";
import { ownerFileBytes, ownerFilePanel } from "../../core/ownerFileDesign.ts";

export default {
  name: ["getcode", "getfile", "gc"],
  category: "system",
  description: "Busca y envía código por nombre, sin requerir la ruta del archivo.",
  usage: "getcode <nombre> (ejemplo: getcode ping)",
  ownerOnly: true,

  async run(ctx: CommandContext) {
    if (!ctx.isOwner) {
      return ctx.reply(ownerFilePanel("GETCODE", "ACCESO RESTRINGIDO", [
        "⛔ Solo los owners pueden consultar código.",
      ], "error"));
    }

    const prefix = ctx.usedPrefix || ctx.prefix || ".";
    const requested = String(ctx.rawText || ctx.args?.join(" ") || "").trim();

    if (!requested) {
      return ctx.reply(ownerFilePanel("GETCODE", "GUÍA DE USO", [
        "🔎 *Función:* Busca código por nombre y envía el archivo.",
        "📝 *Uso:* \x60" + prefix + "getcode ping\x60",
        "📄 *Extensión opcional:* \x60" + prefix + "getcode ping.ts\x60",
        "🗂️ *Nombre parcial:* \x60" + prefix + "getcode filecheck\x60",
        "📁 *Ruta:* Opcional, solo si hay varios resultados.",
        "🔒 *Acceso:* Solo owners, en grupos o privados.",
      ]));
    }

    const deliver = (filePath: string) => {
      const source = readOwnerSource(filePath);
      return ctx.reply({
        document: source.content,
        fileName: source.filename,
        mimetype: "text/plain",
        caption: ownerFilePanel("GETCODE", "ARCHIVO ENCONTRADO", [
          "✅ Código localizado correctamente.",
          "📄 *Nombre:* \x60" + source.filename + "\x60",
          "📁 *Ruta:* \x60" + filePath + "\x60",
          "📦 *Tamaño:* \x60" + ownerFileBytes(source.bytes) + "\x60",
          "🔒 *Acceso:* Owner autorizado.",
        ], "success"),
      });
    };

    if (!requested.includes("/")) {
      try {
        const matches = findOwnerSources(requested);
        if (matches.length === 0) {
          return ctx.reply(ownerFilePanel("GETCODE", "SIN RESULTADOS", [
            "⚠️ No encontré archivos autorizados con ese nombre.",
            "🔎 *Búsqueda:* \x60" + requested + "\x60",
            "📝 *Sugerencia:* Comprueba el nombre o la extensión.",
          ], "error"));
        }
        const best = matches[0]!;
        const tied = matches.filter(file =>
          file.matchRank === best.matchRank &&
          file.locationRank === best.locationRank
        );

        if (tied.length > 1) {
          return ctx.reply(ownerFilePanel("GETCODE", "VARIAS COINCIDENCIAS", [
            "📁 Encontré varios archivos llamados \x60" + requested + "\x60:",
            ...tied.slice(0, 15).map(file => "📄 \x60" + file.path + "\x60"),
            "📝 *Seleccionar:* \x60" + prefix + "getcode <ruta mostrada>\x60",
          ]));
        }

        return deliver(best.path);
      } catch (error) {
        return ctx.reply(ownerFilePanel("GETCODE", "ERROR DE BÚSQUEDA", [
          "❌ No se pudo buscar el archivo.",
          "⚠️ *Detalle:* " + (error instanceof Error ? error.message : "Error desconocido."),
        ], "error"));
      }
    }

    let fileError: unknown;
    try { return deliver(requested); }
    catch (error) { fileError = error; }

    try {
      const entries = listOwnerSources(requested);
      return ctx.reply(ownerFilePanel("GETCODE", "CONTENIDO DE CARPETA", [
        "📁 *Directorio:* \x60" + requested + "\x60",
        entries.length ? "📋 *Archivos autorizados:*" : "⚠️ Sin archivos autorizados.",
        ...entries.map(name => "📄 " + name),
        "📝 *Seleccionar:* \x60" + prefix + "getcode " + requested.replace(/\/$/, "") + "/<archivo>\x60",
      ]));
    } catch {
      return ctx.reply(ownerFilePanel("GETCODE", "ARCHIVO NO DISPONIBLE", [
        "❌ No se encontró una ruta válida para el archivo solicitado.",
        "⚠️ *Detalle:* " + (fileError instanceof Error ? fileError.message : "Ruta no disponible."),
      ], "error"));
    }
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
