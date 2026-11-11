
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";
import { runSandbox } from "../../core/sandbox/manager.mjs";

export default {
  name: ["test", "sandbox"],
  category: "system",
  description: "Ejecuta comandos experimentales del Sandbox.",

  async run(ctx: CommandContext) {
    if (!ctx.isOwner) {
      return ctx.reply(
        `✖ ${t("cmd_acceso_restringido_7c2f1a90")}`
      );
    }

    const prefix = ctx.usedPrefix || ctx.prefix || "";
    const [target, ...args] = ctx.args ?? [];

    if (!target) {
      return ctx.reply(
        [
          fytBold("〔 SANDBOX 〕"),
          "",
          t("cmd_sandbox_description_01"),
          "",
          fytBold(t("cmd_uso_01")),
          `${prefix}test <comando>`,
          "",
          fytBold(t("cmd_ejemplo_01")),
          `${prefix}test ping`,
          "",
          t("cmd_sandbox_footer_01"),
        ].join("\n")
      );
    }

    const command = target.trim().toLowerCase();

    if (!/^[a-z0-9_-]{1,64}$/.test(command)) {
      return ctx.reply(
        `✖ ${t("cmd_nombre_comando_no_valido_01")}`
      );
    }

    await ctx.react("🧪");

    try {
      const result = await runSandbox(command, args, ctx);

      if (!result.ok) {
        return ctx.reply(
          [
            fytBold(t("cmd_sandbox_error_01")),
            "",
            `${t("cmd_comando_01")}: ${fytBold(command)}`,
            `${t("cmd_detalle_01")}: ${result.error || result.status}`,
          ].join("\n")
        );
      }

      return ctx.reply(
        [
          fytBold(t("cmd_sandbox_completed_01")),
          "",
          `${t("cmd_comando_01")}: ${fytBold(command)}`,
          `${t("cmd_archivo_01")}: ${result.file || "test/"}`,
          `${t("cmd_proceso_01")}: ${t("cmd_secondary_process_01")}`,
        ].join("\n")
      );
    } catch (error) {
      const detail = error instanceof Error
        ? error.stack || error.message
        : String(error);

      return ctx.reply(
        [
          fytBold(t("cmd_sandbox_setup_error_01")),
          "",
          `${t("cmd_comando_01")}: ${fytBold(command)}`,
          detail.slice(0, 2000),
        ].join("\n")
      );
    }
  },
};
