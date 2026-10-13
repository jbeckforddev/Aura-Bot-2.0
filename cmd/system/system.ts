import type { WAMessage } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import os from "node:os";
import process from "node:process";
import fs from "node:fs";
import { fytBold } from "../../core/socketText.ts";
import { formatDuration, formatFileSize } from "../../utils/formatter.ts";
import { t } from "../../src/langs/index.ts";


function readNumber(filePath: string): number | null {
  try {
    const value = fs.readFileSync(filePath, "utf8").trim();
    if (value === "max" || !value) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

function getMemoryInfo() {
  try {
    if (
      fs.existsSync("/sys/fs/cgroup/memory.max") &&
      fs.existsSync("/sys/fs/cgroup/memory.current")
    ) {
      const total = readNumber("/sys/fs/cgroup/memory.max");
      const used = readNumber("/sys/fs/cgroup/memory.current");
      if (total !== null && total > 0 && used !== null && used >= 0) {
        return { total, used, source: "contenedor" };
      }
    }

    if (fs.existsSync("/sys/fs/cgroup/memory/memory.limit_in_bytes")) {
      const total = readNumber("/sys/fs/cgroup/memory/memory.limit_in_bytes");
      const used = readNumber("/sys/fs/cgroup/memory/memory.usage_in_bytes");
      if (
        total !== null &&
        total > 0 &&
        total < 9223372036854771712 &&
        used !== null &&
        used >= 0
      ) {
        return { total, used, source: "contenedor" };
      }
    }
  } catch {
    // Algunos sistemas no permiten leer los archivos virtuales de cgroups.
  }

  return {
    total: os.totalmem(),
    used: process.memoryUsage().rss,
    source: "host",
  };
}

export default {
  name: ["system", "sys", "info"],
  category: "system",
  description: t("cmd_muestra_los_componentes_reales_617d0e3c"),
  ownerOnly: false,

  async run({ sock, from, msg }: CommandContext) {
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model?.trim() || "Desconocido";
    let cpuCores = cpus.length || 1;

    try {
      if (typeof os.availableParallelism === "function")
        cpuCores = os.availableParallelism();
    } catch {
      cpuCores = cpus.length || 1;
    }

    const memory = getMemoryInfo();
    const ramFree = Math.max(memory.total - memory.used, 0);
    const ramBot = process.memoryUsage().rss;
    const ramPercent =
      memory.total > 0
        ? ((memory.used / memory.total) * 100).toFixed(1)
        : "0.0";
    const platform = `${os.platform()} (${os.arch()})`;

    let text = t("cmd_text_0b838a73");
    text += t("cmd_text_9253fd93");
    text += t("cmd_text_bdfd7fa0");
    text += t("cmd_value0_5c8ba691", { value0: fytBold(t("cmd_cpu_ff221d47")) });
    text += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_modelo_fc4688b0")), value1: cpuModel });
    text += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_nucleos_ec2ff80a")), value1: cpuCores });
    text += t("cmd_value0_value1_6fa51171", { value0: fytBold(t("cmd_plataforma_aa489e15")), value1: platform });
    text += t("cmd_value0_77eb889b", { value0: fytBold(t("cmd_ram_ac698b84")) });
    text += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_total_d8e7170f")), value1: formatFileSize(memory.total) });
    text += t("cmd_value0_value1_value2_191ed36f", { value0: fytBold(t("cmd_usada_8e079104")), value1: formatFileSize(memory.used), value2: ramPercent });
    text += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_libre_f9c0d4bb")), value1: formatFileSize(ramFree) });
    text += t("cmd_value0_value1_6fa51171", { value0: fytBold(t("cmd_bot_usa_7f6e2c15")), value1: formatFileSize(ramBot) });
    text += t("cmd_value0_8a0d9898", { value0: fytBold(t("cmd_uptime_c115c354")) });
    text += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_bot_activo_6a896c4b")), value1: formatDuration(process.uptime()) });
    text += t("cmd_value0_value1_6fa51171", { value0: fytBold(t("cmd_host_encendido_bfb51a33")), value1: formatDuration(os.uptime()) });
    text += t("cmd_value0_a58a457f", { value0: fytBold(t("cmd_entorno_9d70fa6c")) });
    text += t("cmd_value0_value1_a67c398b", { value0: fytBold(t("cmd_node_js_1393d77a")), value1: process.version });
    text += t("cmd_value0_value1_6fa51171", { value0: fytBold(t("cmd_pid_d5b02632")), value1: process.pid });
    text += t("cmd_text_aed5d675");

    return sock.sendMessage(
      from,
      { text },
      { quoted: msg as unknown as WAMessage },
    );
  },
};
