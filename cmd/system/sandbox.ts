import type { CommandContext } from "../../types/index.d.ts";
import { runSandbox } from "../../core/sandbox/manager.mjs";

export default {
  name: ["test", "sandbox"],
  category: "system",
  description: "Ejecuta comandos de prueba desde la carpeta test.",
  ownerOnly: true,
  cooldown: 5,

  async run(ctx: CommandContext) {
    if (!ctx.isOwner) {
      return ctx.reply(
        "Este comando está reservado al propietario."
      );
    }

    const [target, ...args] = ctx.args;

    if (!target) {
      return ctx.reply(
        "Uso: .test <comando>\nEjemplo: .test ping"
      );
    }

    const command = target.trim().toLowerCase();

    if (!/^[a-z0-9_-]{1,64}$/.test(command)) {
      return ctx.reply("Nombre de comando no válido.");
    }

    await ctx.react("🧪");

    try {
      const result = await runSandbox(
        command,
        args,
        ctx
      );

      if (!result.ok) {
        return ctx.reply(
          `✖ Error en Sandbox\n` +
          `Comando: ${command}\n` +
          `${result.error || result.status}`
        );
      }

      return ctx.reply(
        `🧪 Prueba completada\n` +
        `Comando: ${command}\n` +
        `Archivo: ${result.file || "test/"}\n` +
        `Proceso: secundario`
      );
    } catch (error) {
      const detail = error instanceof Error
        ? error.stack || error.message
        : String(error);

      return ctx.reply(
        `✖ Falló la ejecución del Sandbox\n${detail.slice(0, 2500)}`
      );
    }
  },
};