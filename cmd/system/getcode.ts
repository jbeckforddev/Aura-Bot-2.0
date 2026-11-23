import type { CommandContext } from "../../types/index.d.ts";
import {
  findOwnerSources,
  listOwnerSources,
  readOwnerSource,
} from "../../core/ownerFileWorkspace.ts";

export default {
  name: ["getcode", "getfile", "gc"],
  category: "system",
  description: "Busca código por nombre y envía el archivo; también permite rutas exactas.",
  usage: "getcode <nombre> (ejemplo: getcode ping)",
  ownerOnly: true,

  async run(ctx: CommandContext) {
    if (!ctx.isOwner) {
      return ctx.reply("✖ Solo los owners pueden consultar código.");
    }

    const prefix = ctx.usedPrefix || ctx.prefix || ".";
    const requested = String(ctx.rawText || ctx.args?.join(" ") || "").trim();

    if (!requested) {
      return ctx.reply([
        "*GETCODE · Búsqueda de archivos*",
        "Uso: " + prefix + "getcode ping",
        "Por extensión: " + prefix + "getcode ping.ts",
        "Por nombre parcial: " + prefix + "getcode filecheck",
        "La ruta es opcional. Si hay varias coincidencias iguales, mostraré sus ubicaciones.",
        "Solo los owners pueden utilizar este comando en grupos o privados.",
      ].join("\n"));
    }

    const deliver = (filePath: string) => {
      const source = readOwnerSource(filePath);
      return ctx.reply({
        document: source.content,
        fileName: source.filename,
        mimetype: "text/plain",
        caption: "Código: " + filePath + "\nTamaño: " + source.bytes + " bytes",
      });
    };

    // Búsqueda automática por nombre, sin exigir categoría ni ruta.
    if (!requested.includes("/")) {
      try {
        const matches = findOwnerSources(requested);
        if (matches.length === 0) {
          return ctx.reply("✖ No encontré archivos autorizados con el nombre: " + requested);
        }
        const best = matches[0]!;
        const tied = matches.filter(file =>
          file.matchRank === best.matchRank &&
          file.locationRank === best.locationRank
        );
        if (tied.length > 1) {
          return ctx.reply([
            "Encontré varios archivos llamados *" + requested + "*:",
            ...tied.slice(0, 15).map(file => "• " + file.path),
            "Para elegir uno utiliza: " + prefix + "getcode <ruta mostrada>",
          ].join("\n"));
        }
        return deliver(best.path);
      } catch (error) {
        return ctx.reply(
          "✖ Getcode: " + (error instanceof Error ? error.message : "No se pudo buscar el archivo."),
        );
      }
    }

    // Las rutas siguen siendo compatibles, pero ya no son obligatorias.
    let fileError: unknown;
    try { return deliver(requested); }
    catch (error) { fileError = error; }

    try {
      const entries = listOwnerSources(requested);
      return ctx.reply([
        "Carpeta: " + requested,
        entries.length ? "Archivos y subcarpetas autorizados:" : "Sin archivos autorizados.",
        ...entries.map(name => "• " + name),
        "Usa " + prefix + "getcode " + requested.replace(/\/$/, "") + "/<archivo>",
      ].join("\n"));
    } catch {
      return ctx.reply(
        "✖ Getcode: " + (fileError instanceof Error ? fileError.message : "Ruta no disponible."),
      );
    }
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
