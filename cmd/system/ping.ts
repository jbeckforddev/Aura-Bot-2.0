import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["ping", "p", "pong", "lat"],
  category: "system",
  description: t("cmd_muestra_la_latencia_y_velocida_3888d36d"),
  async run(ctx: CommandContext) {
    const { sock, from, msg } = ctx;
    const start = Date.now();
    const textPing = t("cmd_value0_espera_un_momento_anali_e68d4676", { value0: fytBold(t("cmd_calculando_velocidad_dd96eeed")) });
    const sent = await sock.sendMessage(
      from,
      { text: textPing },
      { quoted: msg as any }
    ).catch(() => null);
    if (!sent) return;
    const latency = Date.now() - start;
    let status = "";
    let system = "";

    if (latency < 100) {
      status = `🟢 ${t("cmd_ping_status_excellent_7d1d0e7a")}`;
      system = t("cmd_ping_system_stable_1a9bc2ef");
    } else if (latency < 300) {
      status = `🟡 ${t("cmd_ping_status_good_41bf0c1d")}`;
      system = t("cmd_ping_system_normal_eb7e2a3c");
    } else if (latency < 500) {
      status = `🟠 ${t("cmd_ping_status_moderate_5d8efc21")}`;
      system = t("cmd_ping_system_stabilizing_9def8f5b");
    } else {
      status = `🔴 ${t("cmd_ping_status_bad_9a0cf6d2")}`;
      system = t("cmd_ping_system_problems_4b6a7c5e");
    }

    const textPing2 = t("cmd_value0_velocidad_del_bot_value_231251fb", {
      value0: fytBold(t("cmd_resultado_de_la_prueba_71fa9b51")),
      value1: fytBold(latency + "ms"),
      value2: status,
      value3: system,
    });
    try {
      await sock.sendMessage(
        from,
        { text: textPing2, edit: sent.key }
      );
    } catch {
      // Si falla la edición, envía el mensaje normal
      await sock.sendMessage(from, { text: textPing2 }, { quoted: msg as any });
    }
  },
};
