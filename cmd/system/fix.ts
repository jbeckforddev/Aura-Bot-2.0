import type { WAMessage } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const execFileAsync = promisify(execFile);

export default {
  name: ["update", "actualizar", "fix"],
  category: "system",
  description: t("cmd_actualiza_el_bot_desde_los_cam_b2f56e1b"),
  modOnly: true,

  async run({ sock, from, msg }: CommandContext) {
    let initText = t("cmd_value0_613e73f3", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
    initText += t("cmd_value0_ff060343", { value0: fytBold(t("cmd_sistema_update_d7487f6b")) });
    initText += t("cmd_text_bdfd7fa0");
    initText += t("cmd_buscando_cambios_en_el_reposit_f70bd2dd");
    initText += t("cmd_system_96040c03");

    const sent = await sock.sendMessage(
      from,
      { text: initText },
      { quoted: msg as unknown as WAMessage },
    );

    try {
      const { stdout, stderr } = await execFileAsync(
        "git",
        ["pull", "--ff-only"],
        {
          cwd: process.cwd(),
          maxBuffer: 1024 * 1024,
        },
      );
      const output = `${stdout}\n${stderr}`.trim();
      const alreadyUpdated =
        /Already up[- ]to[- ]date|Already up to date/i.test(output);

      let text = t("cmd_value0_c35c8fa6", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
      text += t("cmd_value0_value1_d90b5f4f", { value0: alreadyUpdated ? "✨" : "🚀", value1: fytBold(alreadyUpdated ? "SISTEMA ACTUALIZADO" : "UPDATE COMPLETO") });
      text += t("cmd_text_bdfd7fa0");
      text += alreadyUpdated
        ? t("cmd_el_bot_ya_esta_actualizado_69816f1a")
        : t("cmd_cambios_descargados_correctame_c5db703e");
      text += t("cmd_value0_b4f94461", { value0: fytBold(t("cmd_salida_de_git_9f2ea82c")) });
      text += t("cmd_value0_21c1b49b", { value0: output || "Sin salida de Git." });
      text += t("cmd_system_96040c03");
      return await sock.sendMessage(
        from,
        { text, edit: sent.key },
        { quoted: msg as unknown as WAMessage },
      );
    } catch (error: unknown) {
      const details = [
        (error as { stdout?: string }).stdout,
        (error as { stderr?: string }).stderr,
        error instanceof Error ? error.message : String(error),
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      let text = t("cmd_value0_e364d4cd", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
      text += t("cmd_value0_17a5f5fd", { value0: fytBold(t("cmd_error_de_update_a4e20670")) });
      text += t("cmd_text_bdfd7fa0");
      text += t("cmd_git_no_pudo_actualizar_el_repo_11259aea");
      text += t("cmd_se_conservaron_los_cambios_loc_24bd9224");
      text += t("cmd_value0_21c1b49b", { value0: details || "Error desconocido." });
      text += t("cmd_system_96040c03");

      try {
        return await sock.sendMessage(
          from,
          { text, edit: sent.key },
          { quoted: msg as unknown as WAMessage },
        );
      } catch {
        return sock.sendMessage(
          from,
          { text },
          { quoted: msg as unknown as WAMessage },
        );
      }
    }
  },
};
