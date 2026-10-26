import { getActiveSubBots } from "./../../connection/subbotManager.ts";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: ["spam", "reportar", "atacar"],
  category: "system", // Corregido para que coincida con la carpeta cmd/system/
  ownerOnly: false,
  description: "Reporta y bloquea un número masivamente usando todos los subbots activos.",
  async run(ctx: CommandContext) {
    const { args, reply, react, sock } = ctx;
    
    const targetQuery = args[0]?.replace(/\D/g, "");
    if (!targetQuery || targetQuery.length < 7) {
      return reply("⚠️ *Uso incorrecto*\n\nDebes proporcionar el número de teléfono que deseas reportar.\n*Ejemplo:* `.spam 573001234567`");
    }

    const targetJid = `${targetQuery}@s.whatsapp.net`;
    const allSockets = [sock, ...getActiveSubBots()].filter(Boolean);
    
    if (allSockets.length === 0) {
      return reply("❌ No hay ningún bot ni subbot disponible en este momento.");
    }

    await react("⏳");
    await reply(`🚀 *Iniciando operación de reporte masivo*\n\n🎯 *Objetivo:* +${targetQuery}\n🤖 *Bots ejecutores:* ${allSockets.length} instancia(s)\n🔄 *Intentos por bot:* 5 ciclos de reporte/bloqueo`);

    let totalReportsSent = 0;

    await Promise.allSettled(
      allSockets.map(async (botSock, botIndex) => {
        const botLabel = botSock.isSubBot ? `SubBot-${botIndex}` : "MainBot";
        
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            await botSock.updateBlockStatus(targetJid, "block");
            
            await botSock.query({
              tag: "iq",
              attrs: {
                to: "@s.whatsapp.net",
                type: "set",
                xmlns: "disallowed",
              },
              content: [
                {
                  tag: "report",
                  attrs: {
                    jid: targetJid,
                    type: "spam",
                  },
                },
              ],
            }).catch(() => {});

            totalReportsSent++;
            await sleep(1500);
            
            await botSock.updateBlockStatus(targetJid, "unblock").catch(() => {});
            await sleep(1000);
          } catch (err) {
            console.error(`[${botLabel}] Error en ciclo de reporte ${attempt}:`, err);
          }
        }
      })
    );

    await react("✅");
    await reply(`✅ *Operación Finalizada*\n\n📊 Se completaron exitosamente los ciclos de reporte y bloqueo sobre el objetivo *+${targetQuery}* utilizando *${allSockets.length}* instancias de bots.`);
  },
};
