import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["ping", "p", "pong", "lat"],
  category: "system",
  description: t("cmd_muestra_la_latencia_y_velocida_3888d36d"),
  async run(ctx: CommandContext) {
    const { reply, msg } = ctx;
    const start = ctx.receivedAt ?? performance.now();
    const processLatency = Math.max(1, Math.round(performance.now() - start));
    const timestampMs = Number(msg?.messageTimestamp || 0) * 1000;
    const netLatency = timestampMs > 0 ? Math.max(0, Date.now() - timestampMs) : 0;
    const latency = netLatency > 0 && netLatency < 10000 ? netLatency : processLatency;

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

    const textPing = t("cmd_value0_velocidad_del_bot_value_231251fb", {
      value0: fytBold(t("cmd_resultado_de_la_prueba_71fa9b51")),
      value1: fytBold(`${latency}ms`),
      value2: status,
      value3: system,
    });

    return reply({ text: textPing });
  },
};
