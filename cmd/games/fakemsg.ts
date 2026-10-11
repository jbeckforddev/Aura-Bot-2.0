import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["fakemsg", "fake", "fmsg", "editfake"],
  category: "owner",
  description: "Fuerza la edición visual de un mensaje ajeno mediante inyección de protocolo.",
  groupOnly: true,
  ownerOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, args } = ctx;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedId = contextInfo?.stanzaId;

    if (!quotedId) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA MENSAJE")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Responde al mensaje original\n┃ > que deseas alterar.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    const text = args.join(" ");
    
    if (!text.trim()) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA TEXTO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Escribe el nuevo texto de\n┃ > reemplazo para la inyección.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    await react("🎭").catch(() => undefined);

    try {
      const tempId = await sock.relayMessage(
        from,
        {
          extendedTextMessage: {
            text: "",
            contextInfo: {
              isGroupStatus: true
            }
          }
        },
        { quoted: msg as any }
      );

      const tempId2 = await sock.relayMessage(
        from,
        {
          protocolMessage: {
            key: {
              remoteJid: from,
              fromMe: true,
              id: tempId
            },
            type: 14,
            editedMessage: {
              extendedTextMessage: {
                text,
                contextInfo: {
                  isGroupStatus: false
                }
              }
            }
          }
        } as any,
        { messageId: quotedId }
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      await Promise.allSettled([
        sock.sendMessage(from, {
          delete: {
            remoteJid: from,
            id: tempId,
            fromMe: true
          }
        }),
        sock.sendMessage(from, {
          delete: {
            remoteJid: from,
            id: tempId2,
            fromMe: true
          }
        })
      ]);
    } catch {
      await react("❌").catch(() => undefined);
      await reply(`╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("ERROR DE PROTOCOLO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > La red rechazó la inyección\n┃ > del mensaje fantasma.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`).catch(() => undefined);
    }
  }
};
