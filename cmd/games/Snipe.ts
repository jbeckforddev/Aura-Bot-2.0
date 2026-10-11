import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { deletedMessages } from "../../core/SnipeStore.ts"; 

export default {
  name: ["snipe", "recuperar", "fantasmas"],
  category: "system",
  description: "Recupera el último mensaje eliminado en el grupo.",
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;

    const groupDeleted = deletedMessages.get(from) || [];
    
    if (groupDeleted.length === 0) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("NADA QUE MOSTRAR")}\n╰━━━━━━━━━━━━⬣\n\n┃ > No se han detectado mensajes\n┃ > eliminados recientemente.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    await react("👁️").catch(() => undefined);

    const snipedMsg = groupDeleted[groupDeleted.length - 1];
    const sender = snipedMsg.key.participant || snipedMsg.key.remoteJid || "Desconocido";

    await sock.sendMessage(
      from,
      { forward: snipedMsg },
      { quoted: msg as any }
    ).catch(() => undefined);

    await reply(`╭〔 👁️ ${fytBold("SNIPE SYSTEM")} 〕⬣\n┃ 👻 Mensaje recuperado\n┃ 👤 De: @${sender.split("@")[0]}\n╰━━━━━━━━━━━━⬣`);
  }
};
