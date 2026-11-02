import { getActiveSubBots } from "../../core/subbotManager.ts";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";

const execAsync = promisify(exec);

// Función para inyectar un paquete IQ de ping a los servidores de WhatsApp y medir ms
async function measurePing(botSock: any): Promise<number> {
  const start = performance.now();
  try {
    await botSock.query({
      tag: "iq",
      attrs: {
        to: "@s.whatsapp.net",
        type: "get",
        xmlns: "urn:xmpp:ping",
      },
    });
    return parseFloat((performance.now() - start).toFixed(2));
  } catch (err) {
    return -1; // Timeout o conexión caída
  }
}

export default {
  name: ["radar", "netstat", "red"],
  category: "group", // Modificado para el enrutador de grupos
  ownerOnly: false,  // Modificado para que cualquiera pueda ejecutarlo
  description: "Audita el estado de red, conexiones TCP y latencia de todas las instancias en tiempo real.",
  async run(ctx: CommandContext) {
    const { reply, react, sock } = ctx;

    await react("🛰️").catch(() => undefined);

    // 1. Recopilar datos del sistema operativo (VPS)
    const hostname = os.hostname();
    const platform = os.platform() === "linux" ? "Linux (VPS)" : os.platform();
    const loadAvg = os.loadavg().map((n) => n.toFixed(2)).join(", ");
    
    // Extraer interfaces de red IPv4 (Ocultando la IP por seguridad al ser comando público)
    const interfaces = os.networkInterfaces();
    let netInterfaces = "";
    for (const name of Object.keys(interfaces)) {
      if (name === "lo") continue;
      for (const net of interfaces[name]!) {
        if (net.family === "IPv4" && !net.internal) {
          netInterfaces += `\n┃ 📍 *${name}:* \`[Oculta por seguridad]\``;
        }
      }
    }
    if (!netInterfaces) netInterfaces = "\n┃ 📍 *Interfaz:* `Oculta/NAT`";

    // 2. Extraer conexiones TCP activas desde el Kernel de Linux
    let tcpEstablished = "Desconocido";
    try {
      const { stdout } = await execAsync("ss -s 2>/dev/null || netstat -an | grep ESTABLISHED | wc -l");
      const lines = stdout.trim().split("\n");
      
      if (stdout.includes("TCP:")) {
        const tcpLine = lines.find((l) => l.includes("TCP:"));
        if (tcpLine) {
          const estabMatch = tcpLine.match(/estab (\d+)/);
          if (estabMatch) tcpEstablished = estabMatch[1];
        }
      } else {
        tcpEstablished = stdout.trim();
      }
    } catch (e) {
      tcpEstablished = "Acceso Denegado / No Linux";
    }

    // 3. Escanear latencia de red de los Bots
    const allBots = [sock, ...getActiveSubBots()].filter(Boolean);
    const botPings: string[] = [];

    // Ping en paralelo a todas las instancias
    const pingResults = await Promise.all(allBots.map(bot => measurePing(bot)));

    allBots.forEach((bot, index) => {
      const ms = pingResults[index];
      const botLabel = bot.isSubBot ? `SubBot-${index}` : "MainBot";
      const id = bot.user?.id?.split(":")[0] || "Desconocido";
      
      let statusIndicator = "🟢";
      let pingText = `${ms}ms`;
      
      if (ms === -1) {
        statusIndicator = "🔴";
        pingText = "TIMEOUT / CAÍDO";
      } else if (ms > 500) {
        statusIndicator = "🟡";
      } else if (ms > 1500) {
        statusIndicator = "🟠";
      }

      botPings.push(`┃ ${statusIndicator} *${botLabel}* (\`${id}\`)\n┃ ╰─ ⚡ Latencia: ${pingText}`);
    });

    // 4. Formatear el reporte estilo terminal hacker
    const report = `🛰️ *R.A.D.A.R. NETWORK SCANNER* 🛰️
━━━━━━━━━━━━━━━━━━━━━━
╭─〔 🖥️ *NODO PRINCIPAL (VPS)* 〕
┃ ⚙️ *OS:* ${platform} - ${hostname}
┃ 📊 *Carga de CPU (1, 5, 15m):* \`${loadAvg}\`
┃ 🔌 *Conexiones TCP Activas:* \`${tcpEstablished}\`${netInterfaces}
╰─────────────────────

╭─〔 🌐 *ESTADO DE INSTANCIAS* 〕
┃ 🤖 *Bots operando:* ${allBots.length} en memoria
${botPings.join("\n")}
╰─────────────────────

*Telescopio de red de AuraBot - Finalizado* ✅`;

    await react("✅").catch(() => undefined);
    return reply(report);
  }
};
