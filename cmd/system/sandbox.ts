
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { runSandbox } from "../../core/sandbox/manager.mjs";

export default {
  name: ["test", "sandbox"],
  category: "system",
  description: "Ejecuta comandos experimentales.",

  async run(ctx: CommandContext) {
    if (!ctx.isOwner) {
      return ctx.reply("✖ Acceso restringido.");
    }

    const prefix = ctx.usedPrefix || ctx.modPrefix || ctx.prefix || "";
    const [target, ...args] = ctx.args ?? [];

    if (!target) {
      return ctx.reply([
        fytBold("〔 SANDBOX 〕"),
        "",
        "Entorno de ejecución de comandos experimentales.",
        "",
        fytBold("Uso:"),
        `${prefix}test <comando>`,
        "",
        fytBold("Ejemplo:"),
        `${prefix}test ping`,
        "",
        "Los comandos se buscan exclusivamente en la carpeta test/."
      ].join("\n"));
    }

    const command = String(target).trim().toLowerCase();

    if (!/^[a-z0-9_-]{1,64}$/.test(command)) {
      return ctx.reply("✖ Nombre de comando no válido.");
    }

    try {
      const result = await runSandbox(command, args, ctx);

      if (!result.ok) {
        return ctx.reply([
          fytBold("✖ ERROR EN SANDBOX"),
          "",
          `Comando: ${command}`,
          result.error || result.status || "Error desconocido."
        ].join("\n"));
      }

      return ctx.reply([
        fytBold("✓ PRUEBA COMPLETADA"),
        "",
        `Comando: ${command}`,
        `Archivo: ${result.file || "test/"}`,
        "Proceso: secundario"
      ].join("\n"));

    } catch (error) {
      const detail = error instanceof Error
        ? error.stack || error.message
        : String(error);

      return ctx.reply([
        fytBold("✖ ERROR DE INICIALIZACIÓN"),
        "",
        `Comando: ${command}`,
        detail.slice(0, 2500)
      ].join("\n"));
    }
  },
};
