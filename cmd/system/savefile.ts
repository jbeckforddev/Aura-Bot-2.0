import type { CommandContext } from "../../types/index.d.ts";
import { getOwnerQuotedCode, writeOwnerStage } from "../../core/ownerFileWorkspace.ts";
import { ownerFileBytes, ownerFilePanel } from "../../core/ownerFileDesign.ts";

export default {
  name: ["savefile", "guardararchivo", "creararchivo"],
  category: "system",
  description: "Crea o actualiza archivos de código en una zona aislada de preparación.",
  usage: "savefile <ruta> (responde al código o envíalo después de la ruta)",
  ownerOnly: true,

  async run(ctx: CommandContext) {
    if (!ctx.isOwner) {
      return ctx.reply(ownerFilePanel("SAVEFILE", "ACCESO RESTRINGIDO", [
        "⛔ Solo los owners pueden guardar código.",
      ], "error"));
    }

    const prefix = ctx.usedPrefix || ctx.prefix || ".";
    const raw = String(ctx.rawText || ctx.args?.join(" ") || "").trim();
    const first = raw.match(/^(\S+)(?:\s+([\s\S]*))?$/);

    if (!first) {
      return ctx.reply(ownerFilePanel("SAVEFILE", "GUÍA DE USO", [
        "📥 *Función:* Crear o actualizar código preparado.",
        "📝 *Uso:* \x60" + prefix + "savefile cmd/system/ejemplo.ts\x60",
        "💬 *Contenido:* Responde al mensaje con el código.",
        "🔄 *Actualización:* Automática, sin --replace.",
        "🔒 *Seguridad:* Solo owners, en grupos o privados.",
        "📁 *Destino:* Área aislada; no modifica el bot activo.",
      ]));
    }

    const relative = first[1]!;
    const inline = String(first[2] || "").trim();
    const source = getOwnerQuotedCode(ctx.msg) || inline;

    if (!source.trim()) {
      return ctx.reply(ownerFilePanel("SAVEFILE", "FALTA CONTENIDO", [
        "⚠️ Falta el código que deseas guardar.",
        "💬 Responde a un mensaje con código o escríbelo tras la ruta.",
        "📝 *Ejemplo:* \x60" + prefix + "savefile cmd/system/ejemplo.ts\x60",
      ], "error"));
    }

    try {
      const saved = writeOwnerStage(relative, source);
      return ctx.reply(ownerFilePanel(
        "SAVEFILE",
        saved.replaced ? "ARCHIVO ACTUALIZADO" : "ARCHIVO CREADO",
        [
          saved.replaced ? "✅ Archivo preparado actualizado." : "✅ Archivo preparado creado.",
          "📄 *Nombre:* \x60" + saved.path.split("/").pop() + "\x60",
          "📁 *Ruta:* \x60" + saved.path + "\x60",
          "📦 *Tamaño:* \x60" + ownerFileBytes(saved.bytes) + "\x60",
          "📤 *Consultar:* \x60" + prefix + "getcode " + saved.path.split("/").pop() + "\x60",
          "🔒 *Estado:* Preparado; no modifica sockets activos.",
        ],
        "success",
      ));
    } catch (error) {
      return ctx.reply(ownerFilePanel("SAVEFILE", "ERROR AL GUARDAR", [
        "❌ No se pudo guardar el archivo.",
        "⚠️ *Detalle:* " + (error instanceof Error ? error.message : "Error desconocido."),
      ], "error"));
    }
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
