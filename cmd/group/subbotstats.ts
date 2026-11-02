import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";

function formatUptime(uptimeSeconds: number): string {
  const d = Math.floor(uptimeSeconds / (3600 * 24));
  const h = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
  const m = Math.floor((uptimeSeconds % 3600) / 60);
  const s = Math.floor(uptimeSeconds % 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export default {
  name: ["subbotstats", "clusterload", "botcluster", "clonestats"],
  category: "group",
  description: "Audita la carga, telemetría y salud del clúster de subbots activos.",
  groupOnly: false,
  ownerOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, sock, botJid } = ctx;

    await react("📊").catch(() => undefined);

    let activeSubSockets: any[] = [];
    try {
      if (typeof getActiveSubBots === "function") {
        activeSubSockets = getActiveSubBots() || [];
      }
    } catch {
      activeSubSockets = [];
    }

    const allSockets = [sock, ...activeSubSockets].filter(Boolean);
    const totalNodes = allSockets.length;
    const subBotCount = totalNodes > 1 ? totalNodes - 1 : 0;

    const clusterUptime = process.uptime();
    const clusterUptimeStr = formatUptime(clusterUptime);

    const memUsage = process.memoryUsage();
    const heapUsedMb = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMb = (memUsage.heapTotal / 1024 / 1024).toFixed(1);
    const rssMb = (memUsage.rss / 1024 / 1024).toFixed(1);

    const nodesData: string[] = [];

    allSockets.forEach((botSock: any, idx: number) => {
      const isMain = idx === 0;
      const tag = isMain ? "NODO PRIMARIO (Main)" : `SUB-BOT #${idx}`;

      const rawId = botSock?.user?.id || (isMain ? botJid : "Desconocido");
      const cleanPhone = String(rawId).split("@")[0].split(":")[0];
      const botName = botSock?.user?.name || (isMain ? "Aura Bot" : "SubBot Clon");

      const wsState = botSock?.ws?.isOpen
        ? "CONECTADO"
        : botSock?.ws?.readyState === 1
        ? "CONECTADO"
        : "DESCONOCIDO";

      const stateIcon = wsState === "CONECTADO" ? "🟢" : "🟡";

      const signalActive = Boolean(botSock?.signalRepository);
      const storeActive = Boolean(botSock?.store || botSock?.chats);

      nodesData.push(
        `╭─〔 ${stateIcon} *${tag}* 〕\n` +
        `┃ 🏷️ *Identidad:* ${botName}\n` +
        `┃ 📱 *Número:* \`+${cleanPhone}\`\n` +
        `┃ 📡 *WebSocket:* \`${wsState}\`\n` +
        `┃ 🔐 *Motor Cifrado (Signal):* ${signalActive ? "Activo" : "En espera"}\n` +
        `┃ 🗃️ *Almacén Local (Store):* ${storeActive ? "Sincronizado" : "En caché"}\n` +
        `╰─────────────────────`
      );
    });

    const report = [
      `📊 *${fytBold("TELEMETRÍA DEL CLÚSTER DE SUBBOTS")}* 📊`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `╭─〔 🌐 *ESTADO GLOBAL DEL ENJAMBRE* 〕`,
      `┃ 🤖 *Nodos Operativos:* ${totalNodes} (1 Main + ${subBotCount} Clones)`,
      `┃ ⏱️ *Tiempo en Línea:* \`${clusterUptimeStr}\``,
      `┃ 🧠 *Memoria Heap:* \`${heapUsedMb} MB / ${heapTotalMb} MB\``,
      `┃ 📦 *RSS Servidor:* \`${rssMb} MB\``,
      `╰─────────────────────`,
      ``,
      ...nodesData,
      ``,
      `*Aura-Bot Clúster Engine — Monitor en vivo*`
    ].join("\n");

    await react("✅").catch(() => undefined);
    return reply(report);
  }
};
