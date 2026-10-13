import type { CommandContext } from "../../types/index.d.ts";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const execAsync = promisify(exec);
const MAX_OUTPUT_LENGTH = 12000;

function limitOutput(value: unknown): string {
  const output = String(value || "").trim();
  if (!output) return "";
  if (output.length <= MAX_OUTPUT_LENGTH) return output;
  return `${output.slice(0, MAX_OUTPUT_LENGTH)}\n...[salida recortada]`;
}

export default {
  name: ["r", "run", "exec", "terminal"],
  category: "system",
  description: t("cmd_ejecuta_comandos_en_la_termina_e4ff4900"),
  ownerOnly: true,

  async run({ args, usedPrefix, reply, react }: CommandContext) {
    const command = args.join(" ").trim();
    if (!command) {
      return reply({
        text: t("cmd_value0_value1_por_favor_escrib_f945bf7b", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_comando_fade5335")), value2: usedPrefix || ".", value3: fytBold(t("cmd_system_29d43743")) }),
      });
    }

    await react("💻");
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024,
        shell: "/bin/sh",
      });
      const output =
        [limitOutput(stdout), limitOutput(stderr && `[STDERR]\n${stderr}`)]
          .filter(Boolean)
          .join("\n") || "Comando ejecutado sin salida de texto.";

      await react("✅");
      return reply({
        text: t("cmd_value0_value1_value2_7c4207de", { value0: fytBold(t("cmd_terminal_exec_6fef2449")), value1: output, value2: fytBold(t("cmd_system_29d43743")) }),
      });
    } catch (error: unknown) {
      const output =
        [
          limitOutput((error as { stdout?: string }).stdout),
          limitOutput(
            (error as { stderr?: string }).stderr &&
              `[STDERR]\n${(error as { stderr?: string }).stderr}`,
          ),
          error instanceof Error ? error.stack || error.message : String(error),
        ]
          .filter(Boolean)
          .join("\n") || "Error desconocido.";

      await react("❌");
      return reply({
        text: t("cmd_value0_value1_value2_375fbdce", { value0: fytBold(t("cmd_terminal_error_3b4139ac")), value1: output, value2: fytBold(t("cmd_system_29d43743")) }),
      });
    }
  },
};
