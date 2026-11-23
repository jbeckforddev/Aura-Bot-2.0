import type { CommandContext } from "../../types/index.d.ts";
import {
  findOwnerSources,
  listOwnerSources,
  readOwnerSource,
} from "../../core/ownerFileWorkspace.ts";
import { ownerFilePanel } from "../../core/ownerFileDesign.ts";
import { formatOwnerCodeMessages } from "../../core/ownerCodeMessage.ts";

export default {
  name: ["getcode", "getfile", "gc"],
  category: "system",
  description: "Busca y muestra código directamente en el chat, con el diseño de #r cat.",
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
        "🔎 *Función:* Busca el código y lo muestra dentro del chat.",
        "📝 *Uso:* \x60" + prefix + "getcode ping\x60",
        "📄 *Extensión opcional:* \x60" + prefix + "getcode ping.ts\x60",
        "🗂️ *Nombre parcial:* \x60" + prefix + "getcode filecheck\x60",
        "🖥️ *Formato:* Como \x60" + prefix + "r cat\x60, sin adjuntar archivos.",
        "📁 *Ruta:* Opcional, si hay nombres duplicados.",
        "🔒 *Acceso:* Solo owners, en grupos o privados.",
      ]));
    }

    async function display(filePath: string) {
      // Primero validar y dividir toda la salida; nunca enviar un
      // fragmento si el archivo completo excede el límite.
      const source = readOwnerSource(filePath);
      const messages = formatOwnerCodeMessages(filePath, source.content);
      if (typeof ctx.react === "function") {
        await ctx.react("💻").catch(() => undefined);
      }
      let result: Awaited<ReturnType<CommandContext["reply"]>> = undefined;
      for (const message of messages) {
        result = await ctx.reply({ text: message });
      }
      if (typeof ctx.react === "function") {
        await ctx.react("✅").catch(() => undefined);
      }
      return result;
    }

    // Búsqueda por nombre, no requiere conocer la carpeta.
    if (!requested.includes("/")) {
      try {
        const matches = findOwnerSources(requested);
        if (matches.length === 0) {
          return ctx.reply(ownerFilePanel("GETCODE", "SIN RESULTADOS", [
            "⚠️ No encontré código autorizado con ese nombre.",
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
        return await display(best.path);
      } catch (error) {
        if (typeof ctx.react === "function") {
          await ctx.react("❌").catch(() => undefined);
        }
        return ctx.reply(ownerFilePanel("GETCODE", "ERROR DE LECTURA", [
          "❌ No se pudo mostrar el código.",
          "⚠️ *Detalle:* " + (error instanceof Error ? error.message : "Error desconocido."),
        ], "error"));
      }
    }

    // Mantener rutas opcionales y el listado de carpetas.
    let fileError: unknown;
    try { return await display(requested); }
    catch (error) { fileError = error; }

    try {
      const entries = listOwnerSources(requested);
      return ctx.reply(ownerFilePanel("GETCODE", "CONTENIDO DE CARPETA", [
        "📁 *Directorio:* \x60" + requested + "\x60",
        entries.length ? "📋 *Fuentes autorizadas:*" : "⚠️ Sin archivos autorizados.",
        ...entries.map(name => "📄 " + name),
        "📝 *Seleccionar:* \x60" + prefix + "getcode " + requested.replace(/\/$/, "") + "/<archivo>\x60",
      ]));
    } catch {
      return ctx.reply(ownerFilePanel("GETCODE", "ARCHIVO NO DISPONIBLE", [
        "❌ No se encontró una ruta válida para el código solicitado.",
        "⚠️ *Detalle:* " + (fileError instanceof Error ? fileError.message : "Ruta no disponible."),
      ], "error"));
    }
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
