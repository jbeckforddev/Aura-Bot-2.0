import { fytBold } from "../../core/socketText.ts";
export default {
  name: ["ping", "p", "pong", "lat"],
  description: "Velocidad del sistema.",
  category: "system",
  ownerOnly: false,
  botUserOnly: false,

  async run({ sock, from, msg }) {
    const start = Date.now();

    let textPing = `${fytBold("⚡ CALCULANDO VELOCIDAD DEL BOT ⚡")}`;
    textPing += "\n╭━━〔 AURA REED SYSTEM 〕━━⬣";
    textPing += "\n┃ 🚀 Espera un momento...";
    textPing += "\n┃ 📡 Analizando latencia";
    textPing += "\n┃ 💻 Comprobando servidor";
    textPing += "\n╰━━━━━━━━━━━━━━━━⬣";

    const sent = await sock.sendMessage(
      from,
      { text: textPing },
      { quoted: msg },
    );

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
      status = "🔴 Malo",
      system = "En problemas"
    }

    let textPing2 = `${fytBold("⚡ RESULTADO DE LA PRUEBA ⚡")}\n\n`;
    textPing2 += `╭━〔 ${fytBold("AURA REED SYSTEM")} 〕━⬣\n`;
    textPing2 += `┃ Velocidad del Bot: *${latency}ms*\n`;
    textPing2 += `┃ Latencia: *${status}*\n`;
    textPing2 += `┃ Sistema: *${system}*\n`;
    textPing2 += "╰━━━━━━━━━━━━━━━━⬣";

    try {
      await sock.sendMessage(
        from,
        {
          text: textPing2,
          edit: sent.key,
        },
        { quoted: msg },
      );
    } catch {
      await sock.sendMessage(from, { text: textPing2 }, { quoted: msg });
    }
  },
};
