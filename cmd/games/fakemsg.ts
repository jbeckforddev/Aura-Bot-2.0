import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["fakemsg", "fake", "fmsg", "editfake"],
  category: "owner",
  description: t("cmd_fuerza_la_edicion_visual_de_un_c147ae7b"),
  groupOnly: true,
  ownerOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, args } = ctx;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedId = contextInfo?.stanzaId;

    if (!quotedId) {
      return reply(t("cmd_value0_value1_responde_al_mens_cb48935f", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_mensaje_dba5d803")), value2: fytBold(t("cmd_system_29d43743")) }));
    }

    const text = args.join(t("cmd_text_b858cb28"));
    
    if (!text.trim()) {
      return reply(t("cmd_value0_value1_escribe_el_nuevo_f3208414", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_texto_c2677da2")), value2: fytBold(t("cmd_system_29d43743")) }));
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
        {}
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
      await reply(t("cmd_value0_value1_la_red_rechazo_l_3e179a26", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_error_de_protocolo_8d956d20")), value2: fytBold(t("cmd_system_29d43743")) })).catch(() => undefined);
    }
  }
};
