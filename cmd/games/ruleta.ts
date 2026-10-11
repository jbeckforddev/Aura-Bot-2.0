import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["ruleta", "rr"],
  category: "games",
  description: "Juego de ruleta rusa. 1 de 6 probabilidades de expulsión.",
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;
    
    const sender = msg.key.participant || msg.key.remoteJid;
    const isGroup = from.endsWith("@g.us");

    if (!isGroup || !sender) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("SOLO GRUPOS")}\n╰━━━━━━━━━━━━⬣`);
    }

    const groupMetadata = await sock.groupMetadata(from).catch(() => null);
    if (!groupMetadata) return;

    const botNumber = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
    const botParticipant = groupMetadata.participants.find((p) => p.id === botNumber);
    const senderParticipant = groupMetadata.participants.find((p) => p.id === sender);

    const isBotAdmin = botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin";
    const isSenderAdmin = senderParticipant?.admin === "admin" || senderParticipant?.admin === "superadmin";

    if (!isBotAdmin) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("NECESITO SER ADMIN")}\n╰━━━━━━━━━━━━⬣`);
    }

    if (isSenderAdmin) {
      return reply(`╭〔 🛡️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("ADMINS INMUNES")}\n╰━━━━━━━━━━━━⬣`);
    }

    await react("🔫").catch(() => undefined);

    const initMsg = await sock.sendMessage(
      from,
      { text: `╭〔 💀 ${fytBold("RULETA RUSA")} 〕━⬣\n┃ 🔄 Girando el tambor...\n╰━━━━━━━━━━━━⬣` },
      { quoted: msg as any }
    ).catch(() => null);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const isDead = Math.floor(Math.random() * 6) === 0;

    if (isDead) {
      if (initMsg?.key) {
        await sock.sendMessage(from, { 
          text: `╭〔 💀 ${fytBold("RULETA RUSA")} 〕━⬣\n┃ 💥 ¡BAM! Te volaste la cabeza.\n╰━━━━━━━━━━━━⬣`, 
          edit: initMsg.key 
        }).catch(() => undefined);
      }
      await sock.groupParticipantsUpdate(from, [sender], "remove").catch(() => undefined);
    } else {
      if (initMsg?.key) {
        await sock.sendMessage(from, { 
          text: `╭〔 😅 ${fytBold("RULETA RUSA")} 〕━⬣\n┃ 💨 *Click*... Te salvaste esta vez.\n╰━━━━━━━━━━━━⬣`, 
          edit: initMsg.key 
        }).catch(() => undefined);
      }
    }
  }
};
