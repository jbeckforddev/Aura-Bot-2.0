import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["vitals", "sysdiag", "kernelcheck"],
  category: "group",
  description: "Diagnóstico profundo del runtime Node.js, recolección de basura y loop de eventos.",
  groupOnly: false,
  ownerOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react } = ctx;

    await react("🩺").catch(() => undefined);

    const startLoop = performance.now();
    await new Promise((resolve) => setImmediate(resolve));
    const eventLoopLagMs = (performance.now() - startLoop).toFixed(2);

    const mem = process.memoryUsage();
    const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);

    const cpuStart = process.cpuUsage();
    const prevTime = performance.now();
    while (performance.now() - prevTime < 10) {}
    const cpuDelta = process.cpuUsage(cpuStart);
    const cpuUserMs = (cpuDelta.user / 1000).toFixed(2);
    const cpuSysMs = (cpuDelta.system / 1000).toFixed(2);

    const nodeVersion = process.version;
    const arch = process.arch;
    const pid = process.pid;

    const handles = typeof (process as any)._getActiveHandles === "function" 
      ? (process as any)._getActiveHandles().length 
      : "N/A";
    const requests = typeof (process as any)._getActiveRequests === "function" 
      ? (process as any)._getActiveRequests().length 
      : "N/A";

    let lagStatus = "🟢 Óptimo";
    if (parseFloat(eventLoopLagMs) > 20) lagStatus = "🟡 Ligera congestión";
    if (parseFloat(eventLoopLagMs) > 70) lagStatus = "🔴 Bloqueo crítico";

    const report = [
      `🩺 *${fytBold("DIAGNÓSTICO EN TIEMPO REAL - RUNTIME")}* 🩺`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `╭─〔 ⚡ *EVENT LOOP Y LATENCIA INTERNA* 〕`,
      `┃ ⏳ *Lag del Event Loop:* \`${eventLoopLagMs} ms\``,
      `┃ 🚦 *Estado de Respuesta:* ${lagStatus}`,
      `┃ 🎛️ *Handles activos (Sockets/Timers):* \`${handles}\``,
      `┃ 📬 *Peticiones I/O pendientes:* \`${requests}\``,
      `╰─────────────────────`,
      ``,
      `╭─〔 🧠 *SEGMENTACIÓN DE MEMORIA RAM* 〕`,
      `┃ 📦 *RSS (Total proceso):* \`${toMB(mem.rss)} MB\``,
      `┃ 📈 *Heap Total:* \`${toMB(mem.heapTotal)} MB\``,
      `┃ 📉 *Heap Usado:* \`${toMB(mem.heapUsed)} MB\``,
      `┃ 🧱 *Buffers externos (C++):* \`${toMB(mem.external)} MB\``,
      `┃ 🗄️ *ArrayBuffers:* \`${toMB(mem.arrayBuffers || 0)} MB\``,
      `╰─────────────────────`,
      ``,
      `╭─〔 ⚙️ *PROCESO Y NÚCLEO* 〕`,
      `┃ 🆔 *PID:* \`${pid}\``,
      `┃ 🟢 *Node.js:* \`${nodeVersion}\` (\`${arch}\`)`,
      `┃ ⏱️ *Uptime proceso:* \`${Math.floor(process.uptime())}s\``,
      `┃ 📊 *Consumo CPU delta:* \`U: ${cpuUserMs}ms | S: ${cpuSysMs}ms\``,
      `╰─────────────────────`,
      ``,
      `*Métricas de ejecución directa del motor V8*`
    ].join("\n");

    await react("✅").catch(() => undefined);
    return reply(report);
  }
};
