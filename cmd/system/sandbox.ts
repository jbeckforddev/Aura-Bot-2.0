import type { CommandContext } from '../../types/index.d.ts';
import { runSandbox } from '../../core/sandbox/manager.mjs';

const MAX_REPLY = 3500;

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
}

export default {
  name: ['test', 'sandbox'],
  category: 'system',
  description: 'Ejecuta comandos en un proceso secundario aislado.',
  ownerOnly: true,
  cooldown: 5,

  async run(ctx: CommandContext) {
    if (!ctx.isOwner) {
      return ctx.reply(
        'Este comando está reservado al propietario.'
      );
    }

    const [target, ...args] = ctx.args;

    if (!target) {
      return ctx.reply(
        'Uso: .test <comando> [argumentos]\n' +
        'Ejemplo: .test ping\n\n' +
        'La prueba usa una copia temporal del proyecto y un contexto de WhatsApp simulado.'
      );
    }

    const command = clean(target).toLowerCase();

    if (
      !/^[a-z0-9_-]{1,64}$/.test(command) ||
      ['test', 'sandbox'].includes(command)
    ) {
      return ctx.reply(
        'Alias no válido para ejecutar en Sandbox.'
      );
    }

    await ctx.react('🧪');

    const notice = await ctx.reply(
      `🧪 Sandbox iniciado\n` +
      `Comando: .${command}\n` +
      `Proceso secundario: activo`
    );

    try {
      const result = await runSandbox(
        command,
        args.map(clean)
      );

      const logLines = result.logs
        .slice(-12)
        .map((item) =>
          `[${clean(item.level)}] ${clean(item.message)}`
        );

      const botMessages = (result.messages || [])
        .slice(-8)
        .map(
          (item: { kind?: string; text?: string }) =>
            `↳ ${clean(item.kind)}: ${clean(item.text)}`
        );

      const details = [
        `Estado: ${clean(result.status || 'UNKNOWN')}`,
        `Duración: ${Number(result.durationMs || 0)} ms`,
        result.error
          ? `Error: ${clean(result.error)}`
          : '',
        ...botMessages,
        ...logLines,
      ]
        .filter(Boolean)
        .join('\n');

      const output =
        `🧪 Sandbox · ${command}\n${details}`
          .slice(0, MAX_REPLY);

      if (notice?.key) {
        try {
          await ctx.sock.sendMessage(
            ctx.from,
            {
              text: output,
              edit: notice.key,
            }
          );

          return;
        } catch {}
      }

      return ctx.reply(output);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return ctx.reply(
        `✖ Sandbox no disponible\n${message.slice(0, 1200)}`
      );
    }
  },
};