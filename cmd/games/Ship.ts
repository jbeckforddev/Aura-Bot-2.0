import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["pareja", "ship", "amor"],
  category: "games",
  description: "Calcula el porcentaje de amor entre dos miembros al azar.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, groupMeta, botJid } = ctx;

    const participants = groupMeta?.participants.filter(p => p.id !== botJid) || [];
    
    if (participants.length < 2) return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTAN MIEMBROS")}\n╰━━━━━━━━━━━━⬣`);

    const user1 = participants[Math.floor(Math.random() * participants.length)].id;
    let user2 = participants[Math.floor(Math.random() * participants.length)].id;

    while (user1 === user2) {
      user2 = participants[Math.floor(Math.random() * participants.length)].id;
    }

    const percentage = Math.floor(Math.random() * 101);
    let emoji = "💔";
    let status = "No hay futuro";

    if (percentage > 25) { emoji = "❤️‍🩹"; status = "Complicado"; }
    if (percentage > 50) { emoji = "💖"; status = "Hay chispa"; }
    if (percentage > 75) { emoji = "💞"; status = "Romance puro"; }
    if (percentage > 90) { emoji = "💒"; status = "Almas gemelas"; }

    await react("❤️").catch(() => undefined);

    const text = `╭〔 💘 ${fytBold("MEDIDOR DE AMOR")} 〕━⬣\n┃ 👩‍❤️‍👨 @${user1.split("@")[0]} x @${user2.split("@")[0]}\n┃\n┃ 📊 Compatibilidad: ${percentage}%\n┃ ${emoji} Estado: ${status}\n╰━━━━━━━━━━━━⬣`;

    await sock.sendMessage(from, { text, mentions: [user1, user2] }, { quoted: msg as any }).catch(() => undefined);
  }
};
