import type { WAMessage } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import os from "node:os";
import process from "node:process";
import fs from "node:fs";
import { fytBold } from "../../core/socketText.ts";
import { formatDuration, formatFileSize } from "../../utils/formatter.ts";

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
  description: "Muestra los componentes reales del sistema asignado.",
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

    let text = `╭━〔 🖥️ 𝐒𝐈𝐒𝐓𝐄𝐌𝐀 𝐑𝐄𝐄𝐃 〕━⬣\n`;
    text += `┃ ⚡ 𝐒𝐎𝐁𝐑𝐄 𝐄𝐋 𝐁𝐎𝐓\n`;
    text += `╰━━━━━━━━━━━━⬣\n\n`;
    text += `┏━━━━〔 ${fytBold("CPU")} 〕━━━⬣\n`;
    text += `┃ > ${fytBold("Modelo:")} ${cpuModel}\n`;
    text += `┃ > ${fytBold("Núcleos:")} ${cpuCores}\n`;
    text += `┃ > ${fytBold("Plataforma:")} ${platform}\n\n`;
    text += `┏━━━━〔 ${fytBold("RAM")} 〕━━⬣\n`;
    text += `┃ > ${fytBold("Total:")} ${formatFileSize(memory.total)}\n`;
    text += `┃ > ${fytBold("Usada:")} ${formatFileSize(memory.used)} (${ramPercent}%)\n`;
    text += `┃ > ${fytBold("Libre:")} ${formatFileSize(ramFree)}\n`;
    text += `┃ > ${fytBold("Bot usa:")} ${formatFileSize(ramBot)}\n\n`;
    text += `┏━━━〔 ${fytBold("UPTIME")} 〕━━⬣\n`;
    text += `┃ > ${fytBold("Bot activo:")} ${formatDuration(process.uptime())}\n`;
    text += `┃ > ${fytBold("Host encendido:")} ${formatDuration(os.uptime())}\n\n`;
    text += `┏━━〔 ${fytBold("ENTORNO")} 〕━━⬣\n`;
    text += `┃ > ${fytBold("Node.js:")} ${process.version}\n`;
    text += `┃ > ${fytBold("PID:")} ${process.pid}\n\n`;
    text += "╰━━━━━━━━━━━━⬣";

    return sock.sendMessage(
      from,
      { text },
      { quoted: msg as unknown as WAMessage },
    );
  },
};
