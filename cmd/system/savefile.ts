import type { CommandContext } from "../../types/index.d.ts";
import { getOwnerQuotedCode, writeOwnerStage } from "../../core/ownerFileWorkspace.ts";

export default {
  name: ["savefile", "guardararchivo", "creararchivo"],
  category: "system",
  description: "Guarda código en un área privada de preparación, sin modificar los comandos activos.",
  usage: "savefile <ruta> (responde al código o adjúntalo tras la ruta)",
  ownerOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.isOwner) {
      return ctx.reply("✖ Solo los owners pueden guardar código.");
    }
    const prefix = ctx.usedPrefix || ctx.prefix || ".";
    const raw = String(ctx.rawText || ctx.args?.join(" ") || "").trim();
    const first = raw.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    if (!first) {
      return ctx.reply([
        "*SAVEFILE · Preparación segura*",
        "Uso: " + prefix + "savefile cmd/system/ejemplo.ts",
        "Responde a un mensaje que contenga el código o envíalo después de la ruta.",
        "Si el archivo ya existe, se actualiza automáticamente usando el mismo comando.",
        "Los archivos se almacenan en un área aislada; no se ejecutan ni reemplazan el bot activo.",
      ].join("\n"));
    }
    const relative = first[1]!;
    const inline = String(first[2] || "").trim();
    const source = getOwnerQuotedCode(ctx.msg) || inline;
    if (!source.trim()) {
      return ctx.reply("✖ Falta el código. Responde a un mensaje con código o escríbelo después de la ruta.");
    }
    try {
      const saved = writeOwnerStage(relative, source);
      return ctx.reply([
        saved.replaced ? "✓ Archivo preparado actualizado" : "✓ Archivo preparado creado",
        "Ruta: " + saved.path,
        "Tamaño: " + saved.bytes + " bytes",
        "Consulta: " + prefix + "getcode " + saved.path,
        "Estado: aislado. Los sockets activos y master no se modificaron.",
      ].join("\n"));
    } catch (error) {
      return ctx.reply("✖ Savefile: " + (error instanceof Error ? error.message : "No se pudo guardar."));
    }
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
