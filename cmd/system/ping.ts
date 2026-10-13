import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["ping", "p", "pong", "lat"],
  category: "system",
  description: "Muestra la latencia y velocidad de respuesta del bot.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, react } = ctx;

    await react("🚀").catch(() => undefined);

    const start = Date.now();

    const textPing = `╭〔 ⚡ ${fytBold("CALCULANDO VELOCIDAD")} 〕━⬣
┃ 🚀 Espera un momento...
┃ 📡 Analizando latencia
┃ 💻 Comprobando servidor
╰━━━━━━━━━━━━⬣`;

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
      status = "🔵 Excelente";
      system = "Estable";
    } else if (latency < 300) {
      status = "🟢 Buena";
      system = "Normal";
    } else if (latency < 500) {
      status = "🟠 Moderado";
      system = "Estabilizando";
    } else {
      status = "🔴 Malo";
      system = "En problemas";
    }

    const textPing2 = `╭〔 ⚡ ${fytBold("RESULTADO DE LA PRUEBA")} 〕━⬣
┃ 🤖 Velocidad del Bot: ${fytBold(latency + "ms")}
┃ 📡 Latencia: ${status}
┃ 💻 Sistema: ${system}
╰━━━━━━━━━━━━⬣`;

    try {
      await sock.sendMessage(
        from,
        { text: textPing2, edit: sent.key }
      );
      await react("✅").catch(() => undefined);
    } catch {
      // Si falla la edición, envía el mensaje normal
      await sock.sendMessage(from, { text: textPing2 }, { quoted: msg as any });
    }
  },
};
